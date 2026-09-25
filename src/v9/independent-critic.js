import { asArray, cleanText, immutable } from './contracts.js';

function deterministicIssues({ plan, gate, safety, ledger }) {
  const issues = [];
  if (gate?.open !== true) issues.push('repair_gate_closed');
  if (['stop', 'professional'].includes(safety?.route)) issues.push('safety_route_blocks_repair');
  if (plan?.repairAuthorized !== true) issues.push('repair_not_authorized');
  if (!asArray(plan?.steps).length) issues.push('steps_missing');
  const evidenceIds = new Set(asArray(ledger?.entries).filter(item => item.status === 'active').map(item => item.evidenceId));
  for (const sourceId of asArray(plan?.technique?.evidenceSourceIds)) {
    if (!evidenceIds.has(sourceId)) issues.push('unknown_evidence_reference');
  }
  for (const step of asArray(plan?.steps)) {
    if (!cleanText(step?.action) || !cleanText(step?.why) || !cleanText(step?.check?.question)) {
      issues.push('incomplete_structured_step');
      break;
    }
    if (step.check.yesNextStepId !== 0 && step.check.yesNextStepId <= step.id) {
      issues.push('non_forward_step_branch');
      break;
    }
  }
  return [...new Set(issues)];
}

export async function runIndependentCritic({ plan, gate, safety, ledger, critic = null } = {}) {
  const deterministic = deterministicIssues({ plan, gate, safety, ledger });
  if (deterministic.length) {
    return immutable({ approved: false, status: 'rejected_deterministic', issues: deterministic, modelUsed: false });
  }

  if (typeof critic !== 'function') {
    return immutable({ approved: false, status: 'unavailable_fail_closed', issues: ['independent_critic_unavailable'], modelUsed: false });
  }

  try {
    const result = await critic(immutable({
      evidence: asArray(ledger?.entries).filter(item => item.status === 'active'),
      gate,
      safety,
      plan,
      instruction: 'Review independently. Do not add actions. Return approved:boolean and issues:string[].',
    }));
    if (result?.approved !== true || !Array.isArray(result?.issues)) {
      return immutable({ approved: false, status: 'rejected_model', issues: asArray(result?.issues).length ? result.issues : ['critic_rejected'], modelUsed: true });
    }
    return immutable({ approved: true, status: 'approved', issues: [], modelUsed: true });
  } catch {
    return immutable({ approved: false, status: 'error_fail_closed', issues: ['independent_critic_error'], modelUsed: true });
  }
}
