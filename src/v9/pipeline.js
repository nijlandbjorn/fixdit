import { V9_ENGINE_VERSION, asArray, immutable, stableHash } from './contracts.js';
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
} = {}) {
  const started = Date.now();
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
  let assistedHypotheses = asArray(modelHypotheses);
  if (!['stop', 'professional'].includes(safety.route) && typeof reasoner === 'function') {
    try {
      const assisted = await reasoner({ problem, language, classification, evidence: ledger.entries.map(entry => ({ source: entry.source, predicate: entry.predicate, value: entry.value })) });
      aiCalls += 1;
      assistedHypotheses = [...assistedHypotheses, ...asArray(assisted?.hypotheses)];
    } catch (error) {
      aiCalls += 1;
      aiError = String(error?.message || error);
    }
  }
  const hypotheses = generateHypotheses({ ledger, classification, modelProposals: assistedHypotheses });
  const noProgress = detectNoProgress(previousObservations, problem);
  const decision = selectDiagnosticRoute({ classification, safety, ledger, noProgress });
  const nextTest = decision.route === 'diagnose' && !noProgress.exhausted
    ? selectNextBestTest({ hypotheses, contradictions, language, safety, classification })
    : null;
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
    repairGate,
    critic: criticResult,
    state,
    plan,
    metrics: immutable({ totalMs: Date.now() - started, externalAiCalls: aiCalls + (criticResult.modelUsed ? 1 : 0), externalResearchCalls: 0, aiError }),
  });
}
