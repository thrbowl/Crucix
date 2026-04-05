// IOC Normalization — unified schema based on STIX 2.1 Observable
// Converts raw source data into a standard internal format

const VALID_IOC_TYPES = new Set([
  'ipv4-addr', 'ipv6-addr', 'domain-name', 'url', 'file', 'email-addr',
]);

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const IPV6_RE = /^[\da-f:]{3,45}$/i;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/i;
const MD5_RE = /^[a-f0-9]{32}$/i;
const SHA1_RE = /^[a-f0-9]{40}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/i;

export function detectIOCType(value) {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim();
  if (IPV4_RE.test(v)) return 'ipv4-addr';
  if (IPV6_RE.test(v) && v.includes(':')) return 'ipv6-addr';
  if (URL_RE.test(v)) return 'url';
  if (EMAIL_RE.test(v)) return 'email-addr';
  if (MD5_RE.test(v) || SHA1_RE.test(v) || SHA256_RE.test(v)) return 'file';
  if (DOMAIN_RE.test(v)) return 'domain-name';
  return null;
}

/**
 * Create a normalized IOC object.
 * @param {object} raw — raw IOC data from a source
 * @param {string} sourceName — name of the data source
 * @returns {object|null} — normalized IOC or null if invalid
 */
export function normalizeIOC(raw, sourceName) {
  if (!raw || !raw.value) return null;

  const value = String(raw.value).trim();
  if (!value) return null;

  const type = raw.type && VALID_IOC_TYPES.has(raw.type) ? raw.type : detectIOCType(value);
  if (!type) return null;

  const now = new Date().toISOString();

  return {
    type,
    value: type === 'domain-name' ? value.toLowerCase() : value,
    confidence: typeof raw.confidence === 'number' ? Math.max(0, Math.min(100, raw.confidence)) : 50,
    sources: [sourceName],
    tags: Array.isArray(raw.tags) ? [...new Set(raw.tags)] : [],
    firstSeen: raw.firstSeen || now,
    lastSeen: raw.lastSeen || now,
    relatedCVEs: Array.isArray(raw.relatedCVEs) ? raw.relatedCVEs : [],
    relatedActors: Array.isArray(raw.relatedActors) ? raw.relatedActors : [],
    // Metadata for enrichment
    _raw: undefined, // stripped in final output
  };
}

/**
 * Merge two IOC records with the same value+type.
 * Combines sources, tags, related info, and updates timestamps.
 */
export function mergeIOCs(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const sources = [...new Set([...existing.sources, ...incoming.sources])];
  const tags = [...new Set([...existing.tags, ...incoming.tags])];
  const relatedCVEs = [...new Set([...existing.relatedCVEs, ...incoming.relatedCVEs])];
  const relatedActors = [...new Set([...existing.relatedActors, ...incoming.relatedActors])];

  const firstSeen = existing.firstSeen < incoming.firstSeen ? existing.firstSeen : incoming.firstSeen;
  const lastSeen = existing.lastSeen > incoming.lastSeen ? existing.lastSeen : incoming.lastSeen;

  return {
    type: existing.type,
    value: existing.value,
    confidence: Math.max(existing.confidence, incoming.confidence),
    sources,
    tags,
    firstSeen,
    lastSeen,
    relatedCVEs,
    relatedActors,
  };
}

/**
 * Deduplicate and merge a list of IOCs.
 * IOCs with same type+value are merged.
 * @param {Array} iocs - array of normalized IOC objects
 * @returns {Array} - deduplicated array
 */
export function deduplicateIOCs(iocs) {
  const map = new Map();

  for (const ioc of iocs) {
    if (!ioc) continue;
    const key = `${ioc.type}::${ioc.value}`;
    if (map.has(key)) {
      map.set(key, mergeIOCs(map.get(key), ioc));
    } else {
      map.set(key, ioc);
    }
  }

  return [...map.values()];
}
