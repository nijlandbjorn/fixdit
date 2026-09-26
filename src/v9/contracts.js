export const V9_ENGINE_VERSION = '9.0.0-local';
export const V9_LEDGER_VERSION = '9.0';
export const V9_SAFETY_KERNEL_VERSION = '9.0';

export const EVIDENCE_SOURCES = Object.freeze([
  'user_text',
  'previous_user_text',
  'vision_structured',
  'deterministic_normalization',
  'legacy_inference',
  'research',
  'model_hypothesis',
]);

export const EVIDENCE_POLARITIES = Object.freeze(['present', 'absent', 'unknown']);
export const EVIDENCE_STATUSES = Object.freeze(['active', 'superseded', 'rejected']);

export function cleanText(value, maxLength = 4000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

export function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

export function stableHash(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

export function immutable(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) immutable(child);
  return Object.freeze(value);
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}
