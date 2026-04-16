// BleepingComputer — security/ransomware news RSS, no key required
// https://www.bleepingcomputer.com/feed/

const RSS_URL = 'https://www.bleepingcomputer.com/feed/';

const itemRegex = /<item>([\s\S]*?)<\/item>/g;
const getTag = (block, tag) =>
  (block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1] || '').trim();

async function fetchRss() {
  try {
    const res = await fetch(RSS_URL, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Crucix/1.0' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
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
  const urgent = ['zero-day', '0day', 'ransomware', 'actively exploited', 'critical', 'data breach'];
  const count = titles.filter(t => urgent.some(k => t.includes(k))).length;
  if (count > 0) signals.push({ severity: 'high', signal: `${count} BleepingComputer articles on critical/ransomware/breach topics` });
  return signals;
}

export async function briefing() {
  const timestamp = new Date().toISOString();
  try {
    const xml = await fetchRss();
    if (!xml) return { source: 'BleepingComputer', timestamp, status: 'rss_unavailable', message: 'BleepingComputer RSS unreachable', signals: [] };
    const articles = parseItems(xml).slice(0, 20);
    return { source: 'BleepingComputer', timestamp, totalArticles: articles.length, recentArticles: articles, signals: detectSignals(articles) };
  } catch (e) {
    return { source: 'BleepingComputer', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('bleepingcomputer-rss.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
