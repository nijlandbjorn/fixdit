import { asArray, cleanText } from './contracts.js';

export function normalizeEvidenceAxis(value = '') {
  const axis = cleanText(value, 160).toLocaleLowerCase().replace(/[^a-z0-9äöüß_-]+/g, '_');
  if (!axis) return '';
  if (/damage|schade|gescheur|torn|tear|crack|fray|beschad|riss|bruch/.test(axis)) return 'visible_damage';
  if (/powered_discriminator|movement_dependency|cable_movement|kabel_beweg|angle_dependency|bewegungsabh/.test(axis)) return 'movement_dependency';
  if (/location|plaats|plek|positie|where|stelle|ort/.test(axis) && /cable|kabel|connector|stekker|connection|verbinding/.test(axis)) return 'connection_location';
  if (/flow_difference|doorstroomverschil|water_flow_comparison/.test(axis)) return 'flow_difference';
  if (/leak_location|lek_locatie/.test(axis)) return 'leak_location';
  if (/temperature_dependency|temperatuur_afhankelijk/.test(axis)) return 'temperature_dependency';
  if (/intermittent|wisselend|onderbroken/.test(axis)) return 'intermittent_behavior';
  return axis;
}

export function inferEvidenceAxesFromText(value = '') {
  const text = cleanText(value, 1000).toLocaleLowerCase();
  const axes = new Set();
  if (/\b(?:kabel|stekker|connector|cable|plug|stecker)\b.{0,45}\b(?:beweeg|beweg|draai|hoek|move|wiggl|turn|angle)\b|\b(?:beweeg|beweg|draai|hoek|move|wiggl|turn|angle)\b.{0,45}\b(?:kabel|stekker|connector|cable|plug|stecker)\b/i.test(text)) axes.add('movement_dependency');
  if (/\b(?:zichtbare? schade|beschadigd|gescheurd|gerafeld|visible damage|damaged|torn|frayed|sichtbar beschädigt|gerissen)\b/i.test(text)) axes.add('visible_damage');
  if (/\b(?:waar|where|wo)\b.{0,50}\b(?:lek|vocht|leak|moisture|undicht|feuchtigkeit)\b/i.test(text)) axes.add('leak_location');
  return axes;
}

export function handledEvidenceAxes({ ledger = null, observations = [], rawText = '' } = {}) {
  const axes = new Set();
  for (const entry of asArray(ledger?.entries)) {
    if (entry.status !== 'active') continue;
    if (entry.subject === 'user_answer') axes.add(normalizeEvidenceAxis(entry.provenance?.evidenceKey || entry.predicate));
    for (const inferred of inferEvidenceAxesFromText(entry.value)) axes.add(inferred);
  }
  for (const item of asArray(observations)) {
    const key = normalizeEvidenceAxis(item?.evidenceKey);
    if (key) axes.add(key);
    for (const inferred of inferEvidenceAxesFromText(item?.semanticClaim || item?.text || item)) axes.add(inferred);
  }
  for (const inferred of inferEvidenceAxesFromText(rawText)) axes.add(inferred);
  axes.delete('');
  return axes;
}

export function sameAxisAlternativeQuestion(text = '', evidenceKey = '') {
  if (!/\b(?:of|or|oder)\b/i.test(text)) return false;
  const axis = normalizeEvidenceAxis(evidenceKey);
  if (axis !== 'visible_damage') return false;
  const parts = cleanText(text, 300).replace(/[?]+$/g, '').split(/\b(?:of|or|oder)\b/i);
  if (parts.length !== 2) return false;
  const damage = /\b(?:schade|beschadigd|gescheurd|gerafeld|gebroken|damage|damaged|torn|frayed|broken|beschädigt|gerissen|ausgefranst|gebrochen)\b/i;
  return damage.test(parts[0]) && damage.test(parts[1]);
}
