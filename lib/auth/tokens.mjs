// lib/auth/tokens.mjs
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import config from '../../crucix.config.mjs';

const ACCESS_TTL  = config.jwt?.accessTtl  ?? '15m';
const REFRESH_TTL = config.jwt?.refreshTtl ?? '30d';

/**
 * Sign a JWT access token.
 * @param {{id, email, plan}} payload
 * @returns {string} signed JWT
 */
export function signAccessToken(payload) {
  const secret = config.jwt?.secret;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TTL });
}

/**
 * Verify a JWT access token.
 * @param {string} token
 * @returns {{id, email, plan}} decoded payload
 * @throws {Error} if invalid or expired
 */
export function verifyAccessToken(token) {
  const secret = config.jwt?.secret;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return jwt.verify(token, secret);
}

/**
 * Generate a new refresh token (random 32 bytes → 64-char hex).
 * @returns {{ plaintext: string, hash: string, expiresAt: Date }}
 */
export function generateRefreshToken() {
  const plaintext = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(plaintext).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  return { plaintext, hash, expiresAt };
}

/**
 * Hash a plaintext refresh token for DB lookup.
 */
export function hashToken(plaintext) {
  return createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Store a refresh token in the database.
 */
export async function storeRefreshToken(pool, userId, { hash, expiresAt }) {
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt.toISOString()]
  );
}

/**
 * Validate a refresh token from DB.
 * Returns user_id if valid, null if expired/revoked/not found.
 */
export async function validateRefreshToken(pool, plaintext) {
  const hash = hashToken(plaintext);
  const result = await pool.query(
    `SELECT user_id, expires_at, revoked
     FROM refresh_tokens
     WHERE token_hash = $1`,
    [hash]
  );

  const row = result.rows[0];
  if (!row) return null;
  if (row.revoked) return null;
  if (new Date(row.expires_at) < new Date()) return null;

  return row.user_id;
}

/**
 * Revoke a refresh token.
 */
export async function revokeRefreshToken(pool, plaintext) {
  const hash = hashToken(plaintext);
  await pool.query(
    'UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1',
    [hash]
  );
}

/**
 * Revoke all refresh tokens for a user (logout everywhere).
 */
export async function revokeAllRefreshTokens(pool, userId) {
  await pool.query(
    'UPDATE refresh_tokens SET revoked = true WHERE user_id = $1',
    [userId]
  );
}
