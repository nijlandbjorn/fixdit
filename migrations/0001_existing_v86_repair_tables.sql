-- Defines tables already referenced by index.js. Apply only after a production
-- preflight; this repository never applies migrations automatically.
CREATE TABLE IF NOT EXISTS repair_techniques (
  id TEXT PRIMARY KEY,
  object_type TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  symptom TEXT,
  technique_key TEXT NOT NULL,
  technique_name TEXT NOT NULL,
  repairability_status TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  successful_repairs INTEGER NOT NULL DEFAULT 0,
  failed_repairs INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_techniques_lookup
  ON repair_techniques(object_type, brand, model, symptom);
CREATE INDEX IF NOT EXISTS idx_repair_techniques_key
  ON repair_techniques(technique_key);

CREATE TABLE IF NOT EXISTS repair_research_cache (
  cache_key TEXT PRIMARY KEY,
  query_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_research_cache_expiry
  ON repair_research_cache(expires_at);

CREATE TABLE IF NOT EXISTS repair_research_sources (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  query_text TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL,
  trust_score REAL NOT NULL DEFAULT 0,
  snippet TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_sources_analysis
  ON repair_research_sources(analysis_id, created_at);

CREATE TABLE IF NOT EXISTS repair_outcomes (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  technique_key TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('successful', 'not_helpful')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_outcomes_analysis
  ON repair_outcomes(analysis_id, created_at);
