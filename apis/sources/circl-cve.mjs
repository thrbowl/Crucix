// CIRCL CVE Search — Luxembourg CERT fast CVE query layer
// No key required. https://cve.circl.lu/api/
// Returns last 30 CVEs + EPSS scores as a quick NVD supplement

import { safeFetch } from '../utils/fetch.mjs';

const LAST_URL = 'https://cve.circl.lu/api/last/30';

export async function briefing() {
  const timestamp = new Date().toISOString();
  try {
    const data = await safeFetch(LAST_URL, { timeout: 20000 });
    if (data.error) return { source: 'CIRCL-CVE', timestamp, error: data.error };

    const entries = Array.isArray(data) ? data : (data.results || []);
    const cves = entries.slice(0, 30).map(v => ({
      id: v.id || v.cveId,
      summary: (v.summary || v.description || '').substring(0, 200),
      cvss: v.cvss || v.cvss3 || null,
      published: v.Published || v.published || null,
      modified: v.Modified || v.modified || null,
    }));

    const criticalCount = cves.filter(c => (c.cvss || 0) >= 9.0).length;
    const signals = [];
    if (criticalCount > 0) {
      signals.push({ severity: 'high', signal: `CIRCL CVE: ${criticalCount} CVEs with CVSS ≥ 9.0 in last 30 published` });
    }

    return { source: 'CIRCL-CVE', timestamp, totalReturned: cves.length, recentCVEs: cves, signals };
  } catch (e) {
    return { source: 'CIRCL-CVE', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('circl-cve.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
