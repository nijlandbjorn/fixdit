import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFallbackConsumerResponse, DEFAULT_INTERACTION_CAPABILITIES, QUESTION_TYPES, validateConsumerResponseV1 } from '../../src/v9/consumer-response-v1.js';
import { ledgerFromInput } from '../../src/v9/evidence-ledger.js';
import { detectNoProgress } from '../../src/v9/no-progress.js';
import { runPipelineV9 } from '../../src/v9/pipeline.js';
import { createWorkersAiReasoner, normalizeWorkersAiResponse, REASONING_MODEL, resolveReasoningModel } from '../../src/v9/workers-ai-adapter.js';

test('Workers AI response normalizer accepteert uitsluitend gedocumenteerde structured vormen', () => {
  const payload = { hypotheses: [], consumerResponse: { summary: 'Test' } };
  for (const [raw, location] of [
    [payload, 'root'],
    [{ response: payload }, 'response'],
    [{ response: JSON.stringify(payload) }, 'response'],
    [{ choices: [{ message: { parsed: payload } }] }, 'choices[0].message.parsed'],
    [{ choices: [{ message: { content: JSON.stringify(payload) } }] }, 'choices[0].message.content'],
  ]) {
    const result = normalizeWorkersAiResponse(raw);
    assert.deepEqual(result.payload, payload);
    assert.equal(result.diagnostics.normalizationResult, 'success');
    assert.equal(result.diagnostics.structuredPayloadLocation, location);
  }
});

test('Workers AI response normalizer classificeert contractfouten zonder TypeError', () => {
  for (const [raw, reason] of [
    [null, 'provider_returned_null'],
    [{ response: null }, 'missing_structured_payload'],
    [{ response: 'null' }, 'parser_returned_null'],
    [{ response: '{kapot' }, 'malformed_json'],
    [{ response: 42 }, 'wrong_payload_type'],
    [{ response: {} }, 'empty_object'],
    [{ unexpected: true }, 'unsupported_response_shape'],
    [{ response: { hypotheses: [] } }, 'missing_required_structured_fields'],
  ]) {
    assert.throws(
      () => normalizeWorkersAiResponse(raw),
      error => error.name === 'WorkersAiNormalizationError'
        && error.normalization.normalizationFailureReason === reason
        && error.providerCallCompleted === true,
    );
  }
});

test('adapter-normalisatiefout blijft zichtbaar en start geen consumer-validatie', async () => {
  const reasoner = createWorkersAiReasoner({
    V9_ALLOW_AI: 'true',
    AI: { run: async () => ({ response: 'null' }) },
  });
  const result = await runPipelineV9({ problem: 'Mijn rolmaat rolt niet meer vanzelf op.', mode: 'tester', reasoner });
  assert.equal(result.metrics.providerCallCompleted, true);
  assert.equal(result.metrics.providerCallFailed, false);
  assert.equal(result.metrics.providerResponseNormalization.normalizationFailureReason, 'parser_returned_null');
  assert.equal(result.metrics.validationResult, 'not_run');
  assert.equal(result.metrics.aiFallbackReason, 'parser_returned_null');
  assert.equal(result.metrics.aiPreValidationResponse, null);
});

test('Preview reasoning model is configureerbaar via een gesloten gratis-kandidatenlijst', async () => {
  const candidate = '@cf/zai-org/glm-4.7-flash';
  assert.equal(resolveReasoningModel({ V9_AI_MODEL: candidate }), candidate);
  assert.equal(resolveReasoningModel({ V9_AI_MODEL: '@cf/not-approved/paid-model' }), REASONING_MODEL);
  let usedModel = null;
  const reasoner = createWorkersAiReasoner({
    V9_ALLOW_AI: 'true', V9_AI_MODEL: candidate,
    AI: { run: async model => { usedModel = model; return { response: { hypotheses: [], consumerResponse: null } }; } },
  });
  await reasoner({ language: 'nl' });
  assert.equal(reasoner.modelId, candidate);
  assert.equal(usedModel, candidate);
});

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

test('degraded fallback behoudt raw object en symptoom zonder voorwerp-placeholder', async () => {
  const result = await runPipelineV9({
    problem: 'Mijn W en D toetsen op mijn toetsenbord doen het niet meer.',
    classification: { objectFamily: 'other', objectLabel: 'Voorwerp', symptom: 'unknown', intent: 'repair', evidenceAuthority: { objectFamily: 'legacy_inference', objectLabel: 'legacy_inference' } },
  });
  assert.equal(result.consumerResponse.degradedMode, true);
  assert.equal(result.consumerResponse.object.displayName, 'toetsenbord');
  assert.equal(result.consumerResponse.object.category, 'unresolved');
  assert.match(result.consumerResponse.summary, /W en D toetsen/i);
  assert.doesNotMatch(JSON.stringify(result.consumerResponse), /onvoldoende afgebakend|displayName":"voorwerp/i);
  assert.match(result.consumerResponse.uncertainty, /slimme analyse is tijdelijk niet beschikbaar/i);
  assert.doesNotMatch(JSON.stringify(result.consumerResponse), /\bvoorwerp\b/i);
  assert.equal(result.repairGate.open, false);
});

test('zwakke legacycategorie verslechtert duidelijke raw objectterm niet', async () => {
  for (const [problem, legacyFamily, object] of [
    ['Mijn tuinslang lekt bij de koppeling.', 'automotive', 'tuinslang'],
    ['Er komt water onder mijn wastafel vandaan.', 'furniture', 'wastafel'],
    ['koptelefoon scharnier zit los', 'door_window', 'koptelefoon scharnier'],
    ['radiator boven blijft koud', 'appliance', 'radiator boven'],
  ]) {
    const result = await runPipelineV9({ problem, classification: { objectFamily: legacyFamily, objectLabel: 'Voorwerp', symptom: 'unknown', intent: 'repair', evidenceAuthority: { objectFamily: 'legacy_inference', objectLabel: 'legacy_inference' } } });
    assert.equal(result.consumerResponse.object.displayName, object, problem);
    assert.equal(result.consumerResponse.object.category, 'unresolved', problem);
  }
});

test('bewezen providerquota is expliciet degraded met providerprovenance', async () => {
  const providerError = Object.assign(new Error('3036 daily free allocation exhausted'), { status: 429, code: 3036 });
  const reasoner = createWorkersAiReasoner({ V9_ALLOW_AI: 'true', AI: { run: async () => { throw providerError; } } });
  const result = await runPipelineV9({ problem: 'Mijn toilet blijft doorlopen.', reasoner });
  assert.equal(result.consumerResponse.degradedMode, true);
  assert.equal(result.metrics.aiFallbackReason, 'daily_quota_exhausted');
  assert.equal(result.metrics.capacityUnavailable, true);
  assert.equal(result.metrics.aiPlanned, true);
  assert.equal(result.metrics.aiSuppressedBeforeProvider, false);
  assert.equal(result.metrics.providerCallStarted, true);
  assert.equal(result.metrics.providerCallCompleted, false);
  assert.equal(result.metrics.providerCallFailed, true);
  assert.equal(result.metrics.providerFailure.status, 429);
  assert.equal(result.metrics.providerFailure.code, '3036');
  assert.equal(result.metrics.providerFailure.model, REASONING_MODEL);
  assert.equal(result.metrics.aiCallsThisSession, 1);
  assert.equal(result.metrics.successfulAiCalls, 0);
  assert.equal(result.metrics.rejectedAiCalls, 1);
  assert.doesNotMatch(JSON.stringify(result.consumerResponse), /4006|quota|neurons|model error/i);
});

test('lokale suppressie zonder providercall wordt niet als bewezen quota gelabeld', async () => {
  const result = await runPipelineV9({ problem: 'Mijn toilet blijft doorlopen.', reasoner: null, aiUnavailableReason: 'ai_quota_unavailable', priorAiAttempt: true });
  assert.equal(result.metrics.aiCallsThisSession, 1);
  assert.equal(result.metrics.successfulAiCalls, 0);
  assert.equal(result.metrics.rejectedAiCalls, 1);
  assert.equal(result.metrics.capacityUnavailable, false);
  assert.equal(result.metrics.primaryAiCalls, 0);
  assert.equal(result.metrics.aiPlanned, true);
  assert.equal(result.metrics.aiSuppressedBeforeProvider, true);
  assert.equal(result.metrics.providerCallStarted, false);
  assert.equal(result.metrics.providerFailure, null);
});

test('deterministic safety bewaart bekende upstream capaciteitsprovenance', async () => {
  const result = await runPipelineV9({ problem: 'Mijn stofzuiger ruikt verbrand.', reasoner: null, aiUnavailableReason: 'ai_quota_unavailable', priorAiAttempt: true });
  assert.equal(result.consumerResponse.responseSource, 'safety');
  assert.equal(result.metrics.aiFallbackReason, 'ai_quota_unavailable');
  assert.equal(result.metrics.capacityUnavailable, false);
  assert.equal(result.metrics.aiCallsThisSession, 1);
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

test('AI levert één evidence-as; code bouwt canonical machine-opties en gelokaliseerde labels', () => {
  const ledger = ledgerFromInput({ problem: 'Mijn toetsenbord reageert niet.' });
  const base = {
    contractVersion: 'v1', responseSource: 'ai', language: 'nl',
    object: { displayName: 'toetsenbord', category: 'computer_accessory', confidence: 'high' },
    summary: 'Twee toetsen reageren niet.', knownFacts: [],
    likelyCauses: [{ label: 'De storing kan app-specifiek of systeemwijd zijn.', basis: 'hypothesis' }],
    safeFirstChecks: [{ text: 'Bekijk de toetsen van buiten.', actionClass: 'observation' }],
    nextQuestion: { type: 'single_choice', text: 'Werken de toetsen in een ander programma?', evidenceKey: 'application_scope' },
    uncertainty: 'De oorzaak is nog niet bevestigd.', repairGuidance: null, safety: { route: null },
  };
  const valid = validateConsumerResponseV1(base, { language: 'nl', ledger, repairGate: { open: false }, fallback: {} });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.response.nextQuestion.options.map(option => option.id), ['yes', 'no', 'unknown', 'cannot_check', 'not_applicable', 'other']);
  assert.deepEqual(valid.response.nextQuestion.options.map(option => option.label), ['Ja', 'Nee', 'Weet ik niet', 'Kan ik niet controleren', 'Niet van toepassing', 'Anders…']);
  assert.ok(Object.values(valid.response.nextQuestion.evidenceMapping).every(mapping => Object.hasOwn(mapping, 'claim')));

  const localizedIds = { ...base, nextQuestion: { ...base.nextQuestion, options: [{ id: 'ja', label: 'Ja' }] } };
  const malformedMapping = { ...base, nextQuestion: { ...base.nextQuestion, evidenceMapping: { ja: 'ja' } } };
  assert.equal(validateConsumerResponseV1(localizedIds, { ledger, repairGate: { open: false }, fallback: {} }).reason, 'ai_supplied_interaction_semantics');
  assert.equal(validateConsumerResponseV1(malformedMapping, { ledger, repairGate: { open: false }, fallback: {} }).reason, 'ai_supplied_interaction_semantics');
});

test('gesloten gate weigert repair guidance en reeds bekende of dubbele evidence-assen', () => {
  const previousObservations = [{ text: 'De toetsen werken ook niet in een ander programma.', evidenceKey: 'application_scope', answerKind: 'yes', semanticClaim: 'De toetsen werken ook niet in een ander programma.' }];
  const ledger = ledgerFromInput({ problem: 'Mijn toetsenbord reageert niet.', previousObservations });
  const base = {
    contractVersion: 'v1', responseSource: 'ai', language: 'nl',
    object: { displayName: 'toetsenbord', category: 'computer_accessory', confidence: 'high' },
    summary: 'Twee toetsen reageren niet.', knownFacts: [],
    likelyCauses: [{ label: 'Een fysieke toetsfout kan de oorzaak zijn.', basis: 'hypothesis' }],
    safeFirstChecks: [{ text: 'Bekijk de toetsen van buiten.', actionClass: 'observation' }],
    nextQuestion: { type: 'single_choice', text: 'Werken de toetsen in een ander programma?', evidenceKey: 'application_scope' },
    uncertainty: 'De oorzaak is nog niet bevestigd.', repairGuidance: null, safety: { route: null },
  };
  assert.equal(validateConsumerResponseV1(base, { ledger, repairGate: { open: false }, fallback: {} }).reason, 'already_known_evidence_axis');
  assert.equal(validateConsumerResponseV1({ ...base, nextQuestion: null, repairGuidance: { advice: 'Vervang de toets.' } }, { ledger, repairGate: { open: false }, fallback: {} }).reason, 'repair_guidance_when_gate_closed');
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

test('validator houdt exact twee safe action classes aan en weigert ontbrekende of willekeurige waarden', () => {
  const ledger = ledgerFromInput({ problem: 'Mijn toetsenbord reageert niet.' });
  const base = {
    contractVersion: 'v1', responseSource: 'ai', language: 'nl',
    object: { displayName: 'toetsenbord', category: 'computer_accessory', confidence: 'high' },
    summary: 'Het toetsenbord reageert niet.', knownFacts: [],
    likelyCauses: [{ label: 'Een instelling kan de invoer blokkeren.', basis: 'hypothesis' }],
    safeFirstChecks: [
      { text: 'Bekijk de toetsen van buiten.', actionClass: 'observation' },
      { text: 'Test de toetsen in een normaal tekstveld.', actionClass: 'external_noninvasive_check' },
    ],
    nextQuestion: null, uncertainty: 'De oorzaak is nog onzeker.', repairGuidance: null, safety: { route: null },
  };
  assert.equal(validateConsumerResponseV1(base, { ledger, repairGate: { open: false }, fallback: {} }).valid, true);
  assert.equal(validateConsumerResponseV1({ ...base, safeFirstChecks: [{ text: 'Kijk naar de toets.' }] }, { ledger, repairGate: { open: false }, fallback: {} }).reason, 'unsafe_action_class');
  assert.equal(validateConsumerResponseV1({ ...base, safeFirstChecks: [{ text: 'Test de toets.', actionClass: 'low_risk_interaction' }] }, { ledger, repairGate: { open: false }, fallback: {} }).reason, 'unsafe_action_class');
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
    nextQuestion: { questionId: 'q_photo', type: 'photo', text: 'Maak een foto.', evidenceKey: 'leak_location' },
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
      nextQuestion: { questionId: 'q_photo', type: 'photo', text: 'Maak een foto.', evidenceKey: 'leak_location' },
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
