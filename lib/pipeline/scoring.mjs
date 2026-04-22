// lib/pipeline/scoring.mjs

/**
 * IOC type half-lives in days for confidence decay.
 * Source: intelligence-product-design.md Layer 2 spec
 */
export const IOC_HALF_LIVES = {
  'ipv4-addr':   7,
  'ipv6-addr':   7,
  'url':        14,
  'domain-name': 30,
  'file':        90,
  'email-addr':  30,
};

/**
 * Calculate CVE priority score (0–1).
 * Formula: CVSS×0.30 + EPSS×0.30 + KEV×0.20 + PoC×0.10 + crossSource×0.10
 *
 * @param {object} cve - Normalized CVE object from lib/normalize/cve.mjs
 * @returns {number} - Score in [0, 1]
 */
export function cvePriorityScore(cve) {
  const cvss = ((cve.cvss?.v3 ?? cve.cvss?.v2) ?? 0) / 10;  // normalize 0–10 → 0–1
  const epss = cve.epss?.score ?? 0;                          // already 0–1
  const kev = cve.kev ? 1 : 0;
  const poc = cve.pocAvailable ? 1 : 0;
  const crossSource = Math.min((cve.sources?.length ?? 0) / 5, 1);  // saturates at 5 sources

  return Math.min(1, cvss * 0.30 + epss * 0.30 + kev * 0.20 + poc * 0.10 + crossSource * 0.10);
}

/**
 * Exponential decay factor for IOC confidence.
 * At t=0: 1.0; at t=halfLife: 0.5; at t=2*halfLife: 0.25
 *
 * @param {string} iocType - STIX SCO type (e.g., 'ipv4-addr')
 * @param {number} lastSeenMs - Timestamp of last observation (ms since epoch)
 * @param {number} [nowMs] - Current time (ms since epoch); defaults to Date.now()
 * @returns {number} - Decay factor in (0, 1]
 */
export function iocDecayFactor(iocType, lastSeenMs, nowMs = Date.now()) {
  const halfLife = IOC_HALF_LIVES[iocType] ?? 30;
  const days = Math.max(0, (nowMs - lastSeenMs) / 86_400_000);
  return Math.pow(0.5, days / halfLife);
}

/**
 * Calculate IOC confidence score (0–1).
 * Formula: sourceAuth×0.40 + decay×0.30 + sourceCount×0.20 + fprQuality×0.10
 *
 * @param {object} ioc - Normalized IOC object from lib/normalize/ioc.mjs
 * @param {number} [nowMs] - Current time override (for testing)
 * @returns {number} - Score in [0, 1]
 */
export function iocConfidenceScore(ioc, nowMs = Date.now()) {
  // Source authority: use raw confidence field (0–100 scale → 0–1)
  const sourceAuth = (ioc.confidence ?? 50) / 100;

  // Decay factor based on IOC type half-life
  const decay = iocDecayFactor(ioc.type, new Date(ioc.lastSeen).getTime(), nowMs);

  // Source count breadth (saturates at 5 independent sources)
  const sourceCount = Math.min((ioc.sources?.length ?? 1) / 5, 1);

  // False positive quality (lower FPR = higher quality)
  const fprQuality = 1 - (ioc.falsePositiveRate ?? 0);

  return Math.min(1, Math.max(0,
    sourceAuth * 0.40 + decay * 0.30 + sourceCount * 0.20 + fprQuality * 0.10
  ));
}

/**
 * Determine IOC lifecycle state based on decay factor.
 *
 * @param {object} ioc - Normalized IOC object
 * @param {number} [nowMs] - Current time override
 * @returns {'fresh'|'active'|'aging'|'stale'}
 */
export function iocLifecycleState(ioc, nowMs = Date.now()) {
  const decay = iocDecayFactor(ioc.type, new Date(ioc.lastSeen).getTime(), nowMs);
  if (decay > 0.80) return 'fresh';
  if (decay > 0.50) return 'active';
  if (decay > 0.25) return 'aging';
  return 'stale';
}
