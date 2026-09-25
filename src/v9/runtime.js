import { attachV9Metadata } from './v8-adapter.js';
import { validateV9Configuration } from './configuration.js';
import { resolveV9Mode, runV9AlongsideV8, sampledForV9 } from './shadow-runner.js';

function configuredPercentage(env, mode) {
  if (mode === 'shadow') return Number(env?.V9_SHADOW_SAMPLE_RATE || 0);
  if (mode === 'canary') return Number(env?.V9_CANARY_PERCENT || 0);
  return 100;
}

export async function evaluateV9Runtime({
  env = {},
  ctx = null,
  tester = false,
  v8Diagnosis,
  problem = '',
  language = 'nl',
} = {}) {
  const configuration = validateV9Configuration(env);
  if (!configuration.valid) {
    return {
      mode: 'off',
      scheduled: false,
      responseDiagnosis: v8Diagnosis,
      result: null,
      comparison: null,
      error: `configuration_invalid:${configuration.errors.join(',')}`,
    };
  }
  const mode = resolveV9Mode(env, { tester });
  const unchanged = {
    mode,
    scheduled: false,
    responseDiagnosis: v8Diagnosis,
    result: null,
    comparison: null,
    error: null,
  };
  if (mode === 'off') return unchanged;

  const key = v8Diagnosis?.analysisId || problem || 'anonymous';
  if (!sampledForV9(key, configuredPercentage(env, mode))) return unchanged;

  const execute = async () => runV9AlongsideV8({
    env,
    v8Diagnosis,
    problem,
    language,
    mode,
  });

  if (mode === 'tester') {
    try {
      const outcome = await execute();
      return {
        mode,
        scheduled: false,
        responseDiagnosis: attachV9Metadata(v8Diagnosis, outcome.result),
        ...outcome,
        error: null,
      };
    } catch (error) {
      return { ...unchanged, error: String(error?.message || error) };
    }
  }

  if (typeof ctx?.waitUntil !== 'function') {
    return { ...unchanged, error: 'execution_context_unavailable' };
  }

  const background = execute().catch(error => {
    console.error('FixDit V9 background evaluation failed', error);
  });
  ctx.waitUntil(background);
  return { ...unchanged, scheduled: true };
}
