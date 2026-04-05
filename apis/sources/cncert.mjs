const RSS_URLS = [
  'https://www.cert.org.cn/publish/main/upload/File/rss.xml',
  'http://www.cert.org.cn/publish/main/upload/File/rss.xml',
  'https://www.cert.org.cn/rss.xml',
  'http://www.cert.org.cn/rss.xml',
];

const HTML_FALLBACK_URLS = [
  'https://www.cert.org.cn/publish/main/8/index.html',
  'http://www.cert.org.cn/publish/main/8/index.html',
];

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const itemRegex = /<item>([\s\S]*?)<\/item>/g;
const getTag = (block, tag) => (block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1] || '').trim();

function severityFromTitle(title) {
  const t = title.toLowerCase();
  if (/紧急|严重|高危|0day|zero-day|勒索|ransomware/.test(title) || /0day|zero-day/.test(t)) return 'high';
  if (/预警|漏洞|攻击|恶意|通报|处置/.test(title)) return 'medium';
  return 'info';
}

async function fetchText(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(18000),
        headers: BROWSER_HEADERS,
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 80) return { text, url };
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
      severity: severityFromTitle(getTag(m[1], 'title')),
    });
  }
  return items.filter(i => i.title);
}

function parseFocusHtml(html) {
  const items = [];
  const liRe =
    /<li><span>\[([^\]]+)\]<\/span><a[^>]*onclick=window\.open\(["']([^"']+)["']\)[^>]*>([^<]+)<\/a><\/li>/gi;
  let m;
  while ((m = liRe.exec(html)) !== null) {
    const path = m[2].trim();
    const title = m[3].trim();
    const date = m[1].trim();
    const url = path.startsWith('http') ? path : `https://www.cert.org.cn${path.startsWith('/') ? '' : '/'}${path}`;
    items.push({
      title,
      url,
      date,
      severity: severityFromTitle(title),
    });
  }
  return items;
}

export async function briefing() {
  const timestamp = new Date().toISOString();

  try {
    let items = [];
    let via = 'rss';

    const rss = await fetchText(RSS_URLS);
    if (rss?.text && /<rss[\s>]/i.test(rss.text) && /<item>/i.test(rss.text)) {
      items = parseRssItems(rss.text);
    }

    if (items.length === 0) {
      const html = await fetchText(HTML_FALLBACK_URLS);
      if (html?.text) {
        items = parseFocusHtml(html.text);
        via = 'html';
      }
    }

    if (items.length === 0) {
      return {
        source: 'CNCERT',
        timestamp,
        status: 'rss_unavailable',
        message:
          'CNCERT RSS 与「重点关注」HTML 列表均不可用。请检查网络或稍后重试；也可访问 https://www.cert.org.cn/publish/main/8/index.html 人工查看。',
        signals: [{ severity: 'info', signal: 'CNCERT 数据源不可用 — 建议人工查看 cert.org.cn' }],
      };
    }

    const signals = [];
    if (items.length > 10) {
      signals.push({
        severity: 'medium',
        signal: `${items.length} 条 CNCERT 公告（${via}）— 近期通报较多`,
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
