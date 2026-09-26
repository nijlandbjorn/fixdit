import { asArray, cleanText, immutable, stableHash } from './contracts.js';
import { buildPhotoRequest } from './photo-request.js';

const VISUAL_FACTS = /location|damage|attachment|material|crack|leak|visible|condition/i;

const FACT_COPY = Object.freeze({
  water_supply: {
    nl: 'Bereikt water het apparaat vanuit de normale toevoer, en staat die toevoer open?',
    en: 'Is water reaching the appliance from its normal supply, and is that supply open?',
    de: 'Erreicht Wasser das Gerät über die normale Zufuhr, und ist diese geöffnet?',
  },
  accessible_path: {
    nl: 'Zijn het reservoir, filter en de bereikbare uitloop correct geplaatst en vrij van zichtbare blokkades?',
    en: 'Are the reservoir, filter and accessible outlet seated correctly and free of visible blockages?',
    de: 'Sind Behälter, Filter und der zugängliche Auslauf korrekt eingesetzt und frei von sichtbaren Blockaden?',
  },
  maintenance_history: {
    nl: 'Wanneer is het apparaat voor het laatst gereinigd of ontkalkt, en veranderde de doorstroming daarna?',
    en: 'When was the appliance last cleaned or descaled, and did the flow change afterwards?',
    de: 'Wann wurde das Gerät zuletzt gereinigt oder entkalkt, und hat sich der Durchfluss danach verändert?',
  },
  leak_location: {
    nl: 'Op welke plek verschijnt het vocht als eerste?',
    en: 'Where does the moisture first appear?',
    de: 'An welcher Stelle tritt die Feuchtigkeit zuerst auf?',
    target: { nl: 'de plek waar het vocht als eerste verschijnt', en: 'where the moisture first appears', de: 'die Stelle, an der die Feuchtigkeit zuerst auftritt' },
  },
  damage_location: {
    nl: 'Waar zie je precies een scheur, vervorming of ander beschadigd deel?',
    en: 'Where exactly can you see a crack, deformation or other damaged part?',
    de: 'Wo genau ist ein Riss, eine Verformung oder ein anderes beschädigtes Teil zu sehen?',
    target: { nl: 'het zichtbaar beschadigde deel', en: 'the visibly damaged part', de: 'das sichtbar beschädigte Teil' },
  },
  known_good_supply: {
    nl: 'Werkt hetzelfde stopcontact of dezelfde voeding aantoonbaar met een ander apparaat?',
    en: 'Does the same outlet or power supply demonstrably work with another device?',
    de: 'Funktioniert dieselbe Steckdose oder Stromversorgung nachweislich mit einem anderen Gerät?',
  },
  external_checks_complete: {
    nl: 'Welke veilige controles aan stekker, kabel, stopcontact en normale bediening heb je al uitgevoerd, en wat gebeurde er?',
    en: 'Which safe checks of the plug, cable, outlet and normal controls have you completed, and what happened?',
    de: 'Welche sicheren Prüfungen an Stecker, Kabel, Steckdose und normaler Bedienung hast du durchgeführt, und was ist passiert?',
  },
  attachment_type: {
    nl: 'Welk zichtbaar bevestigingsmiddel zit los, bijvoorbeeld een schroef, bout, pen of lijmverbinding?',
    en: 'Which visible fastener is loose, such as a screw, bolt, pin or glued joint?',
    de: 'Welches sichtbare Befestigungsmittel ist locker, zum Beispiel Schraube, Bolzen, Stift oder Klebeverbindung?',
    target: { nl: 'de losse zichtbare verbinding', en: 'the loose visible joint', de: 'die lockere sichtbare Verbindung' },
  },
  material_condition: {
    nl: 'Is het materiaal rond de verbinding intact, of zie je scheuren, splinters of vervorming?',
    en: 'Is the material around the joint intact, or can you see cracks, splinters or deformation?',
    de: 'Ist das Material um die Verbindung intakt, oder sind Risse, Splitter oder Verformungen sichtbar?',
    target: { nl: 'het materiaal rond de verbinding', en: 'the material around the joint', de: 'das Material um die Verbindung' },
  },
  crack_location: {
    nl: 'Waar begint en eindigt de scheur, en loopt die door een dragend of bewegend deel?',
    en: 'Where does the crack start and end, and does it cross a load-bearing or moving part?',
    de: 'Wo beginnt und endet der Riss, und verläuft er durch ein tragendes oder bewegliches Teil?',
    target: { nl: 'de volledige scheur en de omgeving eromheen', en: 'the entire crack and its surroundings', de: 'den gesamten Riss und seine Umgebung' },
  },
  growth_or_movement: {
    nl: 'Wordt de scheur groter of beweegt het materiaal wanneer het normaal wordt belast?',
    en: 'Is the crack growing, or does the material move under normal load?',
    de: 'Wird der Riss größer oder bewegt sich das Material bei normaler Belastung?',
  },
  observable_behavior: {
    nl: 'Wat gebeurt er precies wanneer je het apparaat normaal probeert te gebruiken, en wat blijft juist uit?',
    en: 'What exactly happens when you try to use the device normally, and what expected response is missing?',
    de: 'Was genau passiert bei normaler Benutzung des Geräts, und welche erwartete Reaktion bleibt aus?',
  },
  failure_boundary: {
    nl: 'Welke functies werken nog wel en bij welke concrete handeling gaat het voor het eerst mis?',
    en: 'Which functions still work, and at which specific action does it first fail?',
    de: 'Welche Funktionen arbeiten noch, und bei welchem konkreten Schritt tritt der Fehler zuerst auf?',
  },
});

function localQuestion(fact, language) {
  const lang = ['nl', 'en', 'de'].includes(language) ? language : 'nl';
  const known = FACT_COPY[fact]?.[lang];
  if (known) return known;
  const fallback = {
    nl: 'Welke concrete waarneming kan dit bevestigen of uitsluiten?',
    en: 'Which concrete observation could confirm or rule this out?',
    de: 'Welche konkrete Beobachtung könnte dies bestätigen oder ausschließen?',
  };
  return fallback[lang];
}

function localPhotoTarget(fact, language) {
  const lang = ['nl', 'en', 'de'].includes(language) ? language : 'nl';
  const target = FACT_COPY[fact]?.target?.[lang];
  if (target) return target;
  return {
    nl: 'de betrokken plek en de directe omgeving',
    en: 'the affected area and its immediate surroundings',
    de: 'den betroffenen Bereich und seine unmittelbare Umgebung',
  }[lang];
}

export function rankNextBestTests({ hypotheses = [], contradictions = [], language = 'nl' } = {}) {
  const candidates = [];

  for (const contradiction of asArray(contradictions).filter(item => item.resolved !== true)) {
    const prompt = {
      nl: 'Welke van de tegenstrijdige waarnemingen klopt nu? Beschrijf wat je op dit moment ziet of merkt.',
      en: 'Which of the conflicting observations is correct now? Describe what you currently see or notice.',
      de: 'Welche der widersprüchlichen Beobachtungen trifft jetzt zu? Beschreibe, was du im Moment siehst oder bemerkst.',
    }[language] || 'Welke van de tegenstrijdige waarnemingen klopt nu? Beschrijf wat je op dit moment ziet of merkt.';
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
        ? buildPhotoRequest({ target: localPhotoTarget(fact, language), purpose: hypothesis.statement, language })
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
      testId: `test_${stableHash([
        candidate.code,
        candidate.hypothesisIds,
        candidate.resolvesContradictionIds,
      ])}`,
      ...candidate,
      rankScore: Number((candidate.informationGain - candidate.effort * 0.35).toFixed(4)),
    }))
    .sort((a, b) => b.rankScore - a.rankScore || a.testId.localeCompare(b.testId)));
}

export function selectNextBestTest(input) {
  return rankNextBestTests(input)[0] || null;
}
