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

  // Host search — only if query credits are available
  let hostSearch = null;

  if (accountInfo.credits > 0) {
    const [criticalRes, rdpRes] = await Promise.all([
      safeFetch(
        `${BASE}/shodan/host/search?key=${key}&query=vuln%3Acritical&facets=country%2Cport&page=1`,
        { timeout: 20000 }
      ),
      safeFetch(
        `${BASE}/shodan/host/search?key=${key}&query=port%3A3389+has_screenshot%3Atrue&facets=country&page=1`,
        { timeout: 20000 }
      ),
    ]);

    const criticalTotal = criticalRes.error ? 0 : (criticalRes.total ?? 0);
    const criticalCountries = criticalRes.error
      ? []
      : (criticalRes.facets?.country?.slice(0, 10) ?? []);

    const rdpTotal = rdpRes.error ? 0 : (rdpRes.total ?? 0);
    const rdpCountries = rdpRes.error
      ? []
      : (rdpRes.facets?.country?.slice(0, 10) ?? []);

    hostSearch = {
      criticalVulns: { total: criticalTotal, topCountries: criticalCountries },
      exposedRdp: { total: rdpTotal, topCountries: rdpCountries },
    };

    if (criticalTotal > 1000) {
      signals.push({
        severity: 'high',
        signal: `${criticalTotal.toLocaleString()} hosts with critical CVEs exposed`,
      });
    }

    if (rdpTotal > 100) {
      signals.push({
        severity: 'medium',
        signal: `${rdpTotal.toLocaleString()} RDP services exposed with screenshots`,
      });
    }
  } else if (accountInfo.credits === 0) {
    signals.push({
      severity: 'info',
      signal: 'Shodan query credits exhausted — skipping host search',
    });
  } else {
    signals.push({
      severity: 'info',
      signal: 'Shodan host search skipped — query credits unknown (free tier may not report credits)',
    });
  }

  return {
    source: 'Shodan',
    timestamp: new Date().toISOString(),
    status: 'connected',
    accountInfo,
    knownPorts: topPorts,
    hostSearch,
    signals,
  };
}

if (process.argv[1]?.endsWith('shodan.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
