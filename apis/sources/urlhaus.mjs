// Abuse.ch URLhaus — Malicious URL feed
// No API key required. Tracks URLs distributing malware.

import { safeFetch } from '../utils/fetch.mjs';

const API_URL = 'https://urlhaus-api.abuse.ch/v1/urls/recent/limit/25/';
const FALLBACK_URL = 'https://urlhaus.abuse.ch/downloads/json_recent/';

export async function briefing() {
  const timestamp = new Date().toISOString();

  let urls = null;

  try {
    const res = await fetch('https://urlhaus-api.abuse.ch/v1/urls/recent/', {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    if (data.urls && Array.isArray(data.urls)) {
      urls = data.urls;
    }
  } catch {
    // fall through to fallback
  }

  if (!urls) {
    const data = await safeFetch(FALLBACK_URL, { timeout: 20000 });
    if (data.error) {
      return { source: 'URLhaus', timestamp, error: data.error };
    }
    if (Array.isArray(data)) {
      urls = data;
    } else if (data.urls && Array.isArray(data.urls)) {
      urls = data.urls;
    } else {
      return { source: 'URLhaus', timestamp, error: 'unexpected response format' };
    }
  }

  const recentUrls = urls.slice(0, 50).map(u => ({
    url: u.url,
    status: u.url_status,
    threat: u.threat || null,
    host: u.host || null,
    dateAdded: u.date_added,
    tags: u.tags || [],
  }));

  const byThreat = {};
  const byStatus = {};
  for (const u of urls) {
    const threat = u.threat || 'unknown';
    byThreat[threat] = (byThreat[threat] || 0) + 1;
    const status = u.url_status || 'unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  const signals = [];
  const onlineCount = byStatus['online'] || 0;
  if (onlineCount > 20) {
    signals.push({
      severity: 'medium',
      signal: `${onlineCount} malicious URLs currently online — active malware distribution`,
    });
  }

  const topThreats = Object.entries(byThreat)
    .filter(([k]) => k !== 'unknown')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (topThreats.length > 0) {
    signals.push({
      severity: 'info',
      signal: `Top URL threats: ${topThreats.map(([k, v]) => `${k} (${v})`).join(', ')}`,
    });
  }

  return {
    source: 'URLhaus',
    timestamp,
    totalUrls: urls.length,
    recentUrls,
    byThreat,
    byStatus,
    signals,
  };
}

if (process.argv[1]?.endsWith('urlhaus.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
