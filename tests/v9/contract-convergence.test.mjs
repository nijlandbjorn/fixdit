import assert from 'node:assert/strict';
import test from 'node:test';

import { ledgerFromInput } from '../../src/v9/evidence-ledger.js';
import { validateConsumerResponseV1 } from '../../src/v9/consumer-response-v1.js';
import { buildReasoningJsonSchema, normalizeWorkersAiProviderError } from '../../src/v9/workers-ai-adapter.js';

const DOMAINS = [
  ['elektronica', 'laptop', 'Het beeld valt soms weg.'],
  ['sanitair', 'kraan', 'De waterstroom is zwakker geworden.'],
  ['meubels', 'stoel', 'De zithoogte zakt tijdens gebruik.'],
  ['mechanisch', 'lier', 'Het terugloopmechanisme hapert.'],
  ['witgoed', 'vriezer', 'Er vormt zich plaatselijk veel ijs.'],
  ['fiets', 'fietswiel', 'Het wiel loopt niet meer recht.'],
  ['verwarming', 'radiator', 'De radiator blijft plaatselijk koud.'],
  ['tuin', 'tuinslang', 'De waterdruk valt weg.'],
  ['woning', 'jaloezie', 'De jaloezie trekt scheef omhoog.'],
  ['software/netwerk', 'router', 'De verbinding valt herhaaldelijk weg.'],
];

function validResponse(object = 'apparaat', summary = 'Het gemelde gedrag is bevestigd.') {
  return {
    object: { displayName: object, category: 'user_identified_object', confidence: 'high' },
    summary,
    knownFacts: [],
    likelyCauses: [{ label: 'Een bedienings- of belastingsafhankelijke oorzaak is mogelijk.', basis: 'model_inference' }],
    safeFirstChecks: [{ text: 'Observeer wanneer het gedrag optreedt.', actionClass: 'observation' }],
    nextQuestion: {
      type: 'single_choice',
      text: 'Wanneer treedt het gedrag op?',
      evidenceKey: 'occurrence_timing',
      choices: ['Altijd', 'Alleen bij het starten', 'Na enige tijd', 'Willekeurig'],
    },
    uncertainty: 'De oorzaak is nog niet bevestigd.',
    repairGuidance: null,
  };
}

test('synthetische contractfixtures blijven valide over tien domeinen zonder diagnosehardcoding', () => {
  for (const [, object, summary] of DOMAINS) {
    const ledger = ledgerFromInput({ problem: `Mijn ${object} vertoont een storing.` });
    const result = validateConsumerResponseV1(validResponse(object, summary), { ledger, repairGate: { open: false }, fallback: {} });
    assert.equal(result.valid, true, object);
    assert.deepEqual(result.response.nextQuestion.options.slice(0, 4).map(option => option.label), ['Altijd', 'Alleen bij het starten', 'Na enige tijd', 'Willekeurig']);
    assert.ok(result.response.nextQuestion.options.slice(0, 4).every(option => option.id.startsWith('choice_')));
    assert.deepEqual(result.response.nextQuestion.options.slice(-4).map(option => option.id), ['unknown', 'cannot_check', 'not_applicable', 'other']);
    assert.ok(result.canonicalizationActions.includes('custom_choice_machine_id_generated'));
  }
});

test('canonicalization normaliseert alleen ondubbelzinnige keuze-representatie', () => {
  const response = validResponse();
  response.nextQuestion.choices = [' Altijd ', 'altijd', 'Alleen bij starten'];
  const result = validateConsumerResponseV1(response, { ledger: ledgerFromInput({ problem: 'Een apparaat hapert.' }), repairGate: { open: false }, fallback: {} });
  assert.equal(result.valid, true);
  assert.deepEqual(result.response.nextQuestion.options.slice(0, 2).map(option => option.label), ['Altijd', 'Alleen bij starten']);
  assert.ok(result.canonicalizationActions.includes('duplicate_identical_choice_removed'));
});

test('één-as binaire vrije vraag wordt tap-first zonder compound contractfout', () => {
  const response = validResponse('kraan', 'De koude waterstroom is zwakker dan de warme.');
  response.nextQuestion = { type: 'short_text', text: 'Is het koude water helder of troebel?', evidenceKey: 'water_clarity' };
  const result = validateConsumerResponseV1(response, { ledger: ledgerFromInput({ problem: 'Koud water stroomt zwak.' }), repairGate: { open: false }, fallback: {} });
  assert.equal(result.valid, true);
  assert.equal(result.response.nextQuestion.type, 'single_choice');
  assert.deepEqual(result.response.nextQuestion.options.slice(0, 2).map(option => option.label), ['Helder', 'Troebel']);
  assert.ok(result.canonicalizationActions.includes('binary_alternative_question_made_tap_first'));
});

test('mutation gate weigert inhoudelijke en structurele contractafwijkingen fail-closed', () => {
  const ledger = ledgerFromInput({ problem: 'Een apparaat hapert.' });
  const check = value => validateConsumerResponseV1(value, { ledger, repairGate: { open: false }, fallback: {} }).reason;
  const base = validResponse();
  const mutations = [
    [{ ...base, likelyCauses: [{ label: 'Onbekende oorzaak', basis: 'model_inference' }] }, 'placeholder_likely_cause'],
    [{ ...base, likelyCauses: [{ label: '', basis: 'model_inference' }] }, 'empty_required_content'],
    [{ ...base, safeFirstChecks: [{ text: 'Kijk van buiten.' }] }, 'unsafe_action_class'],
    [{ ...base, safeFirstChecks: [{ text: 'Kijk van buiten.', actionClass: 'harmless' }] }, 'unsafe_action_class'],
    [{ ...base, safeFirstChecks: [{ text: 'Open de behuizing.', actionClass: 'observation' }] }, 'repair_gate_bypass'],
    [{ ...base, repairGuidance: { text: 'Vervang het onderdeel.' } }, 'repair_guidance_when_gate_closed'],
    [{ ...base, nextQuestion: { ...base.nextQuestion, type: 'gesture' } }, 'invalid_question_type'],
    [{ ...base, nextQuestion: { ...base.nextQuestion, text: 'Wanneer gebeurt het en wat hoor je?' } }, 'compound_question'],
    [{ ...base, nextQuestion: { ...base.nextQuestion, choices: ['Altijd'] } }, 'insufficient_content_choices'],
    [{ ...base, nextQuestion: { type: 'short_text', text: 'Wanneer gebeurt dit?', evidenceKey: 'timing', choices: ['Nu', 'Later'] } }, 'choices_on_non_choice_question'],
    [{ ...base, nextQuestion: { ...base.nextQuestion, options: [{ id: 'ja', label: 'Ja' }] } }, 'ai_supplied_interaction_semantics'],
    [{ ...base, nextQuestion: { ...base.nextQuestion, evidenceMapping: { ja: {} } } }, 'ai_supplied_interaction_semantics'],
    [{ ...base, summary: 'x'.repeat(361) }, 'field_too_long'],
    [{ ...base, likelyCauses: Array.from({ length: 5 }, (_, i) => ({ label: `Oorzaak ${i}`, basis: 'model_inference' })) }, 'array_too_long'],
    [{ ...base, secret: true }, 'hallucinated_field'],
    [{ ...base, contractVersion: 'v2' }, 'contract_version_mismatch'],
    [Object.fromEntries(Object.entries(base).filter(([key]) => key !== 'uncertainty')), 'missing_required_field'],
  ];
  for (const [mutation, reason] of mutations) assert.equal(check(mutation), reason, reason);
});

test('iedere vraagvorm wordt atomisch beoordeeld en bekende evidence-as wordt niet herhaald', () => {
  const compound = validResponse();
  compound.nextQuestion = { type: 'short_text', text: 'Wat gebeurde er en wanneer begon dat?', evidenceKey: 'event_detail' };
  assert.equal(validateConsumerResponseV1(compound, { ledger: ledgerFromInput({ problem: 'Het hapert.' }), repairGate: { open: false }, fallback: {} }).reason, 'compound_question');

  const ledger = ledgerFromInput({ problem: 'Het hapert.', previousObservations: [{ text: 'Altijd', semanticClaim: 'Het gebeurt altijd.', evidenceKey: 'occurrence_timing', answerKind: 'choice' }] });
  assert.equal(validateConsumerResponseV1(validResponse(), { ledger, repairGate: { open: false }, fallback: {} }).reason, 'already_known_evidence_axis');
});

test('provider-schema laat alleen semantische modelvelden toe en code bezit boilerplate', () => {
  const schema = buildReasoningJsonSchema({ language: 'nl', repairGate: { open: false }, capabilities: { questionTypes: ['single_choice', 'short_text'] } });
  const response = schema.properties.consumerResponse;
  for (const field of ['contractVersion', 'responseSource', 'language', 'safety']) assert.equal(Object.hasOwn(response.properties, field), false);
  assert.equal(Object.hasOwn(response.properties.object.properties, 'source'), false);
  assert.deepEqual(response.properties.nextQuestion.properties.type.enum, ['single_choice', 'short_text']);
  assert.equal(response.properties.nextQuestion.properties.choices.maxItems, 6);
  assert.deepEqual(response.properties.repairGuidance, { type: 'null' });
});

test('Cloudflare 4006 wordt uitsluitend bij ondubbelzinnige providerinformatie daily_quota_exhausted', () => {
  const quota = normalizeWorkersAiProviderError(new Error('4006: you have used up your daily free allocation of 10,000 neurons'), '@cf/test');
  assert.equal(quota.code, '4006');
  assert.equal(quota.reason, 'daily_quota_exhausted');
  assert.equal(normalizeWorkersAiProviderError(new Error('request rejected locally'), '@cf/test').reason, 'ai_provider_error');
});
