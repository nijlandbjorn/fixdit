import { V9_ENGINE_VERSION, asArray, cleanText, immutable, stableHash } from './contracts.js';
import { appendEvidence, ledgerFromInput } from './evidence-ledger.js';
import { normalizeVisionEvidence } from './vision-evidence.js';
import { detectContradictions } from './contradiction-detector.js';
import { evaluateSafety } from './safety-kernel.js';
import { generateHypotheses } from './hypothesis-engine.js';
import { selectNextBestTest } from './next-best-test.js';
import { evaluateRepairGate } from './repair-gate.js';
import { buildRepairPlanV9 } from './repair-planner.js';
import { runIndependentCritic } from './independent-critic.js';
import { createDiagnosticState, transitionDiagnosticState } from './state-machine.js';
import { buildDirectHelp, selectDiagnosticRoute } from './decision-layer.js';
import { detectNoProgress } from './no-progress.js';
import { buildFallbackConsumerResponse, DEFAULT_INTERACTION_CAPABILITIES, validateConsumerResponseV1 } from './consumer-response-v1.js';
import { handledEvidenceAxes } from './diagnostic-axis.js';
import { classificationFromUserText } from './raw-classification.js';

function transitionForDecision(state, safety, gate, nextTest) {
  if (safety.route === 'stop') {
    return transitionDiagnosticState(state, { type: 'safety_stop', expectedRevision: state.revision });
  }
  if (safety.route === 'professional') {
    return transitionDiagnosticState(state, { type: 'professional', expectedRevision: state.revision });
  }
  if (gate.open) {
    return transitionDiagnosticState(state, { type: 'repair_gate_open', expectedRevision: state.revision });
  }
  if (nextTest) {
    return transitionDiagnosticState(state, {
      type: 'select_test',
      testId: nextTest.testId,
      hypothesisId: nextTest.hypothesisIds?.[0],
      expectedRevision: state.revision,
    });
  }
  return state;
}

function sanitizeDebugValue(value, depth = 0) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value ?? null;
  if (typeof value === 'string') return cleanText(value, 500);
  if (depth >= 3) return '[bounded]';
  if (Array.isArray(value)) return value.slice(0, 8).map(item => sanitizeDebugValue(item, depth + 1));
  if (typeof value !== 'object') return null;
  return Object.fromEntries(Object.entries(value).slice(0, 16).map(([key, item]) => [cleanText(key, 80), sanitizeDebugValue(item, depth + 1)]));
}

function preValidationSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return immutable({
    summary: cleanText(value.summary, 360),
    likelyCauses: sanitizeDebugValue(asArray(value.likelyCauses).slice(0, 4)),
    safeFirstChecks: sanitizeDebugValue(asArray(value.safeFirstChecks).slice(0, 4)),
    nextQuestion: sanitizeDebugValue(value.nextQuestion),
    repairGuidance: sanitizeDebugValue(value.repairGuidance),
  });
}

export async function runPipelineV9({
  analysisId = '',
  runId = '',
  mode = 'local',
  language = 'nl',
  problem = '',
  previousObservations = [],
  classification = {},
  structuredVision = null,
  modelHypotheses = [],
  technique = null,
  research = null,
  legacyDiagnosis = null,
  reasoner = null,
  critic = null,
  capabilities = DEFAULT_INTERACTION_CAPABILITIES,
  aiUnavailableReason = '',
  priorAiAttempt = false,
} = {}) {
  const started = Date.now();
  const conversationEvidence = [...asArray(previousObservations).map(item => item?.text ?? item), problem]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join('\n');
  // Follow-up answers such as "Weet ik niet" must not erase the concrete object/problem
  // that the user supplied at the start of this same diagnosis.
  classification = immutable({ ...classification, ...classificationFromUserText(conversationEvidence) });
  const actualRunId = runId || `v9_${stableHash([analysisId, problem, Date.now()])}`;
  let ledger = ledgerFromInput({ runId: actualRunId, problem, previousObservations, classification });
  if (structuredVision) {
    ledger = appendEvidence(ledger, normalizeVisionEvidence(structuredVision, {
      turnNumber: asArray(previousObservations).length,
      imageRef: `run:${actualRunId}`,
    }));
  }

  const contradictions = detectContradictions(ledger);
  const safety = evaluateSafety(ledger);
  let aiCalls = 0;
  let aiError = null;
  let providerFailure = null;
  let providerResponseNormalization = null;
  const aiPlanned = !['stop', 'professional'].includes(safety.route);
  let providerCallStarted = false;
  let providerCallCompleted = false;
  let providerCallFailed = false;
  let aiLatencyMs = 0;
  let assistedResponse = null;
  let assistedHypotheses = asArray(modelHypotheses);
  let hypotheses = generateHypotheses({ ledger, classification, modelProposals: assistedHypotheses });
  let noProgress = detectNoProgress(previousObservations, problem);
  let decision = selectDiagnosticRoute({ classification, safety, ledger, noProgress });
  const nextTest = decision.route === 'diagnose' && !noProgress.exhausted
    ? selectNextBestTest(
        { hypotheses, contradictions, language, safety, classification, capabilities, rawEvidenceText: conversationEvidence },
        { previousObservations, axisOffset: noProgress.detected ? Math.max(1, noProgress.consecutive) : 0 },
      )
    : null;
  if (decision.route === 'diagnose' && noProgress.detected && !noProgress.exhausted && !nextTest) {
    noProgress = immutable({ ...noProgress, exhausted: true, strategy: 'stop_questions', reason: `${noProgress.reason || 'no_progress'}_no_alternative` });
    decision = selectDiagnosticRoute({ classification, safety, ledger, noProgress });
  }
  let repairGate = evaluateRepairGate({
    ledger,
    safety,
    contradictions,
    hypotheses,
    technique,
    modelSpecific: Boolean(classification?.model && classification?.brand),
    research,
  });

  let state = createDiagnosticState({ analysisId, runId: actualRunId, language });
  state = transitionForDecision(state, safety, repairGate, nextTest);
  let plan = buildRepairPlanV9({ gate: repairGate, technique, legacyDiagnosis, nextTest, language });
  let criticResult = immutable({ approved: false, status: 'not_run', issues: [], modelUsed: false });

  if (plan.repairAuthorized) {
    criticResult = await runIndependentCritic({ plan, gate: repairGate, safety, ledger, critic });
    if (!criticResult.approved) {
      repairGate = immutable({
        ...repairGate,
        open: false,
        status: 'blocked_critic',
        route: 'more_info',
        reasons: Object.freeze([...repairGate.reasons, ...criticResult.issues]),
      });
      state = createDiagnosticState({ analysisId, runId: actualRunId, language });
      state = transitionForDecision(state, safety, repairGate, nextTest);
      plan = buildRepairPlanV9({ gate: repairGate, technique, legacyDiagnosis, nextTest, language });
    }
  }

  const directHelp = decision.route === 'direct_help'
    ? buildDirectHelp({ classification, hypotheses, safety })
    : null;

  const deterministicResponse = buildFallbackConsumerResponse({
    language, problem, ledger, noProgress, safety, classification, hypotheses, nextTest, directHelp,
  });
  let aiFallbackReason = typeof reasoner === 'function' ? null : (aiUnavailableReason || 'ai_unavailable');
  if (!['stop', 'professional'].includes(safety.route) && typeof reasoner === 'function') {
    const aiStarted = Date.now();
    try {
      providerCallStarted = true;
      const assisted = await reasoner({
        language, originalUserInput: problem, classification, safety,
        evidenceLedger: ledger.entries.map(entry => ({
          evidenceId: entry.evidenceId,
          source: entry.source,
          subject: entry.subject,
          predicate: entry.predicate,
          value: entry.value,
          polarity: entry.polarity,
          status: entry.status,
          turnNumber: entry.turnNumber,
          evidenceKey: cleanText(entry.provenance?.evidenceKey, 120) || null,
          answerKind: cleanText(entry.provenance?.answerKind, 80) || null,
          semanticClaim: cleanText(entry.provenance?.semanticClaim, 500) || null,
        })),
        answeredEvidenceAxes: [...handledEvidenceAxes({ ledger, rawText: conversationEvidence })],
        hypotheses: hypotheses.filter(item => item.code !== 'unclassified_failure' && !/onvoldoende afgebakend|insufficiently defined|nicht ausreichend eingegrenzt/i.test(item.statement)),
        contradictions, previousTurns: asArray(previousObservations), route: decision.route,
        repairGate, noProgress, capabilities,
      });
      aiCalls = 1;
      providerCallCompleted = true;
      assistedHypotheses = [...assistedHypotheses, ...asArray(assisted?.hypotheses)];
      assistedResponse = assisted?.consumerResponse;
      providerResponseNormalization = assisted?.normalization || null;
    } catch (error) {
      aiCalls = 1;
      providerCallCompleted = error?.providerCallCompleted === true;
      providerCallFailed = !providerCallCompleted;
      aiError = String(error?.message || error);
      providerFailure = error?.providerFailure || null;
      providerResponseNormalization = error?.normalization || null;
      aiFallbackReason = providerResponseNormalization?.normalizationFailureReason
        || providerFailure?.reason
        || (/timed?\s*out|timeout/i.test(aiError) ? 'ai_timeout' : 'ai_provider_error');
    } finally {
      aiLatencyMs = Date.now() - aiStarted;
    }
  } else if (['stop', 'professional'].includes(safety.route)) {
    aiFallbackReason ||= 'deterministic_safety';
  }

  if (assistedHypotheses.length > asArray(modelHypotheses).length) {
    hypotheses = generateHypotheses({ ledger, classification, modelProposals: assistedHypotheses });
  }

  const consumerValidation = validateConsumerResponseV1(assistedResponse, {
    language, repairGate, safety, ledger, fallback: deterministicResponse, capabilities,
  });
  const consumerResponse = consumerValidation.valid ? consumerValidation.response : deterministicResponse;
  const aiPreValidationResponse = mode === 'tester' ? preValidationSnapshot(assistedResponse) : null;
  if (!consumerValidation.valid && assistedResponse && !aiFallbackReason) aiFallbackReason = consumerValidation.reason;

  return immutable({
    schemaVersion: '9.0',
    engineVersion: V9_ENGINE_VERSION,
    runId: actualRunId,
    inputFingerprint: stableHash(ledger.entries.map(entry => ({
      source: entry.source,
      subject: entry.subject,
      predicate: entry.predicate,
      value: entry.value,
      polarity: entry.polarity,
    }))),
    analysisId,
    mode,
    ledger,
    contradictions,
    safety,
    decision,
    noProgress,
    hypotheses,
    nextTest,
    directHelp,
    consumerResponse,
    repairGate,
    critic: criticResult,
    state,
    plan,
    metrics: immutable({
      totalMs: Date.now() - started,
      externalAiCalls: aiCalls + (criticResult.modelUsed ? 1 : 0),
      primaryAiCalls: aiCalls,
      aiLatencyMs,
      aiFallback: consumerValidation.valid !== true,
      aiFallbackReason: consumerValidation.valid ? null : (aiFallbackReason || consumerValidation.reason),
      aiCallReason: aiCalls ? 'reasoning_and_consumer_response' : null,
      aiModel: cleanText(reasoner?.modelId, 160) || null,
      externalResearchCalls: 0,
      aiError,
      aiPlanned,
      aiSuppressedBeforeProvider: aiPlanned && !providerCallStarted,
      providerCallStarted,
      providerCallCompleted,
      providerCallFailed,
      providerFailure,
      providerResponseNormalization,
      validationResult: assistedResponse ? (consumerValidation.valid ? 'valid' : 'invalid') : 'not_run',
      validationReason: consumerValidation.valid ? null : consumerValidation.reason,
      canonicalizationActions: consumerValidation.canonicalizationActions || Object.freeze([]),
      aiPreValidationResponse,
      aiCallsThisSession: aiCalls + (priorAiAttempt ? 1 : 0),
      successfulAiCalls: aiCalls && consumerValidation.valid ? 1 : 0,
      rejectedAiCalls: (priorAiAttempt ? 1 : 0) + (aiCalls && !consumerValidation.valid ? 1 : 0),
      capacityUnavailable: ['daily_quota_exhausted', 'ai_temporary_capacity_unavailable'].includes(aiFallbackReason),
    }),
  });
}
