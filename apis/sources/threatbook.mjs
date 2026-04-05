import { safeFetch } from '../utils/fetch.mjs';

const API_BASE = 'https://api.threatbook.cn/v3';
const COMMUNITY_FEED = 'https://x.threatbook.com/v5/node/vb4/';

export async function briefing() {
  const timestamp = new Date().toISOString();
  const key = process.env.THREATBOOK_API_KEY;

  if (!key) {
    try {
      const res = await fetch(COMMUNITY_FEED, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Crucix/1.0' },
      });
      if (res.ok) {
        return {
          source: 'ThreatBook',
          timestamp,
          status: 'no_credentials',
          message: 'Set THREATBOOK_API_KEY in .env. Register at https://x.threatbook.com for API access.',
          communityAvailable: true,
          signals: [{ severity: 'info', signal: 'ThreatBook community portal reachable — API key needed for full access' }],
        };
      }
    } catch {
      // community feed also unavailable
    }

    return {
      source: 'ThreatBook',
      timestamp,
      status: 'no_credentials',
      message: 'Set THREATBOOK_API_KEY in .env. Register at https://x.threatbook.com for API access.',
      signals: [],
    };
  }

  try {
    const data = await safeFetch(`${API_BASE}/scene/ip_reputation`, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });

    if (data.error && data.error.includes('HTTP 4')) {
      const overview = await safeFetch(`${API_BASE}/threat/overview?apikey=${key}`, { timeout: 15000 });

      if (overview.error) {
        return { source: 'ThreatBook', timestamp, status: 'api_error', error: overview.error, signals: [] };
      }

      return {
        source: 'ThreatBook',
        timestamp,
        status: 'connected',
        data: overview.data || overview,
        signals: [{ severity: 'info', signal: 'ThreatBook API connected via threat overview endpoint' }],
      };
    }

    return {
      source: 'ThreatBook',
      timestamp,
      status: 'connected',
      data: data.data || data,
      signals: [{ severity: 'info', signal: 'ThreatBook threat intelligence API connected' }],
    };
  } catch (e) {
    return { source: 'ThreatBook', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('threatbook.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
