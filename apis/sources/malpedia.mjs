// Malpedia — malware family library (FRAUNHOFER FKIE)
// Optional key for authenticated access: MALPEDIA_API_KEY
// Without key: limited to public families list; with key: full details + ATT&CK mappings
// https://malpedia.caad.fkie.fraunhofer.de/api

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://malpedia.caad.fkie.fraunhofer.de/api';

export async function briefing() {
  const timestamp = new Date().toISOString();
  const key = process.env.MALPEDIA_API_KEY;

  const headers = key ? { Authorization: `apitoken ${key}` } : {};

  const [familiesRes, actorsRes] = await Promise.allSettled([
    safeFetch(`${BASE}/list/families`, { timeout: 20000, headers }),
    safeFetch(`${BASE}/list/actors`, { timeout: 20000, headers }),
  ]);

  const families = familiesRes.status === 'fulfilled' && !familiesRes.value.error
    ? (Array.isArray(familiesRes.value) ? familiesRes.value : Object.keys(familiesRes.value || {})).slice(0, 50)
    : [];

  const actors = actorsRes.status === 'fulfilled' && !actorsRes.value.error
    ? (Array.isArray(actorsRes.value) ? actorsRes.value : Object.keys(actorsRes.value || {})).slice(0, 30)
    : [];

  if (families.length === 0) {
    return { source: 'Malpedia', timestamp, status: key ? 'api_error' : 'no_credentials', message: key ? 'Malpedia API returned no families' : 'Set MALPEDIA_API_KEY for authenticated access (free registration at malpedia.caad.fkie.fraunhofer.de)', signals: [] };
  }

  return {
    source: 'Malpedia',
    timestamp,
    familyCount: families.length,
    families: families.slice(0, 50),
    actorCount: actors.length,
    actors: actors.slice(0, 30),
    signals: [{ severity: 'info', signal: `Malpedia: ${families.length} malware families, ${actors.length} threat actors in reference library` }],
  };
}

if (process.argv[1]?.endsWith('malpedia.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
