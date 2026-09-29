import assert from 'node:assert/strict';
import test from 'node:test';

import { detectFunctionalPatterns } from '../../src/v9/functional-patterns.js';
import { runPipelineV9 } from '../../src/v9/pipeline.js';

const cases = {
  continues_when_should_stop: [
    'De kraan blijft na het sluiten zachtjes stromen.',
    'De ventilator blijft na het uitschakelen draaien.',
    'Het water blijft na de normale cyclus zachtjes doorlopen.',
  ],
  fails_under_load: [
    'Het platform blijft staan zonder belasting maar zakt als er gewicht op staat.',
    'De klem houdt los prima maar slipt wanneer er kracht op komt.',
  ],
  position_dependency: [
    'De lade sluit alleen als ik de voorkant iets optil.',
    'Het contact werkt pas wanneer ik de stekker onder een andere hoek draai.',
  ],
  direction_asymmetry: [
    'Het scherm gaat wel omlaag maar niet omhoog.',
    'De schuif beweegt naar links, maar niet naar rechts.',
  ],
  partial_subsystem_failure: [
    'De linker zone werkt nog wel, maar de rechter zone niet meer.',
    'Het systeem werkt, maar één kanaal geeft geen uitgang.',
  ],
};

test('generieke functionele storingspatronen generaliseren over objectvrije parafrases', () => {
  for (const [expected, inputs] of Object.entries(cases)) {
    for (const input of inputs) assert.ok(detectFunctionalPatterns(input).includes(expected), `${expected}: ${input}`);
  }
});

test('functionele patronen sturen oorzaakfamilies, veilige checks en een nieuwe evidence-as', async () => {
  for (const [expected, inputs] of Object.entries(cases)) {
    const result = await runPipelineV9({ problem: inputs[0] });
    assert.ok(result.hypotheses.some(item => item.code.startsWith(`${expected}_`)), expected);
    assert.ok(result.consumerResponse.safeFirstChecks.every(check => check.evidenceKey), expected);
    assert.ok(result.consumerResponse.nextQuestion?.evidenceKey, expected);
    assert.equal(result.repairGate.open, false, expected);
    assert.equal(result.safety.route, null, expected);
  }
});

test('canonical known evidence verdwijnt uit fallbackvragen en veilige controles', async () => {
  const report = 'Mijn koptelefoon geeft links alleen geluid als ik de kabel beweeg.';
  const answer = {
    text: 'Nee', semanticClaim: 'Er is geen zichtbare schade aan de kabel of stekker.',
    evidenceKey: 'visible_damage', questionId: 'q_damage', answerKind: 'no', rawAnswer: 'Nee',
  };
  const result = await runPipelineV9({ problem: answer.semanticClaim, previousObservations: [report, answer] });
  const checkAxes = result.consumerResponse.safeFirstChecks.map(check => check.evidenceKey);
  assert.equal(checkAxes.includes('visible_damage'), false);
  assert.equal(checkAxes.includes('movement_dependency'), false);
  assert.notEqual(result.consumerResponse.nextQuestion?.evidenceKey, 'visible_damage');
  assert.notEqual(result.consumerResponse.nextQuestion?.evidenceKey, 'movement_dependency');
  assert.notEqual(result.consumerResponse.nextQuestion?.evidenceKey, 'affected_side');
});

test('lokale AI-rejection gebruikt geen misleidende provider-unavailable tekst', async () => {
  const result = await runPipelineV9({
    problem: 'De schuif beweegt naar links, maar niet naar rechts.',
    reasoner: async () => ({ hypotheses: [], consumerResponse: {
      object: { displayName: 'schuif', category: 'mechanisme', confidence: 'high' },
      summary: 'De schuif werkt slechts in één richting.', knownFacts: [],
      likelyCauses: [{ label: 'De geleiding kan in één richting weerstand geven.', basis: 'hypothesis' }],
      safeFirstChecks: [{ text: 'Vergelijk de beweging in beide richtingen.', actionClass: 'observation', evidenceKey: 'direction_comparison' }],
      nextQuestion: { type: 'short_text', text: 'Welke kant werkt niet?', evidenceKey: 'affected_side' },
      uncertainty: 'Nog niet bevestigd.', repairGuidance: null,
    } }),
  });
  assert.equal(result.consumerResponse.responseSource, 'deterministic_fallback');
  assert.match(result.consumerResponse.uncertainty, /op basis van wat we nu weten/i);
  assert.doesNotMatch(result.consumerResponse.uncertainty, /tijdelijk niet beschikbaar/i);
});
