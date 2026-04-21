# Codebase Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除推送通道（Telegram / Discord Bot）、废弃数据源文件、旧 Jarvis 仪表板，建立干净的代码基线，为后续 SaaS 改造做准备。

**Architecture:** 纯删除 + 精确编辑，不引入任何新依赖。移除后服务器应能正常启动，`/api/health` 和 `/api/data` 端点保持可用。旧仪表板 HTML 替换为临时占位页。

**Tech Stack:** Node.js 22 ESM，node:test（内置测试运行器），Express 5

---

## 文件变更总览

```
删除：
  lib/alerts/telegram.mjs
  lib/alerts/discord.mjs
  apis/sources/bgp-ranking.mjs      (已废弃，未注册)
  apis/sources/bluesky.mjs          (已废弃，未注册)
  apis/sources/phishtank.mjs        (已废弃，未注册)
  apis/sources/shadowserver.mjs     (已废弃，未注册)
  dashboard/public/jarvis.html      (旧 UI，由新设计替代)

修改：
  server.mjs                        (移除 bot 导入、初始化、命令、告警调用)
  crucix.config.mjs                 (移除 telegram/discord 配置块)
  .env.example                      (移除 TELEGRAM_*/DISCORD_* 变量)
  package.json                      (添加 test 脚本)

新建：
  dashboard/public/index.html       (临时占位页)
  test/cleanup.test.mjs             (烟雾测试，验证清理正确)
```

---

## Task 1：添加测试运行器

**Files:**
- Modify: `package.json`
- Create: `test/cleanup.test.mjs`

- [ ] **Step 1：在 package.json 添加 test 脚本**

打开 `package.json`，在 `scripts` 对象中添加：

```json
"test": "node --test test/**/*.test.mjs"
```

完整 scripts 块变为：

```json
"scripts": {
  "start": "node server.mjs",
  "dev": "node --trace-warnings server.mjs",
  "sweep": "node apis/briefing.mjs",
  "inject": "node dashboard/inject.mjs",
  "brief": "node apis/briefing.mjs",
  "brief:save": "node apis/save-briefing.mjs",
  "diag": "node diag.mjs",
  "clean": "node scripts/clean.mjs",
  "fresh-start": "npm run clean && npm start",
  "test": "node --test test/**/*.test.mjs"
}
```

- [ ] **Step 2：创建烟雾测试（先写失败态）**

新建 `test/cleanup.test.mjs`：

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

test('deprecated source files do not exist', () => {
  const deprecated = [
    'apis/sources/bgp-ranking.mjs',
    'apis/sources/bluesky.mjs',
    'apis/sources/phishtank.mjs',
    'apis/sources/shadowserver.mjs',
  ];
  for (const f of deprecated) {
    assert.equal(existsSync(join(ROOT, f)), false, `${f} should be deleted`);
  }
});

test('alert channel files do not exist', () => {
  assert.equal(existsSync(join(ROOT, 'lib/alerts/telegram.mjs')), false,
    'lib/alerts/telegram.mjs should be deleted');
  assert.equal(existsSync(join(ROOT, 'lib/alerts/discord.mjs')), false,
    'lib/alerts/discord.mjs should be deleted');
});

test('old jarvis dashboard does not exist', () => {
  assert.equal(existsSync(join(ROOT, 'dashboard/public/jarvis.html')), false,
    'jarvis.html should be replaced by index.html');
});

test('new placeholder dashboard exists', () => {
  assert.equal(existsSync(join(ROOT, 'dashboard/public/index.html')), true,
    'index.html placeholder must exist');
});

test('config does not expose telegram or discord keys', async () => {
  const { default: config } = await import('../crucix.config.mjs');
  assert.equal(config.telegram, undefined, 'config.telegram should not exist');
  assert.equal(config.discord, undefined, 'config.discord should not exist');
});
```

- [ ] **Step 3：运行测试，确认全部失败**

```bash
npm test
```

期望输出：所有 5 个测试 **FAIL**（文件尚未删除）。这是正确状态，证明测试有效。

---

## Task 2：删除废弃数据源文件

**Files:**
- Delete: `apis/sources/bgp-ranking.mjs`
- Delete: `apis/sources/bluesky.mjs`
- Delete: `apis/sources/phishtank.mjs`
- Delete: `apis/sources/shadowserver.mjs`

- [ ] **Step 1：确认文件未在 briefing.mjs 中注册**

```bash
grep -n "bgp-ranking\|bluesky\|phishtank\|shadowserver" apis/briefing.mjs
```

期望输出：**无匹配**（这些文件已在 v1.4.0 中从 briefing.mjs 移除，仅文件残留）。

- [ ] **Step 2：删除文件**

```bash
rm apis/sources/bgp-ranking.mjs \
   apis/sources/bluesky.mjs \
   apis/sources/phishtank.mjs \
   apis/sources/shadowserver.mjs
```

- [ ] **Step 3：运行测试，确认前两个测试通过**

```bash
npm test
```

期望：`deprecated source files do not exist` → **PASS**，其余仍 FAIL。

- [ ] **Step 4：提交**

```bash
git add -A
git commit -m "chore: remove deprecated source files (bgp-ranking, bluesky, phishtank, shadowserver)"
```

---

## Task 3：删除 Telegram 告警器

**Files:**
- Delete: `lib/alerts/telegram.mjs`

- [ ] **Step 1：确认 telegram.mjs 的引用位置**

```bash
grep -rn "lib/alerts/telegram" .
```

期望输出：仅 `server.mjs:17` 引用（下一个 Task 处理）。

- [ ] **Step 2：删除文件**

```bash
rm lib/alerts/telegram.mjs
```

---

## Task 4：删除 Discord 告警器

**Files:**
- Delete: `lib/alerts/discord.mjs`

- [ ] **Step 1：删除文件**

```bash
rm lib/alerts/discord.mjs
```

- [ ] **Step 2：运行测试**

```bash
npm test
```

期望：`alert channel files do not exist` → **PASS**。

---

## Task 5：移除 server.mjs Bot 导入

**Files:**
- Modify: `server.mjs` (lines 17-18)

- [ ] **Step 1：删除两行 import**

找到并删除 `server.mjs` 中的这两行：

```javascript
import { TelegramAlerter } from './lib/alerts/telegram.mjs';
import { DiscordAlerter } from './lib/alerts/discord.mjs';
```

删除后，该区域的 import 块应为：

```javascript
import { authMiddleware, isAuthEnabled } from './lib/auth/index.mjs';
import { exportIOCsJSON, exportIOCsCSV, exportIOCsSTIX, exportCVEsJSON, exportCVEsCSV } from './lib/export/index.mjs';
import { matchIOC, matchCVE, filterByWatchlist } from './lib/watchlist/index.mjs';
import { generateDailyReport, generateReportHTML } from './lib/report/index.mjs';
```

- [ ] **Step 2：验证语法**

```bash
node --check server.mjs
```

期望输出：无错误（若有 `TelegramAlerter is not defined` 等错误，说明后续 Task 的代码还未清理完，下一步会处理）。

---

## Task 6：移除 server.mjs Bot 初始化与命令块

**Files:**
- Modify: `server.mjs` (lines 45–227)

- [ ] **Step 1：删除 bot 实例化和命令注册**

找到 `server.mjs` 中的注释行 `// === LLM + Telegram + Discord ===`（约第 45 行），将该区域替换为：

**删除（整块替换为单行）：**
```javascript
// === LLM + Telegram + Discord ===
const llmProvider = createLLMProvider(config.llm);
const telegramAlerter = new TelegramAlerter(config.telegram);
const discordAlerter = new DiscordAlerter(config.discord || {});

if (llmProvider) console.log(`[Crucix] LLM enabled: ${llmProvider.name} (${llmProvider.model})`);
if (telegramAlerter.isConfigured) {
  // ... 约 100 行 Telegram 命令代码 ...
  telegramAlerter.startPolling(config.telegram.botPollingInterval);
}

// === Discord Bot ===
if (discordAlerter.isConfigured) {
  // ... 约 70 行 Discord 命令代码 ...
  discordAlerter.start().catch(err => { ... });
}
```

**替换为：**
```javascript
// === LLM ===
const llmProvider = createLLMProvider(config.llm);
if (llmProvider) console.log(`[Crucix] LLM enabled: ${llmProvider.name} (${llmProvider.model})`);
```

- [ ] **Step 2：验证语法**

```bash
node --check server.mjs
```

期望：无错误。

---

## Task 7：移除 server.mjs 告警调用、健康字段、Banner 行

**Files:**
- Modify: `server.mjs` (sweep cycle + health endpoint + startup banner)

- [ ] **Step 1：移除 sweep cycle 中的告警调用（约第 516–528 行）**

找到 sweep cycle 中的注释 `// 6. Alert evaluation — Telegram + Discord`，删除整个 if 块：

```javascript
// 删除以下整块：
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
```

同时将下方注释 `// 6. Push to all connected browsers` 的编号改为 `// 6.`（保持原样即可，无需重编号）。

- [ ] **Step 2：移除 /api/health 中的 telegramEnabled 字段**

找到 `/api/health` 响应对象，删除：

```javascript
telegramEnabled: !!(config.telegram.botToken && config.telegram.chatId),
```

- [ ] **Step 3：移除启动 banner 中的 Telegram/Discord 行**

找到启动 banner（`console.log` 的模板字符串），删除以下两行：

```javascript
  ║  Telegram:   ${config.telegram.botToken ? 'enabled' : 'disabled'}${' '.repeat(config.telegram.botToken ? 24 : 23)}║
  ║  Discord:    ${config.discord?.botToken ? 'enabled' : config.discord?.webhookUrl ? 'webhook only' : 'disabled'}${' '.repeat(config.discord?.botToken ? 24 : config.discord?.webhookUrl ? 20 : 23)}║
```

- [ ] **Step 4：验证语法**

```bash
node --check server.mjs
```

期望：无错误。

- [ ] **Step 5：提交**

```bash
git add server.mjs lib/alerts/telegram.mjs lib/alerts/discord.mjs
git commit -m "feat: remove Telegram and Discord push channels from server"
```

---

## Task 8：清理 crucix.config.mjs

**Files:**
- Modify: `crucix.config.mjs` (lines 23–35)

- [ ] **Step 1：删除 telegram 和 discord 配置块**

找到并删除以下内容：

```javascript
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || null,
    chatId: process.env.TELEGRAM_CHAT_ID || null,
    botPollingInterval: parseInt(process.env.TELEGRAM_POLL_INTERVAL) || 5000,
    channels: process.env.TELEGRAM_CHANNELS || null,
  },

  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || null,
    channelId: process.env.DISCORD_CHANNEL_ID || null,
    guildId: process.env.DISCORD_GUILD_ID || null,
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || null,
  },
```

删除后，config 对象中 `llm` 块之后直接是 `watchlist` 块。

- [ ] **Step 2：运行测试**

```bash
npm test
```

期望：`config does not expose telegram or discord keys` → **PASS**。

- [ ] **Step 3：提交**

```bash
git add crucix.config.mjs
git commit -m "chore: remove telegram/discord config from crucix.config.mjs"
```

---

## Task 9：清理 .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1：删除 Telegram 和 Discord 环境变量**

找到并删除以下行（含上方注释，若有）：

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
DISCORD_BOT_TOKEN=
DISCORD_CHANNEL_ID=
DISCORD_GUILD_ID=
DISCORD_WEBHOOK_URL=
```

同时删除 `TELEGRAM_CHANNELS=` 和 `TELEGRAM_POLL_INTERVAL=`（若存在）。

- [ ] **Step 2：确认删除完整**

```bash
grep -n "TELEGRAM\|DISCORD" .env.example
```

期望输出：**无匹配**。

- [ ] **Step 3：提交**

```bash
git add .env.example
git commit -m "chore: remove Telegram/Discord env vars from .env.example"
```

---

## Task 10：替换旧 Dashboard，更新根路由

**Files:**
- Delete: `dashboard/public/jarvis.html`
- Create: `dashboard/public/index.html`
- Modify: `server.mjs` (root route, lines 233–247)

- [ ] **Step 1：删除旧 UI**

```bash
rm dashboard/public/jarvis.html
```

- [ ] **Step 2：创建占位页 `dashboard/public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Crucix Intelligence Platform</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace;
      background: #0b0f17;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      text-align: center;
      padding: 48px;
      border: 1px solid #1e293b;
      border-radius: 8px;
      max-width: 480px;
    }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 8px; }
    p  { color: #64748b; font-size: 0.9rem; line-height: 1.6; margin-bottom: 24px; }
    .badge {
      display: inline-block;
      background: #1e293b;
      color: #38bdf8;
      font-size: 0.75rem;
      padding: 4px 12px;
      border-radius: 4px;
      font-family: monospace;
    }
    a { color: #38bdf8; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Crucix Intelligence Platform</h1>
    <p>New dashboard under construction.<br />
       Intelligence API is available at <a href="/api/data">/api/data</a>
       and <a href="/api/health">/api/health</a>.</p>
    <span class="badge">v2.0 — SaaS Edition</span>
  </div>
</body>
</html>
```

- [ ] **Step 3：更新 server.mjs 根路由**

找到并替换根路由（约第 233–247 行）：

**原代码：**
```javascript
// Serve loading page until first sweep completes, then the dashboard with injected locale
app.get('/', (req, res) => {
  if (!currentData) {
    res.sendFile(join(ROOT, 'dashboard/public/loading.html'));
  } else {
    const htmlPath = join(ROOT, 'dashboard/public/jarvis.html');
    let html = readFileSync(htmlPath, 'utf-8');
    
    const locale = getLocale();
    const localeScript = `<script>window.__CRUCIX_LOCALE__=${JSON.stringify(locale).replace(/<\/script>/gi, '<\\/script>')};window.__CRUCIX_LANG__="${currentLanguage}";</script>`;
    html = html.replace('</head>', `${localeScript}\n</head>`);
    
    res.type('html').send(html);
  }
});
```

**替换为：**
```javascript
// Serve placeholder until new dashboard is ready
app.get('/', (_req, res) => {
  res.sendFile(join(ROOT, 'dashboard/public/index.html'));
});
```

- [ ] **Step 4：移除现在无用的 i18n 导入**

检查 `server.mjs` 顶部，找到以下 import：

```javascript
import { getLocale, currentLanguage, getSupportedLocales, loadLocaleByCode, isSupported } from './lib/i18n.mjs';
```

检查是否还有其他地方使用这些函数（`/api/locale/:lang` 和 `/api/locales` 端点）：

```bash
grep -n "getLocale\|currentLanguage\|getSupportedLocales\|loadLocaleByCode\|isSupported" server.mjs
```

如果仅剩 `/api/locale` 和 `/api/locales` 两个端点使用，**保留 import**，这两个端点供未来 i18n 使用。如果无其他引用，删除 import 和相关端点（由工程师实施时判断）。

- [ ] **Step 5：验证语法**

```bash
node --check server.mjs
```

期望：无错误。

- [ ] **Step 6：运行全部测试**

```bash
npm test
```

期望：所有 5 个测试 **PASS**。

- [ ] **Step 7：提交**

```bash
git add dashboard/public/index.html dashboard/public/jarvis.html server.mjs
git commit -m "feat: replace Jarvis dashboard with placeholder, simplify root route"
```

---

## Task 11：最终验证

- [ ] **Step 1：启动服务器，检查无报错**

```bash
node --trace-warnings server.mjs &
sleep 5
```

期望：启动 banner 出现，无 `TelegramAlerter`、`DiscordAlerter`、`Cannot find module` 等错误。

- [ ] **Step 2：验证端点**

```bash
curl -s http://localhost:3117/ | grep -o "Crucix Intelligence Platform"
curl -s http://localhost:3117/api/health | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('health ok:', j.status)"
```

期望：
- 第一个命令输出：`Crucix Intelligence Platform`
- 第二个命令输出：`health ok: ok`，且 JSON 中无 `telegramEnabled` 字段

- [ ] **Step 3：确认健康响应不含 bot 字段**

```bash
curl -s http://localhost:3117/api/health | node -e "
  process.stdin.resume();
  let d='';
  process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    const j=JSON.parse(d);
    if(j.telegramEnabled !== undefined) { console.error('FAIL: telegramEnabled still present'); process.exit(1); }
    console.log('PASS: no bot fields in health response');
  });
" < <(curl -s http://localhost:3117/api/health)
```

期望输出：`PASS: no bot fields in health response`

- [ ] **Step 4：停止服务器**

```bash
kill %1
```

- [ ] **Step 5：运行完整测试套件**

```bash
npm test
```

期望：所有测试 **PASS**。

- [ ] **Step 6：最终提交**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: complete codebase cleanup for SaaS transition

- Remove Telegram and Discord push channels (lib/alerts/)
- Remove bot initialization, commands, alert evaluation from server.mjs
- Remove telegram/discord config from crucix.config.mjs and .env.example
- Delete deprecated source files (bgp-ranking, bluesky, phishtank, shadowserver)
- Replace Jarvis HUD with placeholder dashboard (new UI in separate plan)
- Add node:test runner (npm test)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## 自检：规格覆盖确认

| 规格要求 | 对应 Task |
|---------|---------|
| 移除 Telegram Bot | Task 3, 6, 7, 8, 9 |
| 移除 Discord Bot | Task 4, 6, 7, 8, 9 |
| 移除废弃源文件（bgp-ranking / bluesky / phishtank / shadowserver）| Task 2 |
| 移除旧 Jarvis Dashboard | Task 10 |
| 服务器正常启动，API 端点可用 | Task 11 |
| 无推送通道相关代码残留 | Task 5–9 |
