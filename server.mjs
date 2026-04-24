#!/usr/bin/env node
// Crucix Intelligence Engine — Dev Server
// Serves the Jarvis dashboard, runs sweep cycle, pushes live updates via SSE

import express from 'express';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import config from './crucix.config.mjs';
import { getLocale, currentLanguage, getSupportedLocales, loadLocaleByCode, isSupported } from './lib/i18n.mjs';
import { fullBriefing } from './apis/briefing.mjs';
import { synthesize, generateIdeas } from './dashboard/inject.mjs';
import { MemoryManager } from './lib/delta/index.mjs';
import { createLLMProvider } from './lib/llm/index.mjs';
import { generateLLMIdeas } from './lib/llm/ideas.mjs';
import { authMiddleware, isAuthEnabled } from './lib/auth/index.mjs';
import cookieParser from 'cookie-parser';
import { registerUser, verifyCredentials, getOrCreateSubscription, getUserById } from './lib/auth/users.mjs';
import { signAccessToken, generateRefreshToken, storeRefreshToken, validateRefreshToken, revokeRefreshToken } from './lib/auth/tokens.mjs';
import { generateApiKey, storeApiKey, listApiKeys, revokeApiKey } from './lib/auth/apikeys.mjs';
import { getCreditBalance } from './lib/credits/index.mjs';
import { exportIOCsJSON, exportIOCsCSV, exportIOCsSTIX, exportCVEsJSON, exportCVEsCSV } from './lib/export/index.mjs';
import { matchIOC, matchCVE, filterByWatchlist } from './lib/watchlist/index.mjs';
import { generateDailyReport, generateReportHTML } from './lib/report/index.mjs';
import { getPool, closePool } from './lib/db/index.mjs';
import { runMigrations } from './lib/db/migrate.mjs';
import { runPipeline } from './lib/pipeline/index.mjs';
import { saveRawIntel } from './lib/pipeline/raw.mjs';
import { createV1Router } from './lib/api/v1/router.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const RUNS_DIR = join(ROOT, 'runs');
const MEMORY_DIR = join(RUNS_DIR, 'memory');

// Ensure directories exist
for (const dir of [RUNS_DIR, MEMORY_DIR, join(MEMORY_DIR, 'cold')]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// === State ===
let currentData = null;    // Current synthesized dashboard data
let lastSweepTime = null;  // Timestamp of last sweep
let sweepStartedAt = null; // Timestamp when current/last sweep started
let sweepInProgress = false;
const startTime = Date.now();
const sseClients = new Set();

// === Delta/Memory ===
const memory = new MemoryManager(RUNS_DIR);

// === LLM ===
const llmProvider = createLLMProvider(config.llm);
if (llmProvider) console.log(`[Crucix] LLM enabled: ${llmProvider.name} (${llmProvider.model})`);

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
    return res.redirect('/login.html');
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
    const accessToken = signAccessToken({ id: user.id, email: user.email, plan: sub.plan_name });
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
    const accessToken = signAccessToken({ id: userId, email: userRow?.email, plan: sub.plan_name });
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

app.post('/api/auth/logout', async (req, res) => {
  const pool = getPool();
  const token = req.cookies?.refresh_token;
  if (pool && token) await revokeRefreshToken(pool, token).catch(() => {});
  res.clearCookie('refresh_token');
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const pool = getPool();
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const balance = pool ? await getCreditBalance(pool, req.user.id) : null;
  res.json({
    id: req.user.id,
    email: req.user.email,
    plan: req.user.plan,
    credits: balance?.current_credits ?? null,
    period_end: balance?.period_end ?? null,
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

// Auth middleware for /api/* routes
app.use('/api', authMiddleware(getPool()));

// === REST API v1 ===
app.use('/api/v1', createV1Router({ getPool, getCurrentData: () => currentData }));

// API: current data
app.get('/api/data', (req, res) => {
  if (!currentData) return res.status(503).json({ error: 'No data yet — first sweep in progress' });
  res.json(currentData);
});

// === Cybersecurity API Endpoints (v1.0.0) ===

// IOC export — supports JSON, CSV, STIX formats
app.get('/api/iocs', (req, res) => {
  if (!currentData?.iocs) return res.status(503).json({ error: 'No data available yet' });
  const format = (req.query.format || 'json').toLowerCase();
  const allIOCs = [
    ...(currentData.iocs.malware || []),
    ...(currentData.iocs.c2 || []),
    ...(currentData.iocs.maliciousIPs || []),
    ...(currentData.iocs.phishing || []),
  ];
  try {
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
app.get('/api/cve/:id', (req, res) => {
  if (!currentData?.cves) return res.status(503).json({ error: 'No data available yet' });
  const cveId = req.params.id.toUpperCase();
  const cve = (currentData.cves.recent || []).find(c => (c.id || c.cveId || '').toUpperCase() === cveId);
  if (!cve) return res.status(404).json({ error: `CVE ${cveId} not found in current data` });
  const lifecycle = memory.getCVELifecycle(cveId);
  const watchlistMatches = matchCVE(cve);
  res.json({ ...cve, lifecycle, watchlistMatches });
});

// Threat actor details
app.get('/api/actor/:name', (req, res) => {
  if (!currentData?.actors) return res.status(503).json({ error: 'No data available yet' });
  const name = req.params.name.toLowerCase();
  const group = (currentData.actors.ransomwareGroups || []).find(g => (g.name || '').toLowerCase() === name);
  const victims = (currentData.actors.victims || []).filter(v => (v.group || '').toLowerCase() === name);
  if (!group && victims.length === 0) return res.status(404).json({ error: `Actor "${req.params.name}" not found` });
  res.json({ group, victims, totalVictims: victims.length });
});

// Cross-source IOC lookup
app.get('/api/ioc/lookup', (req, res) => {
  if (!currentData?.iocs) return res.status(503).json({ error: 'No data available yet' });
  const value = (req.query.value || '').trim();
  if (!value) return res.status(400).json({ error: 'Missing "value" query parameter' });
  const allIOCs = [
    ...(currentData.iocs.malware || []),
    ...(currentData.iocs.c2 || []),
    ...(currentData.iocs.maliciousIPs || []),
    ...(currentData.iocs.phishing || []),
  ];
  const matches = allIOCs.filter(ioc => (ioc.value || '').toLowerCase().includes(value.toLowerCase()));
  const watchlistMatches = matches.flatMap(ioc => matchIOC(ioc));
  res.json({ query: value, total: matches.length, results: matches, watchlistMatches });
});

// STIX/TAXII compatible IOC feed
app.get('/api/feed/iocs', (req, res) => {
  if (!currentData?.iocs) return res.status(503).json({ error: 'No data available yet' });
  const allIOCs = [
    ...(currentData.iocs.malware || []),
    ...(currentData.iocs.c2 || []),
    ...(currentData.iocs.maliciousIPs || []),
    ...(currentData.iocs.phishing || []),
  ];
  res.setHeader('Content-Type', 'application/stix+json;version=2.1');
  res.send(exportIOCsSTIX(allIOCs));
});

// CVE export
app.get('/api/cves', (req, res) => {
  if (!currentData?.cves) return res.status(503).json({ error: 'No data available yet' });
  const format = (req.query.format || 'json').toLowerCase();
  const cves = currentData.cves.recent || [];
  try {
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
app.get('/api/report/daily', (req, res) => {
  try {
    const latestPath = join(RUNS_DIR, 'latest.json');
    if (!existsSync(latestPath)) return res.status(503).json({ error: 'No sweep data available' });
    const sweepData = JSON.parse(readFileSync(latestPath, 'utf8'));
    const delta = memory.getLastDelta();
    const format = (req.query.format || 'markdown').toLowerCase();
    const report = generateDailyReport(sweepData, delta, memory);
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
app.get('/api/threats', (req, res) => {
  const delta = memory.getLastDelta();
  if (!delta) return res.status(503).json({ error: 'No threat data available yet' });
  res.json({
    level: delta.overallLevel,
    index: delta.threatIndex,
    direction: delta.direction,
    signals: delta.summary,
    correlated: delta.signals?.correlated || [],
    topAtomic: (delta.signals?.atomic || []).filter(s => s.level === 'CRITICAL' || s.level === 'HIGH'),
    trends: delta.signals?.trend || [],
  });
});

// Watchlist matches
app.get('/api/watchlist/matches', (req, res) => {
  if (!currentData) return res.status(503).json({ error: 'No data available' });
  const allIOCs = [
    ...(currentData.iocs?.malware || []),
    ...(currentData.iocs?.c2 || []),
    ...(currentData.iocs?.maliciousIPs || []),
  ];
  const cves = currentData.cves?.recent || [];
  const result = filterByWatchlist(allIOCs, cves);
  res.json(result);
});

// API: health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    lastSweep: lastSweepTime,
    nextSweep: lastSweepTime
      ? new Date(new Date(lastSweepTime).getTime() + config.refreshIntervalMinutes * 60000).toISOString()
      : null,
    sweepInProgress,
    sweepStartedAt,
    sourcesOk: currentData?.meta?.sourcesOk || 0,
    sourcesFailed: currentData?.meta?.sourcesFailed || 0,
    llmEnabled: !!config.llm.provider,
    llmProvider: config.llm.provider,
    refreshIntervalMinutes: config.refreshIntervalMinutes,
    language: currentLanguage,
    db: getPool() ? 'connected' : 'not-configured',
  });
});

// API: get a specific locale by code (for client-side language switching)
app.get('/api/locale/:lang', (req, res) => {
  const lang = req.params.lang;
  if (!isSupported(lang)) {
    return res.status(404).json({ error: `Unsupported locale: ${lang}` });
  }
  const locale = loadLocaleByCode(lang);
  if (!locale) return res.status(404).json({ error: `Locale not found: ${lang}` });
  res.json(locale);
});

// API: available locales
app.get('/api/locales', (req, res) => {
  res.json({
    current: currentLanguage,
    supported: getSupportedLocales(),
  });
});

// SSE: live updates
app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write('data: {"type":"connected"}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// Global JSON error handler (Express 5: async route errors forwarded here)
app.use((err, req, res, _next) => {
  console.error('[API] Unhandled error:', err.message);
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
});

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch { sseClients.delete(client); }
  }
}

// === Sweep Cycle ===
async function runSweepCycle() {
  if (sweepInProgress) {
    console.log('[Crucix] Sweep already in progress, skipping');
    return;
  }

  sweepInProgress = true;
  sweepStartedAt = new Date().toISOString();
  broadcast({ type: 'sweep_start', timestamp: sweepStartedAt });
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Crucix] Starting sweep at ${new Date().toLocaleTimeString()}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // 1. Run the full briefing sweep
    const rawData = await fullBriefing();

    // 2. Save to runs/latest.json
    writeFileSync(join(RUNS_DIR, 'latest.json'), JSON.stringify(rawData, null, 2));
    lastSweepTime = new Date().toISOString();

    // 3. Synthesize into dashboard format
    console.log('[Crucix] Synthesizing dashboard data...');
    const synthesized = await synthesize(rawData);

    // 4. Delta computation + memory (feed raw sweep data to the cybersec engine)
    const delta = memory.addRun(rawData);
    synthesized.delta = delta;

    // 5. LLM-powered trade ideas (LLM-only feature) — isolated so failures don't kill sweep
    if (llmProvider?.isConfigured) {
      try {
        console.log('[Crucix] Generating LLM trade ideas...');
        const previousIdeas = memory.getLastRun()?.ideas || [];
        const llmIdeas = await generateLLMIdeas(llmProvider, synthesized, delta, previousIdeas);
        if (llmIdeas) {
          synthesized.ideas = llmIdeas;
          synthesized.ideasSource = 'llm';
          console.log(`[Crucix] LLM generated ${llmIdeas.length} ideas`);
        } else {
          synthesized.ideas = [];
          synthesized.ideasSource = 'llm-failed';
        }
      } catch (llmErr) {
        console.error('[Crucix] LLM ideas failed (non-fatal):', llmErr.message);
        synthesized.ideas = [];
        synthesized.ideasSource = 'llm-failed';
      }
    } else {
      synthesized.ideas = [];
      synthesized.ideasSource = 'disabled';
    }

    // Prune old alerted signals
    memory.pruneAlertedSignals();

    currentData = synthesized;

    // Save raw intel items and run STIX pipeline (non-blocking)
    saveRawIntel(getPool(), rawData.sources).catch(err =>
      console.error('[RawIntel] Unhandled error:', err.message)
    );
    runPipeline(getPool(), synthesized).catch(err =>
      console.error('[Pipeline] Unhandled error:', err.message)
    );

    // 6. Push to all connected browsers
    broadcast({ type: 'update', data: currentData });

    console.log(`[Crucix] Sweep complete — ${currentData.meta.sourcesOk}/${currentData.meta.sourcesQueried} sources OK`);
    console.log(`[Crucix] ${currentData.ideas.length} ideas (${synthesized.ideasSource}) | ${currentData.news.length} news | ${currentData.newsFeed.length} feed items`);
    if (delta?.summary) console.log(`[Crucix] Delta: ${delta.summary.totalSignals} signals (${delta.summary.criticalCount}C/${delta.summary.highCount}H/${delta.summary.mediumCount}M), threat index: ${delta.threatIndex}/100, direction: ${delta.summary.direction}`);
    console.log(`[Crucix] Next sweep at ${new Date(Date.now() + config.refreshIntervalMinutes * 60000).toLocaleTimeString()}`);

  } catch (err) {
    console.error('[Crucix] Sweep failed:', err.message);
    broadcast({ type: 'sweep_error', error: err.message });
  } finally {
    sweepInProgress = false;
  }
}

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
  ║  Refresh:    Every ${config.refreshIntervalMinutes} min${' '.repeat(Math.max(0, 20 - String(config.refreshIntervalMinutes).length))}║
  ║  Auth:       ${isAuthEnabled() ? 'enabled (Bearer Token)' : 'disabled'}${' '.repeat(isAuthEnabled() ? 10 : 23)}║
  ║  LLM:        ${(config.llm.provider || 'disabled').padEnd(31)}║
  ╚══════════════════════════════════════════════╝
  `);

  // Initialize database (graceful: skipped if DATABASE_URL not set)
  const pool = getPool();
  if (pool) {
    await runMigrations();
    console.log('[DB] Ready');
  } else {
    console.warn('[DB] DATABASE_URL not set — STIX entity layer disabled');
  }

  const server = app.listen(port);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[Crucix] FATAL: Port ${port} is already in use!`);
      console.error(`[Crucix] A previous Crucix instance may still be running.`);
      console.error(`[Crucix] Fix:  taskkill /F /IM node.exe   (Windows)`);
      console.error(`[Crucix]       kill $(lsof -ti:${port})   (macOS/Linux)`);
      console.error(`[Crucix] Or change PORT in .env\n`);
    } else {
      console.error(`[Crucix] Server error:`, err.stack || err.message);
    }
    process.exit(1);
  });

  server.on('listening', async () => {
    console.log(`[Crucix] Server running on http://localhost:${port}`);

    // Auto-open browser
    // NOTE: On Windows, `start` in PowerShell is an alias for Start-Service, not cmd's start.
    // We must use `cmd /c start ""` to ensure it works in both cmd.exe and PowerShell.
    const openCmd = process.platform === 'win32' ? 'cmd /c start ""' :
                    process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${openCmd} "http://localhost:${port}"`, (err) => {
      if (err) console.log('[Crucix] Could not auto-open browser:', err.message);
    });

    // Try to load existing data first for instant display (await so dashboard shows immediately)
    try {
      const existing = JSON.parse(readFileSync(join(RUNS_DIR, 'latest.json'), 'utf8'));
      const data = await synthesize(existing);
      currentData = data;
      console.log('[Crucix] Loaded existing data from runs/latest.json — dashboard ready instantly');
      broadcast({ type: 'update', data: currentData });
    } catch {
      console.log('[Crucix] No existing data found — first sweep required');
    }

    // Run first sweep (refreshes data in background)
    console.log('[Crucix] Running initial sweep...');
    runSweepCycle().catch(err => {
      console.error('[Crucix] Initial sweep failed:', err.message || err);
    });

    // Schedule recurring sweeps
    setInterval(runSweepCycle, config.refreshIntervalMinutes * 60 * 1000);
  });
}

// Graceful error handling — log full stack traces for diagnosis
process.on('unhandledRejection', (err) => {
  console.error('[Crucix] Unhandled rejection:', err?.stack || err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('[Crucix] Uncaught exception:', err?.stack || err?.message || err);
});

// Graceful shutdown — close DB pool on process exit
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
