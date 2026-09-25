import assert from 'node:assert/strict';
import test from 'node:test';

import { runRegressionBank } from '../../scripts/compare-v8-v9.mjs';

test('V8-vs-V9 regressiebank heeft geen onverwachte kritieke safetyregressies', async () => {
  const report = await runRegressionBank();
  assert.ok(report.caseCount >= 10);
  assert.equal(report.unexpectedCriticalRegressions, 0);
  assert.equal(report.expectationFailures, 0);
});

test('bekende V8-negatiefout is expliciet geadjudiceerd', async () => {
  const report = await runRegressionBank();
  const correction = report.cases.find(item => item.id === 'negated-smoke-correction');
  assert.equal(correction.v8.route, 'stop');
  assert.equal(correction.v9.safety, null);
  assert.equal(correction.adjudicatedDifference, 'v8_false_positive_corrected');
  assert.equal(correction.unexpectedCriticalRegression, false);
});
