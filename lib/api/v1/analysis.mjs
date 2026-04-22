// lib/api/v1/analysis.mjs
import { Router } from 'express';
import { requireCredits, CREDIT_COSTS } from '../../credits/index.mjs';
import { sendApiResponse, creditsFromReq } from './response.mjs';

export default function analysisRouter({ getPool }) {
  const router = Router();

  // POST /analysis/chain { iocs?, campaign_id? }  — 提交攻击链分析（20 积分）
  router.post('/chain', requireCredits('attack_chain', getPool()), async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    const { iocs, campaign_id } = req.body ?? {};

    if (!iocs && !campaign_id) {
      return res.status(400).json({ error: 'Provide at least one of: iocs[], campaign_id' });
    }
    if (iocs !== undefined && !Array.isArray(iocs)) {
      return res.status(400).json({ error: 'iocs must be an array' });
    }

    try {
      // 检查用户计划是否允许攻击链（Free 不允许）
      const planResult = await pool.query(
        `SELECT p.features->>'attack_chain' AS attack_chain
         FROM subscriptions s JOIN plans p ON s.plan_id = p.id
         WHERE s.user_id = $1`,
        [req.user.id]
      );
      const allowed = planResult.rows[0]?.attack_chain;
      if (allowed === 'false' || allowed === false) {
        return res.status(403).json({ error: 'Attack chain analysis requires Pro or Ultra plan' });
      }

      const result = await pool.query(
        `INSERT INTO analysis_jobs (user_id, type, input)
         VALUES ($1, 'attack_chain', $2)
         RETURNING id, type, status, created_at`,
        [req.user.id, JSON.stringify({ iocs: iocs ?? [], campaign_id: campaign_id ?? null })]
      );

      const job = result.rows[0];
      res.status(202);
      sendApiResponse(
        res,
        {
          job_id: job.id,
          type: job.type,
          status: job.status,
          created_at: job.created_at,
          message: 'Job queued. Poll GET /api/v1/analysis/:job_id for status.',
        },
        creditsFromReq(req, CREDIT_COSTS.attack_chain),
      );
    } catch (err) {
      console.error('[API v1] analysis chain error:', err.message);
      res.status(500).json({ error: 'Failed to create analysis job' });
    }
  });

  // GET /analysis/:job_id  — 查询作业状态（无积分）
  router.get('/:job_id', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    const jobId = parseInt(req.params.job_id, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    try {
      const result = await pool.query(
        `SELECT id, type, status, input, result, created_at
         FROM analysis_jobs
         WHERE id = $1 AND user_id = $2`,
        [jobId, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: `Analysis job not found: ${jobId}` });
      }

      sendApiResponse(res, result.rows[0], { consumed: 0, remaining: req.creditsRemaining ?? null });
    } catch (err) {
      console.error('[API v1] analysis get error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve analysis job' });
    }
  });

  return router;
}
