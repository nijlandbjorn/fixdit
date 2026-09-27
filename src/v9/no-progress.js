import { asArray, cleanText, immutable } from './contracts.js';

const UNKNOWN = /^(weet ik niet|geen idee|kan ik niet zien|onbekend|i don(?:'|’)t know|no idea|cannot see|ich wei(?:ss|ß) nicht|keine ahnung)$/i;

function normalized(value) {
  return cleanText(value, 600).toLocaleLowerCase().replace(/[.!?]+$/g, '').trim();
}

export function detectNoProgress(previousObservations = [], problem = '') {
  const values = [...asArray(previousObservations).map(item => item?.text ?? item), problem]
    .map(normalized).filter(Boolean);
  let consecutive = 0;
  const seen = new Set();
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    const repeated = seen.has(value);
    seen.add(value);
    if (UNKNOWN.test(value) || repeated) consecutive += 1;
    else break;
  }
  return immutable({
    consecutive,
    detected: consecutive > 0,
    exhausted: consecutive >= 3,
    strategy: consecutive === 0 ? 'continue' : consecutive < 3 ? 'switch_evidence_axis' : 'stop_questions',
  });
}
