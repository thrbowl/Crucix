// Abuse.ch Feodo Tracker — Botnet C2 server blocklist
// No API key required. Tracks Dridex, Emotet, TrickBot, QakBot C2 infrastructure.

import { safeFetch } from '../utils/fetch.mjs';

const RECOMMENDED_URL = 'https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json';
const FULL_URL = 'https://feodotracker.abuse.ch/downloads/ipblocklist.json';

export async function briefing() {
  const timestamp = new Date().toISOString();

  const [recommended, full] = await Promise.all([
    safeFetch(RECOMMENDED_URL, { timeout: 20000 }),
    safeFetch(FULL_URL, { timeout: 20000 }),
  ]);

  if (recommended.error && full.error) {
    return { source: 'Feodo', timestamp, error: recommended.error || full.error };
  }

  const servers = Array.isArray(full) ? full : Array.isArray(recommended) ? recommended : [];
  const onlineServers = servers.filter(s => s.status === 'online');

  const c2Servers = servers.slice(0, 100).map(s => ({
    ip: s.ip_address,
    port: s.port,
    status: s.status,
    hostname: s.hostname || null,
    asn: s.as_number || null,
    asName: s.as_name || null,
    country: s.country || null,
    firstSeen: s.first_seen,
    lastOnline: s.last_online,
    malware: s.malware || null,
  }));

  const byCountry = {};
  const byMalware = {};
  for (const s of servers) {
    const country = s.country || 'unknown';
    byCountry[country] = (byCountry[country] || 0) + 1;
    const mw = s.malware || 'unknown';
    byMalware[mw] = (byMalware[mw] || 0) + 1;
  }

  const signals = [];
  if (onlineServers.length > 50) {
    signals.push({
      severity: 'medium',
      signal: `${onlineServers.length} online C2 servers tracked — elevated botnet infrastructure activity`,
    });
  }

  const topCountries = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (topCountries.length > 0) {
    signals.push({
      severity: 'info',
      signal: `Top C2 hosting countries: ${topCountries.map(([k, v]) => `${k} (${v})`).join(', ')}`,
    });
  }

  return {
    source: 'Feodo',
    timestamp,
    totalC2s: servers.length,
    onlineC2s: onlineServers.length,
    c2Servers,
    byCountry,
    byMalware,
    signals,
  };
}

if (process.argv[1]?.endsWith('feodo.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
