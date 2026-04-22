// lib/api/v1/taxii.mjs
import { Router } from 'express';
import { buildStixBundle, parsePagination } from './response.mjs';

const TAXII_COLLECTIONS = [
  { id: 'vulnerability',    title: 'CVE Vulnerabilities',    description: 'STIX 2.1 Vulnerability SDOs' },
  { id: 'indicator',        title: 'IOC Indicators',          description: 'STIX 2.1 Indicator SDOs + SCOs' },
  { id: 'malware',          title: 'Malware Families',        description: 'STIX 2.1 Malware SDOs' },
  { id: 'threat-actor',     title: 'Threat Actors',           description: 'STIX 2.1 Threat-Actor SDOs' },
  { id: 'campaign',         title: 'Attack Campaigns',        description: 'STIX 2.1 Campaign SDOs' },
  { id: 'attack-pattern',   title: 'ATT&CK Techniques',       description: 'STIX 2.1 Attack-Pattern SDOs' },
  { id: 'intrusion-set',    title: 'APT Groups',              description: 'STIX 2.1 Intrusion-Set SDOs' },
  { id: 'infrastructure',   title: 'C2 Infrastructure',       description: 'STIX 2.1 Infrastructure SDOs' },
  { id: 'course-of-action', title: 'Mitigations',             description: 'STIX 2.1 Course-of-Action SDOs' },
  { id: 'report',           title: 'Intelligence Reports',    description: 'STIX 2.1 Report SDOs' },
];

/**
 * 检查用户是否有 TAXII 访问权（Ultra 计划）。
 */
async function checkTaxiiAccess(pool, userId) {
  const result = await pool.query(
    `SELECT p.features->>'taxii' AS taxii
     FROM subscriptions s JOIN plans p ON s.plan_id = p.id
     WHERE s.user_id = $1`,
    [userId]
  );
  return result.rows[0]?.taxii === 'true';
}

export default function taxiiRouter({ getPool }) {
  const router = Router();

  // TAXII 访问检查中间件
  router.use(async (req, res, next) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const allowed = await checkTaxiiAccess(pool, req.user.id);
      if (!allowed) {
        return res.status(403).json({ error: 'TAXII access requires Ultra plan' });
      }
      next();
    } catch (err) {
      console.error('[API v1] taxii access check error:', err.message);
      res.status(500).json({ error: 'Access check failed' });
    }
  });

  // GET /taxii/collections  — 集合列表
  router.get('/collections', (_req, res) => {
    res.json({
      collections: TAXII_COLLECTIONS.map(c => ({
        ...c,
        can_read: true,
        can_write: false,
        media_types: ['application/taxii+json;version=2.1'],
      })),
    });
  });

  // GET /taxii/collections/:id/objects?added_after=&page=&limit=  — 对象列表
  router.get('/collections/:id/objects', async (req, res) => {
    const pool = getPool();
    const { id } = req.params;
    const { added_after } = req.query;

    const collection = TAXII_COLLECTIONS.find(c => c.id === id);
    if (!collection) {
      return res.status(404).json({ error: `Collection not found: ${id}` });
    }

    if (added_after) {
      const parsed = new Date(added_after);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ error: `Invalid added_after timestamp: ${added_after}` });
      }
    }

    const { limit, offset } = parsePagination(req.query, 50, 200);

    try {
      const params = [id, limit, offset];
      let where = 'WHERE type = $1';
      if (added_after) {
        params.push(added_after);
        where += ` AND updated_at >= $${params.length}::timestamptz`;
      }

      const result = await pool.query(
        `SELECT data FROM stix_objects
         ${where}
         ORDER BY updated_at DESC
         LIMIT $2 OFFSET $3`,
        params
      );

      const objects = result.rows.map(r => r.data);
      const bundle = buildStixBundle(objects);

      res.setHeader('Content-Type', 'application/taxii+json;version=2.1');
      res.json(bundle);
    } catch (err) {
      console.error('[API v1] taxii objects error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve TAXII objects' });
    }
  });

  return router;
}
