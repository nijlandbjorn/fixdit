import { asArray, cleanText, immutable } from './contracts.js';

export const CONSUMER_RESPONSE_FIELDS = Object.freeze([
  'userSummary', 'helpfulIntro', 'likelyCauses', 'safeFirstChecks', 'nextQuestion',
  'questionType', 'options', 'whyThisQuestion', 'uncertainty', 'suggestedActions',
  'needsMoreInformation', 'provenance',
]);

const COPY = Object.freeze({
  nl: {
    intro: 'Op basis van je beschrijving kun je eerst een paar veilige controles doen.',
    uncertainty: 'We kunnen de precieze oorzaak nog niet betrouwbaar onderscheiden.',
    summary: 'Je beschrijft een probleem met {object}: {symptom}.',
    noMore: 'We hebben nog niet genoeg informatie om de oorzaak betrouwbaar vast te stellen.',
  },
  en: {
    intro: 'Based on your description, you can start with a few safe checks.',
    uncertainty: 'We cannot yet reliably distinguish the exact cause.',
    summary: 'You describe a problem with {object}: {symptom}.',
    noMore: 'There is not yet enough information to identify the cause reliably.',
  },
  de: {
    intro: 'Nach deiner Beschreibung kannst du zuerst einige sichere Kontrollen durchführen.',
    uncertainty: 'Die genaue Ursache lässt sich noch nicht zuverlässig unterscheiden.',
    summary: 'Du beschreibst ein Problem mit {object}: {symptom}.',
    noMore: 'Es gibt noch nicht genug Informationen, um die Ursache zuverlässig zu bestimmen.',
  },
});

const CHECKS = Object.freeze({
  black_screen: ['Controleer of helderheid en schermuitgang normaal zijn ingesteld.', 'Kijk of een extern scherm beeld geeft.'],
  no_spin: ['Kijk of er na het programma water in de trommel blijft staan.', 'Controleer of de belading niet sterk uit balans is.'],
  door_binding: ['Kijk waar de deur het kozijn als eerste raakt.', 'Controleer of zichtbare scharnieren of schroeven los zitten.'],
  wifi_dropout: ['Kijk welke lampjes veranderen wanneer de wifi wegvalt.', 'Controleer of bekabelde apparaten op dat moment online blijven.'],
  surface_scratch: ['Maak het oppervlak droog en schoon zodat de diepte zichtbaar is.', 'Kijk of de kras alleen in de afwerking zit of ook in het hout.'],
  chain_slip: ['Kijk of de ketting zichtbaar slap, vuil of beschadigd is.', 'Controleer zonder te fietsen of tanden sterk versleten of verbogen zijn.'],
  motion_no_response: ['Controleer de normale schakelaar en zichtbare instellingen.', 'Kijk of de lamp handmatig wel inschakelt.'],
  leaning_structure: ['Houd afstand als de schutting instabiel beweegt.', 'Kijk vanaf veilige afstand welke paal of bevestiging is verschoven.'],
  washer_no_flow: ['Controleer of het reservoir gevuld is.', 'Kijk of de zichtbare sproeiers verstopt zijn.'],
  gas_appliance_no_flow: ['Controleer alleen of de gaskraan volgens de normale bediening open staat.', 'Stop direct als je gas ruikt of een sissend geluid hoort.'],
  pressure_loss: ['Kijk of er een scherp voorwerp in de buitenband zit.', 'Controleer het ventiel op zichtbare schade.'],
  no_flow: ['Controleer of reservoir, toevoer en bereikbare uitloop goed geplaatst zijn.', 'Kijk of een bereikbaar filter zichtbaar verstopt is.'],
  no_power: ['Controleer kabel en stekker op zichtbare schade.', 'Test dezelfde externe voeding met een ander geschikt apparaat.'],
  not_charging: ['Controleer laadkabel en aansluiting op zichtbare schade.', 'Probeer een bekende passende lader als dat veilig kan.'],
  poor_cooling: ['Controleer of deur en afdichting goed sluiten.', 'Kijk of ventilatieopeningen vrij zijn.'],
  default: ['Controleer alleen zichtbare, normaal bereikbare onderdelen.', 'Noteer een foutcode of afwijkend lampje als dat zichtbaar is.'],
});

const INTERNAL_LABEL = /\b(?:maintenance history|observable behavior|failure boundary|known_good_supply|[a-z]+_[a-z_]+)\b/i;
const DANGEROUS = /\b(?:230\s*v|blote?\s+drad|bare\s+wires?|stromführ|overbrug|bypass|gasleiding\s+(?:open|los)|demonteer|disassemble)\b/i;
const PRICE_OR_SOURCE = /(?:€|\$|\b\d+[,.]?\d*\s*(?:euro|dollar)\b|https?:\/\/|volgens (?:de )?handleiding|manufacturer manual)/i;

function lang(language) { return ['nl', 'en', 'de'].includes(language) ? language : 'nl'; }
function strings(value, maxItems = 5, maxLength = 300) {
  return asArray(value).slice(0, maxItems).map(item => cleanText(item, maxLength)).filter(Boolean);
}

function localChecks(classification, language) {
  const base = CHECKS[classification?.symptom] || CHECKS.default;
  if (language === 'nl') return base.slice(0, 3);
  const generic = language === 'de'
    ? ['Kontrolliere nur sichtbare, normal zugängliche Teile.', 'Notiere sichtbare Fehlercodes oder ungewöhnliche Anzeigen.']
    : ['Check only visible, normally accessible parts.', 'Note any visible error code or unusual indicator.'];
  return generic;
}

export function buildDeterministicConsumerResponse({ language = 'nl', problem = '', classification = {}, hypotheses = [], nextTest = null, noProgress = {}, decision = {}, safety = {} } = {}) {
  const selected = lang(language);
  const copy = COPY[selected];
  const object = cleanText(classification.objectLabel || classification.objectFamily || (selected === 'de' ? 'dem Gegenstand' : selected === 'en' ? 'the item' : 'het voorwerp'), 80);
  const symptom = cleanText(classification.symptom || classification.problemKind || (selected === 'de' ? 'unklares Verhalten' : selected === 'en' ? 'unclear behaviour' : 'onduidelijk gedrag'), 80).replaceAll('_', ' ');
  const exhausted = noProgress?.exhausted === true;
  if (['stop', 'professional'].includes(safety?.route)) {
    const safetyText = selected === 'de'
      ? 'Benutze es nicht weiter. Halte Abstand und schalte es nur ab, wenn das ohne Annäherung an die Gefahr sicher möglich ist.'
      : selected === 'en'
        ? 'Do not use it again. Keep your distance and only switch it off if that can be done without approaching the hazard.'
        : 'Gebruik het niet opnieuw. Houd afstand en schakel het alleen uit als dat kan zonder het gevaar te benaderen.';
    return immutable({
      userSummary: copy.summary.replace('{object}', object).replace('{symptom}', symptom),
      helpfulIntro: safetyText, likelyCauses: Object.freeze([]), safeFirstChecks: Object.freeze([]),
      nextQuestion: '', questionType: null, options: Object.freeze([]), whyThisQuestion: '',
      uncertainty: copy.uncertainty, suggestedActions: Object.freeze([safetyText]), needsMoreInformation: false,
      provenance: Object.freeze([{ origin: 'deterministic_knowledge', fields: ['helpfulIntro', 'suggestedActions'] }, { origin: 'user_evidence', fields: ['userSummary'], input: cleanText(problem, 160) }]),
    });
  }
  return immutable({
    userSummary: copy.summary.replace('{object}', object).replace('{symptom}', symptom),
    helpfulIntro: exhausted ? copy.noMore : copy.intro,
    likelyCauses: Object.freeze(asArray(hypotheses).slice(0, 3).map(item => cleanText(item.statement, 300)).filter(Boolean)),
    safeFirstChecks: Object.freeze(localChecks(classification, selected)),
    nextQuestion: exhausted ? '' : cleanText(nextTest?.prompt, 300),
    questionType: exhausted || !nextTest ? null : nextTest.questionType,
    options: Object.freeze(nextTest?.questionType === 'boolean'
      ? (selected === 'de' ? ['Ja', 'Nein', 'Weiß ich nicht'] : selected === 'en' ? ['Yes', 'No', "I don't know"] : ['Ja', 'Nee', 'Weet ik niet']) : []),
    whyThisQuestion: nextTest ? (selected === 'de' ? 'Diese Beobachtung trennt die wahrscheinlichsten Ursachen.' : selected === 'en' ? 'This observation helps distinguish the leading causes.' : 'Deze waarneming helpt de belangrijkste oorzaken te onderscheiden.') : '',
    uncertainty: copy.uncertainty,
    suggestedActions: Object.freeze(decision?.route === 'direct_help' ? localChecks(classification, selected).slice(0, 2) : []),
    needsMoreInformation: decision?.route === 'diagnose' && !exhausted,
    provenance: Object.freeze([{ origin: 'deterministic_knowledge', fields: ['helpfulIntro', 'likelyCauses', 'safeFirstChecks', 'nextQuestion'] }, { origin: 'user_evidence', fields: ['userSummary'], input: cleanText(problem, 160) }]),
  });
}

export function validateConsumerResponse(value, { language = 'nl', repairGate = {}, safety = {}, classification = {}, fallback } = {}) {
  const fail = reason => ({ valid: false, reason, response: fallback });
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('missing_or_malformed');
  if (Object.keys(value).some(key => !CONSUMER_RESPONSE_FIELDS.includes(key))) return fail('hallucinated_field');
  const response = {
    userSummary: cleanText(value.userSummary, 300), helpfulIntro: cleanText(value.helpfulIntro, 400),
    likelyCauses: strings(value.likelyCauses, 4), safeFirstChecks: strings(value.safeFirstChecks, 4),
    nextQuestion: cleanText(value.nextQuestion, 300), questionType: value.questionType === 'none' ? null : (value.questionType || null),
    options: strings(value.options, 6, 100), whyThisQuestion: cleanText(value.whyThisQuestion, 300),
    uncertainty: cleanText(value.uncertainty, 300), suggestedActions: strings(value.suggestedActions, 4),
    needsMoreInformation: value.needsMoreInformation === true,
    provenance: asArray(value.provenance).slice(0, 8),
  };
  const allText = [response.userSummary, response.helpfulIntro, ...response.likelyCauses, ...response.safeFirstChecks, response.nextQuestion, response.whyThisQuestion, response.uncertainty, ...response.suggestedActions].join(' ');
  if (!response.helpfulIntro || response.safeFirstChecks.length === 0 || response.likelyCauses.length === 0) return fail('empty_required_content');
  if (allText.length > 2400) return fail('output_too_long');
  if (INTERNAL_LABEL.test(allText)) return fail('internal_label');
  if (DANGEROUS.test(allText)) return fail('dangerous_instruction');
  if (PRICE_OR_SOURCE.test(allText)) return fail('unsupported_price_or_source');
  if (safety?.route === 'stop' && /veilig|safe|sicher/i.test(response.helpfulIntro)) return fail('safety_override');
  if (repairGate?.open !== true && /(?:vervang|replace|ersetze|open de behuizing|remove the cover)/i.test([...response.safeFirstChecks, ...response.suggestedActions].join(' '))) return fail('repair_gate_bypass');
  if (response.nextQuestion && !['boolean', 'single_choice', 'multiple_choice', 'short_text', 'number', 'photo'].includes(response.questionType)) return fail('invalid_question_type');
  if (response.questionType === 'boolean' && /\b(?:en|and|und)\b.+\?/i.test(response.nextQuestion.replace(/\b(?:bekend|known|bekannt)\b/gi, ''))) return fail('compound_boolean_question');
  if (/Welke concrete waarneming|Which concrete observation|Welche konkrete Beobachtung/i.test(response.nextQuestion)) return fail('generic_placeholder_question');
  const expected = lang(language);
  if (expected === 'nl' && /\b(the|device|might|could|please check)\b/i.test(allText)) return fail('wrong_language');
  if (expected === 'de' && /\b(the|device|might|please check)\b/i.test(allText)) return fail('wrong_language');
  const symptomWords = cleanText(classification?.symptom, 80).split('_').filter(word => word.length > 3);
  if (symptomWords.length && !symptomWords.some(word => allText.toLowerCase().includes(word)) && response.userSummary.length < 12) return fail('insufficient_relevance');
  return { valid: true, reason: null, response: immutable({ ...response, likelyCauses: Object.freeze(response.likelyCauses), safeFirstChecks: Object.freeze(response.safeFirstChecks), options: Object.freeze(response.options), suggestedActions: Object.freeze(response.suggestedActions), provenance: Object.freeze(response.provenance) }) };
}
