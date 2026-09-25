import { cleanText, immutable } from './contracts.js';

const COPY = {
  nl: {
    intro: 'Maak één scherpe foto',
    lighting: 'Gebruik gelijkmatig licht zonder flitsreflectie.',
    avoid: 'Open, demonteer of verplaats niets gevaarlijks voor de foto.',
  },
  en: {
    intro: 'Take one sharp photo',
    lighting: 'Use even lighting without flash glare.',
    avoid: 'Do not open, dismantle or move anything hazardous for the photo.',
  },
  de: {
    intro: 'Mache ein scharfes Foto',
    lighting: 'Verwende gleichmäßiges Licht ohne Blitzreflexion.',
    avoid: 'Öffne, zerlege oder bewege für das Foto nichts Gefährliches.',
  },
};

export function buildPhotoRequest({ target, purpose, angle = 'overview_and_detail', language = 'nl' } = {}) {
  const lang = COPY[language] ? language : 'nl';
  const copy = COPY[lang];
  const safeTarget = cleanText(target, 200) || (lang === 'en' ? 'the affected area' : lang === 'de' ? 'den betroffenen Bereich' : 'de betrokken plek');
  const safePurpose = cleanText(purpose, 300);
  return immutable({
    kind: 'photo',
    target: safeTarget,
    angle,
    framing: 'show_context_and_affected_area',
    lighting: copy.lighting,
    requiredVisible: Object.freeze([safeTarget]),
    avoid: Object.freeze([copy.avoid]),
    purpose: safePurpose,
    prompt: `${copy.intro} van ${safeTarget}. ${safePurpose}`.trim(),
    acceptedMediaTypes: Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  });
}
