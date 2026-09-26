import { V9_SAFETY_KERNEL_VERSION, asArray, cleanText } from './contracts.js';
import { activeEvidence } from './evidence-ledger.js';

const TRUSTED_SOURCES = new Set([
  'user_text',
  'previous_user_text',
  'vision_structured',
  'deterministic_normalization',
]);

const RULES = Object.freeze([
  ['gas', 'stop', /\b(gaslucht|gaslek|ruik(?:t)?(?:\s+\w+){0,2}\s+gas|gas.{0,20}ruik(?:t)?|gas smell|gas leak|gasgeruch|gasleck|riecht(?:\s+\w+){0,2}\s+gas)\b/i],
  ['fire_smoke', 'stop', /\b(rook|vonken|vlammen|brandlucht|fire|smoke|sparks|flames|burning smell|rauch|funken|flammen|brandgeruch)\b/i],
  ['mains_exposed', 'stop', /\b(blootliggende.{0,20}(?:draden|bedrading)|exposed mains|live wire|freiliegende.{0,20}(?:leitung|drähte)|230\s*v.{0,20}(?:bloot|exposed|freiliegend))\b/i],
  ['battery_damage', 'stop', /\b(opgezwollen.{0,30}(?:accu|batterij)|(?:accu|batterij).{0,30}opgezwollen|swollen battery|battery.{0,30}swollen|aufgeblähte batterie|batterie.{0,30}aufgebläht)\b/i],
  ['high_voltage', 'stop', /\b(magnetron.{0,30}(?:condensator|hoogspanning)|microwave.{0,30}(?:capacitor|high voltage)|mikrowelle.{0,30}hochspannung)\b/i],
  ['water_electricity', 'stop', /\b(water.{0,30}(?:stopcontact|stekker|230v|socket|outlet)|(?:stopcontact|stekker|230v|socket|outlet).{0,30}water|wasser.{0,30}steckdose|steckdose.{0,30}wasser)\b/i],
  ['refrigerant', 'professional', /\b(koelmiddel|freon|refrigerant|kältemittel)\b/i],
  ['asbestos', 'professional', /\b(asbest|asbestos)\b/i],
]);

const NEGATION = /\b(geen|niet|zonder|no|not|without|kein(?:e|en|er)?|nicht|ohne)\b/i;

function matchIsNegated(text, matchIndex, matchedText = '') {
  const before = text.slice(Math.max(0, matchIndex - 60), matchIndex);
  const clause = before.split(
    /(?:[.;:!?]|\b(?:maar|but|aber|echter|however)\b|\b(?:en|and|und)\s+(?:ik|we|wij|er|het|de|een)\b)/i,
  ).at(-1) || '';
  if (/\b(?:weet|weten|know|weiß|wissen)\s+(?:het\s+)?niet\s+of\b/i.test(clause)) return false;
  if (/\b(?:niet alleen|not only|nicht nur)\b/i.test(clause)) return false;
  return NEGATION.test(clause) || NEGATION.test(matchedText);
}

function evidenceText(entry) {
  if (entry.predicate === 'raw_text') return cleanText(entry.value);
  return `${cleanText(entry.subject)} ${cleanText(entry.predicate)} ${cleanText(entry.value)}`.trim();
}

function addFlag(flags, code, route, evidenceId) {
  let flag = flags.find(item => item.code === code);
  if (!flag) {
    flag = { code, route, evidenceIds: [] };
    flags.push(flag);
  }
  if (!flag.evidenceIds.includes(evidenceId)) flag.evidenceIds.push(evidenceId);
}

export function assessSafetyEvidence(ledger) {
  const assessments = {};
  const trusted = activeEvidence(ledger, entry => TRUSTED_SOURCES.has(entry.source));
  for (const entry of trusted) {
    if (entry.polarity === 'absent' || entry.polarity === 'unknown') continue;
    const text = evidenceText(entry);
    for (const [code, route, pattern] of RULES) {
      const matcher = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
      for (const match of text.matchAll(matcher)) {
        const state = assessments[code] || {
          code,
          route,
          presentEvidenceIds: [],
          negatedEvidenceIds: [],
        };
        const target = matchIsNegated(text, match.index, match[0])
          ? state.negatedEvidenceIds
          : state.presentEvidenceIds;
        if (!target.includes(entry.evidenceId)) target.push(entry.evidenceId);
        assessments[code] = state;
      }
    }
  }
  return Object.freeze(Object.fromEntries(Object.entries(assessments).map(([code, value]) => [
    code,
    Object.freeze({
      ...value,
      presentEvidenceIds: Object.freeze([...value.presentEvidenceIds]),
      negatedEvidenceIds: Object.freeze([...value.negatedEvidenceIds]),
    }),
  ])));
}

function normalizedValue(ledger, predicate) {
  return activeEvidence(ledger, entry =>
    entry.source === 'deterministic_normalization' &&
    entry.subject === 'classification' &&
    entry.predicate === predicate &&
    entry.polarity === 'present')
    .at(-1)?.value;
}

export function evaluateSafety(ledger) {
  const flags = [];
  const trusted = activeEvidence(ledger, entry => TRUSTED_SOURCES.has(entry.source));
  const assessments = assessSafetyEvidence(ledger);
  for (const assessment of Object.values(assessments)) {
    for (const evidenceId of assessment.presentEvidenceIds) {
      addFlag(flags, assessment.code, assessment.route, evidenceId);
    }
  }

  const family = normalizedValue(ledger, 'objectFamily');
  const symptom = normalizedValue(ledger, 'symptom');
  const normalizedEntries = activeEvidence(ledger, entry => entry.source === 'deterministic_normalization');
  const normalizedIds = normalizedEntries.map(entry => entry.evidenceId);
  const normalizedId = normalizedIds[0] || 'deterministic_context';

  if (family === 'automotive') {
    if (symptom === 'braking_fault') addFlag(flags, 'vehicle_brakes', 'professional', normalizedId);
    if (symptom === 'steering_fault') addFlag(flags, 'vehicle_steering', 'professional', normalizedId);
    if (symptom === 'overheating') addFlag(flags, 'vehicle_overheat', 'professional', normalizedId);
    if (['pressure_loss', 'puncture'].includes(symptom)) addFlag(flags, 'vehicle_tire', 'caution', normalizedId);
  }

  if (family === 'aquarium') {
    for (const entry of trusted) {
      const text = evidenceText(entry);
      if (/\b(gebarsten glas|glas.{0,30}aquarium.{0,30}(?:gebarsten|scheur|barst)|cracked glass|glass.{0,30}(?:aquarium|fish tank).{0,30}crack|aquariumruit.{0,20}(?:scheur|barst)|aquariumscheibe.{0,20}riss)\b/i.test(text)) {
        addFlag(flags, 'structural_aquarium', 'professional', entry.evidenceId);
      }
    }
  }

  const route = flags.some(flag => flag.route === 'stop')
    ? 'stop'
    : flags.some(flag => flag.route === 'professional')
      ? 'professional'
      : flags.some(flag => flag.route === 'caution')
        ? 'caution'
        : null;

  return Object.freeze({
    kernelVersion: V9_SAFETY_KERNEL_VERSION,
    deterministic: true,
    route,
    minimumRisk: route === 'stop' ? 'stop' : route === 'professional' ? 'hoog' : route === 'caution' ? 'middel' : null,
    flags: Object.freeze(flags.map(flag => Object.freeze({
      ...flag,
      evidenceIds: Object.freeze([...flag.evidenceIds]),
    }))),
  });
}

export function safetyFlagCodes(decision) {
  return asArray(decision?.flags).map(flag => flag.code);
}
