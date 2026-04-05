// Confidence Scoring Engine — weighted multi-source IOC confidence calculation
// Rules assign additive points based on source quality, cross-confirmation, and timeliness.

const OFFICIAL_CERT_SOURCES = new Set([
  'CISA-KEV', 'CNCERT', 'CNVD', 'CNNVD',
  'CISA-Alerts', 'ENISA', 'NCSC', 'BSI', 'ANSSI', 'JPCERT', 'ACSC', 'KrCERT', 'CERT-In',
]);

const COMMERCIAL_INTEL_SOURCES = new Set([
  'VirusTotal', 'ThreatBook', 'Qianxin', 'RecordedFuture', 'Mandiant',
  'CrowdStrike', 'Kaspersky', 'SentinelOne',
]);

const COMMUNITY_SOURCES = new Set([
  'OTX', 'AbuseIPDB', 'PhishTank', 'URLhaus', 'MalwareBazaar',
  'ThreatFox', 'Feodo', 'GreyNoise', 'Spamhaus',
]);

const MEDIA_SOURCES = new Set([
  'FreeBuf', 'Anquanke', '4hou', 'Reddit', 'Bluesky', 'Telegram',
  'BingNews', 'BaiduNews', 'X-Search',
]);

/**
 * Calculate confidence score for an IOC based on multi-source rules.
 * @param {object} ioc — normalized IOC (must have .sources[], .firstSeen, .lastSeen)
 * @returns {number} — confidence score 0-100
 */
export function calculateConfidence(ioc) {
  if (!ioc || !ioc.sources) return 0;

  let score = 20; // base score for any IOC

  const sources = ioc.sources;

  // Official CERT source: +30
  if (sources.some(s => OFFICIAL_CERT_SOURCES.has(s))) {
    score += 30;
  }

  // 3+ source cross-confirmation: +25
  if (sources.length >= 3) {
    score += 25;
  } else if (sources.length === 2) {
    score += 10;
  }

  // Commercial intelligence platform: +20
  if (sources.some(s => COMMERCIAL_INTEL_SOURCES.has(s))) {
    score += 20;
  }

  // Community source (still valuable, but lower weight): +10
  if (sources.some(s => COMMUNITY_SOURCES.has(s))) {
    score += 10;
  }

  // Media/social source: +5
  if (sources.some(s => MEDIA_SOURCES.has(s))) {
    score += 5;
  }

  // Timeliness: IOC seen within last 24h: +10
  if (ioc.lastSeen) {
    const ageMs = Date.now() - new Date(ioc.lastSeen).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours <= 24) score += 10;
    else if (ageHours <= 72) score += 5;
  }

  // Related CVEs boost
  if (ioc.relatedCVEs && ioc.relatedCVEs.length > 0) {
    score += 5;
  }

  return Math.min(100, score);
}

/**
 * Recalculate confidence for all IOCs in an array.
 * Useful after merging/deduplication when source lists have been combined.
 * @param {Array} iocs — array of normalized IOCs
 * @returns {Array} — same array with updated confidence scores
 */
export function recalculateConfidences(iocs) {
  return iocs.map(ioc => ({
    ...ioc,
    confidence: calculateConfidence(ioc),
  }));
}

export { OFFICIAL_CERT_SOURCES, COMMERCIAL_INTEL_SOURCES, COMMUNITY_SOURCES, MEDIA_SOURCES };
