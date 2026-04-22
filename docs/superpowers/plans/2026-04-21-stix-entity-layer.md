# Plan 2: Database + STIX 2.1 Entity Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 PostgreSQL 数据层 + STIX 2.1 实体规范化管道，将扫描采集的 CVE / IOC 数据转换为标准 STIX 对象持久化存储，为后续分析引擎和 API 层提供结构化情报基础。

**Spec:** `docs/superpowers/specs/2026-04-21-intelligence-product-design.md`（Layer 2：结构化实体层）

**Depends on:** Plan 1（Codebase Cleanup）完成 ✅

**Tech Stack:** Node.js 22 ESM，PostgreSQL + `pg`（node-postgres），`uuid`（UUIDv5），node:test（内置测试运行器），Express 5

---

## 文件变更总览

```
新增依赖：
  pg                              (node-postgres，PostgreSQL 客户端)
  uuid                            (UUIDv5，用于 STIX 确定性 ID 生成)

新建：
  migrations/001_init.sql         (STIX 表结构和索引)
  lib/db/index.mjs                (连接池创建 + query 辅助函数)
  lib/db/migrate.mjs              (迁移运行器，启动时执行)
  lib/stix/id.mjs                 (STIX 确定性 ID 生成，UUIDv5)
  lib/stix/objects.mjs            (stix_objects CRUD)
  lib/stix/relations.mjs          (stix_relations CRUD)
  lib/pipeline/scoring.mjs        (优先级评分 + IOC 衰减计算，纯函数)
  lib/pipeline/vulnerability.mjs  (CVE → STIX Vulnerability SDO)
  lib/pipeline/indicator.mjs      (IOC → STIX Indicator SDO + SCO)
  lib/pipeline/index.mjs          (管道编排器)
  test/stix-id.test.mjs           (STIX ID 生成测试)
  test/pipeline.test.mjs          (评分 + 规范化测试，无需 DB)

修改：
  package.json                    (添加 pg、uuid 依赖)
  crucix.config.mjs               (添加 database 配置块)
  .env.example                    (添加 DATABASE_URL, DB_POOL_MAX)
  server.mjs                      (启动时运行迁移，扫描后运行管道)
```

---

## 背景与约束

- **现有规范化层：** `lib/normalize/cve.mjs` 和 `lib/normalize/ioc.mjs` 已产出标准化内部格式，STIX 转换层建立在其之上（不修改现有规范化代码）。
- **无 DB 降级：** 若 `DATABASE_URL` 未配置，服务器正常启动，管道静默跳过（仅 log 警告），不影响现有扫描功能。
- **测试策略：** 评分和规范化函数为纯函数，无需 DB 即可测试。DB 相关测试在 `DATABASE_URL` 未设置时跳过。所有新测试使用 `node:test`（内置），不使用 `test/normalize.test.mjs` 中的自定义包装器。
- **STIX 命名空间：** `00abedb4-aa42-466c-9c01-fed23315a9b7`（STIX 2.1 官方 UUIDv5 命名空间）。
- **不修改：** `lib/normalize/` 下任何现有文件。

---

## Task 1：安装依赖 + DB 连接池

**Files:**
- Modify: `package.json`
- Create: `lib/db/index.mjs`
- Modify: `crucix.config.mjs`
- Modify: `.env.example`

- [ ] **Step 1：安装 npm 依赖**

```bash
npm install pg uuid
```

验证 `package.json` 的 `dependencies` 中出现 `pg` 和 `uuid`。

- [ ] **Step 2：创建 `lib/db/index.mjs`**

连接池工厂，懒创建（仅当 DATABASE_URL 配置时才建立连接）：

```javascript
// lib/db/index.mjs
import pg from 'pg';
import config from '../../crucix.config.mjs';

const { Pool } = pg;

let _pool = null;

/**
 * Get the PostgreSQL connection pool.
 * Returns null if DATABASE_URL is not configured.
 */
export function getPool() {
  if (_pool) return _pool;
  const url = config.database?.url;
  if (!url) return null;
  _pool = new Pool({
    connectionString: url,
    max: config.database?.poolMax ?? 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  _pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
  });
  return _pool;
}

/**
 * Execute a parameterized query.
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(sql, params = []) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured (DATABASE_URL missing)');
  return pool.query(sql, params);
}

/**
 * Close the pool (for graceful shutdown).
 */
export async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
```

- [ ] **Step 3：在 `crucix.config.mjs` 添加 database 块**

在 `llm` 块之前添加：

```javascript
database: {
  url: process.env.DATABASE_URL || null,
  poolMax: parseInt(process.env.DB_POOL_MAX) || 10,
},
```

- [ ] **Step 4：在 `.env.example` 添加 DB 变量**

在 LLM 配置块之前添加：

```bash
# PostgreSQL (required for STIX entity layer)
DATABASE_URL=postgresql://user:password@localhost:5432/crucix
DB_POOL_MAX=10
```

---

## Task 2：SQL 迁移文件 + 迁移运行器

**Files:**
- Create: `migrations/001_init.sql`
- Create: `lib/db/migrate.mjs`

- [ ] **Step 1：创建 `migrations/001_init.sql`**

包含三张核心表及其索引，所有语句使用 `IF NOT EXISTS` 保证幂等性：

```sql
-- migrations/001_init.sql
-- STIX 2.1 entity storage schema

-- Core STIX objects table (SDOs + SCOs)
CREATE TABLE IF NOT EXISTS stix_objects (
  id          BIGSERIAL PRIMARY KEY,
  type        TEXT        NOT NULL,
  stix_id     TEXT        NOT NULL UNIQUE,
  data        JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stix_objects_type
  ON stix_objects (type);

CREATE INDEX IF NOT EXISTS idx_stix_objects_priority_score
  ON stix_objects ((data->>'x_crucix_priority_score') DESC NULLS LAST)
  WHERE type = 'vulnerability';

CREATE INDEX IF NOT EXISTS idx_stix_objects_confidence
  ON stix_objects ((data->>'x_crucix_confidence_score') DESC NULLS LAST)
  WHERE type = 'indicator';

CREATE INDEX IF NOT EXISTS idx_stix_objects_data_gin
  ON stix_objects USING GIN (data);

-- STIX Relationship Objects (SROs)
CREATE TABLE IF NOT EXISTS stix_relations (
  id                  BIGSERIAL PRIMARY KEY,
  source_ref          TEXT        NOT NULL,
  target_ref          TEXT        NOT NULL,
  relationship_type   TEXT        NOT NULL,
  confidence          REAL        NOT NULL DEFAULT 1.0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_ref, target_ref, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_stix_relations_source
  ON stix_relations (source_ref);

CREATE INDEX IF NOT EXISTS idx_stix_relations_target
  ON stix_relations (target_ref);

-- NLP extraction pending review queue
CREATE TABLE IF NOT EXISTS nlp_pending (
  id                BIGSERIAL PRIMARY KEY,
  source_text       TEXT,
  candidate_object  JSONB       NOT NULL,
  confidence        REAL        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nlp_pending_status
  ON nlp_pending (status, confidence DESC);

-- Migration version tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT        PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2：创建 `lib/db/migrate.mjs`**

读取并按序执行 `migrations/` 目录下的 SQL 文件，已执行的版本跳过：

```javascript
// lib/db/migrate.mjs
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, getPool } from './index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../');
const MIGRATIONS_DIR = join(ROOT, 'migrations');

export async function runMigrations() {
  const pool = getPool();
  if (!pool) {
    console.warn('[DB] DATABASE_URL not configured — skipping migrations');
    return;
  }

  // Ensure migrations table exists (bootstrap)
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT        PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = file.replace('.sql', '');
    const applied = await query(
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      [version]
    );
    if (applied.rowCount > 0) continue;

    console.log(`[DB] Applying migration: ${file}`);
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    await query(sql);
    await query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    console.log(`[DB] Migration applied: ${file}`);
  }
}
```

---

## Task 3：STIX ID 生成模块

**Files:**
- Create: `lib/stix/id.mjs`

- [ ] **Step 1：创建 `lib/stix/id.mjs`**

使用 `uuid` 包的 `v5` 函数生成确定性 STIX ID：

```javascript
// lib/stix/id.mjs
import { v5 as uuidv5 } from 'uuid';

/**
 * STIX 2.1 official UUIDv5 namespace.
 * Source: STIX 2.1 spec section 2.9
 */
export const STIX_NAMESPACE = '00abedb4-aa42-466c-9c01-fed23315a9b7';

/**
 * Generate a deterministic STIX 2.1 ID.
 * Same inputs always produce the same ID (idempotent upserts).
 *
 * @param {string} type - STIX object type (e.g., 'vulnerability', 'indicator')
 * @param {...string} parts - Unique identifying parts (e.g., CVE ID, IOC value)
 * @returns {string} - STIX ID in format "type--{uuidv5}"
 */
export function stixId(type, ...parts) {
  const name = parts.join(':');
  return `${type}--${uuidv5(name, STIX_NAMESPACE)}`;
}
```

**预期行为（测试会验证）：**
- `stixId('vulnerability', 'CVE-2024-1234')` → 总是返回相同字符串
- `stixId('vulnerability', 'CVE-2024-1234')` ≠ `stixId('vulnerability', 'CVE-2024-5678')`
- 返回值格式：`vulnerability--xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

---

## Task 4：STIX CRUD 层

**Files:**
- Create: `lib/stix/objects.mjs`
- Create: `lib/stix/relations.mjs`

- [ ] **Step 1：创建 `lib/stix/objects.mjs`**

```javascript
// lib/stix/objects.mjs

/**
 * Upsert a STIX object into stix_objects.
 * Conflict on stix_id: update data + updated_at.
 * @param {object} pool - pg Pool instance
 * @param {object} stixObj - STIX object with .id and .type fields
 * @returns {Promise<void>}
 */
export async function upsertObject(pool, stixObj) {
  await pool.query(
    `INSERT INTO stix_objects (type, stix_id, data)
     VALUES ($1, $2, $3)
     ON CONFLICT (stix_id) DO UPDATE
       SET data = EXCLUDED.data,
           updated_at = now()`,
    [stixObj.type, stixObj.id, stixObj]
  );
}

/**
 * Get a STIX object by its STIX ID.
 * @param {object} pool
 * @param {string} stixId - e.g., "vulnerability--uuid"
 * @returns {Promise<object|null>}
 */
export async function getObjectById(pool, stixId) {
  const result = await pool.query(
    'SELECT data FROM stix_objects WHERE stix_id = $1',
    [stixId]
  );
  return result.rows[0]?.data ?? null;
}

/**
 * Query STIX objects with optional filters.
 * @param {object} pool
 * @param {object} opts
 * @param {string}  opts.type         - Filter by STIX type
 * @param {number}  [opts.limit=20]   - Result page size
 * @param {number}  [opts.offset=0]   - Result page offset
 * @param {number}  [opts.minScore]   - Min x_crucix_priority_score (vulnerabilities)
 * @returns {Promise<object[]>}
 */
export async function queryObjects(pool, { type, limit = 20, offset = 0, minScore } = {}) {
  const params = [type, limit, offset];
  let sql = `SELECT data FROM stix_objects WHERE type = $1`;
  if (minScore != null) {
    sql += ` AND (data->>'x_crucix_priority_score')::float >= $${params.length + 1}`;
    params.push(minScore);
  }
  sql += ` ORDER BY updated_at DESC LIMIT $2 OFFSET $3`;
  const result = await pool.query(sql, params);
  return result.rows.map(r => r.data);
}
```

- [ ] **Step 2：创建 `lib/stix/relations.mjs`**

```javascript
// lib/stix/relations.mjs

/**
 * Upsert a STIX relationship (SRO).
 * Conflict on (source_ref, target_ref, relationship_type): DO NOTHING.
 */
export async function upsertRelation(pool, { sourceRef, targetRef, relationshipType, confidence = 1.0 }) {
  await pool.query(
    `INSERT INTO stix_relations (source_ref, target_ref, relationship_type, confidence)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source_ref, target_ref, relationship_type) DO NOTHING`,
    [sourceRef, targetRef, relationshipType, confidence]
  );
}

/**
 * Get all relations where the given STIX ID appears as source or target.
 * @param {object} pool
 * @param {string} stixId
 * @returns {Promise<object[]>}
 */
export async function getRelations(pool, stixId) {
  const result = await pool.query(
    `SELECT source_ref, target_ref, relationship_type, confidence, created_at
     FROM stix_relations
     WHERE source_ref = $1 OR target_ref = $1`,
    [stixId]
  );
  return result.rows;
}
```

---

## Task 5：优先级评分模块（纯函数）

**Files:**
- Create: `lib/pipeline/scoring.mjs`

- [ ] **Step 1：创建 `lib/pipeline/scoring.mjs`**

实现 Spec 中定义的三个评分公式，全部为纯函数（无 I/O，无副作用）：

```javascript
// lib/pipeline/scoring.mjs

/**
 * IOC type half-lives in days for confidence decay.
 * Source: intelligence-product-design.md Layer 2 spec
 */
export const IOC_HALF_LIVES = {
  'ipv4-addr':   7,
  'ipv6-addr':   7,
  'url':        14,
  'domain-name': 30,
  'file':        90,
  'email-addr':  30,
};

/**
 * Calculate CVE priority score (0–1).
 * Formula: CVSS×0.30 + EPSS×0.30 + KEV×0.20 + PoC×0.10 + crossSource×0.10
 *
 * @param {object} cve - Normalized CVE object from lib/normalize/cve.mjs
 * @returns {number} - Score in [0, 1]
 */
export function cvePriorityScore(cve) {
  const cvss = ((cve.cvss?.v3 ?? cve.cvss?.v2) ?? 0) / 10;  // normalize 0–10 → 0–1
  const epss = cve.epss?.score ?? 0;                          // already 0–1
  const kev = cve.kev ? 1 : 0;
  const poc = cve.pocAvailable ? 1 : 0;
  const crossSource = Math.min((cve.sources?.length ?? 0) / 5, 1);  // saturates at 5 sources

  return Math.min(1, cvss * 0.30 + epss * 0.30 + kev * 0.20 + poc * 0.10 + crossSource * 0.10);
}

/**
 * Exponential decay factor for IOC confidence.
 * At t=0: 1.0; at t=halfLife: 0.5; at t=2*halfLife: 0.25
 *
 * @param {string} iocType - STIX SCO type (e.g., 'ipv4-addr')
 * @param {number} lastSeenMs - Timestamp of last observation (ms since epoch)
 * @param {number} [nowMs] - Current time (ms since epoch); defaults to Date.now()
 * @returns {number} - Decay factor in (0, 1]
 */
export function iocDecayFactor(iocType, lastSeenMs, nowMs = Date.now()) {
  const halfLife = IOC_HALF_LIVES[iocType] ?? 30;
  const days = Math.max(0, (nowMs - lastSeenMs) / 86_400_000);
  return Math.pow(0.5, days / halfLife);
}

/**
 * Calculate IOC confidence score (0–1).
 * Formula: sourceAuth×0.40 + decay×0.30 + sourceCount×0.20 + fprQuality×0.10
 *
 * @param {object} ioc - Normalized IOC object from lib/normalize/ioc.mjs
 * @param {number} [nowMs] - Current time override (for testing)
 * @returns {number} - Score in [0, 1]
 */
export function iocConfidenceScore(ioc, nowMs = Date.now()) {
  // Source authority: use raw confidence field (0–100 scale → 0–1)
  const sourceAuth = (ioc.confidence ?? 50) / 100;

  // Decay factor based on IOC type half-life
  const decay = iocDecayFactor(ioc.type, new Date(ioc.lastSeen).getTime(), nowMs);

  // Source count breadth (saturates at 5 independent sources)
  const sourceCount = Math.min((ioc.sources?.length ?? 1) / 5, 1);

  // False positive quality (lower FPR = higher quality)
  const fprQuality = 1 - (ioc.falsePositiveRate ?? 0);

  return Math.min(1, Math.max(0,
    sourceAuth * 0.40 + decay * 0.30 + sourceCount * 0.20 + fprQuality * 0.10
  ));
}

/**
 * Determine IOC lifecycle state based on decay factor.
 *
 * @param {object} ioc - Normalized IOC object
 * @param {number} [nowMs] - Current time override
 * @returns {'fresh'|'active'|'aging'|'stale'}
 */
export function iocLifecycleState(ioc, nowMs = Date.now()) {
  const decay = iocDecayFactor(ioc.type, new Date(ioc.lastSeen).getTime(), nowMs);
  if (decay > 0.80) return 'fresh';
  if (decay > 0.50) return 'active';
  if (decay > 0.25) return 'aging';
  return 'stale';
}
```

---

## Task 6：漏洞规范化器（CVE → STIX Vulnerability SDO）

**Files:**
- Create: `lib/pipeline/vulnerability.mjs`

- [ ] **Step 1：创建 `lib/pipeline/vulnerability.mjs`**

将 `normalizeCVE()` 输出转换为合规 STIX 2.1 Vulnerability SDO，附带 Crucix 扩展字段：

```javascript
// lib/pipeline/vulnerability.mjs
import { stixId } from '../stix/id.mjs';
import { cvePriorityScore } from './scoring.mjs';

/**
 * Convert a normalized CVE object to a STIX 2.1 Vulnerability SDO.
 * Input: output of normalizeCVE() from lib/normalize/cve.mjs
 * Output: STIX Vulnerability SDO with x_crucix_ extensions
 *
 * @param {object} cve - Normalized CVE
 * @returns {object} - STIX Vulnerability SDO
 */
export function toStixVulnerability(cve) {
  const now = new Date().toISOString();

  const externalRefs = [
    { source_name: 'cve', external_id: cve.id },
  ];
  if (cve.cnvdId) externalRefs.push({ source_name: 'cnvd', external_id: cve.cnvdId });
  if (cve.cnnvdId) externalRefs.push({ source_name: 'cnnvd', external_id: cve.cnnvdId });

  return {
    type: 'vulnerability',
    spec_version: '2.1',
    id: stixId('vulnerability', cve.id),
    name: cve.id,
    description: cve.description ?? null,
    created: cve.firstPublished ?? now,
    modified: cve.lastModified ?? now,
    external_references: externalRefs,

    // Crucix extensions
    x_crucix_cvss_score: cve.cvss?.v3 ?? cve.cvss?.v2 ?? null,
    x_crucix_epss_score: cve.epss?.score ?? null,
    x_crucix_epss_percentile: cve.epss?.percentile ?? null,
    x_crucix_kev_listed: cve.kev,
    x_crucix_exploit_public: cve.pocAvailable,
    x_crucix_poc_urls: cve.pocUrls ?? [],
    x_crucix_priority_score: cvePriorityScore(cve),
    x_crucix_sources: cve.sources ?? [],
    x_crucix_source_count: (cve.sources ?? []).length,
    x_crucix_patch_status: cve.patchAvailable ? 'available' : 'none',
    x_crucix_lifecycle: cve.lifecycle ?? 'published',
    x_crucix_attack_vector: cve.attackVector ?? null,
    x_crucix_vendors: cve.vendors ?? [],
    x_crucix_products: cve.products ?? [],
    x_crucix_attacker_kb_score: cve.attackerKbScore ?? null,
  };
}
```

---

## Task 7：IOC 规范化器（IOC → STIX Indicator SDO + SCO）

**Files:**
- Create: `lib/pipeline/indicator.mjs`

- [ ] **Step 1：创建 `lib/pipeline/indicator.mjs`**

将 `normalizeIOC()` 输出转换为 STIX Indicator SDO + 对应 SCO（可观测对象）：

```javascript
// lib/pipeline/indicator.mjs
import { stixId } from '../stix/id.mjs';
import { iocConfidenceScore, iocLifecycleState } from './scoring.mjs';

/** Build a STIX pattern string for the given IOC type and value. */
function buildStixPattern(type, value) {
  switch (type) {
    case 'ipv4-addr':   return `[ipv4-addr:value = '${value}']`;
    case 'ipv6-addr':   return `[ipv6-addr:value = '${value}']`;
    case 'domain-name': return `[domain-name:value = '${value}']`;
    case 'url':         return `[url:value = '${value}']`;
    case 'email-addr':  return `[email-message:sender_ref.value = '${value}']`;
    case 'file':        return buildFilePattern(value);
    default:            return `[${type}:value = '${value}']`;
  }
}

/** Build a STIX file hash pattern, detecting hash type by length. */
function buildFilePattern(hash) {
  const len = hash.length;
  if (len === 32)  return `[file:hashes.'MD5' = '${hash}']`;
  if (len === 40)  return `[file:hashes.'SHA-1' = '${hash}']`;
  if (len === 64)  return `[file:hashes.'SHA-256' = '${hash}']`;
  return `[file:hashes.'Unknown' = '${hash}']`;
}

/** Build the companion SCO for the IOC. */
function buildSco(type, value) {
  const base = { type, spec_version: '2.1', id: stixId(type, value) };
  switch (type) {
    case 'ipv4-addr':
    case 'ipv6-addr':
    case 'domain-name':
    case 'url':
    case 'email-addr':
      return { ...base, value };
    case 'file': {
      const len = value.length;
      const hashType = len === 32 ? 'MD5' : len === 40 ? 'SHA-1' : 'SHA-256';
      return { ...base, hashes: { [hashType]: value } };
    }
    default:
      return { ...base, value };
  }
}

/**
 * Convert a normalized IOC object to a STIX Indicator SDO + SCO pair.
 * Input: output of normalizeIOC() from lib/normalize/ioc.mjs
 *
 * @param {object} ioc - Normalized IOC
 * @param {number} [nowMs] - Current time override (for testing)
 * @returns {{ indicator: object, sco: object }}
 */
export function toStixIndicator(ioc, nowMs = Date.now()) {
  const now = new Date().toISOString();
  const confidenceScore = iocConfidenceScore(ioc, nowMs);
  const lifecycle = iocLifecycleState(ioc, nowMs);

  const indicator = {
    type: 'indicator',
    spec_version: '2.1',
    id: stixId('indicator', ioc.type, ioc.value),
    pattern_type: 'stix',
    pattern: buildStixPattern(ioc.type, ioc.value),
    valid_from: ioc.firstSeen ?? now,
    created: ioc.firstSeen ?? now,
    modified: ioc.lastSeen ?? now,
    indicator_types: ['malicious-activity'],

    // Crucix extensions
    x_crucix_confidence_score: confidenceScore,
    x_crucix_source_count: (ioc.sources ?? []).length,
    x_crucix_sources: ioc.sources ?? [],
    x_crucix_ioc_lifecycle: lifecycle,
    x_crucix_false_positive_rate: ioc.falsePositiveRate ?? null,
    x_crucix_last_seen: ioc.lastSeen ?? now,
    x_crucix_related_cves: ioc.relatedCVEs ?? [],
    x_crucix_related_actors: ioc.relatedActors ?? [],
    x_crucix_tags: ioc.tags ?? [],
    x_crucix_ioc_type: ioc.type,
    x_crucix_ioc_value: ioc.value,
  };

  const sco = buildSco(ioc.type, ioc.value);

  return { indicator, sco };
}
```

---

## Task 8：管道编排器

**Files:**
- Create: `lib/pipeline/index.mjs`

- [ ] **Step 1：创建 `lib/pipeline/index.mjs`**

协调扫描数据 → STIX 对象 → 持久化存储的完整流程：

```javascript
// lib/pipeline/index.mjs
import { normalizeCVE, deduplicateCVEs } from '../normalize/cve.mjs';
import { normalizeIOC, deduplicateIOCs } from '../normalize/ioc.mjs';
import { upsertObject } from '../stix/objects.mjs';
import { toStixVulnerability } from './vulnerability.mjs';
import { toStixIndicator } from './indicator.mjs';

/**
 * Run the STIX pipeline on sweep results.
 * Extracts CVEs and IOCs from sweepData, converts to STIX, and persists.
 *
 * sweepData shape (from apis/briefing.mjs):
 *   { cves: [{...normalized CVE}], iocs: [{...normalized IOC}], ... }
 *
 * @param {object|null} pool - pg Pool from lib/db/index.mjs (null = no-op)
 * @param {object} sweepData - Aggregated sweep result
 * @returns {Promise<{vulnerabilities: number, indicators: number, errors: string[]}>}
 */
export async function runPipeline(pool, sweepData) {
  if (!pool) {
    console.warn('[Pipeline] Database not configured — skipping STIX persistence');
    return { vulnerabilities: 0, indicators: 0, errors: [] };
  }

  const errors = [];
  let vulnCount = 0;
  let indicatorCount = 0;

  // --- Process CVEs ---
  const rawCves = sweepData?.cves ?? [];
  const cves = deduplicateCVEs(
    rawCves.map(c => (c.sources ? c : normalizeCVE(c, c._source ?? 'unknown'))).filter(Boolean)
  );

  for (const cve of cves) {
    try {
      const stixObj = toStixVulnerability(cve);
      await upsertObject(pool, stixObj);
      vulnCount++;
    } catch (err) {
      errors.push(`CVE ${cve.id}: ${err.message}`);
    }
  }

  // --- Process IOCs ---
  const rawIocs = sweepData?.iocs ?? [];
  const iocs = deduplicateIOCs(
    rawIocs.map(i => (i.sources ? i : normalizeIOC(i, i._source ?? 'unknown'))).filter(Boolean)
  );

  for (const ioc of iocs) {
    try {
      const { indicator, sco } = toStixIndicator(ioc);
      await upsertObject(pool, indicator);
      await upsertObject(pool, sco);
      indicatorCount++;
    } catch (err) {
      errors.push(`IOC ${ioc.value}: ${err.message}`);
    }
  }

  console.log(`[Pipeline] Persisted: ${vulnCount} vulnerabilities, ${indicatorCount} indicators, ${errors.length} errors`);
  if (errors.length > 0) {
    console.error('[Pipeline] Errors:', errors.slice(0, 5));
  }

  return { vulnerabilities: vulnCount, indicators: indicatorCount, errors };
}
```

**实现说明：**
- `sweepData.cves` 中的项若已经是 `normalizeCVE` 输出（有 `.sources` 字段），则直接使用；否则重新规范化
- 管道容错：单个对象失败不中止整批处理
- 当前 `sweepData` 格式需要查看 `apis/briefing.mjs` 的实际返回结构来调整；若结构不同，修改提取路径，不修改其他模块

---

## Task 9：server.mjs 集成

**Files:**
- Modify: `server.mjs`

- [ ] **Step 1：在 server.mjs 中引入并初始化 DB + 管道**

在文件顶部 import 区域（LLM provider 导入之后）添加：

```javascript
import { getPool } from './lib/db/index.mjs';
import { runMigrations } from './lib/db/migrate.mjs';
import { runPipeline } from './lib/pipeline/index.mjs';
```

- [ ] **Step 2：在服务器启动流程中运行迁移**

在 `app.listen(...)` 调用之前（或在现有启动异步代码中）添加：

```javascript
// Initialize database (graceful: skipped if DATABASE_URL not set)
const pool = getPool();
if (pool) {
  await runMigrations();
  console.log('[DB] Ready');
} else {
  console.warn('[DB] DATABASE_URL not set — entity layer disabled');
}
```

- [ ] **Step 3：在扫描周期完成后触发管道**

找到现有扫描结果处理点（通常在 briefing.mjs 执行完成后），添加：

```javascript
// Run STIX pipeline after each sweep
await runPipeline(pool, sweepData).catch(err =>
  console.error('[Pipeline] Unhandled error:', err.message)
);
```

- [ ] **Step 4：在 `/api/health` 端点添加 DB 状态**

在 `GET /api/health` 的响应对象中添加：

```javascript
db: pool ? 'connected' : 'not-configured',
```

- [ ] **Step 5：在关闭信号处理中关闭连接池**

在进程退出处理（`SIGTERM` / `SIGINT`）中添加：

```javascript
import { closePool } from './lib/db/index.mjs';
// ...在 shutdown 处理器中：
await closePool();
```

**实现说明：** 需要阅读 `server.mjs` 实际结构（启动逻辑、扫描触发点、健康端点）来确定准确的插入位置。上述代码片段是模板，以实际代码结构为准。

---

## Task 10：测试

**Files:**
- Create: `test/stix-id.test.mjs`
- Create: `test/pipeline.test.mjs`

所有测试使用 `node:test`（内置），不使用 `test/normalize.test.mjs` 中的自定义包装器。

- [ ] **Step 1：创建 `test/stix-id.test.mjs`**

```javascript
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
```

- [ ] **Step 2：创建 `test/pipeline.test.mjs`**

覆盖纯函数：评分、CVE→STIX、IOC→STIX（无 DB 依赖）：

```javascript
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
    sources: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],  // more than 5
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
  const halfLife = IOC_HALF_LIVES['ipv4-addr'];  // 7 days
  const now = Date.now();
  const past = now - halfLife * 86_400_000;
  const factor = iocDecayFactor('ipv4-addr', past, now);
  assert.ok(Math.abs(factor - 0.5) < 0.001, `Expected 0.5, got ${factor}`);
});

test('iocDecayFactor: at t=2*halfLife returns 0.25', () => {
  const halfLife = IOC_HALF_LIVES['domain-name'];  // 30 days
  const now = Date.now();
  const past = now - 2 * halfLife * 86_400_000;
  const factor = iocDecayFactor('domain-name', past, now);
  assert.ok(Math.abs(factor - 0.25) < 0.001, `Expected 0.25, got ${factor}`);
});

test('iocDecayFactor: file hash decays slowest (90 day half-life)', () => {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86_400_000;
  const ipFactor = iocDecayFactor('ipv4-addr', sevenDaysAgo, now);  // half-life 7 → 0.5
  const fileFactor = iocDecayFactor('file', sevenDaysAgo, now);     // half-life 90 → ~0.95
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
  const veryOld = now - 60 * 86_400_000;  // 60 days ago → well past IP half-life
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
  const hash = 'a'.repeat(64);  // 64 chars = SHA-256
  const ioc = {
    type: 'file', value: hash, confidence: 90,
    sources: ['MalwareBazaar'], tags: [], firstSeen: '2024-01-01T00:00:00Z',
    lastSeen: '2024-01-01T00:00:00Z', relatedCVEs: [], relatedActors: [],
  };
  const { indicator, sco } = toStixIndicator(ioc);

  assert.ok(indicator.pattern.includes("SHA-256"));
  assert.ok(sco.hashes?.['SHA-256']);
  assert.equal(sco.hashes['SHA-256'], hash);
});

test('toStixIndicator: indicator and SCO IDs are deterministic', () => {
  const ioc = {
    type: 'domain-name', value: 'evil.example.com', confidence: 75,
    sources: ['ThreatFox'], tags: [], firstSeen: '2024-01-01T00:00:00Z',
    lastSeen: '2024-01-10T00:00:00Z', relatedCVEs: [], relatedActors: [],
  };
  const { indicator: i1, sco: s1 } = toStixIndicator(ioc, Date.now());
  const { indicator: i2, sco: s2 } = toStixIndicator(ioc, Date.now());
  assert.equal(i1.id, i2.id);
  assert.equal(s1.id, s2.id);
});
```

- [ ] **Step 3：运行全部测试验证**

```bash
node --test test/**/*.test.mjs
```

预期：所有新测试通过，既有 `test/cleanup.test.mjs` 和 `test/normalize.test.mjs` 不受影响。

---

## 验收标准

- [ ] `npm install` 成功，`package.json` 新增 `pg` 和 `uuid` 依赖
- [ ] 所有新测试通过（`test/stix-id.test.mjs` + `test/pipeline.test.mjs`，共 ≥ 20 个测试用例）
- [ ] 既有测试（`test/cleanup.test.mjs`，`test/normalize.test.mjs`）无回归
- [ ] 服务器在无 `DATABASE_URL` 环境下正常启动（降级日志，不崩溃）
- [ ] `stixId('vulnerability', 'CVE-2024-1234')` 的返回值格式为 `vulnerability--<uuid>` 且幂等
- [ ] `toStixVulnerability()` 产出的对象包含所有 `x_crucix_` 扩展字段
- [ ] `toStixIndicator()` 为 IP / 域名 / URL / hash / email 各类型产出正确 STIX pattern
- [ ] `cvePriorityScore(perfectCVE)` ≈ 1.0，`iocDecayFactor(type, pastMs=halfLifeMs)` = 0.5
- [ ] `lib/db/migrate.mjs` 幂等：多次运行不报错、不重复创建表
