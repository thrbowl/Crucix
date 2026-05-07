// lib/auth/users.mjs
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;

/**
 * Register a new user.
 * @param {object} pool
 * @param {string} email
 * @param {string} password - plaintext, will be hashed
 * @returns {Promise<{id, email, created_at}>}
 * @throws {Error} if email already exists or validation fails
 */
export async function registerUser(pool, email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Invalid email address');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const hash = await bcrypt.hash(password, BCRYPT_COST);

  const result = await pool.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     RETURNING id, email, role, created_at`,
    [normalizedEmail, hash]
  );

  return result.rows[0];
}

/**
 * Verify email + password, return user row if valid.
 * @param {object} pool
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{id, email, created_at}|null>} null if invalid credentials
 */
export async function verifyCredentials(pool, email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await pool.query(
    'SELECT id, email, role, banned, password_hash, created_at FROM users WHERE email = $1',
    [normalizedEmail]
  );

  const user = result.rows[0];
  if (!user) return null;
  if (user.banned) return null;

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;

  return { id: user.id, email: user.email, role: user.role, created_at: user.created_at };
}

/**
 * Change a user's password. Verifies the old password first.
 * @param {object} pool
 * @param {number|string} userId
 * @param {string} oldPassword
 * @param {string} newPassword
 */
export async function changePassword(pool, userId, oldPassword, newPassword) {
  if (!newPassword || newPassword.length < 8) {
    throw new Error('新密码至少 8 个字符');
  }
  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const user = result.rows[0];
  if (!user) throw new Error('用户不存在');

  const valid = await bcrypt.compare(oldPassword, user.password_hash);
  if (!valid) throw new Error('当前密码错误');

  const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
}

/**
 * Get user by ID.
 * @param {object} pool
 * @param {number|string} userId
 * @returns {Promise<{id, email, created_at}|null>}
 */
export async function getUserById(pool, userId) {
  const result = await pool.query(
    'SELECT id, email, role, created_at FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] ?? null;
}

/**
 * Get or create a subscription for a user (default: free plan).
 * Returns the user's active subscription with plan details.
 * @param {object} pool
 * @param {number|string} userId
 * @returns {Promise<{plan_name, current_credits, period_end, features}>}
 */
export async function getOrCreateSubscription(pool, userId) {
  const existing = await pool.query(
    `SELECT s.id, s.current_credits, s.period_end, s.status,
            p.name AS plan_name, p.credit_amount, p.reset_period, p.features
     FROM subscriptions s
     JOIN plans p ON s.plan_id = p.id
     WHERE s.user_id = $1`,
    [userId]
  );

  if (existing.rows[0]) return existing.rows[0];

  const freePlan = await pool.query("SELECT id, credit_amount, features FROM plans WHERE name = 'free'");
  if (!freePlan.rows[0]) throw new Error('Free plan not found in database — run migrations');

  const plan = freePlan.rows[0];
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 1);

  const created = await pool.query(
    `INSERT INTO subscriptions (user_id, plan_id, current_credits, period_end)
     VALUES ($1, $2, $3, $4)
     RETURNING id, current_credits, period_end`,
    [userId, plan.id, plan.credit_amount, periodEnd.toISOString()]
  );

  return {
    ...created.rows[0],
    plan_name: 'free',
    credit_amount: plan.credit_amount,
    reset_period: 'daily',
    features: plan.features,
  };
}
