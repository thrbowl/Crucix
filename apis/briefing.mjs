#!/usr/bin/env node

// Crucix Cybersecurity Orchestrator — runs all security intelligence sources in parallel
// v0.3.0: 42 active security sources across 5 domains

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
import { briefing as reddit } from './sources/reddit.mjs';
import { briefing as telegram } from './sources/telegram.mjs';

// === Domain 5: China Intelligence (10 sources) ===
import { briefing as cncert } from './sources/cncert.mjs';
import { briefing as cnvd } from './sources/cnvd.mjs';
import { briefing as cnnvd } from './sources/cnnvd.mjs';
import { briefing as threatbook } from './sources/threatbook.mjs';
import { briefing as qianxin } from './sources/qianxin.mjs';
import { briefing as zoomeye } from './sources/zoomeye.mjs';
import { briefing as fofa } from './sources/fofa.mjs';
import { briefing as freebuf } from './sources/freebuf-rss.mjs';
import { briefing as anquanke } from './sources/anquanke-rss.mjs';
import { briefing as fourhou } from './sources/4hou-rss.mjs';

// === Legacy retained (ACLED for geo-context) ===
import { briefing as acled } from './sources/acled.mjs';

const SOURCE_TIMEOUT_MS = 30_000;

export async function runSource(name, fn, ...args) {
  const start = Date.now();
  let timer;
  try {
    const dataPromise = fn(...args);
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Source ${name} timed out after ${SOURCE_TIMEOUT_MS / 1000}s`)), SOURCE_TIMEOUT_MS);
    });
    const data = await Promise.race([dataPromise, timeoutPromise]);
    return { name, status: 'ok', durationMs: Date.now() - start, data };
  } catch (e) {
    return { name, status: 'error', durationMs: Date.now() - start, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function fullBriefing() {
  const totalSources = 42;
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
    runSource('Reddit', reddit),
    runSource('Telegram', telegram),

    // Domain 5: China Intelligence
    runSource('CNCERT', cncert),
    runSource('CNVD', cnvd),
    runSource('CNNVD', cnnvd),
    runSource('ThreatBook', threatbook),
    runSource('Qianxin', qianxin),
    runSource('ZoomEye', zoomeye),
    runSource('FOFA', fofa),
    runSource('FreeBuf', freebuf),
    runSource('Anquanke', anquanke),
    runSource('4hou', fourhou),

    // Retained for geo-context
    runSource('ACLED', acled),
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
      sourcesOk: sources.filter(s => s.status === 'ok').length,
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

  console.error(`[Crucix] Sweep complete in ${totalMs}ms — ${output.crucix.sourcesOk}/${sources.length} sources returned data`);
  return output;
}

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryHref && import.meta.url === entryHref) {
  const data = await fullBriefing();
  console.log(JSON.stringify(data, null, 2));
}
