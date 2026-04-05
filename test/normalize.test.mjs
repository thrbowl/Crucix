#!/usr/bin/env node
// Tests for lib/normalize — IOC/CVE standardization and confidence scoring

import { strict as assert } from 'assert';
import {
  normalizeIOC, mergeIOCs, deduplicateIOCs, detectIOCType,
  normalizeCVE, mergeCVEs, deduplicateCVEs, cveSeverityScore,
  calculateConfidence, recalculateConfidences,
} from '../lib/normalize/index.mjs';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

console.log('\n=== IOC Normalization Tests ===\n');

test('detectIOCType: IPv4', () => {
  assert.equal(detectIOCType('192.168.1.1'), 'ipv4-addr');
  assert.equal(detectIOCType('8.8.8.8'), 'ipv4-addr');
  assert.equal(detectIOCType('999.999.999.999'), null);
});

test('detectIOCType: domain', () => {
  assert.equal(detectIOCType('evil.example.com'), 'domain-name');
  assert.equal(detectIOCType('c2.badactor.net'), 'domain-name');
});

test('detectIOCType: URL', () => {
  assert.equal(detectIOCType('https://evil.com/payload'), 'url');
  assert.equal(detectIOCType('http://malware.site/dl'), 'url');
});

test('detectIOCType: file hash', () => {
  assert.equal(detectIOCType('d41d8cd98f00b204e9800998ecf8427e'), 'file'); // MD5
  assert.equal(detectIOCType('da39a3ee5e6b4b0d3255bfef95601890afd80709'), 'file'); // SHA1
  assert.equal(detectIOCType('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'), 'file'); // SHA256
});

test('detectIOCType: email', () => {
  assert.equal(detectIOCType('attacker@evil.com'), 'email-addr');
});

test('detectIOCType: null/empty', () => {
  assert.equal(detectIOCType(null), null);
  assert.equal(detectIOCType(''), null);
  assert.equal(detectIOCType('random text'), null);
});

test('normalizeIOC: basic IP', () => {
  const ioc = normalizeIOC({ value: '1.2.3.4', tags: ['c2'] }, 'TestSource');
  assert.equal(ioc.type, 'ipv4-addr');
  assert.equal(ioc.value, '1.2.3.4');
  assert.deepEqual(ioc.sources, ['TestSource']);
  assert.deepEqual(ioc.tags, ['c2']);
});

test('normalizeIOC: domain normalization (lowercase)', () => {
  const ioc = normalizeIOC({ value: 'Evil.Example.COM' }, 'OTX');
  assert.equal(ioc.value, 'evil.example.com');
});

test('normalizeIOC: explicit type preserved', () => {
  const ioc = normalizeIOC({ value: '1.2.3.4', type: 'ipv4-addr' }, 'OTX');
  assert.equal(ioc.type, 'ipv4-addr');
});

test('normalizeIOC: rejects null/empty', () => {
  assert.equal(normalizeIOC(null, 'X'), null);
  assert.equal(normalizeIOC({ value: '' }, 'X'), null);
  assert.equal(normalizeIOC({}, 'X'), null);
});

test('mergeIOCs: combines sources and tags', () => {
  const a = normalizeIOC({ value: '1.2.3.4', tags: ['c2'] }, 'SourceA');
  const b = normalizeIOC({ value: '1.2.3.4', tags: ['botnet'] }, 'SourceB');
  const merged = mergeIOCs(a, b);
  assert.deepEqual(merged.sources, ['SourceA', 'SourceB']);
  assert.ok(merged.tags.includes('c2'));
  assert.ok(merged.tags.includes('botnet'));
});

test('deduplicateIOCs: merges same value+type', () => {
  const iocs = [
    normalizeIOC({ value: '1.2.3.4', tags: ['c2'] }, 'A'),
    normalizeIOC({ value: '1.2.3.4', tags: ['botnet'] }, 'B'),
    normalizeIOC({ value: 'evil.com', tags: ['phishing'] }, 'C'),
  ];
  const deduped = deduplicateIOCs(iocs);
  assert.equal(deduped.length, 2);
  const ip = deduped.find(i => i.value === '1.2.3.4');
  assert.equal(ip.sources.length, 2);
});

console.log('\n=== CVE Normalization Tests ===\n');

test('normalizeCVE: basic', () => {
  const cve = normalizeCVE({ id: 'CVE-2024-12345', cvssV3: 9.8, vendor: 'Apache' }, 'NVD');
  assert.equal(cve.id, 'CVE-2024-12345');
  assert.equal(cve.cvss.v3, 9.8);
  assert.deepEqual(cve.vendors, ['Apache']);
  assert.deepEqual(cve.sources, ['NVD']);
});

test('normalizeCVE: rejects invalid ID', () => {
  assert.equal(normalizeCVE({ id: 'not-a-cve' }, 'X'), null);
  assert.equal(normalizeCVE(null, 'X'), null);
});

test('mergeCVEs: combines data', () => {
  const a = normalizeCVE({ id: 'CVE-2024-99999', cvssV3: 9.0, vendor: 'Apache' }, 'NVD');
  const b = normalizeCVE({ id: 'CVE-2024-99999', kev: true, pocAvailable: true }, 'CISA-KEV');
  const merged = mergeCVEs(a, b);
  assert.equal(merged.cvss.v3, 9.0);
  assert.equal(merged.kev, true);
  assert.equal(merged.pocAvailable, true);
  assert.deepEqual(merged.sources, ['NVD', 'CISA-KEV']);
});

test('deduplicateCVEs: merges by ID', () => {
  const cves = [
    normalizeCVE({ id: 'CVE-2024-11111', cvssV3: 7.5 }, 'NVD'),
    normalizeCVE({ id: 'CVE-2024-11111', kev: true }, 'KEV'),
    normalizeCVE({ id: 'CVE-2024-22222', cvssV3: 5.0 }, 'NVD'),
  ];
  const deduped = deduplicateCVEs(cves);
  assert.equal(deduped.length, 2);
});

test('cveSeverityScore: high for critical CVE in KEV with PoC', () => {
  const cve = normalizeCVE({
    id: 'CVE-2024-99999', cvssV3: 10.0, epssScore: 0.95,
    kev: true, pocAvailable: true,
  }, 'NVD');
  cve.sources = ['NVD', 'KEV', 'GitHub'];
  const score = cveSeverityScore(cve);
  assert.ok(score >= 90, `Expected >=90, got ${score}`);
});

test('cveSeverityScore: low for minor CVE', () => {
  const cve = normalizeCVE({ id: 'CVE-2024-00001', cvssV3: 2.0, epssScore: 0.01 }, 'NVD');
  const score = cveSeverityScore(cve);
  assert.ok(score < 30, `Expected <30, got ${score}`);
});

console.log('\n=== Confidence Scoring Tests ===\n');

test('calculateConfidence: single community source', () => {
  const ioc = normalizeIOC({ value: '1.2.3.4' }, 'AbuseIPDB');
  const score = calculateConfidence(ioc);
  assert.ok(score > 20 && score <= 50, `Expected 20-50, got ${score}`);
});

test('calculateConfidence: official CERT source gets +30', () => {
  const ioc = normalizeIOC({ value: '1.2.3.4' }, 'CISA-KEV');
  const score = calculateConfidence(ioc);
  assert.ok(score >= 50, `Expected >=50, got ${score}`);
});

test('calculateConfidence: multi-source cross-confirmation', () => {
  const ioc = { value: '1.2.3.4', type: 'ipv4-addr', sources: ['CISA-KEV', 'VirusTotal', 'OTX'], tags: [], relatedCVEs: [], lastSeen: new Date().toISOString() };
  const score = calculateConfidence(ioc);
  assert.ok(score >= 80, `Expected >=80, got ${score}`);
});

test('recalculateConfidences: updates all IOCs', () => {
  const iocs = [
    normalizeIOC({ value: '1.2.3.4' }, 'OTX'),
    normalizeIOC({ value: 'evil.com' }, 'CISA-KEV'),
  ];
  const updated = recalculateConfidences(iocs);
  assert.equal(updated.length, 2);
  assert.ok(updated[1].confidence > updated[0].confidence);
});

// Summary
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}\n`);
process.exit(failed > 0 ? 1 : 0);
