-- Source registry and health tracking.
-- Each row = one intelligence source. Worker updates health after every sweep.

CREATE TABLE sources (
  name                 TEXT PRIMARY KEY,
  domain               TEXT    NOT NULL,          -- vulnerability_intel | threat_actors | attack_exposure | event_tracking | china_intel | vendor_feeds
  type                 TEXT    NOT NULL DEFAULT 'threat_intel',  -- vulnerability | ioc | exposure | threat_intel | event | news
  enabled              BOOLEAN NOT NULL DEFAULT true,
  homepage_url         TEXT,

  -- Health metrics (updated by worker after each sweep)
  last_status          TEXT,                      -- active | inactive | error
  last_success_at      TIMESTAMPTZ,
  last_failure_at      TIMESTAMPTZ,
  last_error           TEXT,
  last_duration_ms     INT,
  avg_duration_ms      INT       DEFAULT 0,
  consecutive_failures INT       DEFAULT 0,
  total_successes      INT       DEFAULT 0,
  total_failures       INT       DEFAULT 0,

  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed all 49 active sources, grouped by domain

INSERT INTO sources (name, domain, type, homepage_url) VALUES
  -- Domain 1: Vulnerability Intelligence
  ('CISA-KEV',       'vulnerability_intel', 'vulnerability', 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog'),
  ('NVD',            'vulnerability_intel', 'vulnerability', 'https://nvd.nist.gov'),
  ('EPSS',           'vulnerability_intel', 'vulnerability', 'https://www.first.org/epss'),
  ('GitHub-Advisory','vulnerability_intel', 'vulnerability', 'https://github.com/advisories'),
  ('ExploitDB',      'vulnerability_intel', 'vulnerability', 'https://www.exploit-db.com'),
  ('OSV',            'vulnerability_intel', 'vulnerability', 'https://osv.dev'),
  ('VulnCheck',      'vulnerability_intel', 'vulnerability', 'https://vulncheck.com'),
  ('CIRCL-CVE',      'vulnerability_intel', 'vulnerability', 'https://www.circl.lu/services/cve-search'),

  -- Domain 2: Threat Actors & Malware
  ('OTX',            'threat_actors', 'threat_intel', 'https://otx.alienvault.com'),
  ('MalwareBazaar',  'threat_actors', 'ioc',          'https://bazaar.abuse.ch'),
  ('ThreatFox',      'threat_actors', 'ioc',          'https://threatfox.abuse.ch'),
  ('Feodo',          'threat_actors', 'ioc',          'https://feodotracker.abuse.ch'),
  ('ATT&CK-STIX',   'threat_actors', 'threat_intel', 'https://attack.mitre.org'),
  ('VirusTotal',     'threat_actors', 'threat_intel', 'https://www.virustotal.com'),
  ('URLhaus',        'threat_actors', 'ioc',          'https://urlhaus.abuse.ch'),
  ('CIRCL-PDNS',    'threat_actors', 'ioc',          'https://www.circl.lu/services/passive-dns'),
  ('Hybrid-Analysis','threat_actors', 'ioc',          'https://www.hybrid-analysis.com'),
  ('Malpedia',       'threat_actors', 'threat_intel', 'https://malpedia.caad.fkie.fraunhofer.de'),

  -- Domain 3: Attack Activity & Exposure
  ('GreyNoise',      'attack_exposure', 'ioc',      'https://www.greynoise.io'),
  ('Shodan',         'attack_exposure', 'exposure',  'https://www.shodan.io'),
  ('AbuseIPDB',      'attack_exposure', 'ioc',      'https://www.abuseipdb.com'),
  ('Cloudflare-Radar','attack_exposure','threat_intel','https://radar.cloudflare.com'),
  ('Spamhaus',       'attack_exposure', 'ioc',      'https://www.spamhaus.org'),
  ('OpenPhish',      'attack_exposure', 'ioc',      'https://openphish.com'),
  ('DShield',        'attack_exposure', 'ioc',      'https://isc.sans.edu'),
  ('Censys',         'attack_exposure', 'exposure',  'https://search.censys.io'),

  -- Domain 4: Event Tracking & Intel Community
  ('Ransomware-Live','event_tracking', 'event',     'https://ransomware.live'),
  ('ENISA',          'event_tracking', 'news',      'https://www.enisa.europa.eu'),
  ('CISA-Alerts',    'event_tracking', 'news',      'https://www.cisa.gov/news-events/cybersecurity-advisories'),
  ('CERTs-Intl',     'event_tracking', 'news',      'https://www.cert.org'),
  ('Telegram',       'event_tracking', 'threat_intel','https://telegram.org'),
  ('HackerNews-RSS', 'event_tracking', 'news',      'https://news.ycombinator.com'),
  ('BleepingComputer','event_tracking','news',      'https://www.bleepingcomputer.com'),
  ('SecurityWeek',   'event_tracking', 'news',      'https://www.securityweek.com'),
  ('Tavily',         'event_tracking', 'news',      'https://tavily.com'),

  -- Domain 5: China Intelligence
  ('CNCERT',         'china_intel', 'news',          'https://www.cert.org.cn'),
  ('CNVD',           'china_intel', 'vulnerability', 'https://www.cnvd.org.cn'),
  ('CNNVD',          'china_intel', 'vulnerability', 'https://www.cnnvd.org.cn'),
  ('Qianxin',        'china_intel', 'news',          'https://ti.qianxin.com'),
  ('Qianxin-Hunter', 'china_intel', 'exposure',      'https://hunter.qianxin.com'),
  ('Qianxin-TI',     'china_intel', 'threat_intel',  'https://ti.qianxin.com'),
  ('Baidu-Search',   'china_intel', 'news',          'https://www.baidu.com'),
  ('FOFA',           'china_intel', 'exposure',      'https://fofa.info'),
  ('ZoomEye',        'china_intel', 'exposure',      'https://www.zoomeye.org'),
  ('FreeBuf',        'china_intel', 'news',          'https://www.freebuf.com'),
  ('Anquanke',       'china_intel', 'news',          'https://www.anquanke.com'),
  ('4hou',           'china_intel', 'news',          'https://www.4hou.com'),

  -- Domain 6: Vendor Announcements
  ('Vendors-Intl',   'vendor_feeds', 'news', 'https://vendors.example.com'),
  ('Vendors-CN',     'vendor_feeds', 'news', 'https://vendors.example.cn')
ON CONFLICT (name) DO NOTHING;
