import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const migrationsDir = new URL('../migrations/', import.meta.url);

test('alle lokale D1-migraties zijn in volgorde toepasbaar op SQLite', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE analysis_sessions (
      analysis_id TEXT PRIMARY KEY,
      request_id TEXT UNIQUE NOT NULL,
      device_id TEXT NOT NULL,
      diagnosis_json TEXT NOT NULL
    );
  `);

  const files = (await readdir(migrationsDir))
    .filter(name => name.endsWith('.sql'))
    .sort();
  assert.deepEqual(files, [
    '0001_existing_v86_repair_tables.sql',
    '0002_v9_diagnostic_state.sql',
    '0003_v9_shadow_comparisons.sql',
    '0004_outcome_idempotency.sql',
  ]);

  for (const file of files) {
    db.exec(await readFile(new URL(file, migrationsDir), 'utf8'));
  }

  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
    ORDER BY name
  `).all().map(row => row.name);

  for (const expected of [
    'repair_outcomes',
    'repair_research_cache',
    'repair_research_sources',
    'repair_techniques',
    'v9_comparisons',
    'v9_decisions',
    'v9_evidence',
    'v9_hypotheses',
    'v9_outcomes',
    'v9_runs',
    'v9_state',
    'v9_tests',
  ]) {
    assert.ok(tables.includes(expected), `missing table ${expected}`);
  }

  db.close();
});

test('repair outcomes zijn lokaal idempotent per analyse en techniek', async () => {
  const db = new DatabaseSync(':memory:');
  for (const file of [
    '0001_existing_v86_repair_tables.sql',
    '0002_v9_diagnostic_state.sql',
    '0004_outcome_idempotency.sql',
  ]) {
    db.exec(await readFile(new URL(file, migrationsDir), 'utf8'));
  }

  const insert = db.prepare(`
    INSERT INTO repair_outcomes(id, analysis_id, technique_key, outcome, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  insert.run('one', 'analysis-1', 'technique-1', 'successful', 1);
  assert.throws(
    () => insert.run('two', 'analysis-1', 'technique-1', 'not_helpful', 2),
    /UNIQUE constraint failed/,
  );
  db.close();
});
