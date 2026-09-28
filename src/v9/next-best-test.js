import { asArray, cleanText, immutable, stableHash } from './contracts.js';
import { buildPhotoRequest } from './photo-request.js';

const VISUAL_FACTS = /location|damage|attachment|material|crack|leak|visible|condition/i;
const BOOLEAN_FACTS = new Set(['water_supply', 'known_good_supply', 'inlet_hose_condition', 'inlet_filter_condition', 'aquastop_state', 'door_lock_state', 'external_display', 'water_in_drum', 'wired_connection', 'manual_light', 'reservoir_level', 'gas_supply_state', 'growth_or_movement', 'failure_boundary']);

const FACT_COPY = Object.freeze({
  external_display: { nl: 'Geeft een extern scherm wel beeld?', en: 'Does an external display show an image?', de: 'Zeigt ein externer Bildschirm ein Bild?' },
  water_in_drum: { nl: 'Blijft er na het programma water in de trommel staan?', en: 'Is water left in the drum after the programme?', de: 'Bleibt nach dem Programm Wasser in der Trommel?' },
  drum_behavior: { nl: 'Wat doet de trommel vlak voordat het centrifugeren uitblijft?', en: 'What does the drum do just before spinning fails?', de: 'Was macht die Trommel, kurz bevor das Schleudern ausbleibt?' },
  contact_location: { nl: 'Waar raakt de deur het kozijn als eerste?', en: 'Where does the door first touch the frame?', de: 'Wo berührt die Tür zuerst den Rahmen?' },
  wired_connection: { nl: 'Blijft een bekabeld apparaat online wanneer de wifi wegvalt?', en: 'Does a wired device stay online when Wi-Fi drops?', de: 'Bleibt ein kabelgebundenes Gerät online, wenn das WLAN ausfällt?' },
  indicator_state: { nl: 'Welke routerlampjes veranderen wanneer de wifi wegvalt?', en: 'Which router lights change when Wi-Fi drops?', de: 'Welche Routerleuchten ändern sich, wenn das WLAN ausfällt?' },
  scratch_depth: { nl: 'Zie je blank hout in de kras?', en: 'Can you see bare wood in the scratch?', de: 'Ist im Kratzer blankes Holz zu sehen?' },
  chain_condition: { nl: 'Is de ketting zichtbaar slap, beschadigd of sterk vervuild?', en: 'Is the chain visibly slack, damaged or heavily soiled?', de: 'Ist die Kette sichtbar locker, beschädigt oder stark verschmutzt?' },
  tooth_condition: { nl: 'Zie je sterk versleten of verbogen tanden?', en: 'Can you see badly worn or bent teeth?', de: 'Sind stark verschlissene oder verbogene Zähne zu sehen?' },
  manual_light: { nl: 'Gaat de lamp via de normale handmatige schakelaar wel aan?', en: 'Does the light switch on with its normal manual control?', de: 'Lässt sich die Leuchte mit der normalen Handbedienung einschalten?' },
  movement_location: { nl: 'Welke paal of verbinding is zichtbaar verschoven?', en: 'Which post or connection has visibly shifted?', de: 'Welcher Pfosten oder welche Verbindung hat sich sichtbar verschoben?' },
  reservoir_level: { nl: 'Is het reservoir gevuld?', en: 'Is the reservoir filled?', de: 'Ist der Behälter gefüllt?' },
  pump_sound: { nl: 'Hoor je de pomp bij normale bediening?', en: 'Can you hear the pump during normal operation?', de: 'Ist die Pumpe bei normaler Bedienung zu hören?' },
  gas_supply_state: { nl: 'Staat de gastoevoer volgens de normale bediening open?', en: 'Is the gas supply open according to the normal controls?', de: 'Ist die Gaszufuhr gemäß der normalen Bedienung geöffnet?' },
  ignition_behavior: { nl: 'Hoor of zie je de normale ontsteking werken?', en: 'Can you hear or see the normal ignition operate?', de: 'Ist die normale Zündung hör- oder sichtbar aktiv?' },
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
    nl: 'Begint het apparaat met de normale cyclus wanneer je het start?',
    en: 'Does the appliance begin its normal cycle when you start it?',
    de: 'Beginnt das Gerät beim Start mit dem normalen Ablauf?',
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

export function rankNextBestTests({ hypotheses = [], contradictions = [], language = 'nl', safety = null, classification = {}, capabilities = {} } = {}) {
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
      const photoSupported = visual && capabilities?.photoInput === true && capabilities?.cameraCapture === true && capabilities?.fileUpload === true;
      const photoSpec = photoSupported
        ? buildPhotoRequest({ target: localPhotoTarget(fact, language), purpose: localQuestion(fact, language), language })
        : null;
      candidates.push({
        code: `${hypothesis.code}_${fact}`,
        evidenceKey: fact,
        kind: photoSupported ? 'photo' : 'question',
        questionType: photoSupported ? 'photo' : BOOLEAN_FACTS.has(fact) ? 'boolean' : 'short_text',
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

export function selectNextBestTest(input, { previousObservations = [], axisOffset = 0 } = {}) {
  const asked = new Set(asArray(previousObservations)
    .map(item => cleanText(item?.answerTo, 500).toLocaleLowerCase())
    .filter(Boolean));
  const answeredAxes = new Set(asArray(previousObservations).map(item => cleanText(item?.evidenceKey, 160)).filter(Boolean));
  const candidates = rankNextBestTests(input)
    .filter(candidate => !asked.has(cleanText(candidate.prompt, 500).toLocaleLowerCase()) && !answeredAxes.has(candidate.evidenceKey || candidate.code));
  if (!candidates.length) return null;
  return candidates[Math.min(Math.max(0, axisOffset), candidates.length - 1)] || candidates[0];
}
