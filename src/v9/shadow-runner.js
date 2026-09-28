import { stableHash } from './contracts.js';
import { compareV8V9 } from './comparator.js';
import { runPipelineV9 } from './pipeline.js';
import { persistV9Run } from './persistence.js';
import { createWorkersAiCritic, createWorkersAiReasoner } from './workers-ai-adapter.js';
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
  const priorAiAttempt = Boolean(
    v8Diagnosis?.aiFallbackReason &&
    v8Diagnosis.aiFallbackReason !== 'ai_call_suppressed_for_v9_primary'
  );
  const result = await runPipelineV9({
    analysisId,
    mode,
    language,
    problem,
    previousObservations: observationsFromV8(v8Diagnosis),
    classification: classificationFromV8(v8Diagnosis, { problem }),
    technique: techniqueFromV8(v8Diagnosis),
    research: researchFromV8(v8Diagnosis),
    legacyDiagnosis: v8Diagnosis,
    // A supplementary legacy failure is evidence about that call only. It must
    // never suppress the primary V9 consumer-response provider call.
    reasoner: createWorkersAiReasoner(env),
    aiUnavailableReason: '',
    priorAiAttempt,
    critic: createWorkersAiCritic(env),
  });
  const comparison = compareV8V9(v8Diagnosis, result);
  const persistence = await persistV9Run(env, result, comparison);
  if (!persistence.persisted && persistence.reason !== 'db_unavailable') {
    console.error('FixDit V9 persistence failed', {
      runId: result.runId,
      analysisId: result.analysisId,
      reason: persistence.reason,
      error: persistence.error || null,
    });
  }
  return { result, comparison, persistence };
}
