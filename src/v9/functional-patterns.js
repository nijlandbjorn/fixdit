import { cleanText, immutable } from './contracts.js';

const DEFINITIONS = Object.freeze([
  {
    id: 'continues_when_should_stop',
    patterns: [/(?:blijft|gaat door met|continues?|keeps?)\b.{0,55}\b(?:doorlopen|doorstromen|doordraaien|doorwerken|lopen|stromen|draaien|vullen|werken|running|flowing|spinning|filling|working)/i, /\b(?:na|after|nachdem?)\b.{0,45}\b(?:blijft|continues?|läuft weiter|fließt weiter)/i],
    causes: ['De normale afsluiting kan niet volledig sluiten.', 'De regeling kan het stopsignaal niet correct verwerken.', 'Een afdichting kan de afgesloten toestand niet vasthouden.'],
    checks: [['Observeer of het gedrag direct of pas na de normale stophandeling doorgaat.', 'stop_timing'], ['Let van buiten op een normaal bereikbare bediening die niet volledig naar de ruststand terugkeert.', 'control_return_state']],
    question: ['Stopt het gedrag alsnog nadat je de normale bediening één keer naar de ruststand brengt?', 'stop_response'],
  },
  {
    id: 'fails_under_load',
    patterns: [/(?:als|wanneer|zodra|when|while|under|bei|wenn)\b.{0,45}\b(?:erop|belast|gewicht|kracht|load|weight|pressure|belastung|gewicht)/i, /\b(?:zonder|without|ohne)\b.{0,25}\b(?:belasting|load|belastung)\b.{0,55}\b(?:wel|werkt|holds?|functions?|funktioniert)/i],
    causes: ['Het mechanisme kan positie of druk zonder belasting vasthouden, maar niet onder kracht.', 'Een vergrendeling kan onder belasting doorslippen.', 'Een dragend of drukvasthoudend deel kan geleidelijk kracht verliezen.'],
    checks: [['Vergelijk het gedrag zonder belasting met dezelfde normale stand onder lichte gebruiksbelasting.', 'load_comparison'], ['Observeer of de positie plotseling of geleidelijk verandert zodra belasting wordt aangebracht.', 'load_failure_rate']],
    question: ['Verandert de positie direct of geleidelijk zodra de normale belasting wordt aangebracht?', 'load_failure_rate'],
  },
  {
    id: 'position_dependency',
    patterns: [/(?:alleen|pas|only|nur)\b.{0,70}\b(?:als|wanneer|wanneer ik|when|if|wenn)\b.{0,50}\b(?:hoek|positie|stand|optil|draai|uitlijn|angle|position|lift|turn|align|winkel|position|anheb|dreh|ausricht)/i, /\b(?:tenzij|unless|außer wenn)\b.{0,60}\b(?:optil|draai|uitlijn|lift|turn|align|anheb|dreh|ausricht)/i],
    causes: ['De uitlijning kan alleen in één positie voldoende zijn.', 'Een bereikbaar contact- of geleidingspunt kan door positie veranderen.', 'Speling kan het mechanisme buiten de juiste lijn brengen.'],
    checks: [['Observeer welke kleine normale positieverandering het gedrag reproduceerbaar verbetert of verslechtert.', 'position_effect'], ['Vergelijk van buiten de ruststand met de stand waarin het wel werkt.', 'alignment_comparison']],
    question: ['Welke kleine positieverandering maakt het grootste verschil?', 'position_effect'],
  },
  {
    id: 'direction_asymmetry',
    patterns: [/(?:wel|works?|gaat|moves?|beweegt|funktioniert|fährt)\b.{0,35}\b(?:omlaag|naar beneden|links|open|down|left|open|runter|links|auf)\b.{0,55}\b(?:maar|but|aber)\b.{0,35}\b(?:niet|not|kein|nicht)\b.{0,25}\b(?:omhoog|naar boven|rechts|dicht|up|right|close|hoch|rechts|zu)/i, /(?:richting|direction|richtung)\s*(?:a|één|one|eins)\b.{0,60}\b(?:niet|not|nicht)\b.{0,30}\b(?:richting|direction|richtung)\s*(?:b|andere|other)/i],
    causes: ['De richtingsspecifieke bediening kan in één richting geen bruikbaar signaal geven.', 'De aandrijving kan in één richting worden tegengehouden.', 'Een geleiding kan bij één bewegingsrichting extra weerstand geven.'],
    checks: [['Vergelijk zonder extra kracht het normale geluid en de beweging in beide richtingen.', 'direction_comparison'], ['Observeer of de niet-werkende richting wel begint of volledig stil blijft.', 'failed_direction_response']],
    question: ['Begint de beweging in de niet-werkende richting kort, of blijft die volledig stil?', 'failed_direction_response'],
  },
  {
    id: 'partial_subsystem_failure',
    patterns: [/(?:nog wel|werkt wel|does still|still works?|funktioniert noch|geht noch)\b.{0,70}\b(?:maar|but|aber)\b.{0,55}\b(?:niet meer|niet|no longer|doesn.t|not|nicht mehr|nicht)/i, /(?:één|\been\b|\bone\b|\bein(?:e|er)?\b).{0,25}\b(?:zone|kant|functie|kanaal|gedeelte|side|function|channel|part|bereich|seite|funktion|kanal)\b.{0,45}\b(?:niet|geen|faalt|fails?|not|no\b|nicht|kein|fällt aus)/i],
    causes: ['De gedeelde basisfunctie werkt, maar één afzonderlijk kanaal of zone krijgt niet hetzelfde resultaat.', 'Een lokale regeling of verbinding kan alleen het getroffen subsysteem beïnvloeden.', 'Een plaatselijk mechanisme kan falen terwijl het overige systeem actief blijft.'],
    checks: [['Vergelijk onder dezelfde normale omstandigheden het werkende en het niet-werkende deel.', 'subsystem_comparison'], ['Observeer welk zichtbaar of hoorbaar verschil uitsluitend bij het getroffen deel optreedt.', 'failed_subsystem_behavior']],
    question: ['Welk zichtbaar of hoorbaar verschil is er tussen het werkende en het niet-werkende deel?', 'failed_subsystem_behavior'],
  },
]);

export function detectFunctionalPatterns(value = '') {
  const text = cleanText(value, 2000);
  return Object.freeze(DEFINITIONS.filter(definition => definition.patterns.some(pattern => pattern.test(text))).map(definition => definition.id));
}

export function functionalPatternGuidance(patternIds = []) {
  const selected = DEFINITIONS.filter(definition => patternIds.includes(definition.id));
  return Object.freeze(selected.map(definition => immutable({
    id: definition.id,
    causeFamilies: Object.freeze([...definition.causes]),
    checks: Object.freeze(definition.checks.map(([text, evidenceKey]) => immutable({ text, evidenceKey }))),
    question: immutable({ text: definition.question[0], evidenceKey: definition.question[1] }),
  })));
}
