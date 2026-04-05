import { safeFetch } from '../utils/fetch.mjs';

const API_BASE = 'https://ti.qianxin.com/api/v2';
const BLOG_RSS_URLS = [
  'https://ti.qianxin.com/blog/rss.xml',
  'https://ti.qianxin.com/blog/feed',
];

const itemRegex = /<item>([\s\S]*?)<\/item>/g;
const getTag = (block, tag) => (block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1] || '').trim();

async function fetchBlogRss() {
  for (const url of BLOG_RSS_URLS) {
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

function parseRssItems(xml) {
  const items = [];
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    items.push({
      title: getTag(m[1], 'title'),
      url: getTag(m[1], 'link'),
      date: getTag(m[1], 'pubDate'),
      category: getTag(m[1], 'category') || null,
    });
  }
  return items;
}

export async function briefing() {
  const timestamp = new Date().toISOString();
  const key = process.env.QIANXIN_API_KEY;

  try {
    if (key) {
      const data = await safeFetch(`${API_BASE}/threat/recent?apikey=${key}&limit=20`, {
        timeout: 15000,
        headers: { Authorization: `Bearer ${key}` },
      });

      if (!data.error) {
        const threats = (data.data || data.results || []).slice(0, 20).map(t => ({
          title: t.title || t.name || '',
          type: t.type || t.category || 'unknown',
          severity: t.severity || t.level || 'unknown',
          date: t.publishDate || t.createTime || null,
        }));

        const signals = [];
        const criticalCount = threats.filter(t => /critical|严重/i.test(t.severity)).length;
        if (criticalCount > 0) {
          signals.push({ severity: 'high', signal: `${criticalCount} critical threats from Qianxin TI` });
        }

        return {
          source: 'Qianxin',
          timestamp,
          status: 'connected',
          recentThreats: threats,
          signals,
        };
      }
    }

    const xml = await fetchBlogRss();

    if (xml) {
      const items = parseRssItems(xml);
      const signals = [];
      if (items.length > 5) {
        signals.push({ severity: 'info', signal: `${items.length} recent threat intelligence articles from Qianxin blog` });
      }
      return {
        source: 'Qianxin',
        timestamp,
        status: key ? 'api_fallback_to_blog' : 'public_blog',
        recentThreats: items.slice(0, 20),
        signals,
      };
    }

    return {
      source: 'Qianxin',
      timestamp,
      status: 'no_credentials',
      message: 'Set QIANXIN_API_KEY in .env. Register at https://ti.qianxin.com for API access. Blog RSS also unavailable.',
      signals: [],
    };
  } catch (e) {
    return { source: 'Qianxin', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('qianxin.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
