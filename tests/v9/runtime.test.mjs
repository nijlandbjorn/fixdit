import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateV9Runtime } from '../../src/v9/runtime.js';

const diagnosis = {
  analysisId: 'runtime-1',
  objectFamily: 'furniture',
  objectLabel: 'Handgreep',
  symptom: 'loose',
  problemKind: 'loose',
  intent: 'repair',
  route: 'more_info',
  risk: 'laag',
  safeSteps: [],
  completionChecks: [],
  repairEngine: { repairability: { status: 'DIY_AFTER_DETAILS' }, research: { sources: [] } },
};

test('runtime laat de V8-response objectidentiek wanneer V9 uit staat', async () => {
  const outcome = await evaluateV9Runtime({ env: {}, v8Diagnosis: diagnosis, problem: 'De handgreep zit los.' });
  assert.equal(outcome.mode, 'off');
  assert.equal(outcome.responseDiagnosis, diagnosis);
  assert.equal(outcome.scheduled, false);
});

test('shadow plant achtergrondwerk maar verandert de V8-response niet', async () => {
  const pending = [];
  const outcome = await evaluateV9Runtime({
    env: { V9_MODE: 'shadow', V9_SHADOW_SAMPLE_RATE: '100' },
    ctx: { waitUntil(promise) { pending.push(promise); } },
    v8Diagnosis: diagnosis,
    problem: 'De handgreep zit los.',
  });
  assert.equal(outcome.scheduled, true);
  assert.equal(outcome.responseDiagnosis, diagnosis);
  assert.equal(pending.length, 1);
  await Promise.all(pending);
});

test('persistencefout in shadow verandert de V8-response niet', async t => {
  t.mock.method(console, 'error', () => {});
  const pending = [];
  const failingDB = {
    prepare(sql) {
      return {
        sql,
        bind() { return this; },
        async run() { throw new Error('mock persistence failure'); },
      };
    },
    async batch() { throw new Error('mock persistence failure'); },
  };
  const outcome = await evaluateV9Runtime({
    env: { V9_MODE: 'shadow', V9_SHADOW_SAMPLE_RATE: '100', DB: failingDB },
    ctx: { waitUntil(promise) { pending.push(promise); } },
    v8Diagnosis: diagnosis,
    problem: 'De handgreep zit los.',
  });
  assert.equal(outcome.scheduled, true);
  assert.equal(outcome.responseDiagnosis, diagnosis);
  await Promise.all(pending);
  assert.equal(outcome.responseDiagnosis, diagnosis);
});

test('tester krijgt optionele V9-metadata zonder V8-velden te vervangen', async () => {
  const outcome = await evaluateV9Runtime({
    env: { V9_MODE: 'tester' },
    tester: true,
    v8Diagnosis: diagnosis,
    problem: 'De handgreep zit los.',
  });
  assert.equal(outcome.responseDiagnosis.route, diagnosis.route);
  assert.equal(outcome.responseDiagnosis.objectLabel, diagnosis.objectLabel);
  assert.equal(outcome.responseDiagnosis.diagnosticV9.engineVersion, '9.0.0-local');
});
