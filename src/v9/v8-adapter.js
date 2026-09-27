import { classificationFromUserText } from './raw-classification.js';
import { asArray, cleanText, immutable } from './contracts.js';

function isHardSafetyFallback(diagnosis) {
  return diagnosis?.resolutionMode === 'safe_withdrawal' ||
    diagnosis?.repairEngine?.technique?.id === 'hard_safety_stop' ||
    diagnosis?.qualityGate?.finalStatus === 'hard_safety' ||
    diagnosis?.finalReview?.status === 'hard_safety' ||
    diagnosis?.repairEngine?.hardening?.status === 'hard_safety';
}

export function classificationFromV8(diagnosis = {}, { problem = '' } = {}) {
  const legacy = {
    objectFamily: cleanText(diagnosis.objectFamily, 100) || 'other',
    objectLabel: cleanText(diagnosis.objectLabel, 200),
    objectSubtype: cleanText(diagnosis.objectSubtype, 200),
    intent: cleanText(diagnosis.intent, 100) || 'repair',
    symptom: cleanText(diagnosis.symptom || diagnosis.problemKind, 100) || 'unknown',
    problemKind: cleanText(diagnosis.problemKind || diagnosis.symptom, 100) || 'unknown',
    brand: cleanText(diagnosis.brand || diagnosis.guidedRepair?.brand, 200),
    model: cleanText(diagnosis.model || diagnosis.guidedRepair?.model, 200),
    errorCode: cleanText(diagnosis.errorCode, 100),
  };
  const raw = classificationFromUserText(problem);
  const hardSafetyFallback = isHardSafetyFallback(diagnosis);
  const base = hardSafetyFallback
    ? {
        brand: legacy.brand,
        model: legacy.model,
        errorCode: legacy.errorCode,
      }
    : legacy;
  const resolved = { ...base, ...raw };
  const evidenceAuthority = {};
  for (const key of ['objectFamily', 'objectLabel', 'symptom', 'intent', 'brand', 'model', 'errorCode']) {
    if (!cleanText(resolved[key], 200)) continue;
    evidenceAuthority[key] = Object.hasOwn(raw, key)
      ? 'raw_user_text'
      : 'legacy_inference';
  }
  return immutable({
    ...resolved,
    evidenceAuthority,
    legacyHardSafetyFallback: hardSafetyFallback,
  });
}

export function techniqueFromV8(diagnosis = {}) {
  const engine = diagnosis.repairEngine || {};
  const source = engine.technique || diagnosis.repairTechnique || {};
  const hardSafetyFallback = isHardSafetyFallback(diagnosis);
  if (hardSafetyFallback) {
    return immutable({
      techniqueId: '',
      techniqueName: '',
      techniqueSearchName: '',
      mechanism: '',
      repairabilityStatus: 'UNVERIFIED',
      confidence: 0,
      evidenceSourceIds: Object.freeze([]),
      authority: 'untrusted_hard_safety_fallback',
      provenance: immutable({ derivedFrom: 'v8_hard_safety_fallback', accepted: false }),
    });
  }
  return immutable({
    techniqueId: cleanText(source.id, 160),
    techniqueName: cleanText(source.name, 500),
    techniqueSearchName: cleanText(source.searchName, 500),
    mechanism: cleanText(source.mechanism, 1000),
    repairabilityStatus: cleanText(engine.repairability?.status || diagnosis.repairabilityStatus, 100) || 'DIY_AFTER_DETAILS',
    confidence: Number(engine.repairability?.confidence ?? source.confidence ?? 0),
    evidenceSourceIds: Object.freeze(asArray(source.evidenceSourceIds)),
    authority: 'legacy_inference',
    provenance: immutable({ derivedFrom: 'v8_repair_engine', accepted: true }),
  });
}

export function researchFromV8(diagnosis = {}) {
  return immutable({
    status: cleanText(diagnosis.repairEngine?.research?.status, 100) || 'skipped',
    sources: Object.freeze(asArray(diagnosis.repairEngine?.research?.sources).map(source => immutable({
      sourceId: cleanText(source.id ?? source.sourceId, 160),
      title: cleanText(source.title, 500),
      url: cleanText(source.url, 2000),
      sourceType: cleanText(source.sourceType, 100),
      trustScore: Number(source.trustScore || 0),
      snippet: cleanText(source.snippet, 1200),
    }))),
  });
}

export function observationsFromV8(diagnosis = {}) {
  return asArray(diagnosis.reasoningContext?.observations)
    .map(item => ({ text: cleanText(item?.text ?? item), answerTo: cleanText(item?.answerTo, 500) }))
    .filter(item => item.text);
}

export function attachV9Metadata(v8Diagnosis, v9Result, { comparison = null, persistence = null } = {}) {
  return {
    ...v8Diagnosis,
    diagnosticV9: {
      schemaVersion: '9.0',
      engineVersion: v9Result.engineVersion,
      runId: v9Result.runId,
      mode: v9Result.mode,
      state: v9Result.state,
      ledger: v9Result.ledger,
      safety: v9Result.safety,
      decision: v9Result.decision,
      noProgress: v9Result.noProgress,
      contradictions: v9Result.contradictions,
      hypotheses: v9Result.hypotheses,
      nextTest: v9Result.nextTest,
      directHelp: v9Result.directHelp,
      consumerResponse: v9Result.consumerResponse,
      repairGate: v9Result.repairGate,
      critic: v9Result.critic,
      plan: v9Result.plan,
      metrics: v9Result.metrics,
      comparison,
      persistence,
    },
  };
}
