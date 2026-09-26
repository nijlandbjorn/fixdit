import { asArray, cleanText, immutable } from './contracts.js';

function isHardSafetyFallback(diagnosis) {
  return diagnosis?.resolutionMode === 'safe_withdrawal' ||
    diagnosis?.repairEngine?.technique?.id === 'hard_safety_stop' ||
    diagnosis?.qualityGate?.finalStatus === 'hard_safety' ||
    diagnosis?.finalReview?.status === 'hard_safety' ||
    diagnosis?.repairEngine?.hardening?.status === 'hard_safety';
}

function classificationFromUserText(problem = '') {
  const text = cleanText(problem).toLocaleLowerCase();
  const coffeeMachine = /\b(koffiezetapparaat|koffieapparaat|koffiemachine|coffee machine|coffee maker|kaffeemaschine)\b/i.test(text);
  const noCoffeeFlow = /\b(geen (?:koffie|water)|komt (?:er )?geen (?:koffie|water)|no (?:coffee|water)|does(?:n't| not) (?:dispense|produce)|kein(?:e|en)? (?:kaffee|wasser))\b/i.test(text);
  if (coffeeMachine && noCoffeeFlow) {
    return {
      objectFamily: 'appliance',
      objectLabel: 'koffiezetapparaat',
      intent: 'repair',
      symptom: 'no_flow',
      problemKind: 'no_flow',
    };
  }

  const water = /\b(water|wasser)\b/i.test(text);
  const mains = /\b(stopcontact|stekker|230\s*v|socket|outlet|steckdose)\b/i.test(text);
  if (water && mains) {
    return {
      objectFamily: 'electrical',
      intent: 'inspect',
      symptom: 'water_damage',
      problemKind: 'water_damage',
    };
  }
  return {};
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
  return immutable({
    techniqueId: cleanText(source.id, 160),
    techniqueName: cleanText(source.name, 500),
    techniqueSearchName: cleanText(source.searchName, 500),
    mechanism: cleanText(source.mechanism, 1000),
    repairabilityStatus: cleanText(engine.repairability?.status || diagnosis.repairabilityStatus, 100) || 'DIY_AFTER_DETAILS',
    confidence: Number(engine.repairability?.confidence ?? source.confidence ?? 0),
    evidenceSourceIds: Object.freeze(asArray(source.evidenceSourceIds)),
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

export function attachV9Metadata(v8Diagnosis, v9Result) {
  return {
    ...v8Diagnosis,
    diagnosticV9: {
      schemaVersion: '9.0',
      engineVersion: v9Result.engineVersion,
      runId: v9Result.runId,
      mode: v9Result.mode,
      state: v9Result.state,
      safety: v9Result.safety,
      contradictions: v9Result.contradictions,
      hypotheses: v9Result.hypotheses,
      nextTest: v9Result.nextTest,
      repairGate: v9Result.repairGate,
      critic: v9Result.critic,
    },
  };
}
