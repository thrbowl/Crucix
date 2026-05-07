// Source health tracking — updates the sources table after each sweep.

/**
 * Batch-update source health from sweep results.
 *
 * @param {object} pool - pg Pool
 * @param {Array} results - array of { name, status, durationMs, error } from fullBriefing()
 * @param {object} timing - { SourceName: { status, ms } } timing map
 */
export async function updateSourceHealth(pool, results, timing) {
  if (!pool) return;

  const now = new Date().toISOString();
  const updates = [];

  for (const r of results) {
    const ok = r.status === 'ok';
    const isInactive = ok && r.data?.status === 'inactive';
    const isError = r.status === 'error';
    const isActive = ok && !isInactive;

    let lastStatus;
    if (isActive) lastStatus = 'active';
    else if (isInactive) lastStatus = 'inactive';
    else lastStatus = 'error';

    const duration = r.durationMs || timing?.[r.name]?.ms || 0;

    updates.push({
      name: r.name,
      last_status: lastStatus,
      last_success_at: isActive ? now : null,
      last_failure_at: isError ? now : null,
      last_error: isError ? (r.error || 'unknown error') : (isInactive ? (r.data?.reason || r.data?.message || 'inactive') : null),
      last_duration_ms: duration,
      succeeded: isActive,
    });
  }

  // Batch update using a single transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch current state for delta computation
    const current = await client.query('SELECT name, consecutive_failures, total_successes, total_failures, avg_duration_ms FROM sources');
    const stateMap = Object.fromEntries(current.rows.map(r => [r.name, r]));

    for (const u of updates) {
      const s = stateMap[u.name];
      if (!s) continue; // source not in registry

      const failures = u.succeeded ? 0 : (s.consecutive_failures || 0) + 1;
      const totalOk = (s.total_successes || 0) + (u.succeeded ? 1 : 0);
      const totalFail = (s.total_failures || 0) + (u.succeeded ? 0 : 1);
      const prevAvg = s.avg_duration_ms || 0;
      const newAvg = u.last_duration_ms > 0
        ? Math.round(prevAvg === 0 ? u.last_duration_ms : prevAvg * 0.8 + u.last_duration_ms * 0.2)
        : prevAvg;

      const sets = [
        'last_status = $2',
        'last_duration_ms = $3',
        'avg_duration_ms = $4',
        'consecutive_failures = $5',
        'total_successes = $6',
        'total_failures = $7',
        'updated_at = NOW()',
      ];
      const params = [u.name, u.last_status, u.last_duration_ms, newAvg, failures, totalOk, totalFail];

      if (u.last_success_at) {
        sets.push(`last_success_at = '${u.last_success_at}'`);
      }
      if (u.last_failure_at) {
        sets.push(`last_failure_at = '${u.last_failure_at}'`);
      }
      if (u.last_error !== null && u.last_error !== undefined) {
        sets.push(`last_error = $${params.length + 1}`);
        params.push(String(u.last_error).substring(0, 500));
      } else {
        sets.push('last_error = NULL');
      }

      await client.query(
        `UPDATE sources SET ${sets.join(', ')} WHERE name = $1`,
        params
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Sources] Health update failed:', err.message);
  } finally {
    client.release();
  }
}

/**
 * Get the set of enabled source names from DB.
 * Falls back to all sources if query fails.
 *
 * @param {object} pool - pg Pool
 * @returns {Promise<Set<string>>}
 */
export async function getEnabledSources(pool) {
  if (!pool) return null;
  try {
    const r = await pool.query('SELECT name FROM sources WHERE enabled = true');
    return new Set(r.rows.map(row => row.name));
  } catch {
    return null;
  }
}

/**
 * Get source health status (for API endpoints).
 *
 * @param {object} pool - pg Pool
 * @returns {Promise<Array>}
 */
export async function getSourceHealth(pool) {
  if (!pool) return [];
  const r = await pool.query(`
    SELECT name, domain, type, enabled, homepage_url,
           last_status, last_success_at, last_failure_at, last_error,
           last_duration_ms, avg_duration_ms,
           consecutive_failures, total_successes, total_failures,
           updated_at
    FROM sources
    ORDER BY domain, name
  `);
  return r.rows;
}
