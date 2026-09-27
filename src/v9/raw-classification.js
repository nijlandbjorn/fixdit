import { cleanText } from './contracts.js';

// Only symptom-level normalization. No model-specific causes or repair authority.
const OBJECTS = [
  ['aquarium', /aquarium|fish tank/i],
  ['bicycle', /\b(fiets|bicycle|bike|fahrrad)\b|fietsband|fietsketting/i],
  ['network', /router|wifi|wi-fi|wlan|modem/i],
  ['automotive', /\b(auto|car|vehicle|voertuig|autoband|band|tire|tyre|reifen)\b|autoruitensproeier/i],
  ['electronics', /laptop|telefoon|telefon|phone|televis|\btv\b|monitor|computer|elektronisch|electronic|oplader|charger|batterij|battery|batterie/i],
  ['appliance', /koffie|coffee|kaffee|vaatwasser|afwasmachine|dishwasher|spülmaschine|wasmachine|washing machine|waschmaschine|droger|dryer|trockner|koelkast|fridge|refrigerator|kühlschrank|vriezer|freezer|oven|kookplaat|hob|waterkoker|kettle|stofzuiger|vacuum|airfryer|blender|broodrooster|toaster|barbecue|bbq|buitenkeuken|outdoor kitchen|grill/i],
  ['furniture', /stoel|chair|stuhl|tafel|table|tisch|kast|cabinet|schrank|meubel/i],
  ['home', /(?:\b(?:deur|door|tür|kraan|tap|faucet|wasserhahn|afvoer|drain|schutting|fence|zaun|buitenverlichting|outdoor light|außenleuchte)\b|binnendeur)/i],
];
const SYMPTOMS = [
  ['black_screen', /(?:scherm|screen|display|bildschirm).{0,25}(?:zwart|black|schwarz)|(?:zwart|black|schwarz).{0,25}(?:scherm|screen|display|bildschirm)/i],
  ['no_spin', /centrifugeert niet|does not spin|doesn't spin|schleudert nicht/i],
  ['door_binding', /(?:deur|door|tür).{0,30}(?:klemt|binds|klemmt|schuurt|rubs)/i],
  ['wifi_dropout', /(?:wifi|wi-fi|wlan).{0,30}(?:valt.*weg|flikkert.*uit|drops?|disconnect|bricht.*ab)/i],
  ['surface_scratch', /(?:diepe?\s+)?(?:kras|scratch|kratzer)/i],
  ['chain_slip', /(?:ketting|chain|kette).{0,30}(?:loopt eraf|trapt door|drops?|slips?|springt ab|rutscht)/i],
  ['motion_no_response', /(?:buitenverlichting|outdoor light|außenleuchte).{0,60}(?:(?:beweging|motion|bewegung).{0,20}(?:niet|no|not|kein)|(?:niet|no|not|kein).{0,20}(?:beweging|motion|bewegung))/i],
  ['leaning_structure', /(?:schutting|fence|zaun).{0,30}(?:scheef|lean|schief)/i],
  ['washer_no_flow', /(?:ruitensproeier|windshield washer|scheibenwasch).{0,30}(?:spuit niet|no spray|spr[üu]ht nicht)/i],
  ['gas_appliance_no_flow', /(?:barbecue|bbq|buitenkeuken|outdoor kitchen|grill).{0,40}(?:geen gas|no gas|kein gas|ontsteekt niet|won't ignite|zündet nicht)/i],
  ['battery_damage', /(?:batterij|accu|battery|batterie).{0,30}(?:duidelijk opgezwollen|is opgezwollen|swollen|aufgebläht)/i],
  ['water_damage', /(?:water|wasser).{0,30}(?:rond|in|bij|around|near).{0,15}(?:stekker|stopcontact|socket|outlet|steckdose)/i],
  ['crack', /gescheurd|scheur|gebarsten|crack|\briss\b|gerissen/i],
  ['no_drain', /pompt?.{0,25}(?:niet|geen).{0,15}(?:af|weg)|does(?:n't| not) drain|pumpt?.{0,20}nicht ab|afvoer.{0,15}verstopt/i],
  ['no_flow', /geen (?:koffie|water)|no (?:coffee|water)|kein(?:e|en)? (?:kaffee|wasser)|zuigt niet|filter.{0,25}verstopt/i],
  ['no_heat', /(?:wordt|worden) niet warm|does not heat|heizt nicht/i],
  ['poor_cooling', /koelt (?:slecht|onvoldoende|niet)|vriest niet|does not cool|cools poorly|kühlt (?:schlecht|nicht)/i],
  ['not_charging', /laad[dt]? niet|does not charge|lädt nicht/i],
  ['no_sound', /geen geluid|no sound|kein ton/i],
  ['no_power', /gaat niet aan|start niet|geen stroom|no power|does not turn on|geht nicht an|kein strom/i],
  ['error_code', /foutcode|error code|fehlercode/i],
  ['leak', /\blekt\b|\bleaking\b|\bleak\b|undicht/i],
  ['loose', /\blos(?:se)?\b|loose|locker/i],
  ['noise', /lawaai|unusual noise|rattling|geräusch/i],
  ['not_working', /werkt niet|doet het niet|does not work|doesn't work|funktioniert nicht/i],
];

export function classificationFromUserText(problem = '') {
  const text = cleanText(problem);
  const object = OBJECTS.find(([, pattern]) => pattern.test(text));
  if (!object) return {};
  const objectFamily = object[0];
  let symptom = SYMPTOMS.find(([, pattern]) => pattern.test(text))?.[0] || 'unknown';
  if (['automotive', 'bicycle'].includes(objectFamily)) {
    if (/remt|remmen|remweg|brakes? poorly|braking|brems/i.test(text)) symptom = 'braking_fault';
    else if (/stuur|steering|lenkung/i.test(text)) symptom = 'steering_fault';
    else if (/oververhit|overheat|überhitz/i.test(text)) symptom = 'overheating';
    else if (/band|tire|tyre|reifen/i.test(text) && /zacht|lek(?:ke)?|leeg|soft|flat|druck|platt/i.test(text)) symptom = 'pressure_loss';
  }
  if (objectFamily === 'appliance' && /vaatwasser|afwasmachine|dishwasher|spülmaschine/i.test(text) && /pakt geen water|geen water|no water|kein wasser/i.test(text)) symptom = 'no_flow';
  const objectLabel = /(?:fiets|bicycle|bike|fahrrad).{0,20}(?:band|tire|tyre|reifen)|(?:band|tire|tyre|reifen).{0,20}(?:fiets|bicycle|bike|fahrrad)/i.test(text)
    ? 'fietsband'
    : /vaatwasser|afwasmachine|dishwasher|spülmaschine/i.test(text)
      ? 'vaatwasser'
      : /wasmachine|washing machine|waschmaschine/i.test(text) ? 'wasmachine'
      : /laptop|computer/i.test(text) ? 'laptop'
      : /router|wifi|wi-fi|wlan/i.test(text) ? 'router'
      : /barbecue|bbq|buitenkeuken|outdoor kitchen|grill/i.test(text) ? 'barbecue'
      : /koffie|coffee|kaffee/i.test(text) ? 'koffiezetapparaat' : undefined;
  return { objectFamily, symptom, problemKind: symptom, intent: 'repair', ...(objectLabel ? { objectLabel } : {}) };
}
