// DShield / SANS Internet Storm Center — honeypot attack data, no key required
// https://isc.sans.edu/api/ — JSON API, free
// Provides top attacking IPs and port activity from global honeypot network

import { safeFetch } from '../utils/fetch.mjs';

const TOP_IPS_URL = 'https://isc.sans.edu/api/top10?json';
const TOP_PORTS_URL = 'https://isc.sans.edu/api/topports/recordsraw/10?json';
const DIARY_URL = 'https://isc.sans.edu/api/diary/details?json';

export async function briefing() {
  const timestamp = new Date().toISOString();
  try {
    const [ipsData, portsData, diaryData] = await Promise.allSettled([
      safeFetch(TOP_IPS_URL, { timeout: 15000 }),
      safeFetch(TOP_PORTS_URL, { timeout: 15000 }),
      safeFetch(DIARY_URL, { timeout: 15000 }),
    ]);

    const isValidArray = (val) => Array.isArray(val) && val.length > 0;
    const getArrayData = (val) => {
      if (isValidArray(val)) return val;
      if (val && typeof val === 'object' && !val.error && !val.rawText) {
        const arr = val.top10 || val.topports || val.diary || null;
        return isValidArray(arr) ? arr : [];
      }
      return [];
    };

    const ipsArray = ipsData.status === 'fulfilled' ? getArrayData(ipsData.value) : [];
    const topIPs = ipsArray.slice(0, 10).map(e => ({
      ip: e.ipval || e.ip,
      count: e.count || e.attacks,
      country: e.country || null,
    })).filter(e => e.ip);

    const portsArray = portsData.status === 'fulfilled' ? getArrayData(portsData.value) : [];
    const topPorts = portsArray.slice(0, 10).map(p => ({
      port: p.targetPort || p.port,
      count: p.count || p.records,
      service: p.service || null,
    })).filter(p => p.port);

    const diariesArray = diaryData.status === 'fulfilled' ? getArrayData(diaryData.value) : [];
    const diaries = diariesArray.slice(0, 5).map(d => ({
      title: d.title,
      url: `https://isc.sans.edu/diary/${d.diaryid}`,
      date: d.date,
    })).filter(d => d.title);

    const signals = [];
    if (topIPs.length > 0) {
      const topIP = topIPs[0];
      signals.push({ severity: 'medium', signal: `Top attacking IP: ${topIP.ip} (${topIP.count} attacks${topIP.country ? ', ' + topIP.country : ''}) — SANS ISC honeypot data` });
    }
    if (topPorts.length > 0 && topPorts[0].port) {
      signals.push({ severity: 'info', signal: `Most scanned port: ${topPorts[0].port}${topPorts[0].service ? ' (' + topPorts[0].service + ')' : ''} — ${topPorts[0].count} probes` });
    }

    if (topIPs.length === 0 && topPorts.length === 0) {
      return { source: 'DShield', timestamp, status: 'rss_unavailable', message: 'DShield API returned no data', signals: [] };
    }

    return { source: 'DShield', timestamp, topIPs, topPorts, diaries, signals };
  } catch (e) {
    return { source: 'DShield', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('dshield.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
