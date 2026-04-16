// Censys — internet-wide scan data for exposure monitoring
// Requires CENSYS_API_ID + CENSYS_API_SECRET (free research account at https://search.censys.io/account/api)
// Provides: internet asset exposure snapshots for specific high-risk queries

import { safeFetch } from '../utils/fetch.mjs';

const SEARCH_URL = 'https://search.censys.io/api/v2/hosts/search';

const SWEEP_QUERIES = [
  { q: 'services.service_name: "REDIS" and not labels: "tarpit"', label: 'Exposed Redis' },
  { q: 'services.service_name: "ELASTICSEARCH" and not labels: "tarpit"', label: 'Exposed Elasticsearch' },
  { q: 'services.http.response.html_title: "phpMyAdmin"', label: 'Exposed phpMyAdmin' },
  { q: 'services.service_name: "KUBERNETES" and services.port: 8080', label: 'Exposed Kubernetes API' },
];

export async function briefing() {
  const timestamp = new Date().toISOString();
  const id = process.env.CENSYS_API_ID;
  const secret = process.env.CENSYS_API_SECRET;

  if (!id || !secret) {
    return { source: 'Censys', timestamp, status: 'no_credentials', message: 'Set CENSYS_API_ID and CENSYS_API_SECRET in .env — free research account at https://search.censys.io/account/api' };
  }

  const authHeader = 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
  const results = [];

  for (const { q, label } of SWEEP_QUERIES) {
    try {
      const data = await safeFetch(SEARCH_URL, {
        method: 'POST',
        timeout: 20000,
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, per_page: 10, fields: ['ip', 'location.country', 'services.port', 'services.service_name'] }),
      });
      if (!data.error && data.result) {
        results.push({
          label,
          query: q,
          total: data.result.total?.value || data.result.total || 0,
          sample: (data.result.hits || []).slice(0, 5).map(h => ({
            ip: h.ip,
            country: h.location?.country || null,
            port: h.services?.[0]?.port || null,
          })),
        });
      }
    } catch { continue; }
  }

  if (results.length === 0) {
    return { source: 'Censys', timestamp, status: 'api_error', message: 'All Censys queries failed', signals: [] };
  }

  const totalExposed = results.reduce((s, r) => s + (r.total || 0), 0);
  const signals = [];
  if (totalExposed > 10000) {
    signals.push({ severity: 'medium', signal: `Censys: ${totalExposed.toLocaleString()} internet-exposed assets matching high-risk service patterns` });
  }

  return { source: 'Censys', timestamp, queryResults: results, totalExposed, signals };
}

if (process.argv[1]?.endsWith('censys.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
