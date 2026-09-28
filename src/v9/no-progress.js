import { asArray, cleanText, immutable } from './contracts.js';

const UNKNOWN = /^(?:weet ik niet|geen idee|onbekend|i don(?:'|’)t know|no idea|ich wei(?:ss|ß) nicht|keine ahnung|het antwoord op .+ is nog onbekend|the answer to .+ is not known yet|die antwort auf .+ ist noch unbekannt)$/i;
const CANNOT_CHECK = /^(kan ik niet (?:controleren|zien|testen|nakijken)|dat kan ik niet controleren|cannot (?:check|see|test)|i can(?:not|'t) check|kann ich nicht (?:prüfen|sehen|testen))$/i;

function normalized(value) {
  return cleanText(value, 600).toLocaleLowerCase().replace(/[.!?]+$/g, '').trim();
}

export function detectNoProgress(previousObservations = [], problem = '') {
  const observations = asArray(previousObservations);
  const values = observations.map(item => item?.semanticClaim || (item?.text ?? item)).map(normalized).filter(Boolean);
  const kinds = observations.map(item => cleanText(item?.answerKind, 80));
  const current = normalized(problem);
  // V8 includes the current report in reasoningContext; do not count that adapter echo as a second turn.
  if (current && current !== values.at(-1)) values.push(current);
  let consecutive = 0;
  let unknownCount = 0;
  let cannotCheckCount = 0;
  const seen = new Set();
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    const kind = kinds[index] || '';
    const repeated = seen.has(value);
    seen.add(value);
    if (kind === 'unknown' || kind === 'cannot_check' || UNKNOWN.test(value) || CANNOT_CHECK.test(value) || repeated) {
      consecutive += 1;
      if (kind === 'unknown' || UNKNOWN.test(value)) unknownCount += 1;
      if (kind === 'cannot_check' || CANNOT_CHECK.test(value)) cannotCheckCount += 1;
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
