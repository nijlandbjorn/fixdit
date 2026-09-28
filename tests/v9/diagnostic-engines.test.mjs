import assert from 'node:assert/strict';
import test from 'node:test';

import { interactionMetadataV9 } from '../../index.js';
import { appendEvidence, createEvidenceLedger, ledgerFromInput, supersedeEvidence } from '../../src/v9/evidence-ledger.js';
import { detectContradictions } from '../../src/v9/contradiction-detector.js';
import { generateHypotheses } from '../../src/v9/hypothesis-engine.js';
import { rankNextBestTests, selectNextBestTest } from '../../src/v9/next-best-test.js';
import { detectNoProgress } from '../../src/v9/no-progress.js';
import { createDiagnosticState, transitionDiagnosticState } from '../../src/v9/state-machine.js';
import { observationsFromV8 } from '../../src/v9/v8-adapter.js';

test('API-interactiecontract bewaart unknown als betekenisvolle answerKind', () => {
  const interaction = interactionMetadataV9({ interaction: {
    answerKind: 'unknown', evidenceKey: 'failure_boundary', questionId: 'q_cycle',
    rawAnswer: 'Weet ik niet', semanticClaim: 'Het antwoord op de normale cyclus is nog onbekend.',
  } });
  assert.equal(interaction.answerKind, 'unknown');
  assert.equal(interaction.evidenceKey, 'failure_boundary');
});

test('Contradiction Detector vindt strijdige gestructureerde evidence', () => {
  const ledger = createEvidenceLedger({ entries: [
    { source: 'user_text', subject: 'reservoir', predicate: 'seated', value: 'yes', polarity: 'present', confidence: 1 },
    { source: 'vision_structured', subject: 'reservoir', predicate: 'seated', value: 'no', polarity: 'present', confidence: 0.9 },
  ] });
  const contradictions = detectContradictions(ledger);
  assert.equal(contradictions.length, 1);
  assert.equal(contradictions[0].severity, 'blocking');
  assert.deepEqual(contradictions[0].evidenceIds, ledger.entries.map(entry => entry.evidenceId));
});

test('supersession lost een evidencecontradictie auditbaar op', () => {
  let ledger = createEvidenceLedger({ entries: [
    { source: 'user_text', subject: 'lamp', predicate: 'state', value: 'aan', polarity: 'present', confidence: 1 },
  ] });
  ledger = appendEvidence(ledger, [{ source: 'user_text', subject: 'lamp', predicate: 'state', value: 'uit', polarity: 'present', confidence: 1 }]);
  assert.equal(detectContradictions(ledger).length, 1);
  ledger = supersedeEvidence(ledger, ledger.entries[0].evidenceId, {
    source: 'user_text', subject: 'lamp', predicate: 'state', value: 'uit', polarity: 'present', confidence: 1,
  });
  assert.equal(detectContradictions(ledger).length, 0);
});

test('per exclusieve evidence-as blijft maximaal één userwaarde actief', () => {
  const kinds = [['yes', 'no'], ['no', 'yes'], ['unknown', 'yes'], ['cannot_check', 'no'], ['short_text', 'short_text']];
  for (const [from, to] of kinds) {
    const ledger = ledgerFromInput({
      previousObservations: [
        { text: 'eerste', semanticClaim: `eerste ${from}`, evidenceKey: 'display_state', questionId: 'q_display', answerKind: from, rawAnswer: from },
        { text: 'tweede', semanticClaim: `tweede ${to}`, evidenceKey: 'display_state', questionId: 'q_display', answerKind: to, rawAnswer: to, correction: true },
      ],
    });
    const axis = ledger.entries.filter(entry => entry.provenance?.evidenceKey === 'display_state');
    assert.equal(axis.filter(entry => entry.status === 'active').length, 1, `${from} -> ${to}`);
    assert.equal(axis.at(-1).provenance.answerKind, to);
    assert.equal(axis[0].status, 'superseded');
  }
});

test('gestructureerde correctie wordt niet opnieuw door legacy tekstparsing gesupersedet', () => {
  const rawCorrection = 'Ik corrigeer mijn vorige antwoord van “De kraan staat open: ja.” naar “De kraan staat open: nee.”.';
  const ledger = ledgerFromInput({
    problem: rawCorrection,
    previousObservations: [
      { text: 'Ja', semanticClaim: 'De kraan staat open: ja.', evidenceKey: 'water_supply', questionId: 'q_water', answerKind: 'yes', rawAnswer: 'Ja' },
      { text: rawCorrection, rawText: rawCorrection, semanticClaim: 'De kraan staat open: nee.', evidenceKey: 'water_supply', questionId: 'q_water', answerKind: 'no', rawAnswer: 'Nee', correction: true },
    ],
  });
  const axis = ledger.entries.filter(entry => entry.provenance?.evidenceKey === 'water_supply');
  assert.equal(axis.length, 2);
  assert.equal(axis[0].status, 'superseded');
  assert.equal(axis[1].status, 'active');
  assert.equal(axis[1].provenance.answerKind, 'no');
  assert.equal(ledger.entries.filter(entry => entry.source === 'user_text').length, 0);
});

test('V9-interactiehistorie behoudt machinevelden onafhankelijk van legacy reasoningContext', () => {
  const observations = observationsFromV8({
    reasoningContext: { observations: [
      { text: 'Mijn vaatwasser krijgt geen water', answerTo: '' },
      { text: 'Het antwoord is nog onbekend.', answerTo: 'Staat de kraan open?' },
    ] },
    v9Interactions: [
      { text: 'Het antwoord is nog onbekend.', semanticClaim: 'Het antwoord is nog onbekend.', evidenceKey: 'water_supply', questionId: 'q_water', answerKind: 'unknown', rawAnswer: 'Weet ik niet' },
      { text: 'Ik corrigeer dit naar ja.', semanticClaim: 'De kraan staat open.', evidenceKey: 'water_supply', questionId: 'q_water', answerKind: 'yes', rawAnswer: 'Ja', correction: true },
    ],
  });
  assert.equal(observations.filter(item => item.evidenceKey === 'water_supply').length, 2);
  assert.deepEqual(observations.filter(item => item.evidenceKey === 'water_supply').map(item => item.answerKind), ['unknown', 'yes']);
});

test('correctiereconciliatie koppelt een legacy onbekend-antwoord terug aan de gecorrigeerde as', () => {
  const correctionText = 'Ik corrigeer mijn vorige antwoord naar ja.';
  const ledger = ledgerFromInput({
    problem: correctionText,
    previousObservations: [
      { text: 'Mijn vaatwasser krijgt geen water' },
      { text: 'Het antwoord op “Staat de kraan open” is nog onbekend.' },
      { text: correctionText, rawText: correctionText, semanticClaim: 'De kraan staat open.', evidenceKey: 'water_supply', questionId: 'q_water', answerKind: 'yes', rawAnswer: 'Ja', correction: true },
    ],
  });
  const axis = ledger.entries.filter(entry => entry.provenance?.evidenceKey === 'water_supply');
  assert.deepEqual(axis.map(entry => [entry.provenance.answerKind, entry.status]), [['unknown', 'superseded'], ['yes', 'active']]);
});

test('machineleesbaar cannot_check stuurt no-progress en sluit dezelfde evidence-as uit', () => {
  const observations = [{
    text: 'Kan ik niet controleren', semanticClaim: 'Een extern scherm kan nu niet worden gecontroleerd.',
    evidenceKey: 'external_display', questionId: 'q_external', answerKind: 'cannot_check', rawAnswer: 'Kan ik niet controleren',
  }];
  const noProgress = detectNoProgress(observations, 'Een extern scherm kan nu niet worden gecontroleerd.');
  assert.equal(noProgress.reason, 'cannot_check');
  const selected = selectNextBestTest({ hypotheses: [{ hypothesisId: 'hy-1', code: 'backlight', statement: 'Test.', missingEvidence: ['external_display', 'observable_behavior'] }] }, { previousObservations: observations, axisOffset: 1 });
  assert.notEqual(selected?.evidenceKey, 'external_display');
});

test('Hypothesis Engine levert gerangschikte, begrensde hypotheses', () => {
  const ledger = ledgerFromInput({ problem: 'Mijn koffiezetapparaat geeft geen water.' });
  const hypotheses = generateHypotheses({ ledger, classification: { symptom: 'no_flow' } });
  assert.ok(hypotheses.length >= 2);
  assert.equal(hypotheses[0].code, 'supply_not_seated');
  assert.ok(hypotheses.every(item => item.score >= 0 && item.score <= 1));
  assert.ok(hypotheses.every(item => Object.isFrozen(item)));
});

test('modelhypothese kan geen niet-bestaande evidence-ID claimen', () => {
  const ledger = ledgerFromInput({ problem: 'Apparaat werkt niet.' });
  const hypotheses = generateHypotheses({
    ledger,
    classification: { symptom: 'not_working' },
    modelProposals: [{
      code: 'invented', statement: 'Een voorstel.', score: 0.9,
      supportingEvidenceIds: ['missing-id'], missingEvidence: ['observable_behavior'],
    }],
  });
  const proposal = hypotheses.find(item => item.code === 'invented');
  assert.deepEqual(proposal.supportingEvidenceIds, []);
  assert.equal(ledger.entries.some(entry => entry.source === 'model_hypothesis'), false);
  assert.equal(ledger.entries.length, 1);
});

test('Next-Best-Test geeft blocking contradictie voorrang', () => {
  const contradiction = {
    contradictionId: 'cx-1', subject: 'reservoir', predicate: 'seated', severity: 'blocking', resolved: false,
  };
  const hypothesis = {
    hypothesisId: 'hy-1', code: 'supply', statement: 'Toevoer ontbreekt.', score: 0.4, missingEvidence: ['water_supply'],
  };
  const tests = rankNextBestTests({ hypotheses: [hypothesis], contradictions: [contradiction], language: 'nl' });
  assert.equal(tests[0].resolvesContradictionIds[0], 'cx-1');
  assert.equal(selectNextBestTest({ hypotheses: [hypothesis], contradictions: [contradiction] }).safetyClass, 'observation_only');
});

test('visueel ontbrekend feit produceert gericht en veilig fotoverzoek', () => {
  const [next] = rankNextBestTests({
    hypotheses: [{
      hypothesisId: 'hy-1', code: 'leak', statement: 'Lokaliseer de lekkage.', score: 0.45, missingEvidence: ['leak_location'],
    }],
    language: 'en',
    capabilities: { photoInput: true, cameraCapture: true, fileUpload: true },
  });
  assert.equal(next.kind, 'photo');
  assert.ok(next.photoSpec.requiredVisible.includes('where the moisture first appears'));
  assert.match(next.prompt, /^Take one sharp photo of /);
  assert.match(next.photoSpec.avoid[0], /Do not open/);
});

test('visuele evidence krijgt zonder volledige fotocapability een uitvoerbare observatievraag', () => {
  const [next] = rankNextBestTests({
    hypotheses: [{ hypothesisId: 'hy-leak', code: 'leak', statement: 'Lokaliseer de lekkage.', score: 0.45, missingEvidence: ['leak_location'] }],
    language: 'nl',
    capabilities: { photoInput: false, cameraCapture: false, fileUpload: false },
  });
  assert.equal(next.kind, 'question');
  assert.equal(next.questionType, 'short_text');
  assert.equal(next.photoSpec, null);
  assert.match(next.prompt, /Op welke plek verschijnt het vocht als eerste/);
});

test('Next-Best-Test vertaalt interne evidence-doelen naar natuurlijke NL/EN/DE-vragen', () => {
  const cases = [
    ['maintenance_history', 'nl', /Wanneer is het apparaat voor het laatst gereinigd of ontkalkt/],
    ['observable_behavior', 'en', /What did you observe during the last use/],
    ['failure_boundary', 'de', /Beginnt das Gerät beim Start mit dem normalen Ablauf/],
  ];
  for (const [fact, language, expected] of cases) {
    const [next] = rankNextBestTests({
      hypotheses: [{
        hypothesisId: `hy-${fact}`,
        code: 'test',
        statement: 'Testhypothese.',
        score: 0.4,
        missingEvidence: [fact],
      }],
      language,
    });
    assert.match(next.prompt, expected);
    assert.doesNotMatch(next.prompt, /maintenance history|observable behavior|failure boundary|_/i);
  }
});

test('onbekend intern evidence-label lekt niet naar de gebruiker', () => {
  const [next] = rankNextBestTests({
    hypotheses: [{
      hypothesisId: 'hy-unknown-fact',
      code: 'test',
      statement: 'Testhypothese.',
      score: 0.4,
      missingEvidence: ['internal_future_label'],
    }],
    language: 'nl',
  });
  assert.equal(next.prompt, 'Welke concrete waarneming kan dit bevestigen of uitsluiten?');
  assert.doesNotMatch(next.prompt, /internal|future|label|_/i);
});

test('Next-Best-Test identiteiten zijn per V9-run uniek', () => {
  const input = runId => rankNextBestTests({
    hypotheses: [{
      hypothesisId: `hy-${runId}`,
      code: 'scale_or_airlock',
      statement: 'Kalkaanslag of lucht belemmert de doorstroming.',
      score: 0.38,
      missingEvidence: ['maintenance_history'],
    }],
    language: 'nl',
  })[0];
  assert.notEqual(input('run-one').testId, input('run-two').testId);
});

test('interactieve state gebruikt optimistic revision checks', () => {
  let state = createDiagnosticState({ analysisId: 'analysis-1', runId: 'run-1' });
  state = transitionDiagnosticState(state, { type: 'select_test', testId: 'test-1', hypothesisId: 'hy-1', expectedRevision: 1 });
  assert.equal(state.phase, 'testing');
  assert.equal(state.revision, 2);
  assert.throws(
    () => transitionDiagnosticState(state, { type: 'complete_test', testId: 'test-1', expectedRevision: 1 }),
    /STATE_REVISION_CONFLICT/,
  );
  state = transitionDiagnosticState(state, { type: 'complete_test', testId: 'test-1', expectedRevision: 2 });
  assert.equal(state.phase, 'collecting_evidence');
  assert.deepEqual(state.completedTestIds, ['test-1']);
});
