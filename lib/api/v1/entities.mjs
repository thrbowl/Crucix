// lib/api/v1/entities.mjs
import { Router } from 'express';
import { requireCredits, CREDIT_COSTS } from '../../credits/index.mjs';
import { queryObjects, getObjectById } from '../../stix/objects.mjs';
import { getRelations } from '../../stix/relations.mjs';
import { sendApiResponse, buildStixBundle, parsePagination, creditsFromReq } from './response.mjs';

const VALID_TYPES = new Set([
  'vulnerability', 'indicator', 'malware', 'threat-actor', 'campaign',
  'report', 'attack-pattern', 'intrusion-set', 'infrastructure',
  'course-of-action', 'identity',
]);

export default function entitiesRouter({ getPool }) {
  const router = Router();

  // GET /entities/:type?filter=&sort=&page=&limit=  — 列表（1 积分）
  router.get('/:type', requireCredits('entity_query', getPool()), async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not configured' });

    const { type } = req.params;
    if (!VALID_TYPES.has(type)) {
      return res.status(400).json({
        error: `Invalid entity type: ${type}`,
        valid_types: [...VALID_TYPES],
      });
    }

    const { limit, offset, page } = parsePagination(req.query);
    const minScore = req.query.min_score ? parseFloat(req.query.min_score) : undefined;

    try {
      const objects = await queryObjects(pool, { type, limit, offset, minScore });
      sendApiResponse(
        res,
        { type, page, limit, items: objects, total: objects.length },
        creditsFromReq(req, CREDIT_COSTS.entity_query),
      );
    } catch (err) {
      console.error('[API v1] entities list error:', err.message);
      res.status(500).json({ error: 'Failed to query entities' });
    }
  });

  // GET /entities/:type/:id/related?relationship_type=  — 关联实体（3 积分）
  // NOTE: This MUST be registered before /:type/:id to avoid Express matching
  // "related" as the :id parameter.
  router.get('/:type/:id/related', requireCredits('related_entities', getPool()), async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not configured' });

    const { type, id } = req.params;
    if (!VALID_TYPES.has(type)) {
      return res.status(400).json({ error: `Invalid entity type: ${type}` });
    }
    const stixId = id.includes('--') ? id : `${type}--${id}`;
    const filterRelType = req.query.relationship_type ?? null;

    try {
      let relations = await getRelations(pool, stixId);

      if (filterRelType) {
        relations = relations.filter(r => r.relationship_type === filterRelType);
      }

      // 解析关联端点 STIX 对象
      const resolved = await Promise.all(
        relations.map(async rel => {
          const otherRef = rel.source_ref === stixId ? rel.target_ref : rel.source_ref;
          const direction = rel.source_ref === stixId ? 'outgoing' : 'incoming';
          const relatedObj = await getObjectById(pool, otherRef).catch(() => null);
          return {
            relationship_type: rel.relationship_type,
            direction,
            confidence: rel.confidence,
            stix_id: otherRef,
            object: relatedObj,
          };
        })
      );

      const relatedObjects = resolved.filter(r => r.object !== null).map(r => r.object);

      sendApiResponse(
        res,
        { stix_id: stixId, total: resolved.length, relations: resolved },
        creditsFromReq(req, CREDIT_COSTS.related_entities),
        relatedObjects.length > 0 ? buildStixBundle(relatedObjects) : null,
      );
    } catch (err) {
      console.error('[API v1] related entities error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve related entities' });
    }
  });

  // GET /entities/:type/:id  — 单个实体详情（5 积分）
  router.get('/:type/:id', requireCredits('entity_profile', getPool()), async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not configured' });

    const { type, id } = req.params;
    if (!VALID_TYPES.has(type)) {
      return res.status(400).json({ error: `Invalid entity type: ${type}` });
    }

    // id 可以是纯 UUID 或完整 stix_id（type--uuid）
    const stixId = id.includes('--') ? id : `${type}--${id}`;

    try {
      const obj = await getObjectById(pool, stixId);
      if (!obj) return res.status(404).json({ error: `Entity not found: ${stixId}` });

      sendApiResponse(
        res,
        obj,
        creditsFromReq(req, CREDIT_COSTS.entity_profile),
        buildStixBundle(obj),
      );
    } catch (err) {
      console.error('[API v1] entity detail error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve entity' });
    }
  });

  return router;
}
