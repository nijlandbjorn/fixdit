import { pathToFileURL } from 'node:url';
import { benchmarkCases } from '../tests/fixtures/v9-benchmark.mjs';
import { classificationFromV8, techniqueFromV8 } from '../src/v9/v8-adapter.js';
import { runPipelineV9 } from '../src/v9/pipeline.js';
import { compareV8V9 } from '../src/v9/comparator.js';

export async function runBenchmark() {
  const cases = [];
  for (const fixture of benchmarkCases) {
    // Deliberately unhelpful legacy inference. Expectations are never input.
    const legacy = { objectFamily: 'other', symptom: 'unknown', intent: 'repair', route: 'more_info' };
    const classification = classificationFromV8(legacy, { problem: fixture.input });
    const result = await runPipelineV9({ runId: fixture.id, problem: fixture.input, language: fixture.language,
      previousObservations: fixture.previousObservations, classification, technique: techniqueFromV8(legacy) });
    const comparison = compareV8V9(legacy, result);
    const failures = [];
    const classificationOK = Object.entries(fixture.classification).every(([key, value]) => classification[key] === value);
    const safetyOK = result.safety.route === fixture.safety.route;
    const hypothesesOK = fixture.expectedHypothesisFamilies.every(code => result.hypotheses.some(h => h.code === code)) &&
      result.hypotheses.every(h => h.supportingEvidenceIds.length > 0);
    const nextOK = fixture.expectedNextTestType === null ? result.nextTest === null :
      fixture.expectedNextTestType.includes(result.nextTest?.kind) && fixture.forbiddenNextTestPatterns.every(pattern => !new RegExp(pattern, 'i').test(result.nextTest.prompt));
    if (!classificationOK) failures.push('classification');
    if (!safetyOK) failures.push('safety');
    if (!hypothesesOK) failures.push('hypotheses');
    if (!nextOK) failures.push('next_test');
    if (result.repairGate.open) failures.push('premature_repair');
    if (!fixture.allowedRoutes.includes(result.safety.route || result.repairGate.route)) failures.push('route');
    const raw = result.ledger.entries.find(e => e.source === 'user_text');
    if (raw?.value !== fixture.input) failures.push('raw_evidence');
    for (const e of result.ledger.entries.filter(e => e.source === 'deterministic_normalization')) {
      if (!e.provenance.evidenceSourceIds?.includes(raw.evidenceId)) failures.push('provenance');
    }
    cases.push({ id: fixture.id, category: fixture.category, classification, safety: result.safety, hypotheses: result.hypotheses,
      nextTest: result.nextTest, gate: result.repairGate, comparison, failures: [...new Set(failures)], classificationOK, hypothesesOK, nextOK,
      expectedSafety: fixture.safety.route });
  }
  const count = predicate => cases.filter(predicate).length;
  return { metrics: { total: cases.length,
    categories: Object.fromEntries([...new Set(cases.map(c => c.category))].map(k => [k, count(c => c.category === k)])),
    safetyTruePositive: count(c => c.expectedSafety && c.safety.route === c.expectedSafety),
    safetyFalsePositive: count(c => !c.expectedSafety && c.safety.route),
    safetyFalseNegative: count(c => c.expectedSafety && c.safety.route !== c.expectedSafety),
    safetyAligned: count(c => c.expectedSafety === c.safety.route),
    classificationAcceptable: count(c => c.classificationOK), classificationIncorrect: count(c => !c.classificationOK),
    usefulHypothesis: count(c => c.hypothesesOK), usefulNextTest: count(c => c.nextOK && c.nextTest),
    poorNextTest: count(c => !c.nextOK), gateCorrectlyClosed: count(c => !c.gate.open), gateIncorrectlyOpened: count(c => c.gate.open),
    gateCorrectlyOpened: 0, prematureRepair: count(c => c.gate.open),
    comparatorAligned: count(c => c.comparison.status === 'aligned'), comparatorNeedsReview: count(c => c.comparison.status === 'needs_review'),
    criticalRegression: count(c => c.comparison.criticalRegression), failedCases: count(c => c.failures.length) }, cases };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runBenchmark();
  console.log(JSON.stringify(process.argv.includes('--full') ? report : { metrics: report.metrics, failures: report.cases.filter(c => c.failures.length).map(c => ({ id: c.id, failures: c.failures, classification: c.classification, safety: c.safety.route })) }, null, 2));
  process.exitCode = report.metrics.failedCases ? 1 : 0;
}
