# Data Source Redesign — Design Spec

**Date:** 2026-04-16  
**Status:** Approved  
**Scope:** `apis/briefing.mjs` + `apis/sources/` — 数据源结构调整，净增 +30 源，删除 4 源，合计 68 活跃源

---

## 背景与目标

当前系统运行 36 个数据源，存在以下问题：

1. **低价值源占位**：BGP-Ranking、Bluesky、Shadowserver 对 SOC 全域监控价值极低
2. **退化源未替换**：PhishTank 服务持续劣化，应换 OpenPhish
3. **英文安全媒体缺失**：Domain 4 只有 CERT 官方源，没有安全媒体（The Hacker News 等）
4. **暴露面分析空白**：无 Censys、无 SANS ISC 蜜罐数据
5. **已有 Key 未用**：奇安信 Hunter、奇安信威胁情报 API、百度千帆搜索、Tavily 均已有 Key，暂未接入
6. **厂商公告完全缺失**：国际/国内主要安全厂商的安全公告 RSS 均未收录

---

## 部署环境

- 双线路：中国大陆服务器（访问国内源）+ 境外服务器（访问全球源）
- 已有 API Key：奇安信 Hunter、奇安信威胁情报、百度千帆搜索、Tavily
- 可注册免费 Key：VulnCheck、Censys、GreyNoise、Hybrid Analysis、Malpedia 等

---

## 变更清单

### 删除（-4 源）

| 源 | 文件 | 理由 |
|---|---|---|
| BGP-Ranking | `bgp-ranking.mjs` | 仅提供 AS 级别恶意排名，SOC 日常无实用价值 |
| Bluesky | `bluesky.mjs` | 安全社区规模不足，信噪比差 |
| Shadowserver | `shadowserver.mjs` | 需机构注册，个人用户无法获取有效数据 |
| PhishTank | `phishtank.mjs` | 服务持续退化，替换为 OpenPhish |

### 替换（1 对 1）

| 旧源 | 新源 | 说明 |
|---|---|---|
| PhishTank | OpenPhish | 钓鱼 URL feed，格式统一，免费，稳定 |

### 新增（+30 源）

#### Domain 1 — 漏洞情报（+2，共 8 源）

| 源 | 文件 | 获取方式 | 价值 |
|---|---|---|---|
| VulnCheck | `vulncheck.mjs` | 免费注册 | NVD 增强，附加"首次在野利用日期"，KEV 判定比 CISA 早 7-14 天 |
| CIRCL CVE Search | `circl-cve.mjs` | 完全免费 | 卢森堡 CERT 快速 CVE 查询，NVD 慢时的备用层 |

#### Domain 2 — 威胁行为者 & 恶意软件（+3，共 10 源）

| 源 | 文件 | 获取方式 | 价值 |
|---|---|---|---|
| Hybrid Analysis | `hybrid-analysis.mjs` | 免费注册 | abuse.ch 沙箱 feed，MalwareBazaar 的行为维度补充（进程树/网络/注册表） |
| CIRCL Passive DNS | `circl-pdns.mjs` | 完全免费 | 域名历史解析记录，C2 基础设施关联，APT 溯源 |
| Malpedia | `malpedia.mjs` | 免费注册 | 恶意软件家族描述库（FRAUNHOFER），ATT&CK 映射，补充 OTX 命名空白 |

#### Domain 3 — 攻击活动 & 暴露面（+4，-1，共 11 源）

| 源 | 文件 | 获取方式 | 价值 |
|---|---|---|---|
| Censys | `censys.mjs` | 免费注册（研究账号） | 互联网资产扫描，比 Shodan 免费版数据量更多 |
| DShield/SANS ISC | `dshield.mjs` | 完全免费 | SANS 蜜罐网络，每日 Top 攻击 IP + 端口趋势 |
| OpenPhish | `openphish.mjs` | 完全免费 | 替换 PhishTank，钓鱼 URL feed |
| 奇安信 Hunter | `qianxin-hunter.mjs` | **已有 Key** (`HUNTER_API_KEY`) | 中国网络资产测绘，与 FOFA/ZoomEye 三角互补 |

#### Domain 4 — 事件追踪（+4，共 10 源）

| 源 | 文件 | 获取方式 | 价值 |
|---|---|---|---|
| The Hacker News | `hackernews-rss.mjs` | 完全免费 | 英文安全圈最高流量媒体，0day/勒索报道极快 |
| BleepingComputer | `bleepingcomputer-rss.mjs` | 完全免费 | 勒索软件受害者报道最详细，与 Ransomware-Live 数据互补 |
| SecurityWeek | `securityweek-rss.mjs` | 完全免费 | 行业分析，APT 报告覆盖好 |
| Tavily AI Search | `tavily.mjs` | **已有 Key** (`TAVILY_API_KEY`) | 主动威胁巡查（见下节设计） |

CERTs-Intl 内部扩展（不新增文件）：在 `certs-intl.mjs` 的源数组中追加 NCSC(英)、BSI(德)、JPCERT(日)、ACSC(澳) 的 RSS 端点。

#### Domain 5 — 中国情报（+2，共 12 源）

| 源 | 文件 | 获取方式 | 价值 |
|---|---|---|---|
| 百度千帆搜索 | `baidu-search.mjs` | **已有 Key** (`BAIDU_QIANFAN_API_KEY`) | 搜索任意安全关键词，覆盖无 RSS 的中文安全事件 |
| 奇安信威胁情报 | `qianxin-ti.mjs` | **已有 Key** (`QIANXIN_TI_API_KEY`) | IP/域名/哈希信誉 + APT 归因，国内商业 TI 质量最高之一 |

注：ThreatBook 待 API 修复后在 `briefing.mjs` 中取消注释恢复，不计入本次新增。

#### Domain 6 — 厂商公告（+17 源，全新域）

两个聚合文件，各自维护一个 RSS 端点配置数组，新增厂商只改数组，不改代码逻辑。

**`vendors-intl.mjs`（10 家国际厂商）：**

| 厂商 | RSS/博客端点 |
|---|---|
| Microsoft MSRC | `https://api.msrc.microsoft.com/update-guide/rss` |
| Cisco Talos | `https://blog.talosintelligence.com/feeds/posts/default` |
| Palo Alto Unit42 | `https://unit42.paloaltonetworks.com/feed/` |
| CrowdStrike | `https://www.crowdstrike.com/blog/feed/` |
| Mandiant | `https://www.mandiant.com/resources/blog/rss.xml` |
| ESET | `https://www.welivesecurity.com/en/feed/` |
| Kaspersky | `https://securelist.com/feed/` |
| IBM X-Force | `https://securityintelligence.com/feed/` |
| Check Point Research | `https://research.checkpoint.com/feed/` |
| Rapid7 | `https://blog.rapid7.com/rss/` |

**`vendors-cn.mjs`（7 家国内厂商）：**

| 厂商 | RSS/博客端点 |
|---|---|
| 360 CERT | `https://cert.360.cn/api/rss` |
| 安天（Antiy） | `https://www.antiy.cn/research/notice&report.html`（HTML 抓取） |
| 绿盟科技 NSFOCUS | `https://blog.nsfocus.net/feed/` |
| 深信服千里目 | `https://sec.sangfor.com.cn/api/rss`（HTML 抓取备用） |
| 腾讯 TSRC | `https://security.tencent.com/index.php/blog/rss` |
| 华为 PSIRT | `https://www.huawei.com/en/psirt/rss` |
| 长亭科技 | `https://www.chaitin.cn/en/blog_rss` |

---

## Tavily 主动巡查设计

### 工作方式

每次 briefing sweep 期间，`tavily.mjs` 顺序执行一组固定关键词查询，结果注入 `newsFeed`。

### 查询关键词（8 条）

```js
const TAVILY_QUERIES = [
  'zero-day exploit actively exploited 2026',
  'ransomware group new attack campaign 2026',
  'APT nation-state cyberattack attribution 2026',
  'critical vulnerability emergency patch 2026',
  'supply chain attack software compromise 2026',
  'data breach credentials leak 2026',
  '高危漏洞 在野利用 2026',
  '勒索软件 攻击 受害者 2026',
];
```

### 配额控制

```
TAVILY_MAX_RESULTS=40   # 单次 sweep 最多返回条目数（.env 可覆盖）
TAVILY_ENABLED=true     # 可临时关闭，不影响其他源
```

### 去重规则

- URL 完全相同 → 跳过
- 标题相似度 > 80%（Levenshtein 归一化）→ 跳过
- 与 `newsFeed` 现有条目比较（当次 sweep 内去重）

### 输出格式

```js
{
  source: 'Tavily',
  title: '...',
  url: '...',
  publishedAt: '...',   // Tavily 返回的发布时间，无则用当前时间
  level: 'medium',      // 默认 medium，标题含 critical/zero-day/ransomware 则提升为 high
  type: 'news',
}
```

---

## 环境变量新增

```bash
# .env.example 新增
VULNCHECK_API_KEY=        # VulnCheck 免费注册
CENSYS_API_ID=            # Censys 研究账号
CENSYS_API_SECRET=
HYBRID_ANALYSIS_KEY=      # Hybrid Analysis 免费注册
MALPEDIA_API_KEY=         # Malpedia 免费注册
HUNTER_API_KEY=           # 奇安信 Hunter（已有）
BAIDU_QIANFAN_API_KEY=    # 百度千帆搜索（已有）
QIANXIN_TI_API_KEY=       # 奇安信威胁情报（已有）
TAVILY_API_KEY=           # Tavily AI 搜索（已有）
TAVILY_MAX_RESULTS=40
TAVILY_ENABLED=true
```

---

## 最终源数统计

| 域 | 源文件数 | 主要源 |
|---|---|---|
| D1 漏洞情报 | 8 | CISA-KEV, NVD, EPSS, GitHub-Advisory, ExploitDB, OSV, VulnCheck, CIRCL-CVE |
| D2 威胁行为者 | 10 | OTX, MalwareBazaar, ThreatFox, Feodo, ATT&CK-STIX, VirusTotal, URLhaus, Hybrid Analysis, CIRCL-PDNS, Malpedia |
| D3 攻击暴露 | 11 | GreyNoise, Shodan, Censys, AbuseIPDB, Cloudflare-Radar, Spamhaus, DShield, OpenPhish, Qianxin Hunter, FOFA, ZoomEye |
| D4 事件追踪 | 10 | Ransomware-Live, ENISA, CISA-Alerts, CERTs-Intl(含NCSC/BSI/JPCERT/ACSC), Telegram, THN, BleepingComputer, SecurityWeek, Tavily |
| D5 中国情报 | 10 | CNCERT, CNVD, CNNVD, Qianxin, FreeBuf, Anquanke, 4hou, ThreatBook(待恢复), Baidu Search, Qianxin TI |
| D6 厂商公告 | 2 文件 / 17 RSS | vendors-intl.mjs(10家) + vendors-cn.mjs(7家) |
| **唯一源文件合计** | **51** | 净变化：-4 旧源文件，+19 新源文件（FOFA/ZoomEye 归入 D3，不在 D5 重复计文件） |

> **注：** FOFA 和 ZoomEye 物理上属于 D3（攻击暴露面），同时在 D5 仪表板分组中展示（中国区资产搜索属性）。inject.mjs 的域分组配置可将它们归入两个视图，但 briefing.mjs 只调用一次，不重复拉取。
>
> D6 的 2 个聚合文件各自维护一个 RSS 端点配置数组（`VENDOR_INTL_FEEDS` / `VENDOR_CN_FEEDS`），新增厂商只改数组，不改代码逻辑。

---

## 实现顺序建议

| 优先级 | 批次 | 内容 |
|---|---|---|
| P0 | 批次 1 | 接入已有 Key 的 4 个源：Qianxin Hunter、Qianxin TI、Baidu Search、Tavily |
| P0 | 批次 2 | 免费无 Key 源：OpenPhish、DShield、THN RSS、BleepingComputer RSS、SecurityWeek RSS、CERTs-Intl 扩展 |
| P1 | 批次 3 | 需注册免费 Key：VulnCheck、Censys、Hybrid Analysis、CIRCL PDNS、Malpedia、CIRCL CVE |
| P1 | 批次 4 | D6 厂商公告：vendors-intl.mjs + vendors-cn.mjs |
| P2 | 批次 5 | 删除旧源（BGP-Ranking、Bluesky、Shadowserver）+ ThreatBook 恢复 |

---

## 不变的内容

- `briefing.mjs` 的 `runSource` / `normalizeSourceData` 框架不变
- `inject.mjs` 数据整合逻辑不变（新源只需按现有字段规范输出）
- `jarvis.html` 前端不变（Health Grid 域分组自动涵盖新源）
- `server.mjs` 不变
