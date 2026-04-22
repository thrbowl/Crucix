// test/pipeline.test.mjs
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { cvePriorityScore, iocDecayFactor, iocConfidenceScore, iocLifecycleState, IOC_HALF_LIVES } from '../lib/pipeline/scoring.mjs';
import { toStixVulnerability } from '../lib/pipeline/vulnerability.mjs';
import { toStixIndicator } from '../lib/pipeline/indicator.mjs';

// ── Scoring: cvePriorityScore ──────────────────────────────────────────────

test('cvePriorityScore: perfect CVE scores ~1.0', () => {
  const score = cvePriorityScore({
    cvss: { v3: 10, v2: null },
    epss: { score: 1.0 },
    kev: true,
    pocAvailable: true,
    sources: ['NVD', 'CISA', 'VulnCheck', 'ExploitDB', 'OTX'],
  });
  assert.ok(score >= 0.99, `Expected ~1.0, got ${score}`);
  assert.ok(score <= 1.0);
});

test('cvePriorityScore: zero CVE scores 0', () => {
  const score = cvePriorityScore({
    cvss: { v3: null, v2: null },
    epss: { score: 0 },
    kev: false,
    pocAvailable: false,
    sources: [],
  });
  assert.equal(score, 0);
});

test('cvePriorityScore: result is always in [0, 1]', () => {
  const score = cvePriorityScore({
    cvss: { v3: 10 },
    epss: { score: 1 },
    kev: true,
    pocAvailable: true,
    sources: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  });
  assert.ok(score >= 0 && score <= 1);
});

test('cvePriorityScore: KEV adds 0.20 to score vs non-KEV', () => {
  const base = { cvss: { v3: 5 }, epss: { score: 0 }, pocAvailable: false, sources: ['NVD'] };
  const diff = cvePriorityScore({ ...base, kev: true }) - cvePriorityScore({ ...base, kev: false });
  assert.ok(Math.abs(diff - 0.20) < 0.001, `Expected 0.20 diff, got ${diff}`);
});

// ── Scoring: iocDecayFactor ────────────────────────────────────────────────

test('iocDecayFactor: at t=0 returns 1.0', () => {
  const now = Date.now();
  assert.equal(iocDecayFactor('ipv4-addr', now, now), 1.0);
});

test('iocDecayFactor: at t=halfLife returns 0.5', () => {
  const halfLife = IOC_HALF_LIVES['ipv4-addr'];
  const now = Date.now();
  const past = now - halfLife * 86_400_000;
  const factor = iocDecayFactor('ipv4-addr', past, now);
  assert.ok(Math.abs(factor - 0.5) < 0.001, `Expected 0.5, got ${factor}`);
});

test('iocDecayFactor: at t=2*halfLife returns 0.25', () => {
  const halfLife = IOC_HALF_LIVES['domain-name'];
  const now = Date.now();
  const past = now - 2 * halfLife * 86_400_000;
  const factor = iocDecayFactor('domain-name', past, now);
  assert.ok(Math.abs(factor - 0.25) < 0.001, `Expected 0.25, got ${factor}`);
});

test('iocDecayFactor: file hash decays slowest', () => {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86_400_000;
  const ipFactor = iocDecayFactor('ipv4-addr', sevenDaysAgo, now);
  const fileFactor = iocDecayFactor('file', sevenDaysAgo, now);
  assert.ok(fileFactor > ipFactor, 'File hash should decay slower than IP');
});

// ── Scoring: iocLifecycleState ─────────────────────────────────────────────

test('iocLifecycleState: fresh IOC just seen', () => {
  const now = Date.now();
  const ioc = { type: 'ipv4-addr', lastSeen: new Date(now).toISOString(), sources: ['OTX'], confidence: 80 };
  assert.equal(iocLifecycleState(ioc, now), 'fresh');
});

test('iocLifecycleState: stale IOC past multiple half-lives', () => {
  const now = Date.now();
  const veryOld = now - 60 * 86_400_000;
  const ioc = { type: 'ipv4-addr', lastSeen: new Date(veryOld).toISOString(), sources: ['OTX'], confidence: 80 };
  assert.equal(iocLifecycleState(ioc, now), 'stale');
});

// ── toStixVulnerability ────────────────────────────────────────────────────

test('toStixVulnerability: required STIX fields present', () => {
  const cve = {
    id: 'CVE-2024-1234',
    cvss: { v3: 9.8, v2: null },
    epss: { score: 0.94, percentile: 0.99 },
    kev: true,
    pocAvailable: true,
    pocUrls: [],
    sources: ['NVD', 'CISA-KEV'],
    patchAvailable: true,
    lifecycle: 'kev',
    attackVector: 'NETWORK',
    vendors: ['Vendor A'],
    products: ['Product A'],
    firstPublished: '2024-01-01T00:00:00Z',
    lastModified: '2024-01-02T00:00:00Z',
  };
  const stix = toStixVulnerability(cve);

  assert.equal(stix.type, 'vulnerability');
  assert.equal(stix.spec_version, '2.1');
  assert.match(stix.id, /^vulnerability--/);
  assert.equal(stix.name, 'CVE-2024-1234');
  assert.ok(stix.external_references.some(r => r.external_id === 'CVE-2024-1234'));
  assert.equal(stix.x_crucix_kev_listed, true);
  assert.equal(stix.x_crucix_patch_status, 'available');
  assert.ok(stix.x_crucix_priority_score > 0);
  assert.ok(stix.x_crucix_priority_score <= 1);
});

test('toStixVulnerability: ID is deterministic for same CVE', () => {
  const cve = {
    id: 'CVE-2024-9999',
    cvss: {}, epss: {}, kev: false, pocAvailable: false,
    sources: ['NVD'], patchAvailable: false, lifecycle: 'published',
    vendors: [], products: [], pocUrls: [],
  };
  const id1 = toStixVulnerability(cve).id;
  const id2 = toStixVulnerability(cve).id;
  assert.equal(id1, id2);
});

// ── toStixIndicator ────────────────────────────────────────────────────────

test('toStixIndicator: IP → indicator with correct pattern + ipv4-addr SCO', () => {
  const ioc = {
    type: 'ipv4-addr',
    value: '192.168.1.100',
    confidence: 80,
    sources: ['OTX', 'AbuseIPDB'],
    tags: ['c2'],
    firstSeen: '2024-01-01T00:00:00Z',
    lastSeen: '2024-01-15T00:00:00Z',
    relatedCVEs: [],
    relatedActors: [],
  };
  const { indicator, sco } = toStixIndicator(ioc);

  assert.equal(indicator.type, 'indicator');
  assert.equal(indicator.spec_version, '2.1');
  assert.match(indicator.id, /^indicator--/);
  assert.equal(indicator.pattern, "[ipv4-addr:value = '192.168.1.100']");
  assert.equal(indicator.pattern_type, 'stix');

  assert.equal(sco.type, 'ipv4-addr');
  assert.equal(sco.value, '192.168.1.100');
  assert.match(sco.id, /^ipv4-addr--/);
});

test('toStixIndicator: SHA-256 file hash → file SCO with correct hash key', () => {
  const hash = 'a'.repeat(64);
  const ioc = {
    type: 'file', value: hash, confidence: 90,
    sources: ['MalwareBazaar'], tags: [], firstSeen: '2024-01-01T00:00:00Z',
    lastSeen: '2024-01-01T00:00:00Z', relatedCVEs: [], relatedActors: [],
  };
  const { indicator, sco } = toStixIndicator(ioc);

  assert.ok(indicator.pattern.includes('SHA-256'));
  assert.ok(sco.hashes?.['SHA-256']);
  assert.equal(sco.hashes['SHA-256'], hash);
});

test('toStixIndicator: indicator and SCO IDs are deterministic', () => {
  const ioc = {
    type: 'domain-name', value: 'evil.example.com', confidence: 75,
    sources: ['ThreatFox'], tags: [], firstSeen: '2024-01-01T00:00:00Z',
    lastSeen: '2024-01-10T00:00:00Z', relatedCVEs: [], relatedActors: [],
  };
  const now = Date.now();
  const { indicator: i1, sco: s1 } = toStixIndicator(ioc, now);
  const { indicator: i2, sco: s2 } = toStixIndicator(ioc, now);
  assert.equal(i1.id, i2.id);
  assert.equal(s1.id, s2.id);
});
