import {
  EVIDENCE_POLARITIES,
  EVIDENCE_SOURCES,
  EVIDENCE_STATUSES,
  V9_LEDGER_VERSION,
  asArray,
  clamp01,
  cleanText,
  immutable,
  stableHash,
} from './contracts.js';

function normalizeEvidence(input, sequence, runId = '') {
  const source = EVIDENCE_SOURCES.includes(input?.source) ? input.source : 'model_hypothesis';
  const polarity = EVIDENCE_POLARITIES.includes(input?.polarity) ? input.polarity : 'unknown';
  const status = EVIDENCE_STATUSES.includes(input?.status) ? input.status : 'active';
  const subject = cleanText(input?.subject || 'object', 160) || 'object';
  const predicate = cleanText(input?.predicate || 'observation', 160) || 'observation';
  const value = input?.value ?? '';
  const turnNumber = Math.max(0, Math.trunc(Number(input?.turnNumber) || 0));
  const seed = {
    runId,
    sequence,
    source,
    subject,
    predicate,
    value,
    polarity,
    turnNumber,
    supersedesId: cleanText(input?.supersedesId, 160) || null,
  };

  return immutable({
    evidenceId: cleanText(input?.evidenceId, 160) || `ev_${stableHash(seed)}`,
    ...seed,
    confidence: clamp01(input?.confidence ?? (source.includes('user_text') ? 1 : 0.5)),
    provenance: immutable({ ...(input?.provenance || {}) }),
    status,
  });
}

export function createEvidenceLedger({ runId = '', entries = [] } = {}) {
  const normalizedRunId = cleanText(runId, 160);
  const normalized = asArray(entries).map((entry, index) => normalizeEvidence(entry, index + 1, normalizedRunId));
  const ids = new Set();
  for (const entry of normalized) {
    if (ids.has(entry.evidenceId)) throw new Error(`DUPLICATE_EVIDENCE_ID:${entry.evidenceId}`);
    ids.add(entry.evidenceId);
  }

  return immutable({
    schemaVersion: V9_LEDGER_VERSION,
    runId: normalizedRunId,
    revision: normalized.length,
    entries: normalized,
  });
}

export function appendEvidence(ledger, inputs) {
  const existing = asArray(ledger?.entries);
  const additions = asArray(inputs).map((entry, index) =>
    normalizeEvidence(entry, existing.length + index + 1));
  return createEvidenceLedger({
    runId: ledger?.runId || '',
    entries: [...existing, ...additions],
  });
}

export function supersedeEvidence(ledger, evidenceId, replacement) {
  const current = asArray(ledger?.entries).find(entry => entry.evidenceId === evidenceId);
  if (!current || current.status !== 'active') throw new Error(`ACTIVE_EVIDENCE_NOT_FOUND:${evidenceId}`);

  const entries = ledger.entries.map(entry =>
    entry.evidenceId === evidenceId ? { ...entry, status: 'superseded' } : entry);
  return appendEvidence(createEvidenceLedger({ runId: ledger.runId, entries }), [{
    ...replacement,
    supersedesId: evidenceId,
    turnNumber: replacement?.turnNumber ?? current.turnNumber,
  }]);
}

export function activeEvidence(ledger, predicate = () => true) {
  return asArray(ledger?.entries).filter(entry => entry.status === 'active' && predicate(entry));
}

export function ledgerFromInput({ runId = '', problem = '', previousObservations = [], classification = null } = {}) {
  const entries = [];
  for (const [index, observation] of asArray(previousObservations).entries()) {
    const text = cleanText(observation?.text ?? observation);
    if (!text) continue;
    entries.push({
      source: 'previous_user_text',
      subject: 'user_report',
      predicate: 'raw_text',
      value: text,
      polarity: 'present',
      confidence: 1,
      turnNumber: index,
      provenance: { answerTo: cleanText(observation?.answerTo, 500) },
    });
  }

  if (cleanText(problem)) {
    entries.push({
      source: 'user_text',
      subject: 'user_report',
      predicate: 'raw_text',
      value: cleanText(problem),
      polarity: 'present',
      confidence: 1,
      turnNumber: asArray(previousObservations).length,
    });
  }

  for (const key of ['objectFamily', 'objectLabel', 'symptom', 'intent', 'brand', 'model', 'errorCode']) {
    const value = cleanText(classification?.[key], 200);
    if (!value) continue;
    const authority = classification?.evidenceAuthority?.[key];
    const legacyInference = authority === 'legacy_inference';
    entries.push({
      source: legacyInference ? 'legacy_inference' : 'deterministic_normalization',
      subject: 'classification',
      predicate: key,
      value,
      polarity: 'present',
      confidence: legacyInference ? 0.35 : key === 'objectLabel' ? 0.8 : 1,
      provenance: {
        derivedFrom: legacyInference ? 'v8_legacy_inference' : 'raw_user_text_normalization',
      },
    });
  }

  return createEvidenceLedger({ runId, entries });
}
