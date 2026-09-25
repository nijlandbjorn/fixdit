import { asArray, cleanText, immutable } from './contracts.js';

const PHASES = new Set(['collecting_evidence', 'testing', 'repair_ready', 'safety_stop', 'professional', 'closed']);

export function createDiagnosticState({ analysisId = '', runId = '', language = 'nl' } = {}) {
  return immutable({
    schemaVersion: '9.0',
    analysisId: cleanText(analysisId, 160),
    runId: cleanText(runId, 160),
    revision: 1,
    phase: 'collecting_evidence',
    language: ['nl', 'en', 'de'].includes(language) ? language : 'nl',
    activeHypothesisId: null,
    activeTestId: null,
    completedTestIds: Object.freeze([]),
    history: Object.freeze([]),
  });
}

export function transitionDiagnosticState(state, event) {
  if (!state || !PHASES.has(state.phase)) throw new Error('INVALID_DIAGNOSTIC_STATE');
  if (Number(event?.expectedRevision) !== state.revision) throw new Error('STATE_REVISION_CONFLICT');

  let phase = state.phase;
  let activeHypothesisId = state.activeHypothesisId;
  let activeTestId = state.activeTestId;
  const completedTestIds = [...asArray(state.completedTestIds)];

  switch (event.type) {
    case 'select_test':
      if (['safety_stop', 'professional', 'closed'].includes(phase)) throw new Error('STATE_TERMINAL');
      phase = 'testing';
      activeTestId = cleanText(event.testId, 160) || null;
      activeHypothesisId = cleanText(event.hypothesisId, 160) || activeHypothesisId;
      break;
    case 'complete_test':
      if (phase !== 'testing' || cleanText(event.testId, 160) !== activeTestId) throw new Error('ACTIVE_TEST_MISMATCH');
      completedTestIds.push(activeTestId);
      activeTestId = null;
      phase = 'collecting_evidence';
      break;
    case 'repair_gate_open':
      if (['safety_stop', 'professional', 'closed'].includes(phase)) throw new Error('STATE_TERMINAL');
      activeTestId = null;
      phase = 'repair_ready';
      break;
    case 'safety_stop':
      activeTestId = null;
      phase = 'safety_stop';
      break;
    case 'professional':
      activeTestId = null;
      phase = 'professional';
      break;
    case 'close':
      activeTestId = null;
      phase = 'closed';
      break;
    default:
      throw new Error(`UNKNOWN_STATE_EVENT:${event.type}`);
  }

  return immutable({
    ...state,
    revision: state.revision + 1,
    phase,
    activeHypothesisId,
    activeTestId,
    completedTestIds: Object.freeze([...new Set(completedTestIds)]),
    history: Object.freeze([...asArray(state.history), immutable({
      revision: state.revision + 1,
      type: event.type,
      testId: cleanText(event.testId, 160) || null,
    })].slice(-30)),
  });
}
