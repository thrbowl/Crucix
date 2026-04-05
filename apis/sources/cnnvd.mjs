const QUERY_URL = 'https://www.cnnvd.org.cn/web/vulnerability/querylist.tag';

/** 公开页面（SPA 外壳）；querylist 无 token 时返回 JSON 401，不参与公开抓取 */
const PUBLIC_URLS = ['https://www.cnnvd.org.cn/', 'http://www.cnnvd.org.cn/'];

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, application/xhtml+xml, */*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Referer: 'https://www.cnnvd.org.cn/',
};

const itemRegex = /<item>([\s\S]*?)<\/item>/g;
const getTag = (block, tag) => (block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1] || '').trim();

function pickRows(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const d = payload.data ?? payload.result ?? payload;
  const rows = d?.records ?? d?.list ?? d?.rows ?? d?.data ?? payload.records ?? payload.list ?? [];
  return Array.isArray(rows) ? rows : [];
}

function normalizeRecord(row) {
  const id =
    row.cnnvdCode ||
    row.cnnvdId ||
    row.vulNo ||
    row.id ||
    (typeof row.name === 'string' && row.name.match(/CNNVD-\d{6}-\d+/)?.[0]) ||
    (typeof row.title === 'string' && row.title.match(/CNNVD-\d{6}-\d+/)?.[0]) ||
    null;
  const title = (row.name || row.title || row.vulName || row.vulnerabilityName || id || '').trim();
  const date =
    row.publishedTime ||
    row.publishTime ||
    row.createTime ||
    row.modifyTime ||
    row.date ||
    row.pubDate ||
    null;
  const severity =
    row.hazardLevel ||
    row.severity ||
    row.level ||
    row.riskLevel ||
    row.vulLevel ||
    'unknown';
  let url = row.url || row.link || row.detailUrl;
  if (!url && id) {
    url = `https://www.cnnvd.org.cn/home/globalList?keyword=${encodeURIComponent(id)}`;
  }
  return { id, cnnvdId: id, title, date, severity: String(severity), url };
}

async function fetchJson(url, headers) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(18000),
    headers,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: res.ok, json: null, text };
  }
  return { ok: res.ok, json, text };
}

async function fetchCnnvdApiList(token) {
  const qs = new URLSearchParams({ pageIndex: '1', pageSize: '25' });
  const url = `${QUERY_URL}?${qs}`;
  const headers = {
    ...BROWSER_HEADERS,
    ...(token ? { token } : {}),
  };
  const { json } = await fetchJson(url, headers);
  if (!json || json.code !== 200) return [];
  const rows = pickRows(json);
  return rows.map(normalizeRecord).filter(r => r.title || r.id);
}

function parseRssItems(xml) {
  const items = [];
  let m;
  itemRegex.lastIndex = 0;
  while ((m = itemRegex.exec(xml)) !== null) {
    const id =
      getTag(m[1], 'guid')?.match(/CNNVD-\d{6}-\d+/)?.[0] ||
      getTag(m[1], 'link')?.match(/CNNVD-\d{6}-\d+/)?.[0] ||
      null;
    items.push({
      id,
      cnnvdId: id,
      title: getTag(m[1], 'title'),
      date: getTag(m[1], 'pubDate') || null,
      severity: getTag(m[1], 'category') || 'unknown',
      url: getTag(m[1], 'link') || (id ? `https://www.cnnvd.org.cn/home/globalList?keyword=${encodeURIComponent(id)}` : null),
    });
  }
  return items.filter(i => i.title || i.id);
}

function parseLooseHtmlCnnvd(html) {
  if (!html || !/CNNVD-\d{6}-\d+/.test(html)) return [];
  const seen = new Set();
  const list = [];
  const anchorRe = /<a[^>]+href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const id = href.match(/CNNVD-\d{6}-\d+/)?.[0] || text.match(/CNNVD-\d{6}-\d+/)?.[0];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    let url = null;
    if (href.startsWith('http')) url = href;
    else if (href.startsWith('/')) url = `https://www.cnnvd.org.cn${href}`;
    if (!url) url = `https://www.cnnvd.org.cn/home/globalList?keyword=${encodeURIComponent(id)}`;
    list.push({
      id,
      cnnvdId: id,
      title: text || id,
      date: null,
      severity: 'unknown',
      url,
    });
    if (list.length >= 25) return list;
  }
  const idRe = /CNNVD-\d{6}-\d+/g;
  let im;
  while ((im = idRe.exec(html)) !== null) {
    const id = im[0];
    if (seen.has(id)) continue;
    seen.add(id);
    list.push({
      id,
      cnnvdId: id,
      title: id,
      date: null,
      severity: 'unknown',
      url: `https://www.cnnvd.org.cn/home/globalList?keyword=${encodeURIComponent(id)}`,
    });
    if (list.length >= 25) break;
  }
  return list;
}

async function fetchPublicHtml() {
  for (const url of PUBLIC_URLS) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(18000),
        headers: BROWSER_HEADERS,
      });
      if (!res.ok) continue;
      return { text: await res.text(), url };
    } catch {
      continue;
    }
  }
  return null;
}

export async function briefing() {
  const timestamp = new Date().toISOString();
  const token = process.env.CNNVD_TOKEN?.trim();

  try {
    if (token) {
      const fromApi = await fetchCnnvdApiList(token);
      if (fromApi.length > 0) {
        const signals = [];
        if (fromApi.length > 10) {
          signals.push({ severity: 'medium', signal: `${fromApi.length} 条 CNNVD 漏洞记录（API）` });
        }
        return {
          source: 'CNNVD',
          timestamp,
          status: 'connected',
          recentVulns: fromApi.slice(0, 20),
          signals,
        };
      }
    }

    const result = await fetchPublicHtml();

    if (!result) {
      return {
        source: 'CNNVD',
        timestamp,
        status: 'unavailable',
        message: 'CNNVD 站点不可达，或网络受限。',
        signals: [{ severity: 'info', signal: 'CNNVD 不可达 — 可配置 CNNVD_TOKEN（登录 www.cnnvd.org.cn 后从请求头 token 复制）以启用列表 API' }],
      };
    }

    const rssItems = parseRssItems(result.text);
    if (rssItems.length > 0) {
      const signals = [];
      if (rssItems.length > 10) {
        signals.push({ severity: 'medium', signal: `${rssItems.length} 条 CNNVD 相关 RSS 条目` });
      }
      return {
        source: 'CNNVD',
        timestamp,
        status: 'connected',
        recentVulns: rssItems.slice(0, 20),
        signals,
      };
    }

    const htmlItems = parseLooseHtmlCnnvd(result.text);
    if (htmlItems.length > 0) {
      return {
        source: 'CNNVD',
        timestamp,
        status: 'connected',
        recentVulns: htmlItems.slice(0, 20),
        signals: [{ severity: 'info', signal: `从 HTML 中解析到 ${htmlItems.length} 条 CNNVD 编号` }],
      };
    }

    return {
      source: 'CNNVD',
      timestamp,
      status: 'partial',
      message:
        '页面已加载，但未发现 RSS 或含 CNNVD 编号的 HTML。官网为单页应用，漏洞列表需登录后由接口返回；请在 .env 设置 CNNVD_TOKEN（浏览器登录后从 Network 请求头复制 token）以启用 querylist 拉取。',
      recentVulns: [],
      signals: [{ severity: 'info', signal: 'CNNVD：配置 CNNVD_TOKEN 后可调用官方列表接口' }],
    };
  } catch (e) {
    return { source: 'CNNVD', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('cnnvd.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
