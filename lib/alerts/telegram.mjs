// Telegram Alerter — sends breaking news alerts via Telegram Bot API (LLM-gated)

const TELEGRAM_API = 'https://api.telegram.org';

export class TelegramAlerter {
  constructor({ botToken, chatId }) {
    this.botToken = botToken;
    this.chatId = chatId;
  }

  get isConfigured() {
    return !!(this.botToken && this.chatId);
  }

  /**
   * Send a message via Telegram Bot API.
   * @param {string} message - markdown-formatted message
   * @returns {Promise<boolean>} - true if sent successfully
   */
  async sendAlert(message) {
    if (!this.isConfigured) return false;

    try {
      const res = await fetch(`${TELEGRAM_API}/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        console.error(`[Telegram] Send failed (${res.status}): ${err.substring(0, 100)}`);
        return false;
      }

      return true;
    } catch (err) {
      console.error('[Telegram] Send error:', err.message);
      return false;
    }
  }

  /**
   * Evaluate delta signals with LLM and send alert if warranted.
   * @param {LLMProvider} llmProvider - configured LLM provider
   * @param {object} delta - delta from current sweep
   * @param {MemoryManager} memory - memory manager for dedup
   * @returns {Promise<boolean>} - true if alert was sent
   */
  async evaluateAndAlert(llmProvider, delta, memory) {
    if (!this.isConfigured || !llmProvider?.isConfigured) return false;
    if (!delta?.summary?.criticalChanges) return false;

    // Filter out already-alerted signals
    const alerted = memory.getAlertedSignals();
    const newSignals = [
      ...(delta.signals?.new || []),
      ...(delta.signals?.escalated || []),
    ].filter(s => {
      const key = s.key || s.label || s.text?.substring(0, 40);
      return !alerted[key];
    });

    if (newSignals.length === 0) return false;

    // Ask LLM if these signals warrant an immediate alert
    const systemPrompt = `You are an intelligence alert evaluator. You receive new/escalated signals from an OSINT monitoring system. Your job is to determine if any warrant an IMMEDIATE alert to the user.

Alert criteria (ALL must be true):
1. Material market impact likely (>1% move in major index, or >5% move in sector/commodity)
2. Time-sensitive — acting in the next few hours matters
3. Not routine data (scheduled economic releases don't count unless they're a major surprise)

Respond with ONLY valid JSON:
{
  "shouldAlert": true/false,
  "reason": "1-2 sentence explanation",
  "headline": "Alert headline if shouldAlert is true",
  "signals": ["key signals that triggered alert"]
}`;

    const userMessage = `New/escalated signals since last sweep:\n${newSignals.map(s => {
      if (s.changePct !== undefined) return `- ${s.label}: ${s.previous} → ${s.current} (${s.changePct > 0 ? '+' : ''}${s.changePct.toFixed(1)}%)`;
      if (s.text) return `- NEW OSINT: ${s.text.substring(0, 120)}`;
      return `- ${s.label || JSON.stringify(s)}`;
    }).join('\n')}

Delta summary: direction=${delta.summary.direction}, total changes=${delta.summary.totalChanges}, critical=${delta.summary.criticalChanges}`;

    try {
      const result = await llmProvider.complete(systemPrompt, userMessage, { maxTokens: 512, timeout: 30000 });
      const evaluation = parseEvaluation(result.text);

      if (!evaluation?.shouldAlert) {
        console.log('[Telegram] LLM says no alert needed:', evaluation?.reason || 'unknown');
        return false;
      }

      // Build and send alert message
      const message = formatAlertMessage(evaluation, delta);
      const sent = await this.sendAlert(message);

      if (sent) {
        // Mark signals as alerted
        for (const s of newSignals) {
          const key = s.key || s.label || s.text?.substring(0, 40);
          memory.markAsAlerted(key, new Date().toISOString());
        }
        console.log('[Telegram] Alert sent:', evaluation.headline);
      }

      return sent;
    } catch (err) {
      console.error('[Telegram] LLM evaluation failed:', err.message);
      return false;
    }
  }
}

function parseEvaluation(text) {
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

function formatAlertMessage(evaluation, delta) {
  const lines = [
    `🚨 *CRUCIX ALERT*`,
    ``,
    `*${evaluation.headline}*`,
    ``,
    evaluation.reason,
    ``,
    `Direction: ${delta.summary.direction.toUpperCase()}`,
    `Critical changes: ${delta.summary.criticalChanges}`,
  ];

  if (evaluation.signals?.length) {
    lines.push('', `Key signals: ${evaluation.signals.join(', ')}`);
  }

  lines.push('', `_${new Date().toLocaleTimeString()} UTC_`);

  return lines.join('\n');
}
