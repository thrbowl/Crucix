// lib/db/migrate.mjs
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, getPool } from './index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../');
const MIGRATIONS_DIR = join(ROOT, 'migrations');

export async function runMigrations() {
  const pool = getPool();
  if (!pool) {
    console.warn('[DB] DATABASE_URL not configured — skipping migrations');
    return;
  }

  // Ensure migrations table exists (bootstrap)
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT        PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  let allFiles;
  try {
    allFiles = await readdir(MIGRATIONS_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('[DB] migrations directory not found, skipping');
      return;
    }
    throw new Error(`[DB] Failed to read migrations directory: ${err.message}`, { cause: err });
  }
  const files = allFiles.filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const version = file.slice(0, -4); // remove trailing '.sql' (4 chars)
    const applied = await query(
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      [version]
    );
    if (applied.rowCount > 0) continue;

    console.log(`[DB] Applying migration: ${file}`);
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [version]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`[DB] Migration failed: ${file}: ${err.message}`, { cause: err });
    } finally {
      client.release();
    }
    console.log(`[DB] Migration applied: ${file}`);
  }
}
