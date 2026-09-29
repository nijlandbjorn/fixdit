import { asArray, cleanText, immutable, stableHash } from './contracts.js';
import { canonicalQuestionEvidenceAxis, handledEvidenceAxes, normalizeEvidenceAxis, sameAxisAlternativeQuestion } from './diagnostic-axis.js';

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
export const CHOICE_IDS = Object.freeze(['yes', 'no', 'unknown', 'cannot_check', 'not_applicable', 'other']);
const GENERIC_OBJECT = /^(?:voorwerp|item|gegenstand|apparaat|device|gerät)$/i;

function languageOf(value) { return ['nl', 'en', 'de'].includes(value) ? value : 'nl'; }
function localized(language, nl, en, de) { return language === 'de' ? de : language === 'en' ? en : nl; }
function sentence(value) { const text = cleanText(value, 260); return text ? `${text.replace(/[.!?]+$/g, '')}.` : ''; }
function activeUserEvidence(ledger) { return asArray(ledger?.entries).filter(entry => entry.status === 'active' && ['user_text', 'previous_user_text', 'vision_structured'].includes(entry.source)); }
function rawObjectName(problem, language) {
  const raw = cleanText(problem, 180).replace(/[.!?]+$/g, '');
  const verb = '(?:is|zijn|heeft|hebben|doet|doen|gaat|werken?|start|begint|blijft|zakt|steekt|loopt|lekt|rolt|wordt|geeft|draait|trapt|staat|krijgt|laadt|koelt|ontsteekt|vonkt|maakt|knippert|dubbelklikt|sluit|hangt|wiebelt|kraakt|slaat|valt|slingert|stopt|trekt|reageert|springt|zit|ruikt|komt|has|does|starts|stays|drops|leaks|rolls|sparks|closes|hangs|falls|clicks|ist|hat|funktioniert|startet|bleibt|sinkt|läuft|leckt|rollt|funkt|wird)';
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
function fallbackMechanism(text) {
  const value = String(text || '').toLocaleLowerCase();
  if (/\b(?:rook|brandlucht|smeltlucht|gaslucht|vlam|vonken?|smoke|burning smell|gas smell|flames?|sparks?|rauch|brandgeruch|gasgeruch|flammen?|funken?)\b/i.test(value)) return 'hazard';
  if (/\b(?:lek|lekt|lekkage|vocht|druip|water onder|leak|leaking|moisture|drip|leckt|undicht|feucht|tropf)\b/i.test(value)) return 'leak';
  if (/\b(?:water|afvoer|doorstroom|druk|kraan|pomp|spoelt|flow|drain|pressure|faucet|tap|pump|wasser|abfluss|druck|hahn|pumpe)\b/i.test(value)) return 'flow';
  if (/\b(?:heet|warm|koelt|vriest|ijs|temperatuur|hot|heat|cool|freez|ice|heiß|warm|kühl|frier|eis)\b/i.test(value)) return 'thermal';
  if (/\b(?:kabel|stekker|connector|cable|plug|stecker)\b.{0,60}\b(?:beweeg|beweg|draai|hoek|move|wiggl|turn|angle)\b|\b(?:beweeg|beweg|draai|hoek|move|wiggl|turn|angle)\b.{0,60}\b(?:kabel|stekker|connector|cable|plug|stecker)\b/i.test(value)) return 'connection';
  if (/\b(?:wifi|router|netwerk|software|app|instelling|verbinding|network|configuration|setting|connection|netzwerk|software|einstellung|verbindung)\b/i.test(value)) return 'software';
  if (/\b(?:laadt|stroom|stekker|kabel|scherm|toets|lamp|elektr|charging|power|plug|cable|screen|key|light|strom|stecker|kabel|bildschirm|taste|licht)\b/i.test(value)) return 'powered';
  if (/\b(?:scheef|klemt|loopt aan|slingert|barst|kras|vervorm|crooked|stuck|rubs|wobbl|crack|scratch|misalign|schief|klemmt|schleift|eiert|riss|kratzer)\b/i.test(value)) return 'alignment';
  if (/\b(?:rolt|draait|beweegt|zakt|hangt|klikt|veer|mechan|rolls?|turns?|moves?|drops|hangs?|clicks?|spring|rollt|dreht|bewegt|sinkt|hängt|klickt|feder)\b/i.test(value)) return 'mechanical';
  return 'unknown';
}
function fallbackChecks(language, mechanism, objectName = '') {
  const object = objectName || localized(language, 'het betrokken onderdeel', 'the affected part', 'das betroffene Teil');
  const copy = {
    mechanical: [`Kijk van buiten of ${object} zichtbaar geblokkeerd, verbogen of verschoven is.`, `Let zonder kracht te zetten op weerstand, speling of een afwijkend geluid bij normale beweging.`],
    alignment: [`Bekijk van buiten waar ${object} aanloopt, klemt of uit lijn staat.`, `Vergelijk de stand en vrije ruimte aan beide zijden zonder iets los te maken.`],
    powered: [`Controleer ${object} van buiten op een losse of beschadigde kabel, stekker of aansluiting die bij dit probleem hoort.`, `Let bij ${object} op welk normaal zichtbaar lampje, scherm of laadteken wel of niet verschijnt.`],
    connection: [`Bekijk de bereikbare kabel en stekker van ${object} op een zichtbare knik, scheur of losse buitenkant.`, `Let op bij welk bereikbaar uiteinde een kleine normale beweging het gedrag verandert, zonder kracht te zetten.`],
    software: [`Let bij ${object} op welke normale status of verbinding zichtbaar verandert wanneer het probleem optreedt.`, `Vergelijk het gedrag van ${object} in één andere normale gebruikssituatie zonder instellingen te wijzigen.`],
    flow: [`Controleer bij ${object} de normaal bereikbare toevoer of afvoer op een zichtbare knik of blokkade.`, `Vergelijk de doorstroming van ${object} tijdens normaal gebruik zonder onderdelen te openen.`],
    leak: [`Dep ${object} aan de buitenkant droog en kijk waar het vocht als eerste opnieuw zichtbaar wordt.`, `Controleer van buiten of een bereikbare koppeling, rand of slang van ${object} zichtbaar nat is.`],
    thermal: [`Controleer van buiten waar bij ${object} warmte, kou of ijsvorming het duidelijkst optreedt.`, `Kijk of een deur, rooster of afdichting van ${object} zichtbaar niet goed aansluit.`],
    unknown: [`Bekijk ${object} alleen van buiten op een zichtbare blokkade, beschadiging of afwijkende stand.`, `Let bij normaal gebruik van ${object} op het eerste zichtbare of hoorbare verschil zonder iets los te maken.`],
  };
  return (copy[mechanism] || copy.unknown).map(text => localized(language, text, text, text));
}
function fallbackCauses(language, mechanism, objectName = '') {
  const object = objectName || localized(language, 'het betrokken onderdeel', 'the affected part', 'das betroffene Teil');
  const copy = {
    mechanical: [`Een zichtbare blokkade kan de vrije beweging van ${object} hinderen.`, `Een verschoven of vervormd bewegend deel kan de teruggaande beweging remmen.`],
    alignment: [`Een verschoven bevestigingspunt kan ${object} uit lijn trekken.`, `Plaatselijke vervorming kan zorgen dat ${object} aanloopt of klemt.`],
    powered: [`Een onderbreking in het bereikbare externe voedings- of signaalpad kan het gedrag veroorzaken.`, `De normale externe bediening kan geen stabiel signaal aan ${object} geven.`],
    connection: [`Een breuk in de bereikbare kabel kan het signaal bij beweging onderbreken.`, `Een los bereikbaar stekkercontact kan het signaal afhankelijk van de stand maken.`],
    software: [`De storing kan beperkt zijn tot één gebruikssituatie of verbonden apparaat.`, `Een instabiele normale verbinding of configuratiestatus kan het gedrag veroorzaken.`],
    flow: [`Een beperking in de normaal bereikbare toevoer kan de doorstroming verminderen.`, `Een bereikbare afvoer of uitlaat kan gedeeltelijk geblokkeerd zijn.`],
    leak: [`Een bereikbare koppeling of afdichtrand kan plaatselijk lekken.`, `Een zichtbaar leiding-, slang- of oppervlaktedeel kan beschadigd zijn.`],
    thermal: [`Een deur, rooster of afdichting kan plaatselijk niet goed aansluiten.`, `Beperkte luchtcirculatie kan het temperatuurverschil plaatselijk versterken.`],
    unknown: [`Een zichtbare blokkade of afwijkende stand kan het gemelde gedrag veroorzaken.`],
  };
  return (copy[mechanism] || copy.unknown).map(text => localized(language, text, text, text));
}
function fallbackQuestion(language, mechanism) {
  const questions = {
    mechanical: ['Voel je weerstand wanneer je het onderdeel langzaam en zonder kracht beweegt?', 'Do you feel resistance when moving the part slowly without force?', 'Spürst du Widerstand, wenn du das Teil langsam und ohne Kraft bewegst?'],
    alignment: ['Op welke plek raakt of klemt het onderdeel?', 'At which point does the part rub or jam?', 'An welcher Stelle schleift oder klemmt das Teil?'],
    powered: ['Blijft de werking veranderen wanneer de bereikbare kabel of stekker stil blijft liggen?', 'Does the behavior still change while the accessible cable or plug remains still?', 'Ändert sich das Verhalten weiterhin, wenn das zugängliche Kabel oder der Stecker stillliegt?'],
    software: ['Treedt het probleem ook op in een andere normale gebruikssituatie?', 'Does the problem also occur in another normal usage situation?', 'Tritt das Problem auch in einer anderen normalen Nutzungssituation auf?'],
    flow: ['Is de doorstroming vanaf het begin zwak?', 'Is the flow weak from the start?', 'Ist der Durchfluss von Anfang an schwach?'],
    leak: ['Waar verschijnt het vocht als eerste?', 'Where does the moisture first appear?', 'Wo tritt die Feuchtigkeit zuerst auf?'],
    thermal: ['Waar is het temperatuurverschil of de ijsvorming het sterkst?', 'Where is the temperature difference or ice buildup strongest?', 'Wo ist der Temperaturunterschied oder die Eisbildung am stärksten?'],
    unknown: ['Welke zichtbare verandering treedt op wanneer het probleem ontstaat?', 'What visible change occurs when the problem appears?', 'Welche sichtbare Veränderung tritt auf, wenn das Problem erscheint?'],
  };
  const [nl, en, de] = questions[mechanism] || questions.unknown;
  return localized(language, nl, en, de);
}
function fallbackQuestionCandidate(language, mechanism, handled) {
  const candidates = mechanism === 'connection' ? [
    { evidenceKey: 'visible_damage', questionType: 'boolean', prompt: localized(language, 'Zie je zichtbare schade aan de bereikbare kabel of stekker?', 'Can you see visible damage on the accessible cable or plug?', 'Siehst du sichtbare Schäden am zugänglichen Kabel oder Stecker?') },
    { evidenceKey: 'connection_location', questionType: 'short_text', prompt: localized(language, 'Bij welk bereikbaar uiteinde verandert het geluid het duidelijkst?', 'At which accessible end does the sound change most clearly?', 'An welchem zugänglichen Ende verändert sich der Ton am deutlichsten?') },
  ] : [{ evidenceKey: `${mechanism}_discriminator`, questionType: 'short_text', prompt: fallbackQuestion(language, mechanism) }];
  return candidates.find(candidate => !handled.has(normalizeEvidenceAxis(candidate.evidenceKey))) || null;
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
function canonicalQuestionOptions(prompt, language) {
  const evidenceMapping = semanticMappings(prompt, language);
  return {
    options: Object.entries(evidenceMapping).map(([id, mapping]) => ({ id, label: mapping.label })),
    evidenceMapping,
  };
}
function canonicalCustomOptions(choices, prompt, language) {
  const seen = new Set();
  const options = [];
  const evidenceMapping = {};
  const actions = [];
  const standard = semanticMappings(prompt, language);
  const standardId = label => {
    const normalized = label.toLocaleLowerCase(language).replace(/[.!?…]+$/g, '').trim();
    if (/^(?:ja|yes)$/.test(normalized)) return 'yes';
    if (/^(?:nee|no|nein)$/.test(normalized)) return 'no';
    if (/^(?:weet ik niet|i don'?t know|weiss ich nicht|weiß ich nicht)$/.test(normalized)) return 'unknown';
    if (/^(?:kan ik niet controleren|i can'?t check|kann ich nicht prüfen)$/.test(normalized)) return 'cannot_check';
    if (/^(?:niet van toepassing|not applicable|nicht zutreffend)$/.test(normalized)) return 'not_applicable';
    if (/^(?:anders|other)$/.test(normalized)) return 'other';
    return '';
  };
  for (const rawChoice of asArray(choices)) {
    const label = cleanText(rawChoice, 100);
    const duplicateKey = label.toLocaleLowerCase(language);
    if (!label || seen.has(duplicateKey)) {
      if (label) actions.push('duplicate_identical_choice_removed');
      continue;
    }
    seen.add(duplicateKey);
    const semanticId = standardId(label);
    const id = semanticId || `choice_${stableHash([prompt, duplicateKey])}`;
    if (evidenceMapping[id]) continue;
    options.push({ id, label: semanticId ? standard[id].label : label });
    evidenceMapping[id] = semanticId ? standard[id] : immutable({ label, claim: sentence(`${cleanText(prompt, 220).replace(/[?]+$/g, '')}: ${label}`), polarity: 'present' });
    actions.push(semanticId ? 'standard_choice_canonicalized' : 'custom_choice_machine_id_generated');
  }
  for (const id of ['unknown', 'cannot_check', 'not_applicable', 'other']) {
    if (evidenceMapping[id]) continue;
    options.push({ id, label: standard[id].label });
    evidenceMapping[id] = standard[id];
  }
  return { options, evidenceMapping, actions };
}
function binaryQuestionChoices(question, type, choices) {
  if (type !== 'short_text' || asArray(choices).length) return null;
  const text = cleanText(question, 300).replace(/[?]+$/g, '').trim();
  const match = /^(.*)\b(?:of|or|oder)\b\s+([\p{L}-]+(?:\s+[\p{L}-]+){0,2})$/iu.exec(text);
  if (!match || /[,;]/.test(match[1])) return null;
  const before = match[1].trim().split(/\s+/).at(-1);
  const after = match[2].trim();
  if (!before || /^(?:wat|waar|wanneer|wie|welk|what|where|when|who|which|was|wo|wann|wer|welch)$/i.test(before)) return null;
  const label = value => value.charAt(0).toLocaleUpperCase() + value.slice(1);
  return [label(before), label(after)];
}
function rawStringTooLong(value, max) { return typeof value === 'string' && value.trim().length > max; }
function hasOversizedFields(value) {
  if (rawStringTooLong(value?.summary, 360) || rawStringTooLong(value?.uncertainty, 300)) return true;
  if (rawStringTooLong(value?.object?.displayName, 100) || rawStringTooLong(value?.object?.category, 100)) return true;
  if (asArray(value?.knownFacts).some(item => rawStringTooLong(item?.text, 260) || asArray(item?.evidenceIds).some(id => rawStringTooLong(id, 120)))) return true;
  if (asArray(value?.likelyCauses).some(item => rawStringTooLong(item?.label, 240) || rawStringTooLong(item?.basis, 60))) return true;
  if (asArray(value?.safeFirstChecks).some(item => rawStringTooLong(item?.text, 260) || rawStringTooLong(item?.actionClass, 60))) return true;
  const q = value?.nextQuestion;
  return rawStringTooLong(q?.questionId, 120) || rawStringTooLong(q?.type, 40) || rawStringTooLong(q?.text, 300)
    || rawStringTooLong(q?.evidenceKey, 120) || rawStringTooLong(q?.why, 240)
    || asArray(q?.choices).some(choice => rawStringTooLong(choice, 100));
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
  const mechanism = fallbackMechanism(initialReport);
  const handledAxes = handledEvidenceAxes({ ledger, rawText: initialReport });
  const normalizedNextAxis = normalizeEvidenceAxis(nextTest?.evidenceKey || nextTest?.code);
  const fallbackCandidate = fallbackQuestionCandidate(selected, mechanism, handledAxes);
  const groundedNextTest = nextTest?.evidenceKey === 'observable_behavior' || (normalizedNextAxis && handledAxes.has(normalizedNextAxis))
    ? (fallbackCandidate ? { ...nextTest, ...fallbackCandidate } : null)
    : nextTest;
  const question = stopped || exhausted || directHelp ? null : questionFromTest(groundedNextTest, selected) || immutable({ questionId: `q_${stableHash([selected, 'clarify'])}`, type: 'short_text', text: clarification(selected), options: Object.freeze([]), evidenceKey: 'object_and_problem_description', evidenceMapping: immutable({}), why: '' });
  const summary = stopped ? safetyCopy(selected) : localized(selected, `Je beschrijft: ${sentence(initialReport)}`, `You described: ${sentence(initialReport)}`, `Du beschreibst: ${sentence(initialReport)}`);
  const groundedCauses = asArray(directHelp?.causes).concat(asArray(hypotheses).map(item => item.statement)).filter(text => text && !/onvoldoende afgebakend|insufficiently defined|nicht ausreichend eingegrenzt/i.test(text));
  const causes = [...groundedCauses, ...fallbackCauses(selected, mechanism, objectName)].slice(0, 3);
  const suppliedChecks = asArray(directHelp?.now).filter(text => !DANGEROUS.test(text)).slice(0, 2);
  const checks = [...suppliedChecks, ...fallbackChecks(selected, mechanism, objectName)].slice(0, 2);
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
  const required = ['object', 'summary', 'knownFacts', 'likelyCauses', 'safeFirstChecks', 'nextQuestion', 'uncertainty', 'repairGuidance'];
  if (required.some(key => !Object.hasOwn(value, key))) return fail('missing_required_field');
  if (hasOversizedFields(value)) return fail('field_too_long');
  if (asArray(value.knownFacts).length > 6 || asArray(value.likelyCauses).length > 4 || asArray(value.safeFirstChecks).length > 4 || asArray(value.nextQuestion?.choices).length > 6) return fail('array_too_long');
  const allowed = ['contractVersion', 'responseSource', 'degradedMode', 'language', 'object', 'summary', 'knownFacts', 'likelyCauses', 'safeFirstChecks', 'nextQuestion', 'endState', 'uncertainty', 'repairGuidance', 'safety'];
  if (Object.keys(value).some(key => !allowed.includes(key))) return fail('hallucinated_field');
  if (!value.object || typeof value.object !== 'object' || Array.isArray(value.object)) return fail('missing_required_field');
  if (Object.keys(value.object).some(key => !['displayName', 'category', 'source', 'confidence'].includes(key))) return fail('hallucinated_field');
  if (!Array.isArray(value.knownFacts) || !Array.isArray(value.likelyCauses) || !Array.isArray(value.safeFirstChecks)) return fail('missing_required_field');
  if (value.knownFacts.some(item => !item || typeof item !== 'object' || Object.keys(item).some(key => !['text', 'evidenceIds'].includes(key)))) return fail('hallucinated_field');
  if (value.likelyCauses.some(item => !item || typeof item !== 'object' || Object.keys(item).some(key => !['label', 'basis'].includes(key)))) return fail('hallucinated_field');
  if (value.safeFirstChecks.some(item => !item || typeof item !== 'object' || Object.keys(item).some(key => !['text', 'actionClass'].includes(key)))) return fail('hallucinated_field');
  const selected = languageOf(language);
  if (value.contractVersion != null && value.contractVersion !== CONSUMER_RESPONSE_CONTRACT_VERSION) return fail('contract_version_mismatch');
  if (value.responseSource != null && value.responseSource !== 'ai') return fail('response_source_mismatch');
  if (value.language != null && value.language !== selected) return fail('language_mismatch');
  if (value.object?.source != null && value.object.source !== 'ai_understanding') return fail('object_source_mismatch');
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
  if (repairGate?.open !== true && value.repairGuidance != null) return fail('repair_guidance_when_gate_closed');
  const q = value.nextQuestion;
  if (q && (typeof q !== 'object' || Array.isArray(q) || Object.keys(q).some(key => !['questionId', 'type', 'text', 'evidenceKey', 'why', 'choices', 'options', 'evidenceMapping'].includes(key)))) return fail('hallucinated_field');
  if (q && (Object.hasOwn(q, 'options') || Object.hasOwn(q, 'evidenceMapping'))) return fail('ai_supplied_interaction_semantics');
  const rawQuestionText = cleanText(q?.text, 300);
  const sameAxisAlternative = sameAxisAlternativeQuestion(rawQuestionText, q?.evidenceKey);
  const questionText = sameAxisAlternative
    ? localized(selected, 'Zie je zichtbare schade?', 'Can you see visible damage?', 'Siehst du sichtbare Schäden?')
    : rawQuestionText;
  const proposedType = cleanText(q?.type, 40);
  const proposedChoices = asArray(q?.choices);
  const inferredChoices = binaryQuestionChoices(questionText, proposedType, proposedChoices);
  const questionType = inferredChoices ? 'single_choice' : proposedType;
  const contentChoices = inferredChoices || proposedChoices;
  const canonical = ['single_choice', 'multi_choice'].includes(questionType) && contentChoices.length
    ? canonicalCustomOptions(contentChoices, questionText, selected)
    : ['single_choice', 'multi_choice', 'action_check'].includes(questionType)
      ? canonicalQuestionOptions(questionText, selected)
    : { options: [], evidenceMapping: {} };
  const evidenceKey = canonicalQuestionEvidenceAxis(q);
  const nextQuestion = q && questionText ? { questionId: cleanText(q.questionId, 120) || `q_${stableHash([questionText, evidenceKey])}`, type: questionType, text: questionText, options: canonical.options, evidenceKey, evidenceMapping: canonical.evidenceMapping, why: cleanText(q.why, 240) } : null;
  if (nextQuestion && !QUESTION_TYPES.includes(nextQuestion.type)) return fail('invalid_question_type');
  if (nextQuestion && contentChoices.length && !['single_choice', 'multi_choice'].includes(nextQuestion.type)) return fail('choices_on_non_choice_question');
  if (nextQuestion && !asArray(capabilities?.questionTypes).includes(nextQuestion.type)) return fail('unsupported_question_type');
  if (nextQuestion?.type === 'photo' && capabilities?.photoInput !== true) return fail('photo_input_unavailable');
  if (nextQuestion && !inferredChoices && !sameAxisAlternative && /\b(?:en|and|und|maar|but|aber|of|or|oder)\b.+\?/i.test(nextQuestion.text)) return fail('compound_question');
  if (nextQuestion && (!nextQuestion.questionId || !nextQuestion.evidenceKey)) return fail('incomplete_question_contract');
  const answeredAxes = handledEvidenceAxes({ ledger });
  if (nextQuestion && answeredAxes.has(nextQuestion.evidenceKey)) return fail('already_known_evidence_axis');
  if (nextQuestion && ['single_choice', 'multi_choice', 'action_check'].includes(nextQuestion.type)) {
    if (nextQuestion.options.length < 2) return fail('missing_question_options');
    if (nextQuestion.options.some(option => !nextQuestion.evidenceMapping?.[option.id])) return fail('missing_evidence_mapping');
    if (contentChoices.length && contentChoices.length < 2) return fail('insufficient_content_choices');
    if (!contentChoices.length && nextQuestion.type === 'single_choice' && CHOICE_IDS.some(id => !nextQuestion.options.some(option => option.id === id))) return fail('incomplete_semantic_options');
  }
  const response = { contractVersion: CONSUMER_RESPONSE_CONTRACT_VERSION, responseSource: 'ai', degradedMode: false, language: selected, object, summary: cleanText(value.summary, 360), knownFacts, likelyCauses, safeFirstChecks, nextQuestion, endState: cleanText(value.endState, 60) || null, uncertainty: cleanText(value.uncertainty, 300), repairGuidance: repairGate?.open === true ? value.repairGuidance ?? null : null, safety: { route: safety?.route || null, flags: asArray(safety?.flags).map(flag => flag.code) } };
  const text = allText(response);
  if (!response.summary || !object.displayName || !likelyCauses.length || !safeFirstChecks.length) return fail('empty_required_content');
  if (likelyCauses.some(item => /^(?:unknown|unknown cause|onbekende oorzaak|oorzaak onbekend|unbekannte ursache|unklare ursache|mechanische storing|mechanical fault|mechanischer fehler|algemeen defect|general defect|allgemeiner defekt|slijtage|wear|verschleiß)[.!]?$/i.test(item.label))) return fail('placeholder_likely_cause');
  if (text.length > 2600) return fail('output_too_long');
  if (INTERNAL.test(text) || INTERNAL.test(object.displayName)) return fail('internal_label');
  if (DANGEROUS.test(text)) return fail('dangerous_instruction');
  if (PRICE_OR_SOURCE.test(text)) return fail('unsupported_price_or_source');
  if (selected === 'nl' && /\b(the|device|might|please check)\b/i.test(text)) return fail('wrong_language');
  if (selected === 'de' && /\b(the|device|might|please check)\b/i.test(text)) return fail('wrong_language');
  if (safety?.route && value.safety?.route && value.safety.route !== safety.route) return fail('safety_override');
  const canonicalizationActions = [...(canonical.actions || []), ...(inferredChoices ? ['binary_alternative_question_made_tap_first'] : []), ...(sameAxisAlternative ? ['same_axis_wording_canonicalized'] : [])];
  return { valid: true, reason: null, canonicalizationActions: Object.freeze(canonicalizationActions), response: immutable({ ...response, object: immutable(object), knownFacts: Object.freeze(knownFacts.map(immutable)), likelyCauses: Object.freeze(likelyCauses.map(immutable)), safeFirstChecks: Object.freeze(safeFirstChecks.map(immutable)), nextQuestion: nextQuestion ? immutable({ ...nextQuestion, options: Object.freeze(nextQuestion.options.map(immutable)), evidenceMapping: immutable(nextQuestion.evidenceMapping) }) : null, safety: immutable({ ...response.safety, flags: Object.freeze(response.safety.flags) }) }) };
}
