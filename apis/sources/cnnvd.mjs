import { safeFetch } from '../utils/fetch.mjs';

const PUBLIC_URLS = [
  'https://www.cnnvd.org.cn/web/vulnerability/querylist.tag',
  'https://www.cnnvd.org.cn/',
];

const itemRegex = /<item>([\s\S]*?)<\/item>/g;
const getTag = (block, tag) => (block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1] || '').trim();

async function fetchPublicData() {
  for (const url of PUBLIC_URLS) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Crucix/1.0' },
      });
      if (!res.ok) continue;
      return { text: await res.text(), url };
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
      id: getTag(m[1], 'guid') || getTag(m[1], 'link').match(/CNNVD-\d{6}-\d+/)?.[0] || null,
      title: getTag(m[1], 'title'),
      severity: getTag(m[1], 'category') || 'unknown',
    });
  }
  return items;
}

export async function briefing() {
  const timestamp = new Date().toISOString();

  try {
    const result = await fetchPublicData();

    if (!result) {
      return {
        source: 'CNNVD',
        timestamp,
        status: 'unavailable',
        message: 'CNNVD site is unreachable. The site may require special network access or has restricted public feeds.',
        signals: [{ severity: 'info', signal: 'CNNVD data unavailable — site may require China mainland access' }],
      };
    }

    const rssItems = parseRssItems(result.text);

    if (rssItems.length > 0) {
      const signals = [];
      if (rssItems.length > 10) {
        signals.push({ severity: 'medium', signal: `${rssItems.length} recent CNNVD vulnerability advisories` });
      }
      return {
        source: 'CNNVD',
        timestamp,
        status: 'connected',
        recentVulns: rssItems.slice(0, 20),
        signals,
      };
    }

    return {
      source: 'CNNVD',
      timestamp,
      status: 'partial',
      message: 'CNNVD page loaded but no structured vulnerability data found in RSS format.',
      recentVulns: [],
      signals: [{ severity: 'info', signal: 'CNNVD reachable but no parseable RSS data — may need scraper update' }],
    };
  } catch (e) {
    return { source: 'CNNVD', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('cnnvd.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
