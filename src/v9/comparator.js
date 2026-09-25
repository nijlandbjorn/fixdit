import { asArray, immutable } from './contracts.js';

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
  const criticalRegression = Boolean(v8Safety && !v9Safety) ||
    (v8Safety === 'stop' && v9Safety !== 'stop') ||
    (asArray(v9Result?.critic?.issues).includes('unknown_evidence_reference'));

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
    latencyDeltaMs: Number(v9Result?.metrics?.totalMs || 0) - Number(v8Diagnosis?.performance?.totalMs || 0),
  });
}
