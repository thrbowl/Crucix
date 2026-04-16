// CIRCL Passive DNS — domain history lookups for C2 infrastructure analysis
// No key required. https://www.circl.lu/services/passive-dns/
// Queries a configurable list of high-risk domains for passive DNS history.
// Update PDNS_DOMAINS with domains from your current threat intel.

import { safeFetch } from '../utils/fetch.mjs';

const API_BASE = 'https://www.circl.lu/pdns/query';

// Known APT/C2 domain patterns — update this list as new IOCs emerge
// Start with empty; populate after first sweep with ThreatFox C2 domains
const PDNS_DOMAINS = (process.env.CIRCL_PDNS_DOMAINS || '').split(',').map(s => s.trim()).filter(Boolean);

// Fallback: well-known malicious TLDs to check for recent activity
const FALLBACK_DOMAINS = [
  'duckdns.org',   // Commonly abused free DNS for C2
  'no-ip.com',     // Commonly abused dynamic DNS
];

export async function briefing() {
  const timestamp = new Date().toISOString();
  const targets = PDNS_DOMAINS.length > 0 ? PDNS_DOMAINS : FALLBACK_DOMAINS;

  const results = [];
  for (const domain of targets.slice(0, 10)) { // cap at 10 queries per sweep
    try {
      const data = await safeFetch(`${API_BASE}/${encodeURIComponent(domain)}`, { timeout: 10000 });
      if (data.error) continue;
      const records = Array.isArray(data) ? data : [];
      if (records.length > 0) {
        results.push({
          domain,
          recordCount: records.length,
          firstSeen: records.reduce((min, r) => !min || r.time_first < min ? r.time_first : min, null),
          lastSeen: records.reduce((max, r) => !max || r.time_last > max ? r.time_last : max, null),
          uniqueIPs: [...new Set(records.filter(r => r.rdata).map(r => r.rdata))].slice(0, 10),
        });
      }
    } catch { continue; }
  }

  if (results.length === 0) {
    return { source: 'CIRCL-PDNS', timestamp, status: 'inactive', reason: 'no_domains', message: 'Set CIRCL_PDNS_DOMAINS=domain1,domain2 in .env to enable passive DNS lookups', signals: [] };
  }

  return { source: 'CIRCL-PDNS', timestamp, queriedDomains: results.length, results, signals: [] };
}

if (process.argv[1]?.endsWith('circl-pdns.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
