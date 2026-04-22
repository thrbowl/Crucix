// lib/api/v1/watchlist.mjs
import { Router } from 'express';
import { sendApiResponse, creditsFromReq } from './response.mjs';

const VALID_TYPES = new Set(['vendor', 'actor', 'keyword', 'cve', 'ip_range', 'industry']);

/**
 * 获取用户计划的 watchlist 限额（null = 无限制）。
 */
async function getWatchlistLimit(pool, userId) {
  const result = await pool.query(
    `SELECT p.features->>'watchlist_limit' AS watchlist_limit
     FROM subscriptions s
     JOIN plans p ON s.plan_id = p.id
     WHERE s.user_id = $1`,
    [userId]
  );
  const raw = result.rows[0]?.watchlist_limit;
  if (raw === null || raw === undefined || raw === 'null') return null; // 无限
  return parseInt(raw, 10);
}

export default function watchlistRouter({ getPool }) {
  const router = Router();

  // GET /watchlist  — 列出条目（无积分消耗）
  router.get('/', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const result = await pool.query(
        `SELECT id, type, value, label, created_at
         FROM watchlists
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [req.user.id]
      );
      sendApiResponse(res, { items: result.rows, total: result.rows.length }, { consumed: 0, remaining: req.creditsRemaining ?? null });
    } catch (err) {
      console.error('[API v1] watchlist get error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve watchlist' });
    }
  });

  // POST /watchlist { type, value, label? }  — 添加条目
  router.post('/', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    const { type, value, label } = req.body ?? {};

    if (!type || !value) {
      return res.status(400).json({ error: 'Required: { type, value }' });
    }
    if (!VALID_TYPES.has(type)) {
      return res.status(400).json({
        error: `Invalid type: ${type}`,
        valid_types: [...VALID_TYPES],
      });
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      return res.status(400).json({ error: 'value must be a non-empty string' });
    }

    try {
      // 检查计划限额
      const limit = await getWatchlistLimit(pool, req.user.id);
      if (limit !== null) {
        const countResult = await pool.query(
          'SELECT COUNT(*) AS cnt FROM watchlists WHERE user_id = $1',
          [req.user.id]
        );
        const current = parseInt(countResult.rows[0].cnt, 10);
        if (current >= limit) {
          return res.status(403).json({
            error: `Watchlist limit reached (${limit} items on your plan)`,
            current,
            limit,
          });
        }
      }

      const result = await pool.query(
        `INSERT INTO watchlists (user_id, type, value, label)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, type, value) DO NOTHING
         RETURNING id, type, value, label, created_at`,
        [req.user.id, type, value.trim(), label ?? null]
      );

      if (result.rows.length === 0) {
        return res.status(409).json({ error: 'Entry already exists' });
      }

      res.status(201).json({ data: result.rows[0] });
    } catch (err) {
      console.error('[API v1] watchlist post error:', err.message);
      res.status(500).json({ error: 'Failed to add watchlist entry' });
    }
  });

  // DELETE /watchlist/:id  — 删除条目
  router.delete('/:id', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    try {
      const result = await pool.query(
        'DELETE FROM watchlists WHERE id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Watchlist entry not found' });
      }
      res.json({ message: 'Watchlist entry deleted' });
    } catch (err) {
      console.error('[API v1] watchlist delete error:', err.message);
      res.status(500).json({ error: 'Failed to delete watchlist entry' });
    }
  });

  return router;
}
