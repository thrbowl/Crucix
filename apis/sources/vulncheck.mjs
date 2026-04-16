// VulnCheck — enhanced vulnerability data with exploitation timeline
// Requires VULNCHECK_API_KEY (free at https://vulncheck.com/token)
// Provides: known-exploited CVEs with first-exploit dates, PoC tracking

import { safeFetch } from '../utils/fetch.mjs';

const KEV_URL = 'https://api.vulncheck.com/v3/index/vulncheck-kev';
const NVD2_URL = 'https://api.vulncheck.com/v3/index/nvd2?limit=30';

export async function briefing() {
  const timestamp = new Date().toISOString();
  const key = process.env.VULNCHECK_API_KEY;

  if (!key) {
    return { source: 'VulnCheck', timestamp, status: 'no_credentials', message: 'Set VULNCHECK_API_KEY in .env — free key at https://vulncheck.com/token' };
  }

  const headers = { Authorization: `Bearer ${key}` };

  const [kevRes, nvdRes] = await Promise.allSettled([
    safeFetch(KEV_URL, { timeout: 20000, headers }),
    safeFetch(NVD2_URL, { timeout: 20000, headers }),
  ]);

  const kevEntries = kevRes.status === 'fulfilled' && !kevRes.value.error
    ? (kevRes.value.data || []).slice(0, 50).map(v => ({
        cveId: v.cve_id || v.id,
        description: (v.short_description || v.description || '').substring(0, 150),
        cvss: v.cvss3_score || v.cvss_score || null,
        exploitedDate: v.date_added || v.first_exploit_pubdate || null,
        ransomwareUse: v.known_ransomware_campaign_use === 'Known' || v.ransomware || false,
      }))
    : [];

  const recentCVEs = nvdRes.status === 'fulfilled' && !nvdRes.value.error
    ? (nvdRes.value.data || []).slice(0, 20).map(v => ({
        cveId: v.cve_id || (v.cve?.id),
        description: (v.descriptions?.[0]?.value || v.description || '').substring(0, 150),
        cvss: v.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore || null,
        published: v.published || null,
        exploitPublished: v.exploit_publish_date || null,
      }))
    : [];

  if (kevEntries.length === 0 && recentCVEs.length === 0) {
    return { source: 'VulnCheck', timestamp, status: 'api_error', message: 'VulnCheck returned no data', signals: [] };
  }

  const ransomwareKEVs = kevEntries.filter(v => v.ransomwareUse).length;
  const signals = [];
  if (kevEntries.length > 0) {
    signals.push({ severity: 'high', signal: `VulnCheck KEV: ${kevEntries.length} actively exploited CVEs tracked${ransomwareKEVs > 0 ? ', ' + ransomwareKEVs + ' used in ransomware campaigns' : ''}` });
  }

  return { source: 'VulnCheck', timestamp, kevCount: kevEntries.length, kevEntries, recentCVEs, signals };
}

if (process.argv[1]?.endsWith('vulncheck.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
