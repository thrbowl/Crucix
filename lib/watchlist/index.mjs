// Watchlist Module — user-defined monitoring keywords, vendors, actors, IPs
// Supports config-based watchlist + file-based persistence

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../../crucix.config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = join(__dirname, '..', '..', 'runs', 'watchlist.json');

const watchlist = config.watchlist || {};

export function getWatchlist() {
  return {
    vendors: watchlist.vendors || [],
    industries: watchlist.industries || [],
    actors: watchlist.actors || [],
    keywords: watchlist.keywords || [],
    cveIds: watchlist.cveIds || [],
    ipRanges: watchlist.ipRanges || [],
  };
}

export function matchIOC(ioc) {
  const matches = [];
  if (!ioc) return matches;
  const wl = getWatchlist();
  const value = (ioc.value || '').toLowerCase();

  // IP range matching
  if (ioc.type === 'ipv4' && wl.ipRanges.length > 0) {
    for (const range of wl.ipRanges) {
      if (ipInCIDR(value, range)) {
        matches.push({ type: 'ip_range', match: range });
      }
    }
  }

  // Keyword matching on tags and value
  for (const kw of wl.keywords) {
    const kwLower = kw.toLowerCase();
    if ((ioc.tags || []).some(t => t.toLowerCase().includes(kwLower)) ||
        value.includes(kwLower)) {
      matches.push({ type: 'keyword', match: kw });
    }
  }

  // Actor matching
  for (const actor of wl.actors) {
    if ((ioc.relatedActors || []).some(a => a.toLowerCase().includes(actor.toLowerCase()))) {
      matches.push({ type: 'actor', match: actor });
    }
  }

  return matches;
}

export function matchCVE(cve) {
  const matches = [];
  if (!cve) return matches;
  const wl = getWatchlist();
  const id = (cve.id || cve.cveId || '').toUpperCase();

  // Direct CVE ID match
  if (wl.cveIds.some(c => c.toUpperCase() === id)) {
    matches.push({ type: 'cve_id', match: id });
  }

  // Vendor matching
  for (const vendor of wl.vendors) {
    const vLower = vendor.toLowerCase();
    if ((cve.vendors || []).some(v => v.toLowerCase().includes(vLower)) ||
        (cve.description || '').toLowerCase().includes(vLower) ||
        (cve.products || []).some(p => p.toLowerCase().includes(vLower))) {
      matches.push({ type: 'vendor', match: vendor });
    }
  }

  // Industry matching
  for (const industry of wl.industries) {
    if ((cve.industries || []).some(i => i.toLowerCase().includes(industry.toLowerCase()))) {
      matches.push({ type: 'industry', match: industry });
    }
  }

  // Keyword matching on description
  for (const kw of wl.keywords) {
    if ((cve.description || '').toLowerCase().includes(kw.toLowerCase())) {
      matches.push({ type: 'keyword', match: kw });
    }
  }

  return matches;
}

function ipInCIDR(ip, cidr) {
  try {
    const [range, bits] = cidr.split('/');
    if (!bits) return ip === range;
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);
    const ipNum = ipToNum(ip);
    const rangeNum = ipToNum(range);
    return (ipNum & mask) === (rangeNum & mask);
  } catch {
    return false;
  }
}

function ipToNum(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0) >>> 0;
}

export function filterByWatchlist(iocs, cves) {
  const matchedIOCs = (iocs || []).filter(ioc => matchIOC(ioc).length > 0);
  const matchedCVEs = (cves || []).filter(cve => matchCVE(cve).length > 0);
  return { matchedIOCs, matchedCVEs };
}

// File-based Watchlist class for CRUD persistence (backward compat)
export class Watchlist {
  constructor(filePath = DEFAULT_PATH) {
    this.filePath = filePath;
    this.data = this._load();
  }

  _load() {
    try {
      if (existsSync(this.filePath)) {
        return JSON.parse(readFileSync(this.filePath, 'utf8'));
      }
    } catch { /* use defaults */ }
    return { ...getWatchlist() };
  }

  _save() {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  get() {
    return { ...this.data };
  }

  matchIOC(ioc) {
    return matchIOC(ioc);
  }

  matchCVE(cve) {
    return matchCVE(cve);
  }
}
