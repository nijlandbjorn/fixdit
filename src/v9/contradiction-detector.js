import { asArray, cleanText, immutable, stableHash } from './contracts.js';
import { activeEvidence } from './evidence-ledger.js';

function comparableValue(value) {
  if (value && typeof value === 'object') return JSON.stringify(value);
  return cleanText(value, 500).toLocaleLowerCase();
}

export function detectContradictions(ledger) {
  const groups = new Map();
  for (const entry of activeEvidence(ledger, item => item.confidence >= 0.55)) {
    if (entry.predicate === 'raw_text' || entry.polarity === 'unknown') continue;
    const key = `${entry.subject.toLocaleLowerCase()}|${entry.predicate.toLocaleLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  const contradictions = [];
  for (const [key, entries] of groups) {
    for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
        const left = entries[leftIndex];
        const right = entries[rightIndex];
        const sameValue = comparableValue(left.value) === comparableValue(right.value);
        const polarityConflict = sameValue && left.polarity !== right.polarity;
        const valueConflict = !sameValue && left.polarity === 'present' && right.polarity === 'present';
        if (!polarityConflict && !valueConflict) continue;

        contradictions.push(immutable({
          contradictionId: `cx_${stableHash([key, left.evidenceId, right.evidenceId])}`,
          subject: left.subject,
          predicate: left.predicate,
          evidenceIds: Object.freeze([left.evidenceId, right.evidenceId]),
          kind: polarityConflict ? 'polarity' : 'value',
          severity: Math.min(left.confidence, right.confidence) >= 0.85 ? 'blocking' : 'review',
          resolved: false,
        }));
      }
    }
  }

  return Object.freeze(contradictions);
}

export function unresolvedContradictions(contradictions) {
  return asArray(contradictions).filter(item => item.resolved !== true);
}
