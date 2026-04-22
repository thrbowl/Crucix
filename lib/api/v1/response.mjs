// lib/api/v1/response.mjs
import { randomUUID } from 'node:crypto';

/**
 * 发送标准 v1 API 响应。
 * @param {import('express').Response} res
 * @param {object} data
 * @param {{ consumed: number, remaining: number|null }} [credits]
 * @param {object|null} [stixBundle]
 */
export function sendApiResponse(res, data, credits = { consumed: 0, remaining: null }, stixBundle = null) {
  const body = {
    data,
    meta: {
      credits_consumed: credits.consumed,
      credits_remaining: credits.remaining ?? null,
    },
  };
  if (stixBundle !== null) body.stix_bundle = stixBundle;
  res.json(body);
}

/**
 * 将 STIX 对象数组打包为 STIX Bundle。
 */
export function buildStixBundle(objects) {
  const arr = Array.isArray(objects) ? objects : [objects];
  return {
    type: 'bundle',
    id: `bundle--${randomUUID()}`,
    spec_version: '2.1',
    objects: arr,
  };
}

/**
 * 从 Express query 解析分页参数。
 * @returns {{ limit: number, offset: number, page: number }}
 */
export function parsePagination(query, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit) || defaultLimit));
  const offset = (page - 1) * limit;
  return { limit, offset, page };
}

/**
 * 从 req 中提取积分信息（requireCredits 中间件设置 req.creditsRemaining）。
 */
export function creditsFromReq(req, cost) {
  return {
    consumed: cost,
    remaining: req.creditsRemaining ?? null,
  };
}
