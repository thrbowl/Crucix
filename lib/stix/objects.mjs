// lib/stix/objects.mjs

/**
 * Upsert a STIX object into stix_objects.
 * Conflict on stix_id: update data + updated_at.
 * @param {object} pool - pg Pool instance
 * @param {object} stixObj - STIX object with .id and .type fields
 * @returns {Promise<void>}
 */
export async function upsertObject(pool, stixObj) {
  const firstSeen = stixObj.created ? new Date(stixObj.created).toISOString() : null;
  const lastSeen  = stixObj.modified ? new Date(stixObj.modified).toISOString() : firstSeen;
  await pool.query(
    `INSERT INTO stix_objects (type, stix_id, data, first_seen_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (stix_id) DO UPDATE
       SET data = EXCLUDED.data,
           first_seen_at = EXCLUDED.first_seen_at,
           last_seen_at  = EXCLUDED.last_seen_at,
           updated_at    = now()`,
    [stixObj.type, stixObj.id, stixObj, firstSeen, lastSeen]
  );
}

/**
 * Get a STIX object by its STIX ID.
 * @param {object} pool
 * @param {string} stixId - e.g., "vulnerability--uuid"
 * @returns {Promise<object|null>}
 */
export async function getObjectById(pool, stixId) {
  const result = await pool.query(
    'SELECT data FROM stix_objects WHERE stix_id = $1',
    [stixId]
  );
  return result.rows[0]?.data ?? null;
}

/**
 * Query STIX objects with optional filters.
 * @param {object} pool
 * @param {object} opts
 * @param {string}  [opts.type]       - Filter by STIX type (omit for all)
 * @param {number}  [opts.limit=20]   - Result page size
 * @param {number}  [opts.offset=0]   - Result page offset
 * @param {number}  [opts.minScore]   - Min x_crucix_priority_score (vulnerabilities)
 * @returns {Promise<object[]>}
 */
export async function queryObjects(pool, { type, limit = 20, offset = 0, minScore, dateFrom, dateTo, highRisk, activeOnly } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (type)      { conditions.push(`type = $${idx++}`);                                                              params.push(type); }
  if (minScore != null) { conditions.push(`(data->>'x_crucix_priority_score')::numeric >= $${idx++}`);              params.push(minScore); }
  if (dateFrom)  { conditions.push(`last_seen_at >= $${idx++}`);                                                     params.push(dateFrom); }
  if (dateTo)    { conditions.push(`last_seen_at <= $${idx++}`);                                                     params.push(dateTo); }
  if (highRisk)  { conditions.push(`((data->>'x_crucix_kev_listed')::boolean = true OR (data->>'x_crucix_exploit_public')::boolean = true OR (data->>'x_crucix_cvss_score')::numeric >= 7.0)`); }
  if (activeOnly) { conditions.push(`data->>'x_crucix_ioc_lifecycle' IN ('fresh','active')`); }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const sql = `SELECT data FROM stix_objects ${where} ORDER BY last_seen_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);
  const result = await pool.query(sql, params);
  return result.rows.map(r => r.data);
}

/**
 * Count STIX objects grouped by type.
 * @param {object} pool
 * @returns {Promise<{type: string, count: number}[]>}
 */
export async function countByType(pool) {
  const result = await pool.query(
    `SELECT type, COUNT(*)::int AS count FROM stix_objects GROUP BY type ORDER BY count DESC`
  );
  return result.rows;
}
