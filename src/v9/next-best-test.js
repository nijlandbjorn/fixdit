import { asArray, cleanText, immutable, stableHash } from './contracts.js';
import { buildPhotoRequest } from './photo-request.js';

const VISUAL_FACTS = /location|damage|attachment|material|crack|leak|visible|condition/i;
const BOOLEAN_FACTS = new Set(['water_supply', 'known_good_supply', 'inlet_hose_condition', 'inlet_filter_condition', 'aquastop_state', 'door_lock_state']);

const FACT_COPY = Object.freeze({
  error_details: {
    nl: 'Welke exacte foutcode stond er, en wat is het merk en model op het zichtbare label?',
    en: 'What exact error code was shown, and what brand and model are on the visible label?',
    de: 'Welcher genaue Fehlercode wurde angezeigt, und welche Marke und welches Modell stehen auf dem sichtbaren Etikett?',
  },
  water_supply: {
    nl: 'Staat de normale watertoevoer naar het apparaat open?',
    en: 'Is the appliance\'s normal water supply open?',
    de: 'Ist die normale Wasserzufuhr zum Gerät geöffnet?',
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
    nl: 'Heb je eerder gezien dat de scheur groter werd of het materiaal bewoog? Belast het niet om dit te testen.',
    en: 'Have you previously seen the crack grow or the material move? Do not load it to test this.',
    de: 'Hast du zuvor gesehen, dass der Riss größer wurde oder sich das Material bewegte? Belaste es nicht zum Testen.',
  },
  observable_behavior: {
    nl: 'Wat heb je bij het laatste gebruik precies waargenomen, en wat bleef juist uit? Probeer het niet opnieuw voor deze vraag.',
    en: 'What did you observe during the last use, and what expected response was missing? Do not retry it for this question.',
    de: 'Was hast du bei der letzten Benutzung beobachtet, und welche Reaktion blieb aus? Wiederhole es nicht für diese Frage.',
  },
  failure_boundary: {
    nl: 'Welke functies werken nog wel en bij welke concrete handeling gaat het voor het eerst mis?',
    en: 'Which functions still work, and at which specific action does it first fail?',
    de: 'Welche Funktionen arbeiten noch, und bei welchem konkreten Schritt tritt der Fehler zuerst auf?',
  },
  inlet_hose_condition: { nl: 'Is de toevoerslang vrij van knikken en zichtbare blokkades?', en: 'Is the inlet hose free of kinks and visible blockages?', de: 'Ist der Zulaufschlauch frei von Knicken und sichtbaren Blockaden?' },
  inlet_filter_condition: { nl: 'Is het bereikbare inlaatfilter zichtbaar schoon?', en: 'Is the accessible inlet filter visibly clean?', de: 'Ist der zugängliche Zulauffilter sichtbar sauber?' },
  aquastop_state: { nl: 'Geeft de aquastop of lekbeveiliging een zichtbare blokkade of melding?', en: 'Does the aquastop or leak protection show a visible block or warning?', de: 'Zeigt der Aquastop oder Leckschutz eine sichtbare Sperre oder Meldung?' },
  door_lock_state: { nl: 'Sluit en vergrendelt de deur normaal?', en: 'Does the door close and lock normally?', de: 'Schließt und verriegelt die Tür normal?' },
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

export function rankNextBestTests({ hypotheses = [], contradictions = [], language = 'nl', safety = null, classification = {} } = {}) {
  if (['stop', 'professional'].includes(safety?.route)) return Object.freeze([]);
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
    for (const fact of asArray(hypothesis.missingEvidence)) {
      const visual = VISUAL_FACTS.test(fact);
      const photoSpec = visual
        ? buildPhotoRequest({ target: localPhotoTarget(fact, language), purpose: localQuestion(fact, language), language })
        : null;
      candidates.push({
        code: `${hypothesis.code}_${fact}`,
        kind: visual ? 'photo' : 'question',
        questionType: visual ? 'photo' : BOOLEAN_FACTS.has(fact) ? 'boolean' : 'short_text',
        prompt: photoSpec?.prompt || localQuestion(fact, language),
        photoSpec,
        hypothesisIds: [hypothesis.hypothesisId],
        resolvesContradictionIds: [],
        informationGain: fact === 'observable_behavior' && classification.symptom === 'unknown' ? 0.95 :
          ['water_supply', 'known_good_supply', 'failure_boundary', 'attachment_type'].includes(fact) ? 0.85 : 0.7,
        invasiveness: 0,
        discrimination: ['water_supply', 'known_good_supply', 'failure_boundary', 'attachment_type'].includes(fact) ? 1 : 0.5,
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
      questionType: candidate.questionType || 'short_text',
      ...candidate,
      rankScore: Number((candidate.informationGain + (candidate.discrimination || 0) * 0.1 - candidate.effort * 0.35 - (candidate.invasiveness || 0)).toFixed(4)),
    }))
    .sort((a, b) => b.rankScore - a.rankScore || a.code.localeCompare(b.code)));
}

export function selectNextBestTest(input) {
  return rankNextBestTests(input)[0] || null;
}
