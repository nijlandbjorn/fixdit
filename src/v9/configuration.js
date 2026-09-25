const MODES = new Set(['off', 'shadow', 'tester', 'canary']);

function percentage(value, fallback = 0) {
  const number = value === undefined || value === '' ? fallback : Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

export function validateV9Configuration(env = {}) {
  const errors = [];
  const warnings = [];
  const mode = String(env.V9_MODE || 'off').toLocaleLowerCase();
  const shadowSampleRate = percentage(env.V9_SHADOW_SAMPLE_RATE);
  const canaryPercent = percentage(env.V9_CANARY_PERCENT);

  if (!MODES.has(mode)) errors.push('invalid_v9_mode');
  if (shadowSampleRate === null) errors.push('invalid_shadow_sample_rate');
  if (canaryPercent === null) errors.push('invalid_canary_percent');
  if (mode !== 'off' && !env.DB) warnings.push('v9_persistence_unavailable');
  if (String(env.V9_ALLOW_AI || '').toLocaleLowerCase() === 'true' && typeof env.AI?.run !== 'function') {
    errors.push('v9_ai_binding_missing');
  }
  if (String(env.V9_ALLOW_RESEARCH || '').toLocaleLowerCase() === 'true' && !env.BRAVE_SEARCH_API_KEY) {
    errors.push('v9_research_secret_missing');
  }

  return Object.freeze({
    valid: errors.length === 0,
    mode: MODES.has(mode) ? mode : 'off',
    shadowSampleRate: shadowSampleRate ?? 0,
    canaryPercent: canaryPercent ?? 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
  });
}
