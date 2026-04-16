// GreyNoise Community API — Internet-wide scan and attack traffic analysis
// Requires GREYNOISE_API_KEY. Free community tier available at https://viz.greynoise.io/signup
// Tracks mass-scanning IPs, classifying them as malicious/benign/unknown.

import { safeFetch } from '../utils/fetch.mjs';

if (!process.env.GREYNOISE_API_KEY) {
  console.warn('[Crucix] GREYNOISE_API_KEY not set — GreyNoise disabled. Free key: https://viz.greynoise.io/signup');
}

const GNQL_URL = 'https://api.greynoise.io/v2/experimental/gnql';
const GNQL_STATS_URL = 'https://api.greynoise.io/v2/experimental/gnql/stats';

function buildHeaders(apiKey) {
  return { key: apiKey, Accept: 'application/json' };
}

function summarizeScanners(data) {
  const items = data.data || [];
  return items.slice(0, 25).map(item => ({
    ip: item.ip,
    classification: item.classification,
    tags: (item.tags || []).slice(0, 10),
    organization: item.metadata?.organization || item.organization || null,
    last_seen: item.last_seen || item.seen_before || null,
    os: item.metadata?.os || null,
    ports: (item.raw_data?.scan || []).slice(0, 5).map(s => s.port),
  }));
}

function buildSignals(totalMalicious, scanners) {
  const signals = [];

  if (totalMalicious > 1000) {
    signals.push({
      severity: 'high',
      signal: `${totalMalicious} malicious IPs actively scanning — elevated internet threat level`,
    });
  } else if (totalMalicious > 100) {
    signals.push({
      severity: 'medium',
      signal: `${totalMalicious} malicious scanners detected by GreyNoise`,
    });
  }

  const tagCounts = {};
  for (const s of scanners) {
    for (const tag of (s.tags || [])) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  const hotTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (hotTags.length > 0) {
    signals.push({
      severity: 'info',
      signal: `Top scan activity tags: ${hotTags.map(([t, c]) => `${t}(${c})`).join(', ')}`,
    });
  }

  return signals;
}

export async function briefing() {
  const apiKey = process.env.GREYNOISE_API_KEY;
  if (!apiKey) {
    return {
      source: 'GreyNoise',
      timestamp: new Date().toISOString(),
      status: 'no_credentials',
      message: 'Set GREYNOISE_API_KEY in .env. Get a free key at https://viz.greynoise.io/signup',
    };
  }

  const headers = buildHeaders(apiKey);

  // Try GNQL query first for detailed scanner data
  const gnql = await safeFetch(
    `${GNQL_URL}?query=classification:malicious&size=25`,
    { timeout: 15000, headers },
  );

  if (!gnql.error && gnql.data) {
    const scanners = summarizeScanners(gnql);
    const totalMalicious = gnql.count || gnql.data?.length || 0;
    return {
      source: 'GreyNoise',
      timestamp: new Date().toISOString(),
      totalMalicious,
      topScanners: scanners,
      signals: buildSignals(totalMalicious, scanners),
    };
  }

  // Fallback to stats endpoint
  const stats = await safeFetch(
    `${GNQL_STATS_URL}?query=classification:malicious`,
    { timeout: 15000, headers },
  );

  if (stats.error) {
    return {
      source: 'GreyNoise',
      timestamp: new Date().toISOString(),
      error: stats.error,
    };
  }

  const totalMalicious = stats.count || 0;
  const topOrgs = (stats.stats?.organizations || []).slice(0, 10);
  const topCountries = (stats.stats?.countries || []).slice(0, 10);
  const topTags = (stats.stats?.tags || []).slice(0, 10);

  return {
    source: 'GreyNoise',
    timestamp: new Date().toISOString(),
    totalMalicious,
    topScanners: [],
    statsBreakdown: { topOrgs, topCountries, topTags },
    signals: buildSignals(totalMalicious, []),
  };
}

if (process.argv[1]?.endsWith('greynoise.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
