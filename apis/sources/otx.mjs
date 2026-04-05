// AlienVault OTX — Open Threat Exchange pulse feed
// Requires OTX_API_KEY. Free at https://otx.alienvault.com/api

import { safeFetch, daysAgo } from '../utils/fetch.mjs';

const BASE = 'https://otx.alienvault.com/api/v1';

export async function briefing() {
  const timestamp = new Date().toISOString();
  const apiKey = process.env.OTX_API_KEY;

  if (!apiKey) {
    return {
      source: 'OTX',
      timestamp,
      status: 'no_credentials',
      message: 'Set OTX_API_KEY in .env. Free key at https://otx.alienvault.com/api',
    };
  }

  const headers = { 'X-OTX-API-KEY': apiKey };
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();

  const [subscribed, activity] = await Promise.all([
    safeFetch(`${BASE}/pulses/subscribed?limit=20&modified_since=${since}`, { timeout: 20000, headers }),
    safeFetch(`${BASE}/pulses/activity?limit=20`, { timeout: 20000, headers }),
  ]);

  if (subscribed.error && activity.error) {
    return { source: 'OTX', timestamp, error: subscribed.error || activity.error };
  }

  const pulses = subscribed.results || [];
  const activityPulses = activity.results || [];
  const allPulses = [...pulses, ...activityPulses];

  const recentPulses = allPulses.slice(0, 30).map(p => ({
    name: p.name,
    description: (p.description || '').substring(0, 300),
    tags: p.tags || [],
    tlp: p.TLP || p.tlp || 'unknown',
    indicatorCount: p.indicator_count || (p.indicators || []).length,
    created: p.created,
    modified: p.modified,
    adversary: p.adversary || null,
    targetedCountries: p.targeted_countries || [],
  }));

  const indicators = { total: 0, byType: {} };
  for (const p of allPulses) {
    const count = p.indicator_count || (p.indicators || []).length;
    indicators.total += count;
    for (const ind of (p.indicators || [])) {
      const t = ind.type || 'unknown';
      indicators.byType[t] = (indicators.byType[t] || 0) + 1;
    }
  }

  const signals = [];
  if (pulses.length >= 15) {
    signals.push({
      severity: 'medium',
      signal: `${pulses.length} modified pulses in last 7 days — elevated threat activity`,
    });
  }

  const aptPulses = allPulses.filter(p => p.adversary);
  if (aptPulses.length > 0) {
    const groups = [...new Set(aptPulses.map(p => p.adversary))].slice(0, 5);
    signals.push({
      severity: 'high',
      signal: `APT-linked pulses detected: ${groups.join(', ')}`,
    });
  }

  return {
    source: 'OTX',
    timestamp,
    totalPulses: allPulses.length,
    recentPulses,
    indicators,
    signals,
  };
}

if (process.argv[1]?.endsWith('otx.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
