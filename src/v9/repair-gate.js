import { asArray, immutable } from './contracts.js';
import { activeEvidence } from './evidence-ledger.js';
import { unresolvedContradictions } from './contradiction-detector.js';

export function evaluateRepairGate({
  ledger,
  safety,
  contradictions = [],
  hypotheses = [],
  technique = null,
  modelSpecific = false,
  research = null,
} = {}) {
  const reasons = [];
  const evidenceIds = activeEvidence(ledger).map(entry => entry.evidenceId);
  const blockingContradictions = unresolvedContradictions(contradictions)
    .filter(item => item.severity === 'blocking');
  const topHypothesis = asArray(hypotheses).find(item => item.status !== 'rejected') || null;

  if (safety?.route === 'stop' || safety?.route === 'professional') {
    reasons.push(`safety_${safety.route}`);
    return immutable({
      status: 'blocked_safety',
      open: false,
      route: safety.route,
      reasons,
      evidenceIds,
      hypothesisId: topHypothesis?.hypothesisId || null,
    });
  }

  if (blockingContradictions.length) reasons.push('blocking_contradiction');
  if (!evidenceIds.length) reasons.push('no_active_evidence');
  if (!topHypothesis || Number(topHypothesis.score) < 0.58) reasons.push('hypothesis_below_threshold');
  if (asArray(topHypothesis?.opposingEvidenceIds).length) reasons.push('hypothesis_challenged');

  const repairability = technique?.repairabilityStatus;
  if (!['DIY_CONFIDENT', 'DIY_WITH_CAUTION'].includes(repairability)) {
    reasons.push(repairability === 'PROFESSIONAL_REQUIRED' ? 'technique_requires_professional' : 'technique_not_ready');
  }

  const researchSources = asArray(research?.sources);
  if (modelSpecific && !researchSources.some(source => Number(source.trustScore) >= 0.8)) {
    reasons.push('model_specific_research_missing');
  }

  const open = reasons.length === 0;
  return immutable({
    status: open ? 'open' : 'needs_evidence',
    open,
    route: open ? (repairability === 'DIY_WITH_CAUTION' ? 'caution' : 'self') : 'more_info',
    reasons,
    evidenceIds,
    hypothesisId: topHypothesis?.hypothesisId || null,
  });
}
