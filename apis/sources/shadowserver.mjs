// Shadowserver — Honeypot, scan, and sinkhole intelligence
// Requires SHADOWSERVER_API_KEY and SHADOWSERVER_API_SECRET.
// Register at https://www.shadowserver.org/ for access to global threat feeds.

import { safeFetch } from '../utils/fetch.mjs';

const API_BASE = 'https://transform.shadowserver.org/api2/';

export async function briefing() {
  const apiKey = process.env.SHADOWSERVER_API_KEY;
  const apiSecret = process.env.SHADOWSERVER_API_SECRET;

  if (!apiKey) {
    return {
      source: 'Shadowserver',
      timestamp: new Date().toISOString(),
      status: 'no_credentials',
      message: 'Register at https://www.shadowserver.org/ to access honeypot and scan data. Set SHADOWSERVER_API_KEY and SHADOWSERVER_API_SECRET in .env',
    };
  }

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // Shadowserver API uses POST with apikey in the body
  const body = JSON.stringify({
    apikey: apiKey,
    secret: apiSecret || '',
    query: 'reports/stats',
    limit: 20,
  });

  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        source: 'Shadowserver',
        timestamp: new Date().toISOString(),
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = await res.json().catch(() => null);

    if (!data) {
      return {
        source: 'Shadowserver',
        timestamp: new Date().toISOString(),
        error: 'Invalid JSON response from Shadowserver API',
      };
    }

    const signals = [];
    const reports = Array.isArray(data) ? data : data.reports || [];

    if (reports.length > 0) {
      signals.push({
        severity: 'info',
        signal: `${reports.length} Shadowserver report categories available`,
      });
    }

    return {
      source: 'Shadowserver',
      timestamp: new Date().toISOString(),
      status: 'connected',
      reportCount: reports.length,
      reports: reports.slice(0, 20),
      signals,
    };
  } catch (err) {
    return {
      source: 'Shadowserver',
      timestamp: new Date().toISOString(),
      error: err.message || 'Request failed',
    };
  }
}

if (process.argv[1]?.endsWith('shadowserver.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
