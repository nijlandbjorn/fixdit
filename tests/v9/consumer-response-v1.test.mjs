import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFallbackConsumerResponse, DEFAULT_INTERACTION_CAPABILITIES, QUESTION_TYPES, validateConsumerResponseV1 } from '../../src/v9/consumer-response-v1.js';
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

test('AI consumer response kan actuele semantische correctie niet uit Wat we weten weglaten', () => {
  const ledger = ledgerFromInput({
    problem: 'Ik zei weet ik niet, maar het antwoord is ja.',
    previousObservations: [
      { text: 'Weet ik niet', semanticClaim: 'Het antwoord op de normale cyclus is nog onbekend.', evidenceKey: 'failure_boundary', questionId: 'q_cycle', answerKind: 'unknown', rawAnswer: 'Weet ik niet' },
      { text: 'Ja', semanticClaim: 'De vaatwasser begint met de normale cyclus.', evidenceKey: 'failure_boundary', questionId: 'q_cycle', answerKind: 'yes', rawAnswer: 'Ja', correction: true },
    ],
  });
  const response = {
    contractVersion: 'v1', responseSource: 'ai', language: 'nl',
    object: { displayName: 'vaatwasser', category: 'appliance', confidence: 'high' },
    summary: 'De vaatwasser heeft een storing.', knownFacts: [],
    likelyCauses: [{ label: 'Een gebruiksvoorwaarde ontbreekt mogelijk.', basis: 'hypothesis' }],
    safeFirstChecks: [{ text: 'Bekijk het display van buitenaf.', actionClass: 'observation' }],
    nextQuestion: null, uncertainty: 'De oorzaak is nog onzeker.', repairGuidance: null, safety: { route: null },
  };
  const result = validateConsumerResponseV1(response, { ledger, repairGate: { open: false }, fallback: {} });
  assert.equal(result.valid, true);
  assert.deepEqual(result.response.knownFacts.map(item => item.text), ['De vaatwasser begint met de normale cyclus.']);
  assert.equal(result.response.knownFacts[0].evidenceIds.length, 1);
});

test('validator weigert photo en onbekende interaction types zonder end-to-end capability', () => {
  const ledger = ledgerFromInput({ problem: 'Het bad lekt' });
  const base = {
    contractVersion: 'v1', responseSource: 'ai', language: 'nl',
    object: { displayName: 'bad', category: 'sanitary', confidence: 'high' }, summary: 'Er verschijnt water bij het bad.',
    knownFacts: [], likelyCauses: [{ label: 'Een aansluiting kan lekken.', basis: 'hypothesis' }],
    safeFirstChecks: [{ text: 'Kijk waar het vocht verschijnt.', actionClass: 'observation' }],
    nextQuestion: { questionId: 'q_photo', type: 'photo', text: 'Maak een foto.', options: [], evidenceKey: 'leak_location', evidenceMapping: {} },
    uncertainty: 'Nog onzeker.', repairGuidance: null, safety: { route: null },
  };
  assert.equal(validateConsumerResponseV1(base, { ledger, repairGate: { open: false }, capabilities: DEFAULT_INTERACTION_CAPABILITIES, fallback: {} }).reason, 'unsupported_question_type');
  assert.equal(validateConsumerResponseV1({ ...base, nextQuestion: { ...base.nextQuestion, type: 'gesture' } }, { ledger, repairGate: { open: false }, fallback: {} }).reason, 'invalid_question_type');
});

test('pipeline transformeert een foto-afhankelijke lekkagevraag naar een veilig tekstalternatief', async () => {
  const result = await runPipelineV9({
    problem: 'Mijn bad is lek',
    classification: { objectFamily: 'sanitary', objectLabel: 'bad', symptom: 'leak', intent: 'repair' },
  });
  assert.notEqual(result.consumerResponse.nextQuestion?.type, 'photo');
  assert.match(result.consumerResponse.nextQuestion?.text || '', /waar|welke|wat/i);
});

test('AI-photoresponse en upload failure vallen zonder dead end terug op niet-foto-interactie', async () => {
  const result = await runPipelineV9({
    problem: 'Mijn bad is lek',
    classification: { objectFamily: 'sanitary', objectLabel: 'bad', symptom: 'leak', intent: 'repair' },
    reasoner: async () => ({ hypotheses: [], consumerResponse: {
      contractVersion: 'v1', responseSource: 'ai', language: 'nl', object: { displayName: 'bad', category: 'sanitary', confidence: 'high' },
      summary: 'Het bad lekt.', knownFacts: [], likelyCauses: [{ label: 'Een aansluiting kan lekken.', basis: 'hypothesis' }],
      safeFirstChecks: [{ text: 'Kijk waar het vocht verschijnt.', actionClass: 'observation' }],
      nextQuestion: { questionId: 'q_photo', type: 'photo', text: 'Maak een foto.', options: [], evidenceKey: 'leak_location', evidenceMapping: {} },
      uncertainty: 'Nog onzeker.', repairGuidance: null, safety: { route: null },
    } }),
  });
  assert.equal(result.metrics.aiFallbackReason, 'unsupported_question_type');
  assert.notEqual(result.consumerResponse.nextQuestion?.type, 'photo');
  assert.ok(result.consumerResponse.nextQuestion);
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

test('cannot_check zonder veilige alternatieve evidence-as eindigt expliciet', async () => {
  const result = await runPipelineV9({
    problem: 'Een extern scherm kan nu niet veilig of praktisch worden gecontroleerd.',
    previousObservations: [
      'Mijn laptop start maar het scherm blijft zwart',
      { text: 'Kan ik niet controleren', semanticClaim: 'Een extern scherm kan nu niet veilig of praktisch worden gecontroleerd.', evidenceKey: 'external_display', questionId: 'q_external', answerKind: 'cannot_check', rawAnswer: 'Kan ik niet controleren' },
    ],
    classification: { objectFamily: 'electronics', objectLabel: 'laptop', symptom: 'black_screen', intent: 'repair' },
  });
  assert.equal(result.noProgress.exhausted, true);
  assert.match(result.noProgress.reason, /cannot_check_no_alternative/);
  assert.equal(result.consumerResponse.endState, 'insufficient_evidence');
  assert.equal(result.consumerResponse.nextQuestion, null);
  assert.equal(result.repairGate.open, false);
});

test('canonical known facts toont na correctie uitsluitend de actuele semantische claim', async () => {
  const result = await runPipelineV9({
    problem: 'Ik zei weet ik niet, maar het antwoord is ja.',
    previousObservations: [
      'Mijn vaatwasser doet het niet.',
      { text: 'Weet ik niet', semanticClaim: 'Het antwoord op de normale cyclus is nog onbekend.', evidenceKey: 'failure_boundary', questionId: 'q_cycle', answerKind: 'unknown', rawAnswer: 'Weet ik niet' },
      { text: 'Ja', semanticClaim: 'De vaatwasser begint met de normale cyclus.', evidenceKey: 'failure_boundary', questionId: 'q_cycle', answerKind: 'yes', rawAnswer: 'Ja', correction: true },
    ],
    classification: { objectFamily: 'appliance', objectLabel: 'vaatwasser', symptom: 'not_working', intent: 'repair' },
  });
  const facts = result.consumerResponse.knownFacts.map(item => item.text);
  assert.deepEqual(facts, ['De vaatwasser begint met de normale cyclus.']);
  assert.doesNotMatch(facts.join(' '), /onbekend|ik zei/i);
  const axis = result.ledger.entries.filter(entry => entry.predicate === 'failure_boundary');
  assert.deepEqual(axis.map(entry => entry.status), ['superseded', 'active']);
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
