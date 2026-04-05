// PhishTank — Community-driven phishing URL database
// No API key required for basic access.
// Tracks verified phishing sites with target brand, submission, and verification data.

import { safeFetch } from '../utils/fetch.mjs';

const PHISH_JSON_URL = 'https://data.phishtank.com/data/online-valid.json';

function aggregateByTarget(entries) {
  const counts = {};
  for (const e of entries) {
    const target = e.target || 'unknown';
    counts[target] = (counts[target] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {});
}

async function fetchPhishData() {
  // Try the full JSON feed with a generous timeout
  const data = await safeFetch(PHISH_JSON_URL, { timeout: 25000, retries: 0 });

  if (!data.error && Array.isArray(data)) {
    return data;
  }

  // Fallback: try the RSS search for recent active phish
  const rssUrl = 'https://phishtank.org/phish_search.php?valid=y&Search=Search&active=y&limitresult=20&format=rss';
  try {
    const res = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Crucix/1.0' },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) return { error: `RSS HTTP ${res.status}` };

    const xml = await res.text();
    return parseRSSItems(xml);
  } catch (err) {
    return { error: err.message || 'PhishTank fetch failed' };
  }
}

function parseRSSItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = tag => {
      const m = block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`))
        || block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return m ? m[1].trim() : null;
    };
    items.push({
      url: get('title') || get('link'),
      target: get('description')?.replace(/^Phishing against:\s*/i, '') || null,
      submissionDate: get('pubDate') || null,
      verificationDate: null,
      phish_id: get('guid') || null,
    });
  }
  return items;
}

export async function briefing() {
  const result = await fetchPhishData();

  if (result.error) {
    return {
      source: 'PhishTank',
      timestamp: new Date().toISOString(),
      error: result.error,
    };
  }

  const entries = Array.isArray(result) ? result : [];
  const totalActivePhish = entries.length;

  const recentPhish = entries.slice(0, 30).map(e => ({
    url: (e.url || '').substring(0, 200),
    target: e.target || null,
    submissionDate: e.submission_time || e.submissionDate || null,
    verificationDate: e.verification_time || e.verificationDate || null,
    phish_id: e.phish_id || null,
  }));

  const byTarget = aggregateByTarget(entries.slice(0, 500));

  const signals = [];

  if (totalActivePhish > 5000) {
    signals.push({
      severity: 'high',
      signal: `${totalActivePhish} active phishing sites verified — elevated phishing threat`,
    });
  } else if (totalActivePhish > 1000) {
    signals.push({
      severity: 'medium',
      signal: `${totalActivePhish} active verified phishing sites tracked by PhishTank`,
    });
  }

  const topTarget = Object.entries(byTarget)[0];
  if (topTarget && topTarget[1] > 50) {
    signals.push({
      severity: 'medium',
      signal: `"${topTarget[0]}" is the most impersonated brand with ${topTarget[1]} active phishing pages`,
    });
  }

  return {
    source: 'PhishTank',
    timestamp: new Date().toISOString(),
    totalActivePhish,
    recentPhish,
    byTarget,
    signals,
  };
}

if (process.argv[1]?.endsWith('phishtank.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
