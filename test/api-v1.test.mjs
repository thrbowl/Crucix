// test/api-v1.test.mjs
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { sendApiResponse, buildStixBundle, parsePagination, creditsFromReq } from '../lib/api/v1/response.mjs';

// ── parsePagination ────────────────────────────────────────────────────────

test('parsePagination: defaults page=1 limit=20', () => {
  const { page, limit, offset } = parsePagination({});
  assert.equal(page, 1);
  assert.equal(limit, 20);
  assert.equal(offset, 0);
});

test('parsePagination: page 2 with limit 10 → offset 10', () => {
  const { page, limit, offset } = parsePagination({ page: '2', limit: '10' });
  assert.equal(page, 2);
  assert.equal(limit, 10);
  assert.equal(offset, 10);
});

test('parsePagination: clamps limit to maxLimit', () => {
  const { limit } = parsePagination({ limit: '9999' }, 20, 100);
  assert.equal(limit, 100);
});

test('parsePagination: page minimum is 1', () => {
  const { page, offset } = parsePagination({ page: '-5' });
  assert.equal(page, 1);
  assert.equal(offset, 0);
});

test('parsePagination: non-numeric values fall back to defaults', () => {
  const { page, limit } = parsePagination({ page: 'abc', limit: 'xyz' });
  assert.equal(page, 1);
  assert.equal(limit, 20);
});

// ── buildStixBundle ────────────────────────────────────────────────────────

test('buildStixBundle: wraps single object in array', () => {
  const obj = { type: 'vulnerability', id: 'vulnerability--abc' };
  const bundle = buildStixBundle(obj);
  assert.equal(bundle.type, 'bundle');
  assert.equal(bundle.spec_version, '2.1');
  assert.equal(bundle.objects.length, 1);
  assert.deepEqual(bundle.objects[0], obj);
});

test('buildStixBundle: preserves array of objects', () => {
  const objs = [
    { type: 'vulnerability', id: 'vulnerability--1' },
    { type: 'indicator', id: 'indicator--2' },
  ];
  const bundle = buildStixBundle(objs);
  assert.equal(bundle.objects.length, 2);
});

test('buildStixBundle: id has bundle-- prefix', () => {
  const bundle = buildStixBundle([]);
  assert.ok(bundle.id.startsWith('bundle--'), `Expected bundle-- prefix, got: ${bundle.id}`);
});

test('buildStixBundle: two calls produce different IDs', () => {
  const b1 = buildStixBundle([]);
  const b2 = buildStixBundle([]);
  assert.notEqual(b1.id, b2.id);
});

// ── creditsFromReq ─────────────────────────────────────────────────────────

test('creditsFromReq: returns consumed cost and remaining from req', () => {
  const req = { creditsRemaining: 299 };
  const credits = creditsFromReq(req, 5);
  assert.equal(credits.consumed, 5);
  assert.equal(credits.remaining, 299);
});

test('creditsFromReq: remaining is null when not set', () => {
  const req = {};
  const credits = creditsFromReq(req, 1);
  assert.equal(credits.consumed, 1);
  assert.equal(credits.remaining, null);
});

// ── sendApiResponse ────────────────────────────────────────────────────────

test('sendApiResponse: formats data and meta correctly', () => {
  let capturedBody = null;
  const res = { json(body) { capturedBody = body; } };
  sendApiResponse(res, { foo: 'bar' }, { consumed: 1, remaining: 99 });
  assert.deepEqual(capturedBody.data, { foo: 'bar' });
  assert.equal(capturedBody.meta.credits_consumed, 1);
  assert.equal(capturedBody.meta.credits_remaining, 99);
  assert.ok(!('stix_bundle' in capturedBody), 'stix_bundle should not be present');
});

test('sendApiResponse: includes stix_bundle when provided', () => {
  let capturedBody = null;
  const res = { json(body) { capturedBody = body; } };
  const bundle = { type: 'bundle', id: 'bundle--x', objects: [] };
  sendApiResponse(res, {}, { consumed: 5, remaining: 10 }, bundle);
  assert.ok('stix_bundle' in capturedBody, 'stix_bundle should be present');
  assert.equal(capturedBody.stix_bundle.type, 'bundle');
});

test('sendApiResponse: credits_remaining is null when not provided', () => {
  let capturedBody = null;
  const res = { json(body) { capturedBody = body; } };
  sendApiResponse(res, {});
  assert.equal(capturedBody.meta.credits_remaining, null);
  assert.equal(capturedBody.meta.credits_consumed, 0);
});
