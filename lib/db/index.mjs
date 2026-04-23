// lib/db/index.mjs
import pg from 'pg';
import config from '../../crucix.config.mjs';

const { Pool } = pg;

let _pool = null;

/**
 * Get the PostgreSQL connection pool.
 * Returns null if DATABASE_URL is not configured.
 */
export function getPool() {
  if (_pool) return _pool;
  const url = config.database?.url;
  if (!url) return null;
  _pool = new Pool({
    connectionString: url,
    max: config.database?.poolMax ?? 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  _pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
  });
  return _pool;
}

/**
 * Execute a parameterized query.
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(sql, params = []) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured (DATABASE_URL missing)');
  return pool.query(sql, params);
}

/**
 * Close the pool (for graceful shutdown).
 */
export async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
