// The Hacker News — top security news RSS, no key required
// https://thehackernews.com/feeds/posts/default

const RSS_URL = 'https://feeds.feedburner.com/TheHackersNews';
const FALLBACK_URL = 'https://thehackernews.com/feeds/posts/default';

const itemRegex = /<item>([\s\S]*?)<\/item>/g;
const getTag = (block, tag) =>
  (block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1] || '').trim();

async function fetchRss() {
  for (const url of [RSS_URL, FALLBACK_URL]) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Crucix/1.0' },
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (/<item>/i.test(text)) return text;
    } catch { continue; }
  }
  return null;
}

function parseItems(xml) {
  const items = [];
  let m;
  itemRegex.lastIndex = 0;
  while ((m = itemRegex.exec(xml)) !== null) {
    const title = getTag(m[1], 'title');
    if (!title) continue;
    items.push({
      title,
      url: getTag(m[1], 'link') || getTag(m[1], 'guid'),
      date: getTag(m[1], 'pubDate'),
    });
  }
  return items;
}

function detectSignals(articles) {
  const signals = [];
  const titles = articles.map(a => a.title.toLowerCase());
  const urgent = ['zero-day', '0day', 'actively exploited', 'critical', 'ransomware', 'apt'];
  const count = titles.filter(t => urgent.some(k => t.includes(k))).length;
  if (count > 0) signals.push({ severity: 'high', signal: `${count} THN articles flagged as critical/zero-day/ransomware` });
  return signals;
}

export async function briefing() {
  const timestamp = new Date().toISOString();
  try {
    const xml = await fetchRss();
    if (!xml) return { source: 'HackerNews-RSS', timestamp, status: 'rss_unavailable', message: 'THN RSS unreachable', signals: [] };
    const articles = parseItems(xml).slice(0, 20);
    return { source: 'HackerNews-RSS', timestamp, totalArticles: articles.length, recentArticles: articles, signals: detectSignals(articles) };
  } catch (e) {
    return { source: 'HackerNews-RSS', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('hackernews-rss.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
