#!/usr/bin/env node
// Crucix Intelligence Engine — Web Server
// Serves the dashboard and REST API. Every endpoint queries PostgreSQL directly.

import express from 'express';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import config from './crucix.config.mjs';
import { getLocale, currentLanguage, getSupportedLocales, loadLocaleByCode, isSupported } from './lib/i18n.mjs';
import { authMiddleware, isAuthEnabled, requireAdmin } from './lib/auth/index.mjs';
import cookieParser from 'cookie-parser';
import { registerUser, verifyCredentials, getOrCreateSubscription, getUserById, changePassword } from './lib/auth/users.mjs';
import { signAccessToken, generateRefreshToken, storeRefreshToken, validateRefreshToken, revokeRefreshToken, revokeAllRefreshTokens } from './lib/auth/tokens.mjs';
import { generateApiKey, storeApiKey, listApiKeys, revokeApiKey } from './lib/auth/apikeys.mjs';
import { getCreditBalance } from './lib/credits/index.mjs';
import { exportIOCsJSON, exportIOCsCSV, exportIOCsSTIX, exportCVEsJSON, exportCVEsCSV } from './lib/export/index.mjs';
import { matchIOC, matchCVE, filterByWatchlist } from './lib/watchlist/index.mjs';
import { generateDailyReport, generateReportHTML } from './lib/report/index.mjs';
import { lookupIP } from './lib/geoip.mjs';
import { getPool, closePool } from './lib/db/index.mjs';
import { runMigrations } from './lib/db/migrate.mjs';
import { createV1Router } from './lib/api/v1/router.mjs';
import { getSourceHealth } from './lib/sources/index.mjs';
import { writeAuditLog, queryAuditLogs } from './lib/audit.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const startTime = Date.now();
const sseClients = new Set();

// === Express Server ===
const app = express();
app.use(express.json());
app.use(cookieParser());

const PROTECTED_PAGES = [
  '/', '/index.html', '/briefing.html', '/briefing', '/search.html', '/search',
  '/workbench.html', '/workbench', '/watchlist.html', '/watchlist',
  '/sources.html', '/sources', '/account.html', '/account',
];
app.use((req, res, next) => {
  if (PROTECTED_PAGES.includes(req.path) && !req.cookies?.refresh_token) {
    return res.redirect('/login');
  }
  next();
});

// Clean URL support: /search → /search.html
app.use((req, res, next) => {
  if (!req.path.includes('.') && req.path !== '/') {
    const htmlPath = join(ROOT, 'dashboard/public', req.path + '.html');
    if (existsSync(htmlPath)) return res.sendFile(htmlPath);
  }
  next();
});

app.use(express.static(join(ROOT, 'dashboard/public')));

// Serve placeholder until new dashboard is ready
app.get('/', (_req, res) => {
  res.sendFile(join(ROOT, 'dashboard/public/index.html'));
});

// === Auth Routes ===
const requireAuth = authMiddleware(getPool());

app.post('/api/auth/register', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    const user = await registerUser(pool, email, password);
    await getOrCreateSubscription(pool, user.id);
    res.status(201).json({ id: user.id, email: user.email });
  } catch (err) {
    if (err.message.includes('duplicate key') || err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    if (err.message.startsWith('Invalid') || err.message.startsWith('Password')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[Auth] Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    const user = await verifyCredentials(pool, email, password);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const sub = await getOrCreateSubscription(pool, user.id);
    const accessToken = signAccessToken({ id: user.id, email: user.email, role: user.role, plan: sub.plan_name });
    const { plaintext, hash, expiresAt } = generateRefreshToken();
    await storeRefreshToken(pool, user.id, { hash, expiresAt });

    res.cookie('refresh_token', plaintext, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      expires: expiresAt,
    });

    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      user: { id: user.id, email: user.email, plan: sub.plan_name, credits: sub.current_credits },
    });
    writeAuditLog(pool, { userId: user.id, action: 'user.login', target: email, ip: req.ip });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ error: 'Refresh token missing' });

  try {
    const userId = await validateRefreshToken(pool, token);
    if (!userId) return res.status(401).json({ error: 'Invalid or expired refresh token' });

    await revokeRefreshToken(pool, token);

    const sub = await getOrCreateSubscription(pool, userId);
    const userRow = await getUserById(pool, userId);
    const accessToken = signAccessToken({ id: userId, email: userRow?.email, role: userRow?.role ?? 'user', plan: sub.plan_name });
    const { plaintext, hash, expiresAt } = generateRefreshToken();
    await storeRefreshToken(pool, userId, { hash, expiresAt });

    res.cookie('refresh_token', plaintext, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      expires: expiresAt,
    });

    res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 900 });
  } catch (err) {
    console.error('[Auth] Refresh error:', err.message);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  const pool = getPool();
  const token = req.cookies?.refresh_token;
  if (pool && token) await revokeRefreshToken(pool, token).catch(() => {});
  res.clearCookie('refresh_token');
  res.json({ message: 'Logged out' });
  writeAuditLog(pool, { userId: req.user?.id, action: 'user.logout', ip: req.ip });
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { old_password, new_password } = req.body ?? {};
    if (!old_password || !new_password) return res.status(400).json({ error: 'old_password and new_password are required' });
    await changePassword(pool, req.user.id, old_password, new_password);
    await revokeAllRefreshTokens(pool, req.user.id);
    res.clearCookie('refresh_token');
    res.json({ message: 'Password changed' });
    writeAuditLog(pool, { userId: req.user.id, action: 'user.password_change', target: req.user.email, ip: req.ip });
  } catch (err) {
    if (err.message === '当前密码错误') return res.status(401).json({ error: err.message });
    if (err.message === '新密码至少 8 个字符') return res.status(400).json({ error: err.message });
    console.error('[Auth] Change password error:', err.message);
    res.status(500).json({ error: '修改密码失败' });
  }
});

// === Admin API ===
const adminAuth = [requireAuth, requireAdmin];

app.get('/api/admin/users', ...adminAuth, async (req, res) => {
  const pool = getPool();
  try {
    const q = await pool.query(
      `SELECT u.id, u.email, u.role, u.banned, u.created_at, u.email_verified,
              s.current_credits, p.name AS plan_name
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id
       LEFT JOIN plans p ON p.id = s.plan_id
       ORDER BY u.created_at DESC`
    );
    res.json(q.rows);
  } catch (err) {
    console.error('[Admin] List users error:', err.message);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

app.patch('/api/admin/users/:id/role', ...adminAuth, async (req, res) => {
  const pool = getPool();
  const userId = req.params.id;
  const { role } = req.body ?? {};
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role. Must be user or admin' });
  if (String(userId) === String(req.user.id)) return res.status(400).json({ error: 'Cannot change your own role' });
  try {
    const q = await pool.query('UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role', [role, userId]);
    if (!q.rows[0]) return res.status(404).json({ error: 'User not found' });
    writeAuditLog(pool, { userId: req.user.id, action: 'user.role_change', target: q.rows[0].email, detail: { role }, ip: req.ip });
    res.json(q.rows[0]);
  } catch (err) {
    console.error('[Admin] Change role error:', err.message);
    res.status(500).json({ error: 'Failed to change role' });
  }
});

app.patch('/api/admin/users/:id/ban', ...adminAuth, async (req, res) => {
  const pool = getPool();
  const userId = req.params.id;
  const { banned } = req.body ?? {};
  if (typeof banned !== 'boolean') return res.status(400).json({ error: 'banned must be true or false' });
  if (String(userId) === String(req.user.id)) return res.status(400).json({ error: 'Cannot ban yourself' });
  try {
    const q = await pool.query('UPDATE users SET banned = $1 WHERE id = $2 RETURNING id, email, banned', [banned, userId]);
    if (!q.rows[0]) return res.status(404).json({ error: 'User not found' });
    const action = banned ? 'user.ban' : 'user.unban';
    writeAuditLog(pool, { userId: req.user.id, action, target: q.rows[0].email, ip: req.ip });
    res.json(q.rows[0]);
  } catch (err) {
    console.error('[Admin] Ban error:', err.message);
    res.status(500).json({ error: 'Failed to update ban status' });
  }
});

app.post('/api/admin/users/:id/reset-password', ...adminAuth, async (req, res) => {
  const pool = getPool();
  const userId = req.params.id;
  try {
    const crypto = await import('crypto');
    const tempPassword = crypto.randomBytes(12).toString('base64url').slice(0, 16);
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash(tempPassword, 12);
    const q = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, email', [hash, userId]);
    if (!q.rows[0]) return res.status(404).json({ error: 'User not found' });
    await revokeAllRefreshTokens(pool, userId);
    writeAuditLog(pool, { userId: req.user.id, action: 'user.reset_password', target: q.rows[0].email, ip: req.ip });
    res.json({ message: 'Password reset', temp_password: tempPassword });
  } catch (err) {
    console.error('[Admin] Reset password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

app.get('/api/admin/sources', ...adminAuth, async (req, res) => {
  const pool = getPool();
  try {
    const sources = await getSourceHealth(pool);
    res.json(sources);
  } catch (err) {
    console.error('[Admin] List sources error:', err.message);
    res.status(500).json({ error: 'Failed to list sources' });
  }
});

app.patch('/api/admin/sources/:name', ...adminAuth, async (req, res) => {
  const pool = getPool();
  const sourceName = decodeURIComponent(req.params.name);
  const { domain, type, enabled, homepage_url } = req.body ?? {};
  const sets = [];
  const params = [];
  let idx = 1;
  if (domain !== undefined) { sets.push(`domain = $${idx++}`); params.push(domain); }
  if (type !== undefined) { sets.push(`type = $${idx++}`); params.push(type); }
  if (enabled !== undefined) { sets.push(`enabled = $${idx++}`); params.push(enabled); }
  if (homepage_url !== undefined) { sets.push(`homepage_url = $${idx++}`); params.push(homepage_url); }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  sets.push(`updated_at = now()`);
  params.push(sourceName);
  try {
    const q = await pool.query(`UPDATE sources SET ${sets.join(', ')} WHERE name = $${idx} RETURNING *`, params);
    if (!q.rows[0]) return res.status(404).json({ error: 'Source not found' });
    const action = enabled === true ? 'source.enable' : enabled === false ? 'source.disable' : 'source.edit';
    writeAuditLog(pool, { userId: req.user.id, action, target: sourceName, detail: req.body, ip: req.ip });
    res.json(q.rows[0]);
  } catch (err) {
    console.error('[Admin] Update source error:', err.message);
    res.status(500).json({ error: 'Failed to update source' });
  }
});

app.post('/api/admin/sources/:name/trigger', ...adminAuth, async (req, res) => {
  const sourceName = decodeURIComponent(req.params.name);
  const pool = getPool();
  writeAuditLog(pool, { userId: req.user.id, action: 'source.trigger', target: sourceName, ip: req.ip });
  res.json({ message: `Trigger queued for ${sourceName}` });
  // TODO: implement single-source sweep trigger when worker supports it
});

app.get('/api/admin/sources/:name/history', ...adminAuth, async (req, res) => {
  const pool = getPool();
  const sourceName = decodeURIComponent(req.params.name);
  try {
    const q = await pool.query(
      `SELECT TO_CHAR(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*) AS cnt
       FROM raw_intel_items WHERE source_name = $1 AND last_seen_at >= NOW() - INTERVAL '30 days'
       GROUP BY day ORDER BY day`,
      [sourceName],
    );
    res.json(q.rows);
  } catch (err) {
    console.error('[Admin] Source history error:', err.message);
    res.status(500).json({ error: 'Failed to get source history' });
  }
});

app.get('/api/admin/audit-logs', ...adminAuth, async (req, res) => {
  const pool = getPool();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const action = req.query.action || undefined;
  const userId = req.query.user_id ? parseInt(req.query.user_id) : undefined;
  try {
    const result = await queryAuditLogs(pool, { page, limit, action, userId });
    res.json(result);
  } catch (err) {
    console.error('[Admin] Audit logs error:', err.message);
    res.status(500).json({ error: 'Failed to query audit logs' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const pool = getPool();
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const balance = pool ? await getCreditBalance(pool, req.user.id) : null;
  res.json({
    id: req.user.id,
    email: req.user.email,
    role: req.user.role ?? 'user',
    plan: req.user.plan,
    credits: balance?.current_credits ?? null,
    period_end: balance?.period_end ?? null,
    is_admin: req.user.role === 'admin',
  });
});

app.post('/api/auth/keys', requireAuth, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { name } = req.body;
  if (name && name.length > 100) return res.status(400).json({ error: 'Key name must be 100 characters or fewer' });
  const { plaintext, hash } = generateApiKey();
  const key = await storeApiKey(pool, req.user.id, hash, name);
  res.status(201).json({ ...key, key: plaintext, warning: 'Store this key securely — it will not be shown again' });
});

app.get('/api/auth/keys', requireAuth, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const keys = await listApiKeys(pool, req.user.id);
  res.json(keys);
});

app.delete('/api/auth/keys/:id', requireAuth, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const revoked = await revokeApiKey(pool, req.user.id, req.params.id);
  if (!revoked) return res.status(404).json({ error: 'Key not found or already revoked' });
  res.json({ message: 'API key revoked' });
});

// Auth middleware for /api/* routes (health + stats are public)
const PUBLIC_API = new Set(['/health', '/stats']);
app.use('/api', (req, res, next) => {
  if (PUBLIC_API.has(req.path)) return next();
  return authMiddleware(getPool())(req, res, next);
});

// === REST API v1 — DB-first, no in-memory fallback ===
app.use('/api/v1', createV1Router({ getPool, getCurrentData: () => null }));

// === Data API Endpoints — all query PostgreSQL directly ===

// IOC helpers: query stix_objects for indicators
async function queryIOCsFromDB(pool) {
  if (!pool) return [];
  const r = await pool.query(`SELECT data FROM stix_objects WHERE type = 'indicator' ORDER BY last_seen_at DESC LIMIT 500`);
  return r.rows.map(row => {
    const d = row.data;
    return {
      value: d['x_crucix_ioc_value'] || d.name,
      type: d['x_crucix_ioc_type'] || 'unknown',
      confidence: d['x_crucix_confidence_score'] || 50,
      tags: d['x_crucix_tags'] || [],
      firstSeen: d['x_crucix_last_seen'] || d.valid_from,
      source: (d['x_crucix_sources'] || [])[0] || 'unknown',
      lifecycle: d['x_crucix_ioc_lifecycle'] || 'active',
      hash: d['x_crucix_ioc_type'] === 'file' ? d['x_crucix_ioc_value'] : undefined,
      ip: (d['x_crucix_ioc_type'] === 'ipv4-addr' || d['x_crucix_ioc_type'] === 'ipv6-addr') ? d['x_crucix_ioc_value'] : undefined,
      url: d['x_crucix_ioc_type'] === 'url' ? d['x_crucix_ioc_value'] : undefined,
    };
  });
}

async function queryCVEsFromDB(pool, limit = 50) {
  if (!pool) return [];
  const r = await pool.query(
    `SELECT data FROM stix_objects WHERE type = 'vulnerability' ORDER BY data->>'x_crucix_priority_score' DESC NULLS LAST LIMIT ${limit}`
  );
  return r.rows.map(row => {
    const d = row.data;
    return {
      id: d.name, cvss: parseFloat(d['x_crucix_cvss_score']) || null,
      epss: parseFloat(d['x_crucix_epss_score']) || null,
      description: (d.description || '').substring(0, 200),
      publishedDate: d.created,
      inKEV: d['x_crucix_kev_listed'] === true, hasPoc: d['x_crucix_exploit_public'] === true,
      sources: d['x_crucix_sources'] || [], lifecycle: d['x_crucix_lifecycle'] || 'published',
    };
  });
}

// IOC export — supports JSON, CSV, STIX formats
app.get('/api/iocs', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const allIOCs = await queryIOCsFromDB(pool);
    const format = (req.query.format || 'json').toLowerCase();
    switch (format) {
      case 'csv':
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=crucix-iocs.csv');
        return res.send(exportIOCsCSV(allIOCs));
      case 'stix':
        res.setHeader('Content-Type', 'application/json');
        return res.send(exportIOCsSTIX(allIOCs));
      default:
        return res.json(JSON.parse(exportIOCsJSON(allIOCs)));
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CVE intelligence lookup
app.get('/api/cve/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  const cveId = req.params.id.toUpperCase();
  try {
    const r = await pool.query(
      `SELECT data FROM stix_objects WHERE type = 'vulnerability' AND (data->>'name') = $1 LIMIT 1`,
      [cveId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: `CVE ${cveId} not found` });
    const d = r.rows[0].data;
    const cve = {
      id: d.name, cvss: parseFloat(d['x_crucix_cvss_score']) || null,
      epss: parseFloat(d['x_crucix_epss_score']) || null,
      description: d.description || '', publishedDate: d.created,
      inKEV: d['x_crucix_kev_listed'] === true, hasPoc: d['x_crucix_exploit_public'] === true,
      sources: d['x_crucix_sources'] || [], lifecycle: d['x_crucix_lifecycle'] || 'published',
    };
    const watchlistMatches = matchCVE(cve);
    res.json({ ...cve, watchlistMatches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Threat actor details
app.get('/api/actor/:name', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  const name = req.params.name.toLowerCase();
  try {
    const r = await pool.query(
      `SELECT content FROM raw_intel_items WHERE source_name = 'Ransomware-Live' AND content::jsonb->>'group' ILIKE $1 ORDER BY last_seen_at DESC LIMIT 100`,
      [`%${name}%`]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: `Actor "${req.params.name}" not found` });
    const victims = r.rows.map(row => { try { return JSON.parse(row.content); } catch { return null; } }).filter(Boolean);
    res.json({ group: { name }, victims, totalVictims: victims.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cross-source IOC lookup
app.get('/api/ioc/lookup', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  const value = (req.query.value || '').trim();
  if (!value) return res.status(400).json({ error: 'Missing "value" query parameter' });
  try {
    const r = await pool.query(
      `SELECT data FROM stix_objects WHERE type = 'indicator' AND (
         data->>'x_crucix_ioc_value' ILIKE $1
         OR data->>'name' ILIKE $1
         OR data->>'pattern' ILIKE $1
       ) LIMIT 100`,
      [`%${value}%`]
    );
    const matches = r.rows.map(row => ({
      value: row.data['x_crucix_ioc_value'] || row.data.name,
      type: row.data['x_crucix_ioc_type'] || 'unknown',
      confidence: row.data['x_crucix_confidence_score'] || 50,
      tags: row.data['x_crucix_tags'] || [],
      source: (row.data['x_crucix_sources'] || [])[0] || 'unknown',
      lifecycle: row.data['x_crucix_ioc_lifecycle'] || 'active',
    }));
    const watchlistMatches = matches.flatMap(ioc => matchIOC(ioc));
    res.json({ query: value, total: matches.length, results: matches, watchlistMatches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STIX/TAXII compatible IOC feed
app.get('/api/feed/iocs', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const allIOCs = await queryIOCsFromDB(pool);
    res.setHeader('Content-Type', 'application/stix+json;version=2.1');
    res.send(exportIOCsSTIX(allIOCs));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CVE export
app.get('/api/cves', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const cves = await queryCVEsFromDB(pool, 200);
    const format = (req.query.format || 'json').toLowerCase();
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=crucix-cves.csv');
      return res.send(exportCVEsCSV(cves));
    }
    return res.json(JSON.parse(exportCVEsJSON(cves)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Daily threat report
app.get('/api/report/daily', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const format = (req.query.format || 'markdown').toLowerCase();
    const srcQ = await pool.query(`SELECT source_name, COUNT(*) AS cnt FROM raw_intel_items WHERE last_seen_at >= NOW() - INTERVAL '24 hours' GROUP BY source_name`);
    const sources = {};
    for (const row of srcQ.rows) sources[row.source_name] = { status: 'active', itemCount: parseInt(row.cnt) };
    const sweepData = {
      crucix: { version: '0.3.0-cybersec', timestamp: new Date().toISOString(), sourcesOk: srcQ.rows.length, sourcesQueried: 49 },
      sources, errors: [],
    };

    // Compute threat level from DB
    const threatQ = await pool.query(`SELECT
      COUNT(*) FILTER (WHERE source_name = 'CISA-KEV') AS kev,
      COUNT(*) FILTER (WHERE source_name = 'Feodo') AS c2,
      COUNT(*) FILTER (WHERE source_name = 'MalwareBazaar') AS malware
    FROM raw_intel_items WHERE last_seen_at >= NOW() - INTERVAL '24 hours'`);
    const tr = threatQ.rows[0] || {};
    let threatScore = Math.min(parseInt(tr.kev || 0) * 5 + parseInt(tr.c2 || 0) + parseInt(tr.malware || 0), 100);
    const threatLevel = threatScore >= 75 ? 'CRITICAL' : threatScore >= 50 ? 'HIGH' : threatScore >= 25 ? 'ELEVATED' : 'LOW';
    const delta = { overallLevel: threatLevel, threatIndex: threatScore, direction: threatScore >= 40 ? 'stable' : 'improving', summary: { direction: 'stable' } };

    const report = generateDailyReport(sweepData, delta, { getCVETracker: () => ({}) });
    if (format === 'html') {
      res.setHeader('Content-Type', 'text/html');
      return res.send(`<!DOCTYPE html><html><head><title>Crucix Daily Report</title><style>body{font-family:Inter,sans-serif;max-width:900px;margin:40px auto;padding:20px;background:#0a0a0f;color:#e0e0e0;}h1{color:#00e5ff;}h2{color:#ff6d00;border-bottom:1px solid #333;padding-bottom:8px;}h3{color:#ffc107;}a{color:#00e5ff;}li{margin:4px 0;}</style></head><body>${generateReportHTML(report)}</body></html>`);
    }
    res.setHeader('Content-Type', 'text/markdown');
    res.send(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Threat overview API
app.get('/api/threats', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const r = await pool.query(`SELECT
      COUNT(*) FILTER (WHERE source_name = 'CISA-KEV') AS kev,
      COUNT(*) FILTER (WHERE source_name = 'NVD') AS crit_cve,
      COUNT(*) FILTER (WHERE source_name = 'Feodo') AS c2,
      COUNT(*) FILTER (WHERE source_name = 'MalwareBazaar') AS malware,
      COUNT(*) FILTER (WHERE source_name = 'URLhaus') AS urlhaus,
      COUNT(*) FILTER (WHERE source_name = 'Ransomware-Live') AS ransom
    FROM raw_intel_items WHERE last_seen_at >= NOW() - INTERVAL '24 hours'`);
    const t = r.rows[0] || {};
    let score = 0;
    score += Math.min(parseInt(t.kev || 0) * 5, 20);
    score += Math.min(parseInt(t.crit_cve || 0) * 3, 15);
    score += Math.min(Math.floor(parseInt(t.c2 || 0) / 10), 10);
    score += Math.min(Math.floor(parseInt(t.malware || 0) / 5), 10);
    score += Math.min(parseInt(t.ransom || 0) * 2, 15);
    score += Math.min(Math.floor(parseInt(t.urlhaus || 0) / 100), 10);
    score = Math.min(score, 100);
    const level = score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 25 ? 'ELEVATED' : 'LOW';
    const dir = score >= 70 ? 'worsening' : score >= 40 ? 'stable' : 'improving';
    res.json({ level, index: score, direction: dir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Watchlist matches
app.get('/api/watchlist/matches', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const [iocR, cveR] = await Promise.all([
      pool.query(`SELECT data FROM stix_objects WHERE type = 'indicator' LIMIT 500`),
      pool.query(`SELECT data FROM stix_objects WHERE type = 'vulnerability' LIMIT 200`),
    ]);
    const iocs = iocR.rows.map(r => ({
      value: r.data['x_crucix_ioc_value'] || r.data.name,
      type: r.data['x_crucix_ioc_type'] || 'unknown',
      tags: r.data['x_crucix_tags'] || [],
    }));
    const cves = cveR.rows.map(r => ({ id: r.data.name, description: r.data.description || '' }));
    res.json(filterByWatchlist(iocs, cves));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: source health status
app.get('/api/sources', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const sources = await getSourceHealth(pool);
    res.json(sources);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: health check
app.get('/api/health', async (req, res) => {
  const pool = getPool();
  let lastSweep = null;
  let sourcesOk = 0;
  if (pool) {
    try {
      const r = await pool.query('SELECT MAX(last_seen_at) AS latest FROM raw_intel_items');
      lastSweep = r.rows[0]?.latest || null;
      const src = await pool.query('SELECT COUNT(DISTINCT source_name) AS cnt FROM raw_intel_items WHERE last_seen_at >= NOW() - INTERVAL \'1 hour\'');
      sourcesOk = parseInt(src.rows[0]?.cnt || 0);
    } catch {}
  }
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    lastSweep,
    nextSweep: lastSweep
      ? new Date(new Date(lastSweep).getTime() + config.refreshIntervalMinutes * 60000).toISOString()
      : null,
    sourcesOk,
    llmEnabled: !!config.llm.provider,
    llmProvider: config.llm.provider,
    refreshIntervalMinutes: config.refreshIntervalMinutes,
    language: currentLanguage,
    db: pool ? 'connected' : 'not-configured',
  });
});

// API: DB-sourced stats for 简报中心 dashboard
app.get('/api/stats', async (req, res) => {
  const rawDays = parseInt(req.query.days);
  const days = isNaN(rawDays) ? 30 : Math.max(0, Math.min(rawDays, 90));
  const pool = getPool();
  if (!pool) return res.json({ db: null });

  try {
    const since = `DATE_TRUNC('day', NOW()) - INTERVAL '${days === 0 ? 0 : days - 1} days'`;
    const prevSince = `DATE_TRUNC('day', NOW()) - INTERVAL '${days === 0 ? 1 : days * 2 - 1} days'`;
    const prevUntil = `DATE_TRUNC('day', NOW()) - INTERVAL '${days === 0 ? 0 : days - 1} days'`;

    const cveQ = await pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE (data->>'x_crucix_kev_listed')::boolean = true OR (data->>'x_crucix_exploit_public')::boolean = true OR (data->>'x_crucix_cvss_score')::numeric >= 7.0) AS high_risk, COUNT(*) FILTER (WHERE last_seen_at >= ${since}) AS new_in_period, COUNT(*) FILTER (WHERE last_seen_at >= ${prevSince} AND last_seen_at < ${prevUntil}) AS new_in_prev_period FROM stix_objects WHERE type = 'vulnerability'`);

    const iocQ = await pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE data->>'x_crucix_ioc_lifecycle' IN ('fresh','active')) AS active, COUNT(*) FILTER (WHERE last_seen_at >= ${since}) AS new_in_period, COUNT(*) FILTER (WHERE last_seen_at >= ${prevSince} AND last_seen_at < ${prevUntil}) AS new_in_prev_period FROM stix_objects WHERE type = 'indicator'`);

    const intelTotalQ = await pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE last_seen_at >= ${since}) AS current_period, COUNT(*) FILTER (WHERE last_seen_at >= ${prevSince} AND last_seen_at < ${prevUntil}) AS prev_period FROM raw_intel_items`);

    const victimQ = await pool.query(`SELECT COUNT(*) FILTER (WHERE last_seen_at >= ${since}) AS current_period, COUNT(*) FILTER (WHERE last_seen_at >= ${prevSince} AND last_seen_at < ${prevUntil}) AS prev_period FROM raw_intel_items WHERE source_name = 'Ransomware-Live'`);

    const trendQ = await pool.query(`SELECT TO_CHAR(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, source_type, COUNT(*) AS cnt FROM raw_intel_items WHERE last_seen_at >= ${since} GROUP BY TO_CHAR(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), source_type ORDER BY day ASC`);

    const lifecycleQ = await pool.query(`SELECT data->>'x_crucix_ioc_lifecycle' AS lifecycle, COUNT(*) AS cnt FROM stix_objects WHERE type = 'indicator' AND data->>'x_crucix_ioc_lifecycle' IS NOT NULL GROUP BY data->>'x_crucix_ioc_lifecycle'`);

    const typeDistQ = await pool.query(`SELECT source_type, COUNT(*) AS cnt FROM raw_intel_items WHERE last_seen_at >= ${since} GROUP BY source_type`);

    const ransomGroupQ = await pool.query(`SELECT content::jsonb->>'group' AS name, COUNT(*) AS cnt FROM raw_intel_items WHERE source_name = 'Ransomware-Live' AND last_seen_at >= ${since} AND content::jsonb->>'group' IS NOT NULL AND content::jsonb->>'group' != 'Unknown' GROUP BY content::jsonb->>'group' ORDER BY cnt DESC LIMIT 10`);

    const ransomSectorQ = await pool.query(`SELECT content::jsonb->>'sector' AS name, COUNT(*) AS cnt FROM raw_intel_items WHERE source_name = 'Ransomware-Live' AND last_seen_at >= ${since} AND content::jsonb->>'sector' IS NOT NULL AND content::jsonb->>'sector' != 'Unknown' GROUP BY content::jsonb->>'sector' ORDER BY cnt DESC LIMIT 10`);

    const cveTrendQ = await pool.query(`SELECT TO_CHAR(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*) AS cnt FROM stix_objects WHERE type = 'vulnerability' AND last_seen_at >= ${since} GROUP BY TO_CHAR(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') ORDER BY day ASC`);

    const alertsQ = await pool.query(`SELECT source_name, title, url, last_seen_at AS date FROM raw_intel_items WHERE source_name IN ('CISA-Alerts','CERTs-Intl','CNCERT','CNVD','ENISA') AND last_seen_at >= ${since} ORDER BY last_seen_at DESC LIMIT 30`);

    const threatQ = await pool.query(`SELECT COUNT(*) FILTER (WHERE source_name = 'CISA-KEV') AS kev, COUNT(*) FILTER (WHERE source_name = 'NVD') AS crit_cve, COUNT(*) FILTER (WHERE source_name = 'Feodo') AS c2, COUNT(*) FILTER (WHERE source_name = 'MalwareBazaar') AS malware, COUNT(*) FILTER (WHERE source_name = 'URLhaus') AS urlhaus FROM raw_intel_items WHERE last_seen_at >= ${since}`);
    const tr = threatQ.rows[0] || {};
    let threatScore = Math.min(parseInt(tr.kev || 0) * 5, 20) + Math.min(parseInt(tr.crit_cve || 0) * 3, 15) + Math.min(Math.floor(parseInt(tr.c2 || 0) / 10), 10) + Math.min(Math.floor(parseInt(tr.malware || 0) / 5), 10) + Math.min(parseInt(victimQ.rows[0]?.current_period || 0) * 2, 15) + Math.min(Math.floor(parseInt(tr.urlhaus || 0) / 100), 10);
    threatScore = Math.min(threatScore, 100);
    const threatLevel = threatScore >= 75 ? 'CRITICAL' : threatScore >= 50 ? 'HIGH' : threatScore >= 25 ? 'ELEVATED' : 'LOW';
    const threatDir = threatScore >= 70 ? 'worsening' : threatScore >= 40 ? 'stable' : 'improving';

    const COUNTRY_GEO = { US:[39,-98],CN:[35,105],DE:[51,10],FR:[46,2],NL:[52.1,5.3],GB:[54,-2],RU:[56,38],BR:[-14,-51],IN:[20,78],JP:[36,138],KR:[37,127],SG:[1.35,103.8],AU:[-25,134],CA:[56,-96],IT:[42,12],ES:[40,-4],SE:[62,15],HK:[22.3,114.2],TW:[23.5,121],PL:[52,20],RO:[46,25],UA:[49,32],ID:[-2,118],TH:[15,100] };
    const geoQ = await pool.query(`SELECT source_name, title, content FROM raw_intel_items WHERE source_name IN ('Feodo','AbuseIPDB','Ransomware-Live','OTX') AND last_seen_at >= ${since} ORDER BY last_seen_at DESC LIMIT 200`);
    const geoPoints = [];
    for (const row of geoQ.rows) {
      let c; try { c = JSON.parse(row.content); } catch { continue; }
      const sn = row.source_name;
      if (sn === 'Feodo' || sn === 'AbuseIPDB') {
        const ip = c.ip || c.ip_address || c.ipAddress; if (!ip) continue;
        const geo = await lookupIP(ip); if (!geo) continue;
        const loc = geo.city ? `${geo.city}, ${geo.country}` : (geo.country ?? '');
        geoPoints.push({ lat: geo.lat, lon: geo.lon, type: sn === 'Feodo' ? 'c2' : 'honeypot', label: sn === 'Feodo' ? `C2: ${ip} (${c.malware || 'unknown'}) · ${loc}` : `Abuse: ${ip} (${c.totalReports || 0} reports) · ${loc}`, severity: sn === 'Feodo' ? 'critical' : 'medium', source: sn });
      } else if (sn === 'Ransomware-Live') {
        const cc = c.country; const coords = cc ? COUNTRY_GEO[cc] : null; if (!coords) continue;
        geoPoints.push({ lat: coords[0] + (Math.random() - 0.5) * 0.8, lon: coords[1] + (Math.random() - 0.5) * 0.8, type: 'victim', label: `${c.group || '?'}: ${c.name || '?'}`, severity: 'high', source: sn });
      }
    }

    res.json({
      db: 'connected', days,
      cve: { total: parseInt(cveQ.rows[0]?.total || 0), high_risk: parseInt(cveQ.rows[0]?.high_risk || 0), new_in_period: parseInt(cveQ.rows[0]?.new_in_period || 0), new_in_prev_period: parseInt(cveQ.rows[0]?.new_in_prev_period || 0) },
      ioc: { total: parseInt(iocQ.rows[0]?.total || 0), active: parseInt(iocQ.rows[0]?.active || 0), new_in_period: parseInt(iocQ.rows[0]?.new_in_period || 0), new_in_prev_period: parseInt(iocQ.rows[0]?.new_in_prev_period || 0) },
      intel: { total: parseInt(intelTotalQ.rows[0]?.total || 0), current_period: parseInt(intelTotalQ.rows[0]?.current_period || 0), prev_period: parseInt(intelTotalQ.rows[0]?.prev_period || 0) },
      victims: { current_period: parseInt(victimQ.rows[0]?.current_period || 0), prev_period: parseInt(victimQ.rows[0]?.prev_period || 0), total: parseInt(victimQ.rows[0]?.current_period || 0), activeGroups: ransomGroupQ.rows.length },
      ransomGroups: ransomGroupQ.rows.map(r => ({ name: r.name, count: parseInt(r.cnt) })),
      ransomSectors: ransomSectorQ.rows.map(r => ({ name: r.name, count: parseInt(r.cnt) })),
      trend: trendQ.rows.map(r => ({ day: r.day, source_type: r.source_type, count: parseInt(r.cnt) })),
      cveTrend: cveTrendQ.rows.map(r => ({ day: r.day, count: parseInt(r.cnt) })),
      lifecycle: lifecycleQ.rows.map(r => ({ lifecycle: r.lifecycle, count: parseInt(r.cnt) })),
      typeDistribution: typeDistQ.rows.map(r => ({ type: r.source_type, count: parseInt(r.cnt) })),
      alerts: alertsQ.rows.map(r => ({ source: r.source_name, title: r.title, url: r.url, date: r.date })),
      threats: { level: threatLevel, index: threatScore, direction: threatDir },
      geoAttacks: geoPoints,
    });
  } catch (err) {
    console.error('[/api/stats]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// API: get a specific locale by code (for client-side language switching)
app.get('/api/locale/:lang', (req, res) => {
  const lang = req.params.lang;
  if (!isSupported(lang)) return res.status(404).json({ error: `Unsupported locale: ${lang}` });
  const locale = loadLocaleByCode(lang);
  if (!locale) return res.status(404).json({ error: `Locale not found: ${lang}` });
  res.json(locale);
});

app.get('/api/locales', (req, res) => {
  res.json({ current: currentLanguage, supported: getSupportedLocales() });
});

// SSE: lightweight refresh notifications
let lastNotifiedUpdate = null;
app.get('/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
  res.write('data: {"type":"connected"}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch { sseClients.delete(client); }
  }
}

// Lightweight SSE notifier: checks DB for new data, pushes "refresh" to browsers
function startSSENotifier() {
  setInterval(async () => {
    const pool = getPool();
    if (!pool) return;
    try {
      const r = await pool.query('SELECT MAX(updated_at) AS latest FROM raw_intel_items');
      const latest = r.rows[0]?.latest;
      if (!latest) return;
      if (lastNotifiedUpdate && new Date(latest) <= new Date(lastNotifiedUpdate)) return;
      lastNotifiedUpdate = latest;
      broadcast({ type: 'refresh' });
    } catch {}
  }, 10_000);
}

// Global JSON error handler
app.use((err, req, res, _next) => {
  console.error('[API] Unhandled error:', err.message);
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
});

// === Startup ===
async function start() {
  const port = config.port;

  console.log(`
  ╔══════════════════════════════════════════════╗
  ║      CRUCIX CYBERSECURITY INTELLIGENCE       ║
  ║         Threat Intel · v1.0.0                ║
  ╠══════════════════════════════════════════════╣
  ║  Dashboard:  http://localhost:${port}${' '.repeat(Math.max(0, 14 - String(port).length))}║
  ║  Health:     http://localhost:${port}/api/health${' '.repeat(Math.max(0, 4 - String(port).length))}║
  ║  Auth:       ${isAuthEnabled() ? 'enabled (Bearer Token)' : 'disabled'}${' '.repeat(isAuthEnabled() ? 10 : 23)}║
  ╚══════════════════════════════════════════════╝
  `);

  const pool = getPool();
  if (pool) {
    await runMigrations();
    console.log('[DB] Ready');
  } else {
    console.warn('[DB] DATABASE_URL not set — data layer disabled');
  }

  const server = app.listen(port);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[Crucix] FATAL: Port ${port} is already in use!`);
      console.error(`[Crucix] Fix: kill $(lsof -ti:${port})  or change PORT in .env\n`);
    } else {
      console.error(`[Crucix] Server error:`, err.stack || err.message);
    }
    process.exit(1);
  });

  server.on('listening', () => {
    console.log(`[Crucix] Server running on http://localhost:${port}`);

    const openCmd = process.platform === 'win32' ? 'cmd /c start ""' :
                    process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${openCmd} "http://localhost:${port}"`, (err) => {
      if (err) console.log('[Crucix] Could not auto-open browser:', err.message);
    });

    startSSENotifier();
    console.log('[Crucix] SSE refresh notifications enabled');
  });
}

process.on('unhandledRejection', (err) => {
  console.error('[Crucix] Unhandled rejection:', err?.stack || err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('[Crucix] Uncaught exception:', err?.stack || err?.message || err);
});

async function shutdown() {
  console.log('[Crucix] Shutting down...');
  await closePool();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch(err => {
  console.error('[Crucix] FATAL — Server failed to start:', err?.stack || err?.message || err);
  process.exit(1);
});
