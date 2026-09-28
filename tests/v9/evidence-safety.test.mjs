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

test('Safety Kernel begrenst negatie bij opsommingen, contrast en nieuwe clauses', () => {
  const cases = [
    ['geen rook', null],
    ['rook', 'stop'],
    ['Er is geen zichtbare schade, rook of hitte.', null],
    ['Er zijn geen rook, vonken of brandlucht.', null],
    ['Er is geen rook, maar wel brandlucht.', 'stop'],
    ['Er is geen rook of vonken, maar er zijn wel vlammen.', 'stop'],
    ['Er is geen koffie, er komt rook uit.', 'stop'],
    ['Ik ruik geen gas.', null],
    ['Ik ruik gas.', 'stop'],
    ['De cv-ketel start niet en ik ruik gaslucht.', 'stop'],
    ['Ik weet niet of ik gas ruik.', 'stop'],
    ['I do not know whether I smell gas.', 'stop'],
    ['Ich weiß nicht, ob ich Gas rieche.', 'stop'],
    ['Ik ruik geen gas, maar mijn partner wel.', 'stop'],
    ['Gisteren was er rook, nu niet.', 'stop'],
    ['No visible damage, smoke or heat.', null],
    ['No smoke, but there are flames.', 'stop'],
    ['Kein sichtbarer Schaden, Rauch oder Brandgeruch.', null],
    ['Kein Rauch, aber es gibt Flammen.', 'stop'],
    ['Er is geen lekkage, maar er ligt wel water bij de stekker.', 'stop'],
    ['Er staat water naast het apparaat maar niet bij de stekker of het stopcontact.', null],
    ['Er is geen opgezwollen batterij, maar de batterij wordt extreem heet.', 'stop'],
  ];
  for (const [problem, route] of cases) {
    const decision = evaluateSafety(ledgerFromInput({ problem }));
    assert.equal(decision.route, route, problem);
  }
});

test('Safety Kernel herkent echte en onzekere gasmelding met natuurlijke tussenwoorden', () => {
  for (const problem of [
    'Ik ruik duidelijk gas bij mijn kookplaat.',
    'Ik weet niet of ik gas ruik bij de kookplaat.',
  ]) {
    const decision = evaluateSafety(ledgerFromInput({ problem }));
    assert.equal(decision.route, 'stop');
    assert.deepEqual(safetyFlagCodes(decision), ['gas']);
  }
});

test('Safety Kernel herkent opgezwollen batterij in beide woordvolgordes', () => {
  for (const problem of [
    'De batterij van mijn laptop is zichtbaar opgezwollen.',
    'Mijn laptop heeft een opgezwollen batterij.',
  ]) {
    const decision = evaluateSafety(ledgerFromInput({ problem }));
    assert.equal(decision.route, 'stop');
    assert.deepEqual(safetyFlagCodes(decision), ['battery_damage']);
  }
});

test('Safety Kernel behandelt expliciete negatie niet als hazard', () => {
  const ledger = ledgerFromInput({ problem: 'Er is geen rook, geen brandlucht en ik ruik geen gas.' });
  const decision = evaluateSafety(ledger);
  assert.equal(decision.route, null);
  assert.deepEqual(safetyFlagCodes(decision), []);
});

test('Safety Kernel modelleert algemene geur-, laadwarmte- en mobiliteitsgevaren meertalig', () => {
  for (const problem of [
    'Mijn stofzuiger ruikt verbrand.', 'The appliance smells burnt.', 'Das Gerät riecht verbrannt.',
    'Mijn telefoon wordt heel warm tijdens het opladen.', 'My phone gets very hot while charging.', 'Mein Handy wird beim Laden sehr heiß.',
    'Mijn elektrische fiets valt tijdens het rijden uit.', 'My e-bike cuts out while riding.', 'Mein Pedelec fällt während der Fahrt aus.',
  ]) assert.equal(evaluateSafety(ledgerFromInput({ problem })).route, 'stop', problem);
});

test('Safety Kernel respecteert expliciete negatie van nieuwe hazardconcepten', () => {
  for (const problem of [
    'Hij ruikt niet verbrand.', 'De telefoon wordt niet heet tijdens het opladen.',
    'Mijn elektrische fiets valt niet uit tijdens het rijden.', 'The device does not smell burnt.', 'Das Gerät riecht nicht verbrannt.',
  ]) assert.equal(evaluateSafety(ledgerFromInput({ problem })).route, null, problem);
});

test('Safety Kernel laat een ontkende term een echte term niet maskeren', () => {
  const ledger = ledgerFromInput({ problem: 'Er is geen rook, maar ik ruik wel brandlucht.' });
  const decision = evaluateSafety(ledger);
  assert.equal(decision.route, 'stop');
  assert.deepEqual(safetyFlagCodes(decision), ['fire_smoke']);
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
