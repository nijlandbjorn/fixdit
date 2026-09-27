import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateV9Runtime } from '../../src/v9/runtime.js';
import { createRecordingD1 } from '../helpers/mock-cloudflare.mjs';

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

test('expliciete Preview-testerrequest forceert synchrone V9-output zonder shadowrespons te wijzigen', async () => {
  const db = createRecordingD1();
  const v8Diagnosis = { analysisId: 'tester-preview', route: 'more_info', objectFamily: 'appliance', symptom: 'no_flow' };
  const outcome = await evaluateV9Runtime({
    env: { V9_MODE: 'shadow', V9_SHADOW_SAMPLE_RATE: '100', DB: db },
    tester: true,
    requestedMode: 'tester',
    v8Diagnosis,
    problem: 'Mijn koffiezetapparaat geeft geen koffie.',
  });
  assert.equal(outcome.mode, 'tester');
  assert.equal(outcome.scheduled, false);
  assert.equal(outcome.responseDiagnosis.route, v8Diagnosis.route);
  assert.equal(outcome.responseDiagnosis.diagnosticV9.mode, 'tester');
  assert.ok(outcome.responseDiagnosis.diagnosticV9.ledger.entries.length > 0);
  assert.equal(outcome.responseDiagnosis.diagnosticV9.persistence.persisted, true);
  assert.ok(outcome.responseDiagnosis.diagnosticV9.comparison);
});
