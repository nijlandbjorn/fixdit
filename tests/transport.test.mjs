import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../index.js';

test('GET health houdt het bestaande V8.6.1-contract', async () => {
  const request = new Request('https://worker.test/', {
    headers: { Origin: 'https://nijlandbjorn.github.io' },
  });
  const response = await worker.fetch(request, {});
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.version, '8.6.1');
  assert.equal(body.hardSafetyLayer, true);
  assert.equal(body.database, true);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://nijlandbjorn.github.io');
});

test('niet-toegestane origins worden geweigerd', async () => {
  const request = new Request('https://worker.test/', {
    headers: { Origin: 'https://example.invalid' },
  });
  const response = await worker.fetch(request, {});
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.ok, false);
  assert.equal(body.error, 'Origin not allowed');
});

test('OPTIONS behoudt het bestaande CORS-contract', async () => {
  const request = new Request('https://worker.test/', {
    method: 'OPTIONS',
    headers: { Origin: 'https://nijlandbjorn.github.io' },
  });
  const response = await worker.fetch(request, {});

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
});
