// Spamhaus DROP/EDROP — Don't Route Or Peer lists
// No API key required. Public blocklists of hijacked/abused IP ranges.

const DROP_URL = 'https://www.spamhaus.org/drop/drop.txt';
const EDROP_URL = 'https://www.spamhaus.org/drop/edrop.txt';

async function fetchDropList(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Crucix/2.0' },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const text = await res.text();
    const entries = [];
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';')) continue;
      const parts = trimmed.split(/\s*;\s*/);
      if (parts.length >= 2) {
        entries.push({ cidr: parts[0].trim(), sblId: parts[1].trim() });
      }
    }
    return entries;
  } catch (e) {
    return { error: e.message };
  }
}

export async function briefing() {
  const [dropResult, edropResult] = await Promise.all([
    fetchDropList(DROP_URL),
    fetchDropList(EDROP_URL),
  ]);

  const dropEntries = Array.isArray(dropResult) ? dropResult : [];
  const edropEntries = Array.isArray(edropResult) ? edropResult : [];
  const dropError = dropResult.error;
  const edropError = edropResult.error;

  if (dropError && edropError) {
    return { source: 'Spamhaus', timestamp: new Date().toISOString(), error: dropError };
  }

  const totalBlocked = dropEntries.length + edropEntries.length;

  const signals = [];
  if (totalBlocked > 500) {
    signals.push({
      severity: 'medium',
      signal: `${totalBlocked} CIDR ranges on Spamhaus DROP/EDROP lists`,
    });
  }

  return {
    source: 'Spamhaus',
    timestamp: new Date().toISOString(),
    dropEntries: dropEntries.length,
    edropEntries: edropEntries.length,
    totalBlocked,
    sampleEntries: [...dropEntries.slice(0, 10), ...edropEntries.slice(0, 10)],
    signals,
  };
}

if (process.argv[1]?.endsWith('spamhaus.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
