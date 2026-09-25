-- Production preflight must first verify that no duplicate
-- (analysis_id, technique_key) rows exist. This migration is not auto-applied.
CREATE UNIQUE INDEX IF NOT EXISTS uq_repair_outcome_analysis_technique
  ON repair_outcomes(analysis_id, technique_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v9_outcome_run_type_step
  ON v9_outcomes(run_id, outcome_type, COALESCE(step_id, ''));
