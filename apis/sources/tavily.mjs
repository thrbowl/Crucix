// Tavily AI Search — active threat intelligence sweep
// Requires TAVILY_API_KEY (https://tavily.com)
// Queries 8 threat-focused keywords per sweep, deduplicates by URL.
// Controls: TAVILY_ENABLED=true/false, TAVILY_MAX_RESULTS=40

const TAVILY_API = 'https://api.tavily.com/search';

const TAVILY_QUERIES = [
  'zero-day exploit actively exploited 2026',
  'ransomware group new attack campaign 2026',
  'APT nation-state cyberattack attribution 2026',
  'critical vulnerability emergency patch 2026',
  'supply chain attack software compromise 2026',
  'data breach credentials leak 2026',
  '高危漏洞 在野利用 2026',
  '勒索软件 攻击 受害者 2026',
];

const HIGH_KEYWORDS = ['zero-day', '0day', 'critical', 'ransomware', 'actively exploited', '高危', '勒索'];

function scoreLevel(title) {
  const t = (title || '').toLowerCase();
  return HIGH_KEYWORDS.some(k => t.includes(k)) ? 'high' : 'medium';
}

async function queryTavily(apiKey, query, maxResults) {
  const res = await fetch(TAVILY_API, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: Math.min(maxResults, 5),
      include_answer: false,
      include_raw_content: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  return res.json();
}

export async function briefing() {
  const timestamp = new Date().toISOString();
  const apiKey = process.env.TAVILY_API_KEY;
  const enabled = process.env.TAVILY_ENABLED !== 'false';
  const maxTotal = parseInt(process.env.TAVILY_MAX_RESULTS || '40', 10);

  if (!apiKey) {
    return { source: 'Tavily', timestamp, status: 'no_credentials', message: 'Set TAVILY_API_KEY in .env' };
  }
  if (!enabled) {
    return { source: 'Tavily', timestamp, status: 'inactive', reason: 'disabled', message: 'TAVILY_ENABLED=false' };
  }

  const perQuery = Math.max(1, Math.floor(maxTotal / TAVILY_QUERIES.length));
  const seenUrls = new Set();
  const items = [];

  for (const query of TAVILY_QUERIES) {
    if (items.length >= maxTotal) break;
    try {
      const data = await queryTavily(apiKey, query, perQuery);
      for (const r of (data.results || [])) {
        if (!r.url || seenUrls.has(r.url)) continue;
        seenUrls.add(r.url);
        items.push({
          title: (r.title || '').substring(0, 120),
          url: r.url,
          date: r.published_date || timestamp,
          source: 'Tavily',
          query,
          level: scoreLevel(r.title),
          type: 'news',
        });
      }
    } catch (e) {
      // Skip failed queries, continue with next
    }
  }

  if (items.length === 0) {
    return { source: 'Tavily', timestamp, status: 'rss_unavailable', message: 'All Tavily queries returned no results', signals: [] };
  }

  const highCount = items.filter(i => i.level === 'high').length;
  const signals = [];
  if (highCount > 0) signals.push({ severity: 'high', signal: `Tavily AI sweep: ${highCount} high-priority results across ${TAVILY_QUERIES.length} threat queries` });

  return { source: 'Tavily', timestamp, totalItems: items.length, items, signals };
}

if (process.argv[1]?.endsWith('tavily.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
