// lib/stix/objects.mjs

/**
 * Upsert a STIX object into stix_objects.
 * Conflict on stix_id: update data + updated_at.
 * @param {object} pool - pg Pool instance
 * @param {object} stixObj - STIX object with .id and .type fields
 * @returns {Promise<void>}
 */
export async function upsertObject(pool, stixObj) {
  await pool.query(
    `INSERT INTO stix_objects (type, stix_id, data)
     VALUES ($1, $2, $3)
     ON CONFLICT (stix_id) DO UPDATE
       SET data = EXCLUDED.data,
           updated_at = now()`,
    [stixObj.type, stixObj.id, stixObj]
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
export async function queryObjects(pool, { type, limit = 20, offset = 0, minScore, dateFrom, dateTo } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (type)      { conditions.push(`type = $${idx++}`);                                                              params.push(type); }
  if (minScore != null) { conditions.push(`(data->>'x_crucix_priority_score')::numeric >= $${idx++}`);              params.push(minScore); }
  if (dateFrom)  { conditions.push(`(data->>'created')::timestamptz >= $${idx++}`);                                 params.push(dateFrom); }
  if (dateTo)    { conditions.push(`(data->>'created')::timestamptz <= $${idx++}`);                                 params.push(dateTo); }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const sql = `SELECT data FROM stix_objects ${where} ORDER BY updated_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
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
