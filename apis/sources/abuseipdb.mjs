// AbuseIPDB — IP address abuse/threat intelligence
// Requires ABUSEIPDB_API_KEY. Free tier at https://www.abuseipdb.com/register
// Provides crowdsourced IP reputation data including blacklists and abuse reports.

import { safeFetch } from '../utils/fetch.mjs';

const BLACKLIST_URL = 'https://api.abuseipdb.com/api/v2/blacklist';

function aggregateByCountry(entries) {
  const counts = {};
  for (const e of entries) {
    const cc = e.countryCode || 'unknown';
    counts[cc] = (counts[cc] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {});
}

function buildSignals(totalBlacklisted, topAbusers) {
  const signals = [];

  if (totalBlacklisted > 10000) {
    signals.push({
      severity: 'medium',
      signal: `${totalBlacklisted} IPs on AbuseIPDB blacklist (confidence ≥ 90%) — significant malicious activity`,
    });
  }

  const maxScore = topAbusers[0]?.abuseConfidenceScore ?? 0;
  if (maxScore === 100 && topAbusers.filter(a => a.abuseConfidenceScore === 100).length > 10) {
    signals.push({
      severity: 'high',
      signal: `${topAbusers.filter(a => a.abuseConfidenceScore === 100).length} IPs with 100% abuse confidence — confirmed threat actors`,
    });
  }

  return signals;
}

export async function briefing() {
  const key = process.env.ABUSEIPDB_API_KEY;
  if (!key) {
    return {
      source: 'AbuseIPDB',
      timestamp: new Date().toISOString(),
      status: 'no_credentials',
      message: 'Set ABUSEIPDB_API_KEY in .env. Get a free key at https://www.abuseipdb.com/register',
    };
  }

  const data = await safeFetch(
    `${BLACKLIST_URL}?confidenceMinimum=90&limit=50`,
    {
      timeout: 20000,
      headers: { Key: key, Accept: 'application/json' },
    },
  );

  if (data.error) {
    return {
      source: 'AbuseIPDB',
      timestamp: new Date().toISOString(),
      error: data.error,
    };
  }

  const entries = data.data || [];
  const meta = data.meta || {};
  const totalBlacklisted = meta.generatedAt
    ? entries.length
    : entries.length;

  const topAbusers = entries.slice(0, 50).map(e => ({
    ipAddress: e.ipAddress,
    abuseConfidenceScore: e.abuseConfidenceScore,
    countryCode: e.countryCode || null,
    totalReports: e.totalReports ?? null,
    lastReportedAt: e.lastReportedAt || null,
  }));

  const byCountry = aggregateByCountry(entries);

  return {
    source: 'AbuseIPDB',
    timestamp: new Date().toISOString(),
    totalBlacklisted: meta.totalEntries || totalBlacklisted,
    topAbusers,
    byCountry,
    signals: buildSignals(meta.totalEntries || totalBlacklisted, topAbusers),
  };
}

if (process.argv[1]?.endsWith('abuseipdb.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
