#!/usr/bin/env node

// Crucix Cybersecurity Orchestrator — runs all intelligence sources in parallel
// Outputs structured JSON for synthesis into actionable threat intelligence

import './utils/env.mjs'; // Load API keys from .env
import { pathToFileURL } from 'node:url';

// === Tier 1: Core OSINT & Geopolitical (legacy, retained) ===
import { briefing as gdelt } from './sources/gdelt.mjs';
import { briefing as opensky } from './sources/opensky.mjs';
import { briefing as firms } from './sources/firms.mjs';
import { briefing as ships } from './sources/ships.mjs';
import { briefing as safecast } from './sources/safecast.mjs';
import { briefing as acled } from './sources/acled.mjs';
import { briefing as reliefweb } from './sources/reliefweb.mjs';
import { briefing as who } from './sources/who.mjs';
import { briefing as ofac } from './sources/ofac.mjs';
import { briefing as opensanctions } from './sources/opensanctions.mjs';
import { briefing as adsb } from './sources/adsb.mjs';

// === Tier 2: Economic & Financial (legacy, retained) ===
import { briefing as fred } from './sources/fred.mjs';
import { briefing as treasury } from './sources/treasury.mjs';
import { briefing as bls } from './sources/bls.mjs';
import { briefing as eia } from './sources/eia.mjs';
import { briefing as gscpi } from './sources/gscpi.mjs';
import { briefing as usaspending } from './sources/usaspending.mjs';
import { briefing as comtrade } from './sources/comtrade.mjs';

// === Tier 3: Weather, Environment, Technology, Social (legacy, retained) ===
import { briefing as noaa } from './sources/noaa.mjs';
import { briefing as epa } from './sources/epa.mjs';
import { briefing as patents } from './sources/patents.mjs';
import { briefing as bluesky } from './sources/bluesky.mjs';
import { briefing as reddit } from './sources/reddit.mjs';
import { briefing as telegram } from './sources/telegram.mjs';
import { briefing as kiwisdr } from './sources/kiwisdr.mjs';

// === Tier 4: Space & Satellites (legacy, retained) ===
import { briefing as space } from './sources/space.mjs';

// === Tier 5: Live Market Data (legacy, retained) ===
import { briefing as yfinance } from './sources/yfinance.mjs';

// === Tier 6: Cyber & Infrastructure (retained + expanded) ===
import { briefing as cisaKev } from './sources/cisa-kev.mjs';
import { briefing as cloudflareRadar } from './sources/cloudflare-radar.mjs';

// === NEW: Domain 1 — Vulnerability Intelligence ===
import { briefing as nvd } from './sources/nvd.mjs';
import { briefing as epss } from './sources/epss.mjs';
import { briefing as githubAdvisory } from './sources/github-advisory.mjs';
import { briefing as exploitdb } from './sources/exploitdb.mjs';
import { briefing as osv } from './sources/osv.mjs';

// === NEW: Domain 2 — Threat Actors & Malware ===
import { briefing as otx } from './sources/otx.mjs';
import { briefing as malwarebazaar } from './sources/malwarebazaar.mjs';
import { briefing as threatfox } from './sources/threatfox.mjs';
import { briefing as feodo } from './sources/feodo.mjs';
import { briefing as attackStix } from './sources/attack-stix.mjs';
import { briefing as virustotal } from './sources/virustotal.mjs';
import { briefing as urlhaus } from './sources/urlhaus.mjs';

// === NEW: Domain 3 — Attack Activity & Exposure ===
import { briefing as greynoise } from './sources/greynoise.mjs';
import { briefing as shodan } from './sources/shodan.mjs';
import { briefing as abuseipdb } from './sources/abuseipdb.mjs';
import { briefing as shadowserver } from './sources/shadowserver.mjs';
import { briefing as spamhaus } from './sources/spamhaus.mjs';
import { briefing as bgpRanking } from './sources/bgp-ranking.mjs';
import { briefing as phishtank } from './sources/phishtank.mjs';

const SOURCE_TIMEOUT_MS = 30_000; // 30s max per individual source

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
  console.error('[Crucix] Starting intelligence sweep — 48 sources...');
  const start = Date.now();

  const allPromises = [
    // Tier 1: Core OSINT & Geopolitical (legacy)
    runSource('GDELT', gdelt),
    runSource('OpenSky', opensky),
    runSource('FIRMS', firms),
    runSource('Maritime', ships),
    runSource('Safecast', safecast),
    runSource('ACLED', acled),
    runSource('ReliefWeb', reliefweb),
    runSource('WHO', who),
    runSource('OFAC', ofac),
    runSource('OpenSanctions', opensanctions),
    runSource('ADS-B', adsb),

    // Tier 2: Economic & Financial (legacy)
    runSource('FRED', fred, process.env.FRED_API_KEY),
    runSource('Treasury', treasury),
    runSource('BLS', bls, process.env.BLS_API_KEY),
    runSource('EIA', eia, process.env.EIA_API_KEY),
    runSource('GSCPI', gscpi),
    runSource('USAspending', usaspending),
    runSource('Comtrade', comtrade),

    // Tier 3: Weather, Environment, Technology, Social (legacy)
    runSource('NOAA', noaa),
    runSource('EPA', epa),
    runSource('Patents', patents),
    runSource('Bluesky', bluesky),
    runSource('Reddit', reddit),
    runSource('Telegram', telegram),
    runSource('KiwiSDR', kiwisdr),

    // Tier 4: Space & Satellites (legacy)
    runSource('Space', space),

    // Tier 5: Live Market Data (legacy)
    runSource('YFinance', yfinance),

    // Tier 6: Cyber & Infrastructure (retained)
    runSource('CISA-KEV', cisaKev),
    runSource('Cloudflare-Radar', cloudflareRadar),

    // === NEW: Domain 1 — Vulnerability Intelligence ===
    runSource('NVD', nvd),
    runSource('EPSS', epss),
    runSource('GitHub-Advisory', githubAdvisory),
    runSource('ExploitDB', exploitdb),
    runSource('OSV', osv),

    // === NEW: Domain 2 — Threat Actors & Malware ===
    runSource('OTX', otx),
    runSource('MalwareBazaar', malwarebazaar),
    runSource('ThreatFox', threatfox),
    runSource('Feodo', feodo),
    runSource('ATT&CK-STIX', attackStix),
    runSource('VirusTotal', virustotal),
    runSource('URLhaus', urlhaus),

    // === NEW: Domain 3 — Attack Activity & Exposure ===
    runSource('GreyNoise', greynoise),
    runSource('Shodan', shodan),
    runSource('AbuseIPDB', abuseipdb),
    runSource('Shadowserver', shadowserver),
    runSource('Spamhaus', spamhaus),
    runSource('BGP-Ranking', bgpRanking),
    runSource('PhishTank', phishtank),
  ];

  // Each runSource has its own 30s timeout, so allSettled will resolve
  // within ~30s even if APIs hang. Global timeout is a safety net.
  const results = await Promise.allSettled(allPromises);

  const sources = results.map(r => r.status === 'fulfilled' ? r.value : { status: 'failed', error: r.reason?.message });
  const totalMs = Date.now() - start;

  const output = {
    crucix: {
      version: '2.0.0',
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

// Run and output when executed directly
const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryHref && import.meta.url === entryHref) {
  const data = await fullBriefing();
  console.log(JSON.stringify(data, null, 2));
}
