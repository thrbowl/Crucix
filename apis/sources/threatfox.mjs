// Abuse.ch ThreatFox — IOC (Indicators of Compromise) feed
// No API key required.

import { safeFetch } from '../utils/fetch.mjs';

const API_URL = 'https://threatfox-api.abuse.ch/api/v1/';

export async function briefing() {
  const timestamp = new Date().toISOString();

  let data;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'get_iocs', days: 7 }),
      signal: AbortSignal.timeout(20000),
    });
    data = await res.json();
  } catch (e) {
    return { source: 'ThreatFox', timestamp, error: e.message };
  }

  if (data.query_status !== 'ok' || !Array.isArray(data.data)) {
    return { source: 'ThreatFox', timestamp, error: data.query_status || 'unexpected response' };
  }

  const rawIocs = data.data;

  const iocs = rawIocs.slice(0, 100).map(i => ({
    value: i.ioc_value,
    type: i.ioc_type,
    threatType: i.threat_type || null,
    malware: i.malware || null,
    confidence: i.confidence_level || null,
    firstSeen: i.first_seen_utc || i.first_seen,
  }));

  const byThreatType = {};
  const byMalware = {};
  for (const i of rawIocs) {
    const tt = i.threat_type || 'unknown';
    byThreatType[tt] = (byThreatType[tt] || 0) + 1;
    const mw = i.malware || 'unknown';
    byMalware[mw] = (byMalware[mw] || 0) + 1;
  }

  const signals = [];
  if (rawIocs.length > 500) {
    signals.push({
      severity: 'medium',
      signal: `${rawIocs.length} IOCs reported in last 7 days — elevated threat indicator volume`,
    });
  }

  const topMalware = Object.entries(byMalware)
    .filter(([k]) => k !== 'unknown')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (topMalware.length > 0) {
    signals.push({
      severity: 'info',
      signal: `Top IOC-linked malware: ${topMalware.map(([k, v]) => `${k} (${v})`).join(', ')}`,
    });
  }

  return {
    source: 'ThreatFox',
    timestamp,
    totalIOCs: rawIocs.length,
    iocs,
    byThreatType,
    byMalware,
    signals,
  };
}

if (process.argv[1]?.endsWith('threatfox.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
