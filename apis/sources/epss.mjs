import { safeFetch } from '../utils/fetch.mjs';

const TOP_URL = 'https://api.first.org/data/v1/epss?order=!epss&limit=50';
const RECENT_URL = 'https://api.first.org/data/v1/epss?days=1&order=!epss&limit=20';

function parseEntries(data) {
  return (data.data || []).map(d => ({
    cve: d.cve,
    epss: parseFloat(d.epss) || 0,
    percentile: parseFloat(d.percentile) || 0,
  }));
}

export async function briefing() {
  const [topData, recentData] = await Promise.all([
    safeFetch(TOP_URL, { timeout: 20000 }),
    safeFetch(RECENT_URL, { timeout: 20000 }),
  ]);

  if (topData.error && recentData.error) {
    return { source: 'EPSS', timestamp: new Date().toISOString(), error: topData.error };
  }

  const topByScore = topData.error ? [] : parseEntries(topData);
  const recentSpikes = recentData.error ? [] : parseEntries(recentData);

  const signals = [];
  const extreme = topByScore.filter(e => e.epss > 0.9);
  if (extreme.length > 0) {
    signals.push({
      severity: 'high',
      signal: `${extreme.length} CVE(s) with EPSS > 0.9 — extremely likely to be exploited`,
    });
  }

  const veryHigh = topByScore.filter(e => e.epss > 0.7);
  if (veryHigh.length > 5) {
    signals.push({
      severity: 'medium',
      signal: `${veryHigh.length} CVEs with EPSS > 0.7 in the top 50`,
    });
  }

  return {
    source: 'EPSS',
    timestamp: new Date().toISOString(),
    topByScore,
    recentSpikes,
    signals,
  };
}

if (process.argv[1]?.endsWith('epss.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
