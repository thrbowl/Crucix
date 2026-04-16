import '../utils/env.mjs';
import { safeFetch } from '../utils/fetch.mjs';

const API_BASE = 'https://api.zoomeye.org';

export async function briefing() {
  const timestamp = new Date().toISOString();
  const key = (process.env.ZOOMEYE_API_KEY || process.env.ZOOMEYE_KEY || '').trim();

  if (!key) {
    return {
      source: 'ZoomEye',
      timestamp,
      status: 'no_credentials',
      message: 'Set ZOOMEYE_API_KEY in .env. Free tier available at https://www.zoomeye.org/profile',
      signals: [],
    };
  }

  try {
    const data = await safeFetch(`${API_BASE}/host/search?query=port:22&page=1`, {
      timeout: 15000,
      headers: { 'API-KEY': key },
    });

    if (data.error) {
      return { source: 'ZoomEye', timestamp, status: 'api_error', error: data.error, signals: [] };
    }

    const total = data.total || 0;
    const matches = data.matches || [];

    const portCounts = {};
    const countryCounts = {};
    for (const m of matches) {
      const port = m.portinfo?.port || 'unknown';
      portCounts[port] = (portCounts[port] || 0) + 1;
      const country = m.geoinfo?.country?.names?.en || m.geoinfo?.country || 'unknown';
      countryCounts[country] = (countryCounts[country] || 0) + 1;
    }

    const topPorts = Object.entries(portCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([port, count]) => ({ port: Number(port) || port, count }));

    const topCountries = Object.entries(countryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([country, count]) => ({ country, count }));

    const signals = [];
    if (total > 0) {
      signals.push({ severity: 'info', signal: `ZoomEye reports ${total.toLocaleString()} hosts with port 22 exposed` });
    }

    return {
      source: 'ZoomEye',
      timestamp,
      status: 'connected',
      totalResults: total,
      topPorts,
      topCountries,
      signals,
    };
  } catch (e) {
    return { source: 'ZoomEye', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('zoomeye.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
