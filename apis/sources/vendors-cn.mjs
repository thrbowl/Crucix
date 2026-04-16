// Chinese Security Vendor RSS Aggregator
// No keys required — public RSS/blog feeds
// Add new vendors to VENDOR_CN_FEEDS array only; no code changes needed

const VENDOR_CN_FEEDS = [
  { id: '360CERT',    name: '360 CERT',    url: 'https://cert.360.cn/api/rss' },
  { id: 'NSFOCUS',   name: '绿盟科技',    url: 'https://blog.nsfocus.net/feed/' },
  { id: 'TencentSRC',name: '腾讯 TSRC',   url: 'https://security.tencent.com/index.php/blog/rss' },
  { id: 'HuaweiPSIRT',name:'华为 PSIRT',  url: 'https://www.huawei.com/en/psirt/rss' },
  { id: 'Chaitin',   name: '长亭科技',    url: 'https://www.chaitin.cn/en/blog_rss' },
  { id: 'Sangfor',   name: '深信服千里目', url: 'https://sec.sangfor.com.cn/rss.xml' },
  { id: 'Antiy',     name: '安天',        url: 'https://www.antiy.cn/rss.xml' },
];

const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
function getTag(block, tag) {
  return (block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1]
    || block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1]
    || '').trim();
}
function getLink(block) {
  return block.match(/<link[^>]+href="([^"]+)"/)?.[1]
    || getTag(block, 'link')
    || getTag(block, 'guid')
    || '';
}

async function fetchVendorFeed(vendor) {
  const res = await fetch(vendor.url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Crucix/1.0', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = [];
  let m;
  itemRegex.lastIndex = 0;
  while ((m = itemRegex.exec(xml)) !== null) {
    const title = getTag(m[1], 'title');
    if (!title) continue;
    items.push({
      title: title.substring(0, 120),
      url: getLink(m[1]),
      date: getTag(m[1], 'pubDate') || getTag(m[1], 'updated') || getTag(m[1], 'published'),
      vendor: vendor.id,
    });
  }
  return items;
}

export async function briefing() {
  const timestamp = new Date().toISOString();
  const results = await Promise.allSettled(VENDOR_CN_FEEDS.map(v => fetchVendorFeed(v)));

  const articles = [];
  const byVendor = {};
  const errors = [];

  for (let i = 0; i < VENDOR_CN_FEEDS.length; i++) {
    const vendor = VENDOR_CN_FEEDS[i];
    if (results[i].status === 'fulfilled') {
      const items = results[i].value.slice(0, 5);
      byVendor[vendor.id] = items.length;
      articles.push(...items);
    } else {
      byVendor[vendor.id] = 0;
      errors.push({ vendor: vendor.id, error: results[i].reason?.message });
    }
  }

  articles.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const urgent = ['0day', '漏洞', 'apt', '勒索', 'ransomware', '高危', '预警', '紧急'];
  const urgentCount = articles.filter(a => urgent.some(k => a.title.toLowerCase().includes(k))).length;

  const signals = [];
  if (urgentCount > 0) signals.push({ severity: 'high', signal: `国内厂商: ${urgentCount} 篇涉及漏洞/APT/勒索关键词 — ${Object.values(byVendor).filter(n => n > 0).length} 家厂商有更新` });

  return {
    source: 'Vendors-CN',
    timestamp,
    totalArticles: articles.length,
    byVendor,
    recentArticles: articles.slice(0, 30),
    signals,
    ...(errors.length > 0 ? { feedErrors: errors } : {}),
  };
}

if (process.argv[1]?.endsWith('vendors-cn.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
