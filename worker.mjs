#!/usr/bin/env node
// Crucix Worker — standalone data collection service
// Runs sweep cycles and persists results to PostgreSQL.
// Data goes into raw_intel_items + stix_objects; the web server reads from those tables.

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import config from './crucix.config.mjs';
import { fullBriefing } from './apis/briefing.mjs';
import { synthesize } from './dashboard/inject.mjs';
import { MemoryManager } from './lib/delta/index.mjs';
import { createLLMProvider } from './lib/llm/index.mjs';
import { generateLLMIdeas } from './lib/llm/ideas.mjs';
import { getPool, closePool } from './lib/db/index.mjs';
import { runMigrations } from './lib/db/migrate.mjs';
import { runPipeline } from './lib/pipeline/index.mjs';
import { saveRawIntel } from './lib/pipeline/raw.mjs';
import { updateSourceHealth, getEnabledSources } from './lib/sources/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const RUNS_DIR = join(ROOT, 'runs');
const MEMORY_DIR = join(RUNS_DIR, 'memory');

for (const dir of [RUNS_DIR, MEMORY_DIR, join(MEMORY_DIR, 'cold')]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const memory = new MemoryManager(RUNS_DIR);
const llmProvider = createLLMProvider(config.llm);
let sweepInProgress = false;

if (llmProvider) console.log(`[Worker] LLM enabled: ${llmProvider.name} (${llmProvider.model})`);

// === Sweep Cycle ===

async function runSweepCycle() {
  if (sweepInProgress) {
    console.log('[Worker] Sweep already in progress, skipping');
    return;
  }

  sweepInProgress = true;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Worker] Starting sweep at ${new Date().toLocaleTimeString()}`);
  console.log(`${'='.repeat(60)}`);

  try {
    const start = Date.now();

    // 1. Get enabled sources from DB, run the full briefing sweep
    const pool = getPool();
    const enabledSources = await getEnabledSources(pool);
    const rawData = await fullBriefing(enabledSources);

    // 2. Update source health metrics
    await updateSourceHealth(pool, rawData._results, rawData.timing);

    // 3. Save to runs/latest.json (CLI tools / backward compat)
    writeFileSync(join(RUNS_DIR, 'latest.json'), JSON.stringify(rawData, null, 2));

    // 4. Persist raw intel items to DB
    await saveRawIntel(pool, rawData.sources);

    // 5. Synthesize into dashboard format, then run STIX pipeline
    console.log('[Worker] Synthesizing dashboard data...');
    const synthesized = await synthesize(rawData);

    const delta = memory.addRun(rawData);
    synthesized.delta = delta;

    if (llmProvider?.isConfigured) {
      try {
        console.log('[Worker] Generating LLM ideas...');
        const previousIdeas = memory.getLastRun()?.ideas || [];
        const llmIdeas = await generateLLMIdeas(llmProvider, synthesized, delta, previousIdeas);
        synthesized.ideas = llmIdeas || [];
        synthesized.ideasSource = llmIdeas ? 'llm' : 'llm-failed';
        if (llmIdeas) console.log(`[Worker] LLM generated ${llmIdeas.length} ideas`);
      } catch (llmErr) {
        console.error('[Worker] LLM ideas failed (non-fatal):', llmErr.message);
        synthesized.ideas = [];
        synthesized.ideasSource = 'llm-failed';
      }
    } else {
      synthesized.ideas = [];
      synthesized.ideasSource = 'disabled';
    }

    memory.pruneAlertedSignals();

    // 6. Run STIX pipeline — normalize + persist to stix_objects
    await runPipeline(pool, synthesized);

    const durationMs = Date.now() - start;
    console.log(`[Worker] Sweep complete — ${synthesized.meta.sourcesOk}/${synthesized.meta.sourcesQueried} sources OK (${durationMs}ms)`);
    if (delta?.summary) console.log(`[Worker] Delta: ${delta.summary.totalSignals} signals, threat index: ${delta.threatIndex}/100`);
    console.log(`[Worker] Next sweep at ${new Date(Date.now() + config.refreshIntervalMinutes * 60000).toLocaleTimeString()}`);

  } catch (err) {
    console.error('[Worker] Sweep failed:', err.message);
  } finally {
    sweepInProgress = false;
  }
}

// === Startup ===

async function start() {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║       CRUCIX WORKER — Data Collection         ║
  ║         Threat Intel · v1.0.0                 ║
  ╠══════════════════════════════════════════════╣
  ║  Refresh:    Every ${config.refreshIntervalMinutes} min${' '.repeat(Math.max(0, 20 - String(config.refreshIntervalMinutes).length))}║
  ║  LLM:        ${(config.llm.provider || 'disabled').padEnd(31)}║
  ╚══════════════════════════════════════════════╝
  `);

  const pool = getPool();
  if (!pool) {
    console.error('[Worker] FATAL: DATABASE_URL not configured — worker requires PostgreSQL');
    process.exit(1);
  }

  await runMigrations();
  console.log('[DB] Ready');

  console.log('[Worker] Running initial sweep...');
  await runSweepCycle().catch(err => {
    console.error('[Worker] Initial sweep failed:', err.message || err);
  });

  setInterval(runSweepCycle, config.refreshIntervalMinutes * 60 * 1000);
  console.log(`[Worker] Scheduled sweeps every ${config.refreshIntervalMinutes} minutes`);
}

process.on('unhandledRejection', (err) => {
  console.error('[Worker] Unhandled rejection:', err?.stack || err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('[Worker] Uncaught exception:', err?.stack || err?.message || err);
});

async function shutdown() {
  console.log('[Worker] Shutting down...');
  await closePool();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch(err => {
  console.error('[Worker] FATAL — Worker failed to start:', err?.stack || err?.message || err);
  process.exit(1);
});
