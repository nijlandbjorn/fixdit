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

test('evidence-identiteiten zijn per run gescheiden', async () => {
  const input = { problem: 'De handgreep zit los.', classification: { symptom: 'loose' } };
  const left = await runPipelineV9({ ...input, runId: 'run-left' });
  const right = await runPipelineV9({ ...input, runId: 'run-right' });
  assert.notEqual(left.ledger.entries[0].evidenceId, right.ledger.entries[0].evidenceId);
  assert.notEqual(left.hypotheses[0].hypothesisId, right.hypotheses[0].hypothesisId);
});
