// OpenPhish — active phishing URL feed, no key required
// https://openphish.com/feed.txt — plain text, one URL per line
// Free community feed, updates every ~12 hours

const FEED_URL = 'https://openphish.com/feed.txt';

export async function briefing() {
  const timestamp = new Date().toISOString();
  try {
    const res = await fetch(FEED_URL, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'Crucix/1.0' },
    });
    if (!res.ok) {
      return { source: 'OpenPhish', timestamp, status: 'rss_unavailable', message: `HTTP ${res.status}`, phishCount: 0, urls: [] };
    }
    const text = await res.text();
    const urls = text.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
    const sample = urls.slice(0, 50);

    // Classify by domain TLD / pattern
    const dotOnion = urls.filter(u => u.includes('.onion')).length;
    const dotTk = urls.filter(u => /\.tk\/|\.ml\/|\.ga\/|\.cf\//.test(u)).length;

    const signals = [];
    if (urls.length > 500) signals.push({ severity: 'high', signal: `${urls.length} active phishing URLs in OpenPhish feed — elevated phishing activity` });
    if (dotOnion > 0) signals.push({ severity: 'medium', signal: `${dotOnion} phishing URLs on .onion domains` });

    return {
      source: 'OpenPhish',
      timestamp,
      phishCount: urls.length,
      freeDomainCount: dotTk,
      urls: sample,
      signals,
    };
  } catch (e) {
    return { source: 'OpenPhish', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('openphish.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
