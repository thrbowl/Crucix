import { safeFetch } from '../utils/fetch.mjs';

const PUBLIC_URL = 'https://www.cnvd.org.cn/webinfo/list?type=2';

const itemRegex = /<item>([\s\S]*?)<\/item>/g;
const getTag = (block, tag) => (block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1] || '').trim();

async function fetchPublicFeed() {
  try {
    const res = await fetch(PUBLIC_URL, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Crucix/1.0' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function parseVulns(html) {
  const items = [];
  let m;
  while ((m = itemRegex.exec(html)) !== null) {
    const id = getTag(m[1], 'link').match(/CNVD-\d{4}-\d+/)?.[0] || getTag(m[1], 'guid');
    items.push({
      id: id || null,
      title: getTag(m[1], 'title'),
      severity: getTag(m[1], 'category') || 'unknown',
      publishDate: getTag(m[1], 'pubDate'),
    });
  }
  return items;
}

export async function briefing() {
  const timestamp = new Date().toISOString();
  const key = process.env.CNVD_API_KEY;

  try {
    if (key) {
      const data = await safeFetch(`https://www.cnvd.org.cn/api/v1/vulns?apiKey=${key}&pageSize=20`, {
        timeout: 15000,
        headers: { Authorization: `Bearer ${key}` },
      });

      if (!data.error) {
        const vulns = (data.data || data.results || []).slice(0, 20).map(v => ({
          id: v.cnvdId || v.id || null,
          title: v.title || v.name || '',
          severity: v.severity || v.level || 'unknown',
          publishDate: v.publishDate || v.createTime || null,
        }));

        return {
          source: 'CNVD',
          timestamp,
          status: 'connected',
          recentVulns: vulns,
          signals: vulns.length > 0
            ? [{ severity: 'info', signal: `${vulns.length} recent vulnerabilities from CNVD API` }]
            : [],
        };
      }
    }

    const html = await fetchPublicFeed();

    if (!html) {
      if (!key) {
        return {
          source: 'CNVD',
          timestamp,
          status: 'no_credentials',
          message: 'Set CNVD_API_KEY in .env. Register at https://www.cnvd.org.cn for API access. Public feed also unreachable.',
          signals: [],
        };
      }
      return { source: 'CNVD', timestamp, status: 'unavailable', message: 'API and public feed both unreachable', signals: [] };
    }

    const vulns = parseVulns(html);
    const signals = [];
    if (vulns.length > 5) {
      signals.push({ severity: 'info', signal: `${vulns.length} recent CNVD vulnerabilities from public feed` });
    }

    return {
      source: 'CNVD',
      timestamp,
      status: 'public_feed',
      recentVulns: vulns.slice(0, 20),
      signals,
    };
  } catch (e) {
    return { source: 'CNVD', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('cnvd.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
