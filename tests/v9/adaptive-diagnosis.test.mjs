import assert from 'node:assert/strict';
import test from 'node:test';

import { generateHypotheses } from '../../src/v9/hypothesis-engine.js';
import { ledgerFromInput } from '../../src/v9/evidence-ledger.js';
import { rankNextBestTests } from '../../src/v9/next-best-test.js';
import { runPipelineV9 } from '../../src/v9/pipeline.js';
import { classificationFromUserText } from '../../src/v9/raw-classification.js';
import { renderV9TesterHtml } from '../../src/v9/tester-ui.js';
import { attachV9Metadata } from '../../src/v9/v8-adapter.js';
import { detectNoProgress } from '../../src/v9/no-progress.js';
import { validateReasoningHypotheses } from '../../src/v9/workers-ai-adapter.js';

test('duidelijke lekke fietsband kiest veilige directe hulp met specifieke oorzaken', async () => {
  const problem = 'Mijn fietsband is lek';
  const classification = classificationFromUserText(problem);
  const result = await runPipelineV9({ problem, classification });
  assert.equal(classification.objectFamily, 'bicycle');
  assert.equal(classification.objectLabel, 'fietsband');
  assert.equal(classification.symptom, 'pressure_loss');
  assert.equal(result.safety.route, null);
  assert.equal(result.decision.route, 'direct_help');
  assert.equal(result.nextTest, null);
  assert.ok(result.directHelp.now.length >= 2);
  assert.deepEqual(result.hypotheses.slice(0, 3).map(item => item.code), [
    'inner_tube_puncture', 'valve_leak', 'tire_foreign_object',
  ]);
  assert.doesNotMatch(result.hypotheses.map(item => item.statement).join(' '), /onvoldoende afgebakend/i);
  const attached = attachV9Metadata({ analysisId: 'a1' }, result).diagnosticV9;
  assert.equal(attached.decision.route, 'direct_help');
  assert.equal(attached.directHelp.title, 'Waarschijnlijk probleem');
  assert.equal(attached.metrics.externalAiCalls, 0);
});

test('vaatwasser zonder water gebruikt apparaatspecifieke hypotheses', () => {
  const problem = 'Mijn vaatwasser geeft geen water meer';
  const classification = classificationFromUserText(problem);
  const hypotheses = generateHypotheses({ ledger: ledgerFromInput({ problem, classification }), classification });
  assert.equal(classification.objectLabel, 'vaatwasser');
  assert.equal(classification.symptom, 'no_flow');
  assert.ok(hypotheses.some(item => item.code === 'dishwasher_water_supply'));
  assert.ok(hypotheses.some(item => item.code === 'dishwasher_aquastop'));
  assert.equal(hypotheses.some(item => item.code === 'scale_or_airlock'), false);
});

test('alledaagse apparaten blijven gericht in diagnose zonder voortijdige directe hulp', async () => {
  const cases = [
    ['Mijn koffiezetapparaat maakt geluid maar geeft geen koffie', 'no_flow'],
    ['Mijn televisie doet het niet', 'not_working'],
    ['Mijn koelkast koelt slecht', 'poor_cooling'],
    ['Mijn laptop laadt niet', 'not_charging'],
  ];
  for (const [problem, symptom] of cases) {
    const classification = classificationFromUserText(problem);
    const result = await runPipelineV9({ problem, classification });
    assert.equal(classification.symptom, symptom, problem);
    assert.equal(result.decision.route, 'diagnose', problem);
    assert.ok(result.hypotheses.length >= 2, problem);
    assert.ok(result.nextTest?.questionType, problem);
    assert.equal(result.repairGate.open, false, problem);
  }
});

test('next-best-test heeft een expliciet antwoordtype', () => {
  const booleanTest = rankNextBestTests({ hypotheses: [{
    hypothesisId: 'h1', code: 'supply', statement: 'Toevoer.', score: 0.4, missingEvidence: ['water_supply'],
  }] })[0];
  const openTest = rankNextBestTests({ hypotheses: [{
    hypothesisId: 'h2', code: 'behavior', statement: 'Gedrag.', score: 0.4, missingEvidence: ['observable_behavior'],
  }] })[0];
  assert.equal(booleanTest.questionType, 'boolean');
  assert.equal(openTest.questionType, 'short_text');
  const html = renderV9TesterHtml();
  assert.match(html, /next\.questionType==='boolean'/);
  assert.match(html, /classList\.toggle\('hidden',!booleanType\)/);
  assert.match(html, /\^\(ja\|nee\|weet ik niet\|geen idee\)\$/);
});

test('drie onbekende antwoorden stoppen verdere vragen met gesloten gate', async () => {
  const result = await runPipelineV9({
    problem: 'weet ik niet',
    previousObservations: ['Mijn televisie doet het niet', 'weet ik niet', 'geen idee'],
    classification: { objectFamily: 'electronics', symptom: 'not_working', intent: 'repair' },
  });
  assert.equal(result.noProgress.exhausted, true);
  assert.equal(result.noProgress.strategy, 'stop_questions');
  assert.equal(result.nextTest, null);
  assert.equal(result.repairGate.open, false);
  assert.equal(result.decision.route, 'diagnose');
});

test('de actuele V8-observatie-echo telt niet als extra no-progressbeurt', () => {
  assert.equal(detectNoProgress(['Mijn televisie doet het niet', 'weet ik niet'], 'weet ik niet').consecutive, 1);
  assert.equal(detectNoProgress(['Mijn televisie doet het niet', 'weet ik niet', 'weet ik niet'], 'weet ik niet').consecutive, 2);
  assert.equal(detectNoProgress(['Mijn televisie doet het niet', 'weet ik niet', 'weet ik niet', 'weet ik niet'], 'weet ik niet').exhausted, true);
});

test('AI-assistentie is begrensd en valt veilig terug bij failure', async () => {
  const classification = { objectFamily: 'electronics', symptom: 'not_working', intent: 'repair' };
  const assisted = await runPipelineV9({
    problem: 'Mijn televisie doet het niet', classification,
    reasoner: async () => ({ hypotheses: [{ code: 'input_source', statement: 'De gekozen invoer kan onjuist zijn.', missingEvidence: ['failure_boundary'] }] }),
  });
  assert.equal(assisted.metrics.externalAiCalls, 1);
  assert.ok(assisted.hypotheses.some(item => item.code === 'input_source'));
  const fallback = await runPipelineV9({
    problem: 'Mijn televisie doet het niet', classification,
    reasoner: async () => { throw new Error('AI_OFFLINE'); },
  });
  assert.equal(fallback.metrics.externalAiCalls, 1);
  assert.match(fallback.metrics.aiError, /AI_OFFLINE/);
  assert.ok(fallback.hypotheses.length > 0);
  assert.equal(fallback.repairGate.open, false);
});

test('AI-hypotheses worden structureel en op sessietaal gevalideerd', () => {
  const accepted = validateReasoningHypotheses([
    { code: 'voeding', statement: 'De externe voeding kan onderbroken zijn.', missingEvidence: ['known_good_supply'] },
    { code: 'english', statement: 'The device might not be receiving power.', missingEvidence: [] },
    { code: 'bad code!', statement: 'Een ongeldige hypothese.', missingEvidence: [] },
  ], 'nl');
  assert.deepEqual(accepted.map(item => item.code), ['voeding']);
});

test('deterministische safety blijft boven direct help en AI staan', async () => {
  for (const problem of ['Er komt echte rook uit het apparaat.', 'Ik ruik gas bij het fornuis.']) {
    let called = false;
    const result = await runPipelineV9({
      problem, classification: { objectFamily: 'appliance', symptom: 'unknown', intent: 'repair' },
      reasoner: async () => { called = true; return { hypotheses: [] }; },
    });
    assert.equal(result.decision.route, 'safety_stop');
    assert.equal(result.safety.route, 'stop');
    assert.equal(called, false);
    assert.equal(result.metrics.externalAiCalls, 0);
  }
});

test('expliciete rook- en gasnegatie veroorzaakt geen safety stop', async () => {
  for (const problem of ['Er is geen rook of brandlucht.', 'Ik ruik geen gas.']) {
    const result = await runPipelineV9({ problem, classification: { objectFamily: 'appliance', symptom: 'unknown' } });
    assert.equal(result.safety.route, null, problem);
  }
});
