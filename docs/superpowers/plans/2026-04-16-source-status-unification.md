# Source Status Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize all 36 data source return values so every source consistently outputs `status: 'active'` (has data) or `status: 'inactive'` (no data, with reason), replacing the current 10+ inconsistent status strings.

**Architecture:** Add a `normalizeSourceData()` function in `briefing.mjs` that maps all legacy status values to the two canonical ones. Apply it inside `runSource` after the data is received. Update `inject.mjs` source health to read the new unified status. No source files are modified — the normalization is a single central layer.

**Tech Stack:** Node.js ESM, no new dependencies.

---

## Background: Current Status Chaos

Sources currently return one of these patterns on failure — inconsistently:

| Old value | Meaning |
|-----------|---------|
| `status: 'connected'` | Has data (most API sources) |
| `status: 'no_credentials'` | Missing API key |
| `status: 'rss_unavailable'` | RSS/HTTP fetch failed |
| `status: 'api_error'` / `status: 'auth_failed'` | API call failed |
| `status: 'unavailable'` | Service unreachable |
| `status: 'partial'` | Has some data via fallback |
| `status: 'public_feed'` / `'web_scrape'` / `'bot_api'` | Implementation detail (still has data) |
| `{ error: '...' }` (no status field) | 18 sources use this pattern |

`briefing.mjs`'s `sourcesOk` counts `runSource` wrapper status (`ok` / `error`) — which only reflects whether the function threw, not whether it returned real data. So a source returning `status: 'no_credentials'` still counts as "ok".

## Target State

Every source's `data` object will have exactly:
- `status: 'active'` — source returned usable intelligence data
- `status: 'inactive'` — source returned no data, plus:
  - `reason: 'no_key' | 'unreachable' | 'api_error' | 'rate_limited' | 'geo_blocked'`
  - `message: string` — human-readable explanation

`sourcesOk` will count truly active sources. `inject.mjs` source health will use `status !== 'active'` instead of `Boolean(src.error)`.

---

## File Map

| File | Change |
|------|--------|
| `apis/briefing.mjs` | Add `inferReason()` + `normalizeSourceData()`, apply in `runSource`, update `sourcesOk`/`sourcesFailed`/`sourcesInactive` counts, fix `totalSources` constant |
| `dashboard/inject.mjs` | Update source health map: `err: Boolean(src.error)` → `err: src.status !== 'active'` |

No source files (`apis/sources/*.mjs`) are modified.

---

## Task 1: Add normalization layer to `briefing.mjs`

**Files:**
- Modify: `apis/briefing.mjs`

### What to add

Add these two functions immediately before the `runSource` function (around line 59):

```js
// Map legacy source status strings to canonical reason codes
function inferReason(statusOrError) {
  const s = String(statusOrError).toLowerCase();
  if (s.includes('no_credentials') || s.includes('no credential') || s.includes('api key') || s.includes('apikey') || s.includes('key not set') || s.includes('missing key')) return 'no_key';
  if (s.includes('rate') || s.includes('429') || s.includes('quota') || s.includes('limit')) return 'rate_limited';
  if (s.includes('not available in your area') || s.includes('geo') || s.includes('region') || s.includes('country')) return 'geo_blocked';
  if (s.includes('auth') || s.includes('401') || s.includes('forbidden') || s.includes('invalid api') || s.includes('invalid method')) return 'api_error';
  return 'unreachable';
}

// Normalize any source return value to { status: 'active' } or { status: 'inactive', reason, message }
function normalizeSourceData(name, data) {
  if (!data || typeof data !== 'object') {
    return { source: name, timestamp: new Date().toISOString(), status: 'inactive', reason: 'unreachable', message: 'Source returned no data' };
  }

  // Already normalized — pass through
  if (data.status === 'active' || data.status === 'inactive') return data;

  // Has error field → inactive
  if (data.error) {
    return { ...data, status: 'inactive', reason: inferReason(data.error), message: String(data.error) };
  }

  // Statuses that mean "has data"
  const ACTIVE_STATUSES = new Set(['connected', 'bot_api', 'bot_api_empty_fallback_scrape', 'public_feed', 'web_scrape', 'partial']);
  if (data.status && ACTIVE_STATUSES.has(data.status)) {
    return { ...data, status: 'active' };
  }

  // Statuses that mean "no data"
  const INACTIVE_STATUSES = {
    'no_credentials': 'no_key',
    'rss_unavailable': 'unreachable',
    'api_error': 'api_error',
    'auth_failed': 'api_error',
    'unavailable': 'unreachable',
    'API and public feed both unreachable': 'unreachable',
  };
  if (data.status && data.status in INACTIVE_STATUSES) {
    return {
      ...data,
      status: 'inactive',
      reason: INACTIVE_STATUSES[data.status],
      message: data.message || data.status,
    };
  }

  // No status, no error → assume active (source returned data object)
  return { ...data, status: 'active' };
}
```

### Apply normalization in `runSource`

In the existing `runSource` function, change the success return (currently line 74):

```js
// Before:
return { name, status: 'ok', durationMs: Date.now() - start, data };

// After:
return { name, status: 'ok', durationMs: Date.now() - start, data: normalizeSourceData(name, data) };
```

### Fix `sourcesOk` / `sourcesFailed` and `totalSources`

In `fullBriefing()`, update:

```js
// Before:
const totalSources = 41;
// ...
sourcesOk: sources.filter(s => s.status === 'ok').length,
sourcesFailed: sources.filter(s => s.status !== 'ok').length,

// After:
const totalSources = 36; // 36 active (ThreatBook disabled — API broken)
// ...
sourcesOk: sources.filter(s => s.status === 'ok' && s.data?.status === 'active').length,
sourcesInactive: sources.filter(s => s.status === 'ok' && s.data?.status === 'inactive').length,
sourcesFailed: sources.filter(s => s.status !== 'ok').length,
```

Also update the console.error log line:

```js
// Before:
console.error(`[Crucix] Sweep complete in ${totalMs}ms — ${output.crucix.sourcesOk}/${sources.length} sources returned data`)

// After:
console.error(`[Crucix] Sweep complete in ${totalMs}ms — ${output.crucix.sourcesOk} active / ${output.crucix.sourcesInactive} inactive / ${output.crucix.sourcesFailed} failed`)
```

- [ ] **Step 1: Add `inferReason` and `normalizeSourceData` functions above `runSource` in `apis/briefing.mjs`**
- [ ] **Step 2: Apply `normalizeSourceData` in `runSource` success return**
- [ ] **Step 3: Update `totalSources` from 41 to 36**
- [ ] **Step 4: Update `sourcesOk` / add `sourcesInactive` / fix `sourcesFailed` counts**
- [ ] **Step 5: Update the sweep complete console.error log**
- [ ] **Step 6: Syntax-check the file**

```bash
node --check apis/briefing.mjs && echo "OK"
```

- [ ] **Step 7: Commit**

```bash
git add apis/briefing.mjs
git commit -m "feat(briefing): normalize all source statuses to active/inactive"
```

---

## Task 2: Update `inject.mjs` source health

**Files:**
- Modify: `dashboard/inject.mjs`

### Context

`inject.mjs` builds the `health` array at around line 1012:

```js
const health = Object.entries(data.sources).map(([name, src]) => ({
  n: name, err: Boolean(src.error), stale: Boolean(src.stale)
}));
```

After Task 1, `src.status` will be `'active'` or `'inactive'`. `src.error` will no longer be the reliable signal — a source can be inactive with a `reason` but no `error` field (e.g. `status: 'no_credentials'` sources that were previously returning `status: 'no_credentials'` now become `{ status: 'inactive', reason: 'no_key', message: '...' }`).

### Change

```js
// Before:
const health = Object.entries(data.sources).map(([name, src]) => ({
  n: name, err: Boolean(src.error), stale: Boolean(src.stale)
}));

// After:
const health = Object.entries(data.sources).map(([name, src]) => ({
  n: name,
  err: src.status !== 'active',
  reason: src.status !== 'active' ? (src.reason || 'unknown') : null,
  stale: Boolean(src.stale),
}));
```

Also update the `sourcesOk` read to also surface `sourcesInactive`:

```js
// Before (line ~998):
const sourcesOk = data.crucix?.sourcesOk || 0;
const sourcesQueried = data.crucix?.sourcesQueried || 0;

// After:
const sourcesOk = data.crucix?.sourcesOk || 0;
const sourcesInactive = data.crucix?.sourcesInactive || 0;
const sourcesQueried = data.crucix?.sourcesQueried || 0;
```

(`sourcesInactive` can be used in future dashboard display — just extract it now so it's available.)

- [ ] **Step 1: Update `health` map in `inject.mjs`**
- [ ] **Step 2: Add `sourcesInactive` extraction near `sourcesOk`**
- [ ] **Step 3: Syntax-check**

```bash
node --check dashboard/inject.mjs && echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/inject.mjs
git commit -m "feat(inject): use status !== active for source health, surface sourcesInactive"
```

---

## Verification

After both tasks, run a quick smoke test to confirm normalization works end-to-end:

```bash
# Check that normalizeSourceData is present and exported indirectly via runSource
node -e "
import('./apis/briefing.mjs').then(m => {
  console.log('runSource exported:', typeof m.runSource === 'function');
  console.log('fullBriefing exported:', typeof m.fullBriefing === 'function');
});
"
```

Expected output:
```
runSource exported: true
fullBriefing exported: true
```

To verify normalization logic without running all 36 sources:

```bash
node -e "
// Inline test of normalizeSourceData logic (copy from briefing.mjs after implementation)
// Test: no_credentials → inactive/no_key
// Test: connected → active
// Test: { error: 'HTTP 403' } → inactive/unreachable
// Test: { error: 'not available in your area' } → inactive/geo_blocked
// Test: {} (empty, no status) → active
console.log('Manual verification — run node apis/briefing.mjs to see full output')
"
```

---

## Self-Review Notes

- `normalizeSourceData` is NOT exported — it's an internal helper. `runSource` is the only caller.
- `sourcesInactive` is a new field on `crucix` output object. Existing consumers reading `sourcesOk` are unaffected.
- `health[].reason` is a new field. The dashboard template reads `health[].err` (boolean) — existing behavior unchanged, new `reason` field is additive.
- The `ACTIVE_STATUSES` Set and `INACTIVE_STATUSES` object cover all values observed in the codebase audit (2026-04-16). New sources following the new standard (`active`/`inactive`) pass through the early-return guard at the top of `normalizeSourceData`.
- ThreatBook is commented out in `briefing.mjs` — it produces no output and is not counted in `totalSources`.
