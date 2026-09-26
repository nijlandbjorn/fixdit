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

  const appliance = /\b(vaatwasser|afwasmachine|wasmachine|dishwasher|washing machine|spülmaschine|waschmaschine)\b/i.test(text);
  const noDrain = /\b(pompt?.{0,25}(?:niet|geen).{0,15}(?:af|weg)|(?:niet|geen).{0,20}(?:afpompen|wegpompen)|does(?:n't| not) drain|pumpt?.{0,20}nicht ab)\b/i.test(text);
  if (appliance && noDrain) {
    return {
      objectFamily: 'appliance',
      intent: 'repair',
      symptom: 'no_flow',
      problemKind: 'no_flow',
    };
  }

  const electronicDevice = /\b(elektronisch apparaat|telefoon|laptop|computer|device|electronic|telefon|rechner)\b/i.test(text);
  const noPower = /\b(gaat niet aan|start niet|geen stroom|no power|does(?:n't| not) turn on|geht nicht an|kein strom)\b/i.test(text);
  if (electronicDevice && noPower) {
    return {
      objectFamily: 'electronics',
      intent: 'repair',
      symptom: 'no_power',
      problemKind: 'no_power',
    };
  }

  const automotive = /\b(auto|voertuig|car|vehicle|wagen|fahrzeug)\b/i.test(text);
  if (automotive && /\b(remt|remmen|remweg|brake|braking|bremst|bremsweg)\b/i.test(text)) {
    return {
      objectFamily: 'automotive',
      intent: 'repair',
      symptom: 'braking_fault',
      problemKind: 'braking_fault',
    };
  }
  if (/\b(autoband|band|tire|tyre|reifen)\b/i.test(text) && /\b(zacht|lek|leeg|pressure|soft|flat|druck|platt)\b/i.test(text)) {
    return {
      objectFamily: 'automotive',
      intent: 'repair',
      symptom: 'pressure_loss',
      problemKind: 'pressure_loss',
    };
  }

  const furniture = /\b(stoel|tafel|meubel|chair|table|furniture|stuhl|tisch|möbel)\b/i.test(text);
  if (furniture && /\b(los|loose|locker)\b/i.test(text)) {
    return {
      objectFamily: 'furniture',
      intent: 'repair',
      symptom: 'loose',
      problemKind: 'loose',
    };
  }
  if (furniture && /\b(gescheurd|scheur|gebarsten|crack|cracked|riss|gerissen)\b/i.test(text)) {
    return {
      objectFamily: 'furniture',
      intent: 'repair',
      symptom: 'crack',
      problemKind: 'crack',
    };
  }

  if (/\b(aquarium|fish tank|aquariumbecken)\b/i.test(text) && /\b(glas|glass|scheur|barst|gebarsten|crack|cracked|riss|gesprungen)\b/i.test(text)) {
    return {
      objectFamily: 'aquarium',
      intent: 'inspect',
      symptom: 'crack',
      problemKind: 'crack',
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
