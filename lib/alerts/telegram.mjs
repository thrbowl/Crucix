// Telegram Alerter v2 — Multi-tier alerts, semantic dedup, two-way bot commands
// USP feature: Crucix becomes a conversational intelligence agent via Telegram

import { createHash } from 'crypto';

const TELEGRAM_API = 'https://api.telegram.org';
/** Telegram Bot API limit for sendMessage text (bytes/characters). */
const TELEGRAM_MAX_TEXT = 4096;

// ─── Alert Levels (Cybersecurity Four-Tier) ─────────────────────────────────
// CRITICAL: Active exploitation / weaponized vulnerability / coordinated attack
// HIGH:     Significant threat indicator requiring prompt action
// MEDIUM:   Notable signal worth monitoring
// LOW:      Informational — trend shifts, routine updates

const TIER_CONFIG = {
  CRITICAL: { emoji: '🔴', label: 'CRITICAL', cooldownMs: 5 * 60 * 1000,  maxPerHour: 6 },
  HIGH:     { emoji: '🟠', label: 'HIGH',     cooldownMs: 15 * 60 * 1000, maxPerHour: 5 },
  MEDIUM:   { emoji: '🟡', label: 'MEDIUM',   cooldownMs: 30 * 60 * 1000, maxPerHour: 4 },
  LOW:      { emoji: '🔵', label: 'LOW',      cooldownMs: 60 * 60 * 1000, maxPerHour: 2 },
};

// ─── Bot Commands ───────────────────────────────────────────────────────────
const COMMANDS = {
  '/status':    'System health, last sweep, source status',
  '/sweep':     'Trigger a manual intelligence sweep',
  '/brief':     'Compact threat intelligence summary',
  '/threats':   'Show current threat level and top signals',
  '/cves':      'List recent critical CVEs and KEV entries',
  '/alerts':    'Show recent alert history',
  '/mute':      'Mute alerts for 1h (or /mute 2h, /mute 4h)',
  '/unmute':    'Resume alerts',
  '/help':      'Show available commands',
};

export class TelegramAlerter {
  constructor({ botToken, chatId }) {
    this.botToken = botToken;
    this.chatId = chatId;
    this._alertHistory = [];     // Recent alerts for rate limiting
    this._contentHashes = {};    // Semantic dedup: hash → timestamp
    this._muteUntil = null;      // Mute timestamp
    this._lastUpdateId = 0;      // For polling bot commands
    this._commandHandlers = {};  // Registered command callbacks
    this._pollingInterval = null;
    this._botUsername = null;
  }

  get isConfigured() {
    return !!(this.botToken && this.chatId);
  }

  // ─── Core Messaging ─────────────────────────────────────────────────────

  /**
   * Send a message via Telegram Bot API. Splits at TELEGRAM_MAX_TEXT so long messages
   * (e.g. /brief) are sent in multiple messages instead of being truncated or failing.
   * @param {string} message - markdown-formatted message
   * @param {object} opts - optional: { parseMode, disablePreview, replyToMessageId, chatId }
   * @returns {Promise<{ok: boolean, messageId?: number}>}
   */
  async sendMessage(message, opts = {}) {
    if (!this.isConfigured) return { ok: false };
    const chatId = opts.chatId ?? this.chatId;
    const parseMode = opts.parseMode || 'Markdown';
    const chunks = this._chunkText(message, TELEGRAM_MAX_TEXT);

    try {
      let lastResult = { ok: false, messageId: undefined };
      for (let i = 0; i < chunks.length; i++) {
        const res = await fetch(`${TELEGRAM_API}/bot${this.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunks[i],
            parse_mode: parseMode,
            disable_web_page_preview: opts.disablePreview !== false,
            ...(opts.replyToMessageId && i === 0 ? { reply_to_message_id: opts.replyToMessageId } : {}),
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          const err = await res.text().catch(() => '');
          console.error(`[Telegram] Send failed (${res.status}): ${err.substring(0, 200)}`);
          return lastResult;
        }

        const data = await res.json();
        lastResult = { ok: true, messageId: data.result?.message_id };
      }
      return lastResult;
    } catch (err) {
      console.error('[Telegram] Send error:', err.message);
      return { ok: false };
    }
  }

  /**
   * Split text into chunks of at most maxLen. Prefer breaking at newlines to avoid
   * splitting mid-Markdown.
   */
  _chunkText(text, maxLen = TELEGRAM_MAX_TEXT) {
    if (!text || text.length <= maxLen) return text ? [text] : [];
    const chunks = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + maxLen, text.length);
      if (end < text.length) {
        const lastNewline = text.lastIndexOf('\n', end - 1);
        if (lastNewline > start) end = lastNewline + 1;
      }
      chunks.push(text.slice(start, end));
      start = end;
    }
    return chunks;
  }

  // Backward-compatible alias
  async sendAlert(message) {
    const result = await this.sendMessage(message);
    return result.ok;
  }

  // ─── Multi-Tier Alert Evaluation ────────────────────────────────────────

  /**
   * Evaluate delta signals with LLM and send tiered alert if warranted.
   * Uses semantic dedup, rate limiting, and a much richer evaluation prompt.
   */
  async evaluateAndAlert(llmProvider, delta, memory) {
    if (!this.isConfigured) return false;
    if (!delta?.summary?.totalChanges) return false;
    if (this._isMuted()) {
      console.log('[Telegram] Alerts muted until', new Date(this._muteUntil).toLocaleTimeString());
      return false;
    }

    // 1. Gather signals from new three-layer delta engine
    const allSignals = [
      ...(delta.signals?.atomic || []).filter(s => s.direction === 'escalated' || s.isFirstRun),
      ...(delta.signals?.correlated || []),
      ...(delta.signals?.trend || []),
      // Legacy support
      ...(delta.signals?.new || []),
      ...(delta.signals?.escalated || []),
    ];

    const newSignals = allSignals.filter(s => {
      const key = this._signalKey(s);
      // Check decay-based suppression (if memory supports it)
      if (typeof memory.isSignalSuppressed === 'function') {
        if (memory.isSignalSuppressed(key)) return false;
      } else {
        // Legacy: check flat alerted map
        const alerted = memory.getAlertedSignals();
        if (alerted[key]) return false;
      }
      // Check semantic/content hash dedup
      if (this._isSemanticDuplicate(s)) return false;
      return true;
    });

    if (newSignals.length === 0) return false;

    // 2. Try LLM evaluation first, fall back to rule-based if unavailable
    let evaluation = null;

    if (llmProvider?.isConfigured) {
      try {
        const systemPrompt = this._buildEvaluationPrompt();
        const userMessage = this._buildSignalContext(newSignals, delta);
        const result = await llmProvider.complete(systemPrompt, userMessage, {
          maxTokens: 800,
          timeout: 30000,
        });
        evaluation = parseJSON(result.text);
      } catch (err) {
        console.warn('[Telegram] LLM evaluation failed, falling back to rules:', err.message);
        // Fall through to rule-based evaluation
      }
    }

    // Rule-based fallback: fires when LLM is unavailable or returns garbage
    if (!evaluation || typeof evaluation.shouldAlert !== 'boolean') {
      evaluation = this._ruleBasedEvaluation(newSignals, delta);
      if (evaluation) evaluation._source = 'rules';
    }

    if (!evaluation?.shouldAlert) {
      console.log('[Telegram] No alert —', evaluation?.reason || 'no qualifying signals');
      return false;
    }

    // 3. Validate tier and check rate limits
    const tier = TIER_CONFIG[evaluation.tier] ? evaluation.tier : 'ROUTINE';
    if (!this._checkRateLimit(tier)) {
      console.log(`[Telegram] Rate limited for tier ${tier}`);
      return false;
    }

    // 4. Format and send tiered alert
    const message = this._formatTieredAlert(evaluation, delta, tier);
    const sent = await this.sendAlert(message);

    if (sent) {
      // Mark signals as alerted with content hashing
      for (const s of newSignals) {
        const key = this._signalKey(s);
        memory.markAsAlerted(key, new Date().toISOString());
        this._recordContentHash(s);
      }
      this._recordAlert(tier);
      console.log(`[Telegram] ${tier} alert sent (${evaluation._source || 'llm'}): ${evaluation.headline}`);
    }

    return sent;
  }

  // ─── Rule-Based Alert Fallback (Cybersecurity) ─────────────────────────

  _ruleBasedEvaluation(signals, delta) {
    const allSignals = Array.isArray(signals) ? signals : [];

    // Classify by the new delta engine's level field or legacy severity
    const getLevel = s => s.level || s.severity || 'LOW';
    const criticals = allSignals.filter(s => getLevel(s) === 'CRITICAL');
    const highs = allSignals.filter(s => getLevel(s) === 'HIGH');
    const mediums = allSignals.filter(s => getLevel(s) === 'MEDIUM');

    // Check for correlated signals from the delta engine
    const correlated = delta?.signals?.correlated || [];
    const hasVulnWeaponization = correlated.some(c => c.id === 'vuln_weaponization');
    const hasChinaThreat = correlated.some(c => c.id === 'china_high_confidence');
    const hasSupplyChain = correlated.some(c => c.id === 'supply_chain_attack');
    const hasTargetedAttack = correlated.some(c => c.id === 'targeted_infrastructure');

    // CRITICAL: Vulnerability weaponization or China high-confidence threat
    if (hasVulnWeaponization) {
      const rule = correlated.find(c => c.id === 'vuln_weaponization');
      return {
        shouldAlert: true, tier: 'CRITICAL', confidence: 'HIGH',
        headline: 'Vulnerability Weaponization Detected',
        reason: `Critical CVE with active exploitation indicators. Evidence: ${(rule.evidence || []).join(', ')}.`,
        actionable: 'Verify affected systems. Apply patches immediately. Check IOC feeds for indicators.',
        signals: (rule.evidence || []).slice(0, 5),
        crossCorrelation: 'NVD + KEV + ExploitDB + GreyNoise',
      };
    }

    if (hasChinaThreat) {
      const rule = correlated.find(c => c.id === 'china_high_confidence');
      return {
        shouldAlert: true, tier: 'CRITICAL', confidence: 'HIGH',
        headline: 'China Region High-Confidence Threat',
        reason: `Multiple Chinese intelligence sources confirming active threat. Evidence: ${(rule.evidence || []).join(', ')}.`,
        actionable: 'Review CNCERT advisory. Check CNVD/CNNVD for affected products.',
        signals: (rule.evidence || []).slice(0, 5),
        crossCorrelation: 'CNCERT + CNVD/CNNVD + ThreatBook/Qianxin',
      };
    }

    // HIGH: Supply chain or targeted infrastructure
    if (hasSupplyChain) {
      const rule = correlated.find(c => c.id === 'supply_chain_attack');
      return {
        shouldAlert: true, tier: 'HIGH', confidence: 'MEDIUM',
        headline: 'Supply Chain Attack Indicator',
        reason: `Supply chain attack signals detected across multiple sources. ${(rule.evidence || []).join(', ')}.`,
        actionable: 'Audit dependencies. Check GitHub advisory for affected packages.',
        signals: (rule.evidence || []).slice(0, 5),
        crossCorrelation: 'GitHub + OSV + security news',
      };
    }

    if (hasTargetedAttack) {
      const rule = correlated.find(c => c.id === 'targeted_infrastructure');
      return {
        shouldAlert: true, tier: 'HIGH', confidence: 'MEDIUM',
        headline: 'Targeted Attack Infrastructure Active',
        reason: `Active attack infrastructure detected. ${(rule.evidence || []).join(', ')}.`,
        actionable: 'Block identified C2 IPs. Review firewall logs for connections.',
        signals: (rule.evidence || []).slice(0, 5),
        crossCorrelation: 'AbuseIPDB + ThreatFox + Feodo',
      };
    }

    // CRITICAL: ≥2 critical atomic signals
    if (criticals.length >= 2) {
      return {
        shouldAlert: true, tier: 'CRITICAL', confidence: 'HIGH',
        headline: `${criticals.length} Critical Threat Signals`,
        reason: `Multiple critical signals: ${criticals.map(s => s.label || s.name || s.key).slice(0, 3).join(', ')}.`,
        actionable: 'Review threat dashboard. Verify affected systems.',
        signals: criticals.map(s => s.label || s.key).slice(0, 5),
        crossCorrelation: 'multi-source',
      };
    }

    // HIGH: ≥2 high signals escalating
    const escalatedHighs = [...criticals, ...highs].filter(s => s.direction === 'escalated');
    if (escalatedHighs.length >= 2) {
      return {
        shouldAlert: true, tier: 'HIGH', confidence: 'MEDIUM',
        headline: `${escalatedHighs.length} Escalating Threat Signals`,
        reason: `Multiple threat indicators escalating: ${escalatedHighs.map(s => s.label || s.key).slice(0, 3).join(', ')}.`,
        actionable: 'Monitor for continuation. Check affected infrastructure.',
        signals: escalatedHighs.map(s => s.label || s.key).slice(0, 5),
        crossCorrelation: 'multi-indicator',
      };
    }

    // MEDIUM: any single critical or ≥3 high signals
    if (criticals.length >= 1 || highs.length >= 3) {
      const topSignal = criticals[0] || highs[0];
      return {
        shouldAlert: true, tier: 'MEDIUM', confidence: 'LOW',
        headline: topSignal.label || topSignal.name || topSignal.reason || 'Threat Signal Change',
        reason: `${criticals.length} critical, ${highs.length} high-severity signals. Direction: ${delta?.summary?.direction || 'unknown'}.`,
        actionable: 'Monitor',
        signals: [...criticals, ...highs].map(s => s.label || s.key).slice(0, 4),
        crossCorrelation: 'single-domain',
      };
    }

    // LOW: ≥5 medium signals
    if (mediums.length >= 5) {
      return {
        shouldAlert: true, tier: 'LOW', confidence: 'LOW',
        headline: `${mediums.length} Medium Threat Signals`,
        reason: `Elevated activity across ${mediums.length} indicators.`,
        actionable: 'Monitor',
        signals: mediums.map(s => s.label || s.key).slice(0, 5),
        crossCorrelation: 'broad-activity',
      };
    }

    return {
      shouldAlert: false,
      reason: `${allSignals.length} signals below alert threshold (${criticals.length} critical, ${highs.length} high, ${mediums.length} medium).`,
    };
  }

  // ─── Two-Way Bot Commands ───────────────────────────────────────────────

  /**
   * Register command handlers that the bot can respond to.
   * @param {string} command - e.g. '/status'
   * @param {Function} handler - async (args, messageId) => responseText
   */
  onCommand(command, handler) {
    this._commandHandlers[command.toLowerCase()] = handler;
  }

  /**
   * Start polling for incoming messages/commands.
   * Call this once during server startup.
   * @param {number} intervalMs - polling interval (default 5000ms)
   */
  startPolling(intervalMs = 5000) {
    if (!this.isConfigured) return;
    if (this._pollingInterval) return; // Already polling

    console.log('[Telegram] Bot command polling started');
    this._initializeBotCommands().catch((err) => {
      console.error('[Telegram] Command initialization failed:', err.message);
    });
    this._pollingInterval = setInterval(() => this._pollUpdates(), intervalMs);
    // Initial poll
    this._pollUpdates();
  }

  /**
   * Stop polling for incoming messages.
   */
  stopPolling() {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
      this._pollingInterval = null;
      console.log('[Telegram] Bot command polling stopped');
    }
  }

  async _pollUpdates() {
    try {
      const params = new URLSearchParams({
        offset: String(this._lastUpdateId + 1),
        timeout: '0',
        limit: '10',
        allowed_updates: JSON.stringify(['message']),
      });

      const res = await fetch(`${TELEGRAM_API}/bot${this.botToken}/getUpdates?${params}`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return;

      const data = await res.json();
      if (!data.ok || !Array.isArray(data.result)) return;

      for (const update of data.result) {
        this._lastUpdateId = Math.max(this._lastUpdateId, update.update_id);
        const msg = update.message;
        if (!msg?.text) continue;

        const chatId = String(msg.chat?.id);
        // Restrict command execution to the configured chat/group only.
        if (chatId !== String(this.chatId)) continue;

        await this._handleMessage(msg);
      }
    } catch (err) {
      // Silent — polling failures are non-fatal
      if (!err.message?.includes('aborted')) {
        console.error('[Telegram] Poll error:', err.message);
      }
    }
  }

  async _handleMessage(msg) {
    const text = msg.text.trim();
    const parts = text.split(/\s+/);
    const rawCommand = parts[0].toLowerCase();
    const command = this._normalizeCommand(rawCommand);
    if (!command) return;
    const args = parts.slice(1).join(' ');
    const replyChatId = msg.chat?.id;

    // Built-in commands
    if (command === '/help') {
      const helpText = Object.entries(COMMANDS)
        .map(([cmd, desc]) => `${cmd} — ${desc}`)
        .join('\n');
      await this.sendMessage(
        `🤖 *CRUCIX BOT COMMANDS*\n\n${helpText}\n\n_Tip: Commands are case-insensitive_`,
        { chatId: replyChatId, replyToMessageId: msg.message_id }
      );
      return;
    }

    if (command === '/mute') {
      const hours = parseFloat(args) || 1;
      this._muteUntil = Date.now() + hours * 60 * 60 * 1000;
      await this.sendMessage(
        `🔇 Alerts muted for ${hours}h — until ${new Date(this._muteUntil).toLocaleTimeString()} UTC\nUse /unmute to resume.`,
        { chatId: replyChatId, replyToMessageId: msg.message_id }
      );
      return;
    }

    if (command === '/unmute') {
      this._muteUntil = null;
      await this.sendMessage(
        `🔔 Alerts resumed. You'll receive the next signal evaluation.`,
        { chatId: replyChatId, replyToMessageId: msg.message_id }
      );
      return;
    }

    if (command === '/alerts') {
      const recent = this._alertHistory.slice(-10);
      if (recent.length === 0) {
        await this.sendMessage('No recent alerts.', { chatId: replyChatId, replyToMessageId: msg.message_id });
        return;
      }
      const lines = recent.map(a =>
        `${TIER_CONFIG[a.tier]?.emoji || '⚪'} ${a.tier} — ${new Date(a.timestamp).toLocaleTimeString()}`
      );
      await this.sendMessage(
        `📋 *Recent Alerts (last ${recent.length})*\n\n${lines.join('\n')}`,
        { chatId: replyChatId, replyToMessageId: msg.message_id }
      );
      return;
    }

    // Delegate to registered handlers
    const handler = this._commandHandlers[command];
    if (handler) {
      try {
        const response = await handler(args, msg.message_id);
        if (response) {
          await this.sendMessage(response, { chatId: replyChatId, replyToMessageId: msg.message_id });
        }
      } catch (err) {
        console.error(`[Telegram] Command ${command} error:`, err.message);
        await this.sendMessage(
          `❌ Command failed: ${err.message}`,
          { chatId: replyChatId, replyToMessageId: msg.message_id }
        );
      }
    }
    // Unknown commands are silently ignored to avoid spamming
  }

  async _initializeBotCommands() {
    await this._loadBotIdentity();

    const botCommands = Object.entries(COMMANDS).map(([command, description]) => ({
      command: command.replace('/', ''),
      description: description.substring(0, 256),
    }));

    // Register commands only for the configured chat to avoid global discovery.
    await this._setMyCommands(botCommands, this._buildConfiguredChatScope());
  }

  async _loadBotIdentity() {
    const res = await fetch(`${TELEGRAM_API}/bot${this.botToken}/getMe`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`getMe failed (${res.status}): ${err.substring(0, 200)}`);
    }
    const data = await res.json();
    if (!data.ok || !data.result?.username) {
      throw new Error('getMe returned invalid bot profile');
    }
    this._botUsername = String(data.result.username).toLowerCase();
  }

  async _setMyCommands(commands, scope = null) {
    const body = { commands };
    if (scope) body.scope = scope;

    const res = await fetch(`${TELEGRAM_API}/bot${this.botToken}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`setMyCommands failed (${res.status}): ${err.substring(0, 200)}`);
    }
    const data = await res.json();
    if (!data.ok) {
      throw new Error(`setMyCommands rejected: ${JSON.stringify(data).substring(0, 200)}`);
    }
  }

  _buildConfiguredChatScope() {
    const chatId = Number(this.chatId);
    if (!Number.isSafeInteger(chatId)) {
      throw new Error(`TELEGRAM_CHAT_ID must be a numeric chat id, got: ${this.chatId}`);
    }
    return { type: 'chat', chat_id: chatId };
  }

  _normalizeCommand(rawCommand) {
    if (!rawCommand.startsWith('/')) return null;

    const atIdx = rawCommand.indexOf('@');
    if (atIdx === -1) return rawCommand;

    const command = rawCommand.substring(0, atIdx);
    const mentionedBot = rawCommand.substring(atIdx + 1).toLowerCase();
    if (!this._botUsername || mentionedBot === this._botUsername) return command;
    return null;
  }

  // ─── Semantic Dedup ─────────────────────────────────────────────────────

  /**
   * Generate a content-based hash for a signal to detect near-duplicates.
   * Uses normalized text + key metrics rather than raw text prefix matching.
   */
  _contentHash(signal) {
    // Normalize: lowercase, strip numbers that change frequently (timestamps, exact values)
    let content = '';
    if (signal.text) {
      content = signal.text.toLowerCase()
        .replace(/\d{1,2}:\d{2}/g, '')       // strip times
        .replace(/\d+\.\d+%?/g, 'NUM')       // normalize numbers
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 120);
    } else if (signal.label) {
      // For metric signals, hash the label + direction (not exact values)
      content = `${signal.label}:${signal.direction || 'none'}`;
    } else {
      content = signal.key || JSON.stringify(signal).substring(0, 80);
    }

    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  _isSemanticDuplicate(signal) {
    const hash = this._contentHash(signal);
    const lastSeen = this._contentHashes[hash];
    if (!lastSeen) return false;

    // Consider duplicate if seen within last 4 hours
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
    return new Date(lastSeen).getTime() > fourHoursAgo;
  }

  _recordContentHash(signal) {
    const hash = this._contentHash(signal);
    this._contentHashes[hash] = new Date().toISOString();

    // Prune hashes older than 24h
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [h, ts] of Object.entries(this._contentHashes)) {
      if (new Date(ts).getTime() < cutoff) delete this._contentHashes[h];
    }
  }

  _signalKey(signal) {
    // Improved key generation — use content hash for text signals, structured key for metrics
    if (signal.text) return `tg:${this._contentHash(signal)}`;
    return signal.key || signal.label || JSON.stringify(signal).substring(0, 60);
  }

  // ─── Rate Limiting ──────────────────────────────────────────────────────

  _checkRateLimit(tier) {
    const config = TIER_CONFIG[tier];
    if (!config) return true;

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Check cooldown since last alert of same or lower tier
    const lastSameTier = this._alertHistory
      .filter(a => a.tier === tier)
      .pop();
    if (lastSameTier && (now - lastSameTier.timestamp) < config.cooldownMs) {
      return false;
    }

    // Check hourly cap
    const recentCount = this._alertHistory
      .filter(a => a.tier === tier && a.timestamp > oneHourAgo)
      .length;
    if (recentCount >= config.maxPerHour) {
      return false;
    }

    return true;
  }

  _recordAlert(tier) {
    this._alertHistory.push({ tier, timestamp: Date.now() });
    // Keep only last 50 alerts
    if (this._alertHistory.length > 50) {
      this._alertHistory = this._alertHistory.slice(-50);
    }
  }

  _isMuted() {
    if (!this._muteUntil) return false;
    if (Date.now() > this._muteUntil) {
      this._muteUntil = null;
      return false;
    }
    return true;
  }

  // ─── Prompt Engineering ─────────────────────────────────────────────────

  _buildEvaluationPrompt() {
    return `You are Crucix, a cybersecurity threat intelligence alert evaluator. You analyze signal deltas from a 42-source security intelligence sweep and decide if the user needs to be alerted.

## Decision Framework — Four Levels

### NO ALERT — suppress if:
- Routine updates without severity change
- Continuation of known trends already flagged
- Low-confidence signals from single sources without cross-confirmation
- Informational data with no actionable implication

### 🔴 CRITICAL — immediate action required:
- Active exploitation of critical vulnerability (CVE in KEV + PoC + scanning)
- Vulnerability weaponization confirmed by multiple sources
- Coordinated attack detected (C2 + IOCs + scanning on same target)
- China region high-confidence threat (CNCERT + CNVD + commercial intel)
Requires: ≥2 corroborating sources across different security domains

### 🟠 HIGH — act within hours:
- Supply chain attack indicators (GitHub Advisory + OSV + news)
- New ransomware campaign with multiple victims
- Targeted attack infrastructure active (C2 + malicious IPs + IOCs)
- Critical CERT advisory requiring patching
Requires: ≥2 signals from hard data sources

### 🟡 MEDIUM — monitor closely:
- New critical CVE (CVSS≥9.0) without exploitation evidence yet
- Elevated scanning/probing activity
- Single-source high-severity alert
- Notable trend anomaly (z-score > 2σ)

### 🔵 LOW — informational:
- Routine vulnerability disclosures
- Minor IOC additions
- Trend continuation without anomaly

## Output Format

Respond with ONLY valid JSON:
{
  "shouldAlert": true/false,
  "tier": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "headline": "10-word max headline",
  "reason": "2-3 sentences. What threat was detected, impact, recommended action.",
  "actionable": "Specific defensive action (or 'Monitor')",
  "signals": ["signal1", "signal2"],
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "crossCorrelation": "Which security domains confirm each other"
}`;
  }

  _buildSignalContext(signals, delta) {
    const sections = [];

    const vulnSignals = signals.filter(s => ['new_critical_cves', 'new_kev_entries', 'epss_spike', 'poc_published', 'osv_critical'].includes(s.key));
    const threatSignals = signals.filter(s => ['new_malware_samples', 'active_c2', 'apt_techniques'].includes(s.key));
    const attackSignals = signals.filter(s => ['mass_scanning', 'ip_reputation_alerts', 'ransomware_victims'].includes(s.key));
    const certSignals = signals.filter(s => ['cert_advisories', 'china_alerts'].includes(s.key));
    const correlated = delta?.signals?.correlated || [];
    const trends = delta?.signals?.trend || [];

    if (vulnSignals.length > 0) {
      sections.push('🔓 VULNERABILITY SIGNALS:\n' + vulnSignals.map(s =>
        `  ${s.label}: ${s.previous != null ? `${s.previous} → ${s.current}` : s.current} (${s.direction})`
      ).join('\n'));
    }

    if (threatSignals.length > 0) {
      sections.push('🦠 THREAT ACTOR SIGNALS:\n' + threatSignals.map(s =>
        `  ${s.label}: ${s.previous != null ? `${s.previous} → ${s.current}` : s.current} (${s.direction})`
      ).join('\n'));
    }

    if (attackSignals.length > 0) {
      sections.push('⚡ ATTACK ACTIVITY:\n' + attackSignals.map(s =>
        `  ${s.label}: ${s.previous != null ? `${s.previous} → ${s.current}` : s.current} (${s.direction})`
      ).join('\n'));
    }

    if (certSignals.length > 0) {
      sections.push('🏛️ CERT/CHINA INTEL:\n' + certSignals.map(s =>
        `  ${s.label}: ${s.current}`
      ).join('\n'));
    }

    if (correlated.length > 0) {
      sections.push('🔗 CROSS-CORRELATION RULES:\n' + correlated.map(c =>
        `  [${c.level}] ${c.name}: ${c.evidence?.join(', ') || ''}`
      ).join('\n'));
    }

    if (trends.length > 0) {
      sections.push('📈 TREND ANOMALIES:\n' + trends.map(t =>
        `  ${t.key}: z=${t.zScore} (${t.direction})`
      ).join('\n'));
    }

    const summary = delta?.summary || {};
    sections.push(`\n🎯 THREAT LEVEL: ${delta?.overallLevel || 'UNKNOWN'} | Index: ${delta?.threatIndex || 0}/100 | Direction: ${summary.direction || 'unknown'} | Signals: ${summary.totalSignals || 0}`);

    return sections.join('\n\n');
  }

  // ─── Message Formatting ─────────────────────────────────────────────────

  _formatTieredAlert(evaluation, delta, tier) {
    const tc = TIER_CONFIG[tier];
    const confidenceEmoji = { HIGH: '🟢', MEDIUM: '🟡', LOW: '⚪' }[evaluation.confidence] || '⚪';
    const threatIndex = delta?.threatIndex || 0;

    const lines = [
      `${tc.emoji} *CRUCIX THREAT ${tc.label}*`,
      ``,
      `*${evaluation.headline}*`,
      ``,
      evaluation.reason,
      ``,
      `Threat Index: ${threatIndex}/100`,
      `Confidence: ${confidenceEmoji} ${evaluation.confidence || 'MEDIUM'}`,
      `Direction: ${(delta?.summary?.direction || 'unknown').toUpperCase()}`,
    ];

    if (evaluation.crossCorrelation) {
      lines.push(`Sources: ${evaluation.crossCorrelation}`);
    }

    if (evaluation.actionable && evaluation.actionable !== 'Monitor') {
      lines.push(``, `🛡️ *Action:* ${evaluation.actionable}`);
    }

    if (evaluation.signals?.length) {
      lines.push('', `*Indicators:*`);
      for (const sig of evaluation.signals) {
        lines.push(`• ${escapeMd(sig)}`);
      }
    }

    lines.push('', `_${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC_`);

    return lines.join('\n');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function escapeMd(text) {
  if (!text) return '';
  // The bot sends alerts with legacy Markdown parse mode, not MarkdownV2.
  // Escape only the characters that legacy Markdown actually treats as markup.
  return text.replace(/([_*`\[])/g, '\\$1');
}

function parseJSON(text) {
  if (!text) return null;
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* give up */ }
    }
    return null;
  }
}
