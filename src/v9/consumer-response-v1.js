import { asArray, cleanText, immutable, stableHash } from './contracts.js';

export const CONSUMER_RESPONSE_CONTRACT_VERSION = 'v1';
export const QUESTION_TYPES = Object.freeze(['single_choice', 'multi_choice', 'number', 'short_text', 'photo', 'action_check']);
export const SAFE_ACTION_CLASSES = Object.freeze(['observation', 'external_noninvasive_check']);
export const DEFAULT_INTERACTION_CAPABILITIES = Object.freeze({
  photoInput: false,
  cameraCapture: false,
  fileUpload: false,
  questionTypes: Object.freeze(['single_choice', 'multi_choice', 'number', 'short_text', 'action_check']),
});

const INTERNAL = /\b(?:unknown|unclassified|breakage|no_flow|pressure_loss|not_working|maintenance_history|observable_behavior|failure_boundary|known_good_supply|[a-z]+_[a-z_]+)\b/i;
const DANGEROUS = /\b(?:230\s*v|blote?\s+drad|bare\s+wires?|stromführ|overbrug|bypass|demonteer|disassemble|behuizing\s+open|open\s+(?:de\s+)?behuizing|schroeven?\s+verwijder|remove\s+screws?|spanning\s+meten|measure\s+voltage|gasleiding\s+(?:open|los)|interne?\s+(?:bedrading|component))\b/i;
const PRICE_OR_SOURCE = /(?:€|\$|\b\d+[,.]?\d*\s*(?:euro|dollar)\b|https?:\/\/|volgens (?:de )?handleiding|manufacturer manual)/i;
const RAW_ANSWER = /^(?:ja|nee|yes|no|nein|weet ik niet|i don'?t know|weiß ich nicht|kan ik niet controleren|niet van toepassing|\d+\s*(?:jaar|years?|jahre?))$/i;
const CHOICE_IDS = Object.freeze(['yes', 'no', 'unknown', 'cannot_check', 'not_applicable', 'other']);
const GENERIC_OBJECT = /^(?:voorwerp|item|gegenstand|apparaat|device|gerät)$/i;

function languageOf(value) { return ['nl', 'en', 'de'].includes(value) ? value : 'nl'; }
function localized(language, nl, en, de) { return language === 'de' ? de : language === 'en' ? en : nl; }
function sentence(value) { const text = cleanText(value, 260); return text ? `${text.replace(/[.!?]+$/g, '')}.` : ''; }
function activeUserEvidence(ledger) { return asArray(ledger?.entries).filter(entry => entry.status === 'active' && ['user_text', 'previous_user_text', 'vision_structured'].includes(entry.source)); }
function rawObjectName(problem, language) {
  const raw = cleanText(problem, 180).replace(/[.!?]+$/g, '');
  const verb = '(?:is|zijn|heeft|hebben|doet|doen|gaat|werken?|start|begint|blijft|zakt|steekt|loopt|lekt|wordt|geeft|draait|trapt|staat|krijgt|laadt|koelt|ontsteekt|vonkt|maakt|knippert|dubbelklikt|sluit|hangt|wiebelt|kraakt|slaat|valt|slingert|stopt|trekt|reageert|springt|zit|ruikt|komt|has|does|starts|stays|drops|leaks|sparks|closes|hangs|falls|clicks|ist|hat|funktioniert|startet|bleibt|sinkt|läuft|leckt|funkt|wird)';
  const possessive = new RegExp('(?:^|\\b)(?:mijn|m[’\']n|my|mein(?:e|en|er)?)\\s+(.+?)(?=\\s+' + verb + '\\b|$)', 'iu').exec(raw)?.[1];
  let phrase = cleanText(possessive, 100);
  const nested = /\b(?:mijn|my|mein(?:e|en|er)?)\s+([\p{L}\d-]+(?:\s+[\p{L}\d-]+){0,2})$/iu.exec(phrase)?.[1];
  if (nested) phrase = nested;
  if (!phrase) phrase = cleanText(new RegExp('^(?:een|de|het|a|an|the|ein(?:e|en)?|der|die|das)?\\s*(.+?)(?=\\s+' + verb + '\\b|$)', 'iu').exec(raw)?.[1], 100);
  phrase = phrase.replace(/\s+(?:vandaan|away|heraus)$/i, '');
  return cleanText(phrase, 80);
}
function safetyCopy(language) {
  if (language === 'de') return 'Benutze es nicht weiter. Halte Abstand und schalte es nur ab, wenn das ohne Annäherung an die Gefahr sicher möglich ist.';
  if (language === 'en') return 'Do not use it again. Keep your distance and only switch it off if that can be done without approaching the hazard.';
  return 'Gebruik het niet opnieuw. Houd afstand en schakel het alleen uit als dat kan zonder het gevaar te benaderen.';
}
function clarification(language) {
  if (language === 'de') return 'Ich verstehe noch nicht genau, welcher Gegenstand oder welches Teil gemeint ist. Kannst du kurz sagen, was defekt ist?';
  if (language === 'en') return 'I do not yet understand which item or part you mean. Can you briefly say what is broken?';
  return 'Ik begrijp nog niet precies welk onderdeel of apparaat je bedoelt. Kun je kort aangeven wat er kapot is?';
}
function externalCheck(language, objectName = '') {
  if (language === 'de') return objectName ? `Betrachte ${objectName} nur von außen und achte auf sichtbare Schäden oder lose äußere Verbindungen.` : 'Betrachte das betroffene Teil nur von außen und achte auf sichtbare Schäden oder lose äußere Verbindungen.';
  if (language === 'en') return objectName ? `Inspect ${objectName} only from the outside for visible damage or loose external connections.` : 'Inspect the affected part only from the outside for visible damage or loose external connections.';
  return objectName ? `Bekijk ${objectName} alleen van buiten op zichtbare schade of losse externe aansluitingen.` : 'Bekijk het betrokken onderdeel alleen van buiten op zichtbare schade of losse externe aansluitingen.';
}
function choiceLabels(language) {
  return language === 'de'
    ? ['Ja', 'Nein', 'Weiß ich nicht', 'Kann ich nicht prüfen', 'Nicht zutreffend', 'Anders…']
    : language === 'en'
      ? ['Yes', 'No', "I don't know", "I can't check", 'Not applicable', 'Other…']
      : ['Ja', 'Nee', 'Weet ik niet', 'Kan ik niet controleren', 'Niet van toepassing', 'Anders…'];
}
function semanticMappings(prompt, language) {
  const base = cleanText(prompt, 220).replace(/[?]+$/g, '');
  const labels = choiceLabels(language);
  const claims = [
    sentence(`${base}: ${localized(language, 'ja', 'yes', 'ja')}`),
    sentence(`${base}: ${localized(language, 'nee', 'no', 'nein')}`),
    localized(language, `Het antwoord op “${base}” is nog onbekend.`, `The answer to “${base}” is not known yet.`, `Die Antwort auf „${base}“ ist noch unbekannt.`),
    localized(language, `“${base}” kan nu niet veilig of praktisch worden gecontroleerd.`, `“${base}” cannot be checked safely or practically now.`, `„${base}“ kann jetzt nicht sicher oder praktisch geprüft werden.`),
    localized(language, `“${base}” is niet van toepassing.`, `“${base}” is not applicable.`, `„${base}“ trifft nicht zu.`),
    '',
  ];
  return Object.fromEntries(CHOICE_IDS.map((id, index) => [id, immutable({ label: labels[index], claim: claims[index], polarity: id === 'yes' ? 'present' : id === 'no' ? 'absent' : 'unknown' })]));
}
function questionFromTest(nextTest, language) {
  const prompt = cleanText(nextTest?.prompt, 300);
  if (!prompt) return null;
  const rawType = cleanText(nextTest.questionType, 40);
  const type = rawType === 'boolean' ? 'single_choice' : rawType === 'multiple_choice' ? 'multi_choice' : QUESTION_TYPES.includes(rawType) ? rawType : 'short_text';
  const evidenceMapping = ['single_choice', 'multi_choice', 'action_check'].includes(type) ? semanticMappings(prompt, language) : {};
  return immutable({
    questionId: cleanText(nextTest.testId, 120) || `q_${stableHash([language, prompt])}`,
    type,
    text: prompt,
    options: Object.freeze(Object.entries(evidenceMapping).map(([id, mapping]) => immutable({ id, label: mapping.label }))),
    evidenceKey: cleanText(nextTest.evidenceKey || nextTest.code, 120) || 'user_observation',
    evidenceMapping: immutable(evidenceMapping),
    why: cleanText(nextTest.rationale, 240),
  });
}
function allText(response) { return [response.object?.displayName, response.summary, ...response.knownFacts.map(x => x.text), ...response.likelyCauses.map(x => x.label), ...response.safeFirstChecks.map(x => x.text), response.nextQuestion?.text, response.uncertainty].filter(Boolean).join(' '); }

export function buildFallbackConsumerResponse({ language = 'nl', problem = '', ledger = null, noProgress = {}, safety = {}, classification = {}, hypotheses = [], nextTest = null, directHelp = null } = {}) {
  const selected = languageOf(language);
  const evidence = activeUserEvidence(ledger);
  const raw = cleanText(problem || evidence.at(-1)?.value, 240);
  const currentAnswerEvidence = evidence.findLast(entry => entry.subject === 'user_answer');
  const factEvidence = currentAnswerEvidence || evidence.at(-1);
  const factText = cleanText(currentAnswerEvidence?.value || raw, 240);
  const classifiedName = cleanText(classification?.objectLabel, 80);
  const initialReport = cleanText(evidence.find(entry => !RAW_ANSWER.test(cleanText(entry.value, 240)) && !/^(?:het antwoord op|the answer to|die antwort auf)/i.test(cleanText(entry.value, 240)))?.value || raw, 240);
  const rawName = rawObjectName(initialReport, selected);
  const classifiedIsAuthoritative = classification?.evidenceAuthority?.objectLabel !== 'legacy_inference';
  const objectName = classifiedName && classifiedIsAuthoritative && !INTERNAL.test(classifiedName) && !GENERIC_OBJECT.test(classifiedName) ? classifiedName : rawName;
  const understood = Boolean(objectName) && !GENERIC_OBJECT.test(objectName);
  const stopped = ['stop', 'professional'].includes(safety?.route);
  const exhausted = noProgress?.exhausted === true;
  const groundedNextTest = nextTest?.evidenceKey === 'observable_behavior'
    ? { ...nextTest, evidenceKey: 'occurrence_pattern', prompt: localized(selected, 'Is dit voortdurend, of alleen onder bepaalde omstandigheden?', 'Does this happen continuously, or only under certain conditions?', 'Tritt das ständig oder nur unter bestimmten Bedingungen auf?') }
    : nextTest;
  const question = stopped || exhausted || directHelp ? null : questionFromTest(groundedNextTest, selected) || immutable({ questionId: `q_${stableHash([selected, 'clarify'])}`, type: 'short_text', text: clarification(selected), options: Object.freeze([]), evidenceKey: 'object_and_problem_description', evidenceMapping: immutable({}), why: '' });
  const summary = stopped ? safetyCopy(selected) : localized(selected, `Je beschrijft: ${sentence(initialReport)}`, `You described: ${sentence(initialReport)}`, `Du beschreibst: ${sentence(initialReport)}`);
  const causes = asArray(directHelp?.causes).concat(asArray(hypotheses).map(item => item.statement)).filter(text => text && !/onvoldoende afgebakend|insufficiently defined|nicht ausreichend eingegrenzt/i.test(text)).slice(0, 3);
  const suppliedChecks = asArray(directHelp?.now).filter(text => !DANGEROUS.test(text)).slice(0, 2);
  const checks = [...suppliedChecks, externalCheck(selected, objectName), localized(selected, 'Controleer alleen normaal bereikbare aansluitingen en bedieningsstanden.', 'Check only normally accessible connections and controls.', 'Prüfe nur normal zugängliche Anschlüsse und Bedieneinstellungen.')].slice(0, 2);
  return immutable({
    contractVersion: CONSUMER_RESPONSE_CONTRACT_VERSION, responseSource: stopped ? 'safety' : 'deterministic_fallback', language: selected,
    object: immutable({ displayName: objectName, category: classifiedIsAuthoritative ? (cleanText(classification?.objectFamily, 100) || 'unresolved') : 'unresolved', source: classifiedName && classifiedIsAuthoritative ? 'deterministic_normalization' : 'raw_user_input', confidence: understood ? 'medium' : 'low' }), summary,
    knownFacts: Object.freeze(factText && factEvidence?.evidenceId && !RAW_ANSWER.test(factText) && !/\b(?:ik zei|i said|ich sagte)\b/i.test(factText) ? [immutable({ text: sentence(factText), evidenceIds: Object.freeze([factEvidence.evidenceId]) })] : []),
    likelyCauses: Object.freeze(stopped ? [] : causes.map(label => immutable({ label: sentence(label), basis: 'deterministic_hypothesis' }))),
    safeFirstChecks: Object.freeze(stopped ? [] : checks.map(text => immutable({ text: sentence(text), actionClass: 'observation' }))), nextQuestion: question,
    endState: exhausted ? 'insufficient_evidence' : stopped ? 'safety_stop' : directHelp ? 'direct_help' : null,
    degradedMode: !stopped,
    uncertainty: exhausted ? localized(selected, 'Er is na drie pogingen nog onvoldoende nieuwe informatie. De diagnose stopt hier om een vragenlus te voorkomen.', 'After three attempts there is still insufficient new information. The diagnosis stops here to prevent a question loop.', 'Nach drei Versuchen fehlen weiterhin neue Informationen. Die Diagnose endet hier, um eine Frageschleife zu vermeiden.') : stopped ? localized(selected, 'Veiligheid gaat nu voor verdere analyse.', 'Safety takes priority over further analysis.', 'Sicherheit hat jetzt Vorrang vor weiterer Analyse.') : localized(selected, 'De slimme analyse is tijdelijk niet beschikbaar. Ik kan je wel helpen met veilige basiscontroles, of je kunt later opnieuw proberen.', 'Smart analysis is temporarily unavailable. I can still help with safe basic checks, or you can try again later.', 'Die intelligente Analyse ist vorübergehend nicht verfügbar. Ich kann bei sicheren Basiskontrollen helfen, oder du versuchst es später erneut.'),
    repairGuidance: null, safety: immutable({ route: safety?.route || null, flags: Object.freeze(asArray(safety?.flags).map(flag => flag.code)) }),
  });
}

export function validateConsumerResponseV1(value, { language = 'nl', repairGate = {}, safety = {}, ledger = null, fallback, capabilities = DEFAULT_INTERACTION_CAPABILITIES } = {}) {
  const fail = reason => ({ valid: false, reason, response: fallback });
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('missing_or_malformed');
  const allowed = ['contractVersion', 'responseSource', 'degradedMode', 'language', 'object', 'summary', 'knownFacts', 'likelyCauses', 'safeFirstChecks', 'nextQuestion', 'endState', 'uncertainty', 'repairGuidance', 'safety'];
  if (Object.keys(value).some(key => !allowed.includes(key))) return fail('hallucinated_field');
  const selected = languageOf(language);
  const activeEvidence = activeUserEvidence(ledger);
  const evidenceIds = new Set(activeEvidence.map(entry => entry.evidenceId));
  const object = { displayName: cleanText(value.object?.displayName, 100), category: cleanText(value.object?.category, 100), source: 'ai_understanding', confidence: ['low', 'medium', 'high'].includes(value.object?.confidence) ? value.object.confidence : 'low' };
  const knownFacts = asArray(value.knownFacts).slice(0, 6).map(item => ({ text: sentence(item?.text), evidenceIds: asArray(item?.evidenceIds).map(String) })).filter(item => item.text);
  if (knownFacts.some(item => !item.evidenceIds.length || item.evidenceIds.some(id => !evidenceIds.has(id)) || RAW_ANSWER.test(item.text))) return fail('untraceable_known_fact');
  const currentAnswerEvidence = activeEvidence.findLast(entry => entry.subject === 'user_answer');
  const currentAnswerText = sentence(currentAnswerEvidence?.value);
  if (currentAnswerText && currentAnswerEvidence?.evidenceId && !knownFacts.some(item => item.evidenceIds.includes(currentAnswerEvidence.evidenceId))) {
    knownFacts.push({ text: currentAnswerText, evidenceIds: [currentAnswerEvidence.evidenceId] });
    if (knownFacts.length > 6) knownFacts.shift();
  }
  const likelyCauses = asArray(value.likelyCauses).slice(0, 4).map(item => ({ label: cleanText(item?.label, 240), basis: cleanText(item?.basis, 60) || 'model_inference' })).filter(item => item.label);
  const safeFirstChecks = asArray(value.safeFirstChecks).slice(0, 4).map(item => ({ text: cleanText(item?.text, 260), actionClass: cleanText(item?.actionClass, 60) })).filter(item => item.text);
  if (safeFirstChecks.some(item => !SAFE_ACTION_CLASSES.includes(item.actionClass))) return fail('unsafe_action_class');
  if (repairGate?.open !== true && safeFirstChecks.some(item => DANGEROUS.test(item.text))) return fail('repair_gate_bypass');
  const q = value.nextQuestion;
  const nextQuestion = q && cleanText(q.text, 300) ? { questionId: cleanText(q.questionId, 120) || `q_${stableHash(q.text)}`, type: cleanText(q.type, 40), text: cleanText(q.text, 300), options: asArray(q.options).slice(0, 7).map(option => ({ id: cleanText(option?.id, 80), label: cleanText(option?.label, 120) })).filter(option => option.id && option.label), evidenceKey: cleanText(q.evidenceKey, 120), evidenceMapping: q.evidenceMapping && typeof q.evidenceMapping === 'object' ? q.evidenceMapping : {}, why: cleanText(q.why, 240) } : null;
  if (nextQuestion && !QUESTION_TYPES.includes(nextQuestion.type)) return fail('invalid_question_type');
  if (nextQuestion && !asArray(capabilities?.questionTypes).includes(nextQuestion.type)) return fail('unsupported_question_type');
  if (nextQuestion?.type === 'photo' && capabilities?.photoInput !== true) return fail('photo_input_unavailable');
  if (nextQuestion?.type === 'single_choice' && /\b(?:en|and|und)\b.+\?/i.test(nextQuestion.text)) return fail('compound_single_choice_question');
  if (nextQuestion && (!nextQuestion.questionId || !nextQuestion.evidenceKey)) return fail('incomplete_question_contract');
  if (nextQuestion && ['single_choice', 'multi_choice', 'action_check'].includes(nextQuestion.type)) {
    if (nextQuestion.options.length < 2) return fail('missing_question_options');
    if (nextQuestion.options.some(option => !nextQuestion.evidenceMapping?.[option.id])) return fail('missing_evidence_mapping');
    if (nextQuestion.type === 'single_choice' && CHOICE_IDS.some(id => !nextQuestion.options.some(option => option.id === id))) return fail('incomplete_semantic_options');
  }
  const response = { contractVersion: CONSUMER_RESPONSE_CONTRACT_VERSION, responseSource: 'ai', degradedMode: false, language: selected, object, summary: cleanText(value.summary, 360), knownFacts, likelyCauses, safeFirstChecks, nextQuestion, endState: cleanText(value.endState, 60) || null, uncertainty: cleanText(value.uncertainty, 300), repairGuidance: repairGate?.open === true ? value.repairGuidance ?? null : null, safety: { route: safety?.route || null, flags: asArray(safety?.flags).map(flag => flag.code) } };
  const text = allText(response);
  if (!response.summary || !object.displayName || !likelyCauses.length || !safeFirstChecks.length) return fail('empty_required_content');
  if (text.length > 2600) return fail('output_too_long');
  if (INTERNAL.test(text) || INTERNAL.test(object.displayName)) return fail('internal_label');
  if (DANGEROUS.test(text)) return fail('dangerous_instruction');
  if (PRICE_OR_SOURCE.test(text)) return fail('unsupported_price_or_source');
  if (selected === 'nl' && /\b(the|device|might|please check)\b/i.test(text)) return fail('wrong_language');
  if (selected === 'de' && /\b(the|device|might|please check)\b/i.test(text)) return fail('wrong_language');
  if (safety?.route && value.safety?.route && value.safety.route !== safety.route) return fail('safety_override');
  return { valid: true, reason: null, response: immutable({ ...response, object: immutable(object), knownFacts: Object.freeze(knownFacts.map(immutable)), likelyCauses: Object.freeze(likelyCauses.map(immutable)), safeFirstChecks: Object.freeze(safeFirstChecks.map(immutable)), nextQuestion: nextQuestion ? immutable({ ...nextQuestion, options: Object.freeze(nextQuestion.options.map(immutable)), evidenceMapping: immutable(nextQuestion.evidenceMapping) }) : null, safety: immutable({ ...response.safety, flags: Object.freeze(response.safety.flags) }) }) };
}
