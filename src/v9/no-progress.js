import { asArray, cleanText, immutable } from './contracts.js';

const UNKNOWN = /^(weet ik niet|geen idee|onbekend|i don(?:'|’)t know|no idea|ich wei(?:ss|ß) nicht|keine ahnung)$/i;
const CANNOT_CHECK = /^(kan ik niet (?:controleren|zien|testen|nakijken)|dat kan ik niet controleren|cannot (?:check|see|test)|i can(?:not|'t) check|kann ich nicht (?:prüfen|sehen|testen))$/i;

function normalized(value) {
  return cleanText(value, 600).toLocaleLowerCase().replace(/[.!?]+$/g, '').trim();
}

export function detectNoProgress(previousObservations = [], problem = '') {
  const values = asArray(previousObservations).map(item => item?.text ?? item).map(normalized).filter(Boolean);
  const current = normalized(problem);
  // V8 includes the current report in reasoningContext; do not count that adapter echo as a second turn.
  if (current && current !== values.at(-1)) values.push(current);
  let consecutive = 0;
  let unknownCount = 0;
  let cannotCheckCount = 0;
  const seen = new Set();
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    const repeated = seen.has(value);
    seen.add(value);
    if (UNKNOWN.test(value) || CANNOT_CHECK.test(value) || repeated) {
      consecutive += 1;
      if (UNKNOWN.test(value)) unknownCount += 1;
      if (CANNOT_CHECK.test(value)) cannotCheckCount += 1;
    }
    else break;
  }
  return immutable({
    consecutive,
    unknownCount,
    cannotCheckCount,
    reason: cannotCheckCount ? 'cannot_check' : unknownCount ? 'unknown' : consecutive ? 'repeated_answer' : null,
    detected: consecutive > 0,
    exhausted: consecutive >= 3,
    strategy: consecutive === 0 ? 'continue' : consecutive < 3 ? 'switch_evidence_axis' : 'stop_questions',
  });
}
