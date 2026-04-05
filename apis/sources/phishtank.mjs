// PhishTank — verified phishing URLs (JSON/RSS). Cloudflare often blocks datacenter IPs;
// OpenPhish text feed is used as a fallback with the same shape for the dashboard.

const PHISH_JSON_URL = 'https://data.phishtank.com/data/online-valid.json';
const OPENPHISH_URL = 'https://openphish.com/feed.txt';

const BROWSER_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

function aggregateByTarget(entries) {
  const counts = {};
  for (const e of entries) {
    const target = e.target || 'unknown';
    counts[target] = (counts[target] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .reduce((acc, [k, v]) => {
      acc[k] = v;
      return acc;
    }, {});
}

function normalizePhishTankRow(e) {
  const url = (e.url || '').trim();
  if (!url) return null;
  const submitDate = e.submission_time || e.submitDate || e.submissionDate || null;
  const verificationDate = e.verification_time || e.verificationDate || null;
  return {
    url: url.substring(0, 500),
    target: e.target || e.brand || null,
    verified: e.verified === 'yes' || e.verified === true,
    submitDate,
    verificationDate,
    phish_id: e.phish_id != null ? String(e.phish_id) : null,
  };
}

async function fetchPhishTankJson() {
  const res = await fetch(PHISH_JSON_URL, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(25000),
    redirect: 'follow',
  });
  if (!res.ok) return { error: `PhishTank JSON HTTP ${res.status}` };
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: 'PhishTank JSON parse failed' };
  }
  const rows = Array.isArray(parsed) ? parsed : parsed?.phish || parsed?.urls;
  if (!Array.isArray(rows)) return { error: 'PhishTank JSON not an array' };
  return { rows };
}

async function fetchOpenPhishFallback() {
  const res = await fetch(OPENPHISH_URL, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(20000),
    redirect: 'follow',
  });
  if (!res.ok) return { error: `OpenPhish HTTP ${res.status}` };
  const text = await res.text();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows = lines.slice(0, 500).map(url => ({
    url: url.substring(0, 500),
    target: null,
    verified: false,
    submitDate: null,
    verificationDate: null,
    phish_id: null,
    _openphish: true,
  }));
  return { rows, openphish: true };
}

export async function briefing() {
  const timestamp = new Date().toISOString();
  const signals = [];

  let entries = [];
  let fromOpenPhish = false;

  const pt = await fetchPhishTankJson();
  if (!pt.error) {
    entries = pt.rows.map(normalizePhishTankRow).filter(Boolean);
  }

  if (entries.length === 0) {
    const op = await fetchOpenPhishFallback();
    if (op.error) {
      return {
        source: 'PhishTank',
        timestamp,
        error: pt.error ? `${pt.error}; ${op.error}` : op.error,
      };
    }
    entries = op.rows;
    fromOpenPhish = op.openphish === true;
    signals.push({
      severity: 'info',
      signal:
        'PhishTank JSON/RSS unreachable (often blocked by Cloudflare); showing recent URLs from OpenPhish feed instead',
    });
  }

  const totalActivePhish = entries.length;
  const recentPhishing = entries.slice(0, 30).map(({ _openphish, ...rest }) => rest);

  const byTarget = fromOpenPhish ? {} : aggregateByTarget(entries.slice(0, 500));

  if (totalActivePhish > 5000) {
    signals.push({
      severity: 'high',
      signal: `${totalActivePhish} active phishing URLs in feed — elevated phishing threat`,
    });
  } else if (totalActivePhish > 200) {
    signals.push({
      severity: 'medium',
      signal: `${totalActivePhish} phishing URLs tracked in current feed`,
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
    timestamp,
    totalActivePhish,
    urls: recentPhishing,
    recentPhishing,
    byTarget,
    signals,
  };
}

if (process.argv[1]?.endsWith('phishtank.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
