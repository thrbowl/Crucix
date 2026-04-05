// Multi-country CERT Aggregator — US-CERT, JPCERT, AusCERT
// RSS feeds, no API keys required.

const CERT_FEEDS = [
  { id: 'US',  name: 'US-CERT',  url: 'https://www.cisa.gov/news-events/alerts/rss.xml' },
  { id: 'JP',  name: 'JPCERT',   url: 'https://www.jpcert.or.jp/english/rss/jpcert-en.rdf' },
  { id: 'AU',  name: 'AusCERT',  url: 'https://www.auscert.org.au/rss/bulletins/' },
];

function parseRSSItems(xml) {
  const items = [];
  // Handle both <item> (RSS 2.0) and <entry> (Atom/RDF) elements
  const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || '').trim();
    const link = (block.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1]
      || block.match(/<link[^>]+href="([^"]+)"/)?.[1]
      || '').trim();
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]
      || block.match(/<dc:date>(.*?)<\/dc:date>/)?.[1]
      || block.match(/<updated>(.*?)<\/updated>/)?.[1]
      || block.match(/<published>(.*?)<\/published>/)?.[1]
      || '';
    if (title) {
      items.push({ title, url: link || null, date: pubDate || null });
    }
  }
  return items;
}

async function fetchCertFeed(cert) {
  const res = await fetch(cert.url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Crucix/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = parseRSSItems(xml);
  return items.map(item => ({ ...item, cert: cert.id }));
}

export async function briefing() {
  const timestamp = new Date().toISOString();

  const results = await Promise.allSettled(
    CERT_FEEDS.map(cert => fetchCertFeed(cert))
  );

  const allAlerts = [];
  const byCert = {};
  const errors = [];

  for (let i = 0; i < CERT_FEEDS.length; i++) {
    const cert = CERT_FEEDS[i];
    const result = results[i];
    if (result.status === 'fulfilled') {
      const items = result.value;
      byCert[cert.id] = items.length;
      allAlerts.push(...items);
    } else {
      byCert[cert.id] = 0;
      errors.push({ cert: cert.id, error: result.reason?.message || 'Unknown error' });
    }
  }

  allAlerts.sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });

  const signals = [];

  if (allAlerts.length === 0 && errors.length === CERT_FEEDS.length) {
    signals.push({ severity: 'info', signal: 'All CERT feeds failed — possible network or upstream issue' });
  }

  const criticalPattern = /emergency|critical|actively exploited|zero.?day|ransomware/i;
  const criticalAlerts = allAlerts.filter(a => criticalPattern.test(a.title));
  if (criticalAlerts.length > 0) {
    signals.push({
      severity: 'high',
      signal: `${criticalAlerts.length} critical alert(s) across international CERTs: ${criticalAlerts.slice(0, 3).map(a => `[${a.cert}] ${a.title}`).join('; ')}`,
    });
  }

  const activeCerts = Object.entries(byCert).filter(([, n]) => n > 0);
  if (activeCerts.length >= 2) {
    const total = activeCerts.reduce((s, [, n]) => s + n, 0);
    if (total > 20) {
      signals.push({
        severity: 'medium',
        signal: `${total} alerts across ${activeCerts.length} national CERTs — elevated global advisory volume`,
      });
    }
  }

  return {
    source: 'CERTs-Intl',
    timestamp,
    totalAlerts: allAlerts.length,
    byCert,
    recentAlerts: allAlerts.slice(0, 40).map(a => ({
      title: a.title,
      url: a.url,
      date: a.date,
      cert: a.cert,
    })),
    signals,
    ...(errors.length > 0 ? { feedErrors: errors } : {}),
  };
}

if (process.argv[1]?.endsWith('certs-intl.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
