// BGP Ranking (CIRCL) — ASN reputation. Legacy GET /json/asns was removed; use POST /json/asns_global_ranking.
// Primary: https://bgpranking-ng.circl.lu/json  Fallback: https://bgpranking.circl.lu/json
// Both endpoints confirmed live as of 2026-04-16; try both in sequence if the primary fails.

import { daysAgo } from '../utils/fetch.mjs';

const BASE_URLS = [
  'https://bgpranking-ng.circl.lu/json',
  'https://bgpranking.circl.lu/json',
];

async function postGlobalRanking(dateStr, base) {
  const res = await fetch(`${base}/asns_global_ranking`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Crucix/1.0',
    },
    body: JSON.stringify({ date: dateStr }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function postGlobalRankingWithFallback(dateStr) {
  let lastErr = null;
  for (const base of BASE_URLS) {
    try {
      return await postGlobalRanking(dateStr, base);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`BGP Ranking endpoint unreachable — CIRCL service may be down (${lastErr?.message ?? lastErr})`);
}

function formatTuples(response, dateStr) {
  const rows = Array.isArray(response) ? response : [];
  const topMaliciousASNs = rows.slice(0, 30).map((entry, idx) => {
    if (Array.isArray(entry) && entry.length >= 2) {
      const [asn, score] = entry;
      return {
        asn: String(asn),
        name: null,
        rank: idx + 1,
        score: typeof score === 'number' ? score : Number(score),
        ipCount: null,
      };
    }
    if (entry && typeof entry === 'object') {
      return {
        asn: entry.asn || entry.asNumber || null,
        name: entry.name || entry.description || null,
        rank: entry.rank ?? entry.ranking ?? idx + 1,
        score: entry.score ?? null,
        ipCount: entry.ipCount || null,
      };
    }
    return { asn: entry != null ? String(entry) : null, name: null, rank: idx + 1, score: null, ipCount: null };
  });

  const signals = [];
  if (topMaliciousASNs.length > 0) {
    signals.push({
      severity: 'info',
      signal: `${topMaliciousASNs.length} ASNs in global BGP ranking snapshot (${dateStr})`,
    });
  }
  const top10 = topMaliciousASNs.slice(0, 10);
  if (top10.length >= 3 && top10[0].asn) {
    signals.push({
      severity: 'medium',
      signal: `Highest-ranked ASN in snapshot: ${top10[0].asn} — review for abuse or compromised infrastructure`,
    });
  }

  return {
    source: 'BGP-Ranking',
    timestamp: new Date().toISOString(),
    date: dateStr,
    topMaliciousASNs,
    signals,
  };
}

export async function briefing() {
  let lastError = null;
  for (let i = 0; i < 7; i++) {
    const dateStr = daysAgo(i);
    try {
      const data = await postGlobalRankingWithFallback(dateStr);
      const rows = data?.response;
      if (Array.isArray(rows) && rows.length > 0) {
        return formatTuples(rows, dateStr);
      }
      lastError = `No ranking data for ${dateStr}`;
    } catch (e) {
      lastError = e.message || String(e);
    }
  }

  return {
    source: 'BGP-Ranking',
    timestamp: new Date().toISOString(),
    error: lastError || 'BGP Ranking endpoint unreachable — CIRCL service may be down',
  };
}

if (process.argv[1]?.endsWith('bgp-ranking.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
