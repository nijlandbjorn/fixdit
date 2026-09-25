import { stableHash } from './contracts.js';
import { compareV8V9 } from './comparator.js';
import { runPipelineV9 } from './pipeline.js';
import { persistV9Run } from './persistence.js';
import { createWorkersAiCritic } from './workers-ai-adapter.js';
import { classificationFromV8, observationsFromV8, researchFromV8, techniqueFromV8 } from './v8-adapter.js';

export function resolveV9Mode(env, { tester = false } = {}) {
  const requested = String(env?.V9_MODE || 'off').toLocaleLowerCase();
  if (!['off', 'shadow', 'tester', 'canary'].includes(requested)) return 'off';
  if (requested === 'tester' && !tester) return 'off';
  return requested;
}

export function sampledForV9(key, percentage) {
  const bounded = Math.max(0, Math.min(100, Number(percentage) || 0));
  const bucket = parseInt(stableHash(key).slice(-4), 36) % 10000;
  return bucket < bounded * 100;
}

export async function runV9AlongsideV8({ env = {}, v8Diagnosis, problem = '', language = 'nl', mode = 'shadow' } = {}) {
  const analysisId = v8Diagnosis?.analysisId || '';
  const result = await runPipelineV9({
    analysisId,
    mode,
    language,
    problem,
    previousObservations: observationsFromV8(v8Diagnosis),
    classification: classificationFromV8(v8Diagnosis),
    technique: techniqueFromV8(v8Diagnosis),
    research: researchFromV8(v8Diagnosis),
    legacyDiagnosis: v8Diagnosis,
    critic: createWorkersAiCritic(env),
  });
  const comparison = compareV8V9(v8Diagnosis, result);
  const persistence = await persistV9Run(env, result, comparison);
  return { result, comparison, persistence };
}
