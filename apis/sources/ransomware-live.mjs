// Ransomware.live — Recent Ransomware Victim Tracker
// No API key required. Tracks ransomware gang activity and victim disclosures.

import { safeFetch } from '../utils/fetch.mjs';

const API_URL = 'https://api.ransomware.live/recentvictims';

function groupBy(victims, key) {
  const map = {};
  for (const v of victims) {
    const k = v[key] || 'Unknown';
    map[k] = (map[k] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(map).sort((a, b) => b[1] - a[1])
  );
}

export async function briefing() {
  const timestamp = new Date().toISOString();
  const data = await safeFetch(API_URL, { timeout: 30000 });

  if (data.error) {
    return { source: 'Ransomware-Live', timestamp, error: data.error };
  }

  const raw = Array.isArray(data) ? data : data.data || data.results || [];
  if (!raw.length) {
    return { source: 'Ransomware-Live', timestamp, error: 'No victim data returned', totalRecentVictims: 0 };
  }

  const victims = raw.map(v => ({
    name: v.victim || v.name || 'Unknown',
    group: v.group_name || v.group || 'Unknown',
    discovered: v.discovered || v.date || null,
    country: v.country || null,
    sector: v.activity || v.sector || null,
    website: v.website || v.url || null,
  }));

  const byGroup = groupBy(victims, 'group');
  const bySector = groupBy(victims, 'sector');
  const byCountry = groupBy(victims, 'country');

  const signals = [];

  for (const [group, count] of Object.entries(byGroup)) {
    if (count > 5) {
      signals.push({
        severity: 'high',
        signal: `Ransomware group "${group}" claimed ${count} victims in recent data — possible campaign surge`,
      });
    }
  }

  const sensitiveSectors = ['financial', 'finance', 'banking', 'healthcare', 'health', 'hospital', 'medical'];
  for (const [sector, count] of Object.entries(bySector)) {
    if (sensitiveSectors.some(s => (sector || '').toLowerCase().includes(s))) {
      signals.push({
        severity: 'medium',
        signal: `${count} ransomware victims in "${sector}" sector — critical infrastructure targeting`,
      });
    }
  }

  return {
    source: 'Ransomware-Live',
    timestamp,
    totalRecentVictims: victims.length,
    victims: victims.slice(0, 50),
    byGroup,
    bySector,
    byCountry,
    signals,
  };
}

if (process.argv[1]?.endsWith('ransomware-live.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
