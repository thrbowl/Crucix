// lib/pipeline/raw.mjs
// Persist per-item raw intelligence data from source adapter outputs.

import { createHash } from 'node:crypto';

function md5(str) {
  return createHash('md5').update(str).digest('hex');
}

function contentHash(rawData) {
  return md5(JSON.stringify(rawData));
}

/**
 * Compute dedup key:
 *  - url + modified_at  → version-aware URL identity
 *  - url only           → URL identity (cross-source dedup)
 *  - neither            → source-scoped content hash
 */
function dedupKey(url, modifiedAt, sourceName, hash) {
  if (url && modifiedAt) return md5(`${url}::${modifiedAt}`);
  if (url)               return md5(url);
  return                        md5(`${sourceName}::${hash}`);
}

function parseTs(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * SOURCE_MAP — per source, which array to iterate and how to extract fields.
 *
 * Each array entry:
 *   field     — property name on the source output (the items array)
 *   title     — property name for a short human-readable label (null = derive or skip)
 *   published — property name for published/first-seen date
 *   modified  — property name for last-modified date
 *   url       — property name for a URL
 *
 * key: null entries are plain-string arrays (item itself is the value).
 *
 * Omitted sources (no per-item array): VirusTotal, Shodan, ZoomEye, FOFA,
 *   Cloudflare-Radar (aggregated stats), Telegram (nested channel structure), CNNVD.
 */
const SOURCE_MAP = {
  // === Vulnerability ===
  'NVD':             { type: 'vulnerability', arrays: [
    { field: 'recentCVEs',      title: 'cveId',       published: 'published',     modified: null,          url: null      },
  ]},
  'CISA-KEV':        { type: 'vulnerability', arrays: [
    { field: 'vulnerabilities', title: 'cveID',       published: 'dateAdded',     modified: null,          url: null      },
  ]},
  'EPSS':            { type: 'vulnerability', arrays: [
    { field: 'topByScore',      title: 'cve',         published: null,            modified: null,          url: null      },
    { field: 'recentSpikes',    title: 'cve',         published: null,            modified: null,          url: null      },
  ]},
  'GitHub-Advisory': { type: 'vulnerability', arrays: [
    { field: 'advisories',      title: 'ghsaId',      published: 'publishedAt',   modified: 'updatedAt',   url: null      },
  ]},
  'ExploitDB':       { type: 'vulnerability', arrays: [
    { field: 'recentExploits',  title: 'title',       published: 'date',          modified: null,          url: 'url'     },
  ]},
  'OSV':             { type: 'vulnerability', arrays: [
    { field: 'vulnerabilities', title: 'id',          published: 'published',     modified: null,          url: null      },
  ]},
  'VulnCheck':       { type: 'vulnerability', arrays: [
    { field: 'kevEntries',      title: 'cveId',       published: 'exploitedDate', modified: null,          url: null      },
    { field: 'recentCVEs',      title: 'cveId',       published: 'published',     modified: null,          url: null      },
  ]},
  'CIRCL-CVE':       { type: 'vulnerability', arrays: [
    { field: 'recentCVEs',      title: 'id',          published: 'published',     modified: 'modified',    url: null      },
  ]},
  'CNVD':            { type: 'vulnerability', arrays: [
    { field: 'recentVulns',     title: 'id',          published: 'publishDate',   modified: null,          url: null      },
  ]},

  // === IOC ===
  'MalwareBazaar':   { type: 'ioc', arrays: [
    { field: 'recentSamples',   title: 'sha256_hash', published: 'firstSeen',     modified: null,          url: null      },
  ]},
  'ThreatFox':       { type: 'ioc', arrays: [
    { field: 'iocs',            title: 'value',       published: 'firstSeen',     modified: null,          url: null      },
  ]},
  'Feodo':           { type: 'ioc', arrays: [
    { field: 'c2Servers',       title: 'ip',          published: 'firstSeen',     modified: null,          url: null      },
  ]},
  'URLhaus':         { type: 'ioc', arrays: [
    { field: 'recentUrls',      title: 'url',         published: 'dateAdded',     modified: null,          url: 'url'     },
  ]},
  'CIRCL-PDNS':      { type: 'ioc', arrays: [
    { field: 'results',         title: 'rrname',      published: 'time_first',    modified: 'time_last',   url: null      },
  ]},
  'Hybrid-Analysis': { type: 'ioc', arrays: [
    { field: 'samples',         title: 'sha256',      published: null,            modified: null,          url: null      },
  ]},
  'AbuseIPDB':       { type: 'ioc', arrays: [
    { field: 'topAbusers',      title: 'ipAddress',   published: null,            modified: 'lastReportedAt', url: null   },
  ]},
  'Spamhaus':        { type: 'ioc', arrays: [
    { field: 'sampleEntries',   title: null,          published: null,            modified: null,          url: null      },
  ]},
  'OpenPhish':       { type: 'ioc', arrays: [
    { field: 'urls',            title: null,          published: null,            modified: null,          url: null      },
  ]},
  'DShield':         { type: 'ioc', arrays: [
    { field: 'topIPs',          title: 'ip',          published: null,            modified: null,          url: null      },
  ]},
  'GreyNoise':       { type: 'ioc', arrays: [
    { field: 'topScanners',     title: 'ip',          published: null,            modified: 'last_seen',   url: null      },
  ]},

  // === Exposure ===
  'Censys':          { type: 'exposure', arrays: [
    { field: 'queryResults',    title: 'label',       published: null,            modified: null,          url: null      },
  ]},
  'Qianxin-Hunter':  { type: 'exposure', arrays: [
    { field: 'queryResults',    title: 'query',       published: null,            modified: null,          url: null      },
  ]},

  // === Threat Intel ===
  'OTX':             { type: 'threat_intel', arrays: [
    { field: 'recentPulses',    title: 'name',        published: 'created',       modified: 'modified',    url: null      },
  ]},
  'ATT&CK-STIX':     { type: 'threat_intel', arrays: [
    { field: 'techniques',      title: 'name',        published: null,            modified: null,          url: null      },
  ]},
  'Malpedia':        { type: 'threat_intel', arrays: [
    { field: 'families',        title: null,          published: null,            modified: null,          url: null      },
  ]},
  'Qianxin-TI':      { type: 'threat_intel', arrays: [
    { field: 'iocs',            title: 'value',       published: null,            modified: null,          url: null      },
    { field: 'malware',         title: 'name',        published: 'date',          modified: null,          url: null      },
    { field: 'aptGroups',       title: 'name',        published: null,            modified: 'lastSeen',    url: null      },
  ]},

  // === Events ===
  'Ransomware-Live': { type: 'event', arrays: [
    { field: 'victims',         title: 'name',        published: 'discovered',    modified: null,          url: 'website' },
  ]},

  // === News ===
  'BleepingComputer': { type: 'news', arrays: [{ field: 'recentArticles', title: 'title', published: 'date', modified: null, url: 'url' }] },
  'HackerNews-RSS':   { type: 'news', arrays: [{ field: 'recentArticles', title: 'title', published: 'date', modified: null, url: 'url' }] },
  'SecurityWeek':     { type: 'news', arrays: [{ field: 'recentArticles', title: 'title', published: 'date', modified: null, url: 'url' }] },
  'FreeBuf':          { type: 'news', arrays: [{ field: 'recentArticles', title: 'title', published: 'date', modified: null, url: 'url' }] },
  'Anquanke':         { type: 'news', arrays: [{ field: 'recentArticles', title: 'title', published: 'date', modified: null, url: 'url' }] },
  '4hou':             { type: 'news', arrays: [{ field: 'recentArticles', title: 'title', published: 'date', modified: null, url: 'url' }] },
  'ENISA':            { type: 'news', arrays: [{ field: 'recentReports',  title: 'title', published: 'published', modified: null, url: 'url' }] },
  'CISA-Alerts':      { type: 'news', arrays: [{ field: 'recentAlerts',   title: 'title', published: 'date', modified: null, url: 'url' }] },
  'CERTs-Intl':       { type: 'news', arrays: [{ field: 'recentAlerts',   title: 'title', published: 'date', modified: null, url: 'url' }] },
  'Tavily':           { type: 'news', arrays: [{ field: 'items',          title: 'title', published: 'date', modified: null, url: 'url' }] },
  'Baidu-Search':     { type: 'news', arrays: [{ field: 'items',          title: 'title', published: 'date', modified: null, url: 'url' }] },
  'CNCERT':           { type: 'news', arrays: [{ field: 'recentAlerts',   title: 'title', published: 'date', modified: null, url: 'url' }] },
  'Qianxin':          { type: 'news', arrays: [{ field: 'recentThreats',  title: 'title', published: 'date', modified: null, url: 'url' }] },
  'Vendors-Intl':     { type: 'news', arrays: [{ field: 'recentArticles', title: 'title', published: 'date', modified: null, url: 'url' }] },
  'Vendors-CN':       { type: 'news', arrays: [{ field: 'recentArticles', title: 'title', published: 'date', modified: null, url: 'url' }] },
};

const INSERT_SQL = `
  INSERT INTO raw_intel_items
    (source_name, source_type, title, url, published_at, modified_at, content_hash, dedup_key, content)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (dedup_key) DO NOTHING
`;

/**
 * Persist raw per-item intelligence from all source adapter outputs.
 *
 * @param {object} pool - pg Pool
 * @param {object} sources - rawData.sources from fullBriefing()
 * @returns {Promise<{saved: number, skipped: number, errors: string[]}>}
 */
export async function saveRawIntel(pool, sources) {
  if (!pool) {
    console.warn('[RawIntel] Database not configured — skipping');
    return { saved: 0, skipped: 0, errors: [] };
  }

  let saved = 0;
  let skipped = 0;
  const errors = [];

  for (const [sourceName, sourceData] of Object.entries(sources)) {
    if (!sourceData || sourceData.status === 'inactive') continue;

    const config = SOURCE_MAP[sourceName];
    if (!config) continue;

    for (const { field, title: titleField, published, modified, url: urlField } of config.arrays) {
      const arr = sourceData[field];
      if (!Array.isArray(arr) || arr.length === 0) continue;

      for (const item of arr) {
        // Normalise plain-string arrays (OpenPhish URLs, Malpedia families, Spamhaus CIDRs)
        const obj = typeof item === 'string' ? { value: item } : item;

        const hash    = contentHash(obj);
        const itemUrl = urlField ? (obj[urlField] ?? null)
                      : (typeof item === 'string' && item.startsWith('http') ? item : null);
        const modAt   = parseTs(modified ? obj[modified] : null);
        const dKey    = dedupKey(itemUrl, modAt, sourceName, hash);
        const pubAt   = parseTs(published ? obj[published] : null);
        const itemTitle = titleField ? (obj[titleField] ?? null)
                        : (typeof item === 'string' ? item : null);

        try {
          const result = await pool.query(INSERT_SQL, [
            sourceName,
            config.type,
            itemTitle ? String(itemTitle).substring(0, 500) : null,
            itemUrl,
            pubAt,
            modAt,
            hash,
            dKey,
            JSON.stringify(obj),
          ]);
          if (result.rowCount > 0) saved++; else skipped++;
        } catch (err) {
          errors.push(`${sourceName}: ${err.message}`);
          skipped++;
        }
      }
    }
  }

  console.log(`[RawIntel] Saved ${saved} items, skipped ${skipped} (duplicates)${errors.length ? `, ${errors.length} errors` : ''}`);
  if (errors.length > 0) console.error('[RawIntel] Errors (first 5):', errors.slice(0, 5));

  return { saved, skipped, errors };
}
