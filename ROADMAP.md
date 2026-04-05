# Crucix Cybersecurity Edition — 版本发布路线图

**生成日期：** 2026-04-05  
**基于设计文档：** `2026-03-31-cybersec-intel-design.md`  
**改造策略：** 方案二（领域替换 + 轻量重构）

---

## 版本总览

```
v0.1.0  基础骨架 ── 配置 / 认证 / 目录结构 / 标准化层
  │
v0.2.0  核心情报 ── 域 1-3（23 源）漏洞 + 威胁行为者 + 攻击活动
  │
v0.3.0  全源就位 ── 域 4-5（19 源）事件追踪 + 中国情报 + 旧源清理
  │
v0.5.0  引擎上线 ── Delta 三层信号模型 + 四级告警体系
  │
v0.8.0  大屏交付 ── 仪表板重设计 + 地球仪 + 四专项面板 + LLM 简报
  │
v1.0.0  正式发布 ── IOC 导出 / REST API / 报告生成 / Watchlist / Bot 命令
  │
v1.1.0  情报增强 ── 域 6-7（43 源）搜索引擎 + 厂商公告 + MISP + RBAC + PDF
  │
v1.2.0  自动化   ── SOAR 联动 / 自动封堵 / 邮件订阅 / Webhook
  │
v1.3.0  智能化   ── ML 威胁预测 / 自动归因 / 知识图谱 / 暗网深度监控
  │
v2.0.0  企业版   ── 多租户 / SaaS / 私有化部署 / 合规审计
```

---

## v0.1.0 — 基础骨架（预计 4-5 天）

> **目标：** 搭建新模块目录骨架，更新配置文件，完成认证模块和数据标准化层，为所有后续版本打地基。

### 功能清单

| 模块 | 功能 | 优先级 |
|------|------|--------|
| **配置** | `crucix.config.mjs` 新增 `auth` / `watchlist` / `commercialFeeds` / `searchFeeds` / `delta.thresholds` 配置块 | P0 |
| **环境变量** | `.env.example` 新增全部 API Key 占位（OTX、VT、Shodan 等） | P0 |
| **认证** | `lib/auth/index.mjs` Bearer Token 认证中间件，`AUTH_ENABLED=false` 时跳过 | P0 |
| **服务端** | `server.mjs` 挂载 auth 中间件，预留 API 端点桩（`/api/iocs`、`/api/cve/:id` 等），暂返回 501 | P0 |
| **目录骨架** | 创建 `lib/normalize/`、`lib/export/`、`lib/watchlist/`、`lib/report/` | P0 |
| **IOC 标准化** | `lib/normalize/ioc.mjs` — 5 种 IOC 类型统一 Schema、去重合并 | P0 |
| **CVE 标准化** | `lib/normalize/cve.mjs` — CVE 统一 Schema、多源信息融合 | P0 |
| **置信度引擎** | `lib/normalize/confidence.mjs` — 加权规则引擎（CERT +30 / 3源确认 +25 等） | P1 |
| **标准化入口** | `lib/normalize/index.mjs` — 统一导出，对接 Delta 引擎 | P0 |

### 验收标准

- [ ] 配置更新、auth 中间件可用
- [ ] 目录结构创建完毕
- [ ] `normalizeIOC()` / `normalizeCVE()` 单元测试通过
- [ ] 现有功能不受影响（向后兼容）

### 文件变更

```
新建:
  lib/auth/index.mjs
  lib/normalize/index.mjs
  lib/normalize/ioc.mjs
  lib/normalize/cve.mjs
  lib/normalize/confidence.mjs
  lib/export/index.mjs       (空骨架)
  lib/watchlist/index.mjs    (空骨架)
  lib/report/index.mjs       (空骨架)

修改:
  crucix.config.mjs
  .env.example
  server.mjs
```

---

## v0.2.0 — 核心情报源（预计 5-7 天）

> **目标：** 接入漏洞情报、威胁行为者、攻击活动三大核心域共 23 个数据源，产出标准化 IOC/CVE 数据。

### 功能清单

| 域 | 数据源 | 数量 | 说明 |
|----|--------|------|------|
| **域 1：漏洞情报** | NVD、CISA-KEV（保留）、EPSS、GitHub Advisory、Exploit-DB、OSV | 6 | VulnCheck 推迟到 v1.1 |
| **域 2：威胁行为者** | OTX、MalwareBazaar、ThreatFox、Feodo、ATT&CK STIX、VirusTotal、URLhaus | 7 | Malpedia 推迟到 v1.1 |
| **域 3：攻击活动** | GreyNoise、Shodan、AbuseIPDB、Cloudflare（保留）、Shadowserver、Spamhaus、BGP Ranking、PhishTank | 8 | — |
| **编排层** | `apis/briefing.mjs` 注册全部新源，输出经 normalize 层 | — | — |

### 验收标准

- [ ] 21 个新安全源 + 2 个保留源，共 23 源可拉取
- [ ] `fullBriefing()` 输出标准化 IOC/CVE 数据
- [ ] 每个源有 mock 测试，不依赖真实 API 的 CI 可通过
- [ ] Rate Limiting 优雅降级和缓存就绪（VT 4次/分、Shodan 1次/秒）

### 文件变更

```
新建:
  apis/sources/nvd.mjs
  apis/sources/epss.mjs
  apis/sources/github-advisory.mjs
  apis/sources/exploitdb.mjs
  apis/sources/osv.mjs
  apis/sources/otx.mjs
  apis/sources/malwarebazaar.mjs
  apis/sources/threatfox.mjs
  apis/sources/feodo.mjs
  apis/sources/attack-stix.mjs
  apis/sources/virustotal.mjs
  apis/sources/urlhaus.mjs
  apis/sources/greynoise.mjs
  apis/sources/shodan.mjs
  apis/sources/abuseipdb.mjs
  apis/sources/shadowserver.mjs
  apis/sources/spamhaus.mjs
  apis/sources/bgp-ranking.mjs
  apis/sources/phishtank.mjs

修改:
  apis/briefing.mjs
  apis/sources/cisa-kev.mjs    (适配标准化层)
  apis/sources/cloudflare.mjs  (适配标准化层)
```

---

## v0.3.0 — 全源就位（预计 4-5 天）

> **目标：** 接入事件追踪、中国情报源，移除全部非安全类旧数据源，v1.0 数据层完备。

### 功能清单

| 域 | 数据源 | 数量 | 说明 |
|----|--------|------|------|
| **域 4：事件追踪** | Ransomware.live、ENISA、CISA Alerts、多国 CERT 聚合（US/EU/JP/AU/KR/IN） | 4（新建） | — |
| **域 4：社区适配** | Bluesky → infosec 社区、Reddit → r/netsec、Telegram → 安全频道 | 3（改造） | 复用现有源 |
| **域 5：中国官方** | CNCERT/CC、CNVD、CNNVD | 3 | 需处理网页抓取与反爬 |
| **域 5：中国商业** | 微步在线 ThreatBook、奇安信威胁情报中心 | 2 | 360 NetLab / Hunter.how 推迟到 v1.1 |
| **域 5：中国测绘** | ZoomEye、FOFA | 2 | — |
| **域 5：中国媒体** | FreeBuf RSS、安全客 RSS、嘶吼 RSS | 3 | — |
| **旧源清理** | 移除 GDELT、OpenSky、FIRMS、Maritime、YFinance、WHO、FRED、NOAA、EPA、ACLED 等 ~20 个非安全源 | — | 归档处理 |

### 验收标准

- [ ] ~42 个活跃安全源全部可拉取
- [ ] 旧源全部移除/归档，编排层仅包含安全类源
- [ ] CNVD/CNNVD 抓取稳定，异常时优雅降级
- [ ] `cisa-kev.mjs` 和 `cloudflare.mjs` 引用保持正常

### 文件变更

```
新建:
  apis/sources/ransomware-live.mjs
  apis/sources/enisa.mjs
  apis/sources/cisa-alerts.mjs
  apis/sources/certs-intl.mjs
  apis/sources/cncert.mjs
  apis/sources/cnvd.mjs
  apis/sources/cnnvd.mjs
  apis/sources/threatbook.mjs
  apis/sources/qianxin.mjs
  apis/sources/zoomeye.mjs
  apis/sources/fofa.mjs
  apis/sources/freebuf-rss.mjs
  apis/sources/anquanke-rss.mjs
  apis/sources/4hou-rss.mjs

修改:
  apis/briefing.mjs          (注册域 4-5，移除旧源引用)
  apis/sources/bluesky.mjs   (适配 infosec 社区)
  apis/sources/reddit.mjs    (适配 r/netsec)
  apis/sources/telegram.mjs  (适配安全频道)

删除/归档:
  apis/sources/gdelt.mjs
  apis/sources/opensky.mjs
  apis/sources/firms.mjs
  apis/sources/maritime.mjs
  ... (约 20 个非安全类源)
```

---

## v0.5.0 — 引擎上线（预计 3-4 天）

> **目标：** 将 Delta 引擎从地缘政治信号模型改造为网络安全三层信号模型，告警体系输出正确级别和内容。

### 功能清单

| 模块 | 功能 | 说明 |
|------|------|------|
| **原子信号（层 1）** | 13 种原子信号类型（新 CVE CVSS≥9.0、CVE 进入 KEV、EPSS 跃升、PoC 出现等） | 每种绑定默认级别 |
| **关联信号（层 2）** | Rule A — 漏洞武器化预警（NVD + GitHub PoC + GreyNoise） | CRITICAL |
| | Rule B — 定向攻击基础设施预警（AbuseIPDB + ThreatFox + GreyNoise + Watchlist） | HIGH |
| | Rule C — 供应链攻击预警（GitHub + OSV/NVD + 媒体 RSS） | HIGH |
| | Rule D — 中国区高置信度威胁（CNCERT + CNVD/CNNVD + 微步/奇安信） | CRITICAL |
| **趋势信号（层 3）** | 滑动窗口追踪（24h / 7d / 30d）— 威胁行为者频率、漏洞利用趋势、行业/地区热度 | 异常检测触发 |
| **告警体系** | 四级告警（CRITICAL / HIGH / MEDIUM / LOW）+ 按受众分发 | Telegram + Discord |
| **内存模型** | `hot.json` 适配 IOC/CVE 状态、去重追踪、CVE 生命周期跟踪 | — |

### 验收标准

- [ ] 三层信号模型运转，原子 / 关联 / 趋势信号均可触发
- [ ] 四级告警输出正确级别、正确语义内容
- [ ] IOC 去重追踪正常（避免重复告警）
- [ ] CVE 生命周期状态可追踪（NVD → KEV → PoC → 在野利用）

### 文件变更

```
修改:
  lib/delta/engine.mjs       (三层信号模型)
  lib/delta/memory.mjs       (IOC/CVE 状态)
  lib/alerts/telegram.mjs    (四级告警模板)
  lib/alerts/discord.mjs     (四级告警模板)
```

---

## v0.8.0 — 大屏交付（预计 5-7 天）

> **目标：** 改造合成逻辑和前端仪表板，呈现网络安全情报大屏，地球仪渲染攻击数据，四专项面板可视化。

### 功能清单

| 模块 | 功能 | 说明 |
|------|------|------|
| **合成逻辑** | 移除旧合成字段，新增 `threats` / `iocs` / `cves` / `attackMatrix` / `actors` / `geoAttacks` / `certAlerts` | inject.mjs 重构 |
| **3D 地球仪** | 8 类标记重映射：攻击来源(红) / 受害者(橙) / 蜜罐(黄) / APT(紫) / C2(深红) / 暴露资产(蓝) / CERT(绿) / BGP异常(白) | 攻击弧线动画 |
| **顶部状态栏** | 威胁指数(0-100, 四色渐变) / 在野利用 CVE 数 / 活跃 APT 组织数 / 今日新增 KEV / 地区过滤 | — |
| **左侧图层** | 8 个图层开关控制 | — |
| **右侧情报流** | CRITICAL / HIGH / MEDIUM / LOW 分色滚动面板，SSE 实时推送 | — |
| **面板 1** | CVE 时间线 — D3 散点图（时间 × CVSS，圆点大小=EPSS） | — |
| **面板 2** | ATT&CK 热力矩阵 — 战术 × 技术热力图 | — |
| **面板 3** | 威胁行为者追踪板 — 卡片式 | — |
| **面板 4** | LLM 威胁简报 — 替换原"交易建议"，三受众版本输出 | — |

### 验收标准

- [ ] 仪表板地球仪渲染攻击数据，8 类标记颜色正确
- [ ] 顶部状态栏指标实时更新
- [ ] 四专项面板数据可视化正常
- [ ] LLM 层输出三受众版本威胁简报
- [ ] SSE 实时推送工作正常

### 文件变更

```
修改:
  dashboard/inject.mjs            (合成逻辑重构)
  dashboard/public/jarvis.html    (全面重设计)
  lib/llm/ideas.mjs               (威胁简报生成)
```

---

## v1.0.0 — 正式发布（预计 4-5 天）

> **目标：** 实现 IOC 导出、REST API、报告生成、Watchlist、Bot 命令、国际化，达到正式发布标准。
> 
> **总源数：** ~42 个活跃源 | **总开发周期：** ~25-33 天

### 功能清单

| 模块 | 功能 | 说明 |
|------|------|------|
| **IOC 导出** | STIX 2.1 Bundle / CSV / JSON 导出，按类型/时间过滤 | `lib/export/` |
| **REST API** | `GET /api/iocs` — IOC 导出端点（stix/csv/json） | — |
| | `GET /api/cve/:id` — CVE 完整情报查询 | — |
| | `GET /api/actor/:name` — 威胁行为者详情 | — |
| | `GET /api/ioc/lookup?value=` — 跨源 IOC 查询 | — |
| | `GET /api/feed/iocs` — TAXII 2.1 兼容 feed | — |
| | `GET /api/report/daily` — HTML 日报 | — |
| **报告生成** | HTML 日报模板（威胁摘要、Top CVEs、活跃 APTs、IOC 统计） | 凌晨 6 点自动生成 |
| | 三版本：SOC 技术版 / 管理层摘要 / 监管合规 | — |
| **Watchlist** | CRUD（vendors / industries / actors / keywords / cveIds / ipRanges） | 持久化到 `runs/watchlist.json` |
| | 与 Delta 引擎联动（匹配提升信号优先级） | — |
| **Bot 命令** | `/cve CVE-XXXX` — CVE 情报查询 | Telegram + Discord |
| | `/ioc 1.2.3.4` — 跨源 IOC 查询 | — |
| | `/actor APT41` — 威胁行为者动态 | — |
| | `/watchlist add <keyword>` — 添加监控 | — |
| | `/brief cn` — 中文威胁简报 | — |
| | `/export ioc csv` — 导出 IOC 列表 | — |
| **国际化** | `locales/en.json` / `locales/fr.json` 更新为安全术语，新增 `locales/zh.json` | — |

### 验收标准

- [ ] IOC 可导出 STIX 2.1 / CSV / JSON 三种格式
- [ ] REST API 全部端点可访问、数据正确
- [ ] HTML 日报可自动生成并通过 Bot 推送
- [ ] Watchlist CRUD 可用，与 Delta 引擎联动正常
- [ ] Bot 6 条新命令全部响应正确
- [ ] 中文界面完整可用

### 文件变更

```
新建:
  lib/export/stix.mjs
  lib/export/csv.mjs
  lib/report/generator.mjs
  lib/watchlist/index.mjs    (实现)
  locales/zh.json

修改:
  lib/export/index.mjs
  server.mjs                 (REST API 端点实现)
  lib/alerts/telegram.mjs    (新 Bot 命令)
  lib/alerts/discord.mjs     (新 Bot 命令)
  locales/en.json
  locales/fr.json
```

---

## v1.1.0 — 情报增强（预计 v1.0 后 2-3 周）

> **目标：** 全量数据源接入（85 源），高级功能齐备，达到设计文档完整规格。

### 功能清单

| 模块 | 功能 | 新增源数 |
|------|------|---------|
| **域 6：搜索引擎情报** | X/Twitter API v2、GitHub CVE PoC 检测、Bing News、百度新闻 RSS、Pastebin Monitor、IntelligenceX、CT Logs | 7（核心） |
| | Nitter RSS、微博话题搜索、PublicWWW | 3（按优先级） |
| **域 7：国际厂商公告** | Microsoft MSRC、Google PZ、Apple、Cisco Talos、CrowdStrike、Unit42、Mandiant、SentinelOne、ESET、Kaspersky、IBM X-Force、Check Point、Rapid7、Tenable | 14 |
| **域 7：国内厂商公告** | 360 CERT、奇安信博客、安天、绿盟、深信服、长亭、盘古、腾讯 TSRC、阿里云安全、华为 PSIRT、百度安全、字节安全 | 12 |
| **域 7：国际 CERT 扩展** | NCSC、BSI、ANSSI、JPCERT、ACSC、KrCERT、CERT-In | 7 |
| **推迟源补齐** | VulnCheck、Malpedia、360 NetLab、Hunter.how | 4 |
| **MISP 同步** | 双向：系统 → MISP 推送 IOC / MISP → 系统拉取私有情报 | — |
| **RBAC 认证** | admin / analyst / readonly 三角色，基于角色的 API 权限控制 | — |
| **PDF 报告** | 集成 Puppeteer / wkhtmltopdf，`GET /api/report/daily?format=pdf` | — |
| **三受众视图** | `?view=soc` / `?view=management` / `?view=regulatory` | — |
| **商业 Feed 激活** | Recorded Future / Mandiant / VirusTotal Pro 接口预留激活 | — |

### 验收标准

- [ ] 总源数达到 ~85 个活跃源
- [ ] MISP 双向同步测试通过
- [ ] 三角色 RBAC 权限控制正确
- [ ] PDF 日报生成正常
- [ ] 三受众视图切换功能正常

### 文件变更

```
新建:
  apis/sources/x-search.mjs
  apis/sources/github-search.mjs
  apis/sources/bing-news.mjs
  apis/sources/baidu-news.mjs
  apis/sources/pastebin.mjs
  apis/sources/intelx.mjs
  apis/sources/ct-logs.mjs
  apis/sources/vendors-intl.mjs    (14 家国际厂商 RSS 聚合)
  apis/sources/vendors-cn.mjs      (12 家国内厂商 RSS 聚合)
  apis/sources/vulncheck.mjs
  apis/sources/malpedia.mjs
  lib/export/misp.mjs

修改:
  lib/auth/index.mjs               (RBAC 升级)
  lib/report/generator.mjs         (PDF 支持)
  apis/sources/certs-intl.mjs      (扩展 7 家 CERT)
  apis/briefing.mjs                (注册全量源)
  dashboard/public/jarvis.html     (三受众视图切换)
  crucix.config.mjs                (MISP 配置)
```

---

## v1.2.0 — 自动化响应（规划中，v1.1 后 3-4 周）

> **目标：** 从"情报收集"升级为"情报驱动的自动化响应"，打通安全运营闭环。

### 规划功能

| 模块 | 功能 | 说明 |
|------|------|------|
| **Webhook 集成** | IOC / 告警推送到任意 Webhook 端点 | 企业内部系统对接 |
| **邮件订阅** | 日报 / 周报邮件订阅，按角色分发 | SMTP 配置 |
| **SOAR 联动** | 自动封堵 IP（对接防火墙 API）/ 自动提交 IOC 到 EDR | 需企业内网权限 |
| **IOC 自动分发** | 新增高置信 IOC 自动推送到 SIEM（Splunk / ELK） | Syslog / API |
| **定时任务面板** | Web UI 管理数据源拉取频率、启用/禁用特定源 | 管理后台 |
| **审计日志** | 记录所有 API 访问、配置变更、导出操作 | 合规需求 |
| **告警静默规则** | 按 CVE / Actor / IP 段配置静默窗口 | 降低噪音 |

---

## v1.3.0 — 智能化分析（规划中，v1.2 后 4-6 周）

> **目标：** 引入机器学习和知识图谱，提升威胁情报的预测能力和关联分析深度。

### 规划功能

| 模块 | 功能 | 说明 |
|------|------|------|
| **ML 威胁预测** | 基于历史数据预测漏洞被利用概率（补充 EPSS） | 自训练模型 |
| **自动归因引擎** | 基于 TTP + IOC + 基础设施特征自动归因到威胁行为者 | ATT&CK 映射 |
| **知识图谱** | 构建 CVE ↔ Actor ↔ IOC ↔ Campaign ↔ Malware 关系图 | 可视化探索 |
| **暗网深度监控** | Tor .onion 站点监控、泄露数据库检测、勒索论坛追踪 | 需 Tor 代理 |
| **自然语言查询** | 用自然语言查询情报（"最近 APT41 的活动？"） | LLM 驱动 |
| **IOC 自动评估** | 自动判断 IOC 是否为误报（基于历史精度） | 降低误报率 |
| **攻击面管理** | 导入企业资产清单，自动匹配暴露面和相关漏洞 | ASM 模块 |

---

## v2.0.0 — 企业版（远期规划）

> **目标：** 面向企业级部署的重大升级，支持多租户、SaaS 化和私有化部署。

### 规划功能

| 模块 | 功能 | 说明 |
|------|------|------|
| **多租户** | 不同组织独立数据空间、独立 Watchlist、独立告警 | 数据隔离 |
| **SaaS 部署** | 云端托管版本，按需付费 | 降低企业门槛 |
| **私有化部署** | Docker / K8s 一键部署，离线运行 | 高安全环境 |
| **合规审计** | 等保 2.0 / GDPR / ISO 27001 合规检查清单 | 自动化评估 |
| **协作功能** | 多人协作分析、案件管理、IOC 标注 | 团队协作 |
| **插件市场** | 第三方数据源 / 分析模块插件化接入 | 生态建设 |
| **数据库迁移** | 从 JSON 文件迁移到 PostgreSQL / ClickHouse | 支撑大数据量 |
| **高可用** | 多节点部署、数据同步、故障切换 | 生产级可靠性 |

---

## 版本里程碑 & 时间线

| 版本 | 里程碑 | 完成标准 | 预计时间 |
|------|--------|---------|---------|
| **v0.1.0** | 骨架就绪 | 配置 + auth + 标准化层测试通过 | 第 5 天 |
| **v0.2.0** | 核心源上线 | 23 个安全源可拉取标准化数据 | 第 12 天 |
| **v0.3.0** | 全源就位 | ~42 源运行，旧源清除 | 第 17 天 |
| **v0.5.0** | 引擎改造 | 三层信号 + 四级告警输出正确 | 第 21 天 |
| **v0.8.0** | 大屏交付 | 仪表板 + 地球仪 + 面板可视化 | 第 28 天 |
| **v1.0.0** | 正式发布 | IOC 导出 + API + 日报 + Watchlist + Bot | 第 33 天 |
| **v1.1.0** | 情报增强 | 85 源 + MISP + RBAC + PDF | v1.0 后 +14-21 天 |
| **v1.2.0** | 自动化 | Webhook + SOAR + 邮件订阅 | v1.1 后 +21-28 天 |
| **v1.3.0** | 智能化 | ML + 知识图谱 + 暗网 | v1.2 后 +28-42 天 |
| **v2.0.0** | 企业版 | 多租户 + SaaS + 私有化 | 根据市场需求启动 |

---

## 依赖关系 & 并行策略

```
v0.1.0 (基础骨架)
  ├──→ v0.2.0 (核心源 域1-3)  ─┐
  │                             ├──→ v0.3.0 (扩展源 域4-5)
  │    [LLM prompt 改造可并行] ─┘         │
  │                                       ↓
  │                              v0.5.0 (Delta 引擎)
  │                                ├──→ v0.8.0 (仪表板) ──┐
  │                                │                       ├──→ v1.0.0 (正式发布)
  │                                └──→ [输出层可并行] ────┘         │
  │                                                                  ↓
  │                                                        v1.1.0 (情报增强)
  │                                                                  │
  │                                                        v1.2.0 (自动化)
  │                                                                  │
  │                                                        v1.3.0 (智能化)
  │                                                                  │
  │                                                        v2.0.0 (企业版)
```

**可并行的工作：**
- v0.2.0 中各域数据源可由不同人员并行开发
- v0.3.0 中域 4 和域 5 可并行
- v0.8.0（仪表板）和 v1.0.0 的输出集成层可在 v0.5.0 后并行推进
- LLM prompt 改造可在 v0.1.0 后独立进行

---

## 风险 & 注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| API Rate Limiting | 免费 API 有调用限制 | 实现优雅降级、缓存、分批拉取（VT 4次/分、Shodan 1次/秒） |
| 中国源不稳定 | CNVD/CNNVD 可能需网页抓取 | 实现反爬策略、多备用解析路径、异常时自动降级 |
| 内存占用 | 85 源并行拉取 | 分批执行、流式处理、监控内存水位 |
| 向后兼容 | 改造中系统不可用 | 每个版本结束确保系统可运行，渐进式替换 |
| 测试覆盖 | 依赖真实 API 测试不稳定 | 每个源提供 mock 测试数据，CI 不依赖真实 API |
| 数据准确性 | 多源数据冲突 | 置信度加权引擎 + 交叉验证 + 人工审核机制 |
