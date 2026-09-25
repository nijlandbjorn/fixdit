import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeEvidence,
  appendEvidence,
  createEvidenceLedger,
  ledgerFromInput,
  supersedeEvidence,
} from '../../src/v9/evidence-ledger.js';
import { evaluateSafety, safetyFlagCodes } from '../../src/v9/safety-kernel.js';
import { normalizeVisionEvidence } from '../../src/v9/vision-evidence.js';

test('Evidence Ledger is immutable and append-only', () => {
  const first = ledgerFromInput({ runId: 'run-1', problem: 'De machine lekt.' });
  const second = appendEvidence(first, [{
    source: 'user_text',
    subject: 'machine',
    predicate: 'power',
    value: 'uitgeschakeld',
    polarity: 'present',
    confidence: 1,
  }]);

  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.entries), true);
  assert.equal(first.entries.length, 1);
  assert.equal(second.entries.length, 2);
  assert.equal(first.revision, 1);
});

test('superseded evidence blijft auditbaar maar is niet actief', () => {
  const ledger = createEvidenceLedger({ entries: [{
    source: 'user_text', subject: 'lamp', predicate: 'state', value: 'aan', polarity: 'present', confidence: 1,
  }] });
  const updated = supersedeEvidence(ledger, ledger.entries[0].evidenceId, {
    source: 'user_text', subject: 'lamp', predicate: 'state', value: 'uit', polarity: 'present', confidence: 1,
  });
  assert.equal(updated.entries.length, 2);
  assert.equal(updated.entries[0].status, 'superseded');
  assert.equal(activeEvidence(updated).length, 1);
});

test('gestructureerde vision-evidence verwerpt lege en zeer zwakke claims', () => {
  const entries = normalizeVisionEvidence({ observations: [
    { subject: 'slang', predicate: 'vocht', value: 'druppels', polarity: 'present', confidence: 0.92, region: 'links', readableText: '' },
    { subject: '', predicate: 'scheur', value: 'mogelijk', polarity: 'unknown', confidence: 0.9, region: '', readableText: '' },
    { subject: 'kast', predicate: 'rook', value: 'mogelijk', polarity: 'present', confidence: 0.2, region: '', readableText: '' },
  ] }, { imageRef: 'sha256:test' });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].source, 'vision_structured');
  assert.equal(entries[0].provenance.imageRef, 'sha256:test');
});

test('Safety Kernel stopt deterministisch bij expliciete gasmelding', () => {
  const ledger = ledgerFromInput({ problem: 'Ik ruik gas bij de ketel.' });
  const one = evaluateSafety(ledger);
  const two = evaluateSafety(ledger);
  assert.deepEqual(one, two);
  assert.equal(one.route, 'stop');
  assert.deepEqual(safetyFlagCodes(one), ['gas']);
});

test('Safety Kernel behandelt expliciete negatie niet als hazard', () => {
  const ledger = ledgerFromInput({ problem: 'Er is geen rook, geen brandlucht en ik ruik geen gas.' });
  const decision = evaluateSafety(ledger);
  assert.equal(decision.route, null);
  assert.deepEqual(safetyFlagCodes(decision), []);
});

test('Safety Kernel negeert onbetrouwbare modelhypotheses', () => {
  const ledger = createEvidenceLedger({ entries: [{
    source: 'model_hypothesis', subject: 'apparaat', predicate: 'raw_text', value: 'gas leak and smoke', polarity: 'present', confidence: 0.99,
  }] });
  assert.equal(evaluateSafety(ledger).route, null);
});

test('Safety Kernel routeert genormaliseerde voertuigremmen professioneel', () => {
  const ledger = ledgerFromInput({
    problem: 'Mijn auto remt slecht.',
    classification: { objectFamily: 'automotive', symptom: 'braking_fault' },
  });
  const decision = evaluateSafety(ledger);
  assert.equal(decision.route, 'professional');
  assert.deepEqual(safetyFlagCodes(decision), ['vehicle_brakes']);
});
