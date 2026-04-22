// lib/api/v1/alerts.mjs
import { Router } from 'express';
import { requireCredits, CREDIT_COSTS } from '../../credits/index.mjs';
import { sendApiResponse, parsePagination, creditsFromReq } from './response.mjs';

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

export default function alertsRouter({ getPool }) {
  const router = Router();

  // GET /alerts?severity=&since=&page=&limit=  — 告警列表（1 积分）
  router.get('/', requireCredits('alert_list', getPool()), async (req, res) => {
    const pool = getPool();
    if (!pool) {
      // 无 DB：返回空列表（分析引擎尚未写入任何告警）
      return sendApiResponse(
        res,
        { items: [], total: 0, note: 'Alerts require database — returning empty' },
        creditsFromReq(req, CREDIT_COSTS.alert_list),
      );
    }

    const { severity, since } = req.query;

    if (severity && !VALID_SEVERITIES.has(severity)) {
      return res.status(400).json({
        error: `Invalid severity: ${severity}`,
        valid_values: [...VALID_SEVERITIES],
      });
    }

    if (since) {
      const parsed = new Date(since);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ error: `Invalid since timestamp: ${since}` });
      }
    }

    const { limit, offset, page } = parsePagination(req.query);

    try {
      const params = [];
      const conditions = [];

      if (severity) {
        params.push(severity);
        conditions.push(`severity = $${params.length}`);
      }
      if (since) {
        params.push(since);
        conditions.push(`created_at >= $${params.length}::timestamptz`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(limit, offset);

      const result = await pool.query(
        `SELECT id, type, severity, title, entity_ref, signal_data, created_at
         FROM alerts
         ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      sendApiResponse(
        res,
        { page, limit, total: result.rows.length, items: result.rows },
        creditsFromReq(req, CREDIT_COSTS.alert_list),
      );
    } catch (err) {
      console.error('[API v1] alerts error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve alerts' });
    }
  });

  return router;
}
