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
 * @param {string}  opts.type         - Filter by STIX type
 * @param {number}  [opts.limit=20]   - Result page size
 * @param {number}  [opts.offset=0]   - Result page offset
 * @param {number}  [opts.minScore]   - Min x_crucix_priority_score (vulnerabilities)
 * @returns {Promise<object[]>}
 */
export async function queryObjects(pool, { type, limit = 20, offset = 0, minScore } = {}) {
  const params = [type, limit, offset];
  let sql = `SELECT data FROM stix_objects WHERE type = $1`;
  if (minScore != null) {
    sql += ` AND (data->>'x_crucix_priority_score')::numeric >= $${params.length + 1}`;
    params.push(minScore);
  }
  sql += ` ORDER BY updated_at DESC LIMIT $2 OFFSET $3`;
  const result = await pool.query(sql, params);
  return result.rows.map(r => r.data);
}
