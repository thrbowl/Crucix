// Abuse.ch URLhaus — Malicious URL feed
// Public JSON dump needs no key. Authenticated API uses ABUSECH_AUTH_KEY (free at auth.abuse.ch).

import '../utils/env.mjs';
import { safeFetch } from '../utils/fetch.mjs';

const API_RECENT = 'https://urlhaus-api.abuse.ch/v1/urls/recent/';
const FALLBACK_URL = 'https://urlhaus.abuse.ch/downloads/json_recent/';

/** json_recent is an object keyed by URLhaus id → array of row objects (not a flat array). */
function normalizeUrlhausPayload(raw) {
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw)) return raw.map(normalizeUrlRow);
  if (Array.isArray(raw.urls)) return raw.urls.map(normalizeUrlRow);

  const out = [];
  for (const [id, val] of Object.entries(raw)) {
    if (!Array.isArray(val)) continue;
    for (const u of val) {
      if (!u || typeof u !== 'object') continue;
      out.push(normalizeUrlRow(u, id));
    }
  }
  return out;
}

function normalizeUrlRow(u, idHint) {
  const dateAdded = u.date_added || u.dateadded || null;
  let host = u.host || null;
  if (!host && u.url) {
    try {
      host = new URL(u.url).hostname;
    } catch {
      host = null;
    }
  }
  return {
    ...u,
    id: u.id || idHint,
    date_added: dateAdded,
    dateAdded,
    host,
  };
}

export async function briefing() {
  const timestamp = new Date().toISOString();
  const authKey = (process.env.ABUSECH_AUTH_KEY || '').trim();

  let urls = null;

  if (authKey) {
    const data = await safeFetch(API_RECENT, {
      method: 'POST',
      headers: { 'Auth-Key': authKey },
      timeout: 20000,
      retries: 1,
    });
    if (!data.error && Array.isArray(data.urls)) {
      urls = data.urls.map(u => normalizeUrlRow(u));
    }
  }

  if (!urls || !urls.length) {
    const data = await safeFetch(FALLBACK_URL, { timeout: 25000, retries: 1 });
    if (data.error) {
      return { source: 'URLhaus', timestamp, error: data.error };
    }
    urls = normalizeUrlhausPayload(data);
    if (!urls.length) {
      return {
        source: 'URLhaus',
        timestamp,
        error: 'unexpected response format from URLhaus json_recent',
      };
    }
  }

  const recentUrls = urls.slice(0, 50).map(u => ({
    url: u.url,
    status: u.url_status,
    url_status: u.url_status,
    threat: u.threat || null,
    url_type: u.threat || null,
    host: u.host || null,
    dateAdded: u.date_added || u.dateAdded,
    date_added: u.date_added || u.dateAdded,
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

  const onlineUrls = recentUrls.filter(
    u => String(u.url_status || u.status || '').toLowerCase() === 'online'
  );

  const signals = [];
  const onlineCount = byStatus.online || 0;
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
    onlineCount,
    recentUrls,
    activeUrls: onlineUrls.length ? onlineUrls : recentUrls,
    byThreat,
    byStatus,
    signals,
  };
}

if (process.argv[1]?.endsWith('urlhaus.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
