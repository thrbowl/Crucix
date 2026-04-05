import { safeFetch } from '../utils/fetch.mjs';

const ADVISORIES_URL = 'https://api.github.com/advisories?per_page=30&sort=published&direction=desc&type=reviewed';

function parseAdvisory(a) {
  return {
    ghsaId: a.ghsa_id,
    cveId: a.cve_id,
    summary: (a.summary || '').substring(0, 300),
    severity: a.severity,
    publishedAt: a.published_at,
    updatedAt: a.updated_at,
    vulnerabilities: (a.vulnerabilities || []).slice(0, 5).map(v => ({
      package: v.package?.name,
      ecosystem: v.package?.ecosystem,
    })),
  };
}

export async function briefing() {
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const data = await safeFetch(ADVISORIES_URL, { timeout: 20000, headers });

  if (data.error) {
    return { source: 'GitHub-Advisory', timestamp: new Date().toISOString(), error: data.error };
  }

  const list = Array.isArray(data) ? data : [];
  const advisories = list.map(parseAdvisory);
  const criticalCount = advisories.filter(a => a.severity === 'critical').length;
  const highCount = advisories.filter(a => a.severity === 'high').length;

  const signals = [];
  if (criticalCount > 2) {
    signals.push({
      severity: 'critical',
      signal: `${criticalCount} critical GitHub security advisories published recently`,
    });
  }
  if (highCount > 5) {
    signals.push({
      severity: 'high',
      signal: `${highCount} high-severity advisories in latest batch`,
    });
  }

  return {
    source: 'GitHub-Advisory',
    timestamp: new Date().toISOString(),
    totalAdvisories: advisories.length,
    advisories,
    criticalCount,
    signals,
  };
}

if (process.argv[1]?.endsWith('github-advisory.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
