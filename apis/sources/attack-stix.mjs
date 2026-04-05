// MITRE ATT&CK — Enterprise STIX data summary
// No API key required. Fetches the full STIX bundle and summarizes.

import { safeFetch } from '../utils/fetch.mjs';

const STIX_URLS = [
  'https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json',
  'https://cdn.jsdelivr.net/gh/mitre/cti@master/enterprise-attack/enterprise-attack.json',
];

const TYPE_MAP = {
  'attack-pattern': 'technique',
  'x-mitre-tactic': 'tactic',
  'intrusion-set': 'group',
  'malware': 'software',
  'tool': 'software',
};

function mitreAttackRef(refs, idRe) {
  return (refs || []).find(
    r => r.source_name === 'mitre-attack' && idRe.test(String(r.external_id || ''))
  );
}

/** Build dashboard/inject.mjs matrix: tactics {id,name,techniqueCount}, techniques {id,name,tacticId,count} */
function buildAttackMatrix(objects) {
  const shortnameToTacticId = new Map();
  const tacticMeta = new Map();

  for (const obj of objects) {
    if (obj.type !== 'x-mitre-tactic' || obj.revoked || obj.x_mitre_deprecated) continue;
    const ref = mitreAttackRef(obj.external_references, /^TA\d+/i);
    if (!ref?.external_id || !obj.x_mitre_shortname) continue;
    shortnameToTacticId.set(obj.x_mitre_shortname, ref.external_id);
    tacticMeta.set(ref.external_id, {
      id: ref.external_id,
      name: obj.name || ref.external_id,
      techniqueCount: 0,
    });
  }

  const techniqueCountsByTactic = new Map();
  const techniques = [];

  for (const obj of objects) {
    if (obj.type !== 'attack-pattern' || obj.revoked || obj.x_mitre_deprecated) continue;
    const mitreRef = mitreAttackRef(obj.external_references, /^T\d+/i);
    if (!mitreRef?.external_id) continue;

    const phases = (obj.kill_chain_phases || []).filter(
      p =>
        p &&
        String(p.kill_chain_name || '')
          .toLowerCase()
          .includes('mitre')
    );

    const tacticIds = new Set();
    for (const p of phases) {
      const ta = shortnameToTacticId.get(p.phase_name);
      if (ta) tacticIds.add(ta);
    }

    for (const ta of tacticIds) {
      techniqueCountsByTactic.set(ta, (techniqueCountsByTactic.get(ta) || 0) + 1);
    }

    const primaryTacticId = [...tacticIds][0] || null;

    techniques.push({
      id: mitreRef.external_id,
      name: obj.name || mitreRef.external_id,
      external_id: mitreRef.external_id,
      tacticId: primaryTacticId,
      count: 0,
    });
  }

  for (const [taId, n] of techniqueCountsByTactic) {
    const m = tacticMeta.get(taId);
    if (m) m.techniqueCount = n;
  }

  const tactics = [...tacticMeta.values()].sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true })
  );

  techniques.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  return { tactics, techniques };
}

export async function briefing() {
  const timestamp = new Date().toISOString();

  let data;
  let lastErr;
  for (const url of STIX_URLS) {
    data = await safeFetch(url, { timeout: 120000, retries: 1 });
    if (!data.error) break;
    lastErr = data.error;
  }
  if (data.error) {
    return { source: 'ATT&CK-STIX', timestamp, error: lastErr || data.error };
  }

  const objects = data.objects || [];
  const version = data.spec_version || data.id || null;

  const { tactics, techniques } = buildAttackMatrix(objects);

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
    tactics,
    techniques,
    totalTechniques: techniques.length,
    totalTactics: tactics.length,
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
