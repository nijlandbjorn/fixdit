import assert from 'node:assert/strict';
import test from 'node:test';

import { runV9AlongsideV8 } from '../../src/v9/shadow-runner.js';

function v8Diagnosis({
  analysisId,
  route = 'stop',
  safetyFlags = [],
  hardSafetyFallback = true,
} = {}) {
  return {
    analysisId,
    objectFamily: 'electrical',
    symptom: 'water_damage',
    problemKind: 'water_damage',
    intent: 'inspect',
    route,
    risk: route === 'stop' ? 'stop' : 'laag',
    safetyFlags,
    resolutionMode: hardSafetyFallback ? 'safe_withdrawal' : 'diagnostic',
    repairEngine: {
      technique: { id: hardSafetyFallback ? 'hard_safety_stop' : 'legacy_diagnostic' },
      repairability: { status: 'DIY_AFTER_DETAILS', confidence: 0.4 },
      research: { status: 'skipped', sources: [] },
    },
    performance: { totalMs: 0 },
  };
}

async function shadow(problem, diagnosis) {
  return runV9AlongsideV8({
    env: {},
    v8Diagnosis: diagnosis,
    problem,
    language: 'nl',
    mode: 'shadow',
  });
}

test('geen rook: raw no-flow wint van V8 hard-safety fallback en comparator vraagt review', async () => {
  const problem = 'Mijn koffiezetapparaat maakt geluid maar er komt geen koffie uit. Er is geen rook of brandlucht.';
  const { result, comparison } = await shadow(problem, v8Diagnosis({
    analysisId: 'negated-smoke',
    safetyFlags: ['fire_smoke'],
  }));

  assert.equal(result.safety.route, null);
  assert.equal(result.hypotheses[0].code, 'supply_not_seated');
  assert.equal(result.ledger.entries.some(entry => entry.value === 'water_damage'), false);
  assert.equal(result.ledger.entries.some(entry => entry.value === 'electrical'), false);
  assert.equal(result.ledger.entries.find(entry => entry.predicate === 'symptom')?.value, 'no_flow');
  assert.equal(comparison.criticalRegression, false);
  assert.equal(comparison.status, 'needs_review');
  assert.equal(comparison.safetyDifferenceReason, 'explicit_user_negation');
  assert.deepEqual(comparison.negatedSafetyCodes, ['fire_smoke']);
});

test('echte rook: V9 behoudt een deterministische stop', async () => {
  const { result, comparison } = await shadow(
    'Er komt rook en brandlucht uit het koffiezetapparaat.',
    v8Diagnosis({ analysisId: 'real-smoke', safetyFlags: ['fire_smoke'] }),
  );

  assert.equal(result.safety.route, 'stop');
  assert.deepEqual(result.safety.flags.map(flag => flag.code), ['fire_smoke']);
  assert.equal(comparison.safetyMatch, true);
  assert.equal(comparison.status, 'aligned');
  assert.equal(comparison.criticalRegression, false);
});

test('geen gaslucht: expliciete negatie wordt needs_review, niet automatisch beter', async () => {
  const { result, comparison } = await shadow(
    'De cv-ketel start niet, maar er is geen gaslucht.',
    v8Diagnosis({ analysisId: 'negated-gas', safetyFlags: ['gas'] }),
  );

  assert.equal(result.safety.route, null);
  assert.equal(comparison.criticalRegression, false);
  assert.equal(comparison.status, 'needs_review');
  assert.equal(comparison.safetyDifferenceReason, 'explicit_user_negation');
  assert.deepEqual(comparison.negatedSafetyCodes, ['gas']);
});

test('echte gaslucht: V9 behoudt een deterministische stop', async () => {
  const { result, comparison } = await shadow(
    'De cv-ketel start niet en ik ruik gaslucht.',
    v8Diagnosis({ analysisId: 'real-gas', safetyFlags: ['gas'] }),
  );

  assert.equal(result.safety.route, 'stop');
  assert.deepEqual(result.safety.flags.map(flag => flag.code), ['gas']);
  assert.equal(comparison.safetyMatch, true);
  assert.equal(comparison.status, 'aligned');
});

test('koffiezetapparaat zonder output volgt no_flow ondanks afwijkende V8 legacy inference', async () => {
  const { result } = await shadow(
    'Mijn koffiezetapparaat maakt geluid maar er komt geen koffie uit.',
    v8Diagnosis({ analysisId: 'coffee-no-flow', route: 'more_info', hardSafetyFallback: false }),
  );

  assert.equal(result.safety.route, null);
  assert.equal(result.hypotheses[0].code, 'supply_not_seated');
  assert.ok(result.hypotheses.some(hypothesis => hypothesis.code === 'accessible_blockage'));
  const classification = result.ledger.entries.filter(entry => entry.subject === 'classification');
  assert.equal(classification.find(entry => entry.predicate === 'objectFamily')?.value, 'appliance');
  assert.equal(classification.find(entry => entry.predicate === 'symptom')?.value, 'no_flow');
  assert.ok(classification.every(entry => entry.source === 'deterministic_normalization'));
});

test('echte water-elektriciteit situatie blijft een V9 safety-stop', async () => {
  const { result, comparison } = await shadow(
    'Er staat water rond het stopcontact.',
    v8Diagnosis({ analysisId: 'water-electricity', safetyFlags: ['water_electricity'] }),
  );

  assert.equal(result.safety.route, 'stop');
  assert.ok(result.safety.flags.some(flag => flag.code === 'water_electricity'));
  assert.equal(comparison.safetyMatch, true);
  assert.equal(comparison.status, 'aligned');
});
