// Watchlist Module — user-defined monitoring keywords, vendors, actors, IPs
// Skeleton for v0.1.0 — full CRUD + Delta integration in v1.0.0

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = join(__dirname, '..', '..', 'runs', 'watchlist.json');

const DEFAULT_WATCHLIST = {
  vendors: [],
  industries: [],
  actors: [],
  keywords: [],
  cveIds: [],
  ipRanges: [],
};

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
    return { ...DEFAULT_WATCHLIST };
  }

  _save() {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  get() {
    return { ...this.data };
  }

  /**
   * Check if an IOC value matches any watchlist entry.
   * Returns matched categories or empty array.
   */
  matchIOC(ioc) {
    const matches = [];
    if (!ioc) return matches;

    const value = (ioc.value || '').toLowerCase();

    for (const kw of this.data.keywords) {
      if (value.includes(kw.toLowerCase())) {
        matches.push({ category: 'keyword', match: kw });
      }
    }

    for (const actor of this.data.actors) {
      if (ioc.relatedActors?.some(a => a.toLowerCase().includes(actor.toLowerCase()))) {
        matches.push({ category: 'actor', match: actor });
      }
    }

    return matches;
  }

  /**
   * Check if a CVE matches any watchlist entry.
   */
  matchCVE(cve) {
    const matches = [];
    if (!cve) return matches;

    if (this.data.cveIds.includes(cve.id)) {
      matches.push({ category: 'cveId', match: cve.id });
    }

    for (const vendor of this.data.vendors) {
      if (cve.vendors?.some(v => v.toLowerCase().includes(vendor.toLowerCase()))) {
        matches.push({ category: 'vendor', match: vendor });
      }
    }

    return matches;
  }
}
