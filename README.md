# Crucix — 全域威胁情报分析系统

实时聚合 49 个 OSINT 数据源，自动关联 CVE/IOC/威胁组织/攻击活动，生成结构化情报简报和威胁态势评估。

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        数据采集层 (49 Sources)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐│
│  │漏洞情报(8)│ │威胁行为体 │ │攻击活动  │ │事件追踪  │ │中国情报 ││
│  │NVD/CISA/ │ │OTX/VT/   │ │Shodan/   │ │CISA/ENISA│ │CNVD/   ││
│  │EPSS/KEV  │ │MalwareBa-│ │GreyNoise/│ │CERTs/CERT│ │奇安信/  ││
│  │ExploitDB │ │zaar/ATT&CK│ │AbuseIPDB │ │Telegram  │ │FreeBuf ││
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘│
│       └─────────────┴────────────┴────────────┴────────────┘    │
│                              │ Promise.allSettled() 30s timeout  │
│                              ▼                                    │
│                     fullBriefing() 原始数据                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                        数据合成层                                │
│                                                                  │
│   synthesize()                                                   │
│   ├── computeThreatLevel()  威胁指数评分 (0-100)                 │
│   ├── buildCVEList()        CVE 去重合并 (NVD+EPSS+KEV+ExploitDB)│
│   ├── buildIOCs()           IOC 分类 (malware/C2/IP/phishing)   │
│   ├── buildAttackMatrix()   ATT&CK 战术矩阵                     │
│   ├── buildActors()         勒索组织/APT追踪                     │
│   ├── buildGeoAttacks()     地理攻击可视化 (78国坐标映射)         │
│   ├── buildCertAlerts()     CERT 告警聚合                        │
│   ├── buildSecurityNews()   安全资讯聚合                         │
│   └── generateIdeas()       信号驱动洞察生成                     │
│                                                                  │
│   输出: V2 结构化仪表盘数据                                      │
└──────────┬───────────────────┬───────────────────┬──────────────┘
           │                   │                   │
           ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   增量引擎        │ │   数据管道        │ │   SSE 实时推流    │
│                  │ │                  │ │                  │
│ computeDelta()   │ │ runPipeline()    │ │ /events          │
│ ├── 14 原子信号   │ │ ├── CVE→STIX     │ │ 告警/数据更新    │
│ ├── 4 交叉关联    │ │ ├── IOC→STIX     │ │ 广播到浏览器      │
│ └── Z-Score 趋势 │ │ └── 评分入库      │ │                  │
│                  │ │                  │ │                  │
│ MemoryManager    │ │ PostgreSQL       │ │ EventSource      │
│ ├── 5 次热存储    │ │ stix_objects     │ │                  │
│ ├── 冷归档       │ │ stix_relations   │ │                  │
│ ├── CVE 生命周期  │ │ analysis_jobs    │ │                  │
│ └── IOC 去重     │ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
           │                   │                   │
           └───────────────────┴───────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                        业务 API 层                               │
│                                                                  │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│   │ /briefings│ │ /entities│ │ /lookup  │ │ /search  │         │
│   │ 简报生成  │ │ STIX实体 │ │ IOC/CVE  │ │ 全文搜索  │         │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│   │ /alerts  │ │/watchlist│ │ /analysis│ │ /taxii   │         │
│   │ 告警列表  │ │ 监视列表 │ │ 攻击链   │ │ STIX分发 │         │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
│                                                                  │
│   积分系统 (credits) ─── 订阅计划 ─── 额度控制                   │
│   认证系统 (JWT + httpOnly Cookie) ─── 双层守卫                  │
└──────────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                        前端仪表盘                                │
│                                                                  │
│   简报中心 │ 威胁态势 │ 实体搜索 │ 工作台 │ 监视列表 │ 源健康   │
│                                                                  │
│   shell.js (统一导航) + auth.js (JWT 认证)                       │
│   Tailwind CSS + Material Symbols                                │
└──────────────────────────────────────────────────────────────────┘
```

## 数据源矩阵 (49 Sources)

### Domain 1: 漏洞情报 (8)

| 源 | 数据类型 | 认证 |
|---|---|---|
| CISA KEV | 已知被利用漏洞目录 | 无 |
| NIST NVD | CVE / CVSS / 影响产品 | API Key (可选) |
| FIRST EPSS | 漏洞利用概率预测 | 无 |
| GitHub Advisory | 开源漏洞 | Token (可选) |
| ExploitDB | PoC 漏洞利用 | 无 (RSS) |
| OSV | npm/PyPI/Go 包漏洞 | 无 |
| VulnCheck KEV | 已利用 CVE + 勒索关联 | API Key |
| CIRCL CVE | CVE 补充源 | 无 |

### Domain 2: 威胁行为体与恶意软件 (10)

| 源 | 数据类型 | 认证 |
|---|---|---|
| AlienVault OTX | 威胁 Pulse / IOC / APT | API Key |
| MalwareBazaar | 恶意样本 / 哈希 / 家族 | API Key (可选) |
| ThreatFox | IOC (IP/域名/URL/哈希) | API Key (可选) |
| Feodo Tracker | 僵尸网络 C2 | 无 |
| MITRE ATT&CK | 战术/技术/组织/软件 (STIX) | 无 |
| VirusTotal | 威胁分类概览 | API Key |
| URLhaus | 恶意 URL | API Key (可选) |
| CIRCL Passive DNS | 域名解析历史 | 无 |
| Hybrid Analysis | 沙箱行为 IOC | API Key |
| Malpedia | 恶意软件家族库 | API Key (可选) |

### Domain 3: 攻击活动与暴露面 (8)

| 源 | 数据类型 | 认证 |
|---|---|---|
| GreyNoise | 互联网扫描 IP 分类 | API Key |
| Shodan | 暴露服务/端口/漏洞 | API Key |
| AbuseIPDB | IP 信誉/滥用报告 | API Key |
| Cloudflare Radar | 网络中断/DDoS/流量异常 | API Token |
| Spamhaus DROP | 被劫持 IP 段黑名单 | 无 |
| OpenPhish | 活跃钓鱼 URL | 无 |
| DShield | 蜜罐攻击数据 | 无 |
| Censys | 互联网资产暴露 | API Key |

### Domain 4: 事件追踪与安全社区 (9)

| 源 | 数据类型 | 认证 |
|---|---|---|
| Ransomware.live | 勒索受害者/组织/行业 | 无 |
| ENISA | 安全报告 | 无 (RSS) |
| CISA Alerts | ICS 告警/漏洞告警 | 无 (RSS) |
| 多 CERT 聚合 | US-CERT/JPCERT/NCSC 等 | 无 (RSS) |
| Telegram OSINT | 冲突/地缘/情报帖 | Bot Token (可选) |
| The Hacker News | 安全新闻 | 无 (RSS) |
| BleepingComputer | 安全新闻 | 无 (RSS) |
| SecurityWeek | 安全分析 | 无 (RSS) |
| Tavily AI Search | AI 情报扫描 | API Key |

### Domain 5: 中国情报 (11)

| 源 | 数据类型 | 认证 |
|---|---|---|
| CNCERT | 国家安全告警 | 无 |
| CNVD | 中国漏洞库 | API Key (可选) |
| CNNVD | 中国漏洞库 (备用) | Token (可选) |
| 奇安信威胁情报 | APT 组织/恶意软件/IOC | API Key |
| 奇安信 Hunter | 互联网资产暴露 | API Key |
| 百度搜索 | 中文安全新闻 | API Key |
| FOFA | 互联网资产搜索 | Email + API Key |
| ZoomEye | 互联网资产搜索 | API Key |
| FreeBuf | 安全社区文章 | 无 (RSS) |
| 安全客 | 安全社区文章 | 无 (RSS) |
| 嘶吼 | 安全社区文章 | 无 (RSS) |

### Domain 6: 厂商公告 (2 聚合器, 17 源)

| 聚合器 | 覆盖厂商 |
|---|---|
| 国际厂商 | Microsoft, Cisco Talos, Palo Alto, CrowdStrike, Mandiant, ESET, Kaspersky, IBM X-Force, Check Point, Rapid7 |
| 国内厂商 | 360 CERT, 绿盟, 腾讯 TSRC, 华为 PSIRT, 长亭, 深信服, 安天 |

## 洞察维度

### 威胁指数 (Threat Index)

`computeThreatLevel()` 综合以下维度打分 (0-100):

| 维度 | 权重因子 | 数据源 |
|---|---|---|
| KEV 已利用漏洞数 | 高 | CISA KEV + VulnCheck |
| Critical CVE 数量 | 高 | NVD + EPSS |
| C2 基础设施数量 | 中 | Feodo + ThreatFox |
| 恶意样本量 | 中 | MalwareBazaar |
| 勒索受害者数 | 中 | Ransomware.live |
| 恶意 IP 数量 | 低 | AbuseIPDB + GreyNoise |
| 钓鱼 URL 数量 | 低 | URLhaus + OpenPhish |

映射为四级: `CRITICAL` (>80) → `HIGH` (>60) → `ELEVATED` (>40) → `LOW`

### 三层信号检测

增量引擎 `computeDelta()` 实现三层信号模型:

**Layer 1 — 原子信号 (14 个)**

| 信号 | 数据源 | 默认级别 |
|---|---|---|
| new_critical_cves | NVD + EPSS | HIGH |
| new_kev_entries | CISA KEV + VulnCheck | CRITICAL |
| epss_spike | EPSS | MEDIUM |
| poc_published | ExploitDB | HIGH |
| osv_critical | OSV | MEDIUM |
| new_malware_samples | MalwareBazaar | MEDIUM |
| active_c2 | Feodo + ThreatFox | HIGH |
| apt_techniques | ATT&CK STIX | MEDIUM |
| mass_scanning | GreyNoise + DShield | MEDIUM |
| ip_reputation_alerts | AbuseIPDB | MEDIUM |
| ransomware_victims | Ransomware.live | HIGH |
| cert_advisories | CISA + ENISA + CERTs | MEDIUM |
| china_alerts | CNCERT + CNVD + CNNVD | MEDIUM |
| sources_ok | 全部源 | (反向指标) |

**Layer 2 — 交叉关联规则 (4 条)**

| 规则 | 触发条件 | 级别 |
|---|---|---|
| 漏洞武器化 | 高危 CVE + (PoC 或 主动扫描) | CRITICAL |
| 定向攻击基础设施 | AbuseIPDB + (ThreatFox 或 Feodo C2) | HIGH |
| 供应链攻击 | GitHub Advisory + (OSV 或 安全新闻) | HIGH |
| 中国高置信度 | CNCERT + (CNVD/CNNVD) + (奇安信) | CRITICAL |

**Layer 3 — 趋势异常**

Z-Score 检测 (|z| >= 2.0 触发, |z| >= 3.0 标记 HIGH)，基于最近 30 次扫描的历史数据。

### CVE 生命周期追踪

```
discovered ──→ kev ──→ poc
    │            │       │
    └────────────┴───────┘
         MemoryManager 自动追踪
         保留 90 天历史
```

每个 CVE 记录首次发现时间、KEV 入库时间、PoC 发布时间，用于评估漏洞从披露到武器化的时间窗口。

### IOC 置信度评分

`iocConfidenceScore` 四因子模型:

| 因子 | 权重 | 说明 |
|---|---|---|
| 源权威性 | 0.4 | 政府 CERT > 商业平台 > 社区 RSS |
| 交叉验证 | 0.3 | 被多个独立源确认 |
| 时效衰减 | 0.2 | 指数衰减，半衰期 30 天 |
| 误报质量 | 0.1 | 源的历史误报率 |

IOC 生命周期状态: `fresh` → `active` → `aging` → `stale`

## 数据模型

### STIX 2.1 实体类型

系统使用 STIX (Structured Threat Information Expression) 2.1 标准作为核心数据模型:

```
vulnerability ──────┐
indicator ──────────┤
malware ────────────┤
threat-actor ───────┤── stix_objects (PostgreSQL)
campaign ───────────┤     + x_crucix_* 扩展属性
report ─────────────┤
attack-pattern ─────┤
intrusion-set ──────┤
infrastructure ─────┤
course-of-action ───┤
identity ───────────┘
        │
        ▼
   stix_relations
   (source_ref → target_ref)
```

扩展属性 (`x_crucix_*`):
- **Vulnerability**: `cvss`, `epss`, `in_kev`, `has_poc`, `priority_score`, `vendors`
- **Indicator**: `confidence_score`, `ioc_lifecycle`, `decay_factor`, `source_auth`, `cross_validation_count`

### 数据流

```
49 OSINT 源 (并行 30s 超时)
    │
    ▼ fullBriefing()
原始 sweep JSON (runs/latest.json)
    │
    ├──▶ synthesize() ──▶ V2 仪表盘数据 ──▶ SSE 推流到浏览器
    │
    ├──▶ runPipeline() ──▶ STIX 规范化 + 评分 ──▶ PostgreSQL 持久化
    │
    └──▶ MemoryManager ──▶ computeDelta() ──▶ 威胁指数 + 信号
                              │
                              └──▶ 告警 + 报告 + 洞察
```

## 功能依赖关系

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  简报中心    │────▶│  威胁态势    │────▶│  实体搜索    │
│ /index.html │     │ /briefing   │     │ /search     │
│             │     │             │     │             │
│ SSE 实时流   │     │ Delta 引擎   │     │ JSONB 全文   │
│ 威胁指数     │     │ 原子信号     │     │ STIX 类型过滤│
│ 情报简报     │     │ 交叉关联     │     │ DB+内存双层  │
│ 活跃源状态   │     │ 趋势异常     │     │             │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                           │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  工作台      │◀────│  IOC/CVE    │
                    │ /workbench  │     │  查询结果    │
                    │             │     └─────────────┘
                    │ 关系图谱     │
                    │ STIX 关系    │     ┌─────────────┐
                    │ 攻击链分析   │◀────│  监视列表    │
                    └─────────────┘     │ /watchlist  │
                                        │             │
                                        │ 厂商/组织/   │
                                        │ 关键词/IP段  │
                                        │ 自动匹配     │
                                        └──────┬──────┘
                                               │
                    ┌─────────────┐             │
                    │  账户管理    │             │
                    │ /account    │◀────────────┘
                    │             │
                    │ 积分余额     │
                    │ 订阅计划     │
                    │ API Key 管理 │
                    └─────────────┘

        ┌─────────────┐     ┌─────────────────────────┐
        │  源健康状态   │     │  外部集成                │
        │ /sources    │     │ /api/taxii ──▶ SIEM/EDR  │
        │             │     │ /api/iocs  ──▶ JSON/CSV  │
        │ 49 源状态    │     │ /api/feed  ──▶ STIX 分发  │
        │ 错误/延迟    │     │ /api/report ─▶ 日报告    │
        └─────────────┘     └─────────────────────────┘
```

## API 体系

### 积分消耗

| 操作 | 积分 | 端点 |
|---|---|---|
| 简报读取 | 1 | `GET /api/v1/briefings/latest` |
| IOC 查询 | 1 | `POST /api/v1/lookup/ioc` |
| CVE 查询 | 1 | `GET /api/v1/lookup/cve/:id` |
| 实体列表 | 1 | `GET /api/v1/entities/:type` |
| 告警列表 | 1 | `GET /api/v1/alerts` |
| 全文搜索 | 2 | `POST /api/v1/search` |
| 关系图谱 | 3 | `GET /api/v1/entities/:type/:id/related` |
| 实体详情 | 5 | `GET /api/v1/entities/:type/:id` |
| 攻击链分析 | 20 | `POST /api/v1/analysis/chain` |

### 订阅计划

| 计划 | 积分/周期 | 监视列表 | API Key | TAXII | LLM |
|---|---|---|---|---|---|
| Free | 100/天 | 3 | 1 | ✗ | ✗ |
| Pro | 2000/月 | 20 | 5 | ✗ | ✓ |
| Ultra | 20000/月 | 无限 | 无限 | ✓ | ✓ |

### 认证

- JWT Access Token (15 分钟, localStorage)
- Refresh Token (30 天, httpOnly Cookie)
- API Key (`crx_*` 前缀, SHA-256 哈希存储)
- 双层守卫: 服务端 Cookie 检查 + 客户端 JWT 验证

## 快速启动

```bash
# 安装依赖
npm install

# 配置环境
cp .env.example .env
# 编辑 .env 添加可用的 API Key (无 Key 的源也能运行)

# 启动 (开发模式)
npm run dev
```

首次启动后约 30-60 秒完成首轮数据扫描，之后每 15 分钟自动更新。

### 可选: PostgreSQL

数据库是用户注册和 STIX 持久化的前置条件:

```bash
# .env 中配置
DATABASE_URL=postgresql://user:pass@localhost:5432/crucix
JWT_SECRET=<随机64字符hex>
JWT_REFRESH_SECRET=<随机64字符hex>

# 首次启动自动运行迁移 (users, subscriptions, api_keys, stix_objects 等)
```

无数据库时系统仍可运行: 公开 API 基于内存数据工作，用户认证和 TAXII 端点不可用。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js + Express (ES Module) |
| 前端 | 原生 HTML/JS + Tailwind CSS |
| 数据库 | PostgreSQL (可选) |
| 实时通信 | Server-Sent Events (SSE) |
| 数据标准 | STIX 2.1 / TAXII 2.1 |
| 情报协议 | MITRE ATT&CK (STIX) |
| 认证 | JWT + bcrypt + httpOnly Cookie |
| LLM | 可选 9 种提供商 (Anthropic/OpenAI/Gemini/Ollama 等) |
