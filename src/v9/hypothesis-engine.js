import { asArray, clamp01, cleanText, immutable, stableHash } from './contracts.js';
import { activeEvidence } from './evidence-ledger.js';

const CATALOG = Object.freeze({
  pressure_loss: [
    ['inner_tube_puncture', 'De binnenband kan lek zijn.', ['leak_rate'], ['pressure_holds']],
    ['valve_leak', 'Het ventiel of de ventielkern kan lucht lekken.', ['valve_condition'], ['valve_holds_pressure']],
    ['tire_foreign_object', 'Een scherp voorwerp of beschadiging in de buitenband kan het lek veroorzaken.', ['tire_condition'], ['tire_clear']],
    ['rim_or_tire_damage', 'Schade rond buitenband, velg of spaakgebied kan luchtverlies veroorzaken.', ['rim_condition'], ['rim_intact']],
  ],
  dishwasher_no_flow: [
    ['dishwasher_water_supply', 'De kraan of watertoevoer naar de vaatwasser kan gesloten of onderbroken zijn.', ['water_supply'], ['supply_confirmed']],
    ['dishwasher_inlet_hose', 'De toevoerslang kan geknikt of verstopt zijn.', ['inlet_hose_condition'], ['hose_clear']],
    ['dishwasher_inlet_filter', 'Het inlaatfilter kan verstopt zijn.', ['inlet_filter_condition'], ['filter_clear']],
    ['dishwasher_aquastop', 'De aquastop of lekbeveiliging kan de watertoevoer blokkeren.', ['aquastop_state'], ['aquastop_clear']],
    ['dishwasher_door_or_valve', 'De deurvergrendeling, het inlaatventiel of de aansturing kan de inlaat verhinderen.', ['door_lock_state'], ['door_locked']],
  ],
  no_drain: [
    ['drain_obstruction', 'Een verstopping kan de afvoer belemmeren.', ['failure_boundary'], ['drain_clear']],
    ['drain_pump_fault', 'De afvoerpomp of aansturing werkt mogelijk niet.', ['observable_behavior'], ['pump_operates']],
  ],
  no_heat: [
    ['settings_or_supply', 'Een instelling of gebruiksvoorwaarde kan warmte verhinderen.', ['failure_boundary'], ['settings_confirmed']],
    ['heating_fault', 'Het verwarmingssysteem werkt mogelijk niet.', ['observable_behavior'], ['normal_heat']],
  ],
  poor_cooling: [
    ['airflow_or_settings', 'Luchtcirculatie, deurafdichting of instellingen kunnen koeling beperken.', ['failure_boundary'], ['conditions_confirmed']],
    ['cooling_fault', 'Het koelsysteem werkt mogelijk niet goed.', ['observable_behavior'], ['normal_cooling']],
  ],
  not_charging: [
    ['charging_path', 'De externe laadverbinding kan onderbroken zijn.', ['known_good_supply'], ['supply_confirmed']],
    ['battery_or_controller', 'De batterij of laadregeling werkt mogelijk niet goed.', ['observable_behavior'], ['normal_charging']],
  ],
  no_sound: [
    ['audio_settings', 'De gekozen uitgang of geluidsinstelling kan de oorzaak zijn.', ['failure_boundary'], ['settings_confirmed']],
    ['audio_output_fault', 'De geluidsuitgang werkt mogelijk niet.', ['observable_behavior'], ['normal_audio']],
  ],
  error_code: [
    ['reported_error', 'De gemelde code moet met modelinformatie worden afgebakend.', ['error_details'], ['code_absent']],
    ['operating_condition', 'Een gebruiksvoorwaarde kan de foutmelding veroorzaken.', ['failure_boundary'], ['conditions_confirmed']],
  ],
  noise: [
    ['external_vibration', 'Een extern deel kan meetrillen.', ['failure_boundary'], ['external_parts_stable']],
    ['moving_component', 'Een bewegend onderdeel kan het geluid veroorzaken.', ['observable_behavior'], ['normal_operation']],
  ],
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

function normalizeProposal(proposal, index, ledger) {
  const code = cleanText(proposal?.code, 100) || `hypothesis_${index + 1}`;
  const statement = cleanText(proposal?.statement, 600);
  if (!statement) return null;
  const activeIds = new Set(activeEvidence(ledger).map(entry => entry.evidenceId));
  const supportingEvidenceIds = asArray(proposal?.supportingEvidenceIds).filter(id => activeIds.has(id));
  const opposingEvidenceIds = asArray(proposal?.opposingEvidenceIds).filter(id => activeIds.has(id));
  const base = Math.min(0.5, clamp01(proposal?.score ?? 0.35));
  const score = clamp01(base + Number(proposal?.confirmedSupportCount || 0) * 0.1 - opposingEvidenceIds.length * 0.2);
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
  const catalogKey = symptom === 'no_flow' && classification.objectLabel === 'vaatwasser' ? 'dishwasher_no_flow' : symptom;
  const catalog = CATALOG[catalogKey] || CATALOG.unknown;
  const deterministic = catalog.map(([code, statement, missingEvidence, falsifiers], index) => {
    const observations = activeEvidence(ledger, entry => ['user_text', 'previous_user_text', 'vision_structured'].includes(entry.source));
    const report = observations.filter(entry => entry.predicate === 'raw_text');
    const confirmed = observations.filter(entry => entry.predicate === `supports:${code}` && entry.polarity === 'present');
    const opposing = observations.filter(entry => (falsifiers.includes(entry.predicate) || entry.predicate === `opposes:${code}`) && entry.polarity === 'present');
    return normalizeProposal({
      code,
      statement,
      score: 0.38 + (index === 0 ? 0.08 : 0),
      supportingEvidenceIds: [...report, ...confirmed].map(entry => entry.evidenceId),
      opposingEvidenceIds: opposing.map(entry => entry.evidenceId),
      confirmedSupportCount: confirmed.length,
      missingEvidence,
      falsifiers,
    }, index, ledger);
  });

  const proposals = asArray(modelProposals)
    .slice(0, 5)
    .map((proposal, index) => normalizeProposal({ ...proposal, confirmedSupportCount: 0 }, deterministic.length + index, ledger))
    .filter(Boolean);

  const byCode = new Map();
  for (const hypothesis of [...deterministic, ...proposals].filter(Boolean)) {
    const current = byCode.get(hypothesis.code);
    if (!current || hypothesis.score > current.score) byCode.set(hypothesis.code, hypothesis);
  }

  return Object.freeze([...byCode.values()].sort((a, b) => b.score - a.score).slice(0, 6));
}
