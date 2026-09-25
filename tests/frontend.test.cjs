const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('alle inline frontendscripts zijn syntactisch geldig', () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(Boolean);

  assert.ok(scripts.length > 0);
  scripts.forEach((source, index) => {
    assert.doesNotThrow(() => new vm.Script(source, { filename: `index-inline-${index}.js` }));
  });
});

test('frontend behoudt het bestaande Worker requestcontract', () => {
  assert.match(html, /const API_URL='https:\/\/fixdit-ai\.nijlandbjorn\.workers\.dev'/);
  assert.match(html, /action:'followup'/);
  assert.match(html, /action:'feedback'/);
  assert.match(html, /action:'status'/);
  assert.match(html, /requestId:pending\.id/);
  assert.match(html, /deviceId,language:currentLang/);
});

test('actieve compatibiliteits- en UI-scripts blijven gekoppeld', () => {
  for (const file of [
    'v8-compat.js',
    'fixdit-result-v19.js',
    'fixdit-immediate-ui-v1.js',
    'fixdit-repair-engine-v86-ui.js',
    'fixdit-youtube-addon-v4.js',
  ]) {
    assert.match(html, new RegExp(`<script src="${file.replace('.', '\\.')}[^>]*><\\/script>`));
    assert.equal(fs.existsSync(path.join(root, file)), true);
  }
});

test('privacytekst beschrijft fotoverzending en geen permanente foto-opslag', () => {
  const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
  assert.match(privacy, /verzendt de JPEG naar de Cloudflare Worker/);
  assert.match(privacy, /slaat de foto zelf niet permanent op/);
  assert.match(privacy, /Afgeleide gegevens[\s\S]*D1-database/);
});
