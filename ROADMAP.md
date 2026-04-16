# Crucix Cybersecurity Edition — 版本发布路线图

**更新日期：** 2026-04-16  
**当前版本：** v1.4.0

---

## 版本总览

```
v0.1.0  基础骨架     ✅  ── 配置 / 认证 / 目录结构 / 标准化层
  │
v0.2.0  核心情报     ✅  ── 域 1-3（23 源）漏洞 + 威胁行为者 + 攻击活动
  │
v0.3.0  全源就位     ✅  ── 域 4-5（19 源）事件追踪 + 中国情报 + 旧源清理
  │
v0.5.0  引擎上线     ✅  ── Delta 三层信号模型 + 四级告警体系
  │
v0.8.0  大屏交付     ✅  ── 仪表板重设计 + 地球仪 + 四专项面板 + LLM 简报
  │
v1.0.0  正式发布     ✅  ── IOC 导出 / REST API / 报告生成 / Watchlist / Bot 命令
  │
v1.0.1  数据修复     ✅  ── 字段名对齐 / 源 bug 修复 / 安全 RSS / 非安全数据清理
  │
v1.1.0  大屏重塑     ✅  ── 地球仪居中放大 / 融合原版布局 / 数据密度提升
  │
v1.2.0  国际化       ✅  ── zh.json / 前端 i18n / 中英文切换
  │
v1.2.1  源健康修复   ✅  ── 失效源修复 / 限流缓存 / 搜索词纠正 / 低效源清理
  │
v1.2.2  状态统一     ✅  ── active/inactive 规范化 / 原因分类 / 健康图更新
  │
v1.3.0  面板重设计   ✅  ── SOC 监控优先布局 / Stats Row / Health 域分组 / 全面下钻
  │
v1.4.0  数据源扩展   ✅  ── 6 域 49 源（+15 新源文件）CERT 扩展 / 搜索情报 / 厂商公告
  │
v1.5.0  智能化分析       ── ML 威胁预测 / 自动归因 / 知识图谱 / 暗网监控 / NL 查询
```

---

## v1.2.2 — 源状态统一 ✅

> **目标：** 统一全部 36 个数据源的返回状态值，将 10+ 种不一致状态字符串规范化为两种：`status: 'active'`（有数据）和 `status: 'inactive'`（无数据，附原因码）。

### 功能清单

| 模块 | 功能 |
|------|------|
| **`inferReason()`** | 将错误消息/状态字符串启发式映射为 `no_key`/`unreachable`/`api_error`/`rate_limited`/`geo_blocked` |
| **`normalizeSourceData()`** | 将所有遗留状态值规范化为 `active`/`inactive` |
| **`sourcesOk` 修正** | 改为统计 `data.status === 'active'` 的源数，新增 `sourcesInactive` 字段 |
| **`inject.mjs` 健康图** | `err` 从 `Boolean(src.error)` 改为 `src.status !== 'active'`，新增 `reason` 字段 |

### 验收标准

- [x] `briefing.mjs` 中所有源输出数据均带 `status: 'active'` 或 `status: 'inactive'`
- [x] `sourcesOk` 仅计算有真实数据的源
- [x] `inject.mjs` 健康状态用 `src.status !== 'active'` 判断

---

## v1.3.0 — 面板重设计 ✅

> **目标：** 将 dashboard 从「地图为中心、信息散落三处」改造为「持续监控优先、首屏信息完整、全面支持下钻」的 SOC 监控面板，同时为未来新增数据源做好扩展性设计。

### 功能清单

| 模块 | 功能 |
|------|------|
| **三栏布局重构** | 左栏（运行状态）/ 中央（核心情报）/ 右栏（实时流）；地图缩减至 35vh |
| **Stats Row** | 顶栏下方数字胶囊行，`STATS_CONFIG` 数组驱动，新增源自动适配 |
| **AI Brief 上移** | 移至首屏可见区域（地图正下方） |
| **Sweep Delta 上移** | 移至首屏可见区域，告知分析师本次扫描变化 |
| **删除冗余面板** | 移除 Sensor Grid、Hot Metrics（与 Stats Row 完全重叠） |
| **Map Layers 内嵌** | 从左侧栏移至地图正下方，就近控制 |
| **地图全屏按钮** | 一键全屏（`position:fixed; inset:0`），Esc 退出 |
| **Health 域分组** | 按 5 个域分组展示，点击展开查看单源状态，新增源自动出现 |
| **CERT Alerts 动态化** | `D.certAlerts` 改为 `items` 数组，新增 CERT 源自动出现 |
| **全面下钻链接** | 所有面板条目支持 `target="_blank"` 跳转原始来源 |

### 验收标准

- [x] 三栏布局正确，地图 35vh，首屏可见 AI Brief + Sweep Delta
- [x] Stats Row 显示 7 项指标，数据正确
- [x] Health Grid 按域分组，可展开/折叠，源链接有效
- [x] CERT Alerts 动态渲染，无硬编码 CERT 来源
- [x] 所有可点击条目有 cursor:pointer + 下钻链接
- [x] Sensor Grid 和 Hot Metrics 已删除

### 文件变更

```
修改:
  dashboard/inject.mjs              (D.certAlerts 动态化；D.health 域分组；SOURCE_HOME_URLS)
  dashboard/public/jarvis.html      (三栏布局；Stats Row；地图全屏；域分组健康视图；全面下钻)
新建:
  docs/dashboard-panels.md          (面板参考文档)
  docs/superpowers/specs/2026-04-16-dashboard-layout-redesign.md
```

---

## v1.4.0 — 数据源扩展 ✅

> **目标：** 将数据源从 35 个扩展至 49 个，新增域 6（厂商公告），覆盖 AI 搜索情报、国际/国内厂商公告、漏洞增强数据、沙箱分析等，同时扩展国际 CERT 覆盖范围和攻击暴露监控能力。

### 变更摘要

- **移除 4 源：** BGP-Ranking、Bluesky、Shadowserver、PhishTank（低效/不稳定）
- **新增 15 源文件 + 1 扩展：** 净增 14 源，总计 49 活跃源
- **新增域 6：** 厂商公告（Vendors-Intl + Vendors-CN）

### 新增源清单

| 源 | 域 | 说明 |
|----|-----|------|
| `hackernews-rss.mjs` | D4 | The Hacker News RSS |
| `bleepingcomputer-rss.mjs` | D4 | BleepingComputer RSS |
| `securityweek-rss.mjs` | D4 | SecurityWeek RSS |
| `openphish.mjs` | D3 | OpenPhish 钓鱼 URL feed（替换 PhishTank） |
| `dshield.mjs` | D3 | SANS ISC DShield 蜜罐攻击数据 |
| `tavily.mjs` | D4 | Tavily AI 主动搜索（8 查询/次） |
| `qianxin-hunter.mjs` | D5 | 奇安信 Hunter 资产搜索 |
| `qianxin-ti.mjs` | D5 | 奇安信威胁情报（APT/IOC/恶意软件） |
| `baidu-search.mjs` | D5 | 百度千帆搜索（5 中文安全关键词） |
| `vulncheck.mjs` | D1 | VulnCheck KEV + NVD2 漏洞利用数据 |
| `circl-cve.mjs` | D1 | CIRCL CVE Search（最新 30 CVE） |
| `circl-pdns.mjs` | D2 | CIRCL 被动 DNS（C2 基础设施分析） |
| `hybrid-analysis.mjs` | D2 | Hybrid Analysis 沙箱分析 feed |
| `malpedia.mjs` | D2 | Malpedia 恶意软件家族参考库 |
| `censys.mjs` | D3 | Censys 互联网扫描暴露面监控 |
| `vendors-intl.mjs` | D6 | 10 家国际厂商 RSS 聚合 |
| `vendors-cn.mjs` | D6 | 7 家国内厂商 RSS 聚合 |
| `certs-intl.mjs`（扩展）| D4 | CERT 扩展：+NCSC、BSI、ACSC、ANSSI |

### 验收标准

- [x] 总活跃源数达到 49 个（6 域）
- [x] 新源按域注册到 `briefing.mjs`，通过标准化层输出
- [x] `D.health` 域分组涵盖新域 6（前端无需改动）
- [x] `inject.mjs` SOURCE_HOME_URLS、HEALTH_DOMAINS、新闻函数全部更新

### 文件变更

```
新建（源文件）:
  apis/sources/hackernews-rss.mjs
  apis/sources/bleepingcomputer-rss.mjs
  apis/sources/securityweek-rss.mjs
  apis/sources/openphish.mjs
  apis/sources/dshield.mjs
  apis/sources/tavily.mjs
  apis/sources/qianxin-hunter.mjs
  apis/sources/qianxin-ti.mjs
  apis/sources/baidu-search.mjs
  apis/sources/vulncheck.mjs
  apis/sources/circl-cve.mjs
  apis/sources/circl-pdns.mjs
  apis/sources/hybrid-analysis.mjs
  apis/sources/malpedia.mjs
  apis/sources/censys.mjs
  apis/sources/vendors-intl.mjs
  apis/sources/vendors-cn.mjs

修改:
  apis/sources/certs-intl.mjs      （扩展至 7 家 CERT）
  apis/briefing.mjs                （注册全量源，移除 4 旧源）
  dashboard/inject.mjs             （HEALTH_DOMAINS 6 域、SOURCE_HOME_URLS、新闻函数）
  .env.example                     （新增 12 个密钥桩）
```

---

## v1.5.0 — 智能化分析（规划中，v1.4.0 后）

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

### 验收标准

- [ ] ML 模型可对已知 KEV 历史数据进行回测，准确率 > 70%
- [ ] 自动归因在已知 APT 组织上精确率 > 60%
- [ ] 知识图谱可视化可展示 CVE-Actor-IOC 三层关系
- [ ] NL 查询返回结构化情报摘要

---

## 版本里程碑

| 版本 | 里程碑 | 完成标准 | 状态 |
|------|--------|---------|------|
| **v0.1.0** | 骨架就绪 | 配置 + auth + 标准化层 | ✅ 已完成 |
| **v0.2.0** | 核心源上线 | 23 个安全源可拉取标准化数据 | ✅ 已完成 |
| **v0.3.0** | 全源就位 | ~42 源运行，旧源清除 | ✅ 已完成 |
| **v0.5.0** | 引擎改造 | 三层信号 + 四级告警输出正确 | ✅ 已完成 |
| **v0.8.0** | 大屏交付 | 仪表板 + 地球仪 + 面板可视化 | ✅ 已完成 |
| **v1.0.0** | 正式发布 | IOC 导出 + API + 日报 + Watchlist + Bot | ✅ 已完成 |
| **v1.0.1** | 数据复活 | 30+ 源有效数据，安全 RSS，指标非 0 | ✅ 已完成 |
| **v1.1.0** | 大屏重塑 | 地球仪居中，融合布局，数据密度达标 | ✅ 已完成 |
| **v1.2.0** | 国际化 | 中英文切换完整可用 | ✅ 已完成 |
| **v1.2.1** | 源健康修复 | 32+ 有效源，Bluesky 词纠正，CISA 恢复 | ✅ 已完成 |
| **v1.2.2** | 状态统一 | active/inactive 规范化，sourcesOk 修正 | ✅ 已完成 |
| **v1.3.0** | 面板重设计 | SOC 布局、Stats Row、域分组健康、全面下钻 | ✅ 已完成 |
| **v1.4.0** | 数据源扩展 | 49 活跃源，6 域，15 新源文件，前端零改动适配 | ✅ 已完成 |
| **v1.5.0** | 智能化 | ML + 知识图谱 + 暗网 + NL 查询 | 待规划（v1.4.0 后） |
