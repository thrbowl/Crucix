// Hybrid Analysis — public malware sandbox feed (abuse.ch ecosystem)
// Requires HYBRID_ANALYSIS_KEY (free at https://www.hybrid-analysis.com/apikeys)
// Returns recent sandbox analysis results with behavioral IOCs

import { safeFetch } from '../utils/fetch.mjs';

const FEED_URL = 'https://www.hybrid-analysis.com/api/v2/feed?_timestamp=last_hour';
const RECENT_URL = 'https://www.hybrid-analysis.com/api/v2/submissions/search?_limit=25&verdict=malicious';

export async function briefing() {
  const timestamp = new Date().toISOString();
  const key = process.env.HYBRID_ANALYSIS_KEY;

  if (!key) {
    return { source: 'Hybrid-Analysis', timestamp, status: 'no_credentials', message: 'Set HYBRID_ANALYSIS_KEY in .env — free key at https://www.hybrid-analysis.com/apikeys' };
  }

  const headers = {
    'api-key': key,
    'User-Agent': 'Falcon Sandbox',
    'Content-Type': 'application/json',
  };

  const [feedRes, recentRes] = await Promise.allSettled([
    safeFetch(FEED_URL, { timeout: 20000, headers }),
    safeFetch(RECENT_URL, { timeout: 20000, headers }),
  ]);

  const feedItems = feedRes.status === 'fulfilled' && !feedRes.value.error
    ? (feedRes.value.data || feedRes.value || []).slice(0, 30).map(s => ({
        sha256: s.sha256,
        filename: s.submit_name || s.filename || null,
        malwareFamily: s.vx_family || s.classification_tags?.[0] || null,
        verdict: s.verdict,
        threat_score: s.threat_score || null,
        analysis_time: s.analysis_start_time || null,
      }))
    : [];

  const recentItems = recentRes.status === 'fulfilled' && !recentRes.value.error
    ? (recentRes.value.data || recentRes.value || []).slice(0, 15)
    : [];

  if (feedItems.length === 0) {
    return { source: 'Hybrid-Analysis', timestamp, status: 'rss_unavailable', message: 'Hybrid Analysis feed returned no data', signals: [] };
  }

  const families = feedItems.reduce((acc, s) => {
    if (s.malwareFamily) acc[s.malwareFamily] = (acc[s.malwareFamily] || 0) + 1;
    return acc;
  }, {});
  const topFamilies = Object.entries(families).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const signals = [];
  if (feedItems.length > 20) {
    signals.push({ severity: 'medium', signal: `Hybrid Analysis: ${feedItems.length} malicious samples analyzed in last hour${topFamilies.length > 0 ? ' — top families: ' + topFamilies.map(([f, c]) => `${f}(${c})`).join(', ') : ''}` });
  }

  return { source: 'Hybrid-Analysis', timestamp, sampleCount: feedItems.length, samples: feedItems, topFamilies: Object.fromEntries(topFamilies), signals };
}

if (process.argv[1]?.endsWith('hybrid-analysis.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
