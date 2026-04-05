// Delta Engine v3 — Cybersecurity Three-Layer Signal Model
// Layer 1: Atomic signals from individual sources
// Layer 2: Cross-correlation rules combining multiple sources
// Layer 3: Trend analysis with sliding windows

import { createHash } from 'crypto';

// ─── Layer 1: Atomic Signal Definitions ─────────────────────────────────────
// Each extractor pulls a metric from the raw sweep data (data.sources.XXX)

const ATOMIC_SIGNALS = [
  // Vulnerability Intelligence
  {
    key: 'new_critical_cves', label: 'New Critical CVEs (CVSS≥9.0)',
    extract: d => (d['NVD']?.recentCVEs || []).filter(c => (c.cvssScore || c.cvss || 0) >= 9.0).length,
    defaultLevel: 'HIGH', threshold: 1,
  },
  {
    key: 'new_kev_entries', label: 'New KEV Entries',
    extract: d => d['CISA-KEV']?.newEntries || d['CISA-KEV']?.recentAdditions?.length || 0,
    defaultLevel: 'CRITICAL', threshold: 1,
  },
  {
    key: 'epss_spike', label: 'EPSS Score Spikes (>0.5)',
    extract: d => (d['EPSS']?.highRisk || []).length,
    defaultLevel: 'HIGH', threshold: 1,
  },
  {
    key: 'poc_published', label: 'New PoC/Exploit Published',
    extract: d => (d['ExploitDB']?.recentExploits?.length || 0) + (d['GitHub-Advisory']?.advisories?.length || 0),
    defaultLevel: 'MEDIUM', threshold: 3,
  },
  {
    key: 'osv_critical', label: 'OSV Critical Advisories',
    extract: d => d['OSV']?.totalAdvisories || 0,
    defaultLevel: 'MEDIUM', threshold: 5,
  },

  // Threat Actors & Malware
  {
    key: 'new_malware_samples', label: 'New Malware Samples',
    extract: d => (d['MalwareBazaar']?.recentSamples?.length || 0) + (d['ThreatFox']?.recentIOCs?.length || 0),
    defaultLevel: 'MEDIUM', threshold: 10,
  },
  {
    key: 'active_c2', label: 'Active C2 Infrastructure',
    extract: d => (d['Feodo']?.activeC2s?.length || d['Feodo']?.onlineC2Count || 0) + (d['URLhaus']?.activeUrls?.length || d['URLhaus']?.onlineCount || 0),
    defaultLevel: 'HIGH', threshold: 5,
  },
  {
    key: 'apt_techniques', label: 'ATT&CK Techniques Observed',
    extract: d => d['ATT&CK-STIX']?.totalTechniques || 0,
    defaultLevel: 'LOW', threshold: 0, // informational
  },

  // Attack Activity & Exposure
  {
    key: 'mass_scanning', label: 'Mass Scanning Activity',
    extract: d => {
      const gn = d['GreyNoise']?.topScanners?.length || d['GreyNoise']?.maliciousCount || 0;
      const sh = d['Shodan']?.totalResults || 0;
      return gn + (sh > 1000 ? 1 : 0);
    },
    defaultLevel: 'MEDIUM', threshold: 5,
  },
  {
    key: 'ip_reputation_alerts', label: 'IP Reputation Alerts',
    extract: d => (d['AbuseIPDB']?.reportedIPs?.length || 0) + (d['Spamhaus']?.totalEntries || 0),
    defaultLevel: 'MEDIUM', threshold: 10,
  },

  // Event Tracking
  {
    key: 'ransomware_victims', label: 'New Ransomware Victims',
    extract: d => d['Ransomware-Live']?.totalRecentVictims || d['Ransomware-Live']?.victims?.length || 0,
    defaultLevel: 'HIGH', threshold: 2,
  },
  {
    key: 'cert_advisories', label: 'CERT Advisories Published',
    extract: d => (d['CISA-Alerts']?.totalAlerts || 0) + (d['ENISA']?.totalReports || 0) + (d['CERTs-Intl']?.totalAlerts || 0),
    defaultLevel: 'MEDIUM', threshold: 3,
  },

  // China Intelligence
  {
    key: 'china_alerts', label: 'China Threat Alerts',
    extract: d => (d['CNCERT']?.totalAlerts || 0) + (d['CNVD']?.recentVulns?.length || 0) + (d['CNNVD']?.recentVulns?.length || 0),
    defaultLevel: 'MEDIUM', threshold: 3,
  },

  // Source Health
  {
    key: 'sources_ok', label: 'Active Sources',
    extract: (d, meta) => meta?.sourcesOk || 0,
    defaultLevel: 'LOW', threshold: 0,
    invertDirection: true,
  },
];

// ─── Layer 2: Cross-Correlation Rules ───────────────────────────────────────

const CORRELATION_RULES = [
  {
    id: 'vuln_weaponization',
    name: 'Vulnerability Weaponization Alert',
    description: 'CVE with high CVSS + PoC published + active scanning detected',
    level: 'CRITICAL',
    check: (sources) => {
      const hasHighCVE = (sources['NVD']?.recentCVEs || []).some(c => (c.cvssScore || c.cvss || 0) >= 9.0);
      const hasKEV = (sources['CISA-KEV']?.newEntries || sources['CISA-KEV']?.recentAdditions?.length || 0) > 0;
      const hasPoc = (sources['ExploitDB']?.recentExploits?.length || 0) > 0;
      const hasScanning = (sources['GreyNoise']?.maliciousCount || sources['GreyNoise']?.topScanners?.length || 0) > 0;
      const triggered = (hasHighCVE || hasKEV) && (hasPoc || hasScanning);
      return {
        triggered,
        evidence: triggered ? [
          hasHighCVE && 'Critical CVE detected (CVSS≥9.0)',
          hasKEV && 'CVE in CISA KEV',
          hasPoc && 'PoC/exploit published',
          hasScanning && 'Active scanning detected',
        ].filter(Boolean) : [],
      };
    },
  },
  {
    id: 'targeted_infrastructure',
    name: 'Targeted Attack Infrastructure',
    description: 'AbuseIPDB + ThreatFox IOC + GreyNoise + Watchlist IP overlap',
    level: 'HIGH',
    check: (sources) => {
      const abuseIPs = (sources['AbuseIPDB']?.reportedIPs?.length || 0) > 0;
      const threatfoxIOCs = (sources['ThreatFox']?.recentIOCs?.length || 0) > 0;
      const feodoC2 = (sources['Feodo']?.activeC2s?.length || sources['Feodo']?.onlineC2Count || 0) > 3;
      const triggered = abuseIPs && (threatfoxIOCs || feodoC2);
      return {
        triggered,
        evidence: triggered ? [
          abuseIPs && 'Malicious IPs in AbuseIPDB',
          threatfoxIOCs && 'IOCs in ThreatFox',
          feodoC2 && 'Active C2 infrastructure detected',
        ].filter(Boolean) : [],
      };
    },
  },
  {
    id: 'supply_chain_attack',
    name: 'Supply Chain Attack Indicator',
    description: 'GitHub Advisory + OSV + security news coverage',
    level: 'HIGH',
    check: (sources) => {
      const ghAdvisories = (sources['GitHub-Advisory']?.advisories?.length || 0) > 2;
      const osvAlerts = (sources['OSV']?.totalAdvisories || 0) > 5;
      const newsKeywords = ['supply chain', 'dependency', 'npm', 'pypi', 'backdoor'];
      const hasNewsCoverage = [
        ...(sources['FreeBuf']?.recentArticles || []),
        ...(sources['Anquanke']?.recentArticles || []),
        ...(sources['4hou']?.recentArticles || []),
      ].some(a => newsKeywords.some(kw => (a.title || '').toLowerCase().includes(kw)));
      const triggered = ghAdvisories && (osvAlerts || hasNewsCoverage);
      return {
        triggered,
        evidence: triggered ? [
          ghAdvisories && 'Multiple GitHub advisories',
          osvAlerts && 'OSV advisories elevated',
          hasNewsCoverage && 'Supply chain keywords in security news',
        ].filter(Boolean) : [],
      };
    },
  },
  {
    id: 'china_high_confidence',
    name: 'China High-Confidence Threat',
    description: 'CNCERT + CNVD/CNNVD + ThreatBook/Qianxin cross-confirmation',
    level: 'CRITICAL',
    check: (sources) => {
      const cncert = (sources['CNCERT']?.totalAlerts || 0) > 0;
      const cnvd = (sources['CNVD']?.recentVulns?.length || 0) > 0;
      const cnnvd = (sources['CNNVD']?.recentVulns?.length || 0) > 0;
      const threatbook = sources['ThreatBook']?.status === 'ok' || (sources['ThreatBook']?.data && !sources['ThreatBook']?.error);
      const qianxin = (sources['Qianxin']?.recentThreats?.length || 0) > 0;
      const triggered = cncert && (cnvd || cnnvd) && (threatbook || qianxin);
      return {
        triggered,
        evidence: triggered ? [
          cncert && 'CNCERT alert active',
          cnvd && 'CNVD vulnerability reported',
          cnnvd && 'CNNVD vulnerability reported',
          threatbook && 'ThreatBook intelligence confirms',
          qianxin && 'Qianxin intelligence confirms',
        ].filter(Boolean) : [],
      };
    },
  },
];

// ─── Signal Level Hierarchy ─────────────────────────────────────────────────

const LEVEL_PRIORITY = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };

function levelPriority(level) {
  return LEVEL_PRIORITY[level] || 0;
}

// ─── Layer 3: Trend Window (placeholder for hot memory integration) ─────────

function detectTrendAnomalies(currentValues, history) {
  if (!history || history.length < 2) return [];
  const anomalies = [];

  for (const [key, currentVal] of Object.entries(currentValues)) {
    const historicalVals = history.map(h => h[key]).filter(v => v != null);
    if (historicalVals.length < 2) continue;

    const avg = historicalVals.reduce((s, v) => s + v, 0) / historicalVals.length;
    const stddev = Math.sqrt(historicalVals.reduce((s, v) => s + (v - avg) ** 2, 0) / historicalVals.length);

    if (stddev === 0) continue;
    const zScore = (currentVal - avg) / stddev;

    if (Math.abs(zScore) >= 2.0) {
      anomalies.push({
        key,
        type: 'trend_anomaly',
        direction: zScore > 0 ? 'spike' : 'drop',
        zScore: parseFloat(zScore.toFixed(2)),
        current: currentVal,
        avg: parseFloat(avg.toFixed(2)),
        stddev: parseFloat(stddev.toFixed(2)),
        level: Math.abs(zScore) >= 3.0 ? 'HIGH' : 'MEDIUM',
      });
    }
  }

  return anomalies;
}

// ─── Core Delta Computation ─────────────────────────────────────────────────

/**
 * @param {object} currentSources - current sweep's raw source data (data.sources)
 * @param {object|null} previousSources - previous sweep's raw source data
 * @param {object} meta - { sourcesOk, sourcesQueried, timestamp }
 * @param {object|null} prevMeta - previous meta
 * @param {Array} trendHistory - array of past metric snapshots for Layer 3
 */
export function computeDelta(currentSources, previousSources, meta = {}, prevMeta = {}, trendHistory = []) {
  if (!currentSources) return null;

  const signals = {
    atomic: [],      // Layer 1
    correlated: [],  // Layer 2
    trend: [],       // Layer 3
  };

  // ─── Layer 1: Atomic Signals ──────────────────────────────────────────

  const currentMetrics = {};
  const previousMetrics = {};

  for (const def of ATOMIC_SIGNALS) {
    const curr = def.extract(currentSources, meta);
    const prev = previousSources ? def.extract(previousSources, prevMeta) : null;
    currentMetrics[def.key] = curr;
    if (prev != null) previousMetrics[def.key] = prev;

    const diff = prev != null ? curr - prev : curr;
    const direction = def.invertDirection
      ? (diff < 0 ? 'escalated' : diff > 0 ? 'deescalated' : 'stable')
      : (diff > 0 ? 'escalated' : diff < 0 ? 'deescalated' : 'stable');

    const isNew = prev == null;
    const exceedsThreshold = Math.abs(diff) >= def.threshold;

    if (isNew && curr > 0 || exceedsThreshold) {
      const severity = Math.abs(diff) >= def.threshold * 5 ? 'CRITICAL'
        : Math.abs(diff) >= def.threshold * 3 ? 'HIGH'
        : def.defaultLevel;

      signals.atomic.push({
        key: def.key,
        label: def.label,
        current: curr,
        previous: prev,
        diff,
        direction,
        level: severity,
        isFirstRun: isNew,
      });
    }
  }

  // ─── Layer 2: Cross-Correlation ───────────────────────────────────────

  for (const rule of CORRELATION_RULES) {
    try {
      const result = rule.check(currentSources);
      if (result.triggered) {
        signals.correlated.push({
          id: rule.id,
          name: rule.name,
          description: rule.description,
          level: rule.level,
          evidence: result.evidence,
        });
      }
    } catch (e) {
      // Graceful — rule evaluation failure shouldn't break the engine
    }
  }

  // ─── Layer 3: Trend Analysis ──────────────────────────────────────────

  if (trendHistory.length >= 2) {
    signals.trend = detectTrendAnomalies(currentMetrics, trendHistory);
  }

  // ─── Compute Overall Threat Level ─────────────────────────────────────

  const allLevels = [
    ...signals.atomic.map(s => s.level),
    ...signals.correlated.map(s => s.level),
    ...signals.trend.map(s => s.level),
  ];

  const hasCritical = allLevels.includes('CRITICAL');
  const hasHigh = allLevels.includes('HIGH');
  const hasMedium = allLevels.includes('MEDIUM');

  const overallLevel = hasCritical ? 'CRITICAL'
    : hasHigh ? 'HIGH'
    : hasMedium ? 'MEDIUM'
    : 'LOW';

  // Threat index: 0-100 score
  const threatIndex = Math.min(100, Math.round(
    (allLevels.filter(l => l === 'CRITICAL').length * 25) +
    (allLevels.filter(l => l === 'HIGH').length * 15) +
    (allLevels.filter(l => l === 'MEDIUM').length * 8) +
    (allLevels.filter(l => l === 'LOW').length * 2) +
    (signals.correlated.length * 20)
  ));

  // Direction
  const escalated = signals.atomic.filter(s => s.direction === 'escalated').length;
  const deescalated = signals.atomic.filter(s => s.direction === 'deescalated').length;
  const direction = escalated > deescalated + 2 ? 'worsening'
    : deescalated > escalated + 2 ? 'improving'
    : 'stable';

  return {
    timestamp: meta?.timestamp || new Date().toISOString(),
    previousTimestamp: prevMeta?.timestamp || null,
    overallLevel,
    threatIndex,
    direction,
    signals,
    summary: {
      totalSignals: signals.atomic.length + signals.correlated.length + signals.trend.length,
      atomicCount: signals.atomic.length,
      correlatedCount: signals.correlated.length,
      trendCount: signals.trend.length,
      criticalCount: allLevels.filter(l => l === 'CRITICAL').length,
      highCount: allLevels.filter(l => l === 'HIGH').length,
      mediumCount: allLevels.filter(l => l === 'MEDIUM').length,
      lowCount: allLevels.filter(l => l === 'LOW').length,
      direction,
    },
    metrics: currentMetrics,
  };
}

export { ATOMIC_SIGNALS, CORRELATION_RULES, LEVEL_PRIORITY };
