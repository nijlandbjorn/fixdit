import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import worker from '../../index.js';
import {
  createTesterUiActions,
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
  assert.match(html, /Wat is er aan de hand met je apparaat\?/);
  assert.match(html, /Beschrijving/);
  assert.match(html, /Vervolgvragen/);
  assert.match(html, /Diagnose/);
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
  assert.match(html, /consumer_response/);
  assert.match(html, /photoInput:false,cameraCapture:false,fileUpload:false/);
  assert.match(html, /answerKind:optionId/);
  assert.match(html, /evidenceKey:activeQuestion\.evidenceKey/);
  assert.match(html, /semanticClaim:claim/);
  assert.match(html, /data-testid="start-diagnosis"/);
  assert.match(html, /id="diagnosis-photo-input" data-testid="diagnosis-photo-input" type="file"[^>]*hidden/);
  assert.match(html, /id="add-photo" data-testid="add-photo" type="button">Foto toevoegen/);
  assert.match(html, /data-testid="submit-answer"/);
  assert.match(html, /button\.dataset\.testid='answer-option-'\+option\.id/);
  assert.match(html, /id="start-diagnosis" data-testid="start-diagnosis" type="submit"/);
  assert.match(html, /el\('diagnosis-form'\)\.addEventListener\('submit',testerUiActions\.submitDiagnosis\)/);
  assert.match(html, /openPhotoPicker:\(\)=>el\('diagnosis-photo-input'\)\.click\(\)/);
  assert.match(html, /el\('diagnosis-photo-input'\)\.addEventListener\('change'/);
  assert.match(html, /button\.addEventListener\('click',\(\)=>selectSemanticAnswer\(option\.id\)\)/);
  assert.doesNotMatch(html, /ondersteuningsscore/);
});

test('diagnose-submit en foto-picker zijn strikt gescheiden UI-acties', () => {
  let diagnoses = 0;
  let photoClicks = 0;
  let prevented = 0;
  const actions = createTesterUiActions({
    submitDiagnosis: () => { diagnoses += 1; },
    openPhotoPicker: () => { photoClicks += 1; },
  });

  actions.submitDiagnosis({ preventDefault: () => { prevented += 1; } });
  assert.deepEqual({ diagnoses, photoClicks, prevented }, { diagnoses: 1, photoClicks: 0, prevented: 1 });

  diagnoses = 0; photoClicks = 0; prevented = 0;
  actions.addPhoto({ preventDefault: () => { prevented += 1; } });
  assert.deepEqual({ diagnoses, photoClicks, prevented }, { diagnoses: 0, photoClicks: 1, prevented: 1 });
});

test('form-submit via Enter start diagnose zonder file picker', () => {
  let diagnoses = 0;
  let photoClicks = 0;
  const actions = createTesterUiActions({
    submitDiagnosis: () => { diagnoses += 1; },
    openPhotoPicker: () => { photoClicks += 1; },
  });
  actions.submitDiagnosis({ type: 'submit', preventDefault() {} });
  assert.equal(diagnoses, 1);
  assert.equal(photoClicks, 0);
});

test('inline tester-script is syntactisch geldig', () => {
  const html = renderV9TesterHtml();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  assert.ok(scripts.length >= 1);
  scripts.forEach((script, index) => {
    assert.doesNotThrow(() => new vm.Script(script, { filename: `v9-tester-inline-${index + 1}.js` }));
  });
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
