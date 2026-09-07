/* Fixdit V8 open-world frontend compatibility layer */
(function () {
  const typeLabels = {
    nl: {
      automotive: 'Auto',
      power_tool: 'Elektrisch gereedschap',
      small_engine: 'Kleine motor',
      heating_cooling: 'Verwarming & koeling',
      door_window: 'Deur & raam',
      home_fixture: 'Woningonderdeel',
      mobility: 'Mobiliteit',
      toy_hobby: 'Hobby & speelgoed'
    },
    en: {
      automotive: 'Car',
      power_tool: 'Power tool',
      small_engine: 'Small engine',
      heating_cooling: 'Heating & cooling',
      door_window: 'Door & window',
      home_fixture: 'Home fixture',
      mobility: 'Mobility',
      toy_hobby: 'Toy & hobby'
    },
    de: {
      automotive: 'Auto',
      power_tool: 'Elektrowerkzeug',
      small_engine: 'Kleinmotor',
      heating_cooling: 'Heizung & Kühlung',
      door_window: 'Tür & Fenster',
      home_fixture: 'Hausteil',
      mobility: 'Mobilität',
      toy_hobby: 'Hobby & Spielzeug'
    }
  };

  const symptomLabels = {
    nl: {
      no_flow: 'Geen doorstroming',
      leak: 'Lekkage',
      puncture: 'Lek / perforatie',
      pressure_loss: 'Drukverlies',
      no_start: 'Start niet',
      stalling: 'Valt uit',
      loose: 'Los onderdeel',
      crack: 'Scheur / barst',
      breakage: 'Breuk',
      wear: 'Slijtage',
      blockage: 'Verstopping',
      jammed: 'Vastgelopen',
      stain: 'Vlek',
      no_power: 'Geen stroom',
      not_charging: 'Laadt niet',
      error_code: 'Foutcode',
      warning_light: 'Waarschuwingslampje',
      noise: 'Geluid',
      vibration: 'Trilling',
      overheating: 'Oververhitting',
      corrosion: 'Roest / corrosie',
      alignment: 'Scheef / uitlijning',
      water_damage: 'Waterschade',
      poor_output: 'Slechte werking',
      weak_performance: 'Verminderde werking',
      intermittent: 'Werkt soms wel, soms niet',
      not_working: 'Werkt niet',
      braking_fault: 'Remprobleem',
      steering_fault: 'Stuurprobleem',
      fluid_leak: 'Vloeistoflekkage',
      setup_build: 'Bouwproject',
      installation: 'Installatie',
      maintenance: 'Onderhoud',
      cleaning: 'Schoonmaak',
      unknown: 'Nog te bepalen',
      other: 'Probleem'
    },
    en: {
      no_flow: 'No flow',
      leak: 'Leak',
      puncture: 'Puncture',
      pressure_loss: 'Pressure loss',
      no_start: 'Will not start',
      stalling: 'Stalling',
      loose: 'Loose part',
      crack: 'Crack',
      breakage: 'Breakage',
      wear: 'Wear',
      blockage: 'Blockage',
      jammed: 'Jammed',
      stain: 'Stain',
      no_power: 'No power',
      not_charging: 'Not charging',
      error_code: 'Error code',
      warning_light: 'Warning light',
      noise: 'Noise',
      vibration: 'Vibration',
      overheating: 'Overheating',
      corrosion: 'Corrosion',
      alignment: 'Alignment',
      water_damage: 'Water damage',
      poor_output: 'Poor output',
      weak_performance: 'Weak performance',
      intermittent: 'Intermittent fault',
      not_working: 'Not working',
      braking_fault: 'Brake fault',
      steering_fault: 'Steering fault',
      fluid_leak: 'Fluid leak',
      setup_build: 'Build project',
      installation: 'Installation',
      maintenance: 'Maintenance',
      cleaning: 'Cleaning',
      unknown: 'To be determined',
      other: 'Problem'
    },
    de: {
      no_flow: 'Kein Durchfluss',
      leak: 'Leck',
      puncture: 'Reifenschaden',
      pressure_loss: 'Druckverlust',
      no_start: 'Startet nicht',
      stalling: 'Motor geht aus',
      loose: 'Lockeres Teil',
      crack: 'Riss',
      breakage: 'Bruch',
      wear: 'Verschleiß',
      blockage: 'Verstopfung',
      jammed: 'Blockiert',
      stain: 'Fleck',
      no_power: 'Kein Strom',
      not_charging: 'Lädt nicht',
      error_code: 'Fehlercode',
      warning_light: 'Warnleuchte',
      noise: 'Geräusch',
      vibration: 'Vibration',
      overheating: 'Überhitzung',
      corrosion: 'Korrosion',
      alignment: 'Ausrichtung',
      water_damage: 'Wasserschaden',
      poor_output: 'Schwache Leistung',
      weak_performance: 'Verminderte Leistung',
      intermittent: 'Sporadischer Fehler',
      not_working: 'Funktioniert nicht',
      braking_fault: 'Bremsproblem',
      steering_fault: 'Lenkproblem',
      fluid_leak: 'Flüssigkeitsleck',
      setup_build: 'Bauprojekt',
      installation: 'Installation',
      maintenance: 'Wartung',
      cleaning: 'Reinigung',
      unknown: 'Noch zu bestimmen',
      other: 'Problem'
    }
  };

  for (const lang of ['nl', 'en', 'de']) {
    if (typeof diagnosisCopy !== 'undefined' && diagnosisCopy[lang]) {
      Object.assign(diagnosisCopy[lang].types, typeLabels[lang]);
      Object.assign(diagnosisCopy[lang].kinds, symptomLabels[lang]);
    }
  }

  normalizeApiDiagnosis = function (raw) {
    const lang =
      typeof currentLang === 'string' && ['nl', 'en', 'de'].includes(currentLang)
        ? currentLang
        : 'nl';

    const view = raw?.views?.[lang];
    let d;

    if (view && (!view.language || view.language === lang)) {
      // Keep older saved V7 results usable.
      d = { ...raw, ...view };
    } else if (
      raw &&
      (!raw.language || raw.language === lang) &&
      (
        String(raw.architectureVersion || '').startsWith('v8') ||
        raw.objectLabel ||
        raw.objectFamily
      )
    ) {
      // V8 returns the localized diagnosis directly.
      d = { ...raw };
    } else {
      const error = new Error(
        {
          nl: 'Dit resultaat past niet bij de gekozen taal. Analyseer het probleem opnieuw met Fixdit V8.',
          en: 'This result does not match the selected language. Analyze the problem again with Fixdit V8.',
          de: 'Dieses Ergebnis passt nicht zur gewählten Sprache. Analysiere das Problem erneut mit Fixdit V8.'
        }[lang]
      );
      error.code = 'RESULT_LANGUAGE_MISMATCH';
      throw error;
    }

    if (!d.objectFamily) {
      const legacy = {
        aquarium_pet: 'aquarium',
        vehicle_bicycle: 'bicycle'
      };
      d.objectFamily = legacy[d.problemType] || d.problemType || 'other';
    }

    if (!d.objectLabel) d.objectLabel = cleanResultValue(d.device) || '';
    if (!d.problemKind) d.problemKind = d.symptom || d.symptomCandidate || 'unknown';
    if (!d.symptom) d.symptom = d.problemKind;

    if (!d.route) {
      d.route =
        d.risk === 'stop'
          ? 'stop'
          : d.needMoreInfo
            ? 'more_info'
            : d.professionalRecommended
              ? 'professional'
              : d.risk === 'middel'
                ? 'caution'
                : 'self';
    }

    return d;
  };

  window.FIXDIT_FRONTEND_COMPAT = 'v8-open-world';
})();
