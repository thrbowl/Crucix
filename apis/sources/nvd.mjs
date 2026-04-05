import { safeFetch } from '../utils/fetch.mjs';

function buildUrl() {
  const now = new Date();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
  const fmt = d => d.toISOString().replace(/\.\d{3}Z$/, '.000');
  return `https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${fmt(thirtyDaysAgo)}&pubEndDate=${fmt(now)}&resultsPerPage=50`;
}

function extractCvss(metrics) {
  if (!metrics) return null;
  const v31 = metrics.cvssMetricV31?.[0]?.cvssData;
  if (v31) return { score: v31.baseScore, severity: v31.baseSeverity };
  const v30 = metrics.cvssMetricV30?.[0]?.cvssData;
  if (v30) return { score: v30.baseScore, severity: v30.baseSeverity };
  return null;
}

function extractProducts(configurations) {
  if (!configurations) return [];
  const products = new Set();
  for (const node of configurations) {
    for (const n of node.nodes || []) {
      for (const cpe of n.cpeMatch || []) {
        const parts = (cpe.criteria || '').split(':');
        if (parts.length >= 5) products.add(`${parts[3]}/${parts[4]}`);
      }
    }
  }
  return [...products].slice(0, 5);
}

function parseCVE(item) {
  const cve = item.cve || {};
  const desc = (cve.descriptions || []).find(d => d.lang === 'en');
  const cvss = extractCvss(cve.metrics);
  return {
    cveId: cve.id,
    description: (desc?.value || '').substring(0, 300),
    cvss: cvss?.score ?? null,
    severity: cvss?.severity ?? null,
    published: cve.published,
    products: extractProducts(cve.configurations),
  };
}

export async function briefing() {
  const headers = {};
  if (process.env.NVD_API_KEY) headers.apiKey = process.env.NVD_API_KEY;

  const data = await safeFetch(buildUrl(), { timeout: 20000, headers });

  if (data.error) {
    return { source: 'NVD', timestamp: new Date().toISOString(), error: data.error };
  }

  const items = data.vulnerabilities || [];
  const parsed = items.map(parseCVE);
  const sorted = parsed.sort((a, b) => (b.cvss ?? 0) - (a.cvss ?? 0));

  const criticalCount = parsed.filter(c => (c.cvss ?? 0) >= 9).length;
  const highCount = parsed.filter(c => (c.cvss ?? 0) >= 7).length;

  const signals = [];
  if (criticalCount > 3) {
    signals.push({
      severity: 'critical',
      signal: `${criticalCount} critical CVEs (CVSS ≥ 9.0) published in last 30 days`,
    });
  }
  if (highCount > 10) {
    signals.push({
      severity: 'high',
      signal: `${highCount} high-severity CVEs (CVSS ≥ 7.0) published recently`,
    });
  }

  return {
    source: 'NVD',
    timestamp: new Date().toISOString(),
    totalResults: data.totalResults || items.length,
    recentCVEs: sorted.slice(0, 30),
    criticalCount,
    highCount,
    signals,
  };
}

if (process.argv[1]?.endsWith('nvd.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
