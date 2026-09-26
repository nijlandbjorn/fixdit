import assert from 'node:assert/strict';
import test from 'node:test';

import { runPipelineV9 } from '../../src/v9/pipeline.js';
import { compareV8V9 } from '../../src/v9/comparator.js';
import { resolveV9Mode, runV9AlongsideV8, sampledForV9 } from '../../src/v9/shadow-runner.js';
import { attachV9Metadata } from '../../src/v9/v8-adapter.js';

const v8Diagnosis = {
  analysisId: 'analysis-1',
  language: 'nl',
  objectFamily: 'furniture',
  objectLabel: 'Ladegreep',
  intent: 'repair',
  symptom: 'loose',
  problemKind: 'loose',
  route: 'self',
  risk: 'laag',
  safeSteps: ['Draai de zichtbare bevestigingsschroef voorzichtig vast.'],
  completionChecks: ['De greep beweegt niet meer.'],
  reasoningContext: { observations: [{ text: 'De zichtbare schroef van de ladegreep zit los.', answerTo: '' }] },
  repairEngine: {
    repairability: { status: 'DIY_CONFIDENT', confidence: 0.9 },
    technique: { id: 'tighten_fastener', name: 'Bevestiging vastzetten', evidenceSourceIds: [] },
    research: { status: 'skipped', sources: [] },
  },
  performance: { totalMs: 100 },
};

const strongLooseHypothesis = [{
  code: 'loose_attachment',
  statement: 'De toegankelijke bevestigingsschroef is losgeraakt.',
  score: 0.82,
  missingEvidence: [],
  falsifiers: ['attachment_damaged'],
}];

test('volledige V9-pipeline draait lokaal zonder externe calls', async () => {
  const result = await runPipelineV9({
    analysisId: 'analysis-1',
    mode: 'local',
    problem: 'De zichtbare schroef van de ladegreep zit los.',
    classification: { objectFamily: 'furniture', objectLabel: 'Ladegreep', symptom: 'loose', intent: 'repair' },
    modelHypotheses: strongLooseHypothesis,
    technique: { techniqueId: 'tighten_fastener', techniqueName: 'Bevestiging vastzetten', repairabilityStatus: 'DIY_CONFIDENT', evidenceSourceIds: [] },
    legacyDiagnosis: v8Diagnosis,
    critic: async () => ({ approved: true, issues: [] }),
  });
  assert.equal(result.engineVersion, '9.0.0-local');
  assert.equal(result.metrics.externalResearchCalls, 0);
  assert.equal(result.metrics.externalAiCalls, 1);
  assert.ok(['testing', 'repair_ready'].includes(result.state.phase));
});

test('V9 zonder critic faalt gesloten en vraagt een test', async () => {
  const result = await runPipelineV9({
    problem: 'De zichtbare schroef van de ladegreep zit los.',
    classification: { objectFamily: 'furniture', objectLabel: 'Ladegreep', symptom: 'loose', intent: 'repair' },
    modelHypotheses: strongLooseHypothesis,
    technique: { techniqueId: 'tighten_fastener', techniqueName: 'Bevestiging vastzetten', repairabilityStatus: 'DIY_CONFIDENT', evidenceSourceIds: [] },
    legacyDiagnosis: v8Diagnosis,
  });
  assert.equal(result.plan.repairAuthorized, false);
  assert.equal(result.repairGate.open, false);
  assert.equal(result.critic.status, 'unavailable_fail_closed');
});

test('V8-adapter voegt alleen optionele metadata toe', async () => {
  const result = await runPipelineV9({ problem: 'Losse greep.', classification: { symptom: 'loose' } });
  const combined = attachV9Metadata(v8Diagnosis, result);
  assert.equal(combined.route, v8Diagnosis.route);
  assert.equal(combined.safeSteps, v8Diagnosis.safeSteps);
  assert.equal(combined.diagnosticV9.engineVersion, result.engineVersion);
});

test('comparator markeert safetyverlaging als kritieke regressie', () => {
  const comparison = compareV8V9(
    { route: 'stop', risk: 'stop' },
    { safety: { route: null }, repairGate: { route: 'self' }, critic: { issues: [] }, metrics: {} },
  );
  assert.equal(comparison.criticalRegression, true);
  assert.equal(comparison.safetyMatch, false);
});

test('comparator zet een strengere V9-safety conservatief op needs_review', async () => {
  const result = await runPipelineV9({
    problem: 'Ik ruik duidelijk gas bij mijn kookplaat.',
    classification: { objectFamily: 'kitchen_household', symptom: 'unknown', intent: 'inspect' },
  });
  const comparison = compareV8V9(
    { route: 'more_info', risk: 'middel', safetyFlags: [], performance: { totalMs: 0 } },
    result,
  );
  assert.equal(result.safety.route, 'stop');
  assert.equal(comparison.status, 'needs_review');
  assert.equal(comparison.criticalRegression, false);
  assert.equal(comparison.safetyDifferenceReason, 'v9_detected_additional_hazard');
});

test('V9-mode is standaard uit en tester is afgeschermd', () => {
  assert.equal(resolveV9Mode({}), 'off');
  assert.equal(resolveV9Mode({ V9_MODE: 'tester' }, { tester: false }), 'off');
  assert.equal(resolveV9Mode({ V9_MODE: 'tester' }, { tester: true }), 'tester');
  assert.equal(sampledForV9('stable-key', 0), false);
  assert.equal(sampledForV9('stable-key', 100), true);
});

test('shadow-runner gebruikt geen AI of research wanneer flags ontbreken', async () => {
  const { result, persistence } = await runV9AlongsideV8({
    env: {}, v8Diagnosis, problem: 'De zichtbare schroef van de ladegreep zit los.', language: 'nl', mode: 'shadow',
  });
  assert.equal(result.metrics.externalAiCalls, 0);
  assert.equal(result.metrics.externalResearchCalls, 0);
  assert.equal(persistence.persisted, false);
  assert.equal(persistence.reason, 'db_unavailable');
});
