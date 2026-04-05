import { safeFetch } from '../utils/fetch.mjs';

const RSS_URLS = [
  'https://api.anquanke.com/data/v1/rss',
  'https://www.anquanke.com/rss',
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

function detectSignals(articles) {
  const signals = [];
  const titles = articles.map(a => a.title.toLowerCase());

  const urgentKeywords = ['0day', 'zero-day', '漏洞', 'apt', '勒索', 'ransomware', '供应链', 'supply chain'];
  const urgentCount = titles.filter(t => urgentKeywords.some(k => t.includes(k))).length;

  if (urgentCount > 0) {
    signals.push({ severity: 'high', signal: `${urgentCount} Anquanke articles cover vulnerability/APT/ransomware topics` });
  }
  if (articles.length > 15) {
    signals.push({ severity: 'info', signal: `${articles.length} recent articles from Anquanke — active security discourse` });
  }

  return signals;
}

export async function briefing() {
  const timestamp = new Date().toISOString();

  try {
    const xml = await fetchRss();

    if (!xml) {
      return {
        source: 'Anquanke',
        timestamp,
        status: 'rss_unavailable',
        message: 'Anquanke RSS feeds are currently unreachable.',
        signals: [],
      };
    }

    const articles = parseItems(xml);
    const signals = detectSignals(articles);

    return {
      source: 'Anquanke',
      timestamp,
      totalArticles: articles.length,
      recentArticles: articles.slice(0, 20),
      signals,
    };
  } catch (e) {
    return { source: 'Anquanke', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('anquanke-rss.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
