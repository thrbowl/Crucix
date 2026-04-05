// Shodan — Internet-connected device search engine
// Requires SHODAN_API_KEY. Free tier available at https://account.shodan.io/register
// Provides visibility into exposed services, ports, and vulnerabilities.

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://api.shodan.io';

export async function briefing() {
  const key = process.env.SHODAN_API_KEY;
  if (!key) {
    return {
      source: 'Shodan',
      timestamp: new Date().toISOString(),
      status: 'no_credentials',
      message: 'Set SHODAN_API_KEY in .env. Get a free key at https://account.shodan.io/register',
    };
  }

  // Verify connectivity and get account info
  const info = await safeFetch(`${BASE}/api-info?key=${key}`, { timeout: 15000 });

  if (info.error) {
    return {
      source: 'Shodan',
      timestamp: new Date().toISOString(),
      error: info.error,
    };
  }

  const accountInfo = {
    plan: info.plan || 'unknown',
    credits: info.query_credits ?? info.scan_credits ?? null,
    scanCredits: info.scan_credits ?? null,
    monitored_ips: info.monitored_ips ?? null,
    unlocked: info.unlocked ?? false,
  };

  // Fetch known open ports
  const ports = await safeFetch(`${BASE}/shodan/ports?key=${key}`, { timeout: 15000 });

  const topPorts = Array.isArray(ports) ? ports.slice(0, 30) : [];

  // Fetch honeypot score for a well-known IP if credits allow
  const signals = [];

  if (accountInfo.credits !== null && accountInfo.credits > 0) {
    signals.push({
      severity: 'info',
      signal: `Shodan account active — ${accountInfo.credits} query credits remaining (${accountInfo.plan} plan)`,
    });
  }

  if (accountInfo.credits === 0) {
    signals.push({
      severity: 'low',
      signal: 'Shodan query credits exhausted — upgrade or wait for monthly reset',
    });
  }

  return {
    source: 'Shodan',
    timestamp: new Date().toISOString(),
    status: 'connected',
    accountInfo,
    knownPorts: topPorts,
    signals,
  };
}

if (process.argv[1]?.endsWith('shodan.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
