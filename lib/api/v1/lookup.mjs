// lib/api/v1/lookup.mjs
import { Router } from 'express';
import { requireCredits, CREDIT_COSTS } from '../../credits/index.mjs';
import { sendApiResponse, buildStixBundle, creditsFromReq } from './response.mjs';

// IOC 类型 → STIX SCO 类型
const IOC_TYPE_MAP = {
  ipv4:   'ipv4-addr',
  ipv6:   'ipv6-addr',
  domain: 'domain-name',
  url:    'url',
  hash:   'file',
  email:  'email-addr',
};

/**
 * 在 DB 中查找 IOC SCO 对象。
 */
async function lookupIocInDB(pool, type, value) {
  const scoType = IOC_TYPE_MAP[type];
  if (!scoType) return null;

  let sql, params;

  if (type === 'hash') {
    // file 的 hash 存在 hashes JSONB 字段里
    sql = `SELECT data FROM stix_objects
           WHERE type = 'file'
             AND (data->'hashes'->>'MD5' = $1
               OR data->'hashes'->>'SHA-256' = $1
               OR data->'hashes'->>'SHA-1' = $1)
           LIMIT 1`;
    params = [value];
  } else {
    sql = `SELECT data FROM stix_objects WHERE type = $1 AND data->>'value' = $2 LIMIT 1`;
    params = [scoType, value];
  }

  const result = await pool.query(sql, params);
  return result.rows[0]?.data ?? null;
}

/**
 * 在内存 synthesized 数据中查找 IOC。
 */
function lookupIocInMemory(currentData, value) {
  if (!currentData?.iocs) return null;
  const allIOCs = [
    ...(currentData.iocs.malware ?? []),
    ...(currentData.iocs.c2 ?? []),
    ...(currentData.iocs.maliciousIPs ?? []),
    ...(currentData.iocs.phishing ?? []),
  ];
  const normalized = value.toLowerCase();
  return allIOCs.find(ioc =>
    (ioc.value ?? ioc.ip ?? ioc.hash ?? ioc.url ?? ioc.indicator ?? '')
      .toLowerCase() === normalized
  ) ?? null;
}

export default function lookupRouter({ getPool, getCurrentData }) {
  const router = Router();

  // POST /lookup/ioc { type, value }  — IOC 声誉查询（1 积分）
  router.post('/ioc', requireCredits('ioc_lookup', getPool()), async (req, res) => {
    const { type, value } = req.body ?? {};

    if (!type || !value) {
      return res.status(400).json({ error: 'Required: { type, value }' });
    }
    if (!IOC_TYPE_MAP[type]) {
      return res.status(400).json({
        error: `Invalid type: ${type}`,
        valid_types: Object.keys(IOC_TYPE_MAP),
      });
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      return res.status(400).json({ error: 'value must be a non-empty string' });
    }

    try {
      const pool = getPool();
      let stixObject = null;
      let source = null;

      if (pool) {
        stixObject = await lookupIocInDB(pool, type, value.trim());
        if (stixObject) source = 'database';
      }

      if (!stixObject) {
        const memResult = lookupIocInMemory(getCurrentData(), value.trim());
        if (memResult) {
          stixObject = memResult;
          source = 'memory';
        }
      }

      if (!stixObject) {
        return res.status(404).json({ error: `IOC not found: ${value}` });
      }

      sendApiResponse(
        res,
        { type, value, source, result: stixObject },
        creditsFromReq(req, CREDIT_COSTS.ioc_lookup),
        source === 'database' ? buildStixBundle(stixObject) : null,
      );
    } catch (err) {
      console.error('[API v1] ioc lookup error:', err.message);
      res.status(500).json({ error: 'IOC lookup failed' });
    }
  });

  // GET /lookup/cve/:cve_id  — CVE 查询（1 积分）
  router.get('/cve/:cve_id', requireCredits('cve_query', getPool()), async (req, res) => {
    const cveId = req.params.cve_id.toUpperCase();

    if (!/^CVE-\d{4}-\d{4,}$/.test(cveId)) {
      return res.status(400).json({ error: `Invalid CVE ID format: ${cveId}` });
    }

    try {
      const pool = getPool();
      let vuln = null;
      let source = null;

      if (pool) {
        const result = await pool.query(
          `SELECT data FROM stix_objects
           WHERE type = 'vulnerability'
             AND (data->>'name' = $1
               OR data->'external_references' @> $2::jsonb)
           LIMIT 1`,
          [cveId, JSON.stringify([{ external_id: cveId }])]
        );
        if (result.rows[0]) {
          vuln = result.rows[0].data;
          source = 'database';
        }
      }

      if (!vuln) {
        const cves = getCurrentData()?.cves?.recent ?? [];
        const found = cves.find(c => (c.id ?? c.cveId ?? '').toUpperCase() === cveId);
        if (found) {
          vuln = found;
          source = 'memory';
        }
      }

      if (!vuln) {
        return res.status(404).json({ error: `CVE not found: ${cveId}` });
      }

      sendApiResponse(
        res,
        { cve_id: cveId, source, result: vuln },
        creditsFromReq(req, CREDIT_COSTS.cve_query),
        source === 'database' ? buildStixBundle(vuln) : null,
      );
    } catch (err) {
      console.error('[API v1] cve lookup error:', err.message);
      res.status(500).json({ error: 'CVE lookup failed' });
    }
  });

  return router;
}
