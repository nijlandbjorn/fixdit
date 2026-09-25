import { asArray, cleanText, immutable, stableHash } from './contracts.js';

function structuredStep(action, index, count, type = 'repair') {
  const safeAction = cleanText(action, 1200);
  return immutable({
    id: index + 1,
    stepId: `step_${stableHash([index, safeAction])}`,
    type,
    action: safeAction,
    detail: '',
    why: 'Deze stap volgt uit de geselecteerde en vrijgegeven reparatieroute.',
    check: immutable({
      question: index === count - 1 ? 'Is het waarneembare probleem na deze stap opgelost?' : 'Kun je deze stap veilig en volledig afronden?',
      yesResult: index === count - 1 ? 'Controleer het resultaat onder normaal en veilig gebruik.' : 'Ga door naar de volgende stap.',
      yesNextStepId: index === count - 1 ? 0 : index + 2,
      noResult: 'Stop en leg vast wat afwijkt voordat je verdergaat.',
      noNextStepId: 0,
    }),
  });
}

export function buildRepairPlanV9({ gate, technique, legacyDiagnosis = null, nextTest = null, language = 'nl' } = {}) {
  if (gate?.open !== true) {
    return immutable({
      schemaVersion: '9.0',
      mode: 'diagnostic',
      route: gate?.route || 'more_info',
      repairAuthorized: false,
      technique: null,
      steps: Object.freeze([]),
      nextTest,
      reasons: Object.freeze(asArray(gate?.reasons)),
      language,
    });
  }

  const actions = asArray(legacyDiagnosis?.safeSteps).map(action => cleanText(action, 1200)).filter(Boolean);
  if (!actions.length) throw new Error('REPAIR_PLAN_ACTIONS_MISSING');
  const steps = actions.map((action, index) => structuredStep(action, index, actions.length));
  return immutable({
    schemaVersion: '9.0',
    mode: 'repair',
    route: gate.route,
    repairAuthorized: true,
    technique: immutable({
      id: cleanText(technique?.techniqueId ?? technique?.id, 160),
      name: cleanText(technique?.techniqueName ?? technique?.name, 500),
      repairabilityStatus: technique?.repairabilityStatus,
      evidenceSourceIds: Object.freeze(asArray(technique?.evidenceSourceIds)),
    }),
    steps: Object.freeze(steps),
    verification: Object.freeze(asArray(legacyDiagnosis?.completionChecks).map(value => cleanText(value, 600)).filter(Boolean)),
    nextTest: null,
    reasons: Object.freeze([]),
    language,
  });
}
