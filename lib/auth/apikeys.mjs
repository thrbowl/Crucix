// lib/auth/apikeys.mjs
import { createHash, randomBytes } from 'node:crypto';

const KEY_PREFIX = 'crx_';

/**
 * Generate a new API key.
 * Format: crx_<64-char hex> (32 random bytes)
 * @returns {{ plaintext: string, hash: string }}
 */
export function generateApiKey() {
  const plaintext = KEY_PREFIX + randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(plaintext).digest('hex');
  return { plaintext, hash };
}

/**
 * Hash an API key for DB lookup.
 */
export function hashApiKey(plaintext) {
  return createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Store an API key in the database. Returns the new key row (without hash).
 * @param {object} pool
 * @param {number|string} userId
 * @param {string} hash
 * @param {string} name
 * @returns {Promise<{id, name, created_at}>}
 */
export async function storeApiKey(pool, userId, hash, name) {
  const result = await pool.query(
    `INSERT INTO api_keys (user_id, key_hash, name)
     VALUES ($1, $2, $3)
     RETURNING id, name, created_at`,
    [userId, hash, name || 'default']
  );
  return result.rows[0];
}

/**
 * Look up an API key from the DB. Returns { userId, keyId } or null.
 */
export async function lookupApiKey(pool, plaintext) {
  const hash = hashApiKey(plaintext);
  const result = await pool.query(
    `SELECT id, user_id FROM api_keys
     WHERE key_hash = $1 AND revoked = false`,
    [hash]
  );
  const row = result.rows[0];
  if (!row) return null;

  // Update last_used_at asynchronously (fire-and-forget)
  pool.query(
    'UPDATE api_keys SET last_used_at = now() WHERE id = $1',
    [row.id]
  ).catch(() => {}); // non-critical

  return { userId: row.user_id, keyId: row.id };
}

/**
 * List all non-revoked API keys for a user.
 */
export async function listApiKeys(pool, userId) {
  const result = await pool.query(
    `SELECT id, name, last_used_at, created_at
     FROM api_keys
     WHERE user_id = $1 AND revoked = false
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Revoke an API key (soft delete). Returns true if found and revoked.
 */
export async function revokeApiKey(pool, userId, keyId) {
  const result = await pool.query(
    `UPDATE api_keys SET revoked = true
     WHERE id = $1 AND user_id = $2 AND revoked = false`,
    [keyId, userId]
  );
  return result.rowCount > 0;
}
