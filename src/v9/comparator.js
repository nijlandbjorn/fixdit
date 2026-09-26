import { asArray, immutable } from './contracts.js';
import { assessSafetyEvidence } from './safety-kernel.js';

function normalizeV8Safety(v8) {
  if (v8?.route === 'stop' || v8?.risk === 'stop') return 'stop';
  if (v8?.route === 'professional') return 'professional';
  if (v8?.route === 'caution') return 'caution';
  return null;
}

function v9Route(v9) {
  return v9?.safety?.route || v9?.repairGate?.route || v9?.plan?.route || 'more_info';
}

export function compareV8V9(v8Diagnosis, v9Result) {
  const v8Safety = normalizeV8Safety(v8Diagnosis);
  const v9Safety = v9Result?.safety?.route || null;
  const v8Route = v8Diagnosis?.route || 'more_info';
  const routeV9 = v9Route(v9Result);
  const v8SafetyCodes = asArray(v8Diagnosis?.safetyFlags)
    .map(flag => typeof flag === 'string' ? flag : flag?.code)
    .filter(Boolean);
  const safetyEvidence = assessSafetyEvidence(v9Result?.ledger);
  const explicitlyNegatedV8Safety = Boolean(v8Safety && !v9Safety && v8SafetyCodes.length) &&
    v8SafetyCodes.every(code =>
      safetyEvidence[code]?.negatedEvidenceIds?.length &&
      !safetyEvidence[code]?.presentEvidenceIds?.length);
  const unknownEvidenceReference = asArray(v9Result?.critic?.issues)
    .includes('unknown_evidence_reference');
  const safetyDivergence = Boolean(v8Safety && v8Safety !== v9Safety);
  const criticalRegression = unknownEvidenceReference ||
    (safetyDivergence && !explicitlyNegatedV8Safety);
  const status = criticalRegression
    ? 'critical_regression'
    : safetyDivergence
      ? 'needs_review'
      : 'aligned';

  return immutable({
    schemaVersion: '1.0',
    safetyMatch: v8Safety === v9Safety,
    routeMatch: v8Route === routeV9,
    v8Safety,
    v9Safety,
    v8Route,
    v9Route: routeV9,
    contradictionCount: asArray(v9Result?.contradictions).length,
    criticIssueCount: asArray(v9Result?.critic?.issues).length,
    criticalRegression,
    status,
    safetyDifferenceReason: explicitlyNegatedV8Safety ? 'explicit_user_negation' : null,
    negatedSafetyCodes: Object.freeze(v8SafetyCodes.filter(code =>
      safetyEvidence[code]?.negatedEvidenceIds?.length &&
      !safetyEvidence[code]?.presentEvidenceIds?.length)),
    latencyDeltaMs: Number(v9Result?.metrics?.totalMs || 0) - Number(v8Diagnosis?.performance?.totalMs || 0),
  });
}
