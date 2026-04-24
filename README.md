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

## 数据处理流程详解

从原始 API 响应到数据库落地，共经过 8 个处理阶段。流程图中所有标注了表名的节点均为实际数据库写入点。

```mermaid
flowchart TD
    %% ─────────────────────────────────────────────
    %% ① 采集层
    %% ─────────────────────────────────────────────
    subgraph A["① 采集层 — apis/briefing.mjs"]
        A1["49 个 OSINT 数据源\nHTTP · API · RSS · STIX Bundle"]
        A1 -->|"Promise.allSettled()\n全部并行  超时 30s\nATT&CK-STIX 单独 120s"| A2["runSource(name, fn)"]
        A2 --> A3{"normalizeSourceData()"}
        A3 -->|"active\nconnected/partial/web_scrape"| A4["有效负载"]
        A3 -->|"inactive"| A5["原因码\nno_key · rate_limited\ngeo_blocked · api_error\nunreachable"]
        A4 --> A6["runs/latest.json\nruns/briefing_{ts}.json\n📁 文件系统 (非 DB)"]
    end

    %% ─────────────────────────────────────────────
    %% ② 综合层
    %% ─────────────────────────────────────────────
    subgraph B["② 综合层 — dashboard/inject.mjs · synthesize()"]
        A6 --> B1["computeThreatLevel()\nKEV数×5 + CVSS≥9数×3 + C2÷10\n+ 受害者×2 + 恶意IP÷50 ...\n→ 指数 0-100  级别 CRITICAL/HIGH/ELEVATED/LOW"]
        A6 --> B2["buildCVEList()\nNVD 为主干\n+ EPSS Map → 注入 epss 值\n+ KEV Set  → 标记 inKEV\n+ ExploitDB→ 标记 hasPoc\n+ GitHub Advisory 补充未收录项\n→ 按 CVSS 排序 取 top 50"]
        A6 --> B3["buildIOCs()\nmalware ← MalwareBazaar + ThreatFox\nc2      ← Feodo + URLhaus\nip      ← AbuseIPDB + GreyNoise + Spamhaus\nphish   ← OpenPhish"]
        A6 --> B4["buildActors()\n勒索组织 ← Ransomware-Live byGroup\nAPT      ← OTX pulses (adversary 字段)"]
        A6 --> B5["fetchAllNews()\n14 RSS 源并发  8s 超时\ngeoTagText() 关键词→坐标\n30天过滤 + 标题去重 → top 50"]
    end

    %% ─────────────────────────────────────────────
    %% ③ 归一化层
    %% ─────────────────────────────────────────────
    subgraph C["③ 归一化层 — lib/normalize/"]
        B2 --> C1["normalizeCVE(sourceName)\n校验格式 CVE-YYYY-NNNN\n统一字段: cvss.v3/v2  epss.score\nkev  pocAvailable  lifecycle\ndescription 截断 500 字"]
        C1 --> C2["deduplicateCVEs()\nmergeCVEs(): 按 CVE ID 合并\n  max(cvss.v3)  OR(kev, poc)\n  union(sources[], pocUrls[], vendors[])\n  lifecycle 取枚举最大值\n  min(firstPublished) max(lastModified)"]
        B3 --> C3["normalizeIOC(sourceName)\ndetectIOCType() 正则识别\n  ipv4/ipv6/domain/url/file/email\n域名强制小写\n置信度 clamp [0, 100]"]
        C3 --> C4["deduplicateIOCs()\nmergeIOCs(): 按 type::value 合并\n  max(confidence)\n  union(sources[], tags[], relatedCVEs[])\n  min(firstSeen)  max(lastSeen)"]
    end

    %% ─────────────────────────────────────────────
    %% ④ 评分层
    %% ─────────────────────────────────────────────
    subgraph D["④ 评分层 — lib/pipeline/scoring.mjs + lib/normalize/confidence.mjs"]
        C2 --> D1["cvePriorityScore() → [0, 1]\nCVSS÷10 × 0.30\nEPSS    × 0.30\nKEV     × 0.20\nPoC     × 0.10\nsources÷5 × 0.10 (饱和于 5 源)"]
        C4 --> D2["iocConfidenceScore() → [0, 1]\nsourceAuth  × 0.40\nsourceCount × 0.30 (÷5 饱和)\ndecay       × 0.20\nfprQuality  × 0.10"]
        C4 --> D3["iocDecayFactor()  指数衰减\n0.5^(天数÷半衰期)\nIPv4/6=7天  URL=14天\ndomain/email=30天  file=90天"]
        D2 & D3 --> D4["iocLifecycleState()\ndecay>0.80 → fresh\ndecay>0.50 → active\ndecay>0.25 → aging\n其余       → stale"]
        C4 --> D5["calculateConfidence() → [0,100]\n基础 20\n+30 官方 CERT (CISA/CNCERT/ENISA...)\n+25 ≥3 源交叉确认  (+10 双源)\n+20 商业情报 (VT/ThreatBook/Qianxin)\n+10 社区 (OTX/AbuseIPDB/Feodo)\n+5  媒体/社交 (FreeBuf/Telegram)\n+10 24h 内观测  (+5 72h 内)\n+5  关联 CVE 存在"]
    end

    %% ─────────────────────────────────────────────
    %% ⑤ STIX 转换层
    %% ─────────────────────────────────────────────
    subgraph E["⑤ STIX 2.1 转换层 — lib/pipeline/"]
        D1 --> E1["toStixVulnerability()\ntype: vulnerability  spec_version: 2.1\nid: stixId('vulnerability', cveId)\n─────────────── x_crucix 扩展 ───────────────\nx_crucix_cvss_score      x_crucix_epss_score\nx_crucix_kev_listed      x_crucix_exploit_public\nx_crucix_priority_score  x_crucix_lifecycle\nx_crucix_vendors[]       x_crucix_products[]\nx_crucix_poc_urls[]      x_crucix_patch_status\nx_crucix_attack_vector   x_crucix_source_count"]
        D2 & D4 --> E2["toStixIndicator() → SDO + SCO 对\nSDO  type: indicator\n     pattern_type: stix\n     pattern: '[ipv4-addr:value = \"x.x.x.x\"]'\n              '[file:hashes.SHA-256 = \"...\"]'\n     ─────────── x_crucix 扩展 ───────────────\n     x_crucix_confidence_score\n     x_crucix_ioc_lifecycle  (fresh/active...)\n     x_crucix_sources[]      x_crucix_tags[]\n     x_crucix_last_seen      x_crucix_ioc_type\nSCO  ipv4-addr / ipv6-addr / domain-name\n     url / email-addr / file(hashes{})"]
    end

    %% ─────────────────────────────────────────────
    %% ⑥ DB 写入 — 情报流水线
    %% ─────────────────────────────────────────────
    subgraph F["⑥ 数据库写入 (情报流水线) — lib/pipeline/index.mjs · runPipeline()"]
        E1 --> F1["upsertObject(pool, stixObj)\nINSERT INTO stix_objects (type, stix_id, data)\nON CONFLICT (stix_id)\nDO UPDATE SET data=EXCLUDED.data, updated_at=now()"]
        E2 --> F1
        F1 -->|"type='vulnerability'\nstix_id='vulnerability--{uuid}'\ndata=JSONB"| DB1[("stix_objects\n─────────────────\nid  BIGSERIAL PK\ntype  TEXT  (带索引)\nstix_id  TEXT UNIQUE\ndata  JSONB\n  (GIN 全文索引)\n  (priority_score 偏索引)\n  (confidence 偏索引)\ncreated_at / updated_at")]
        F1 -->|"type='indicator' → SDO\ntype='ipv4-addr' 等 → SCO\n同一 IOC 写入两行"| DB1
        DB1 -.->|"planned:\nindicator --indicates--> ipv4-addr\nvulnerability --exploited-by--> malware"| DB2[("stix_relations\n─────────────────\nid  BIGSERIAL PK\nsource_ref  TEXT\ntarget_ref  TEXT\nrelationship_type TEXT\nconfidence  REAL\nUNIQUE(src,tgt,rel_type)\n⚠️ 当前无写入者")]
        DB1 -.->|"planned:\nNLP 提取候选"| DB3[("nlp_pending\n─────────────────\nsource_text  TEXT\ncandidate_object JSONB\nconfidence  REAL\nstatus  TEXT\n⚠️ 当前无写入者")]
    end

    %% ─────────────────────────────────────────────
    %% ⑦ 信号引擎
    %% ─────────────────────────────────────────────
    subgraph G["⑦ 增量信号引擎 — lib/delta/engine.mjs · computeDelta()"]
        A6 --> G1["Layer 1: 14 原子信号\n提取 curr/prev 指标值\ndiff 超阈值 → atomic 信号\n倍数升级: ×3→HIGH  ×5→CRITICAL"]
        A6 --> G2["Layer 2: 4 交叉关联规则\nvuln_weaponization\n  高危CVE + (PoC 或 主动扫描)\ntargeted_infrastructure\n  AbuseIPDB + (ThreatFox 或 Feodo)\nsupply_chain_attack\n  GitHub Advisory + OSV/新闻关键词\nchina_high_confidence\n  CNCERT + CNVD/CNNVD + 奇安信"]
        A6 --> G3["Layer 3: Z-Score 趋势\n|z|≥2.0→MEDIUM  |z|≥3.0→HIGH\n需 ≥2 次历史扫描数据"]
        G1 & G2 & G3 --> G4["综合威胁等级\nCRITICAL · HIGH · MEDIUM · LOW\n威胁指数 = CRITICAL×25 + HIGH×15\n         + MEDIUM×8 + 关联触发×20\n方向: worsening / stable / improving"]
        G4 -.->|"planned:\nsignal → alert 行\n当前无写入"| DB4[("alerts\n─────────────────\nid  BIGSERIAL PK\ntype  TEXT\nseverity  TEXT\ntitle  TEXT\nentity_ref  TEXT\nsignal_data  JSONB\ncreated_at\n索引: severity+created_at\n⚠️ 当前无写入者\nAPI 读取返回空数组")]
    end

    %% ─────────────────────────────────────────────
    %% ⑧ API + 用户行为写入
    %% ─────────────────────────────────────────────
    subgraph H["⑧ API 层写入 — lib/api/v1/ + lib/auth/"]
        B1 & B2 & B4 --> H1["briefingFromSynthesized()\n内存数据→API响应 (不写DB)"]
        H1 --> H2["GET /api/v1/briefings/latest\n消耗 1 积分"]
        H2 -->|"每次调用扣积分"| DB5[("credit_log\n─────────────────\nuser_id  operation\namount  created_at\n用于积分审计")]
        H2 -->|"更新余额"| DB6[("subscriptions\n─────────────────\nuser_id  FK→users\nplan_id  FK→plans\ncurrent_credits INT\nperiod_start/end\nstatus")]

        RA["POST /api/v1/analysis/chain\n消耗 20 积分  Pro/Ultra 限定"] -->|"INSERT"| DB7[("analysis_jobs\n─────────────────\nuser_id  type\ninput  JSONB\nstatus: pending→done\nresult  JSONB")]

        RU["POST /auth/register\nPOST /auth/login"] -->|"写用户行"| DB8[("users\n─────────────────\nid  email UNIQUE\npassword_hash\nemail_verified")]
        RU -->|"写 token hash"| DB9[("refresh_tokens\n─────────────────\nuser_id  FK\ntoken_hash UNIQUE\nexpires_at\nrevoked BOOL")]

        RW["POST /api/v1/watchlist"] -->|"INSERT UNIQUE\n(user_id,type,value)"| DB10[("watchlists\n─────────────────\nuser_id  FK\ntype  value\nlabel\nUNIQUE(user+type+val)")]

        RK["POST /api/v1/account/keys"] -->|"存哈希 不存明文"| DB11[("api_keys\n─────────────────\nuser_id  FK\nkey_hash UNIQUE\nname  last_used_at\nrevoked BOOL")]

        DB4 -->|"SELECT ORDER BY\ncreated_at DESC"| HR["GET /api/v1/alerts"]
        DB1 -->|"SELECT WHERE type=?\nGIN 全文检索"| HS["GET /api/v1/entities/:type\nGET /api/v1/lookup/cve/:id\nPOST /api/v1/lookup/ioc\nPOST /api/v1/search"]
    end
```

### 数据库表写入来源汇总

| 表 | 写入者 | 写入时机 | 写入方式 |
|---|---|---|---|
| `raw_intel_items` | `saveRawIntel()` | 每轮扫描结束后（fire-and-forget） | `INSERT ON CONFLICT (dedup_key) DO NOTHING` |
| `stix_objects` | `runPipeline()` | 每轮扫描结束后 | `UPSERT ON CONFLICT stix_id` |
| `stix_relations` | ⚠️ **未实现** | — | 已建表，pipeline 尚未写入 |
| `nlp_pending` | ⚠️ **未实现** | — | 已建表，NLP 提取待开发 |
| `alerts` | ⚠️ **未实现** | — | 已建表，Delta 引擎尚未写入；API 读取时返回空 |
| `analysis_jobs` | `POST /api/v1/analysis/chain` | 用户发起攻击链分析 | `INSERT RETURNING` |
| `users` | `POST /auth/register` | 用户注册 | `INSERT` |
| `refresh_tokens` | `POST /auth/login` | 用户登录 | `INSERT`；登出时 `UPDATE revoked=true` |
| `subscriptions` | 注册/订阅升级 | 账号创建 & 计划变更 | `INSERT`；积分扣减时 `UPDATE current_credits` |
| `credit_log` | `requireCredits()` 中间件 | 每次 API 调用 | `INSERT`（审计追踪） |
| `api_keys` | `POST /account/keys` | 用户创建 API Key | 存 SHA-256 哈希，明文仅返回一次 |
| `watchlists` | `POST /api/v1/watchlist` | 用户添加监视项 | `INSERT UNIQUE(user_id, type, value)` |

### 各阶段关键说明

**采集层** — 所有源全部并行启动，单源超时不影响其余源，失败来源记录原因码（`no_key` 表示未配置 API Key，`rate_limited` 表示触达频率上限），最终结果落盘到 `runs/latest.json`（文件系统，非数据库）。

**综合层** — `buildCVEList()` 以 NVD 为主干，用 Map/Set 将 EPSS 分数、KEV 状态、ExploitDB PoC 注入同一 CVE 对象，再补充 GitHub Advisory 中未出现在 NVD 的 CVE ID，最终按 CVSS 倒排。综合层输出的 `V2` 结构保留在内存中，简报 API 直接从内存读取，**不经过数据库**。

**归一化层** — CVE 按 ID 合并时取"更严重"字段（max CVSS、OR kev/poc）；IOC 按 `type::value` 合并时取 max(confidence)，时间窗口取 min(firstSeen)/max(lastSeen)，多源确认的 IOC 自然获得更高优先级。

**评分层** — CVE 优先级和 IOC 置信度均为 0-1 归一化加权和，供 `stix_objects` 表的偏索引直接排序。IOC 时效衰减用指数函数，IP 最短 7 天半衰期，文件哈希最长 90 天，反映其真实情报有效期差异。

**STIX 转换与持久化** — `upsertObject()` 执行 `ON CONFLICT (stix_id) DO UPDATE`，同一 CVE/IOC 多次扫描只更新不重复插入。IOC 写入两行：Indicator SDO（带评分和 pattern）+ SCO（原始 observable 值），两者通过 `x_crucix_ioc_value` 关联。

**原始情报存储与去重 (`raw_intel_items`)** — 每轮扫描后，`saveRawIntel()` 把各数据源的每条原始条目写入 `raw_intel_items`，写入时通过 `dedup_key` 保证幂等性。`dedup_key` 的计算规则（优先级从高到低）：

| 优先级 | 条件 | dedup_key 计算 | 含义 |
|---|---|---|---|
| 1 | 有 URL 且有最后修改时间 | `MD5(url + "::" + modified_at)` | 版本感知去重：同一 URL 内容更新后视为新条目 |
| 2 | 有 URL，无修改时间 | `MD5(url)` | URL 唯一性去重：跨源同文章不重复存储 |
| 3 | 无 URL | `MD5(source_name + "::" + content_hash)` | 源内容哈希去重：不同源对同一实体（如同一 CVE ID）的数据独立保留 |

`content` 字段存储 JSON 字符串（API 数据）或原始文本（爬虫数据），`content_hash` 为其 MD5，`first_seen_at` 记录系统首次收录时间。

**`alerts` 表空缺** — Delta 引擎目前只在内存中计算信号，尚未将触发结果写入 `alerts` 表，导致 `/api/v1/alerts` 在有数据库时也返回空数组。需在 `computeDelta()` 之后添加 `INSERT INTO alerts` 的写入步骤。

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
