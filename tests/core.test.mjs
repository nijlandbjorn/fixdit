import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import worker from '../index.js';

const ROOT = new URL('../', import.meta.url);

test('V8.6.1 Worker blijft de standaardexport', () => {
  assert.equal(typeof worker, 'object');
  assert.equal(typeof worker.fetch, 'function');
});

test('V8.6.1 kernfuncties en rollback-identiteit blijven aanwezig', async () => {
  const source = await readFile(new URL('index.js', ROOT), 'utf8');
  for (const marker of [
    'async function runPipeline(',
    'function hardSafetyFlags(',
    'function safetyDecision(',
    'async function finalizeV861(',
    'version:"8.6.1"',
  ]) {
    assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('package gebruikt uitsluitend de ingebouwde Node test runner', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', ROOT), 'utf8'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'module');
  assert.match(pkg.scripts.test, /^node --test /);
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});
