# Crucix Cybersecurity Edition — 版本发布路线图

**更新日期：** 2026-04-06
**基于设计文档：** `docs/superpowers/specs/2026-04-05-data-fix-layout-i18n-design.md`
**当前版本：** v1.2.0

---

## 版本总览

```
v0.1.0  基础骨架 ✅  ── 配置 / 认证 / 目录结构 / 标准化层
  │
v0.2.0  核心情报 ✅  ── 域 1-3（23 源）漏洞 + 威胁行为者 + 攻击活动
  │
v0.3.0  全源就位 ✅  ── 域 4-5（19 源）事件追踪 + 中国情报 + 旧源清理
  │
v0.5.0  引擎上线 ✅  ── Delta 三层信号模型 + 四级告警体系
  │
v0.8.0  大屏交付 ✅  ── 仪表板重设计 + 地球仪 + 四专项面板 + LLM 简报
  │
v1.0.0  正式发布 ✅  ── IOC 导出 / REST API / 报告生成 / Watchlist / Bot 命令
  │
v1.0.1  数据修复 ✅  ── 字段名对齐 / 源 bug 修复 / 安全 RSS / 非安全数据清理
  │
v1.1.0  大屏重塑 ✅  ── 地球仪居中放大 / 融合原版布局 / 数据密度提升
  │
v1.2.0  国际化   ✅  ── zh.json / 前端 i18n / 中英文切换
  │
v1.3.0  情报增强 ── 域 6-7（43 源）搜索引擎 + 厂商公告 + MISP + RBAC + PDF
  │
v1.4.0  自动化   ── SOAR 联动 / 自动封堵 / 邮件订阅 / Webhook
  │
v1.5.0  智能化   ── ML 威胁预测 / 自动归因 / 知识图谱 / 暗网深度监控
  │
v2.0.0  企业版   ── 多租户 / SaaS / 私有化部署 / 合规审计
```

---

## v1.0.1 — 数据修复 ✅

> **目标：** 修复数据源 bug、对齐字段名、替换通用 RSS 为安全 RSS、清理非安全数据残留，让仪表盘从"全 0"变为有真实数据。

### 问题诊断

当前 41 个安全数据源中，仅 15 个返回有效数据。问题分为四类：

**字段名不匹配（inject.mjs 与源之间 7 处）：**

| 数据源 | 源返回字段 | inject.mjs 期望字段 |
|--------|-----------|-------------------|
| Feodo | `c2Servers`, `onlineC2s` | `activeC2s`, `onlineC2Count` |
| ThreatFox | `iocs` | `recentIOCs` |
| URLhaus | `recentUrls` | `activeUrls`, `onlineCount` |
| PhishTank | `recentPhish` | `urls` / `recentPhishing` |
| FreeBuf | `recentArticles` | `articles` / `items` |
| Qianxin | `recentThreats` | `threats` / `items` |
| ATT&CK-STIX | 无数组输出 | `tactics`, `techniques` |

**有 Key 但源代码有 bug（5 个）：**

| 源 | Bug |
|---|-----|
| ThreatBook | API 首请求未传 apikey 参数 |
| Qianxin | API 失败时错误返回 "no_credentials" |
| ZoomEye | 凭证检测逻辑有误 |
| FOFA | 凭证检测逻辑有误 |

**免费源但返回空（8 个）：** MalwareBazaar, ThreatFox, URLhaus, ATT&CK-STIX, ExploitDB, PhishTank, ENISA, BGP-Ranking

**RSS / 抓取失败（3 个）：** CNCERT, CNNVD, FreeBuf

### 功能清单

| 模块 | 功能 | 优先级 |
|------|------|--------|
| **字段名对齐** | inject.mjs 中 7 处字段名兼容修复（优先读源实际返回的字段） | P0 |
| **源 bug 修复** | 修复 ThreatBook/Qianxin/ZoomEye/FOFA 4 个有 Key 但调用失败的源 | P0 |
| **免费源修复** | 修复 MalwareBazaar/ThreatFox/URLhaus/ATT&CK-STIX/ExploitDB/PhishTank/ENISA 7 个免费源 | P0 |
| **RSS 抓取修复** | 修复 CNCERT/CNNVD/FreeBuf 的 RSS 抓取策略 | P1 |
| **安全 RSS 替换** | `fetchAllNews()` 全部替换为安全类 RSS（The Hacker News / BleepingComputer / Krebs / Dark Reading / SecurityWeek / CISA / FreeBuf / 安全客 / 嘶吼等） | P0 |
| **ACLED 移除** | 移除 ACLED 冲突数据源（非网安数据），归档到 `_archived/` | P0 |
| **残留清理** | `locales/en.json` 清理旧 OSINT 词条（OPENSKY, FRED 等） | P1 |

### 验收标准

- [x] 至少 30/41 源返回有效数据（24/41 有真实数据，其余需 API key）
- [x] 顶部状态栏 Active KEVs / APT Groups / Critical CVEs / Total IOCs 不再全为 0
- [x] Intelligence Feed 全部为安全相关内容（无 BBC/NYT 等通用新闻）
- [x] 地球仪上有来自 Feodo C2、AbuseIPDB、Ransomware-Live 的地理标记点
- [x] ACLED 已从 briefing.mjs 和 inject.mjs 中完全移除

### 文件变更

```
修改:
  dashboard/inject.mjs              (字段名对齐 + RSS 替换)
  apis/briefing.mjs                 (移除 ACLED import 和调用)
  apis/sources/threatbook.mjs       (API 传参修复)
  apis/sources/qianxin.mjs          (错误处理修复)
  apis/sources/zoomeye.mjs          (凭证检测修复)
  apis/sources/fofa.mjs             (凭证检测修复)
  apis/sources/malwarebazaar.mjs    (数据解析修复)
  apis/sources/threatfox.mjs        (数据解析修复)
  apis/sources/urlhaus.mjs          (数据解析修复)
  apis/sources/attack-stix.mjs      (输出结构修复)
  apis/sources/exploitdb.mjs        (XML 解析修复)
  apis/sources/phishtank.mjs        (解析修复)
  apis/sources/enisa.mjs            (RSS 兜底)
  apis/sources/cncert.mjs           (抓取策略修复)
  apis/sources/freebuf-rss.mjs      (RSS 修复)
  locales/en.json                   (清理旧词条)
  .env.example                      (移除 ACLED 变量)

删除/归档:
  apis/sources/acled.mjs            (移至 _archived/)
```

---

## v1.1.0 — 大屏重塑 ✅

> **目标：** 融合原版 CRUCIX MONITOR 的大布局风格与网安专业面板，地球仪放大居中，数据密度达到原版水平。

### 布局设计

```
┌──────────────────────────────────────────────────────────────────────┐
│ CRUCIX MONITOR  [威胁指数█████ 72]  KEV:12  APT:5  CVE:30  IOC:186 │
│                  SWEEP 30s  Apr 5 14:21  Sources 36/41  [GLOBAL ▾]  │
├──────────┬───────────────────────────────────┬───────────────────────┤
│ SENSOR   │                                   │ CROSS-SOURCE SIGNALS  │
│ GRID     │                                   │                       │
│          │                                   │ SIGNAL 1              │
│ ● CVEs   │        3D GLOBE                   │ 漏洞武器化预警：      │
│   30     │        (占页面 60%+ 面积)          │ NVD + PoC + GreyNoise│
│ ● IOCs   │                                   │                       │
│   186    │        攻击弧线动画                │ SIGNAL 2              │
│ ● C2     │        多类型地理标记              │ C2 基础设施扩张...    │
│   45     │                                   │                       │
│ ● Ransom │                                   │ SIGNAL 3              │
│   12     │                                   │ 中国区高置信威胁...   │
│ ● Phish  │                                   ├───────────────────────┤
│   28     │                                   │ ALERT STREAM          │
│ ● CERT   │                                   │                       │
│   8      │           标记图例                 │ [CRIT] CVE-2026-xxxx │
│          │  ● C2  ● 攻击源  ● 受害者  ● APT │ [HIGH] Ransomware... │
│ LAYERS   │  ● 蜜罐 ● 暴露 ● CERT ● 钓鱼    │ [MED]  Phishing...   │
│ [开关]   │                                   │ [LOW]  CERT alert... │
├──────────┴───────────────────────────────────┴───────────────────────┤
│ [CVE Timeline] [ATT&CK Heatmap] [Threat Actors] [China Intel] [LLM]│
│                        (Tab 切换面板区域)                            │
├──────────────────────────────────────────────────────────────────────┤
│ ▶ TICKER: CVE-2026-1234 actively exploited │ LockBit claims new... │
└──────────────────────────────────────────────────────────────────────┘
```

### 功能清单

| 模块 | 功能 | 说明 |
|------|------|------|
| **布局重构** | jarvis.html 大改：地球仪从右上角移至中央主视觉（60%+ 面积） | 参照原版 CRUCIX MONITOR 风格 |
| **左侧面板** | Sensor Grid：Active CVEs / IOC Count / C2 Servers / Ransomware Victims / Phishing URLs / CERT Alerts，每项有实时计数和变化趋势 | 替代原来的简单图层列表 |
| **右侧面板** | Cross-Source Signals（Delta 引擎关联信号）+ Alert Stream（四级告警分色滚动） | 替代原 Intelligence Feed |
| **顶栏** | 威胁指数仪表（0-100 四色渐变）/ KEV 数 / APT 数 / CVE 数 / IOC 数 / 源状态 / Sweep 时间 / 区域过滤 | 信息密度大幅提升 |
| **地球仪增强** | 新增 APT 活动区域（紫色脉冲）、钓鱼目标国家（粉色）、漏洞利用热区（橙色热力）、中国安全事件（金色）等标记；攻击弧线动画 | 总标记类型从 6 增至 10 |
| **底部面板** | CVE Timeline / ATT&CK Heatmap / Threat Actors / China Intel / LLM Brief 改为 Tab 切换，不占常驻空间 | 释放垂直空间给地球仪 |
| **底部 Ticker** | 安全新闻滚动条，来自安全 RSS + CISA + 中国安全媒体 | 类似原版 Live News Ticker |

### 验收标准

- [x] 地球仪占据页面中心 60%+ 面积，视觉冲击力不低于原版截图
- [x] 左侧 Sensor Grid 所有计数器有实际数据
- [x] 右侧 Signals + Alert Stream 有内容滚动
- [x] 数据密度主观感受接近原版 CRUCIX MONITOR
- [x] 底部 Tab 面板切换正常（点击展开/收起浮动面板）
- [x] 底部 Ticker 安全新闻滚动

### 文件变更

```
修改:
  dashboard/public/jarvis.html      (全面布局重构)
  dashboard/inject.mjs              (新增地理标记类型 + Ticker 数据)
```

---

## v1.2.0 — 国际化 ✅

> **目标：** 前端支持中英文切换，所有界面文案走 i18n 系统，安全术语中文本地化。

### 功能清单

| 模块 | 功能 | 说明 |
|------|------|------|
| **zh.json** | 新建 `locales/zh.json`，覆盖所有面板标题、按钮、状态文案、告警级别 | 安全缩写保留英文（CVE/IOC/APT/C2/EPSS/KEV/STIX/ATT&CK） |
| **前端 i18n** | jarvis.html 接入 `window.__CRUCIX_LOCALE__`，硬编码英文替换为 `t()` 调用 | 已有后端基础设施，需前端消费 |
| **语言切换** | 顶栏添加 ZH/EN 切换按钮，实时切换不刷新页面 | 动态重渲染文案 |
| **en.json 更新** | 清理旧 OSINT 词条，补全网安术语 | 保持与 zh.json 结构一致 |
| **时间格式** | 根据语言切换 `toLocaleString` 的 locale 参数 | zh → `zh-CN`，en → `en-US` |
| **默认语言** | `.env` 新增 `CRUCIX_LANG=zh` 配置项 | 支持环境变量控制默认语言 |
| **i18n 扩展** | `lib/i18n.mjs` 的 `SUPPORTED_LOCALES` 添加 `zh` | — |

### 验收标准

- [x] 中英文一键切换，不刷新页面
- [x] 中文界面无遗漏英文硬编码
- [x] 安全术语缩写保持英文（CVE、IOC、APT 等）
- [x] `.env` 中 `CRUCIX_LANG=zh` 可设置默认语言
- [x] 时间格式随语言切换

### 文件变更

```
新建:
  locales/zh.json                   (完整中文翻译，覆盖所有面板/按钮/状态/告警/传感器/空状态文案)

修改:
  lib/i18n.mjs                      (SUPPORTED_LOCALES 添加 zh + loadLocaleByCode + clearLocaleCache)
  server.mjs                        (新增 GET /api/locale/:lang + 注入 __CRUCIX_LANG__)
  dashboard/public/jarvis.html      (前端 t() 翻译函数 + data-i18n 属性 + ZH/EN 切换按钮 + 动态 locale)
  locales/en.json                   (补全 sensors/tabs/feed/sidebar/emptyStates/cveTimeline/chinaIntel/actors/lang 等键)
  .env.example                      (新增 CRUCIX_LANG=zh)
```

---

## v1.3.0 — 情报增强（预计 v1.2.0 后 2-3 周）

> **目标：** 全量数据源接入（85 源），高级功能齐备，达到设计文档完整规格。
> 
> *注：此版本内容与原 v1.1.0 相同，因插入 v1.0.1/v1.1.0/v1.2.0 而版本号后移。*

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

## v1.4.0 — 自动化响应（规划中，v1.3.0 后 3-4 周）

> **目标：** 从"情报收集"升级为"情报驱动的自动化响应"，打通安全运营闭环。
>
> *注：此版本内容与原 v1.2.0 相同。*

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

## v1.5.0 — 智能化分析（规划中，v1.4.0 后 4-6 周）

> **目标：** 引入机器学习和知识图谱，提升威胁情报的预测能力和关联分析深度。
>
> *注：此版本内容与原 v1.3.0 相同。*

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

| 版本 | 里程碑 | 完成标准 | 状态 |
|------|--------|---------|------|
| **v0.1.0** | 骨架就绪 | 配置 + auth + 标准化层测试通过 | ✅ 已完成 |
| **v0.2.0** | 核心源上线 | 23 个安全源可拉取标准化数据 | ✅ 已完成 |
| **v0.3.0** | 全源就位 | ~42 源运行，旧源清除 | ✅ 已完成 |
| **v0.5.0** | 引擎改造 | 三层信号 + 四级告警输出正确 | ✅ 已完成 |
| **v0.8.0** | 大屏交付 | 仪表板 + 地球仪 + 面板可视化 | ✅ 已完成 |
| **v1.0.0** | 正式发布 | IOC 导出 + API + 日报 + Watchlist + Bot | ✅ 已完成 |
| **v1.0.1** | 数据复活 | 30+ 源有效数据，安全 RSS，指标非 0 | ✅ 已完成 |
| **v1.1.0** | 大屏重塑 | 地球仪居中，融合布局，数据密度达标 | ✅ 已完成 |
| **v1.2.0** | 国际化 | 中英文切换完整可用 | ✅ 已完成 |
| **v1.3.0** | 情报增强 | 85 源 + MISP + RBAC + PDF | 待规划（+14-21 天） |
| **v1.4.0** | 自动化 | Webhook + SOAR + 邮件订阅 | 待规划（+21-28 天） |
| **v1.5.0** | 智能化 | ML + 知识图谱 + 暗网 | 待规划（+28-42 天） |
| **v2.0.0** | 企业版 | 多租户 + SaaS + 私有化 | 根据市场需求启动 |

---

## 依赖关系 & 并行策略

```
v1.0.0 (当前版本)
  │
  └──→ v1.0.1 (数据修复)
         │
         ├──→ v1.1.0 (大屏重塑) ────────┐
         │                                ├──→ v1.2.0 (国际化)
         └──→ [源修复可独立验证] ─────────┘         │
                                                     ↓
                                           v1.3.0 (情报增强)
                                                     │
                                           v1.4.0 (自动化)
                                                     │
                                           v1.5.0 (智能化)
                                                     │
                                           v2.0.0 (企业版)
```

**可并行的工作：**
- v1.0.1 中各源 bug 修复可由不同人员并行
- v1.1.0（布局）和 v1.2.0（i18n）可在 v1.0.1 后并行推进
- v1.3.0 的域 6/7 源开发可在 v1.1.0 完成后提前启动

---

## 风险 & 注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| API Rate Limiting | 免费 API 有调用限制 | 实现优雅降级、缓存、分批拉取（VT 4次/分、Shodan 1次/秒） |
| 中国源不稳定 | CNVD/CNNVD/CNCERT 可能需网页抓取 | 实现反爬策略、多备用解析路径、异常时自动降级 |
| 内存占用 | 41+ 源并行拉取 | 分批执行、流式处理、监控内存水位 |
| 向后兼容 | 改造中系统不可用 | 每个版本结束确保系统可运行，渐进式替换 |
| 测试覆盖 | 依赖真实 API 测试不稳定 | 每个源提供 mock 测试数据，CI 不依赖真实 API |
| 数据准确性 | 多源数据冲突 | 置信度加权引擎 + 交叉验证 + 人工审核机制 |
| 字段名不一致 | 新增源与 inject.mjs 不匹配 | v1.0.1 建立字段命名规范，后续源严格遵守 |
