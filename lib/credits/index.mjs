// lib/credits/index.mjs

/**
 * Credit cost per operation.
 * Spec: intelligence-product-design.md Layer 5 积分消耗表
 */
export const CREDIT_COSTS = {
  briefing_read:        1,
  ioc_lookup:           1,
  cve_query:            1,
  entity_query:         1,
  alert_list:           1,
  search:               2,
  related_entities:     3,
  entity_profile:       5,
  defensive_priorities: 5,
  trend_analysis:       10,
  attack_chain:         20,
};

/**
 * Get the current subscription and credit balance for a user.
 * @param {object} pool
 * @param {number|string} userId
 * @returns {Promise<{current_credits, plan_name, period_end}|null>}
 */
export async function getCreditBalance(pool, userId) {
  const result = await pool.query(
    `SELECT s.current_credits, p.name AS plan_name, s.period_end
     FROM subscriptions s
     JOIN plans p ON s.plan_id = p.id
     WHERE s.user_id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

/**
 * Check if a user has enough credits for an operation.
 * Also handles credit period reset if expired.
 * @param {object} pool
 * @param {number|string} userId
 * @param {number} cost
 * @returns {Promise<boolean>}
 */
export async function hasCredits(pool, userId, cost) {
  await maybeResetCredits(pool, userId);
  const balance = await getCreditBalance(pool, userId);
  if (!balance) return false;
  return balance.current_credits >= cost;
}

/**
 * Deduct credits from a user's subscription.
 * Returns updated balance, or null if not enough credits.
 * @param {object} pool
 * @param {number|string} userId
 * @param {number|null} apiKeyId
 * @param {string} operation
 * @param {number} cost
 * @returns {Promise<number|null>} remaining credits, or null if insufficient
 */
export async function deductCredits(pool, userId, apiKeyId, operation, cost) {
  await maybeResetCredits(pool, userId);

  // Atomic deduction with floor check
  const result = await pool.query(
    `UPDATE subscriptions
     SET current_credits = current_credits - $2
     WHERE user_id = $1 AND current_credits >= $2
     RETURNING current_credits`,
    [userId, cost]
  );

  if (result.rowCount === 0) return null;

  await pool.query(
    `INSERT INTO credit_log (user_id, api_key_id, operation, amount)
     VALUES ($1, $2, $3, $4)`,
    [userId, apiKeyId ?? null, operation, -cost]
  );

  return result.rows[0].current_credits;
}

/**
 * Reset credits if the period has expired (idempotent).
 */
async function maybeResetCredits(pool, userId) {
  await pool.query(
    `UPDATE subscriptions s
     SET current_credits = p.credit_amount,
         period_start = now(),
         period_end = CASE
           WHEN p.reset_period = 'daily'   THEN now() + INTERVAL '1 day'
           WHEN p.reset_period = 'monthly' THEN now() + INTERVAL '1 month'
           ELSE now() + INTERVAL '1 month'
         END
     FROM plans p
     WHERE s.plan_id = p.id
       AND s.user_id = $1
       AND s.period_end < now()`,
    [userId]
  );
}

/**
 * Express middleware: check + deduct credits for an operation.
 * Attaches req.creditsRemaining. Returns 402 if insufficient.
 *
 * @param {string} operation - key from CREDIT_COSTS
 * @param {object|null} pool - pg Pool (null = no-op)
 */
export function requireCredits(operation, pool) {
  const cost = CREDIT_COSTS[operation] ?? 1;

  return async (req, res, next) => {
    if (!pool || !req.user) return next();

    const remaining = await deductCredits(pool, req.user.id, req.user.apiKeyId ?? null, operation, cost);
    if (remaining === null) {
      return res.status(402).json({
        error: 'Insufficient credits',
        required: cost,
        operation,
      });
    }

    req.creditsRemaining = remaining;
    next();
  };
}
