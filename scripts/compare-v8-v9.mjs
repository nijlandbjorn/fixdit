import { readFile } from 'node:fs/promises';

import { __v861Test as v8 } from '../index.js';
import { compareV8V9 } from '../src/v9/comparator.js';
import { runPipelineV9 } from '../src/v9/pipeline.js';

export async function runRegressionBank() {
  const fixtures = JSON.parse(await readFile(
    new URL('../tests/fixtures/v8-v9-regression-bank.json', import.meta.url),
    'utf8',
  ));
  const cases = [];

  for (const fixture of fixtures) {
    const flags = v8.hardSafetyFlags(fixture.classification, '', fixture.problem);
    const v8Decision = v8.safetyDecision(flags);
    const v8Diagnosis = {
      analysisId: `fixture-${fixture.id}`,
      route: v8Decision.route,
      risk: v8Decision.risk,
      performance: { totalMs: 0 },
    };
    const v9 = await runPipelineV9({
      analysisId: v8Diagnosis.analysisId,
      mode: 'local',
      problem: fixture.problem,
      classification: fixture.classification,
    });
    const rawComparison = compareV8V9(v8Diagnosis, v9);
    const adjudicatedDifference = fixture.expectedDifference || null;
    const unexpectedCriticalRegression = rawComparison.criticalRegression &&
      adjudicatedDifference !== 'v8_false_positive_corrected';
    cases.push({
      id: fixture.id,
      expectedV9Safety: fixture.expectedV9Safety,
      expectedPhase: fixture.expectedPhase || null,
      adjudicatedDifference,
      v8: { flags, route: v8Decision.route || null },
      v9: { safety: v9.safety.route, phase: v9.state.phase },
      rawComparison,
      unexpectedCriticalRegression,
    });
  }

  return {
    schemaVersion: '1.0',
    generatedFrom: 'tests/fixtures/v8-v9-regression-bank.json',
    caseCount: cases.length,
    unexpectedCriticalRegressions: cases.filter(item => item.unexpectedCriticalRegression).length,
    expectationFailures: cases.filter(item =>
      item.v9.safety !== item.expectedV9Safety ||
      (item.expectedPhase && item.v9.phase !== item.expectedPhase)).length,
    cases,
  };
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href) {
  const report = await runRegressionBank();
  console.log(JSON.stringify(report, null, 2));
  if (report.unexpectedCriticalRegressions || report.expectationFailures) process.exitCode = 1;
}
