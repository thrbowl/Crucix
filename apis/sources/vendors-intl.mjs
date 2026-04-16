// International Security Vendor RSS Aggregator
// No keys required — all public RSS/Atom feeds
// Add new vendors to VENDOR_INTL_FEEDS array only; no code changes needed

const VENDOR_INTL_FEEDS = [
  { id: 'MSRC',        name: 'Microsoft MSRC',     url: 'https://api.msrc.microsoft.com/update-guide/rss' },
  { id: 'Talos',       name: 'Cisco Talos',         url: 'https://blog.talosintelligence.com/feeds/posts/default' },
  { id: 'Unit42',      name: 'Palo Alto Unit42',    url: 'https://unit42.paloaltonetworks.com/feed/' },
  { id: 'CrowdStrike', name: 'CrowdStrike',         url: 'https://www.crowdstrike.com/blog/feed/' },
  { id: 'Mandiant',    name: 'Mandiant',            url: 'https://www.mandiant.com/resources/blog/rss.xml' },
  { id: 'ESET',        name: 'ESET',                url: 'https://www.welivesecurity.com/en/feed/' },
  { id: 'Kaspersky',   name: 'Kaspersky Securelist', url: 'https://securelist.com/feed/' },
  { id: 'IBM-XForce',  name: 'IBM X-Force',         url: 'https://securityintelligence.com/feed/' },
  { id: 'CheckPoint',  name: 'Check Point Research', url: 'https://research.checkpoint.com/feed/' },
  { id: 'Rapid7',      name: 'Rapid7',              url: 'https://blog.rapid7.com/rss/' },
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
    headers: { 'User-Agent': 'Crucix/1.0' },
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
  const results = await Promise.allSettled(VENDOR_INTL_FEEDS.map(v => fetchVendorFeed(v)));

  const articles = [];
  const byVendor = {};
  const errors = [];

  for (let i = 0; i < VENDOR_INTL_FEEDS.length; i++) {
    const vendor = VENDOR_INTL_FEEDS[i];
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

  const urgent = ['zero-day', '0day', 'apt', 'ransomware', 'critical', 'actively exploited', 'supply chain'];
  const urgentCount = articles.filter(a => urgent.some(k => a.title.toLowerCase().includes(k))).length;

  const signals = [];
  if (urgentCount > 0) signals.push({ severity: 'high', signal: `Vendor feeds: ${urgentCount} articles flagged critical/APT/ransomware across ${Object.values(byVendor).filter(n => n > 0).length} vendors` });

  return {
    source: 'Vendors-Intl',
    timestamp,
    totalArticles: articles.length,
    byVendor,
    recentArticles: articles.slice(0, 30),
    signals,
    ...(errors.length > 0 ? { feedErrors: errors } : {}),
  };
}

if (process.argv[1]?.endsWith('vendors-intl.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
