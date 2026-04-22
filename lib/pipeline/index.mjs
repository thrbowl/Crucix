// lib/pipeline/index.mjs
import { normalizeCVE, deduplicateCVEs } from '../normalize/cve.mjs';
import { normalizeIOC, deduplicateIOCs } from '../normalize/ioc.mjs';
import { upsertObject } from '../stix/objects.mjs';
import { toStixVulnerability } from './vulnerability.mjs';
import { toStixIndicator } from './indicator.mjs';

/**
 * Adapt synthesized CVE format to normalizeCVE-compatible format.
 * Synthesized CVEs use different field names than normalizeCVE expects.
 *
 * @param {object} c - CVE from synthesized.cves.recent
 * @returns {object} - normalizeCVE-compatible object
 */
function adaptSynthesizedCVE(c) {
  return {
    id: c.id,
    cvssV3: typeof c.cvss === 'number' ? c.cvss : null,
    epssScore: typeof c.epss === 'number' ? c.epss : null,
    kev: c.inKEV ?? false,
    pocAvailable: c.hasPoc ?? false,
    sources: c.sources ?? [],
    description: c.description ?? null,
    patchAvailable: false,
    lifecycle: 'published',
    vendors: [],
    products: [],
    pocUrls: [],
    cnvdId: null,
    cnnvdId: null,
    attackVector: null,
    attackerKbScore: null,
    firstPublished: c.publishedDate ?? new Date().toISOString(),
    lastModified: c.publishedDate ?? new Date().toISOString(),
  };
}

/**
 * Extract raw IOC records from all synthesized IOC categories.
 * Maps various field names to the standard { value, confidence, tags, firstSeen, lastSeen, source } shape.
 *
 * @param {object} iocs - synthesized.iocs
 * @returns {Array<{value, confidence?, tags, firstSeen, lastSeen, source}>}
 */
function extractRawIOCs(iocs) {
  const raw = [];
  const now = new Date().toISOString();

  // Malware hashes (MalwareBazaar) + IOC indicators (ThreatFox)
  for (const m of iocs?.malware ?? []) {
    const value = m.hash || m.indicator || m.value;
    if (value) {
      raw.push({
        value,
        tags: m.tags ?? [],
        firstSeen: m.firstSeen ?? now,
        lastSeen: m.firstSeen ?? now,
        source: m.source ?? 'MalwareBazaar',
      });
    }
  }

  // C2 endpoints (IPs from Feodo, URLs from URLhaus)
  for (const c of iocs?.c2 ?? []) {
    const value = c.url || c.ip;
    if (value) {
      raw.push({
        value,
        tags: c.tags ?? (c.malware ? [c.malware] : []),
        firstSeen: c.firstSeen ?? now,
        lastSeen: c.firstSeen ?? now,
        source: c.source ?? 'Feodo',
      });
    }
  }

  // Malicious IPs (AbuseIPDB, GreyNoise, Spamhaus)
  for (const m of iocs?.maliciousIPs ?? []) {
    if (m.ip) {
      raw.push({
        value: m.ip,
        confidence: m.confidence ?? 50,
        tags: m.tags ?? [],
        firstSeen: now,
        lastSeen: now,
        source: m.source ?? 'AbuseIPDB',
      });
    }
  }

  // Phishing URLs
  for (const p of iocs?.phishing ?? []) {
    if (p.url) {
      raw.push({
        value: p.url,
        tags: p.target ? [p.target] : [],
        firstSeen: p.submitDate ?? now,
        lastSeen: p.submitDate ?? now,
        source: p.source ?? 'OpenPhish',
      });
    }
  }

  return raw;
}

/**
 * Run the STIX pipeline on synthesized sweep data.
 * Converts CVEs and IOCs to STIX objects and persists them to PostgreSQL.
 *
 * @param {object|null} pool - pg Pool from lib/db/index.mjs (null = no-op)
 * @param {object} synthesized - Output of synthesize() from dashboard/inject.mjs
 * @returns {Promise<{vulnerabilities: number, indicators: number, errors: string[]}>}
 */
export async function runPipeline(pool, synthesized) {
  if (!pool) {
    console.warn('[Pipeline] Database not configured — skipping STIX persistence');
    return { vulnerabilities: 0, indicators: 0, errors: [] };
  }

  const errors = [];
  let vulnCount = 0;
  let indicatorCount = 0;

  // --- Process CVEs ---
  const rawCves = (synthesized?.cves?.recent ?? []).map(adaptSynthesizedCVE);
  const cves = deduplicateCVEs(
    rawCves.map(c => normalizeCVE(c, 'synthesized')).filter(Boolean)
  );

  for (const cve of cves) {
    try {
      const stixObj = toStixVulnerability(cve);
      await upsertObject(pool, stixObj);
      vulnCount++;
    } catch (err) {
      errors.push(`CVE ${cve.id}: ${err.message}`);
    }
  }

  // --- Process IOCs ---
  const rawIOCs = extractRawIOCs(synthesized?.iocs);
  const iocs = deduplicateIOCs(
    rawIOCs.map(i => normalizeIOC(i, i.source ?? 'unknown')).filter(Boolean)
  );

  for (const ioc of iocs) {
    try {
      const { indicator, sco } = toStixIndicator(ioc);
      await upsertObject(pool, indicator);
      await upsertObject(pool, sco);
      indicatorCount++;
    } catch (err) {
      errors.push(`IOC ${ioc.value}: ${err.message}`);
    }
  }

  console.log(`[Pipeline] Persisted: ${vulnCount} vulnerabilities, ${indicatorCount} indicators, ${errors.length} errors`);
  if (errors.length > 0) {
    console.error('[Pipeline] Errors (first 5):', errors.slice(0, 5));
  }

  return { vulnerabilities: vulnCount, indicators: indicatorCount, errors };
}
