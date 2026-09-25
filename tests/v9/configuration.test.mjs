import assert from 'node:assert/strict';
import test from 'node:test';

import { validateV9Configuration } from '../../src/v9/configuration.js';

test('V9-configuratie is veilig uit zonder bindings', () => {
  const result = validateV9Configuration({});
  assert.equal(result.valid, true);
  assert.equal(result.mode, 'off');
  assert.deepEqual(result.errors, []);
});

test('ongeldige rolloutwaarden en ontbrekende opt-in bindings worden geblokkeerd', () => {
  const result = validateV9Configuration({
    V9_MODE: 'production',
    V9_SHADOW_SAMPLE_RATE: '101',
    V9_CANARY_PERCENT: '-1',
    V9_ALLOW_AI: 'true',
    V9_ALLOW_RESEARCH: 'true',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('invalid_v9_mode'));
  assert.ok(result.errors.includes('v9_ai_binding_missing'));
  assert.ok(result.errors.includes('v9_research_secret_missing'));
});
