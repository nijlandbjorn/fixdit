import { asArray, clamp01, cleanText, immutable, stableHash } from './contracts.js';
import { activeEvidence } from './evidence-ledger.js';

const CATALOG = Object.freeze({
  no_flow: [
    ['supply_not_seated', 'De normale toevoer bereikt het apparaat niet.', ['water_supply'], ['supply_confirmed']],
    ['accessible_blockage', 'Een normaal bereikbaar uitlaat- of filterpad is geblokkeerd.', ['accessible_path'], ['path_clear']],
    ['scale_or_airlock', 'Kalkaanslag of lucht in het watersysteem belemmert de doorstroming.', ['maintenance_history'], ['normal_flow_after_priming']],
  ],
  leak: [
    ['connection_leak', 'Een zichtbare of bereikbare verbinding lekt.', ['leak_location'], ['connection_dry']],
    ['container_damage', 'Een behuizing, reservoir of leidingdeel is beschadigd.', ['damage_location'], ['no_visible_damage']],
  ],
  no_power: [
    ['external_power_path', 'De externe voeding of normale bediening levert geen bruikbare voeding.', ['known_good_supply'], ['supply_confirmed']],
    ['device_internal_fault', 'Het apparaat heeft mogelijk een interne storing.', ['external_checks_complete'], ['device_operates']],
  ],
  loose: [
    ['loose_attachment', 'Een toegankelijke bevestiging is losgeraakt.', ['attachment_type'], ['attachment_intact']],
    ['material_failure', 'Het dragende materiaal rond de verbinding is beschadigd.', ['material_condition'], ['material_intact']],
  ],
  crack: [
    ['surface_crack', 'De schade is beperkt tot een niet-dragende oppervlaktelaag.', ['crack_location'], ['structural_movement']],
    ['structural_crack', 'De scheur kan onderdeel zijn van dragende of bewegende schade.', ['growth_or_movement'], ['stable_surface_only']],
  ],
  not_working: [
    ['operating_condition', 'Een normale gebruiksvoorwaarde of externe aansluiting ontbreekt.', ['observable_behavior'], ['conditions_confirmed']],
    ['component_fault', 'Een component functioneert mogelijk niet.', ['failure_boundary'], ['normal_operation']],
  ],
  unknown: [
    ['unclassified_failure', 'Het waarneembare probleem is nog onvoldoende afgebakend.', ['observable_behavior'], ['problem_resolved']],
  ],
});

function textCorpus(ledger) {
  return activeEvidence(ledger)
    .map(entry => `${entry.subject} ${entry.predicate} ${typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value)}`)
    .join(' ')
    .toLocaleLowerCase();
}

function normalizeProposal(proposal, index, ledger) {
  const code = cleanText(proposal?.code, 100) || `hypothesis_${index + 1}`;
  const statement = cleanText(proposal?.statement, 600);
  if (!statement) return null;
  const activeIds = new Set(activeEvidence(ledger).map(entry => entry.evidenceId));
  const supportingEvidenceIds = asArray(proposal?.supportingEvidenceIds).filter(id => activeIds.has(id));
  const opposingEvidenceIds = asArray(proposal?.opposingEvidenceIds).filter(id => activeIds.has(id));
  const base = clamp01(proposal?.score ?? 0.35);
  const score = clamp01(base + supportingEvidenceIds.length * 0.1 - opposingEvidenceIds.length * 0.2);
  return immutable({
    hypothesisId: cleanText(proposal?.hypothesisId, 160) || `hy_${stableHash([ledger?.runId, code, statement])}`,
    code,
    statement,
    score,
    status: opposingEvidenceIds.length ? 'challenged' : 'active',
    supportingEvidenceIds: Object.freeze(supportingEvidenceIds),
    opposingEvidenceIds: Object.freeze(opposingEvidenceIds),
    missingEvidence: Object.freeze(asArray(proposal?.missingEvidence).map(value => cleanText(value, 120)).filter(Boolean)),
    falsifiers: Object.freeze(asArray(proposal?.falsifiers).map(value => cleanText(value, 300)).filter(Boolean)),
  });
}

export function generateHypotheses({ ledger, classification = {}, modelProposals = [] } = {}) {
  const symptom = cleanText(classification.symptom || classification.problemKind, 100) || 'unknown';
  const corpus = textCorpus(ledger);
  const catalog = CATALOG[symptom] || CATALOG.unknown;
  const deterministic = catalog.map(([code, statement, missingEvidence, falsifiers], index) => {
    const keyword = code.split('_').find(token => token.length >= 5);
    const support = activeEvidence(ledger).filter(entry =>
      keyword && `${entry.predicate} ${entry.value}`.toLocaleLowerCase().includes(keyword));
    return normalizeProposal({
      code,
      statement,
      score: 0.38 + (index === 0 ? 0.08 : 0) + (corpus.includes(symptom.replace('_', ' ')) ? 0.04 : 0),
      supportingEvidenceIds: support.map(entry => entry.evidenceId),
      missingEvidence,
      falsifiers,
    }, index, ledger);
  });

  const proposals = asArray(modelProposals)
    .slice(0, 5)
    .map((proposal, index) => normalizeProposal(proposal, deterministic.length + index, ledger))
    .filter(Boolean);

  const byCode = new Map();
  for (const hypothesis of [...deterministic, ...proposals].filter(Boolean)) {
    const current = byCode.get(hypothesis.code);
    if (!current || hypothesis.score > current.score) byCode.set(hypothesis.code, hypothesis);
  }

  return Object.freeze([...byCode.values()].sort((a, b) => b.score - a.score).slice(0, 6));
}
