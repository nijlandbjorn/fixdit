import assert from 'node:assert/strict';
import test from 'node:test';

import { runPipelineV9 } from '../../src/v9/pipeline.js';
import { persistV9Run } from '../../src/v9/persistence.js';
import { createMockBraveFetch, createMockWorkersAI, createRecordingD1 } from '../helpers/mock-cloudflare.mjs';

test('lokale Cloudflare mocks doen zonder aanroep geen externe kosten', () => {
  const ai = createMockWorkersAI();
  const brave = createMockBraveFetch();
  assert.equal(ai.calls.length, 0);
  assert.equal(brave.calls.length, 0);
});

test('V9-persistentie schrijft een volledige lokale audittrail', async () => {
  const result = await runPipelineV9({
    analysisId: 'persist-analysis',
    runId: 'persist-run',
    problem: 'De handgreep zit los.',
    classification: { objectFamily: 'furniture', symptom: 'loose', intent: 'repair' },
  });
  const DB = createRecordingD1();
  const persisted = await persistV9Run({ DB }, result);
  assert.equal(persisted.persisted, true);
  const sql = DB.executed.map(item => item.sql).join('\n');
  for (const table of ['v9_runs', 'v9_evidence', 'v9_hypotheses', 'v9_tests', 'v9_state', 'v9_decisions']) {
    assert.match(sql, new RegExp(`INSERT INTO ${table}`));
  }
  assert.equal(DB.executed.filter(item => /INSERT INTO v9_decisions/.test(item.sql)).length, 3);
});

test('V9-besluiten binden alle placeholders met run_id als tweede waarde', async () => {
  const result = await runPipelineV9({
    analysisId: 'decision-bind-analysis',
    runId: 'decision-bind-run',
    problem: 'De handgreep zit los.',
    classification: { objectFamily: 'furniture', symptom: 'loose', intent: 'repair' },
  });
  const DB = createRecordingD1();

  const persisted = await persistV9Run({ DB }, result);
  assert.equal(persisted.persisted, true);

  const decisions = DB.executed.filter(item => /INSERT INTO v9_decisions/.test(item.sql));
  const expected = [
    { type: 'safety', id: 'dec_decision-bind-run_safety', status: result.safety.route || 'clear' },
    { type: 'repair_gate', id: 'dec_decision-bind-run_gate', status: result.repairGate.status || 'unknown' },
    { type: 'critic', id: 'dec_decision-bind-run_critic', status: result.critic.status || 'not_run' },
  ];

  assert.equal(decisions.length, expected.length);
  for (const decision of expected) {
    const statement = decisions.find(item => item.sql.includes(`'${decision.type}'`));
    assert.ok(statement, `missing ${decision.type} decision statement`);
    assert.equal(statement.values.length, (statement.sql.match(/\?/g) || []).length);
    assert.deepEqual(statement.values.slice(0, 3), [decision.id, result.runId, decision.status]);
    assert.equal(statement.values.includes(undefined), false);
  }
});

test('evidence-identiteiten zijn per run gescheiden', async () => {
  const input = { problem: 'De handgreep zit los.', classification: { symptom: 'loose' } };
  const left = await runPipelineV9({ ...input, runId: 'run-left' });
  const right = await runPipelineV9({ ...input, runId: 'run-right' });
  assert.notEqual(left.ledger.entries[0].evidenceId, right.ledger.entries[0].evidenceId);
  assert.notEqual(left.hypotheses[0].hypothesisId, right.hypotheses[0].hypothesisId);
  assert.notEqual(left.nextTest.testId, right.nextTest.testId);
});
