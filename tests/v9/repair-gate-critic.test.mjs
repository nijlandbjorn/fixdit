import assert from 'node:assert/strict';
import test from 'node:test';

import { createEvidenceLedger, ledgerFromInput } from '../../src/v9/evidence-ledger.js';
import { evaluateRepairGate } from '../../src/v9/repair-gate.js';
import { buildRepairPlanV9 } from '../../src/v9/repair-planner.js';
import { runIndependentCritic } from '../../src/v9/independent-critic.js';
import { classifyResearchSource, normalizeResearchSources, validateGroundedClaims } from '../../src/v9/research-grounding.js';

const safe = { route: null, flags: [] };
const technique = {
  techniqueId: 'tighten_accessible_fastener',
  techniqueName: 'Toegankelijke bevestiging vastzetten',
  repairabilityStatus: 'DIY_CONFIDENT',
  evidenceSourceIds: [],
};
const hypothesis = {
  hypothesisId: 'hy-1', score: 0.82, status: 'active', opposingEvidenceIds: [],
};

test('Repair Gate opent alleen met voldoende evidence en sterke hypothese', () => {
  const ledger = ledgerFromInput({ problem: 'De zichtbare schroef van de ladegreep zit los.' });
  const gate = evaluateRepairGate({ ledger, safety: safe, hypotheses: [hypothesis], technique });
  assert.equal(gate.open, true);
  assert.equal(gate.route, 'self');
});

test('Repair Gate vertrouwt legacy technique zonder evidence niet als reparatie-autorisatie', () => {
  const ledger = ledgerFromInput({ problem: 'De zichtbare schroef van de ladegreep zit los.' });
  const gate = evaluateRepairGate({
    ledger,
    safety: safe,
    hypotheses: [hypothesis],
    technique: { ...technique, authority: 'legacy_inference' },
  });
  assert.equal(gate.open, false);
  assert.ok(gate.reasons.includes('technique_unverified_legacy'));
});

test('Repair Gate blokkeert safety en contradictions vóór planning', () => {
  const ledger = ledgerFromInput({ problem: 'Ik ruik gas.' });
  const safetyGate = evaluateRepairGate({
    ledger,
    safety: { route: 'stop', flags: [{ code: 'gas' }] },
    hypotheses: [hypothesis],
    technique,
  });
  assert.equal(safetyGate.status, 'blocked_safety');

  const contradictionGate = evaluateRepairGate({
    ledger,
    safety: safe,
    contradictions: [{ contradictionId: 'cx', severity: 'blocking', resolved: false }],
    hypotheses: [hypothesis],
    technique,
  });
  assert.equal(contradictionGate.open, false);
  assert.ok(contradictionGate.reasons.includes('blocking_contradiction'));
});

test('modelspecifieke route vereist sterke researchgronding', () => {
  const ledger = ledgerFromInput({ problem: 'Model X toont foutcode E12.' });
  const gate = evaluateRepairGate({
    ledger, safety: safe, hypotheses: [hypothesis], technique, modelSpecific: true,
    research: { sources: [{ sourceId: 'web', trustScore: 0.58 }] },
  });
  assert.equal(gate.open, false);
  assert.ok(gate.reasons.includes('model_specific_research_missing'));
});

test('planner produceert geen reparatiestappen bij gesloten gate', () => {
  const plan = buildRepairPlanV9({
    gate: { open: false, route: 'more_info', reasons: ['hypothesis_below_threshold'] },
    technique,
    legacyDiagnosis: { safeSteps: ['Draai de schroef vast.'] },
    nextTest: { testId: 'test-1' },
  });
  assert.equal(plan.repairAuthorized, false);
  assert.deepEqual(plan.steps, []);
  assert.equal(plan.nextTest.testId, 'test-1');
});

test('Independent Critic keurt alleen volledig vrijgegeven plan goed', async () => {
  const ledger = ledgerFromInput({ problem: 'De zichtbare schroef van de ladegreep zit los.' });
  const gate = evaluateRepairGate({ ledger, safety: safe, hypotheses: [hypothesis], technique });
  const plan = buildRepairPlanV9({
    gate,
    technique,
    legacyDiagnosis: { safeSteps: ['Draai de zichtbare bevestigingsschroef voorzichtig vast.'], completionChecks: ['De greep zit vast.'] },
  });
  const result = await runIndependentCritic({
    plan, gate, safety: safe, ledger,
    critic: async input => ({ approved: input.plan.repairAuthorized, issues: [] }),
  });
  assert.equal(result.approved, true);
  assert.equal(result.status, 'approved');
});

test('Independent Critic faalt gesloten bij fout of ontbrekende critic', async () => {
  const ledger = ledgerFromInput({ problem: 'Losse greep.' });
  const gate = { open: true, route: 'self' };
  const plan = buildRepairPlanV9({ gate, technique, legacyDiagnosis: { safeSteps: ['Zet de greep vast.'] } });
  assert.equal((await runIndependentCritic({ plan, gate, safety: safe, ledger })).approved, false);
  assert.equal((await runIndependentCritic({ plan, gate, safety: safe, ledger, critic: async () => { throw new Error('mock'); } })).status, 'error_fail_closed');
});

test('researchgronding vertrouwt alleen expliciet toegestane fabrikantdomeinen', () => {
  assert.equal(classifyResearchSource('https://bosch-support-scam.example/guide', { manufacturerDomains: ['bosch.com'] }), 'web');
  assert.equal(classifyResearchSource('https://support.bosch.com/guide', { manufacturerDomains: ['bosch.com'] }), 'manufacturer');
  assert.equal(classifyResearchSource('http://ifixit.com/Guide/test'), 'rejected');

  const sources = normalizeResearchSources([{
    url: 'https://www.ifixit.com/Guide/test', title: 'Guide', snippet: 'A concrete supported procedure.',
  }]);
  const claims = validateGroundedClaims([
    { text: 'Supported', evidenceSourceIds: [sources[0].sourceId] },
    { text: 'Unsupported', evidenceSourceIds: ['missing'] },
  ], sources);
  assert.equal(claims.accepted.length, 1);
  assert.equal(claims.rejected.length, 1);
});
