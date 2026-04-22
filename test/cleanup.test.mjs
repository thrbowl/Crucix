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
  const alertFiles = [
    'lib/alerts/telegram.mjs',
    'lib/alerts/discord.mjs',
  ];
  for (const f of alertFiles) {
    assert.equal(existsSync(join(ROOT, f)), false, `${f} should be deleted`);
  }
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
