// CISA Cybersecurity Alerts — RSS feed of advisories
// No API key required. Tracks ICS advisories, vulnerability alerts, and emergency directives.

const RSS_URLS = [
  'https://www.cisa.gov/cybersecurity-advisories/all.xml',
  'https://www.cisa.gov/news-events/cybersecurity-advisories/rss.xml',
  'https://www.cisa.gov/cybersecurity-advisories/ics-advisories.xml',
];

function parseRSSItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || '').trim();
    const link = (block.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1] || '').trim();
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
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
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; security-research-bot/1.0)',
          'Accept': 'application/rss+xml, application/xml, */*',
        },
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
    return { source: 'CISA-Alerts', timestamp, error: lastError || 'All RSS URLs failed' };
  }

  const alerts = parseRSSItems(xml);

  const signals = [];

  const criticalPattern = /emergency|critical|actively exploited|zero.?day/i;
  const criticalAlerts = alerts.filter(a => criticalPattern.test(a.title) || criticalPattern.test(a.description));
  if (criticalAlerts.length > 0) {
    signals.push({
      severity: 'critical',
      signal: `${criticalAlerts.length} CISA alert(s) flagged as emergency/critical: ${criticalAlerts.slice(0, 3).map(a => a.title).join('; ')}`,
    });
  }

  const icsPattern = /\bICS\b|industrial control|SCADA|OT\b/i;
  const icsAlerts = alerts.filter(a => icsPattern.test(a.title) || icsPattern.test(a.description));
  if (icsAlerts.length > 3) {
    signals.push({
      severity: 'medium',
      signal: `${icsAlerts.length} ICS/OT-related advisories in current feed — industrial sector risk elevated`,
    });
  }

  return {
    source: 'CISA-Alerts',
    timestamp,
    totalAlerts: alerts.length,
    recentAlerts: alerts.slice(0, 30),
    signals,
  };
}

if (process.argv[1]?.endsWith('cisa-alerts.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
