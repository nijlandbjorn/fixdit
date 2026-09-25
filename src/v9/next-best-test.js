import { asArray, cleanText, immutable, stableHash } from './contracts.js';
import { buildPhotoRequest } from './photo-request.js';

const VISUAL_FACTS = /location|damage|attachment|material|crack|leak|visible|condition/i;

function localQuestion(fact, language) {
  const labels = {
    nl: `Wat zie je precies voor ${fact.replaceAll('_', ' ')}?`,
    en: `What exactly do you observe for ${fact.replaceAll('_', ' ')}?`,
    de: `Was genau beobachtest du bei ${fact.replaceAll('_', ' ')}?`,
  };
  return labels[language] || labels.nl;
}

export function rankNextBestTests({ hypotheses = [], contradictions = [], language = 'nl' } = {}) {
  const candidates = [];

  for (const contradiction of asArray(contradictions).filter(item => item.resolved !== true)) {
    const prompt = localQuestion(`${contradiction.subject}_${contradiction.predicate}`, language);
    candidates.push({
      code: `resolve_${contradiction.contradictionId}`,
      kind: 'question',
      prompt,
      hypothesisIds: [],
      resolvesContradictionIds: [contradiction.contradictionId],
      informationGain: contradiction.severity === 'blocking' ? 1 : 0.8,
      effort: 0.1,
      safetyClass: 'observation_only',
    });
  }

  for (const hypothesis of asArray(hypotheses)) {
    for (const fact of asArray(hypothesis.missingEvidence).slice(0, 2)) {
      const visual = VISUAL_FACTS.test(fact);
      const photoSpec = visual
        ? buildPhotoRequest({ target: fact.replaceAll('_', ' '), purpose: hypothesis.statement, language })
        : null;
      candidates.push({
        code: `${hypothesis.code}_${fact}`,
        kind: visual ? 'photo' : 'question',
        prompt: photoSpec?.prompt || localQuestion(fact, language),
        photoSpec,
        hypothesisIds: [hypothesis.hypothesisId],
        resolvesContradictionIds: [],
        informationGain: Math.max(0.2, 0.9 - hypothesis.score * 0.35),
        effort: visual ? 0.35 : 0.15,
        safetyClass: 'observation_only',
      });
    }
  }

  return Object.freeze(candidates
    .map(candidate => immutable({
      testId: `test_${stableHash(candidate.code)}`,
      ...candidate,
      rankScore: Number((candidate.informationGain - candidate.effort * 0.35).toFixed(4)),
    }))
    .sort((a, b) => b.rankScore - a.rankScore || a.testId.localeCompare(b.testId)));
}

export function selectNextBestTest(input) {
  return rankNextBestTests(input)[0] || null;
}
