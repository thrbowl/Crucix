#!/usr/bin/env node
// Crucix Cybersecurity Intelligence Dashboard Synthesizer
// Reads runs/latest.json, fetches RSS news, generates signal-based ideas,
// and injects everything into dashboard/public/jarvis.html
//
// Exports synthesize(), generateIdeas(), fetchAllNews() for use by server.mjs

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import config from '../crucix.config.mjs';
import { createLLMProvider } from '../lib/llm/index.mjs';
import { generateLLMIdeas } from '../lib/llm/ideas.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// === Helpers ===
const cyrillic = /[\u0400-\u04FF]/;
function isEnglish(text) {
  if (!text) return false;
  return !cyrillic.test(text.substring(0, 80));
}

// === Geo-tagging keyword map ===
const geoKeywords = {
  'Ukraine':[49,32],'Russia':[56,38],'Moscow':[55.7,37.6],'Kyiv':[50.4,30.5],
  'China':[35,105],'Beijing':[39.9,116.4],'Iran':[32,53],'Tehran':[35.7,51.4],
  'Israel':[31.5,35],'Gaza':[31.4,34.4],'Palestine':[31.9,35.2],
  'Syria':[35,38],'Iraq':[33,44],'Saudi':[24,45],'Yemen':[15,48],'Lebanon':[34,36],
  'India':[20,78],'Japan':[36,138],'Korea':[37,127],'Pyongyang':[39,125.7],
  'Taiwan':[23.5,121],'Philippines':[13,122],'Myanmar':[20,96],
  'Canada':[56,-96],'Mexico':[23,-102],'Brazil':[-14,-51],'Argentina':[-38,-63],
  'Colombia':[4,-74],'Venezuela':[7,-66],'Cuba':[22,-80],'Chile':[-35,-71],
  'Germany':[51,10],'France':[46,2],'UK':[54,-2],'Britain':[54,-2],'London':[51.5,-0.1],
  'Spain':[40,-4],'Italy':[42,12],'Poland':[52,20],'NATO':[50,4],'EU':[50,4],
  'Turkey':[39,35],'Greece':[39,22],'Romania':[46,25],'Finland':[64,26],'Sweden':[62,15],
  'Africa':[0,20],'Nigeria':[10,8],'South Africa':[-30,25],'Kenya':[-1,38],
  'Egypt':[27,30],'Libya':[27,17],'Sudan':[13,30],'Ethiopia':[9,38],
  'Somalia':[5,46],'Congo':[-4,22],'Uganda':[1,32],'Morocco':[32,-6],
  'Pakistan':[30,70],'Afghanistan':[33,65],'Bangladesh':[24,90],
  'Australia':[-25,134],'Indonesia':[-2,118],'Thailand':[15,100],
  'US':[39,-98],'America':[39,-98],'Washington':[38.9,-77],'Pentagon':[38.9,-77],
  'Trump':[38.9,-77],'White House':[38.9,-77],
  'Wall Street':[40.7,-74],'New York':[40.7,-74],'California':[37,-120],
  'Nepal':[28,84],'Cambodia':[12.5,105],'Malawi':[-13.5,34],'Burundi':[-3.4,29.9],
  'Oman':[21,57],'Netherlands':[52.1,5.3],'Gabon':[-0.8,11.6],
  'Peru':[-10,-76],'Ecuador':[-2,-78],'Bolivia':[-17,-65],
  'Singapore':[1.35,103.8],'Malaysia':[4.2,101.9],'Vietnam':[16,108],
  'Algeria':[28,3],'Tunisia':[34,9],'Zimbabwe':[-20,30],'Mozambique':[-18,35],
  'Texas':[31,-100],'Florida':[28,-82],'Chicago':[41.9,-87.6],'Los Angeles':[34,-118],
  'San Francisco':[37.8,-122.4],'Seattle':[47.6,-122.3],'Miami':[25.8,-80.2],
  'Toronto':[43.7,-79.4],'Ottawa':[45.4,-75.7],'Vancouver':[49.3,-123.1],
  'São Paulo':[-23.5,-46.6],'Rio':[-22.9,-43.2],'Buenos Aires':[-34.6,-58.4],
  'Bogotá':[4.7,-74.1],'Lima':[-12,-77],'Santiago':[-33.4,-70.7],
  'Caracas':[10.5,-66.9],'Havana':[23.1,-82.4],'Panama':[9,-79.5],
  'Guatemala':[14.6,-90.5],'Honduras':[14.1,-87.2],'El Salvador':[13.7,-89.2],
  'Costa Rica':[10,-84],'Jamaica':[18.1,-77.3],'Haiti':[19,-72],
  'Dominican':[18.5,-70],'Puerto Rico':[18.2,-66.5],
  'Sri Lanka':[7,80],'Hong Kong':[22.3,114.2],'Taipei':[25,121.5],
  'Seoul':[37.6,127],'Osaka':[34.7,135.5],'Mumbai':[19.1,72.9],
  'Delhi':[28.6,77.2],'Shanghai':[31.2,121.5],'Shenzhen':[22.5,114.1],
  'Auckland':[-36.8,174.8],'Papua New Guinea':[-6.3,147],
  'Berlin':[52.5,13.4],'Paris':[48.9,2.3],'Madrid':[40.4,-3.7],
  'Rome':[41.9,12.5],'Warsaw':[52.2,21],'Prague':[50.1,14.4],
  'Vienna':[48.2,16.4],'Budapest':[47.5,19.1],'Bucharest':[44.4,26.1],
  'Oslo':[59.9,10.7],'Copenhagen':[55.7,12.6],
  'Brussels':[50.8,4.4],'Zurich':[47.4,8.5],'Dublin':[53.3,-6.3],
  'Lisbon':[38.7,-9.1],'Athens':[37.9,23.7],'Minsk':[53.9,27.6],
  'Nairobi':[-1.3,36.8],'Lagos':[6.5,3.4],'Accra':[5.6,-0.2],
  'Addis Ababa':[9,38.7],'Cape Town':[-33.9,18.4],'Johannesburg':[-26.2,28],
  'Kinshasa':[-4.3,15.3],'Khartoum':[15.6,32.5],'Mogadishu':[2.1,45.3],
  'Dakar':[14.7,-17.5],'Abuja':[9.1,7.5],
  'Fed':[38.9,-77],'Congress':[38.9,-77],'Senate':[38.9,-77],
  'Silicon Valley':[37.4,-122],'NASA':[28.6,-80.6],
  'IMF':[38.9,-77],'World Bank':[38.9,-77],'UN':[40.7,-74],
};

function geoTagText(text) {
  if (!text) return null;
  for (const [keyword, [lat, lon]] of Object.entries(geoKeywords)) {
    if (text.includes(keyword)) {
      return { lat, lon, region: keyword };
    }
  }
  return null;
}

function sanitizeExternalUrl(raw) {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

// === RSS Fetching ===
async function fetchRSS(url, source) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const xml = await res.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = (block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || '').trim();
      const link = sanitizeExternalUrl((block.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1] || '').trim());
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      if (title && title !== source) items.push({ title, date: pubDate, source, url: link || undefined });
    }
    return items;
  } catch (e) {
    console.log(`RSS fetch failed (${source}):`, e.message);
    return [];
  }
}

const RSS_SOURCE_FALLBACKS = {
  'Krebs': { lat: 38.9, lon: -77, region: 'US' },
  'Dark Reading': { lat: 40.7, lon: -74, region: 'US' },
  'SecurityWeek': { lat: 37.4, lon: -122, region: 'US' },
};
const REGIONAL_NEWS_SOURCES = [];

export async function fetchAllNews() {
  const feeds = [
    // International security media
    ['https://feeds.feedburner.com/TheHackersNews', 'The Hacker News'],
    ['https://www.bleepingcomputer.com/feed/', 'BleepingComputer'],
    ['https://krebsonsecurity.com/feed/', 'Krebs'],
    ['https://www.darkreading.com/rss.xml', 'Dark Reading'],
    ['https://www.securityweek.com/feed', 'SecurityWeek'],
    ['https://threatpost.com/feed/', 'Threatpost'],
    ['https://www.schneier.com/feed/atom/', 'Schneier'],
    ['https://nakedsecurity.sophos.com/feed/', 'Naked Security'],
    ['https://www.csoonline.com/feed/', 'CSO Online'],
    // Official advisories
    ['https://www.cisa.gov/news.xml', 'CISA News'],
    ['https://us-cert.cisa.gov/ncas/alerts.xml', 'US-CERT'],
    // Chinese security media
    ['https://www.anquanke.com/rss.xml', 'Anquanke RSS'],
    ['https://www.4hou.com/feed', '4hou RSS'],
    ['https://www.freebuf.com/feed', 'FreeBuf RSS'],
  ];

  const results = await Promise.allSettled(
    feeds.map(([url, source]) => fetchRSS(url, source))
  );

  const allNews = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  const seen = new Set();
  const geoNews = [];
  for (const item of allNews) {
    const key = item.title.substring(0, 40).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const geo = geoTagText(item.title) || RSS_SOURCE_FALLBACKS[item.source];
    if (geo) {
      geoNews.push({
        title: item.title.substring(0, 100),
        source: item.source,
        date: item.date,
        url: item.url,
        lat: geo.lat + (Math.random() - 0.5) * 2,
        lon: geo.lon + (Math.random() - 0.5) * 2,
        region: geo.region
      });
    }
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const filtered = geoNews.filter(n => !n.date || new Date(n.date) >= cutoff);
  filtered.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const selected = [];
  const selectedKeys = new Set();
  const keyFor = item => `${item.source}|${item.title}|${item.date}`;
  const pushUnique = item => {
    const key = keyFor(item);
    if (selectedKeys.has(key)) return;
    selected.push(item);
    selectedKeys.add(key);
  };

  for (const source of REGIONAL_NEWS_SOURCES) {
    filtered.filter(item => item.source === source).slice(0, 2).forEach(pushUnique);
  }
  filtered.forEach(pushUnique);
  return selected.slice(0, 50);
}

// === Threat Level Computation ===
function computeThreatLevel(data) {
  let score = 0;

  const kevCount = data.sources['CISA-KEV']?.newEntries || 0;
  score += Math.min(kevCount * 5, 20);

  const critCVEs = (data.sources.NVD?.recentCVEs || []).filter(c => (c.cvssScore || 0) >= 9.0).length;
  score += Math.min(critCVEs * 3, 15);

  const highEpss = (data.sources.EPSS?.highRisk || data.sources.EPSS?.topByScore || []).length;
  score += Math.min(highEpss * 2, 10);

  const c2Count = data.sources.Feodo?.onlineC2Count || data.sources.Feodo?.onlineC2s || 0;
  score += Math.min(Math.floor(c2Count / 10), 10);

  const malwareCount = (data.sources.MalwareBazaar?.recentSamples || []).length;
  score += Math.min(Math.floor(malwareCount / 5), 10);

  const ransomVictims = data.sources['Ransomware-Live']?.totalRecentVictims || 0;
  score += Math.min(ransomVictims * 2, 15);

  const maliciousIPs = data.sources.GreyNoise?.maliciousCount || 0;
  score += Math.min(Math.floor(maliciousIPs / 50), 10);

  const urlhausOnline = data.sources.URLhaus?.onlineCount || data.sources.URLhaus?.totalUrls || 0;
  score += Math.min(Math.floor(urlhausOnline / 100), 10);

  score = Math.min(score, 100);

  let level, direction;
  if (score >= 75) level = 'CRITICAL';
  else if (score >= 50) level = 'HIGH';
  else if (score >= 25) level = 'ELEVATED';
  else level = 'LOW';

  if (score >= 70) direction = 'worsening';
  else if (score >= 40) direction = 'stable';
  else direction = 'improving';

  return { level, index: score, direction };
}

// === CVE Enrichment: merge NVD + EPSS + KEV + GitHub Advisory + ExploitDB ===
function buildCVEList(data) {
  const nvdCves = data.sources.NVD?.recentCVEs || [];
  const epssMap = new Map();
  for (const e of (data.sources.EPSS?.highRisk || [])) {
    if (e.cveId) epssMap.set(e.cveId, e.epss);
  }
  const kevSet = new Set(
    (data.sources['CISA-KEV']?.vulnerabilities || data.sources['CISA-KEV']?.recentAdditions || [])
      .map(v => v.cveID || v.cveId)
      .filter(Boolean)
  );
  const exploitSet = new Set(
    (data.sources.ExploitDB?.recentExploits || [])
      .flatMap(e => (e.cveId ? [e.cveId] : []))
  );

  const cves = nvdCves.map(c => ({
    id: c.cveId,
    cvss: c.cvssScore || 0,
    epss: epssMap.get(c.cveId) || null,
    description: (c.description || '').substring(0, 200),
    publishedDate: c.publishedDate,
    inKEV: kevSet.has(c.cveId),
    hasPoc: exploitSet.has(c.cveId),
    sources: ['NVD',
      ...(epssMap.has(c.cveId) ? ['EPSS'] : []),
      ...(kevSet.has(c.cveId) ? ['KEV'] : []),
      ...(exploitSet.has(c.cveId) ? ['ExploitDB'] : []),
    ],
  }));

  // Also include GitHub advisories that have CVE IDs but weren't in NVD results
  const existingIds = new Set(cves.map(c => c.id));
  for (const adv of (data.sources['GitHub-Advisory']?.advisories || [])) {
    const cveId = adv.cveId || adv.identifiers?.find(i => i.type === 'CVE')?.value;
    if (cveId && !existingIds.has(cveId)) {
      cves.push({
        id: cveId,
        cvss: adv.cvss || 0,
        epss: epssMap.get(cveId) || null,
        description: (adv.summary || '').substring(0, 200),
        publishedDate: adv.publishedAt,
        inKEV: kevSet.has(cveId),
        hasPoc: exploitSet.has(cveId),
        sources: ['GitHub-Advisory',
          ...(epssMap.has(cveId) ? ['EPSS'] : []),
          ...(kevSet.has(cveId) ? ['KEV'] : []),
        ],
      });
      existingIds.add(cveId);
    }
  }

  cves.sort((a, b) => (b.cvss || 0) - (a.cvss || 0));

  return {
    recent: cves.slice(0, 50),
    kevCount: cves.filter(c => c.inKEV).length,
    criticalCount: cves.filter(c => c.cvss >= 9.0).length,
    totalTracked: cves.length,
  };
}

// === IOC Aggregation ===
function buildIOCs(data) {
  const malware = (data.sources.MalwareBazaar?.recentSamples || []).slice(0, 30).map(s => ({
    hash: s.sha256_hash || s.sha256 || s.md5,
    type: s.file_type || s.fileType || 'unknown',
    tags: s.tags || [],
    signature: s.signature || null,
    firstSeen: s.first_seen || s.firstSeen,
    source: 'MalwareBazaar',
  }));

  const threatfoxIOCs = (data.sources.ThreatFox?.recentIOCs || data.sources.ThreatFox?.iocs || []).slice(0, 30).map(ioc => ({
    indicator: ioc.ioc || ioc.indicator,
    type: ioc.ioc_type || ioc.type || 'unknown',
    threat: ioc.threat_type || ioc.malware || null,
    tags: ioc.tags || [],
    firstSeen: ioc.first_seen || ioc.firstSeen,
    source: 'ThreatFox',
  }));
  malware.push(...threatfoxIOCs);

  const c2 = [];
  for (const entry of (data.sources.Feodo?.activeC2s || data.sources.Feodo?.c2Servers || [])) {
    c2.push({
      ip: entry.ip || entry.ip_address,
      port: entry.port,
      malware: entry.malware,
      status: entry.status || 'online',
      firstSeen: entry.first_seen || entry.firstSeen,
      lastOnline: entry.last_online || entry.lastOnline,
      source: 'Feodo',
    });
  }
  for (const entry of (data.sources.URLhaus?.activeUrls || data.sources.URLhaus?.recentUrls || []).slice(0, 30)) {
    c2.push({
      url: entry.url,
      type: entry.url_type || entry.threat || 'malware_download',
      status: entry.url_status || 'online',
      tags: entry.tags || [],
      firstSeen: entry.date_added || entry.dateAdded,
      source: 'URLhaus',
    });
  }

  const maliciousIPs = [];
  for (const entry of (data.sources.AbuseIPDB?.reportedIPs || []).slice(0, 30)) {
    maliciousIPs.push({
      ip: entry.ipAddress || entry.ip,
      reports: entry.totalReports || entry.reports || 0,
      confidence: entry.abuseConfidenceScore || entry.confidence || 0,
      country: entry.countryCode || entry.country,
      source: 'AbuseIPDB',
    });
  }
  for (const entry of (data.sources.GreyNoise?.topScanners || []).slice(0, 20)) {
    maliciousIPs.push({
      ip: entry.ip,
      classification: entry.classification || 'malicious',
      tags: entry.tags || [],
      country: entry.metadata?.country || entry.country,
      source: 'GreyNoise',
    });
  }
  for (const entry of (data.sources.Spamhaus?.entries || data.sources.Spamhaus?.listings || []).slice(0, 20)) {
    maliciousIPs.push({
      ip: entry.ip || entry.address,
      type: entry.type || entry.listType || 'spam',
      source: 'Spamhaus',
    });
  }

  const phishing = (data.sources.PhishTank?.recentPhishing || data.sources.PhishTank?.urls || data.sources.PhishTank?.recentPhish || []).slice(0, 30).map(p => ({
    url: p.url,
    target: p.target || p.brand || null,
    verified: p.verified ?? true,
    submitDate: p.submission_time || p.submitDate,
    source: 'PhishTank',
  }));

  return {
    malware,
    c2,
    maliciousIPs,
    phishing,
    total: malware.length + c2.length + maliciousIPs.length + phishing.length,
    c2Count: c2.length,
    phishCount: phishing.length,
  };
}

// === ATT&CK Matrix ===
function buildAttackMatrix(data) {
  const stix = data.sources['ATT&CK-STIX'] || {};
  const tactics = (stix.tactics || []).map(t => ({
    id: t.id || t.external_id,
    name: t.name,
    techniqueCount: t.techniqueCount || t.techniques?.length || 0,
  }));
  const techniques = (stix.techniques || []).slice(0, 100).map(t => ({
    id: t.id || t.external_id,
    name: t.name,
    tacticId: t.tacticId || t.kill_chain_phases?.[0]?.phase_name,
    count: t.count || 0,
  }));
  return {
    tactics,
    techniques,
    totalTechniques: stix.totalTechniques || techniques.length,
  };
}

// === Threat Actors ===
function buildActors(data) {
  const rlData = data.sources['Ransomware-Live'] || {};
  const ransomwareGroups = Object.entries(rlData.byGroup || {}).map(([name, count]) => ({
    name, victims: typeof count === 'number' ? count : count?.count || 0,
  })).sort((a, b) => b.victims - a.victims).slice(0, 20);

  const aptGroups = [];
  for (const pulse of (data.sources.OTX?.pulses || []).slice(0, 20)) {
    if (pulse.adversary || pulse.tags?.some(t => /apt|threat.actor/i.test(t))) {
      aptGroups.push({
        name: pulse.adversary || pulse.name,
        tags: pulse.tags || [],
        created: pulse.created,
        references: pulse.references?.slice(0, 3) || [],
        source: 'OTX',
      });
    }
  }

  const victims = (rlData.victims || []).slice(0, 50).map(v => ({
    name: v.name,
    group: v.group,
    discovered: v.discovered,
    country: v.country,
    sector: v.sector,
  }));

  return {
    ransomwareGroups,
    aptGroups,
    victims,
    totalVictims: rlData.totalRecentVictims || victims.length,
    bySector: rlData.bySector || {},
    byCountry: rlData.byCountry || {},
  };
}

// === Geographic Attack Points for Globe ===
function buildGeoAttacks(data) {
  const points = [];
  const countryGeo = {
    US:[39,-98],CN:[35,105],DE:[51,10],FR:[46,2],NL:[52.1,5.3],GB:[54,-2],
    RU:[56,38],BR:[-14,-51],IN:[20,78],JP:[36,138],KR:[37,127],SG:[1.35,103.8],
    AU:[-25,134],CA:[56,-96],IT:[42,12],ES:[40,-4],SE:[62,15],HK:[22.3,114.2],
    TW:[23.5,121],PL:[52,20],RO:[46,25],UA:[49,32],ID:[-2,118],TH:[15,100],
    VN:[16,108],MX:[23,-102],AR:[-38,-63],ZA:[-30,25],TR:[39,35],EG:[27,30],
    CH:[47,8],AT:[48,16],CZ:[50,14.5],JO:[31.5,36],BW:[-22,24],SI:[46,14.5],
    GR:[39,22],IL:[31.5,34.8],SA:[24,45],AE:[24,54],IQ:[33,44],IR:[32,53],
    PK:[30,70],BD:[24,90],PH:[13,122],MM:[22,96],NP:[28,84],LK:[7,80],
    KE:[-1,37],NG:[9.1,7.5],GH:[7.9,-1.0],DZ:[28,3],MA:[32,-5],TN:[34,9],
    CO:[4,-74],PE:[-12,-77],CL:[-33.4,-70.7],VE:[10.5,-66.9],EC:[-1.8,-78],
    HN:[14.1,-87.2],CR:[10,-84],PA:[9,-79.5],PR:[18.2,-66.5],
    FI:[61,26],NO:[62,10],DK:[56,10],IE:[53.3,-6.3],PT:[38.7,-9.1],
    BE:[50.8,4.4],LU:[49.8,6.1],SK:[48.7,19.7],HR:[45.8,16],RS:[44.8,20.5],
    BG:[42.7,25.5],LT:[55.2,24],LV:[57,25],EE:[58.6,25],
    EU:[50,10],
  };

  function geoFromCC(cc) {
    if (!cc) return null;
    const arr = countryGeo[cc];
    if (arr) return { lat: arr[0], lon: arr[1] };
    return geoTagText(cc);
  }

  // Ransomware victims by country
  for (const v of (data.sources['Ransomware-Live']?.victims || []).slice(0, 40)) {
    const geo = geoFromCC(v.country);
    if (geo) {
      points.push({
        lat: geo.lat + (Math.random() - 0.5) * 3,
        lon: geo.lon + (Math.random() - 0.5) * 3,
        type: 'victim',
        label: `${v.group}: ${v.name}`,
        severity: 'high',
        source: 'Ransomware-Live',
      });
    }
  }

  // GreyNoise top scanners
  for (const s of (data.sources.GreyNoise?.topScanners || []).slice(0, 20)) {
    const country = s.metadata?.country || s.country;
    const geo = country ? geoFromCC(country) : null;
    if (geo) {
      points.push({
        lat: geo.lat + (Math.random() - 0.5) * 3,
        lon: geo.lon + (Math.random() - 0.5) * 3,
        type: 'attack_source',
        label: `Scanner: ${s.ip}`,
        severity: 'critical',
        source: 'GreyNoise',
      });
    }
  }

  // Feodo C2 servers — geo-tag by country field or fallback to IP text
  for (const c of (data.sources.Feodo?.activeC2s || data.sources.Feodo?.c2Servers || []).slice(0, 20)) {
    const country = c.country || c.countryCode;
    const geo = country ? geoTagText(country) : null;
    if (geo) {
      points.push({
        lat: geo.lat + (Math.random() - 0.5) * 2,
        lon: geo.lon + (Math.random() - 0.5) * 2,
        type: 'c2',
        label: `C2: ${c.ip || c.ip_address} (${c.malware || 'unknown'})`,
        severity: 'critical',
        source: 'Feodo',
      });
    }
  }

  // AbuseIPDB reported IPs
  for (const entry of (data.sources.AbuseIPDB?.reportedIPs || []).slice(0, 15)) {
    const country = entry.countryCode || entry.country;
    const geo = country ? geoFromCC(country) : null;
    if (geo) {
      points.push({
        lat: geo.lat + (Math.random() - 0.5) * 2,
        lon: geo.lon + (Math.random() - 0.5) * 2,
        type: 'honeypot',
        label: `Abuse: ${entry.ipAddress || entry.ip} (${entry.totalReports || 0} reports)`,
        severity: 'medium',
        source: 'AbuseIPDB',
      });
    }
  }

  // CERT alerts by country
  for (const alert of (data.sources['CERTs-Intl']?.recentAlerts || []).slice(0, 15)) {
    const geo = geoTagText(alert.title || alert.cert || '');
    if (geo) {
      points.push({
        lat: geo.lat + (Math.random() - 0.5) * 2,
        lon: geo.lon + (Math.random() - 0.5) * 2,
        type: 'cert',
        label: `CERT: ${(alert.title || '').substring(0, 60)}`,
        severity: 'low',
        source: 'CERTs-Intl',
      });
    }
  }

  // Feodo C2 by-country distribution
  const feodoByCountry = data.sources.Feodo?.byCountry || {};
  for (const [cc, count] of Object.entries(feodoByCountry)) {
    if (count < 1) continue;
    const geo = countryGeo[cc];
    if (!geo) continue;
    for (let i = 0; i < Math.min(count, 3); i++) {
      points.push({
        lat: geo[0] + (Math.random() - 0.5) * 4,
        lon: geo[1] + (Math.random() - 0.5) * 4,
        type: 'c2',
        label: `C2 cluster: ${cc} (${count})`,
        severity: count >= 5 ? 'critical' : 'high',
        source: 'Feodo',
      });
    }
  }

  // CISA alerts → US region markers
  for (const a of (data.sources['CISA-Alerts']?.recentAlerts || []).slice(0, 8)) {
    points.push({
      lat: 38.9 + (Math.random() - 0.5) * 8,
      lon: -95 + (Math.random() - 0.5) * 20,
      type: 'cert',
      label: `CISA: ${(a.title || '').substring(0, 60)}`,
      severity: 'high',
      source: 'CISA',
    });
  }

  // ENISA reports → EU region markers
  for (const r of (data.sources.ENISA?.recentReports || data.sources.ENISA?.links || []).slice(0, 6)) {
    const geo = geoTagText(r.title || '') || { lat: 50 + (Math.random()-0.5)*10, lon: 10 + (Math.random()-0.5)*20 };
    points.push({
      lat: geo.lat + (Math.random() - 0.5) * 3,
      lon: geo.lon + (Math.random() - 0.5) * 3,
      type: 'cert',
      label: `ENISA: ${(r.title || '').substring(0, 60)}`,
      severity: 'medium',
      source: 'ENISA',
    });
  }

  // CNCERT/CNVD/CNNVD → China region markers
  for (const a of (data.sources.CNCERT?.recentAlerts || []).slice(0, 6)) {
    points.push({
      lat: 35 + (Math.random() - 0.5) * 16,
      lon: 105 + (Math.random() - 0.5) * 20,
      type: 'cert',
      label: `CNCERT: ${(a.title || '').substring(0, 50)}`,
      severity: 'medium',
      source: 'CNCERT',
    });
  }
  for (const v of (data.sources.CNVD?.recentVulns || []).slice(0, 5)) {
    points.push({
      lat: 35 + (Math.random() - 0.5) * 16,
      lon: 105 + (Math.random() - 0.5) * 20,
      type: 'exposed_asset',
      label: `CNVD: ${(v.title || v.name || '').substring(0, 50)}`,
      severity: 'medium',
      source: 'CNVD',
    });
  }
  for (const v of (data.sources.CNNVD?.recentVulns || []).slice(0, 5)) {
    points.push({
      lat: 35 + (Math.random() - 0.5) * 16,
      lon: 105 + (Math.random() - 0.5) * 20,
      type: 'exposed_asset',
      label: `CNNVD: ${(v.title || v.name || '').substring(0, 50)}`,
      severity: 'medium',
      source: 'CNNVD',
    });
  }

  // KEV CVEs → spread globally with high severity
  for (const c of (data.sources['CISA-KEV']?.recent || []).slice(0, 10)) {
    const geo = geoTagText(c.vendorProject || c.product || '') || {
      lat: (Math.random() - 0.5) * 100,
      lon: (Math.random() - 0.5) * 300,
    };
    points.push({
      lat: geo.lat + (Math.random() - 0.5) * 5,
      lon: geo.lon + (Math.random() - 0.5) * 5,
      type: 'exposed_asset',
      label: `KEV: ${(c.vulnerabilityName || c.cveID || '').substring(0, 60)}`,
      severity: 'critical',
      source: 'CISA-KEV',
    });
  }

  // Ransomware victims by country stats (fallback when individual victims unavailable)
  const rlByCountry = data.sources['Ransomware-Live']?.byCountry || {};
  for (const [cc, count] of Object.entries(rlByCountry)) {
    const geo = geoFromCC(cc);
    if (!geo || cc === 'Unknown') continue;
    for (let i = 0; i < Math.min(count, 4); i++) {
      points.push({
        lat: geo.lat + (Math.random() - 0.5) * 5,
        lon: geo.lon + (Math.random() - 0.5) * 5,
        type: 'victim',
        label: `Ransomware victim: ${cc} (${count} total)`,
        severity: count >= 5 ? 'high' : 'medium',
        source: 'Ransomware-Live',
      });
    }
  }

  // OTX pulses → spread based on title geo-matching
  for (const p of (data.sources.OTX?.recentPulses || data.sources.OTX?.pulses || []).slice(0, 12)) {
    const geo = geoTagText(p.name || p.title || '');
    if (geo) {
      points.push({
        lat: geo.lat + (Math.random() - 0.5) * 3,
        lon: geo.lon + (Math.random() - 0.5) * 3,
        type: 'attack_source',
        label: `OTX: ${(p.name || p.title || '').substring(0, 50)}`,
        severity: 'medium',
        source: 'OTX',
      });
    }
  }

  // Shodan exposed services → spread globally
  for (const s of (data.sources.Shodan?.topServices || data.sources.Shodan?.data || []).slice(0, 8)) {
    const cc = s.country || s.location?.country_code;
    const geo = cc ? geoFromCC(cc) : null;
    if (geo) {
      points.push({
        lat: geo.lat + (Math.random() - 0.5) * 4,
        lon: geo.lon + (Math.random() - 0.5) * 4,
        type: 'exposed_asset',
        label: `Shodan: ${s.port || s.service || 'exposed'} (${cc})`,
        severity: 'low',
        source: 'Shodan',
      });
    }
  }

  return points;
}

// === CERT & Advisory Alerts ===
function buildCertAlerts(data) {
  const cisaAlerts = (data.sources['CISA-Alerts']?.recentAlerts || []).slice(0, 15).map(a => ({
    title: (a.title || '').substring(0, 120),
    date: a.date || a.published,
    url: sanitizeExternalUrl(a.url || a.link),
    severity: a.severity,
  }));

  const enisaAlerts = (data.sources.ENISA?.recentReports || []).slice(0, 10).map(r => ({
    title: (r.title || '').substring(0, 120),
    date: r.date || r.published,
    url: sanitizeExternalUrl(r.url || r.link),
  }));

  const certsIntlAlerts = (data.sources['CERTs-Intl']?.recentAlerts || []).slice(0, 15).map(a => ({
    title: (a.title || '').substring(0, 120),
    cert: a.cert || a.source,
    date: a.date || a.published,
    url: sanitizeExternalUrl(a.url || a.link),
  }));

  const cncertAlerts = (data.sources.CNCERT?.recentAlerts || []).slice(0, 10).map(a => ({
    title: (a.title || '').substring(0, 120),
    date: a.date,
    url: sanitizeExternalUrl(a.url),
  }));

  const cnvdAlerts = (data.sources.CNVD?.recentVulns || []).slice(0, 10).map(v => ({
    title: (v.title || v.name || '').substring(0, 120),
    date: v.date,
    url: sanitizeExternalUrl(v.url),
  }));

  const cnnvdAlerts = (data.sources.CNNVD?.recentVulns || []).slice(0, 10).map(v => ({
    title: (v.title || v.name || '').substring(0, 120),
    date: v.date,
    url: sanitizeExternalUrl(v.url),
  }));

  const items = [
    { source: 'CISA',        label: 'CISA',       color: 'var(--red)',    orgUrl: 'https://www.cisa.gov/news-events/alerts',       alerts: cisaAlerts },
    { source: 'ENISA',       label: 'ENISA',      color: 'var(--orange)', orgUrl: 'https://www.enisa.europa.eu/publications',      alerts: enisaAlerts },
    { source: 'CERTs-Intl',  label: 'CERTs Intl', color: 'var(--blue)',   orgUrl: '',                                              alerts: certsIntlAlerts },
    { source: 'CNCERT',      label: 'CNCERT',     color: 'var(--green)',  orgUrl: 'https://www.cert.org.cn',                       alerts: cncertAlerts },
    { source: 'CNVD',        label: 'CNVD',       color: 'var(--accent)', orgUrl: 'https://www.cnvd.org.cn',                       alerts: cnvdAlerts },
    { source: 'CNNVD',       label: 'CNNVD',      color: 'var(--accent)', orgUrl: 'https://www.cnnvd.org.cn',                      alerts: cnnvdAlerts },
  ].map(item => ({ ...item, count: item.alerts.length }));

  return {
    total: items.reduce((s, i) => s + i.count, 0),
    items,
  };
}

// === Security News from RSS Sources ===
function buildSecurityNewsList(data) {
  const items = [];

  for (const a of (data.sources.ENISA?.recentReports || []).slice(0, 5)) {
    items.push({ title: (a.title || '').substring(0, 120), url: sanitizeExternalUrl(a.url || a.link), date: a.date || a.published, source: 'ENISA', type: 'advisory' });
  }
  for (const a of (data.sources['CISA-Alerts']?.recentAlerts || []).slice(0, 5)) {
    items.push({ title: (a.title || '').substring(0, 120), url: sanitizeExternalUrl(a.url || a.link), date: a.date || a.published, source: 'CISA', type: 'advisory' });
  }

  // Chinese security news
  for (const src of ['FreeBuf', 'Anquanke', '4hou']) {
    for (const a of (data.sources[src]?.articles || data.sources[src]?.recentArticles || data.sources[src]?.items || []).slice(0, 5)) {
      items.push({ title: (a.title || '').substring(0, 120), url: sanitizeExternalUrl(a.url || a.link), date: a.date || a.published, source: src, type: 'news' });
    }
  }

  // English security media (THN, BleepingComputer, SecurityWeek)
  for (const src of ['HackerNews-RSS', 'BleepingComputer', 'SecurityWeek']) {
    for (const a of (data.sources[src]?.recentArticles || data.sources[src]?.items || []).slice(0, 5)) {
      items.push({ title: (a.title || '').substring(0, 120), url: sanitizeExternalUrl(a.url || a.link), date: a.date || a.published, source: src, type: 'news' });
    }
  }

  // International vendor feeds
  for (const a of (data.sources['Vendors-Intl']?.recentArticles || []).slice(0, 5)) {
    items.push({ title: (a.title || '').substring(0, 120), url: sanitizeExternalUrl(a.url), date: a.date, source: a.vendor || 'Vendor', type: 'advisory' });
  }

  // Chinese vendor feeds
  for (const a of (data.sources['Vendors-CN']?.recentArticles || []).slice(0, 5)) {
    items.push({ title: (a.title || '').substring(0, 120), url: sanitizeExternalUrl(a.url), date: a.date, source: a.vendor || 'VendorCN', type: 'advisory' });
  }

  // Tavily AI sweep results
  for (const a of (data.sources.Tavily?.items || []).slice(0, 5)) {
    items.push({ title: (a.title || '').substring(0, 120), url: sanitizeExternalUrl(a.url), date: a.date, source: 'Tavily', type: 'news' });
  }

  // Baidu search results
  for (const a of (data.sources['Baidu-Search']?.items || []).slice(0, 5)) {
    items.push({ title: (a.title || '').substring(0, 120), url: sanitizeExternalUrl(a.url), date: a.date, source: 'Baidu', type: 'news' });
  }

  items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return items.slice(0, 30);
}

// === China Intelligence Section ===
function buildChinaIntel(data) {
  const cncertAlerts = (data.sources.CNCERT?.recentAlerts || []).slice(0, 15).map(a => ({
    title: (a.title || '').substring(0, 120), date: a.date, url: sanitizeExternalUrl(a.url), severity: a.severity,
  }));

  const cnvdVulns = (data.sources.CNVD?.recentVulns || []).slice(0, 15).map(v => ({
    id: v.id || v.cnvdId, title: (v.title || v.name || '').substring(0, 120), date: v.date,
    severity: v.severity, url: sanitizeExternalUrl(v.url),
  }));

  const cnnvdVulns = (data.sources.CNNVD?.recentVulns || []).slice(0, 15).map(v => ({
    id: v.id || v.cnnvdId, title: (v.title || v.name || '').substring(0, 120), date: v.date,
    severity: v.severity, url: sanitizeExternalUrl(v.url),
  }));

  const threatbookData = data.sources.ThreatBook || null;

  const qianxinThreats = (data.sources.Qianxin?.recentThreats || data.sources.Qianxin?.threats || data.sources.Qianxin?.items || []).slice(0, 10).map(t => ({
    title: (t.title || t.name || '').substring(0, 120), date: t.date, type: t.type,
  }));

  const newsArticles = [];
  for (const src of ['FreeBuf', 'Anquanke', '4hou']) {
    for (const a of (data.sources[src]?.articles || data.sources[src]?.recentArticles || data.sources[src]?.items || []).slice(0, 8)) {
      newsArticles.push({
        title: (a.title || '').substring(0, 120), url: sanitizeExternalUrl(a.url || a.link),
        date: a.date || a.published, source: src,
      });
    }
  }
  newsArticles.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  return {
    cncertAlerts,
    cnvdVulns,
    cnnvdVulns,
    threatbookData,
    qianxinThreats,
    newsArticles: newsArticles.slice(0, 20),
  };
}

// === Unified Security News Feed for Ticker ===
function buildSecurityNewsFeed(rssNews, data, tgUrgent, tgTop) {
  const feed = [];

  // RSS general news
  for (const n of rssNews) {
    feed.push({
      headline: n.title, source: n.source, type: 'rss',
      timestamp: n.date, region: n.region, urgent: false, url: n.url
    });
  }

  // CISA advisories as news items
  for (const a of (data.sources['CISA-Alerts']?.recentAlerts || []).slice(0, 8)) {
    feed.push({
      headline: (a.title || '').substring(0, 100), source: 'CISA', type: 'advisory',
      timestamp: a.date || a.published, region: 'US', urgent: true,
      url: sanitizeExternalUrl(a.url || a.link),
    });
  }

  // ENISA reports
  for (const r of (data.sources.ENISA?.recentReports || []).slice(0, 5)) {
    feed.push({
      headline: (r.title || '').substring(0, 100), source: 'ENISA', type: 'advisory',
      timestamp: r.date || r.published, region: 'EU', urgent: false,
      url: sanitizeExternalUrl(r.url || r.link),
    });
  }

  // Chinese security news (FreeBuf / Anquanke / 4hou)
  for (const src of ['FreeBuf', 'Anquanke', '4hou']) {
    for (const a of (data.sources[src]?.articles || data.sources[src]?.recentArticles || data.sources[src]?.items || []).slice(0, 5)) {
      feed.push({
        headline: (a.title || '').substring(0, 100), source: src, type: 'sec-news',
        timestamp: a.date || a.published, region: 'China', urgent: false,
        url: sanitizeExternalUrl(a.url || a.link),
      });
    }
  }

  // English security media
  for (const src of ['HackerNews-RSS', 'BleepingComputer', 'SecurityWeek']) {
    for (const a of (data.sources[src]?.recentArticles || []).slice(0, 3)) {
      feed.push({
        headline: (a.title || '').substring(0, 100), source: src, type: 'sec-news',
        timestamp: a.date, region: 'Global', urgent: false,
        url: sanitizeExternalUrl(a.url),
      });
    }
  }

  // Vendor feeds (intl + CN)
  for (const a of (data.sources['Vendors-Intl']?.recentArticles || []).slice(0, 5)) {
    feed.push({
      headline: (a.title || '').substring(0, 100), source: a.vendor || 'Vendor', type: 'advisory',
      timestamp: a.date, region: 'Global', urgent: false,
      url: sanitizeExternalUrl(a.url),
    });
  }
  for (const a of (data.sources['Vendors-CN']?.recentArticles || []).slice(0, 3)) {
    feed.push({
      headline: (a.title || '').substring(0, 100), source: a.vendor || 'VendorCN', type: 'advisory',
      timestamp: a.date, region: 'China', urgent: false,
      url: sanitizeExternalUrl(a.url),
    });
  }

  // Tavily AI sweep
  for (const a of (data.sources.Tavily?.items || []).slice(0, 5)) {
    feed.push({
      headline: (a.title || '').substring(0, 100), source: 'Tavily', type: 'ai-search',
      timestamp: a.date, region: 'Global', urgent: a.level === 'high',
      url: sanitizeExternalUrl(a.url),
    });
  }

  // Baidu search results
  for (const a of (data.sources['Baidu-Search']?.items || []).slice(0, 5)) {
    feed.push({
      headline: (a.title || '').substring(0, 100), source: 'Baidu', type: 'sec-news',
      timestamp: a.date, region: 'China', urgent: false,
      url: sanitizeExternalUrl(a.url),
    });
  }

  // Telegram urgent
  for (const p of (tgUrgent || []).slice(0, 10)) {
    const text = (p.text || '').replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '').trim();
    feed.push({
      headline: text.substring(0, 100), source: p.channel?.toUpperCase() || 'TELEGRAM',
      type: 'telegram', timestamp: p.date, region: 'OSINT', urgent: true
    });
  }

  // Telegram top (non-urgent)
  for (const p of (tgTop || []).slice(0, 5)) {
    const text = (p.text || '').replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '').trim();
    feed.push({
      headline: text.substring(0, 100), source: p.channel?.toUpperCase() || 'TELEGRAM',
      type: 'telegram', timestamp: p.date, region: 'OSINT', urgent: false
    });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recent = feed.filter(item => !item.timestamp || new Date(item.timestamp) >= cutoff);
  recent.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  const selected = [];
  const selectedKeys = new Set();
  const keyFor = item => `${item.type}|${item.source}|${item.headline}|${item.timestamp}`;
  const pushUnique = item => {
    const key = keyFor(item);
    if (selectedKeys.has(key)) return;
    selected.push(item);
    selectedKeys.add(key);
  };

  for (const source of REGIONAL_NEWS_SOURCES) {
    recent.filter(item => item.source === source).slice(0, 2).forEach(pushUnique);
  }
  recent.forEach(pushUnique);
  return selected.slice(0, 50);
}

// === Leverageable Ideas from Cybersecurity Signals ===
export function generateIdeas(V2) {
  const ideas = [];

  if (V2.threats.level === 'CRITICAL') {
    ideas.push({
      title: 'Critical Threat Level Active',
      text: `Threat index at ${V2.threats.index}/100 (${V2.threats.direction}). Multiple high-severity signals active across ${V2.threats.activeSources} sources. Heightened defensive posture recommended.`,
      type: 'alert', confidence: 'High', horizon: 'immediate'
    });
  }

  if (V2.cves.kevCount > 3) {
    ideas.push({
      title: 'KEV Exploitation Surge',
      text: `${V2.cves.kevCount} CVEs in CISA Known Exploited Vulnerabilities catalog. Prioritize patching — these are confirmed actively exploited in the wild.`,
      type: 'patch', confidence: 'High', horizon: 'immediate'
    });
  }

  const critWithEpss = V2.cves.recent.filter(c => c.cvss >= 9.0 && c.epss && c.epss > 0.5);
  if (critWithEpss.length > 0) {
    ideas.push({
      title: 'High CVSS + High EPSS Convergence',
      text: `${critWithEpss.length} CVEs with CVSS ≥ 9.0 AND EPSS > 50%. These represent the highest-risk vulnerabilities with both severity and exploitation likelihood.`,
      type: 'patch', confidence: 'High', horizon: 'immediate'
    });
  }

  if (V2.iocs.c2.length > 20) {
    ideas.push({
      title: 'C2 Infrastructure Expanding',
      text: `${V2.iocs.c2.length} active C2 endpoints tracked across Feodo/URLhaus. Block at network perimeter and hunt for beaconing patterns in internal traffic.`,
      type: 'block', confidence: 'Medium', horizon: 'tactical'
    });
  }

  if (V2.actors.totalVictims > 10) {
    const topGroup = V2.actors.ransomwareGroups[0];
    ideas.push({
      title: 'Ransomware Campaign Active',
      text: `${V2.actors.totalVictims} recent ransomware victims.${topGroup ? ` ${topGroup.name} leads with ${topGroup.victims} victims.` : ''} Review backup integrity and segment critical assets.`,
      type: 'alert', confidence: 'High', horizon: 'tactical'
    });
  }

  const topSectors = Object.entries(V2.actors.bySector || {}).sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, 3);
  if (topSectors.length > 0 && (topSectors[0]?.[1] || 0) > 3) {
    ideas.push({
      title: 'Sector Targeting Pattern Detected',
      text: `Top targeted sectors: ${topSectors.map(([s, c]) => `${s} (${c})`).join(', ')}. Organizations in these sectors should elevate monitoring.`,
      type: 'watch', confidence: 'Medium', horizon: 'tactical'
    });
  }

  if (V2.iocs.phishing.length > 15) {
    ideas.push({
      title: 'Phishing Wave Detected',
      text: `${V2.iocs.phishing.length} active phishing URLs tracked. Consider proactive URL filtering updates and user awareness reminders.`,
      type: 'block', confidence: 'Medium', horizon: 'tactical'
    });
  }

  if (V2.iocs.maliciousIPs.length > 30) {
    ideas.push({
      title: 'Malicious IP Surge',
      text: `${V2.iocs.maliciousIPs.length} malicious IPs reported across AbuseIPDB/GreyNoise/Spamhaus. Update blocklists and review firewall rules.`,
      type: 'block', confidence: 'Medium', horizon: 'tactical'
    });
  }

  if (V2.certAlerts.total > 10) {
    ideas.push({
      title: 'Multi-CERT Advisory Activity',
      text: `${V2.certAlerts.total} advisories across ${V2.certAlerts.items.map(i => `${i.label} (${i.count})`).join(', ')}. Cross-reference with internal asset inventory.`,
      type: 'watch', confidence: 'Medium', horizon: 'tactical'
    });
  }

  return ideas.slice(0, 10);
}

// === Synthesize raw sweep data into dashboard format ===
export async function synthesize(data) {
  const sourcesOk = data.crucix?.sourcesOk || 0;
  const sourcesInactive = data.crucix?.sourcesInactive || 0;
  const sourcesQueried = data.crucix?.sourcesQueried || 0;

  const threatInfo = computeThreatLevel(data);
  const cves = buildCVEList(data);
  const iocs = buildIOCs(data);
  const attackMatrix = buildAttackMatrix(data);
  const actors = buildActors(data);
  const geoAttacks = buildGeoAttacks(data);
  const certAlerts = buildCertAlerts(data);
  const securityNews = buildSecurityNewsList(data);
  const chinaIntel = buildChinaIntel(data);

  // Source health — grouped by domain
  const HEALTH_DOMAINS = [
    { domain: 'domain1', label: 'Vuln Intel',      sources: ['CISA-KEV','NVD','EPSS','GitHub-Advisory','ExploitDB','OSV','VulnCheck','CIRCL-CVE'] },
    { domain: 'domain2', label: 'Threat Actors',   sources: ['OTX','MalwareBazaar','ThreatFox','Feodo','ATT&CK-STIX','VirusTotal','URLhaus','Hybrid-Analysis','CIRCL-PDNS','Malpedia'] },
    { domain: 'domain3', label: 'Attack/Exposure', sources: ['GreyNoise','Shodan','Censys','AbuseIPDB','Cloudflare-Radar','Spamhaus','DShield','OpenPhish','Qianxin-Hunter','FOFA','ZoomEye'] },
    { domain: 'domain4', label: 'Event Tracking',  sources: ['Ransomware-Live','ENISA','CISA-Alerts','CERTs-Intl','Telegram','HackerNews-RSS','BleepingComputer','SecurityWeek','Tavily'] },
    { domain: 'domain5', label: 'China Intel',     sources: ['CNCERT','CNVD','CNNVD','Qianxin','FreeBuf','Anquanke','4hou','Qianxin-TI','Baidu-Search'] },
    { domain: 'domain6', label: 'Vendor Feeds',    sources: ['Vendors-Intl','Vendors-CN'] },
  ];

  const SOURCE_HOME_URLS = {
    // D1 - Vuln Intel
    'CISA-KEV':         'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
    'NVD':              'https://nvd.nist.gov/',
    'EPSS':             'https://www.first.org/epss/',
    'GitHub-Advisory':  'https://github.com/advisories',
    'ExploitDB':        'https://www.exploit-db.com/',
    'OSV':              'https://osv.dev/',
    'VulnCheck':        'https://vulncheck.com/',
    'CIRCL-CVE':        'https://cve.circl.lu/',
    // D2 - Threat Actors
    'OTX':              'https://otx.alienvault.com/',
    'MalwareBazaar':    'https://bazaar.abuse.ch/',
    'ThreatFox':        'https://threatfox.abuse.ch/',
    'Feodo':            'https://feodotracker.abuse.ch/',
    'ATT&CK-STIX':      'https://attack.mitre.org/',
    'VirusTotal':       'https://www.virustotal.com/',
    'URLhaus':          'https://urlhaus.abuse.ch/',
    'Hybrid-Analysis':  'https://www.hybrid-analysis.com/',
    'CIRCL-PDNS':       'https://www.circl.lu/services/passive-dns/',
    'Malpedia':         'https://malpedia.caad.fkie.fraunhofer.de/',
    // D3 - Attack/Exposure
    'GreyNoise':        'https://www.greynoise.io/',
    'Shodan':           'https://www.shodan.io/',
    'Censys':           'https://search.censys.io/',
    'AbuseIPDB':        'https://www.abuseipdb.com/',
    'Cloudflare-Radar': 'https://radar.cloudflare.com/',
    'Spamhaus':         'https://www.spamhaus.org/',
    'DShield':          'https://isc.sans.edu/',
    'OpenPhish':        'https://openphish.com/',
    'Qianxin-Hunter':   'https://hunter.how/',
    'FOFA':             'https://fofa.info/',
    'ZoomEye':          'https://www.zoomeye.org/',
    // D4 - Event Tracking
    'Ransomware-Live':  'https://ransomware.live/',
    'ENISA':            'https://www.enisa.europa.eu/',
    'CISA-Alerts':      'https://www.cisa.gov/news-events/alerts',
    'CERTs-Intl':       'https://www.first.org/members/',
    'Telegram':         'https://t.me/',
    'HackerNews-RSS':   'https://thehackernews.com/',
    'BleepingComputer': 'https://www.bleepingcomputer.com/',
    'SecurityWeek':     'https://www.securityweek.com/',
    'Tavily':           'https://tavily.com/',
    // D5 - China Intel
    'CNCERT':           'https://www.cert.org.cn/',
    'CNVD':             'https://www.cnvd.org.cn/',
    'CNNVD':            'https://www.cnnvd.org.cn/',
    'Qianxin':          'https://ti.qianxin.com/',
    'FreeBuf':          'https://www.freebuf.com/',
    'Anquanke':         'https://www.anquanke.com/',
    '4hou':             'https://www.4hou.com/',
    'Qianxin-TI':       'https://ti.qianxin.com/',
    'Baidu-Search':     'https://qianfan.cloud.baidu.com/',
    // D6 - Vendor Feeds
    'Vendors-Intl':     'https://www.crowdstrike.com/blog/',
    'Vendors-CN':       'https://cert.360.cn/',
  };

  const sourceEntries = Object.fromEntries(
    Object.entries(data.sources).map(([name, src]) => [name, {
      n: name,
      err: src.status !== 'active',
      reason: src.status !== 'active' ? (src.reason || 'unknown') : null,
      stale: Boolean(src.stale),
      url: SOURCE_HOME_URLS[name] || '',
    }])
  );

  const health = HEALTH_DOMAINS.map(({ domain, label, sources: domainSourceNames }) => ({
    domain,
    label,
    sources: domainSourceNames
      .filter(name => name in sourceEntries)
      .map(name => sourceEntries[name]),
  })).filter(d => d.sources.length > 0);

  // Telegram data for news feed
  const tgData = data.sources.Telegram || {};
  const tgUrgent = (tgData.urgentPosts || []).filter(p => isEnglish(p.text)).map(p => ({
    channel: p.channel, text: p.text?.substring(0, 200), views: p.views, date: p.date, urgentFlags: p.urgentFlags || []
  }));
  const tgTop = (tgData.topPosts || []).filter(p => isEnglish(p.text)).map(p => ({
    channel: p.channel, text: p.text?.substring(0, 200), views: p.views, date: p.date, urgentFlags: []
  }));

  // Fetch RSS
  const news = await fetchAllNews();

  // Enrich geoAttacks with news locations
  for (const n of news.slice(0, 20)) {
    if (n.lat && n.lon) {
      geoAttacks.push({
        lat: n.lat, lon: n.lon,
        type: n.source === 'CISA News' || n.source === 'US-CERT' ? 'cert' :
              n.title?.toLowerCase().includes('attack') || n.title?.toLowerCase().includes('breach') ? 'attack_source' : 'exposed_asset',
        label: `${n.source}: ${(n.title || '').substring(0, 50)}`,
        severity: n.source?.includes('CISA') || n.source?.includes('CERT') ? 'high' : 'medium',
        source: n.source,
      });
    }
  }

  const V2 = {
    meta: data.crucix,

    threats: {
      level: threatInfo.level,
      index: threatInfo.index,
      direction: threatInfo.direction,
      activeSources: sourcesOk,
      inactiveSources: sourcesInactive,
      totalSources: sourcesQueried,
    },

    cves,
    iocs,
    attackMatrix,
    actors,
    geoAttacks,
    certAlerts,
    securityNews,
    chinaIntel,

    health,
    news,
    newsFeed: buildSecurityNewsFeed(news, data, tgUrgent, tgTop),

    ideas: [],
    ideasSource: 'disabled',
  };

  return V2;
}

// === CLI Mode: inject into HTML file ===
function getCliArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

async function cliInject() {
  const data = JSON.parse(readFileSync(join(ROOT, 'runs/latest.json'), 'utf8'));
  const htmlOverride = getCliArg('--html');
  const shouldOpen = !process.argv.includes('--no-open');

  console.log('Fetching RSS news feeds...');
  const V2 = await synthesize(data);
  const llmProvider = createLLMProvider(config.llm);

  if (llmProvider?.isConfigured) {
    try {
      console.log(`[LLM] Generating ideas via ${llmProvider.name}...`);
      const llmIdeas = await generateLLMIdeas(llmProvider, V2, null, []);
      if (llmIdeas?.length) {
        V2.ideas = llmIdeas;
        V2.ideasSource = 'llm';
        console.log(`[LLM] Generated ${llmIdeas.length} ideas`);
      } else {
        V2.ideas = [];
        V2.ideasSource = 'llm-failed';
        console.log('[LLM] No ideas returned');
      }
    } catch (err) {
      V2.ideas = [];
      V2.ideasSource = 'llm-failed';
      console.log('[LLM] Idea generation failed:', err.message);
    }
  } else {
    V2.ideas = [];
    V2.ideasSource = 'disabled';
  }
  console.log(`Generated ${V2.ideas.length} leverageable ideas`);

  const json = JSON.stringify(V2);
  console.log('\n--- Synthesis ---');
  console.log('Size:', json.length, 'bytes | CVEs:', V2.cves.totalTracked, '| IOCs:', V2.iocs.total,
    '| GeoAttacks:', V2.geoAttacks.length, '| News:', V2.news.length, '| Ideas:', V2.ideas.length,
    '| Sources:', V2.health.length, '| Threat:', V2.threats.level, `(${V2.threats.index})`);

  const htmlPath = htmlOverride || join(ROOT, 'dashboard/public/jarvis.html');
  let html = readFileSync(htmlPath, 'utf8');
  html = html.replace(/^(let|const) D = .*;\s*$/m, () => 'let D = ' + json + ';');
  writeFileSync(htmlPath, html);
  console.log('Data injected into jarvis.html!');

  if (!shouldOpen) return;

  const openCmd = process.platform === 'win32' ? 'cmd /c start ""' :
                  process.platform === 'darwin' ? 'open' : 'xdg-open';
  const dashUrl = htmlPath.replace(/\\/g, '/');
  exec(`${openCmd} "${dashUrl}"`, (err) => {
    if (err) console.log('Could not auto-open browser:', err.message);
    else console.log('Dashboard opened in browser!');
  });
}

// Run CLI if invoked directly
const isMain = process.argv[1]
  && fileURLToPath(import.meta.url).replace(/\\/g, '/') === process.argv[1].replace(/\\/g, '/');
if (isMain) {
  await cliInject();
}
