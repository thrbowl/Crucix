// Qianxin Hunter (hunter.how) — Chinese internet asset search engine
// Requires HUNTER_API_KEY (https://hunter.how/search-api)
// Complements FOFA and ZoomEye for Chinese network asset discovery

import { safeFetch } from '../utils/fetch.mjs';

const API_BASE = 'https://api.hunter.how/search';

// Security-relevant queries for sweeping
const SWEEP_QUERIES = [
  'protocol="redis" && country="CN"',         // Exposed Redis in China
  'protocol="elasticsearch" && country="CN"', // Exposed Elasticsearch
  'app="Shiro" && country="CN"',              // Apache Shiro (commonly exploited)
  'app="WebLogic" && country="CN"',           // Oracle WebLogic
];

function buildDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 7); // last 7 days
  const fmt = d => d.toISOString().split('T')[0];
  return { start_time: fmt(start), end_time: fmt(end) };
}

export async function briefing() {
  const timestamp = new Date().toISOString();
  const key = process.env.HUNTER_API_KEY;

  if (!key) {
    return { source: 'Qianxin-Hunter', timestamp, status: 'no_credentials', message: 'Set HUNTER_API_KEY in .env — get key at https://hunter.how' };
  }

  const { start_time, end_time } = buildDateRange();
  const results = [];

  for (const query of SWEEP_QUERIES) {
    try {
      const url = `${API_BASE}?api-key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&start_time=${start_time}&end_time=${end_time}&page=1&page_size=10`;
      const data = await safeFetch(url, { timeout: 15000 });
      if (!data.error && data.data) {
        results.push({
          query,
          total: data.data.total || 0,
          assets: (data.data.list || []).slice(0, 5).map(a => ({
            ip: a.ip,
            port: a.port,
            domain: a.domain || null,
            country: a.country || null,
            updateTime: a.updated_at || null,
          })),
        });
      }
    } catch { continue; }
  }

  if (results.length === 0) {
    return { source: 'Qianxin-Hunter', timestamp, status: 'rss_unavailable', message: 'All Hunter queries failed', signals: [] };
  }

  const totalExposed = results.reduce((s, r) => s + (r.total || 0), 0);
  const signals = [];
  if (totalExposed > 1000) {
    signals.push({ severity: 'medium', signal: `Hunter: ${totalExposed} exposed Chinese assets matching high-risk service patterns (Redis/ES/Shiro/WebLogic)` });
  }

  return { source: 'Qianxin-Hunter', timestamp, queryResults: results, totalExposed, signals };
}

if (process.argv[1]?.endsWith('qianxin-hunter.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
