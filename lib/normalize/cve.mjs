// CVE Normalization — unified schema for vulnerability intelligence
// Aggregates data from NVD, CISA-KEV, EPSS, CNVD, CNNVD, and other sources

const CVE_ID_RE = /^CVE-\d{4}-\d{4,}$/;

/**
 * Create a normalized CVE object.
 * @param {object} raw — raw CVE data from a source
 * @param {string} sourceName — name of the data source
 * @returns {object|null} — normalized CVE or null if invalid
 */
export function normalizeCVE(raw, sourceName) {
  if (!raw) return null;

  const id = raw.id || raw.cveId || raw.cveID || null;
  if (!id || !CVE_ID_RE.test(id)) return null;

  const now = new Date().toISOString();

  return {
    id,
    cvss: {
      v3: typeof raw.cvssV3 === 'number' ? raw.cvssV3 : (raw.cvss?.v3 ?? null),
      v2: typeof raw.cvssV2 === 'number' ? raw.cvssV2 : (raw.cvss?.v2 ?? null),
    },
    epss: {
      score: typeof raw.epssScore === 'number' ? raw.epssScore : (raw.epss?.score ?? null),
      percentile: typeof raw.epssPercentile === 'number' ? raw.epssPercentile : (raw.epss?.percentile ?? null),
    },
    kev: raw.kev === true || raw.inKEV === true || false,
    pocAvailable: raw.pocAvailable === true || raw.hasPoc === true || false,
    pocUrls: Array.isArray(raw.pocUrls) ? raw.pocUrls : [],
    vendors: Array.isArray(raw.vendors) ? raw.vendors : (raw.vendor ? [raw.vendor] : []),
    products: Array.isArray(raw.products) ? raw.products : (raw.product ? [raw.product] : []),
    cnvdId: raw.cnvdId || null,
    cnnvdId: raw.cnnvdId || null,
    attackVector: raw.attackVector || null,
    description: typeof raw.description === 'string' ? raw.description.substring(0, 500) : null,
    attackerKbScore: typeof raw.attackerKbScore === 'number' ? raw.attackerKbScore : null,
    sources: [sourceName],
    patchAvailable: raw.patchAvailable === true || false,
    firstPublished: raw.firstPublished || raw.dateAdded || raw.publishedDate || now,
    lastModified: raw.lastModified || now,
    // Lifecycle state tracking
    lifecycle: raw.lifecycle || 'published', // published → kev → poc → exploited-in-wild
  };
}

/**
 * Merge two CVE records with the same ID.
 * Picks the richer / more severe data from each field.
 */
export function mergeCVEs(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;

  return {
    id: existing.id,
    cvss: {
      v3: existing.cvss.v3 ?? incoming.cvss.v3,
      v2: existing.cvss.v2 ?? incoming.cvss.v2,
    },
    epss: {
      score: existing.epss.score ?? incoming.epss.score,
      percentile: existing.epss.percentile ?? incoming.epss.percentile,
    },
    kev: existing.kev || incoming.kev,
    pocAvailable: existing.pocAvailable || incoming.pocAvailable,
    pocUrls: [...new Set([...existing.pocUrls, ...incoming.pocUrls])],
    vendors: [...new Set([...existing.vendors, ...incoming.vendors])],
    products: [...new Set([...existing.products, ...incoming.products])],
    cnvdId: existing.cnvdId || incoming.cnvdId,
    cnnvdId: existing.cnnvdId || incoming.cnnvdId,
    attackVector: existing.attackVector || incoming.attackVector,
    description: existing.description || incoming.description,
    attackerKbScore: existing.attackerKbScore ?? incoming.attackerKbScore,
    sources: [...new Set([...existing.sources, ...incoming.sources])],
    patchAvailable: existing.patchAvailable || incoming.patchAvailable,
    firstPublished: existing.firstPublished < incoming.firstPublished ? existing.firstPublished : incoming.firstPublished,
    lastModified: existing.lastModified > incoming.lastModified ? existing.lastModified : incoming.lastModified,
    lifecycle: resolveLifecycle(existing.lifecycle, incoming.lifecycle),
  };
}

const LIFECYCLE_ORDER = ['published', 'kev', 'poc', 'exploited-in-wild'];

function resolveLifecycle(a, b) {
  const ia = LIFECYCLE_ORDER.indexOf(a);
  const ib = LIFECYCLE_ORDER.indexOf(b);
  return LIFECYCLE_ORDER[Math.max(ia, ib)] || 'published';
}

/**
 * Deduplicate and merge a list of CVEs by ID.
 * @param {Array} cves - array of normalized CVE objects
 * @returns {Array} - deduplicated array
 */
export function deduplicateCVEs(cves) {
  const map = new Map();

  for (const cve of cves) {
    if (!cve) continue;
    if (map.has(cve.id)) {
      map.set(cve.id, mergeCVEs(map.get(cve.id), cve));
    } else {
      map.set(cve.id, cve);
    }
  }

  return [...map.values()];
}

/**
 * Calculate a severity score (0-100) for prioritization.
 * Weighs CVSS, EPSS, KEV status, and PoC availability.
 */
export function cveSeverityScore(cve) {
  if (!cve) return 0;
  let score = 0;

  const cvss = cve.cvss?.v3 ?? cve.cvss?.v2 ?? 0;
  score += (cvss / 10) * 40; // CVSS contributes up to 40 points

  const epss = cve.epss?.score ?? 0;
  score += epss * 25; // EPSS contributes up to 25 points

  if (cve.kev) score += 20;
  if (cve.pocAvailable) score += 10;
  if (cve.sources.length >= 3) score += 5;

  return Math.min(100, Math.round(score));
}
