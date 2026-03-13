// Memory Manager — hot/cold storage for sweep history and alert tracking

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { computeDelta } from './engine.mjs';

const MAX_HOT_RUNS = 3;

export class MemoryManager {
  constructor(runsDir) {
    this.runsDir = runsDir;
    this.memoryDir = join(runsDir, 'memory');
    this.hotPath = join(this.memoryDir, 'hot.json');
    this.coldDir = join(this.memoryDir, 'cold');

    // Ensure dirs exist
    for (const dir of [this.memoryDir, this.coldDir]) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }

    // Load hot memory from disk
    this.hot = this._loadHot();
  }

  _loadHot() {
    try {
      return JSON.parse(readFileSync(this.hotPath, 'utf8'));
    } catch {
      return { runs: [], alertedSignals: {} };
    }
  }

  _saveHot() {
    try {
      writeFileSync(this.hotPath, JSON.stringify(this.hot, null, 2));
    } catch (err) {
      console.error('[Memory] Failed to save hot memory:', err.message);
    }
  }

  // Add a new run to hot memory
  addRun(synthesizedData) {
    const previous = this.getLastRun();
    const delta = computeDelta(synthesizedData, previous);

    // Compact the data for storage (strip large arrays)
    const compact = this._compactForStorage(synthesizedData);

    this.hot.runs.unshift({
      timestamp: synthesizedData.meta?.timestamp || new Date().toISOString(),
      data: compact,
      delta,
    });

    // Keep only MAX_HOT_RUNS
    if (this.hot.runs.length > MAX_HOT_RUNS) {
      const archived = this.hot.runs.splice(MAX_HOT_RUNS);
      this._archiveToCold(archived);
    }

    this._saveHot();
    return delta;
  }

  // Get last run's synthesized data
  getLastRun() {
    if (this.hot.runs.length === 0) return null;
    return this.hot.runs[0].data;
  }

  // Get last N runs
  getRunHistory(n = 3) {
    return this.hot.runs.slice(0, n);
  }

  // Get the delta from the most recent run
  getLastDelta() {
    if (this.hot.runs.length === 0) return null;
    return this.hot.runs[0].delta;
  }

  // Track what signals have been alerted on
  getAlertedSignals() {
    return this.hot.alertedSignals || {};
  }

  markAsAlerted(signalKey, timestamp) {
    this.hot.alertedSignals[signalKey] = timestamp || new Date().toISOString();
    this._saveHot();
  }

  // Clean up old alerted signals (older than 24h)
  pruneAlertedSignals() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [key, ts] of Object.entries(this.hot.alertedSignals)) {
      if (new Date(ts).getTime() < cutoff) {
        delete this.hot.alertedSignals[key];
      }
    }
    this._saveHot();
  }

  // Compact data for storage — strip heavy arrays
  _compactForStorage(data) {
    return {
      meta: data.meta,
      fred: data.fred,
      energy: data.energy,
      bls: data.bls,
      treasury: data.treasury,
      gscpi: data.gscpi,
      tg: { posts: data.tg?.posts, urgent: (data.tg?.urgent || []).map(p => ({ text: p.text?.substring(0, 80), date: p.date })) },
      thermal: (data.thermal || []).map(t => ({ region: t.region, det: t.det, night: t.night, hc: t.hc })),
      air: (data.air || []).map(a => ({ region: a.region, total: a.total })),
      nuke: (data.nuke || []).map(n => ({ site: n.site, anom: n.anom, cpm: n.cpm })),
      who: (data.who || []).map(w => ({ title: w.title })),
      acled: { totalEvents: data.acled?.totalEvents, totalFatalities: data.acled?.totalFatalities },
      sdr: { total: data.sdr?.total, online: data.sdr?.online },
      ideas: (data.ideas || []).map(i => ({ title: i.title, type: i.type, confidence: i.confidence })),
    };
  }

  // Archive old runs to cold storage
  _archiveToCold(runs) {
    if (runs.length === 0) return;
    const dateKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const coldPath = join(this.coldDir, `${dateKey}.json`);

    let existing = [];
    try { existing = JSON.parse(readFileSync(coldPath, 'utf8')); } catch { }

    existing.push(...runs);
    try {
      writeFileSync(coldPath, JSON.stringify(existing, null, 2));
    } catch (err) {
      console.error('[Memory] Failed to archive to cold storage:', err.message);
    }
  }
}
