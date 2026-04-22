// test/auth.test.mjs
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { generateRefreshToken, hashToken } from '../lib/auth/tokens.mjs';
import { generateApiKey, hashApiKey } from '../lib/auth/apikeys.mjs';
import { CREDIT_COSTS } from '../lib/credits/index.mjs';

// ── Refresh Token ──────────────────────────────────────────────────────────

test('generateRefreshToken: returns plaintext, hash, and expiresAt', () => {
  const { plaintext, hash, expiresAt } = generateRefreshToken();
  assert.ok(typeof plaintext === 'string' && plaintext.length === 64, 'plaintext should be 64 hex chars');
  assert.ok(typeof hash === 'string' && hash.length === 64, 'hash should be 64 hex chars (SHA-256)');
  assert.ok(expiresAt instanceof Date, 'expiresAt should be a Date');
  assert.ok(expiresAt > new Date(), 'expiresAt should be in the future');
});

test('generateRefreshToken: plaintext and hash are different', () => {
  const { plaintext, hash } = generateRefreshToken();
  assert.notEqual(plaintext, hash);
});

test('generateRefreshToken: two calls produce different tokens', () => {
  const t1 = generateRefreshToken();
  const t2 = generateRefreshToken();
  assert.notEqual(t1.plaintext, t2.plaintext);
  assert.notEqual(t1.hash, t2.hash);
});

test('hashToken: consistent — same input same output', () => {
  const h1 = hashToken('test-token-123');
  const h2 = hashToken('test-token-123');
  assert.equal(h1, h2);
});

test('hashToken: SHA-256 output is 64 hex chars', () => {
  const h = hashToken('any-token');
  assert.match(h, /^[0-9a-f]{64}$/);
});

// ── API Key ────────────────────────────────────────────────────────────────

test('generateApiKey: plaintext starts with crx_', () => {
  const { plaintext } = generateApiKey();
  assert.ok(plaintext.startsWith('crx_'), `Expected crx_ prefix, got: ${plaintext.slice(0, 8)}`);
});

test('generateApiKey: plaintext has correct length (crx_ + 64 hex)', () => {
  const { plaintext } = generateApiKey();
  assert.equal(plaintext.length, 4 + 64);  // 'crx_' = 4, 32 bytes hex = 64
});

test('generateApiKey: hash is 64-char hex', () => {
  const { hash } = generateApiKey();
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test('generateApiKey: two calls produce different keys', () => {
  const k1 = generateApiKey();
  const k2 = generateApiKey();
  assert.notEqual(k1.plaintext, k2.plaintext);
  assert.notEqual(k1.hash, k2.hash);
});

test('hashApiKey: consistent lookup — same key same hash', () => {
  const { plaintext } = generateApiKey();
  const h1 = hashApiKey(plaintext);
  const h2 = hashApiKey(plaintext);
  assert.equal(h1, h2);
});

test('hashApiKey: different keys produce different hashes', () => {
  const k1 = generateApiKey();
  const k2 = generateApiKey();
  assert.notEqual(hashApiKey(k1.plaintext), hashApiKey(k2.plaintext));
});

// ── Credit Costs ───────────────────────────────────────────────────────────

test('CREDIT_COSTS: all required operations defined', () => {
  const required = ['briefing_read', 'ioc_lookup', 'cve_query', 'entity_query', 'alert_list',
                    'search', 'related_entities', 'entity_profile', 'defensive_priorities',
                    'trend_analysis', 'attack_chain'];
  for (const op of required) {
    assert.ok(op in CREDIT_COSTS, `Missing operation: ${op}`);
    assert.ok(typeof CREDIT_COSTS[op] === 'number' && CREDIT_COSTS[op] > 0, `Cost for ${op} should be > 0`);
  }
});

test('CREDIT_COSTS: attack_chain costs most (20)', () => {
  assert.equal(CREDIT_COSTS.attack_chain, 20);
});

test('CREDIT_COSTS: simple lookups cost 1', () => {
  assert.equal(CREDIT_COSTS.briefing_read, 1);
  assert.equal(CREDIT_COSTS.ioc_lookup, 1);
  assert.equal(CREDIT_COSTS.cve_query, 1);
});

test('CREDIT_COSTS: search and analysis operations follow expected tiers', () => {
  assert.equal(CREDIT_COSTS.search, 2);
  assert.equal(CREDIT_COSTS.trend_analysis, 10);
  assert.equal(CREDIT_COSTS.entity_profile, 5);
});
