// Abuse.ch ThreatFox — IOC (Indicators of Compromise) feed
// Requires free community Auth-Key: https://auth.abuse.ch/ → ABUSECH_AUTH_KEY

import '../utils/env.mjs';
import { safeFetch } from '../utils/fetch.mjs';

const API_URL = 'https://threatfox-api.abuse.ch/api/v1/';

export async function briefing() {
  const timestamp = new Date().toISOString();

  const authKey = (process.env.ABUSECH_AUTH_KEY || '').trim();
  const data = await safeFetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authKey ? { 'Auth-Key': authKey } : {}),
    },
    body: JSON.stringify({ query: 'get_iocs', days: 7 }),
    timeout: 20000,
    retries: 1,
  });

  if (data.error) {
    return {
      source: 'ThreatFox',
      timestamp,
      error: authKey
        ? data.error
        : `${data.error} — set ABUSECH_AUTH_KEY (free at https://auth.abuse.ch/)`,
    };
  }

  if (data.query_status !== 'ok' || !Array.isArray(data.data)) {
    const err =
      data.query_status ||
      data.error ||
      (typeof data === 'object' ? JSON.stringify(data).slice(0, 200) : 'unexpected response');
    return { source: 'ThreatFox', timestamp, error: err };
  }

  const rawIocs = data.data;

  const iocs = rawIocs.slice(0, 100).map(i => ({
    value: i.ioc_value,
    ioc: i.ioc_value,
    indicator: i.ioc_value,
    type: i.ioc_type,
    ioc_type: i.ioc_type,
    threatType: i.threat_type || null,
    threat_type: i.threat_type || null,
    malware: i.malware || null,
    tags: Array.isArray(i.tags) && i.tags.length ? i.tags : (i.malware ? [i.malware] : []),
    confidence: i.confidence_level || null,
    firstSeen: i.first_seen_utc || i.first_seen,
    first_seen: i.first_seen_utc || i.first_seen,
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
    recentIOCs: iocs,
    byThreatType,
    byMalware,
    signals,
  };
}

if (process.argv[1]?.endsWith('threatfox.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
