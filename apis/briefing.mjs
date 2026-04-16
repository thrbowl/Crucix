#!/usr/bin/env node

// Crucix Cybersecurity Orchestrator — runs all security intelligence sources in parallel
// v1.0.1: 41 active security sources across 5 domains (ACLED removed)

import './utils/env.mjs';
import { pathToFileURL } from 'node:url';

// === Domain 1: Vulnerability Intelligence (7 sources) ===
import { briefing as cisaKev } from './sources/cisa-kev.mjs';
import { briefing as nvd } from './sources/nvd.mjs';
import { briefing as epss } from './sources/epss.mjs';
import { briefing as githubAdvisory } from './sources/github-advisory.mjs';
import { briefing as exploitdb } from './sources/exploitdb.mjs';
import { briefing as osv } from './sources/osv.mjs';

// === Domain 2: Threat Actors & Malware (7 sources) ===
import { briefing as otx } from './sources/otx.mjs';
import { briefing as malwarebazaar } from './sources/malwarebazaar.mjs';
import { briefing as threatfox } from './sources/threatfox.mjs';
import { briefing as feodo } from './sources/feodo.mjs';
import { briefing as attackStix } from './sources/attack-stix.mjs';
import { briefing as virustotal } from './sources/virustotal.mjs';
import { briefing as urlhaus } from './sources/urlhaus.mjs';

// === Domain 3: Attack Activity & Exposure (8 sources) ===
import { briefing as greynoise } from './sources/greynoise.mjs';
import { briefing as shodan } from './sources/shodan.mjs';
import { briefing as abuseipdb } from './sources/abuseipdb.mjs';
import { briefing as cloudflareRadar } from './sources/cloudflare-radar.mjs';
import { briefing as shadowserver } from './sources/shadowserver.mjs';
import { briefing as spamhaus } from './sources/spamhaus.mjs';
import { briefing as bgpRanking } from './sources/bgp-ranking.mjs';
import { briefing as phishtank } from './sources/phishtank.mjs';

// === Domain 4: Event Tracking & Intel Community (7 sources) ===
import { briefing as ransomwareLive } from './sources/ransomware-live.mjs';
import { briefing as enisa } from './sources/enisa.mjs';
import { briefing as cisaAlerts } from './sources/cisa-alerts.mjs';
import { briefing as certsIntl } from './sources/certs-intl.mjs';
import { briefing as bluesky } from './sources/bluesky.mjs';
import { briefing as telegram } from './sources/telegram.mjs';

// === Domain 5: China Intelligence (10 sources) ===
import { briefing as cncert } from './sources/cncert.mjs';
import { briefing as cnvd } from './sources/cnvd.mjs';
import { briefing as cnnvd } from './sources/cnnvd.mjs';
// import { briefing as threatbook } from './sources/threatbook.mjs'; // API broken — "Invalid Api method", awaiting vendor doc update
import { briefing as qianxin } from './sources/qianxin.mjs';
import { briefing as fofa } from './sources/fofa.mjs';
import { briefing as zoomeye } from './sources/zoomeye.mjs';
import { briefing as freebuf } from './sources/freebuf-rss.mjs';
import { briefing as anquanke } from './sources/anquanke-rss.mjs';
import { briefing as fourhou } from './sources/4hou-rss.mjs';

// ACLED removed in v1.0.1 (non-cybersecurity data)

const SOURCE_TIMEOUT_MS = 30_000;

// Module-level status constants
const ACTIVE_STATUSES = new Set(['connected', 'bot_api', 'bot_api_empty_fallback_scrape', 'public_feed', 'web_scrape', 'partial']);
const INACTIVE_STATUSES = {
  'no_credentials': 'no_key',
  'rss_unavailable': 'unreachable',
  'api_error': 'api_error',
  'auth_failed': 'api_error',
  'unavailable': 'unreachable',
  'API and public feed both unreachable': 'unreachable',
};

// Map error messages/status strings to canonical reason codes
function inferReason(statusOrError) {
  const s = String(statusOrError).toLowerCase();
  if (s.includes('no_credentials') || s.includes('no credential') || s.includes('api key') || s.includes('apikey') || s.includes('key not set') || s.includes('missing key')) return 'no_key';
  if (s.includes('429') || s.includes('rate limit') || s.includes('rate_limit') || s.includes('quota exceeded')) return 'rate_limited';
  if (s.includes('not available in your area') || s.includes('geo_blocked') || s.includes('geo block')) return 'geo_blocked';
  if (s.includes('auth') || s.includes('401') || s.includes('forbidden') || s.includes('invalid api') || s.includes('invalid method')) return 'api_error';
  return 'unreachable';
}

// Normalize any source return value to { status: 'active' } or { status: 'inactive', reason, message }
function normalizeSourceData(name, data) {
  if (!data || typeof data !== 'object') {
    return { source: name, timestamp: new Date().toISOString(), status: 'inactive', reason: 'unreachable', message: 'Source returned no data' };
  }
  // Already normalized — pass through
  if (data.status === 'active' || data.status === 'inactive') return { ...data };
  // Has error field → inactive
  if (data.error) {
    return { ...data, status: 'inactive', reason: inferReason(data.error), message: String(data.error) };
  }
  // Statuses that mean "has data"
  if (data.status && ACTIVE_STATUSES.has(data.status)) {
    return { ...data, status: 'active' };
  }
  // Statuses that mean "no data"
  if (data.status && data.status in INACTIVE_STATUSES) {
    return { ...data, status: 'inactive', reason: INACTIVE_STATUSES[data.status], message: data.message || data.status };
  }
  // No status, no error → assume active
  return { ...data, status: 'active' };
}

export async function runSource(name, fn, ...args) {
  const start = Date.now();
  let timer;
  const timeoutMs =
    name === 'ATT&CK-STIX' ? Math.max(SOURCE_TIMEOUT_MS, 120_000) : SOURCE_TIMEOUT_MS;
  try {
    const dataPromise = fn(...args);
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Source ${name} timed out after ${timeoutMs / 1000}s`)),
        timeoutMs
      );
    });
    const data = await Promise.race([dataPromise, timeoutPromise]);
    return { name, status: 'ok', durationMs: Date.now() - start, data: normalizeSourceData(name, data) };
  } catch (e) {
    return { name, status: 'error', durationMs: Date.now() - start, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function fullBriefing() {
  const totalSources = 36; // ThreatBook disabled (API broken)
  console.error(`[Crucix] Starting cybersecurity sweep — ${totalSources} sources...`);
  const start = Date.now();

  const allPromises = [
    // Domain 1: Vulnerability Intelligence
    runSource('CISA-KEV', cisaKev),
    runSource('NVD', nvd),
    runSource('EPSS', epss),
    runSource('GitHub-Advisory', githubAdvisory),
    runSource('ExploitDB', exploitdb),
    runSource('OSV', osv),

    // Domain 2: Threat Actors & Malware
    runSource('OTX', otx),
    runSource('MalwareBazaar', malwarebazaar),
    runSource('ThreatFox', threatfox),
    runSource('Feodo', feodo),
    runSource('ATT&CK-STIX', attackStix),
    runSource('VirusTotal', virustotal),
    runSource('URLhaus', urlhaus),

    // Domain 3: Attack Activity & Exposure
    runSource('GreyNoise', greynoise),
    runSource('Shodan', shodan),
    runSource('AbuseIPDB', abuseipdb),
    runSource('Cloudflare-Radar', cloudflareRadar),
    runSource('Shadowserver', shadowserver),
    runSource('Spamhaus', spamhaus),
    runSource('BGP-Ranking', bgpRanking),
    runSource('PhishTank', phishtank),

    // Domain 4: Event Tracking & Intel Community
    runSource('Ransomware-Live', ransomwareLive),
    runSource('ENISA', enisa),
    runSource('CISA-Alerts', cisaAlerts),
    runSource('CERTs-Intl', certsIntl),
    runSource('Bluesky', bluesky),
    runSource('Telegram', telegram),

    // Domain 5: China Intelligence
    runSource('CNCERT', cncert),
    runSource('CNVD', cnvd),
    runSource('CNNVD', cnnvd),
    // runSource('ThreatBook', threatbook), // API broken — "Invalid Api method"
    runSource('Qianxin', qianxin),
    runSource('FOFA', fofa),
    runSource('ZoomEye', zoomeye),
    runSource('FreeBuf', freebuf),
    runSource('Anquanke', anquanke),
    runSource('4hou', fourhou),

  ];

  const results = await Promise.allSettled(allPromises);

  const sources = results.map(r => r.status === 'fulfilled' ? r.value : { status: 'failed', error: r.reason?.message });
  const totalMs = Date.now() - start;

  const output = {
    crucix: {
      version: '0.3.0-cybersec',
      timestamp: new Date().toISOString(),
      totalDurationMs: totalMs,
      sourcesQueried: sources.length,
      sourcesOk: sources.filter(s => s.status === 'ok' && s.data?.status === 'active').length,
      sourcesInactive: sources.filter(s => s.status === 'ok' && s.data?.status === 'inactive').length,
      sourcesFailed: sources.filter(s => s.status !== 'ok').length,
    },
    sources: Object.fromEntries(
      sources.filter(s => s.status === 'ok').map(s => [s.name, s.data])
    ),
    errors: sources.filter(s => s.status !== 'ok').map(s => ({ name: s.name, error: s.error })),
    timing: Object.fromEntries(
      sources.map(s => [s.name, { status: s.status, ms: s.durationMs }])
    ),
  };

  console.error(`[Crucix] Sweep complete in ${totalMs}ms — ${output.crucix.sourcesOk} active / ${output.crucix.sourcesInactive} inactive / ${output.crucix.sourcesFailed} failed`);
  return output;
}

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryHref && import.meta.url === entryHref) {
  const data = await fullBriefing();
  console.log(JSON.stringify(data, null, 2));
}
