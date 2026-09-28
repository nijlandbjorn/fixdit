import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFallbackConsumerResponse, QUESTION_TYPES, validateConsumerResponseV1 } from '../../src/v9/consumer-response-v1.js';
import { ledgerFromInput } from '../../src/v9/evidence-ledger.js';
import { detectNoProgress } from '../../src/v9/no-progress.js';
import { runPipelineV9 } from '../../src/v9/pipeline.js';

test('deterministic safety stopt magnetronvonken en vergelijkbare echte hazards', async () => {
  for (const problem of [
    'Mijn magnetron vonkt.',
    'Er komen vonken uit het stopcontact.',
    'The microwave is sparking.',
    'Die Mikrowelle funkt.',
  ]) {
    const result = await runPipelineV9({ problem });
    assert.equal(result.safety.route, 'stop', problem);
    assert.equal(result.consumerResponse.responseSource, 'safety', problem);
    assert.equal(result.consumerResponse.nextQuestion, null, problem);
    assert.equal(result.repairGate.open, false, problem);
  }
  assert.equal((await runPipelineV9({ problem: 'Mijn magnetron vonkt niet.' })).safety.route, null);
});

test('fallback levert één canoniek contract zonder interne labels', async () => {
  const result = await runPipelineV9({
    problem: 'Mijn fietsband is lek',
    classification: { objectFamily: 'bicycle', objectLabel: 'fietsband', symptom: 'pressure_loss', intent: 'repair' },
  });
  assert.equal(result.consumerResponse.contractVersion, 'v1');
  assert.equal(result.consumerResponse.object.displayName, 'fietsband');
  assert.doesNotMatch(JSON.stringify(result.consumerResponse), /pressure_loss|objectFamily|hypothesisId/);
  assert.ok(result.consumerResponse.knownFacts.every(fact => fact.evidenceIds.length > 0));
  assert.ok(result.consumerResponse.likelyCauses.every(cause => cause.basis));
});

test('semantische keuzevraag bevat zes onderscheiden antwoorden en evidence mappings', () => {
  const problem = 'Mijn vaatwasser krijgt geen water';
  const ledger = ledgerFromInput({ problem });
  const response = buildFallbackConsumerResponse({
    problem, ledger,
    classification: { objectFamily: 'appliance', objectLabel: 'vaatwasser' },
    hypotheses: [{ statement: 'De watertoevoer kan afgesloten zijn.' }],
    nextTest: { testId: 'q_water', code: 'water_supply', questionType: 'boolean', prompt: 'Staat de waterkraan volledig open?' },
  });
  assert.equal(response.nextQuestion.type, 'single_choice');
  assert.deepEqual(response.nextQuestion.options.map(option => option.id), ['yes', 'no', 'unknown', 'cannot_check', 'not_applicable', 'other']);
  for (const option of response.nextQuestion.options) assert.ok(response.nextQuestion.evidenceMapping[option.id]);
  assert.equal(new Set(response.nextQuestion.options.map(option => option.label)).size, 6);
});

test('alle afgesproken vraagtypen behoren tot het canonical contract', () => {
  assert.deepEqual(QUESTION_TYPES, ['single_choice', 'multi_choice', 'number', 'short_text', 'photo', 'action_check']);
});

test('validator weigert reparatie vermomd als veilige controle bij gesloten gate', () => {
  const ledger = ledgerFromInput({ problem: 'Mijn laptop start niet' });
  const response = {
    contractVersion: 'v1', responseSource: 'ai', language: 'nl',
    object: { displayName: 'laptop', category: 'computer', confidence: 'high' },
    summary: 'De laptop start niet.', knownFacts: [],
    likelyCauses: [{ label: 'De voeding kan ontbreken.', basis: 'hypothesis' }],
    safeFirstChecks: [{ text: 'Open de behuizing en vervang de voeding.', actionClass: 'observation' }],
    nextQuestion: null, uncertainty: 'Nog onzeker.', repairGuidance: null, safety: { route: null },
  };
  assert.equal(validateConsumerResponseV1(response, { ledger, repairGate: { open: false }, fallback: {} }).reason, 'repair_gate_bypass');
});

test('no-progress onderscheidt onbekend van niet controleerbaar en stopt na drie turns', () => {
  const unknown = detectNoProgress(['weet ik niet', 'geen idee', 'weet ik niet'], 'weet ik niet');
  assert.equal(unknown.exhausted, true);
  assert.equal(unknown.reason, 'unknown');
  const inaccessible = detectNoProgress(['Kan ik niet controleren'], 'Kan ik niet controleren');
  assert.equal(inaccessible.exhausted, false);
  assert.equal(inaccessible.reason, 'cannot_check');
});

test('semantisch opgeslagen onbekende antwoorden tellen mee voor de no-progress eindstaat', () => {
  const result = detectNoProgress([
    'Het antwoord op “Staat de kraan open” is nog onbekend.',
    'Weet ik niet',
    'Weet ik niet',
  ], 'Weet ik niet');
  assert.equal(result.unknownCount, 3);
  assert.equal(result.exhausted, true);
  assert.equal(result.strategy, 'stop_questions');
});

test('generieke legacy-objectnaam maakt plaats voor het concrete object uit raw evidence', async () => {
  for (const [problem, expected] of [
    ['Mijn iPhone-scherm is gebarsten', 'iPhone-scherm'],
    ['Er zit een barst in mijn woonkamerraam', 'woonkamerraam'],
  ]) {
    const result = await runPipelineV9({
      problem,
      classification: { objectFamily: 'other', objectLabel: 'Voorwerp', symptom: 'breakage', intent: 'repair' },
    });
    assert.equal(result.consumerResponse.object.displayName, expected);
    assert.doesNotMatch(result.consumerResponse.summary, /Voorwerp/);
  }
});

test('een onbekend follow-upantwoord wist de oorspronkelijke sessieclassificatie niet', async () => {
  const result = await runPipelineV9({
    problem: 'Weet ik niet',
    previousObservations: ['Mijn vaatwasser krijgt geen water'],
    classification: { objectFamily: 'other', objectLabel: 'Voorwerp', symptom: 'unknown', intent: 'repair' },
  });
  assert.equal(result.consumerResponse.object.displayName, 'vaatwasser');
  assert.ok(result.hypotheses.some(item => /watertoevoer|toevoerslang|inlaatfilter/i.test(item.statement)));
});

test('algemene correctie supersedet het laatste eerdere antwoord', async () => {
  const result = await runPipelineV9({
    problem: 'Ik corrigeer mijn vorige antwoord van “De kraan staat open.” naar “De kraan staat dicht.”.',
    previousObservations: ['Mijn vaatwasser krijgt geen water', 'De kraan staat open.'],
    classification: { objectFamily: 'appliance', objectLabel: 'vaatwasser', symptom: 'no_flow', intent: 'repair' },
  });
  const old = result.ledger.entries.find(entry => entry.value === 'De kraan staat open.');
  const correction = result.ledger.entries.find(entry => entry.source === 'user_text');
  assert.equal(old.status, 'superseded');
  assert.equal(correction.provenance.correction, true);
  assert.equal(result.repairGate.open, false);
});
