// MITRE ATT&CK — Enterprise STIX data summary
// No API key required. Fetches the full STIX bundle and summarizes.

import { safeFetch } from '../utils/fetch.mjs';

const STIX_URL = 'https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json';

const TYPE_MAP = {
  'attack-pattern': 'technique',
  'x-mitre-tactic': 'tactic',
  'intrusion-set': 'group',
  'malware': 'software',
  'tool': 'software',
};

export async function briefing() {
  const timestamp = new Date().toISOString();

  const data = await safeFetch(STIX_URL, { timeout: 30000, retries: 1 });

  if (data.error) {
    return { source: 'ATT&CK-STIX', timestamp, error: data.error };
  }

  const objects = data.objects || [];
  const version = data.spec_version || data.id || null;

  const counts = { technique: 0, tactic: 0, group: 0, software: 0 };
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400_000);
  const recentlyModified = [];

  for (const obj of objects) {
    if (obj.revoked || obj.x_mitre_deprecated) continue;

    const category = TYPE_MAP[obj.type];
    if (category) counts[category]++;

    const modified = obj.modified ? new Date(obj.modified) : null;
    if (modified && modified >= ninetyDaysAgo && category) {
      recentlyModified.push({
        name: obj.name,
        type: category,
        modified: obj.modified,
        id: obj.external_references?.[0]?.external_id || null,
      });
    }
  }

  recentlyModified.sort((a, b) => new Date(b.modified) - new Date(a.modified));

  const signals = [];
  const recentTechniques = recentlyModified.filter(r => r.type === 'technique');
  if (recentTechniques.length > 20) {
    signals.push({
      severity: 'info',
      signal: `${recentTechniques.length} ATT&CK techniques modified in last 90 days — framework actively updated`,
    });
  }

  const recentGroups = recentlyModified.filter(r => r.type === 'group');
  if (recentGroups.length > 0) {
    signals.push({
      severity: 'medium',
      signal: `${recentGroups.length} threat groups updated recently: ${recentGroups.slice(0, 5).map(g => g.name).join(', ')}`,
    });
  }

  return {
    source: 'ATT&CK-STIX',
    timestamp,
    version,
    totalTechniques: counts.technique,
    totalTactics: counts.tactic,
    totalGroups: counts.group,
    totalSoftware: counts.software,
    recentlyModified: recentlyModified.slice(0, 50),
    signals,
  };
}

if (process.argv[1]?.endsWith('attack-stix.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
