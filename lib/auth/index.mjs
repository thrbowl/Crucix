// Crucix Auth — Bearer Token authentication middleware
// v1.0: Simple token-based auth. v1.1 will add RBAC roles.

import config from '../../crucix.config.mjs';

const AUTH_ENABLED = config.auth?.enabled ?? (process.env.AUTH_ENABLED === 'true');
const ACCESS_TOKEN = config.auth?.accessToken ?? process.env.AUTH_ACCESS_TOKEN ?? null;

export function authMiddleware(req, res, next) {
  if (!AUTH_ENABLED) return next();

  if (!ACCESS_TOKEN) {
    console.warn('[Auth] AUTH_ENABLED=true but no ACCESS_TOKEN configured — rejecting all requests');
    return res.status(503).json({ error: 'Authentication enabled but no token configured' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header. Use: Bearer <token>' });
  }

  const token = authHeader.slice(7);
  if (token !== ACCESS_TOKEN) {
    return res.status(403).json({ error: 'Invalid access token' });
  }

  next();
}

export function isAuthEnabled() {
  return AUTH_ENABLED;
}
