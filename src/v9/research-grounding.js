import { asArray, clamp01, cleanText, immutable, stableHash } from './contracts.js';

const TRUST = Object.freeze({
  manufacturer: 1,
  service_manual: 0.94,
  ifixit: 0.92,
  specialist_support: 0.82,
  web: 0.58,
  community: 0.4,
});

function hostname(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return '';
    return parsed.hostname.toLocaleLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function exactOrSubdomain(host, allowed) {
  return host === allowed || host.endsWith(`.${allowed}`);
}

export function classifyResearchSource(url, { manufacturerDomains = [] } = {}) {
  const host = hostname(url);
  if (!host) return 'rejected';
  if (manufacturerDomains.some(domain => exactOrSubdomain(host, String(domain).toLocaleLowerCase()))) return 'manufacturer';
  if (exactOrSubdomain(host, 'ifixit.com')) return 'ifixit';
  if (/(^|\.)(manualslib\.com|manuals\.plus)$/.test(host)) return 'service_manual';
  if (/(^|\.)(reddit\.com)$/.test(host) || /(^|\.)community\./.test(host)) return 'community';
  if (/^(support|help)\./.test(host)) return 'specialist_support';
  return 'web';
}

export function normalizeResearchSources(sources, options = {}) {
  const byUrl = new Map();
  for (const source of asArray(sources).slice(0, 30)) {
    const url = cleanText(source?.url, 2000);
    const sourceType = classifyResearchSource(url, options);
    if (sourceType === 'rejected') continue;
    const title = cleanText(source?.title, 500);
    const snippet = cleanText(source?.snippet ?? source?.description, 1200);
    if (!title || !snippet) continue;
    const host = hostname(url);
    const item = immutable({
      sourceId: cleanText(source?.sourceId ?? source?.id, 160) || `src_${stableHash(url)}`,
      title,
      url,
      domain: host,
      sourceType,
      trustScore: clamp01(TRUST[sourceType]),
      snippet,
    });
    const current = byUrl.get(url);
    if (!current || item.trustScore > current.trustScore) byUrl.set(url, item);
  }
  return Object.freeze([...byUrl.values()].sort((a, b) => b.trustScore - a.trustScore).slice(0, 10));
}

export function validateGroundedClaims(claims, sources) {
  const sourceIds = new Set(asArray(sources).map(source => source.sourceId));
  const accepted = [];
  const rejected = [];
  for (const claim of asArray(claims)) {
    const text = cleanText(claim?.text, 800);
    const evidenceSourceIds = [...new Set(asArray(claim?.evidenceSourceIds).filter(id => sourceIds.has(id)))];
    const normalized = { text, evidenceSourceIds };
    if (!text || evidenceSourceIds.length === 0) rejected.push(normalized);
    else accepted.push(immutable(normalized));
  }
  return immutable({ accepted, rejected });
}
