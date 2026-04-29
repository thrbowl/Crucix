// lib/api/v1/intel.mjs
// Intelligence search across raw_intel_items

import { Router } from 'express';
import { requireCredits, CREDIT_COSTS } from '../../credits/index.mjs';
import { sendApiResponse, parsePagination, creditsFromReq } from './response.mjs';

const VALID_SOURCE_TYPES = new Set([
  'vulnerability', 'ioc', 'threat_intel', 'event', 'news', 'exposure',
]);

/**
 * Build WHERE clause + params for raw_intel_items search.
 */
function buildFilters(body) {
  const conditions = [];
  const params = [];
  let idx = 1;

  const { source_types, sources, date_from, date_to } = body ?? {};

  if (date_from) {
    conditions.push(`published_at >= $${idx++}`);
    params.push(date_from);
  }

  if (date_to) {
    conditions.push(`published_at <= $${idx++}`);
    params.push(date_to);
  }

  if (Array.isArray(source_types) && source_types.length > 0) {
    const valid = source_types.filter(t => VALID_SOURCE_TYPES.has(t));
    if (valid.length > 0) {
      conditions.push(`source_type = ANY($${idx++})`);
      params.push(valid);
    }
  }

  if (Array.isArray(sources) && sources.length > 0) {
    conditions.push(`source_name = ANY($${idx++})`);
    params.push(sources);
  }

  return { conditions, params, nextIdx: idx };
}

export default function intelRouter({ getPool }) {
  const router = Router();

  // POST /intel/summary { q?, date_from?, date_to? } — counts per source_type under current filters
  router.post('/summary', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not configured' });

    const { conditions, params, nextIdx } = buildFilters(req.body);
    const { q } = req.body ?? {};
    const query = typeof q === 'string' ? q.trim() : '';

    if (query.length > 0) {
      const tsQuery = query.split(/\s+/).filter(w => w.length > 0).map(w => `${w}:*`).join(' & ');
      conditions.push(
        `(to_tsvector('simple', coalesce(title, '')) @@ to_tsquery('simple', $${nextIdx})` +
        ` OR to_tsvector('simple', coalesce(content, '')) @@ to_tsquery('simple', $${nextIdx})` +
        ` OR title ILIKE $${nextIdx + 1}` +
        ` OR content ILIKE $${nextIdx + 1})`
      );
      params.push(tsQuery, `%${query}%`);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    try {
      const result = await pool.query(
        `SELECT source_type, COUNT(*) AS count FROM raw_intel_items ${where} GROUP BY source_type ORDER BY count DESC`,
        params,
      );
      res.json({ data: { types: result.rows.map(r => ({ type: r.source_type, count: parseInt(r.count) })) } });
    } catch (err) {
      console.error('[API v1] intel summary error:', err.message);
      res.status(500).json({ error: 'Summary failed' });
    }
  });

  // POST /intel/search { q, source_types?, sources?, date_from?, date_to?, page?, limit? }
  router.post('/search', requireCredits('search', getPool()), async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not configured' });

    const { q } = req.body ?? {};
    const { limit, offset, page } = parsePagination(req.query);
    const { conditions, params, nextIdx } = buildFilters(req.body);

    const query = typeof q === 'string' ? q.trim() : '';
    const isBrowse = query.length === 0;

    if (!isBrowse) {
      // Full-text search
      const tsQuery = query
        .split(/\s+/)
        .filter(w => w.length > 0)
        .map(w => `${w}:*`)
        .join(' & ');

      conditions.push(
        `(to_tsvector('simple', coalesce(title, '')) @@ to_tsquery('simple', $${nextIdx})` +
        ` OR to_tsvector('simple', coalesce(content, '')) @@ to_tsquery('simple', $${nextIdx})` +
        ` OR title ILIKE $${nextIdx + 1}` +
        ` OR content ILIKE $${nextIdx + 1})`
      );
      params.push(tsQuery, `%${query}%`);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    const orderBy = 'published_at DESC';

    try {
      // Count query
      const countResult = await pool.query(
        `SELECT COUNT(*) AS total FROM raw_intel_items ${whereClause}`,
        params,
      );
      const total = parseInt(countResult.rows[0]?.total || 0);

      // Data query
      const dataResult = await pool.query(
        `SELECT id, source_name, source_type, title, url, published_at, first_seen_at, content
         FROM raw_intel_items
         ${whereClause}
         ORDER BY ${orderBy}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );

      const items = dataResult.rows.map(row => {
        let contentObj = null;
        try { contentObj = JSON.parse(row.content); } catch { contentObj = null; }

        return {
          id: row.id,
          source_name: row.source_name,
          source_type: row.source_type,
          title: row.title,
          url: row.url,
          published_at: row.published_at,
          first_seen_at: row.first_seen_at,
          snippet: buildSnippet(row.title, row.content, query),
          content: contentObj,
          display: normalizeItem(row.source_type, row.source_name, row.title, contentObj),
        };
      });

      sendApiResponse(
        res,
        { query, page, limit, total, items },
        creditsFromReq(req, CREDIT_COSTS.search),
      );
    } catch (err) {
      console.error('[API v1] intel search error:', err.message);
      res.status(500).json({ error: 'Intelligence search failed' });
    }
  });

  return router;
}

/**
 * Extract a short snippet around the first match of `query` in content text.
 */
function buildSnippet(title, content, query) {
  const text = `${title ?? ''} ${content ?? ''}`;
  if (!query) {
    return text.slice(0, 200) + (text.length > 200 ? '...' : '');
  }
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) {
    return text.slice(0, 200) + (text.length > 200 ? '...' : '');
  }
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + query.length + 140);
  return (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
}

// ── Normalize raw intel items into a predictable display shape ──
// Returns: { headline, description?, severity?, tags: string[], meta: {label,value}[] }

function normalizeItem(sourceType, sourceName, title, c) {
  if (!c || typeof c !== 'object') {
    return { headline: title ?? '—', tags: [], meta: [] };
  }

  switch (sourceType) {
    case 'vulnerability': return normalizeVuln(sourceName, title, c);
    case 'ioc':           return normalizeIOC(sourceName, title, c);
    case 'event':         return normalizeEvent(sourceName, title, c);
    case 'news':          return normalizeNews(sourceName, title, c);
    case 'threat_intel':  return normalizeThreatIntel(sourceName, title, c);
    case 'exposure':      return normalizeExposure(sourceName, title, c);
    default:              return { headline: title ?? '—', tags: [], meta: [] };
  }
}

function normalizeVuln(sourceName, title, c) {
  const cvss = c.cvss ?? c.cvssScore ?? c.score ?? null;
  const severity = c.severity ?? (cvss >= 9 ? 'CRITICAL' : cvss >= 7 ? 'HIGH' : cvss >= 4 ? 'MEDIUM' : 'LOW');
  const tags = [];
  if (severity) tags.push(severity);
  if (c.epss) tags.push(`EPSS ${(c.epss * 100).toFixed(1)}%`);
  if (sourceName === 'CISA-KEV') tags.push('KEV');

  const meta = [];
  if (cvss != null) meta.push({ label: 'CVSS', value: String(cvss) });
  meta.push({ label: '来源', value: sourceName });

  return {
    headline: c.cveId ?? c.cveID ?? c.id ?? title ?? '—',
    description: c.description ?? c.summary ?? null,
    severity,
    tags,
    meta,
  };
}

function normalizeIOC(sourceName, title, c) {
  const value = c.value ?? c.ioc ?? c.indicator ?? c.ip ?? c.ip_address ?? c.ipAddress ?? c.sha256_hash ?? c.sha256 ?? c.url ?? c.rrname ?? title ?? '—';
  const malware = c.malware ?? c.signature ?? c.family ?? null;
  const tags = [];
  if (malware) tags.push(malware);
  if (c.tags) { const t = Array.isArray(c.tags) ? c.tags : [c.tags]; tags.push(...t.slice(0, 3)); }
  if (c.confidence) tags.push(`${c.confidence}%`);

  const meta = [];
  if (malware) meta.push({ label: '家族', value: malware });
  if (c.totalReports) meta.push({ label: '报告数', value: String(c.totalReports) });
  if (c.port) meta.push({ label: '端口', value: String(c.port) });
  meta.push({ label: '来源', value: sourceName });

  return {
    headline: truncate(value, 60),
    description: null,
    severity: sourceName === 'Feodo' ? 'CRITICAL' : null,
    tags: tags.slice(0, 4),
    meta,
  };
}

function normalizeEvent(sourceName, title, c) {
  const group = c.group ?? c.group_name ?? 'Unknown';
  const tags = [group];
  if (c.sector) tags.push(c.sector);

  const meta = [];
  if (c.country) meta.push({ label: '国家', value: c.country });
  if (c.sector) meta.push({ label: '行业', value: c.sector });
  meta.push({ label: '组织', value: group });

  return {
    headline: c.name ?? title ?? '—',
    description: `${group} 勒索组织攻击事件`,
    severity: 'HIGH',
    tags,
    meta,
  };
}

function normalizeNews(sourceName, title, c) {
  const meta = [];
  meta.push({ label: '来源', value: sourceName });

  return {
    headline: c.title ?? title ?? '—',
    description: c.summary ?? c.description ?? c.content ?? null,
    severity: null,
    tags: [],
    meta,
  };
}

function normalizeThreatIntel(sourceName, title, c) {
  const tags = [];
  if (c.technique_id || c.id) tags.push(c.technique_id ?? c.id);
  if (c.malware) tags.push(c.malware);

  const meta = [];
  if (c.description) meta.push({ label: '说明', value: truncate(c.description, 120) });
  meta.push({ label: '来源', value: sourceName });

  return {
    headline: c.name ?? title ?? '—',
    description: c.description ?? null,
    severity: null,
    tags: tags.slice(0, 3),
    meta,
  };
}

function normalizeExposure(sourceName, title, c) {
  const meta = [];
  meta.push({ label: '来源', value: sourceName });

  return {
    headline: c.label ?? c.query ?? title ?? '—',
    description: null,
    severity: null,
    tags: [],
    meta,
  };
}

function truncate(s, max) {
  if (!s || s.length <= max) return s;
  return s.slice(0, max) + '…';
}
