import { asArray, cleanText, immutable } from './contracts.js';

const LOW_RISK_DIRECT = new Set(['pressure_loss']);
const SAFETY_SENSITIVE = new Set(['braking_fault', 'steering_fault', 'battery_damage', 'water_damage']);

export function selectDiagnosticRoute({ classification = {}, safety = null, ledger = null, noProgress = null } = {}) {
  if (['stop', 'professional'].includes(safety?.route)) {
    return immutable({ route: 'safety_stop', reason: `safety_${safety.route}`, authority: 'deterministic_safety' });
  }
  if (noProgress?.exhausted) {
    return immutable({ route: 'diagnose', reason: 'insufficient_evidence_after_no_progress', authority: 'deterministic_policy' });
  }
  const symptom = cleanText(classification?.symptom || classification?.problemKind, 100);
  const rawReports = asArray(ledger?.entries).filter(entry =>
    entry.status === 'active' && ['user_text', 'previous_user_text'].includes(entry.source) && entry.predicate === 'raw_text');
  const authoritative = classification?.evidenceAuthority?.symptom !== 'legacy_inference';
  const lowRiskObject = symptom !== 'pressure_loss' || classification?.objectFamily === 'bicycle';
  if (LOW_RISK_DIRECT.has(symptom) && lowRiskObject && !safety?.route && !SAFETY_SENSITIVE.has(symptom) && rawReports.length && authoritative) {
    return immutable({ route: 'direct_help', reason: 'clear_low_risk_problem', authority: 'deterministic_policy' });
  }
  return immutable({ route: 'diagnose', reason: 'more_discriminating_evidence_needed', authority: 'deterministic_policy' });
}

export function buildDirectHelp({ classification = {}, hypotheses = [], safety = null } = {}) {
  if (safety?.route || classification?.symptom !== 'pressure_loss') return null;
  return immutable({
    title: 'Waarschijnlijk probleem',
    summary: 'De fietsband verliest lucht door een lek of een probleem rond het ventiel of de band.',
    causes: Object.freeze(asArray(hypotheses).slice(0, 4).map(item => item.statement)),
    now: Object.freeze([
      'Controleer de buitenband rustig op een zichtbaar scherp voorwerp of beschadiging.',
      'Pomp de band alleen op als band en velg niet zichtbaar beschadigd zijn en luister bij het ventiel naar luchtverlies.',
      'Rijd niet verder op een volledig lege of beschadigde band.',
    ]),
    selfRepair: 'Een gewone binnenband of ventielkern is vaak met basisgereedschap te controleren of te vervangen.',
    professional: 'Laat de fiets nakijken bij schade aan buitenband, velg, spaakgebied of wanneer je de oorzaak niet veilig kunt vinden.',
    prompt: 'Waarmee wil je verder?',
  });
}
