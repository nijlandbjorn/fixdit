CREATE TABLE IF NOT EXISTS v9_comparisons (
  comparison_id TEXT PRIMARY KEY,
  analysis_id TEXT,
  v8_run_ref TEXT NOT NULL,
  v9_run_id TEXT NOT NULL,
  safety_match INTEGER NOT NULL CHECK (safety_match IN (0, 1)),
  route_match INTEGER NOT NULL CHECK (route_match IN (0, 1)),
  unsupported_claim_count INTEGER NOT NULL DEFAULT 0,
  contradiction_count INTEGER NOT NULL DEFAULT 0,
  latency_delta_ms INTEGER NOT NULL DEFAULT 0,
  comparison_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (v9_run_id) REFERENCES v9_runs(run_id)
);

CREATE INDEX IF NOT EXISTS idx_v9_comparisons_created
  ON v9_comparisons(created_at);
CREATE INDEX IF NOT EXISTS idx_v9_comparisons_safety
  ON v9_comparisons(safety_match, created_at);
