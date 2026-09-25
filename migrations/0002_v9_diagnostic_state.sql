CREATE TABLE IF NOT EXISTS v9_runs (
  run_id TEXT PRIMARY KEY,
  analysis_id TEXT,
  parent_run_id TEXT,
  engine_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('local', 'shadow', 'tester', 'canary')),
  status TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  language TEXT NOT NULL,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_v9_runs_analysis
  ON v9_runs(analysis_id, started_at);
CREATE INDEX IF NOT EXISTS idx_v9_runs_mode_status
  ON v9_runs(mode, status, started_at);

CREATE TABLE IF NOT EXISTS v9_evidence (
  evidence_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  value_json TEXT NOT NULL,
  polarity TEXT NOT NULL CHECK (polarity IN ('present', 'absent', 'unknown')),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  provenance_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('active', 'superseded', 'rejected')),
  supersedes_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES v9_runs(run_id),
  FOREIGN KEY (supersedes_id) REFERENCES v9_evidence(evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_v9_evidence_run
  ON v9_evidence(run_id, status, turn_number);
CREATE INDEX IF NOT EXISTS idx_v9_evidence_claim
  ON v9_evidence(subject, predicate, status);

CREATE TABLE IF NOT EXISTS v9_hypotheses (
  hypothesis_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  code TEXT NOT NULL,
  statement TEXT NOT NULL,
  score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  status TEXT NOT NULL,
  supporting_evidence_json TEXT NOT NULL DEFAULT '[]',
  opposing_evidence_json TEXT NOT NULL DEFAULT '[]',
  falsifiers_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES v9_runs(run_id)
);

CREATE INDEX IF NOT EXISTS idx_v9_hypotheses_run
  ON v9_hypotheses(run_id, status, score DESC);

CREATE TABLE IF NOT EXISTS v9_tests (
  test_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  hypothesis_ids_json TEXT NOT NULL DEFAULT '[]',
  kind TEXT NOT NULL CHECK (kind IN ('question', 'observation', 'photo', 'safe_action')),
  prompt TEXT NOT NULL,
  photo_spec_json TEXT,
  safety_class TEXT NOT NULL,
  information_gain REAL NOT NULL DEFAULT 0,
  effort REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  result_evidence_id TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (run_id) REFERENCES v9_runs(run_id),
  FOREIGN KEY (result_evidence_id) REFERENCES v9_evidence(evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_v9_tests_run
  ON v9_tests(run_id, status, information_gain DESC);

CREATE TABLE IF NOT EXISTS v9_state (
  analysis_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  phase TEXT NOT NULL,
  active_hypothesis_id TEXT,
  active_test_id TEXT,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES v9_runs(run_id)
);

CREATE TABLE IF NOT EXISTS v9_decisions (
  decision_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  decision_type TEXT NOT NULL CHECK (decision_type IN ('safety', 'repair_gate', 'critic')),
  status TEXT NOT NULL,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  input_refs_json TEXT NOT NULL DEFAULT '[]',
  decision_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES v9_runs(run_id)
);

CREATE INDEX IF NOT EXISTS idx_v9_decisions_run
  ON v9_decisions(run_id, decision_type, created_at);

CREATE TABLE IF NOT EXISTS v9_outcomes (
  outcome_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  analysis_id TEXT,
  hypothesis_id TEXT,
  technique_key TEXT,
  step_id TEXT,
  outcome_type TEXT NOT NULL,
  outcome_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES v9_runs(run_id)
);

CREATE INDEX IF NOT EXISTS idx_v9_outcomes_run
  ON v9_outcomes(run_id, created_at);
