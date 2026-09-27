import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import worker from '../../index.js';
import {
  isTesterApiPath,
  isTesterPath,
  renderV9TesterHtml,
  testerModeEnabled,
} from '../../src/v9/tester-ui.js';

test('Tester Mode is standaard uit en alleen aan via de expliciete Preview-gate', () => {
  assert.equal(testerModeEnabled({}), false);
  assert.equal(testerModeEnabled({ V9_TESTER_ENABLED: 'false' }), false);
  assert.equal(testerModeEnabled({ V9_TESTER_ENABLED: 'true' }), true);
  assert.equal(isTesterPath('/v9-tester'), true);
  assert.equal(isTesterApiPath('/v9-tester/api'), true);
  assert.equal(isTesterPath('/'), false);
});

test('Tester-route bestaat niet zonder gate en rendert alleen met Preview-gate', async () => {
  const hidden = await worker.fetch(new Request('https://worker.test/v9-tester'), {});
  assert.equal(hidden.status, 404);
  assert.equal(hidden.headers.get('content-type'), 'application/json; charset=UTF-8');

  const visible = await worker.fetch(new Request('https://worker.test/v9-tester'), {
    V9_TESTER_ENABLED: 'true',
  });
  assert.equal(visible.status, 200);
  assert.match(visible.headers.get('content-type'), /^text\/html/);
  assert.match(await visible.text(), /V9 TESTER · PREVIEW/);
});

test('mobile-first tester-UI bevat safety-, evidence-, next-test- en Repair-Gate-grenzen', () => {
  const html = renderV9TesterHtml();
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /Iets kapot\? <span>Eerst FixDit\.<\/span>/);
  assert.match(html, /Wat we weten/);
  assert.match(html, /Mogelijke oorzaken/);
  assert.match(html, /Beste volgende controle/);
  assert.match(html, /Nog niet genoeg zekerheid om veilig reparatieadvies te geven/);
  assert.match(html, /gate\.open===true&&v9\.critic\?\.approved===true&&!stopped/);
  assert.match(html, /if\(route==='stop'\)/);
  assert.match(html, /\['user_text','previous_user_text','vision_structured'\]/);
  assert.match(html, /data-answer="Ja"/);
  assert.match(html, /data-answer="Nee"/);
  assert.match(html, /data-answer="Weet ik niet"/);
  assert.match(html, /Technisch tester-paneel/);
});

test('inline tester-script is syntactisch geldig', () => {
  const html = renderV9TesterHtml();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(scripts[0], { filename: 'v9-tester-inline.js' }));
});

test('normale GET-health blijft buiten Tester Mode identiek beschikbaar', async () => {
  const response = await worker.fetch(new Request('https://worker.test/'), {
    V9_TESTER_ENABLED: 'true',
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.version, '8.6.1');
  assert.equal(body.diagnosticV9.defaultMode, 'off');
});
