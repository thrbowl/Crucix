# Crucix 情报产品设计规格

**日期：** 2026-04-21  
**版本：** v1.0  
**状态：** 已确认，待实现

---

## 一、产品定位

**目标：** 将 Crucix Cybersecurity Edition 从自托管仪表板改造为 SaaS 网络安全情报分析平台。

**核心价值主张：** 提供安全情报的洞察与分析，而非简单的数据呈现。用户获得的是跨源关联后的结论与判断，而非原始数据聚合。

**目标用户：** 企业安全团队、SOC 分析师、安全研究员、AI 应用构建者（通过 API/MCP 集成情报）。

**市场定位：** 全球市场，无地域限制。核心差异化：中西双源覆盖 + AI 原生 MCP 接入 + STIX 2.1 标准输出。

**交付模式：** SaaS 订阅，用户通过 Web Dashboard、REST API 或 MCP Server 消费情报。不提供推送通知。

**数据范围：** 仅网络安全相关数据。移除地缘政治、供应链、经济指标、气象、卫星、市场等非安全数据源及相关代码。

---

## 二、总体架构

```
┌─────────────────────────────────────────────────────────┐
│  Layer 5: SaaS 基础设施                                   │
│  JWT Auth · Plan 管理 · 积分计量 · API Key 管理           │
├─────────────────────────────────────────────────────────┤
│  Layer 4: 交付层                                          │
│  REST API  │  MCP Server  │  Web Dashboard（全新设计）    │
├─────────────────────────────────────────────────────────┤
│  Layer 3: 分析引擎                                        │
│  A简报 · B实体画像 · C关联推断 · D趋势分析                │
│  E早期预警 · F攻击链溯源 · G防御优先级 · H置信度管理      │
├─────────────────────────────────────────────────────────┤
│  Layer 2: 结构化实体层                                    │
│  STIX 2.1 标准对象 + Crucix 扩展 + NLP 提取管道           │
├─────────────────────────────────────────────────────────┤
│  Layer 1: 数据采集层                                      │
│  49 个安全源（6 域）· 移除全部非安全源                    │
└─────────────────────────────────────────────────────────┘
```

---

## 三、Layer 1：数据采集层

### 保留内容

现有 49 个安全源全部保留，扫描引擎逻辑不变（15 分钟并行扫描，`Promise.allSettled`）。

**6 个域：**
- 域 1：漏洞情报（NVD / EPSS / CISA-KEV / VulnCheck / ExploitDB / OSV / CIRCL-CVE / GitHub Advisory）
- 域 2：威胁行为者与恶意软件（OTX / MalwareBazaar / ThreatFox / Feodo / ATT&CK STIX / VirusTotal / URLhaus / CIRCL-PDNS / Hybrid-Analysis / Malpedia）
- 域 3：攻击活动与暴露面（GreyNoise / Shodan / Censys / AbuseIPDB / Cloudflare Radar / Spamhaus / DShield / OpenPhish / Qianxin Hunter / FOFA / ZoomEye）
- 域 4：事件追踪与情报社区（Ransomware-Live / ENISA / CISA-Alerts / CERTs-Intl / Telegram / HackerNews RSS / BleepingComputer / SecurityWeek / Tavily）
- 域 5：中国情报源（CNCERT / CNVD / CNNVD / Qianxin TI / Qianxin TI v3 / Baidu Search / FreeBuf / Anquanke / 4hou）
- 域 6：厂商公告（Vendors-Intl 10 家 / Vendors-CN 7 家）

### 移除内容

当前仓库为 Cybersecurity Edition，非安全源文件可能已不存在于 `apis/sources/`。实施前需核查以下源文件是否仍存在，存在则删除，同时清理 `server.mjs`、`apis/briefing.mjs`、`dashboard/` 中的相关引用：

- 地缘政治：GDELT / ACLED / ReliefWeb / OpenSky / NASA FIRMS / Maritime AIS / ADS-B Exchange
- 经济金融：FRED / US Treasury / BLS / EIA / GSCPI / USAspending / UN Comtrade / Yahoo Finance
- 其他：NOAA/NWS / EPA RadNet / USPTO Patents / KiwiSDR / CelesTrak / Bluesky / Reddit / Safecast / OFAC / OpenSanctions

### 扩展机制

数据源模块化设计保持不变，新增源只需新建 `apis/sources/xxx.mjs` 并在 `briefing.mjs` 注册，无需修改其他层。

---

## 四、Layer 2：结构化实体层

### 数据模型

采用 **STIX 2.1 标准 + Crucix 自定义扩展**。标准字段遵循 STIX 规范，扩展字段使用 `x_crucix_` 前缀。

#### 标准 STIX 对象覆盖

| STIX 对象 | 对应实体 | 主要数据源 |
|-----------|---------|-----------|
| `vulnerability` | CVE 漏洞 | NVD / EPSS / CISA-KEV / VulnCheck |
| `threat-actor` | 威胁行为者 | ATT&CK STIX / OTX / Qianxin |
| `intrusion-set` | APT 组织 | ATT&CK STIX / Malpedia |
| `malware` | 恶意软件家族 | MalwareBazaar / Malpedia / ATT&CK |
| `indicator` | IOC 指标 | OTX / ThreatFox / AbuseIPDB / Feodo |
| `campaign` | 攻击活动 | ATT&CK STIX / Ransomware-Live / 厂商报告 |
| `attack-pattern` | ATT&CK TTP | ATT&CK STIX（直接导入） |
| `infrastructure` | C2 / 暴露资产 | FOFA / Shodan / ZoomEye / Feodo |
| `course-of-action` | 缓解措施 | CISA-Alerts / CERT 公告 |
| `report` | 安全公告 | 所有 RSS / CERT / 厂商 |

#### Crucix 扩展字段（示例）

```javascript
// Vulnerability 扩展
{
  type: "vulnerability",
  id: "vulnerability--<uuid>",
  name: "CVE-2024-XXXX",
  external_references: [{ source_name: "cve", external_id: "CVE-2024-XXXX" }],

  // Crucix 扩展
  x_crucix_epss_score: 0.94,
  x_crucix_cvss_score: 9.8,
  x_crucix_kev_listed: true,
  x_crucix_exploit_public: true,
  x_crucix_priority_score: 0.97,
  x_crucix_sources: ["NVD", "CISA-KEV", "VulnCheck", "ExploitDB"],
  x_crucix_source_count: 4,
  x_crucix_patch_status: "available" // available / partial / none
}

// Indicator 扩展
{
  type: "indicator",
  x_crucix_confidence_score: 0.85,
  x_crucix_source_count: 4,
  x_crucix_sources: ["OTX", "ThreatFox", "AbuseIPDB", "Feodo"],
  x_crucix_ioc_lifecycle: "active", // fresh / active / aging / stale
  x_crucix_false_positive_rate: 0.05
}
```

#### 自定义对象

```javascript
// Advisory（不在 STIX 标准内）
{
  type: "x-crucix-advisory",
  id: "x-crucix-advisory--<uuid>",
  title: "...",
  severity: "critical",
  source_org: "CISA",
  published: "2026-04-21T00:00:00Z",
  affected_products: ["Product A", "Product B"],
  object_refs: ["vulnerability--<uuid>"],
  recommended_actions: "..."
}
```

### NLP 提取管道

用于从非结构化文本（厂商博客、安全新闻、CERT 报告）中提取 STIX 实体和关系。

```
输入：RSS 文章全文 / 厂商报告正文
  ↓
LLM 实体抽取
  识别：CVE ID / Actor 名称 / Malware 家族 / IOC 值 / 关系动词
  ↓
生成候选 STIX 对象 + SRO（关系对象）
  ↓
置信度评分
  > 0.7  → 自动写入实体层
  0.4-0.7 → 写入 nlp_pending 表，管理后台可审核确认或拒绝
  < 0.4  → 丢弃
  ↓
写入 PostgreSQL
```

### 关系对象（SRO）

```
threat-actor  --[exploits]------> vulnerability
campaign      --[uses]----------> malware
malware       --[communicates-with]--> infrastructure
indicator     --[indicates]-----> malware / threat-actor
threat-actor  --[targets]-------> identity（行业/组织）
campaign      --[attributed-to]--> intrusion-set
```

### 优先级评分模型

```
CVE priority_score =
  CVSS × 0.30
  + EPSS × 0.30
  + KEV状态 × 0.20     (1 = 已收录, 0 = 未收录)
  + PoC公开 × 0.10     (1 = 已公开, 0 = 未公开)
  + 跨源引用归一化 × 0.10

IOC confidence_score =
  来源权威度 × 0.40
  + 来源数量归一化 × 0.30
  + 时效性衰减 × 0.20  (指数衰减，按 IOC 类型不同速率)
  + 历史误报率 × 0.10

ThreatActor activity_score =
  近30天 IOC 更新量 × 0.50
  + 近30天 Campaign 提及次数 × 0.50
```

### IOC 生命周期衰减速率

置信度按指数衰减，半衰期（confidence 降至初始值 50% 的天数）：

| IOC 类型 | 半衰期 | 原因 |
|---------|--------|------|
| IP 地址 | 7 天 | 攻击者换 IP 成本极低 |
| URL | 14 天 | 钓鱼/C2 URL 生命周期短 |
| 域名 | 30 天 | 域名注册成本较高，复用率高 |
| 文件 Hash | 90 天 | 文件本身不变，但恶意软件更新会产生新 Hash |

具体衰减系数在上线前通过历史数据校准，写入配置表。

### 存储方案

```
PostgreSQL
  stix_objects      (id, type, stix_id, data JSONB, created_at, updated_at)
  stix_relations    (id, source_ref, target_ref, relationship_type, confidence, created_at)
  nlp_pending       (id, source_text, candidate_object JSONB, confidence, status)

索引：
  stix_objects 上的 type、stix_id、(data->>'x_crucix_priority_score') 字段
  stix_relations 上的 source_ref、target_ref
  全文索引：tsvector on stix_objects.data
```

---

## 五、Layer 3：分析引擎

### 8 个分析维度

**A — 情境化威胁简报（定时生成）**
- 触发：每次扫描完成后
- 输入：当前周期内 priority_score 最高的实体
- 输出：`executive_summary` + `top_vulnerabilities[]` + `active_threat_actors[]` + `ioc_highlights` + `key_advisories[]`
- 存储为 `report` SDO，Free 用户仅可访问最新一份

**B — 威胁实体画像（按需，消耗积分）**
- 触发：用户查询
- 输入：目标 STIX 对象 + 一跳关联实体
- 输出：`stix_object` + `summary` + `risk_assessment` + `related_entities[]` + `recommended_actions[]` + `sources[]`
- 缓存 TTL：1 小时

**C — 跨源关联推断（自动 + 按需）**
- 自动模式：扫描后后台运行 NLP 管道，产出候选 SRO
- 按需模式：用户输入实体名称，返回图遍历结果 + LLM 叙述

**D — 趋势分析（定期生成）**
- CVE 利用速度趋势 / Actor 活跃度变化 / IOC 类型分布漂移 / 行业攻击集中度

**E — 早期预警信号（每次扫描后触发）**
- 信号组合规则驱动（可配置，规则存入 DB）
- 示例：PoC 公开 + EPSS 突升 + Actor 近期活跃 → "CVE-XXXX 进入高危窗口，预计 72h 内出现野外利用"
- 写入 alerts 表，Dashboard SSE 推送给已连接用户（仅浏览器内实时，无外部推送）

**F — 攻击链溯源（按需，消耗积分）**
- 输入：一组 IOC 或 Campaign ID
- 输出：Kill Chain 各阶段 → ATT&CK 映射 → 归因置信度

**G — 防御优先级建议（每日生成）**
- P0/P1/P2 补丁优先级列表
- ATT&CK 技术检测覆盖缺口分析
- 高置信度 IOC 封锁清单

**H — 情报置信度管理（持续后台运行）**
- IOC 生命周期状态机转换
- 低于阈值自动降级，不再推入告警
- 置信度历史追踪

### LLM 调用策略

```
操作              调用时机        模型选择          成本控制
─────────────────────────────────────────────────────
简报生成          每次扫描        标准模型          批量合并送入
实体画像          按需            标准模型          TTL 1h 缓存
NLP 实体抽取      后台队列        轻量模型          批量文本合并
攻击链溯源        按需            强推理模型        积分门控
趋势分析          定期            标准模型          结果缓存
```

---

## 六、Layer 4：交付层

### REST API

**Base URL：** `https://api.crucix.io/v1`  
**认证：** `Authorization: Bearer <jwt_or_api_key>`

```
── 简报
GET  /briefings/latest
GET  /briefings?limit=&since=

── 实体（type: vulnerability / indicator / malware / threat-actor / campaign / report）
GET  /entities/{type}?filter=&sort=&page=
GET  /entities/{type}/{id}
GET  /entities/{type}/{id}/related?relationship_type=

── 情报查询
POST /lookup/ioc                { type, value }
GET  /lookup/cve/{cve_id}
POST /search                    { query, types[], page }

── 告警
GET  /alerts?severity=&since=

── Watchlist
GET  /watchlist
POST /watchlist                 { type, value, label }
DELETE /watchlist/{id}

── 分析任务（异步）
POST /analysis/chain            { iocs[], campaign_id? }
GET  /analysis/{job_id}

── TAXII 2.1（Ultra 专属）
GET  /taxii/collections
GET  /taxii/collections/{id}/objects?added_after=&limit=
```

**响应格式：**
```json
{
  "data": { ... },
  "meta": { "credits_consumed": 1, "credits_remaining": 299 },
  "stix_bundle": { ... }  // 实体查询时附带原始 STIX Bundle
}
```

### MCP Server

每个工具调用消耗对应积分，返回结构化数据 + 可读摘要。

```javascript
get_latest_briefing()
  → 最新简报，含 executive_summary + top entities

query_cve({ cve_id })
  → CVE 完整画像（消耗 5 积分）

query_threat_actor({ name })
  → Actor 画像（消耗 5 积分）

lookup_ioc({ type, value })
  → IOC 声誉（消耗 1 积分）

search_intelligence({ query, types? })
  → 跨实体语义搜索（消耗 2 积分）

get_related_entities({ stix_id, relationship_type? })
  → 关联图遍历（消耗 3 积分）

get_alerts({ severity?, since? })
  → 告警列表（消耗 1 积分）

reconstruct_attack_chain({ iocs?, campaign_id? })
  → Kill Chain 还原（消耗 20 积分）

get_defensive_priorities()
  → 今日防御优先级（消耗 5 积分）

get_trend_analysis({ entity_type, days? })
  → 趋势摘要（消耗 10 积分）
```

### Web Dashboard

全新设计，不复用现有 Jarvis HUD。界面风格参考专业安全情报产品（清晰、信息密度高、无装饰性动效）。

**功能区划：**
```
顶栏：全局搜索（实体名称 / CVE ID / IOC 值）+ 积分余额 + 账户菜单

左侧导航：
  ├── 简报中心       最新简报 + 历史列表
  ├── 情报态势       Stats Row + 预警流
  ├── 实体搜索       按类型浏览 + 全文搜索
  ├── 调查工作台     实体 pivot + 关联图可视化
  ├── Watchlist      监控项管理 + 告警记录
  ├── 源健康状态     49 源实时状态
  └── 账户 / 积分    用量统计 + 订阅管理

主内容区：
  根据左侧导航切换，无全局地图
```

UI 详细设计在独立 spec 中完成。

---

## 七、Layer 5：SaaS 基础设施

### 认证

```
初期：邮箱 + 密码（bcrypt 哈希）
JWT：Access Token（15min TTL）+ Refresh Token（30天 TTL，HttpOnly Cookie）
后续扩展：Auth.js 接入 WeChat / 手机号 / Google OAuth
```

### 订阅 Plan

```
┌──────────────┬─────────────┬─────────────┬─────────────────┐
│              │  Free       │  Pro        │  Ultra          │
├──────────────┼─────────────┼─────────────┼─────────────────┤
│ 积分重置周期 │  每天       │  每月       │  每月           │
│ 积分额度     │  待定       │  待定       │  待定           │
│ API 访问     │  ✅         │  ✅         │  ✅             │
│ MCP 访问     │  ✅         │  ✅         │  ✅             │
│ 简报访问     │  仅最新     │  全历史     │  全历史         │
│ 实体查询     │  基础字段   │  完整画像   │  完整画像       │
│ LLM 分析     │  ❌         │  ✅         │  ✅             │
│ 攻击链溯源   │  ❌         │  ✅         │  ✅             │
│ TAXII 导出   │  ❌         │  ❌         │  ✅             │
│ Watchlist 数 │  3 条       │  20 条      │  无限           │
│ API Key 数   │  1 个       │  5 个       │  无限           │
└──────────────┴─────────────┴─────────────┴─────────────────┘
```

积分具体额度在 LLM 成本测算后确定，写入数据库 `plans` 表，不硬编码。

### 积分消耗表

| 操作 | 消耗（积分）|
|------|------------|
| 简报读取 | 1 |
| IOC 声誉查询 | 1 |
| CVE / 实体基础查询 | 1 |
| 告警列表 | 1 |
| 全文 / 语义搜索 | 2 |
| 关联实体图遍历 | 3 |
| 实体完整画像（含 LLM）| 5 |
| 防御优先级建议 | 5 |
| 趋势分析 | 10 |
| 攻击链溯源（异步任务）| 20 |

消耗值写入配置表，可动态调整。

### 数据库核心表

```sql
-- 用户与认证
users          (id, email, password_hash, created_at, email_verified)
refresh_tokens (id, user_id, token_hash, expires_at, revoked)

-- 订阅与积分
plans          (id, name, credit_amount, reset_period, features JSONB)
subscriptions  (id, user_id, plan_id, current_credits, period_start, period_end, status)
credit_log     (id, user_id, api_key_id, operation, amount, created_at)

-- API Key
api_keys       (id, user_id, key_hash, name, last_used_at, revoked, created_at)

-- Watchlist
watchlists     (id, user_id, type, value, label, created_at)

-- 情报实体（Layer 2）
stix_objects   (id, type, stix_id, data JSONB, created_at, updated_at)
stix_relations (id, source_ref, target_ref, relationship_type, confidence, created_at)
nlp_pending    (id, source_text, candidate_object JSONB, confidence, status)

-- 告警
alerts         (id, type, severity, title, entity_ref, signal_data JSONB, created_at)

-- 分析任务
analysis_jobs  (id, user_id, type, input JSONB, status, result JSONB, created_at)
```

### API Key 管理

```
每个用户可创建多个 Key（按 Plan 限制数量）
Key 格式：crx_<随机32字节十六进制>
存储：仅存 SHA-256 哈希，明文仅在创建时展示一次
调用消耗同一积分池
可单独命名、吊销
```

---

## 八、移除清单

以下现有代码在改造中完整移除，不保留兼容层：

### 非安全数据源（`apis/sources/` 中删除）
- gdelt.mjs / opensky.mjs / nasa-firms.mjs / maritime.mjs / adsb.mjs
- fred.mjs / us-treasury.mjs / bls.mjs / eia.mjs / gscpi.mjs / usaspending.mjs / comtrade.mjs / yfinance.mjs
- noaa.mjs / epa-radnet.mjs / uspto.mjs / kiwisdr.mjs / space.mjs
- safecast.mjs / ofac.mjs / opensanctions.mjs / reddit.mjs

### 推送通道（完整删除）
- `lib/alerts/telegram.mjs`
- `lib/alerts/discord.mjs`
- 所有 Telegram Bot 轮询逻辑
- 所有 Discord Bot / Webhook 逻辑
- `server.mjs` 中的 Bot 初始化与命令处理代码

### 现有 Dashboard
- `dashboard/public/jarvis.html`（全新 UI 替代，不保留）
- `dashboard/inject.mjs` 中与非安全源相关的注入逻辑

---

## 九、实现约束

- **技术栈保持**：Node.js ESM，Express（保留，不迁移），PostgreSQL 新增
- **无新增非必要依赖**：SaaS 层优先使用 Supabase（Auth + DB）或自建最小认证，不引入重型框架
- **分阶段交付**：Layer 1 清理 → Layer 2 实体管道 → Layer 5 Auth → Layer 4 API → Layer 3 分析引擎 → UI
- **积分额度**：上线前根据 LLM 成本测算确定，写入 `plans` 表
- **UI 设计**：在单独 spec 中完成，本文档不包含 UI 细节

---

## 十、待确认事项

- 各 Plan 的具体积分额度（需成本测算后定价）
- UI 设计语言与风格（单独 spec）
- 未来新增数据源优先级（架构已预留接入口）
- TAXII 2.1 的具体实现时机（Ultra 计划功能，可后置）
