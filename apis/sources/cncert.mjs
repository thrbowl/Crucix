import { safeFetch } from '../utils/fetch.mjs';

const RSS_URLS = [
  'https://www.cert.org.cn/publish/main/upload/File/rss.xml',
  'https://www.cert.org.cn/rss.xml',
];

const itemRegex = /<item>([\s\S]*?)<\/item>/g;
const getTag = (block, tag) => (block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1] || '').trim();

async function fetchRss() {
  for (const url of RSS_URLS) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Crucix/1.0' },
      });
      if (!res.ok) continue;
      return await res.text();
    } catch {
      continue;
    }
  }
  return null;
}

function parseItems(xml) {
  const items = [];
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    items.push({
      title: getTag(m[1], 'title'),
      url: getTag(m[1], 'link'),
      date: getTag(m[1], 'pubDate'),
    });
  }
  return items;
}

export async function briefing() {
  const timestamp = new Date().toISOString();

  try {
    const xml = await fetchRss();

    if (!xml) {
      return {
        source: 'CNCERT',
        timestamp,
        status: 'rss_unavailable',
        message: 'CNCERT RSS feeds are currently unreachable. Check https://www.cert.org.cn manually.',
        signals: [{ severity: 'info', signal: 'CNCERT RSS feed unavailable — manual check recommended' }],
      };
    }

    const items = parseItems(xml);

    const signals = [];
    if (items.length > 10) {
      signals.push({
        severity: 'medium',
        signal: `${items.length} alerts in CNCERT RSS feed — elevated advisory activity`,
      });
    }

    return {
      source: 'CNCERT',
      timestamp,
      totalAlerts: items.length,
      recentAlerts: items.slice(0, 20),
      signals,
    };
  } catch (e) {
    return { source: 'CNCERT', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('cncert.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
