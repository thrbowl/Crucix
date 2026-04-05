// ENISA — European Union Agency for Cybersecurity threat reports
// RSS feed, no API key required.

const RSS_URLS = [
  'https://www.enisa.europa.eu/publications/RSS',
  'https://www.enisa.europa.eu/rss/rss_publications.xml',
];

function parseRSSItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || '').trim();
    const link = (block.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1] || '').trim();
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]
      || block.match(/<dc:date>(.*?)<\/dc:date>/)?.[1]
      || '';
    const desc = (block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] || '').trim();
    if (title) {
      items.push({
        title,
        url: link || null,
        date: pubDate || null,
        description: desc.substring(0, 300) || null,
      });
    }
  }
  return items;
}

export async function briefing() {
  const timestamp = new Date().toISOString();

  let xml = null;
  let lastError = null;
  for (const url of RSS_URLS) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Crucix/1.0' },
      });
      if (res.ok) {
        xml = await res.text();
        break;
      }
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      lastError = e.message;
    }
  }

  if (!xml) {
    return { source: 'ENISA', timestamp, error: lastError || 'All RSS URLs failed' };
  }

  const reports = parseRSSItems(xml);

  const signals = [];
  if (reports.length === 0) {
    signals.push({ severity: 'info', signal: 'No recent ENISA publications found in RSS feed' });
  }

  const urgentKeywords = /threat landscape|ransomware|critical infrastructure|supply chain|zero.?day/i;
  const urgentReports = reports.filter(r => urgentKeywords.test(r.title) || urgentKeywords.test(r.description));
  if (urgentReports.length > 0) {
    signals.push({
      severity: 'medium',
      signal: `${urgentReports.length} ENISA report(s) related to high-priority threat topics: ${urgentReports.slice(0, 3).map(r => r.title).join('; ')}`,
    });
  }

  return {
    source: 'ENISA',
    timestamp,
    totalReports: reports.length,
    recentReports: reports.slice(0, 30),
    signals,
  };
}

if (process.argv[1]?.endsWith('enisa.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
