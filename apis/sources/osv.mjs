import { safeFetch } from '../utils/fetch.mjs';

const BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const VULN_URL = 'https://api.osv.dev/v1/vulns';

const PACKAGES = [
  { ecosystem: 'npm', name: 'express' },
  { ecosystem: 'npm', name: 'lodash' },
  { ecosystem: 'npm', name: 'axios' },
  { ecosystem: 'npm', name: 'next' },
  { ecosystem: 'npm', name: 'webpack' },
  { ecosystem: 'PyPI', name: 'django' },
  { ecosystem: 'PyPI', name: 'flask' },
  { ecosystem: 'PyPI', name: 'requests' },
  { ecosystem: 'PyPI', name: 'numpy' },
  { ecosystem: 'Go', name: 'stdlib' },
];

async function postJSON(url, body) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Crucix/1.0' },
      body: JSON.stringify(body),
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

async function fetchVulnDetails(id) {
  const data = await safeFetch(`${VULN_URL}/${id}`, { timeout: 20000 });
  if (data.error) return null;
  return {
    id: data.id,
    summary: (data.summary || '').substring(0, 200),
    severity: data.database_specific?.severity || data.severity?.[0]?.type || null,
    published: data.published,
    ecosystems: [...new Set((data.affected || []).map(a => a.package?.ecosystem).filter(Boolean))],
  };
}

export async function briefing() {
  const queries = PACKAGES.map(pkg => ({ package: pkg }));
  const batchResult = await postJSON(BATCH_URL, { queries });

  if (batchResult.error) {
    return { source: 'OSV', timestamp: new Date().toISOString(), error: batchResult.error };
  }

  const results = batchResult.results || [];
  const vulnIds = new Set();
  const packageHits = [];

  results.forEach((r, i) => {
    const vulns = r.vulns || [];
    if (vulns.length > 0) {
      packageHits.push({
        package: PACKAGES[i].name,
        ecosystem: PACKAGES[i].ecosystem,
        vulnCount: vulns.length,
      });
      for (const v of vulns.slice(0, 3)) {
        if (v.id) vulnIds.add(v.id);
      }
    }
  });

  const detailIds = [...vulnIds].slice(0, 15);
  const details = (await Promise.all(detailIds.map(fetchVulnDetails))).filter(Boolean);

  const signals = [];
  if (packageHits.length > 5) {
    signals.push({
      severity: 'high',
      signal: `${packageHits.length}/${PACKAGES.length} monitored packages have known vulnerabilities`,
    });
  }
  const criticalVulns = details.filter(d => d.severity === 'CRITICAL' || d.severity === 'critical');
  if (criticalVulns.length > 0) {
    signals.push({
      severity: 'critical',
      signal: `${criticalVulns.length} critical OSV vulnerabilities found in monitored packages`,
    });
  }

  return {
    source: 'OSV',
    timestamp: new Date().toISOString(),
    queriedPackages: PACKAGES.length,
    packageHits,
    vulnerabilities: details,
    signals,
  };
}

if (process.argv[1]?.endsWith('osv.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
