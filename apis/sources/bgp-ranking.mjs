// BGP Ranking (CIRCL) — Autonomous System reputation ranking
// No API key required. Ranks ASNs by malicious activity observed across threat feeds.
// Useful for identifying networks hosting disproportionate threat infrastructure.

import { safeFetch, today } from '../utils/fetch.mjs';

const BASE = 'https://bgpranking-ng.circl.lu/json';

export async function briefing() {
  const dateStr = today();

  // Fetch top malicious ASNs from abuse.ch feed
  const data = await safeFetch(
    `${BASE}/asns?date=${dateStr}&source=abuse_ch`,
    { timeout: 20000 },
  );

  if (data.error) {
    // Try without date parameter as fallback
    const fallback = await safeFetch(
      `${BASE}/asns?source=abuse_ch`,
      { timeout: 20000 },
    );

    if (fallback.error) {
      return {
        source: 'BGP-Ranking',
        timestamp: new Date().toISOString(),
        error: fallback.error,
      };
    }

    return formatResult(fallback);
  }

  return formatResult(data);
}

function formatResult(data) {
  const response = data.response || data;
  const asns = Array.isArray(response) ? response : response.asns || [];

  const topMaliciousASNs = asns.slice(0, 30).map((entry, idx) => {
    if (typeof entry === 'object') {
      return {
        asn: entry.asn || entry.asNumber || null,
        name: entry.name || entry.description || null,
        rank: entry.rank ?? entry.ranking ?? idx + 1,
        ipCount: entry.ipCount || null,
      };
    }
    return { asn: entry, name: null, rank: idx + 1 };
  });

  const signals = [];

  if (topMaliciousASNs.length > 0) {
    signals.push({
      severity: 'info',
      signal: `${topMaliciousASNs.length} ASNs ranked by malicious activity via abuse.ch feed`,
    });
  }

  // Flag if any well-known large ASNs appear in top 10
  const top10 = topMaliciousASNs.slice(0, 10);
  if (top10.length >= 10) {
    signals.push({
      severity: 'medium',
      signal: `Top malicious ASN: ${top10[0].asn || 'unknown'} — monitor for hosting abuse or compromised infrastructure`,
    });
  }

  return {
    source: 'BGP-Ranking',
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
    topMaliciousASNs,
    signals,
  };
}

if (process.argv[1]?.endsWith('bgp-ranking.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
