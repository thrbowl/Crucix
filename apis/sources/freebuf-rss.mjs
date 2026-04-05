import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const RSS_URLS = [
  'https://www.freebuf.com/feed',
  'https://www.freebuf.com/rss.xml',
  'http://www.freebuf.com/feed',
  'http://www.freebuf.com/rss.xml',
];

const HTML_FALLBACK_URL = 'https://www.freebuf.com/articles';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const itemRegex = /<item>([\s\S]*?)<\/item>/g;
const getTag = (block, tag) => (block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1] || '').trim();

/**
 * FreeBuf 前置 CDN 对部分 Node/undici TLS 指纹返回 405；系统 curl 常仍可拉取 RSS。
 * 优先 fetch（符合项目约定），失败或 405 时再回退 curl。
 */
async function fetchTextPreferBrowser(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(18000),
      headers: BROWSER_HEADERS,
    });
    const text = await res.text();
    if (res.ok && text && !/<title>405<\/title>/i.test(text)) {
      return text;
    }
  } catch {
    /* fall through */
  }
  try {
    const { stdout } = await execFileAsync(
      'curl',
      [
        '-sS',
        '-L',
        '--max-time',
        '22',
        '-A',
        BROWSER_HEADERS['User-Agent'],
        '-H',
        `Accept: ${BROWSER_HEADERS.Accept}`,
        '-H',
        `Accept-Language: ${BROWSER_HEADERS['Accept-Language']}`,
        url,
      ],
      { maxBuffer: 6 * 1024 * 1024 },
    );
    return stdout;
  } catch {
    return null;
  }
}

async function fetchRssText() {
  for (const url of RSS_URLS) {
    try {
      const text = await fetchTextPreferBrowser(url);
      if (text && /<rss[\s>]/i.test(text) && /<item>/i.test(text)) return text;
    } catch {
      continue;
    }
  }
  return null;
}

function parseRssItems(xml) {
  const items = [];
  let m;
  itemRegex.lastIndex = 0;
  while ((m = itemRegex.exec(xml)) !== null) {
    items.push({
      title: getTag(m[1], 'title'),
      url: getTag(m[1], 'link'),
      date: getTag(m[1], 'pubDate'),
    });
  }
  return items.filter(i => i.title);
}

function parseArticlesFromNuxtHtml(html) {
  const items = [];
  const seen = new Set();
  const absRe = /https:\/\/www\.freebuf\.com\/articles\/[a-z0-9/-]+\.html/gi;
  let m;
  while ((m = absRe.exec(html)) !== null) {
    const url = m[0];
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({
      title: url.replace(/^https:\/\/www\.freebuf\.com\//, ''),
      url,
      date: null,
    });
    if (items.length >= 25) break;
  }
  const relRe = /["'](\/articles\/[a-zA-Z0-9/_.-]+\.html)["']/g;
  while ((m = relRe.exec(html)) !== null) {
    const path = m[1];
    const url = `https://www.freebuf.com${path}`;
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({ title: path.replace(/^\//, ''), url, date: null });
    if (items.length >= 25) break;
  }
  return items;
}

async function fetchHtmlFallback() {
  return fetchTextPreferBrowser(HTML_FALLBACK_URL);
}

function detectSignals(articleList) {
  const signals = [];
  const titles = articleList.map(a => (a.title || '').toLowerCase());

  const urgentKeywords = ['0day', 'zero-day', '漏洞预警', '紧急', 'critical', 'ransomware', '勒索'];
  const urgentCount = titles.filter(t => urgentKeywords.some(k => t.includes(k))).length;

  if (urgentCount > 0) {
    signals.push({ severity: 'high', signal: `${urgentCount} FreeBuf 文章涉及 critical/0day/勒索等关键词` });
  }
  if (articleList.length > 15) {
    signals.push({ severity: 'info', signal: `${articleList.length} 篇 FreeBuf 近期文章 — 安全资讯活跃` });
  }

  return signals;
}

export async function briefing() {
  const timestamp = new Date().toISOString();

  try {
    let xml = await fetchRssText();
    let items = xml ? parseRssItems(xml) : [];

    if (items.length === 0) {
      const html = await fetchHtmlFallback();
      if (html) items = parseArticlesFromNuxtHtml(html);
    }

    if (items.length === 0) {
      return {
        source: 'FreeBuf',
        timestamp,
        status: 'rss_unavailable',
        message: 'FreeBuf RSS 与文章页 HTML 解析均未获得条目；请检查网络或站点结构是否变更。',
        signals: [],
      };
    }

    const slice = items.slice(0, 20);
    const signals = detectSignals(items);

    return {
      source: 'FreeBuf',
      timestamp,
      totalArticles: items.length,
      articles: slice,
      recentArticles: slice,
      signals,
    };
  } catch (e) {
    return { source: 'FreeBuf', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('freebuf-rss.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
