// lib/api/v1/search.mjs
import { Router } from 'express';
import { requireCredits, CREDIT_COSTS } from '../../credits/index.mjs';
import { sendApiResponse, buildStixBundle, parsePagination, creditsFromReq } from './response.mjs';

const VALID_TYPES = [
  'vulnerability', 'indicator', 'malware', 'threat-actor', 'campaign',
  'report', 'attack-pattern', 'intrusion-set', 'infrastructure',
  'course-of-action', 'identity',
];

/**
 * 在 DB 中做 JSONB 文本搜索。
 */
async function searchInDB(pool, query, types, limit, offset) {
  const filterTypes = Array.isArray(types) && types.length > 0
    ? types.filter(t => VALID_TYPES.includes(t))
    : VALID_TYPES;

  const result = await pool.query(
    `SELECT data FROM stix_objects
     WHERE type = ANY($1)
       AND data::text ILIKE $2
     ORDER BY updated_at DESC
     LIMIT $3 OFFSET $4`,
    [filterTypes, `%${query}%`, limit, offset]
  );
  return result.rows.map(r => r.data);
}

/**
 * 在内存 synthesized 数据中做简单文本匹配。
 */
function searchInMemory(currentData, query, limit) {
  if (!currentData) return [];
  const q = query.toLowerCase();
  const results = [];

  // 搜索 CVEs
  for (const cve of currentData.cves?.recent ?? []) {
    if (results.length >= limit) break;
    const text = JSON.stringify(cve).toLowerCase();
    if (text.includes(q)) results.push({ _source: 'memory', _type: 'vulnerability', ...cve });
  }

  // 搜索新闻
  for (const item of currentData.news ?? []) {
    if (results.length >= limit) break;
    const text = `${item.title ?? ''} ${item.summary ?? ''}`.toLowerCase();
    if (text.includes(q)) results.push({ _source: 'memory', _type: 'news', ...item });
  }

  return results;
}

export default function searchRouter({ getPool, getCurrentData }) {
  const router = Router();

  // POST /search { query, types?, page?, limit? }  — 语义搜索（2 积分）
  router.post('/', requireCredits('search', getPool()), async (req, res) => {
    const { query, types } = req.body ?? {};

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return res.status(400).json({ error: 'query must be a string of at least 2 characters' });
    }

    if (types !== undefined && !Array.isArray(types)) {
      return res.status(400).json({ error: 'types must be an array of STIX type strings' });
    }

    const { limit, offset, page } = parsePagination(req.query);

    try {
      const pool = getPool();
      let items = [];
      let source = 'memory';

      if (pool) {
        items = await searchInDB(pool, query.trim(), types, limit, offset);
        source = 'database';
      } else {
        items = searchInMemory(getCurrentData(), query.trim(), limit);
      }

      sendApiResponse(
        res,
        { query, page, limit, total: items.length, items, source },
        creditsFromReq(req, CREDIT_COSTS.search),
        items.length > 0 && source === 'database' ? buildStixBundle(items) : null,
      );
    } catch (err) {
      console.error('[API v1] search error:', err.message);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  return router;
}
