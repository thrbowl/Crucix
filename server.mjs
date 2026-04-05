#!/usr/bin/env node
// Crucix Intelligence Engine — Dev Server
// Serves the Jarvis dashboard, runs sweep cycle, pushes live updates via SSE

import express from 'express';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import config from './crucix.config.mjs';
import { getLocale, currentLanguage, getSupportedLocales } from './lib/i18n.mjs';
import { fullBriefing } from './apis/briefing.mjs';
import { synthesize, generateIdeas } from './dashboard/inject.mjs';
import { MemoryManager } from './lib/delta/index.mjs';
import { createLLMProvider } from './lib/llm/index.mjs';
import { generateLLMIdeas } from './lib/llm/ideas.mjs';
import { TelegramAlerter } from './lib/alerts/telegram.mjs';
import { DiscordAlerter } from './lib/alerts/discord.mjs';
import { authMiddleware, isAuthEnabled } from './lib/auth/index.mjs';
import { exportIOCsJSON, exportIOCsCSV, exportIOCsSTIX, exportCVEsJSON, exportCVEsCSV } from './lib/export/index.mjs';
import { matchIOC, matchCVE, filterByWatchlist } from './lib/watchlist/index.mjs';
import { generateDailyReport, generateReportHTML } from './lib/report/index.mjs';

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

// === LLM + Telegram + Discord ===
const llmProvider = createLLMProvider(config.llm);
const telegramAlerter = new TelegramAlerter(config.telegram);
const discordAlerter = new DiscordAlerter(config.discord || {});

if (llmProvider) console.log(`[Crucix] LLM enabled: ${llmProvider.name} (${llmProvider.model})`);
if (telegramAlerter.isConfigured) {
  console.log('[Crucix] Telegram alerts enabled');

  // ─── Two-Way Bot Commands ───────────────────────────────────────────────

  telegramAlerter.onCommand('/status', async () => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const sourcesOk = currentData?.meta?.sourcesOk || 0;
    const sourcesTotal = currentData?.meta?.sourcesQueried || 0;
    const sourcesFailed = currentData?.meta?.sourcesFailed || 0;
    const llmStatus = llmProvider?.isConfigured ? `✅ ${llmProvider.name}` : '❌ Disabled';
    const nextSweep = lastSweepTime
      ? new Date(new Date(lastSweepTime).getTime() + config.refreshIntervalMinutes * 60000).toLocaleTimeString()
      : 'pending';

    return [
      `🖥️ *CRUCIX STATUS*`,
      ``,
      `Uptime: ${h}h ${m}m`,
      `Last sweep: ${lastSweepTime ? new Date(lastSweepTime).toLocaleTimeString() + ' UTC' : 'never'}`,
      `Next sweep: ${nextSweep} UTC`,
      `Sweep in progress: ${sweepInProgress ? '🔄 Yes' : '⏸️ No'}`,
      `Sources: ${sourcesOk}/${sourcesTotal} OK${sourcesFailed > 0 ? ` (${sourcesFailed} failed)` : ''}`,
      `LLM: ${llmStatus}`,
      `SSE clients: ${sseClients.size}`,
      `Dashboard: http://localhost:${config.port}`,
    ].join('\n');
  });

  telegramAlerter.onCommand('/sweep', async () => {
    if (sweepInProgress) return '🔄 Sweep already in progress. Please wait.';
    // Fire and forget — don't block the bot response
    runSweepCycle().catch(err => console.error('[Crucix] Manual sweep failed:', err.message));
    return '🚀 Manual sweep triggered. You\'ll receive alerts if anything significant is detected.';
  });

  telegramAlerter.onCommand('/brief', async () => {
    if (!currentData) return '⏳ No data yet — waiting for first sweep to complete.';
    const delta = memory.getLastDelta();
    const sections = [
      `🛡️ *CRUCIX THREAT BRIEF*`,
      `_${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC_`,
      ``,
    ];

    if (delta) {
      const dirEmoji = { worsening: '📈', improving: '📉', stable: '↔️' }[delta.summary?.direction] || '↔️';
      sections.push(`${dirEmoji} Threat Level: *${delta.overallLevel}* (${delta.threatIndex}/100)`);
      sections.push(`Signals: ${delta.summary.totalSignals} (${delta.summary.criticalCount}C/${delta.summary.highCount}H/${delta.summary.mediumCount}M)`);
      sections.push('');

      if (delta.signals?.correlated?.length > 0) {
        sections.push('🔗 *Cross-Correlation Alerts:*');
        for (const c of delta.signals.correlated.slice(0, 3)) {
          sections.push(`  [${c.level}] ${c.name}`);
        }
        sections.push('');
      }

      const topAtomic = (delta.signals?.atomic || [])
        .filter(s => s.level === 'CRITICAL' || s.level === 'HIGH')
        .slice(0, 5);
      if (topAtomic.length > 0) {
        sections.push('⚠️ *Top Signals:*');
        for (const s of topAtomic) {
          sections.push(`  [${s.level}] ${s.label}: ${s.current}`);
        }
        sections.push('');
      }
    }

    sections.push(`Sources: ${currentData.meta?.sourcesOk || 0}/${currentData.meta?.sourcesQueried || 0} OK`);
    return sections.join('\n');
  });

  telegramAlerter.onCommand('/threats', async () => {
    const delta = memory.getLastDelta();
    if (!delta) return '⏳ No threat data yet.';
    const lines = [`🎯 *THREAT LEVEL: ${delta.overallLevel}* (${delta.threatIndex}/100)\n`];
    for (const s of (delta.signals?.atomic || []).filter(s => s.direction === 'escalated').slice(0, 8)) {
      lines.push(`  • [${s.level}] ${s.label}: ${s.previous ?? '?'} → ${s.current}`);
    }
    return lines.join('\n');
  });

  telegramAlerter.onCommand('/cves', async () => {
    const tracker = memory.getCVETracker();
    const recent = Object.entries(tracker).slice(-10).reverse();
    if (recent.length === 0) return '📭 No CVEs tracked yet.';
    const lines = ['🔓 *Recent CVEs:*\n'];
    for (const [id, info] of recent) {
      const stages = info.stages?.join(' → ') || 'discovered';
      lines.push(`  • ${id} — ${stages}${info.cvss ? ` (CVSS: ${info.cvss})` : ''}`);
    }
    return lines.join('\n');
  });

  // Start polling for bot commands
  telegramAlerter.startPolling(config.telegram.botPollingInterval);
}

// === Discord Bot ===
if (discordAlerter.isConfigured) {
  console.log('[Crucix] Discord bot enabled');

  // Reuse the same command handlers as Telegram (DRY)
  discordAlerter.onCommand('status', async () => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const sourcesOk = currentData?.meta?.sourcesOk || 0;
    const sourcesTotal = currentData?.meta?.sourcesQueried || 0;
    const sourcesFailed = currentData?.meta?.sourcesFailed || 0;
    const llmStatus = llmProvider?.isConfigured ? `✅ ${llmProvider.name}` : '❌ Disabled';
    const nextSweep = lastSweepTime
      ? new Date(new Date(lastSweepTime).getTime() + config.refreshIntervalMinutes * 60000).toLocaleTimeString()
      : 'pending';

    return [
      `**🖥️ CRUCIX STATUS**\n`,
      `Uptime: ${h}h ${m}m`,
      `Last sweep: ${lastSweepTime ? new Date(lastSweepTime).toLocaleTimeString() + ' UTC' : 'never'}`,
      `Next sweep: ${nextSweep} UTC`,
      `Sweep in progress: ${sweepInProgress ? '🔄 Yes' : '⏸️ No'}`,
      `Sources: ${sourcesOk}/${sourcesTotal} OK${sourcesFailed > 0 ? ` (${sourcesFailed} failed)` : ''}`,
      `LLM: ${llmStatus}`,
      `SSE clients: ${sseClients.size}`,
      `Dashboard: http://localhost:${config.port}`,
    ].join('\n');
  });

  discordAlerter.onCommand('sweep', async () => {
    if (sweepInProgress) return '🔄 Sweep already in progress. Please wait.';
    runSweepCycle().catch(err => console.error('[Crucix] Manual sweep failed:', err.message));
    return '🚀 Manual sweep triggered. You\'ll receive alerts if anything significant is detected.';
  });

  discordAlerter.onCommand('brief', async () => {
    if (!currentData) return '⏳ No data yet — waiting for first sweep to complete.';
    const delta = memory.getLastDelta();
    const sections = [`**🛡️ CRUCIX THREAT BRIEF**\n_${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC_\n`];

    if (delta) {
      const dirEmoji = { worsening: '📈', improving: '📉', stable: '↔️' }[delta.summary?.direction] || '↔️';
      sections.push(`${dirEmoji} Threat Level: **${delta.overallLevel}** (${delta.threatIndex}/100)`);
      sections.push(`Signals: ${delta.summary.totalSignals} (${delta.summary.criticalCount}C/${delta.summary.highCount}H/${delta.summary.mediumCount}M)\n`);

      if (delta.signals?.correlated?.length > 0) {
        sections.push('**🔗 Cross-Correlation Alerts:**');
        for (const c of delta.signals.correlated.slice(0, 3)) {
          sections.push(`  [${c.level}] ${c.name}`);
        }
        sections.push('');
      }
    }

    sections.push(`Sources: ${currentData.meta?.sourcesOk || 0}/${currentData.meta?.sourcesQueried || 0} OK`);
    return sections.join('\n');
  });

  discordAlerter.onCommand('threats', async () => {
    const delta = memory.getLastDelta();
    if (!delta) return '⏳ No threat data yet.';
    const lines = [`**🎯 THREAT LEVEL: ${delta.overallLevel}** (${delta.threatIndex}/100)\n`];
    for (const s of (delta.signals?.atomic || []).filter(s => s.direction === 'escalated').slice(0, 8)) {
      lines.push(`  • [${s.level}] ${s.label}: ${s.previous ?? '?'} → ${s.current}`);
    }
    return lines.join('\n');
  });

  // Start the Discord bot (non-blocking — connection happens async)
  discordAlerter.start().catch(err => {
    console.error('[Crucix] Discord bot startup failed (non-fatal):', err.message);
  });
}

// === Express Server ===
const app = express();
app.use(express.static(join(ROOT, 'dashboard/public')));

// Serve loading page until first sweep completes, then the dashboard with injected locale
app.get('/', (req, res) => {
  if (!currentData) {
    res.sendFile(join(ROOT, 'dashboard/public/loading.html'));
  } else {
    const htmlPath = join(ROOT, 'dashboard/public/jarvis.html');
    let html = readFileSync(htmlPath, 'utf-8');
    
    // Inject locale data into the HTML
    const locale = getLocale();
    const localeScript = `<script>window.__CRUCIX_LOCALE__ = ${JSON.stringify(locale).replace(/<\/script>/gi, '<\\/script>')};</script>`;
    html = html.replace('</head>', `${localeScript}\n</head>`);
    
    res.type('html').send(html);
  }
});

// Auth middleware for /api/* routes
app.use('/api', authMiddleware);

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
    telegramEnabled: !!(config.telegram.botToken && config.telegram.chatId),
    refreshIntervalMinutes: config.refreshIntervalMinutes,
    language: currentLanguage,
  });
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

    // 6. Alert evaluation — Telegram + Discord (LLM with rule-based fallback, multi-tier, semantic dedup)
    if (delta?.summary?.totalSignals > 0 || delta?.summary?.totalChanges > 0) {
      if (telegramAlerter.isConfigured) {
        telegramAlerter.evaluateAndAlert(llmProvider, delta, memory).catch(err => {
          console.error('[Crucix] Telegram alert error:', err.message);
        });
      }
      if (discordAlerter.isConfigured) {
        discordAlerter.evaluateAndAlert(llmProvider, delta, memory).catch(err => {
          console.error('[Crucix] Discord alert error:', err.message);
        });
      }
    }

    // Prune old alerted signals
    memory.pruneAlertedSignals();

    currentData = synthesized;

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
  ║  Dashboard:  http://localhost:${port}${' '.repeat(14 - String(port).length)}║
  ║  Health:     http://localhost:${port}/api/health${' '.repeat(4 - String(port).length)}║
  ║  Refresh:    Every ${config.refreshIntervalMinutes} min${' '.repeat(20 - String(config.refreshIntervalMinutes).length)}║
  ║  Auth:       ${isAuthEnabled() ? 'enabled (Bearer Token)' : 'disabled'}${' '.repeat(isAuthEnabled() ? 10 : 23)}║
  ║  LLM:        ${(config.llm.provider || 'disabled').padEnd(31)}║
  ║  Telegram:   ${config.telegram.botToken ? 'enabled' : 'disabled'}${' '.repeat(config.telegram.botToken ? 24 : 23)}║
  ║  Discord:    ${config.discord?.botToken ? 'enabled' : config.discord?.webhookUrl ? 'webhook only' : 'disabled'}${' '.repeat(config.discord?.botToken ? 24 : config.discord?.webhookUrl ? 20 : 23)}║
  ╚══════════════════════════════════════════════╝
  `);

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

start().catch(err => {
  console.error('[Crucix] FATAL — Server failed to start:', err?.stack || err?.message || err);
  process.exit(1);
});
