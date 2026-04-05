// VirusTotal — Threat category overview (free tier)
// Requires VIRUSTOTAL_API_KEY. Free at https://www.virustotal.com/gui/join-us
// Free tier: 4 requests/minute, 500 requests/day.

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://www.virustotal.com/api/v3';

export async function briefing() {
  const timestamp = new Date().toISOString();
  const apiKey = process.env.VIRUSTOTAL_API_KEY;

  if (!apiKey) {
    return {
      source: 'VirusTotal',
      timestamp,
      status: 'no_credentials',
      message: 'Set VIRUSTOTAL_API_KEY in .env. Free key at https://www.virustotal.com/gui/join-us',
    };
  }

  const headers = { 'x-apikey': apiKey };

  const data = await safeFetch(`${BASE}/popular_threat_categories`, { timeout: 15000, headers });

  if (data.error) {
    return { source: 'VirusTotal', timestamp, error: data.error };
  }

  const categories = data.data || [];
  const popularCategories = categories.slice(0, 30).map(c => ({
    name: c.id || c,
    count: c.attributes?.count || null,
  }));

  const signals = [];
  if (popularCategories.length > 0) {
    signals.push({
      severity: 'info',
      signal: `VirusTotal API connected — ${popularCategories.length} threat categories available`,
    });
  }

  return {
    source: 'VirusTotal',
    timestamp,
    status: 'connected',
    popularCategories,
    signals,
  };
}

if (process.argv[1]?.endsWith('virustotal.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
