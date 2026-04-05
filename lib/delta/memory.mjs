// Memory Manager v3 — Cybersecurity IOC/CVE state tracking
// Hot memory: recent sweeps, alert tracking, CVE lifecycle, IOC dedup
// Cold storage: archived runs for trend analysis

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from 'fs';
import { join } from 'path';
import { computeDelta } from './engine.mjs';

const MAX_HOT_RUNS = 5;
const ALERT_DECAY_TIERS = [0, 6, 12, 24]; // hours

export class MemoryManager {
  constructor(runsDir) {
    this.runsDir = runsDir;
    this.memoryDir = join(runsDir, 'memory');
    this.hotPath = join(this.memoryDir, 'hot.json');
    this.coldDir = join(this.memoryDir, 'cold');

    for (const dir of [this.memoryDir, this.coldDir]) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }

    this.hot = this._loadHot();
  }

  _loadHot() {
    for (const path of [this.hotPath, this.hotPath + '.bak']) {
      try {
        const raw = readFileSync(path, 'utf8');
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.runs) && typeof data.alertedSignals === 'object') {
          // Ensure new fields exist
          data.cveTracker = data.cveTracker || {};
          data.iocTracker = data.iocTracker || {};
          data.metricHistory = data.metricHistory || [];
          return data;
        }
      } catch { /* try next */ }
    }
    console.warn('[Memory] No valid hot memory found — starting fresh');
    return { runs: [], alertedSignals: {}, cveTracker: {}, iocTracker: {}, metricHistory: [] };
  }

  _saveHot() {
    const tmpPath = this.hotPath + '.tmp';
    const bakPath = this.hotPath + '.bak';
    try {
      writeFileSync(tmpPath, JSON.stringify(this.hot, null, 2));
      try {
        if (existsSync(this.hotPath)) renameSync(this.hotPath, bakPath);
      } catch { }
      renameSync(tmpPath, this.hotPath);
    } catch (err) {
      console.error('[Memory] Failed to save hot memory:', err.message);
      try { unlinkSync(tmpPath); } catch { }
    }
  }

  // Add a new sweep run and compute delta
  addRun(sweepData) {
    const sources = sweepData.sources || {};
    const meta = sweepData.crucix || {};
    const previousRun = this.getLastRun();
    const prevSources = previousRun?.sources || null;
    const prevMeta = previousRun?.meta || null;

    const delta = computeDelta(sources, prevSources, meta, prevMeta, this.hot.metricHistory);

    // Store metrics for trend analysis
    if (delta?.metrics) {
      this.hot.metricHistory.push({ ...delta.metrics, timestamp: meta.timestamp || new Date().toISOString() });
      // Keep last 30 data points
      if (this.hot.metricHistory.length > 30) {
        this.hot.metricHistory = this.hot.metricHistory.slice(-30);
      }
    }

    // Track CVE lifecycle
    this._updateCVETracker(sources);

    // Track IOC dedup
    this._updateIOCTracker(sources);

    const compact = this._compactForStorage(sweepData);
    this.hot.runs.unshift({
      timestamp: meta.timestamp || new Date().toISOString(),
      data: compact,
      delta,
    });

    if (this.hot.runs.length > MAX_HOT_RUNS) {
      const archived = this.hot.runs.splice(MAX_HOT_RUNS);
      this._archiveToCold(archived);
    }

    this._saveHot();
    return delta;
  }

  getLastRun() {
    if (this.hot.runs.length === 0) return null;
    return this.hot.runs[0].data;
  }

  getRunHistory(n = 5) {
    return this.hot.runs.slice(0, n);
  }

  getLastDelta() {
    if (this.hot.runs.length === 0) return null;
    return this.hot.runs[0].delta;
  }

  getMetricHistory() {
    return this.hot.metricHistory;
  }

  // ─── CVE Lifecycle Tracking ───────────────────────────────────────────────

  _updateCVETracker(sources) {
    const now = new Date().toISOString();
    const tracker = this.hot.cveTracker;

    // NVD — new CVEs
    for (const cve of (sources['NVD']?.recentCVEs || [])) {
      const id = cve.cveId || cve.id;
      if (!id) continue;
      if (!tracker[id]) {
        tracker[id] = { firstSeen: now, stages: ['discovered'], cvss: cve.cvssScore || cve.cvss || null };
      }
    }

    // CISA KEV — exploited in the wild
    for (const entry of (sources['CISA-KEV']?.recentAdditions || sources['CISA-KEV']?.vulnerabilities || [])) {
      const id = entry.cveID || entry.cveId || entry.id;
      if (!id) continue;
      if (!tracker[id]) tracker[id] = { firstSeen: now, stages: [] };
      if (!tracker[id].stages.includes('kev')) {
        tracker[id].stages.push('kev');
        tracker[id].kevDate = now;
      }
    }

    // ExploitDB / GitHub Advisory — PoC available
    for (const exploit of (sources['ExploitDB']?.recentExploits || [])) {
      const cveRefs = exploit.cves || [];
      for (const id of cveRefs) {
        if (!tracker[id]) tracker[id] = { firstSeen: now, stages: [] };
        if (!tracker[id].stages.includes('poc')) {
          tracker[id].stages.push('poc');
          tracker[id].pocDate = now;
        }
      }
    }

    // Prune tracker entries older than 90 days
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    for (const [id, entry] of Object.entries(tracker)) {
      if (new Date(entry.firstSeen).getTime() < cutoff) {
        delete tracker[id];
      }
    }
  }

  getCVETracker() {
    return this.hot.cveTracker;
  }

  getCVELifecycle(cveId) {
    return this.hot.cveTracker[cveId] || null;
  }

  // ─── IOC Dedup Tracking ───────────────────────────────────────────────────

  _updateIOCTracker(sources) {
    const now = new Date().toISOString();
    const tracker = this.hot.iocTracker;

    const iocSources = [
      { name: 'ThreatFox', data: sources['ThreatFox']?.recentIOCs || [] },
      { name: 'URLhaus', data: sources['URLhaus']?.activeUrls || [] },
      { name: 'Feodo', data: sources['Feodo']?.activeC2s || [] },
      { name: 'AbuseIPDB', data: sources['AbuseIPDB']?.reportedIPs || [] },
    ];

    for (const src of iocSources) {
      for (const ioc of src.data) {
        const value = ioc.value || ioc.ip || ioc.url || ioc.host || '';
        if (!value) continue;
        const key = `${src.name}:${value}`;
        if (!tracker[key]) {
          tracker[key] = { firstSeen: now, source: src.name, value, seenCount: 1 };
        } else {
          tracker[key].seenCount++;
          tracker[key].lastSeen = now;
        }
      }
    }

    // Prune IOC entries older than 30 days
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const [key, entry] of Object.entries(tracker)) {
      if (new Date(entry.firstSeen).getTime() < cutoff) {
        delete tracker[key];
      }
    }
  }

  isIOCKnown(source, value) {
    return !!this.hot.iocTracker[`${source}:${value}`];
  }

  getNewIOCs(source, values) {
    return values.filter(v => !this.isIOCKnown(source, v));
  }

  // ─── Alert Signal Tracking (Decay-Based) ─────────────────────────────────

  getAlertedSignals() {
    return this.hot.alertedSignals || {};
  }

  isSignalSuppressed(signalKey) {
    const entry = this.hot.alertedSignals[signalKey];
    if (!entry) return false;

    const now = Date.now();
    const occurrences = typeof entry === 'object' ? (entry.count || 1) : 1;
    const lastAlerted = typeof entry === 'object' ? new Date(entry.lastAlerted).getTime() : new Date(entry).getTime();
    const tierIndex = Math.min(occurrences, ALERT_DECAY_TIERS.length - 1);
    const cooldownMs = ALERT_DECAY_TIERS[tierIndex] * 60 * 60 * 1000;

    return (now - lastAlerted) < cooldownMs;
  }

  markAsAlerted(signalKey, timestamp) {
    const now = timestamp || new Date().toISOString();
    const existing = this.hot.alertedSignals[signalKey];

    if (existing && typeof existing === 'object') {
      existing.count = (existing.count || 1) + 1;
      existing.lastAlerted = now;
      existing.firstSeen = existing.firstSeen || now;
    } else {
      this.hot.alertedSignals[signalKey] = {
        firstSeen: typeof existing === 'string' ? existing : now,
        lastAlerted: now,
        count: typeof existing === 'string' ? 2 : 1,
      };
    }
    this._saveHot();
  }

  pruneAlertedSignals() {
    const now = Date.now();
    for (const [key, entry] of Object.entries(this.hot.alertedSignals)) {
      let lastTime, count;
      if (typeof entry === 'object') {
        lastTime = new Date(entry.lastAlerted).getTime();
        count = entry.count || 1;
      } else {
        lastTime = new Date(entry).getTime();
        count = 1;
      }
      const maxAge = count >= 2 ? 48 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      if ((now - lastTime) > maxAge) delete this.hot.alertedSignals[key];
    }
    this._saveHot();
  }

  // ─── Compact Storage ──────────────────────────────────────────────────────

  _compactForStorage(sweepData) {
    const sources = sweepData.sources || {};
    const meta = sweepData.crucix || {};
    return {
      meta: {
        timestamp: meta.timestamp,
        sourcesOk: meta.sourcesOk,
        sourcesQueried: meta.sourcesQueried,
      },
      sources: Object.fromEntries(
        Object.entries(sources).map(([name, data]) => {
          // Keep only summary fields, strip large arrays
          const compact = { source: data.source || name, timestamp: data.timestamp };
          if (data.signals) compact.signals = data.signals;
          if (data.totalRecentVictims != null) compact.totalRecentVictims = data.totalRecentVictims;
          if (data.recentCVEs) compact.cveCount = data.recentCVEs.length;
          if (data.recentExploits) compact.exploitCount = data.recentExploits.length;
          if (data.totalAlerts != null) compact.totalAlerts = data.totalAlerts;
          if (data.activeC2s) compact.c2Count = data.activeC2s.length;
          if (data.onlineC2Count != null) compact.onlineC2Count = data.onlineC2Count;
          if (data.recentSamples) compact.sampleCount = data.recentSamples.length;
          if (data.recentIOCs) compact.iocCount = data.recentIOCs.length;
          if (data.totalResults != null) compact.totalResults = data.totalResults;
          if (data.reportedIPs) compact.reportedIPCount = data.reportedIPs.length;
          return [name, compact];
        })
      ),
    };
  }

  _archiveToCold(runs) {
    if (runs.length === 0) return;
    const dateKey = new Date().toISOString().split('T')[0];
    const coldPath = join(this.coldDir, `${dateKey}.json`);

    let existing = [];
    try { existing = JSON.parse(readFileSync(coldPath, 'utf8')); } catch { }
    existing.push(...runs);

    const tmpPath = coldPath + '.tmp';
    try {
      writeFileSync(tmpPath, JSON.stringify(existing, null, 2));
      renameSync(tmpPath, coldPath);
    } catch (err) {
      console.error('[Memory] Failed to archive to cold storage:', err.message);
      try { unlinkSync(tmpPath); } catch { }
    }
  }
}
