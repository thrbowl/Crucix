// SecurityWeek — industry security analysis RSS, no key required
// https://feeds.feedburner.com/securityweek

const RSS_URLS = [
  'https://feeds.feedburner.com/securityweek',
  'https://www.securityweek.com/feed/',
];

const itemRegex = /<item>([\s\S]*?)<\/item>/g;
const getTag = (block, tag) =>
  (block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1] || '').trim();

async function fetchRss() {
  for (const url of RSS_URLS) {
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
  const urgent = ['apt', 'nation-state', 'zero-day', 'ransomware', 'critical vulnerability'];
  const count = titles.filter(t => urgent.some(k => t.includes(k))).length;
  if (count > 0) signals.push({ severity: 'medium', signal: `${count} SecurityWeek articles on APT/zero-day/ransomware` });
  return signals;
}

export async function briefing() {
  const timestamp = new Date().toISOString();
  try {
    const xml = await fetchRss();
    if (!xml) return { source: 'SecurityWeek', timestamp, status: 'rss_unavailable', message: 'SecurityWeek RSS unreachable', signals: [] };
    const articles = parseItems(xml).slice(0, 20);
    return { source: 'SecurityWeek', timestamp, totalArticles: articles.length, recentArticles: articles, signals: detectSignals(articles) };
  } catch (e) {
    return { source: 'SecurityWeek', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('securityweek-rss.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
