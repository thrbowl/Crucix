// Qianxin Threat Intelligence — IP/domain/hash reputation + APT data
// Requires QIANXIN_TI_API_KEY (https://ti.qianxin.com)
// Provides: IP/domain reputation, APT group tracking, malware family attribution

import { safeFetch } from '../utils/fetch.mjs';

// Verify from your Qianxin TI console — common patterns:
// v3: https://ti.qianxin.com/api/v3/
// v2: https://ti.qianxin.com/api/v2/
const API_BASE = 'https://ti.qianxin.com/api/v3';

// Recent threat intel endpoints (check your subscription tier for availability)
const ENDPOINTS = {
  recentMalware: `${API_BASE}/malware/list?limit=20`,
  recentAPT: `${API_BASE}/apt/list?limit=10`,
  recentIOCs: `${API_BASE}/ioc/list?limit=20`,
};

export async function briefing() {
  const timestamp = new Date().toISOString();
  const key = process.env.QIANXIN_TI_API_KEY;

  if (!key) {
    return { source: 'Qianxin-TI', timestamp, status: 'no_credentials', message: 'Set QIANXIN_TI_API_KEY in .env — get key at https://ti.qianxin.com' };
  }

  const headers = { 'X-QAX-API-KEY': key }; // adjust if your key uses a different header

  const [malwareRes, aptRes, iocRes] = await Promise.allSettled([
    safeFetch(ENDPOINTS.recentMalware, { timeout: 15000, headers }),
    safeFetch(ENDPOINTS.recentAPT, { timeout: 15000, headers }),
    safeFetch(ENDPOINTS.recentIOCs, { timeout: 15000, headers }),
  ]);

  const malware = malwareRes.status === 'fulfilled' && !malwareRes.value.error
    ? (malwareRes.value.data || malwareRes.value.result || []).slice(0, 20).map(m => ({
        name: m.name || m.malware_name,
        family: m.family || null,
        type: m.type || null,
        date: m.create_time || m.date || null,
      }))
    : [];

  const aptGroups = aptRes.status === 'fulfilled' && !aptRes.value.error
    ? (aptRes.value.data || aptRes.value.result || []).slice(0, 10).map(a => ({
        name: a.name || a.apt_name,
        country: a.country || null,
        lastSeen: a.last_seen || a.update_time || null,
        ttps: a.ttps || [],
      }))
    : [];

  const iocs = iocRes.status === 'fulfilled' && !iocRes.value.error
    ? (iocRes.value.data || iocRes.value.result || []).slice(0, 20).map(i => ({
        value: i.ioc_value || i.value,
        type: i.ioc_type || i.type,
        threat: i.threat_name || null,
        confidence: i.confidence || null,
      }))
    : [];

  if (malware.length === 0 && aptGroups.length === 0 && iocs.length === 0) {
    return { source: 'Qianxin-TI', timestamp, status: 'api_error', message: 'All Qianxin TI endpoints returned no data — verify API key and endpoint URLs in qianxin-ti.mjs', signals: [] };
  }

  const signals = [];
  if (aptGroups.length > 0) {
    signals.push({ severity: 'high', signal: `Qianxin TI: ${aptGroups.length} active APT groups tracked — ${aptGroups.slice(0, 3).map(a => a.name).join(', ')}` });
  }
  if (iocs.length > 10) {
    signals.push({ severity: 'medium', signal: `Qianxin TI: ${iocs.length} fresh IOCs available for enrichment` });
  }

  return { source: 'Qianxin-TI', timestamp, malware, aptGroups, iocs, signals };
}

if (process.argv[1]?.endsWith('qianxin-ti.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
