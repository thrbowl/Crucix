// Baidu Qianfan Web Search — Chinese security news search
// Requires BAIDU_QIANFAN_API_KEY + BAIDU_QIANFAN_SECRET_KEY
// Searches Chinese web for security keywords not covered by RSS feeds

// Token cache (Baidu access tokens expire in 30 days)
let _tokenCache = { token: null, expiresAt: 0 };

const TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token';
// Verify this endpoint from your Qianfan console (Apps → API Address)
const SEARCH_URL = 'https://aip.baidubce.com/rpc/2.0/erniebot/v1/plugin/search';

const QUERIES = [
  '最新高危漏洞 在野利用',
  '勒索软件 新攻击 受害者',
  'APT组织 网络攻击 最新',
  '零日漏洞 安全公告',
  '数据泄露 网络安全事件',
];

async function getAccessToken(apiKey, secretKey) {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt) return _tokenCache.token;
  const res = await fetch(`${TOKEN_URL}?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`, {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Baidu token HTTP ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('No access_token in response');
  _tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 300) * 1000 };
  return data.access_token;
}

async function searchOne(token, query) {
  const res = await fetch(`${SEARCH_URL}?access_token=${token}`, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, num: 5 }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function briefing() {
  const timestamp = new Date().toISOString();
  const apiKey = process.env.BAIDU_QIANFAN_API_KEY;
  const secretKey = process.env.BAIDU_QIANFAN_SECRET_KEY;

  if (!apiKey || !secretKey) {
    return { source: 'Baidu-Search', timestamp, status: 'no_credentials', message: 'Set BAIDU_QIANFAN_API_KEY and BAIDU_QIANFAN_SECRET_KEY in .env' };
  }

  try {
    const token = await getAccessToken(apiKey, secretKey);
    const seenUrls = new Set();
    const items = [];

    for (const query of QUERIES) {
      try {
        const data = await searchOne(token, query);
        const results = data.results || data.search_results || data.data || [];
        for (const r of results) {
          const url = r.url || r.link;
          if (!url || seenUrls.has(url)) continue;
          seenUrls.add(url);
          items.push({
            title: (r.title || r.name || '').substring(0, 120),
            url,
            date: r.publish_time || r.date || null,
            source: 'Baidu-Search',
            query,
          });
        }
      } catch { continue; }
    }

    if (items.length === 0) {
      return { source: 'Baidu-Search', timestamp, status: 'api_error', message: 'Baidu search returned no results — verify SEARCH_URL endpoint in baidu-search.mjs matches your Qianfan app', signals: [] };
    }

    return { source: 'Baidu-Search', timestamp, totalItems: items.length, items, signals: [] };
  } catch (e) {
    return { source: 'Baidu-Search', timestamp, error: e.message };
  }
}

if (process.argv[1]?.endsWith('baidu-search.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
