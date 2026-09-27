import assert from 'node:assert/strict';
import test from 'node:test';

import { runBenchmark } from '../../scripts/benchmark-v9.mjs';

test('V9 diagnostic benchmark bewaakt classification, safety, evidence, tests en gate', async () => {
  const report = await runBenchmark();
  assert.ok(report.metrics.total >= 100);
  assert.equal(report.metrics.safetyFalsePositive, 0);
  assert.equal(report.metrics.safetyFalseNegative, 0);
  assert.equal(report.metrics.classificationIncorrect, 0);
  assert.equal(report.metrics.poorNextTest, 0);
  assert.equal(report.metrics.gateIncorrectlyOpened, 0);
  assert.equal(report.metrics.prematureRepair, 0);
  assert.equal(report.metrics.criticalRegression, 0);
  assert.equal(report.metrics.failedCases, 0);
});
