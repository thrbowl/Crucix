// lib/stix/relations.mjs

/**
 * Upsert a STIX relationship (SRO).
 * Conflict on (source_ref, target_ref, relationship_type): DO NOTHING.
 */
export async function upsertRelation(pool, { sourceRef, targetRef, relationshipType, confidence = 1.0 }) {
  await pool.query(
    `INSERT INTO stix_relations (source_ref, target_ref, relationship_type, confidence)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source_ref, target_ref, relationship_type) DO NOTHING`,
    [sourceRef, targetRef, relationshipType, confidence]
  );
}

/**
 * Get all relations where the given STIX ID appears as source or target.
 * @param {object} pool
 * @param {string} stixId
 * @returns {Promise<object[]>}
 */
export async function getRelations(pool, stixId) {
  const result = await pool.query(
    `SELECT source_ref, target_ref, relationship_type, confidence, created_at
     FROM stix_relations
     WHERE source_ref = $1 OR target_ref = $1`,
    [stixId]
  );
  return result.rows;
}
