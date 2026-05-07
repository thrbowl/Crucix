// lib/audit.mjs

/**
 * Write an audit log entry.
 * @param {object} pool - pg Pool
 * @param {{ userId?: number, action: string, target?: string, detail?: object, ip?: string }} entry
 */
export async function writeAuditLog(pool, { userId, action, target, detail, ip }) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO audit_logs (user_id, action, target, detail, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId ?? null, action, target ?? null, detail ? JSON.stringify(detail) : null, ip ?? null],
  ).catch(err => console.error('[Audit] Failed to write log:', err.message));
}

/**
 * Query audit logs with pagination and filters.
 * @param {object} pool
 * @param {{ page?: number, limit?: number, action?: string, userId?: number }} opts
 * @returns {Promise<{ logs: object[], total: number }>}
 */
export async function queryAuditLogs(pool, { page = 1, limit = 50, action, userId } = {}) {
  const where = [];
  const params = [];
  let idx = 1;

  if (action) { where.push(`action = $${idx++}`); params.push(action); }
  if (userId) { where.push(`user_id = $${idx++}`); params.push(userId); }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countQ = await pool.query(`SELECT COUNT(*)::int AS total FROM audit_logs ${clause}`, params);
  const total = countQ.rows[0]?.total ?? 0;

  const offset = (page - 1) * limit;
  params.push(limit, offset);
  const dataQ = await pool.query(
    `SELECT a.id, a.user_id, u.email AS user_email, a.action, a.target, a.detail, a.ip, a.created_at
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     ${clause}
     ORDER BY a.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params,
  );

  return { logs: dataQ.rows, total };
}
