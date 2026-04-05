// ENISA — EU cybersecurity agency updates (RSS). Legacy publication RSS paths 404; main site feed works.

const RSS_URLS = [
  'https://www.enisa.europa.eu/rss.xml',
  'https://www.enisa.europa.eu/publications/RSS',
  'https://www.enisa.europa.eu/rss/rss_publications.xml',
];

const FETCH_HEADERS = {
  Accept: 'application/rss+xml, application/xml, text/xml, */*',
  'User-Agent': 'Mozilla/5.0 (compatible; Crucix/1.0)',
};

function parseRSSItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] || '').trim();
    const link = (block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1] || '').trim();
    const pubDate =
      block.match(/<pubDate>([^<]*)<\/pubDate>/i)?.[1]?.trim()
      || block.match(/<dc:date>([^<]*)<\/dc:date>/i)?.[1]?.trim()
      || '';
    const desc = (
      block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1] || ''
    ).trim();
    if (title) {
      items.push({
        title,
        url: link || null,
        published: pubDate || null,
        date: pubDate || null,
        description: desc.substring(0, 300) || null,
      });
    }
  }
  return items;
}

function prioritizePublications(reports) {
  const pub = reports.filter(r => (r.url || '').includes('/publications/'));
  const rest = reports.filter(r => !(r.url || '').includes('/publications/'));
  return [...pub, ...rest];
}

export async function briefing() {
  const timestamp = new Date().toISOString();

  let xml = null;
  let lastError = null;
  for (const url of RSS_URLS) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: FETCH_HEADERS,
        redirect: 'follow',
      });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const text = await res.text();
      if (text && text.includes('<item')) {
        xml = text;
        break;
      }
      lastError = 'Empty or non-RSS body';
    } catch (e) {
      lastError = e.message;
    }
  }

  if (!xml) {
    return { source: 'ENISA', timestamp, error: lastError || 'All RSS URLs failed' };
  }

  let reports = parseRSSItems(xml);
  reports = prioritizePublications(reports);

  const signals = [];
  if (reports.length === 0) {
    signals.push({ severity: 'info', signal: 'No recent ENISA items found in RSS feed' });
  }

  const urgentKeywords = /threat landscape|ransomware|critical infrastructure|supply chain|zero.?day/i;
  const urgentReports = reports.filter(
    r => urgentKeywords.test(r.title) || urgentKeywords.test(r.description || ''),
  );
  if (urgentReports.length > 0) {
    signals.push({
      severity: 'medium',
      signal: `${urgentReports.length} ENISA item(s) related to high-priority threat topics: ${urgentReports
        .slice(0, 3)
        .map(r => r.title)
        .join('; ')}`,
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
