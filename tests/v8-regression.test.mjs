import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { __v861Test as v8 } from '../index.js';

const cases = JSON.parse(
  await readFile(new URL('./fixtures/v8-golden.json', import.meta.url), 'utf8'),
);

for (const fixture of cases) {
  test(`V8 golden safety: ${fixture.id}`, () => {
    const flags = v8.hardSafetyFlags(fixture.classification, '', fixture.problem);
    assert.deepEqual(flags, fixture.flags);
    assert.equal(v8.safetyDecision(flags).route, fixture.route);
  });
}

test('V8 classificatienormalisatie houdt gebruikerssymptoom leidend', () => {
  const result = v8.normalizeClassification(
    {
      objectFamily: 'appliance',
      objectLabel: 'Senseo',
      objectSubtype: '',
      intent: 'repair',
      symptomCandidate: 'leak',
      brand: 'Philips',
      model: '',
      errorCode: '',
      confidence: 'hoog',
      needsDetail: false,
      missingDetail: '',
    },
    '',
    'Mijn Senseo maakt geluid maar geeft geen koffie.',
  );

  assert.equal(result.objectFamily, 'appliance');
  assert.equal(result.symptom, 'no_flow');
  assert.equal(result.problemKind, 'no_flow');
});

test('V8 deterministische validator blokkeert reparatie vóór ontbrekende informatie', () => {
  const checked = v8.deterministicPlanValidation(
    {
      solutionTitle: 'Reparatie',
      summary: 'Er ontbreekt informatie.',
      firstAction: 'Demonteer het apparaat.',
      steps: ['Demonteer het apparaat.'],
      tools: [],
      materials: [],
      needMoreInfo: true,
      followUpQuestion: 'Wat is het exacte model van het apparaat?',
    },
    { objectFamily: 'appliance', symptom: 'not_working' },
    { route: null },
  );

  assert.equal(checked.valid, false);
  assert.ok(checked.issues.includes('repair_before_required_information'));
});

test('V8 researchbronclassificatie en trustscore zijn vastgelegd', () => {
  assert.equal(v8.researchSourceTypeV86('https://www.ifixit.com/Guide/example', ''), 'ifixit');
  assert.equal(v8.researchTrustScoreV86('ifixit'), 0.92);
  assert.equal(v8.researchSourceTypeV86('https://community.example.com/topic', ''), 'community');
});
