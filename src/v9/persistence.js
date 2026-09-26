import { asArray } from './contracts.js';

export async function persistV9Run(env, result, comparison = null) {
  if (!env?.DB || !result?.runId) return { persisted: false, reason: 'db_unavailable' };
  const now = Math.floor(Date.now() / 1000);
  try {
    const statements = [
      env.DB.prepare(`INSERT INTO v9_runs
        (run_id, analysis_id, engine_version, mode, status, input_hash, language, metrics_json, started_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          result.runId,
          result.analysisId || null,
          result.engineVersion,
          result.mode,
          'completed',
          result.inputFingerprint || result.runId,
          result.state?.language || 'nl',
          JSON.stringify(result.metrics || {}),
          now,
          now,
        ),
      ...asArray(result.ledger?.entries).map(entry => env.DB.prepare(`INSERT INTO v9_evidence
        (evidence_id, run_id, turn_number, source, claim_type, subject, predicate, value_json, polarity, confidence, provenance_json, status, supersedes_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          entry.evidenceId, result.runId, entry.turnNumber, entry.source, 'observation', entry.subject,
          entry.predicate, JSON.stringify(entry.value), entry.polarity, entry.confidence,
          JSON.stringify(entry.provenance || {}), entry.status, entry.supersedesId || null, now,
        )),
      ...asArray(result.hypotheses).map(hypothesis => env.DB.prepare(`INSERT INTO v9_hypotheses
        (hypothesis_id, run_id, code, statement, score, status, supporting_evidence_json,
         opposing_evidence_json, falsifiers_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          hypothesis.hypothesisId, result.runId, hypothesis.code, hypothesis.statement,
          hypothesis.score, hypothesis.status, JSON.stringify(hypothesis.supportingEvidenceIds || []),
          JSON.stringify(hypothesis.opposingEvidenceIds || []), JSON.stringify(hypothesis.falsifiers || []),
          now, now,
        )),
      ...(result.nextTest ? [env.DB.prepare(`INSERT INTO v9_tests
        (test_id, run_id, hypothesis_ids_json, kind, prompt, photo_spec_json, safety_class,
         information_gain, effort, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          result.nextTest.testId, result.runId, JSON.stringify(result.nextTest.hypothesisIds || []),
          result.nextTest.kind, result.nextTest.prompt, result.nextTest.photoSpec ? JSON.stringify(result.nextTest.photoSpec) : null,
          result.nextTest.safetyClass, result.nextTest.informationGain, result.nextTest.effort, 'pending', now,
        )] : []),
      ...(result.analysisId ? [env.DB.prepare(`INSERT INTO v9_state
        (analysis_id, run_id, revision, phase, active_hypothesis_id, active_test_id, state_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(analysis_id) DO UPDATE SET
          run_id = excluded.run_id,
          revision = v9_state.revision + 1,
          phase = excluded.phase,
          active_hypothesis_id = excluded.active_hypothesis_id,
          active_test_id = excluded.active_test_id,
          state_json = excluded.state_json,
          updated_at = excluded.updated_at`)
        .bind(
          result.analysisId, result.runId, result.state?.revision || 1, result.state?.phase || 'collecting_evidence',
          result.state?.activeHypothesisId || null, result.state?.activeTestId || null,
          JSON.stringify(result.state || {}), now,
        )] : []),
      env.DB.prepare(`INSERT INTO v9_decisions
        (decision_id, run_id, decision_type, status, reasons_json, input_refs_json, decision_json, created_at)
        VALUES (?, ?, 'safety', ?, ?, ?, ?, ?)`)
        .bind(
          `dec_${result.runId}_safety`, result.runId, result.safety?.route || 'clear',
          JSON.stringify(asArray(result.safety?.flags).map(flag => flag.code)),
          JSON.stringify(asArray(result.safety?.flags).flatMap(flag => flag.evidenceIds || [])),
          JSON.stringify(result.safety || {}), now,
        ),
      env.DB.prepare(`INSERT INTO v9_decisions
        (decision_id, run_id, decision_type, status, reasons_json, input_refs_json, decision_json, created_at)
        VALUES (?, ?, 'repair_gate', ?, ?, ?, ?, ?)`)
        .bind(
          `dec_${result.runId}_gate`, result.runId, result.repairGate?.status || 'unknown',
          JSON.stringify(result.repairGate?.reasons || []), JSON.stringify(result.repairGate?.evidenceIds || []),
          JSON.stringify(result.repairGate || {}), now,
        ),
      env.DB.prepare(`INSERT INTO v9_decisions
        (decision_id, run_id, decision_type, status, reasons_json, input_refs_json, decision_json, created_at)
        VALUES (?, ?, 'critic', ?, ?, ?, ?, ?)`)
        .bind(
          `dec_${result.runId}_critic`, result.runId, result.critic?.status || 'not_run',
          JSON.stringify(result.critic?.issues || []), JSON.stringify(result.repairGate?.evidenceIds || []),
          JSON.stringify(result.critic || {}), now,
        ),
    ];
    await env.DB.batch(statements);

    if (comparison) {
      await env.DB.prepare(`INSERT INTO v9_comparisons
        (comparison_id, analysis_id, v8_run_ref, v9_run_id, safety_match, route_match,
         unsupported_claim_count, contradiction_count, latency_delta_ms, comparison_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          `cmp_${result.runId}`,
          result.analysisId || null,
          result.analysisId || 'unpersisted-v8',
          result.runId,
          comparison.safetyMatch ? 1 : 0,
          comparison.routeMatch ? 1 : 0,
          comparison.criticIssueCount || 0,
          comparison.contradictionCount || 0,
          comparison.latencyDeltaMs || 0,
          JSON.stringify(comparison),
          now,
        ).run();
    }
    return { persisted: true };
  } catch (error) {
    return { persisted: false, reason: 'persistence_failed', error: String(error?.message || error) };
  }
}
