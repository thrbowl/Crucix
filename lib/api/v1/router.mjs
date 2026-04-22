// lib/api/v1/router.mjs
import { Router } from 'express';
import briefingsRouter from './briefings.mjs';
import entitiesRouter from './entities.mjs';
import lookupRouter from './lookup.mjs';
import searchRouter from './search.mjs';
import alertsRouter from './alerts.mjs';
import watchlistRouter from './watchlist.mjs';
import analysisRouter from './analysis.mjs';
import taxiiRouter from './taxii.mjs';

/**
 * 创建 v1 API 路由。
 * @param {{ getPool: () => object|null, getCurrentData: () => object|null }} deps
 * @returns {import('express').Router}
 */
export function createV1Router({ getPool, getCurrentData }) {
  const router = Router();
  const deps = { getPool, getCurrentData };

  router.use('/briefings', briefingsRouter(deps));
  router.use('/entities', entitiesRouter(deps));
  router.use('/lookup', lookupRouter(deps));
  router.use('/search', searchRouter(deps));
  router.use('/alerts', alertsRouter(deps));
  router.use('/watchlist', watchlistRouter(deps));
  router.use('/analysis', analysisRouter(deps));
  router.use('/taxii', taxiiRouter(deps));

  return router;
}
