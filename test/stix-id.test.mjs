// test/stix-id.test.mjs
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { stixId, STIX_NAMESPACE } from '../lib/stix/id.mjs';

test('stixId: same inputs produce same ID (deterministic)', () => {
  const id1 = stixId('vulnerability', 'CVE-2024-1234');
  const id2 = stixId('vulnerability', 'CVE-2024-1234');
  assert.equal(id1, id2);
});

test('stixId: different CVE IDs produce different IDs', () => {
  const id1 = stixId('vulnerability', 'CVE-2024-1234');
  const id2 = stixId('vulnerability', 'CVE-2024-5678');
  assert.notEqual(id1, id2);
});

test('stixId: different types with same name produce different IDs', () => {
  const id1 = stixId('vulnerability', 'test');
  const id2 = stixId('indicator', 'test');
  assert.notEqual(id1, id2);
});

test('stixId: output format is type--uuid', () => {
  const id = stixId('vulnerability', 'CVE-2024-1234');
  assert.match(id, /^vulnerability--[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test('stixId: multiple parts joined correctly', () => {
  const id1 = stixId('indicator', 'ipv4-addr', '1.2.3.4');
  const id2 = stixId('indicator', 'ipv4-addr', '1.2.3.4');
  const id3 = stixId('indicator', 'ipv4-addr', '5.6.7.8');
  assert.equal(id1, id2);
  assert.notEqual(id1, id3);
});

test('STIX_NAMESPACE is the official STIX 2.1 namespace', () => {
  assert.equal(STIX_NAMESPACE, '00abedb4-aa42-466c-9c01-fed23315a9b7');
});
