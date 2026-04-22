// lib/auth/index.mjs
import config from '../../crucix.config.mjs';
import { verifyAccessToken } from './tokens.mjs';
import { lookupApiKey } from './apikeys.mjs';
import { getOrCreateSubscription, getUserById } from './users.mjs';

/**
 * Authentication middleware.
 * Supports two methods:
 *   1. Bearer <JWT>    — JWT access token
 *   2. Bearer crx_...  — API Key (crx_ prefix)
 *
 * Attaches req.user = { id, email, plan, apiKeyId? } on success.
 * Falls through (unauthenticated) if JWT_SECRET not configured (dev mode).
 */
export function authMiddleware(pool) {
  const jwtSecret = config.jwt?.secret;

  // Warn once at construction time (not per-request)
  if (!jwtSecret) {
    console.warn('[Auth] JWT_SECRET not configured — auth disabled (dev mode)');
  }
  if (!pool) {
    console.warn('[Auth] DB pool not available — auth disabled');
  }

  return async function(req, res, next) {
    // Dev mode or no DB → skip auth (graceful degradation)
    if (!jwtSecret || !pool) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required. Use: Bearer <token>' });
    }

    const token = authHeader.slice(7);

    try {
      if (token.startsWith('crx_')) {
        // API Key authentication
        const lookup = await lookupApiKey(pool, token);
        if (!lookup) return res.status(401).json({ error: 'Invalid or revoked API key' });

        const sub = await getOrCreateSubscription(pool, lookup.userId);
        const userRow = await getUserById(pool, lookup.userId);
        req.user = {
          id: lookup.userId,
          email: userRow?.email,
          plan: sub.plan_name,
          apiKeyId: lookup.keyId,
        };
      } else {
        // JWT authentication
        const payload = verifyAccessToken(token);
        req.user = { id: payload.id, email: payload.email, plan: payload.plan };
      }
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Access token expired', code: 'TOKEN_EXPIRED' });
      }
      if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
        return res.status(401).json({ error: 'Invalid token' });
      }
      // Unexpected errors (DB failures, etc.) — log and return 500
      console.error('[Auth] Unexpected error during authentication:', err.message);
      return res.status(500).json({ error: 'Authentication service error' });
    }
  };
}

export function isAuthEnabled() {
  return !!config.jwt?.secret;
}
