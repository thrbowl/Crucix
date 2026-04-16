# Dashboard 面板参考文档

> 记录 jarvis.html 每个面板的内容、数据来源、生成方式和作用。

---

## 顶栏（Top Bar）`#topbar`

### 威胁等级徽章 `#alertBadge`
- **内容**：当前整体威胁级别文字（LOW / MEDIUM / HIGH / CRITICAL / ELEVATED）
- **生成**：`D.threats.level`，由 inject.mjs 根据各源综合评分计算
- **作用**：SOC 第一眼判断当前态势，决定是否需要立即响应

### 威胁指数 `#threatIndex`
- **内容**：0–100 分值 + 方向箭头（▲/▼）
- **生成**：`D.threats.index`（分值）+ `D.threats.direction`（方向）
- **作用**：量化态势，方向箭头反映趋势（上升/下降/稳定）

### 统计胶囊行（Stats Pills）
| ID | 标签 | 数据来源 |
|----|------|---------|
| `#kevCount` | Active KEVs | `D.cves.kevCount` |
| `#aptCount` | APT/Ransomware Groups | `D.actors.ransomwareGroups.length` |
| `#critCve` | Critical CVEs | `D.cves.criticalCount` |
| `#iocTotal` | Total IOCs | `D.iocs.total` |
| `#sourceStatus` | 数据源状态 X/Y | `D.meta.sourcesOk / D.meta.sourcesQueried` |
| `#sweepPill` | 上次扫描距今 | `D.meta.timestamp` 计算得出 |
| `#deltaPill` | DELTA 方向 | `D.delta.summary.direction` |

- **生成**：`updateTopbar()` 读取 D 对象各字段渲染
- **作用**：不离开顶栏即可掌握全局关键指标

### 元数据
- `#metaTs`：最后更新时间戳（`D.meta.timestamp`）
- `#langSwitch`：中英文切换按钮

---

## 左侧栏

### 1. Sensor Grid `#sensorGrid`
- **内容**：10 张彩色卡片，展示各类威胁指标总数
  - KEV Active（红）、Critical CVE（橙）、IOC Total、C2 Servers（深红）
  - APT Groups（紫）、Geo Markers（蓝）、Phishing URLs（黄）
  - CNCERT Alerts（绿）、CNVD/CNNVD（强调色）、News Items（暗色）
- **生成**：`renderSensorGrid()` 从 `D.cves`、`D.iocs`、`D.actors`、`D.geoAttacks`、`D.chinaIntel`、`D.newsFeed` 读取
- **作用**：一眼扫描全域指标，判断哪个维度有异动

> **注意**：与顶栏 Stats Pills 和右栏 Hot Metrics 存在数据重叠，计划整合（见 v1.3.x 布局优化）

### 2. IOC Monitor `#iocMonitor`
- **内容**：4 行细分
  - 恶意样本数（MalwareBazaar）
  - C2 服务器数（ThreatFox / Feodo）
  - 恶意 IP 数（AbuseIPDB / GreyNoise）
  - 钓鱼 URL 数（PhishTank / URLhaus）
- **生成**：`renderIOCMonitor()` 从 `D.iocs`（malware、c2Count、maliciousIPs、phishCount）
- **作用**：IOC 维度细分，快速定位哪类恶意指标在增加

### 3. CERT Alerts `#certAlertsList`
- **内容**：5 行按机构显示告警数量
  - CISA（红）、ENISA（橙）、CERTs Intl（蓝）、CNCERT（绿）、CNVD+CNNVD（强调色）
- **生成**：`renderCertAlerts()` 从 `D.certAlerts`（cisa、enisa、certs）+ `D.chinaIntel.cncertAlerts` + CNVD/CNNVD 合并计数
- **作用**：按权威机构来源展示告警，判断是否有重大官方预警发布

### 4. Map Layers `#layerToggles`
- **内容**：地理攻击图层的开关列表，每个图层带数量徽章和颜色点
- **生成**：`renderLayers()` 从 `D.geoAttacks` 按 `type` 字段分组统计
- **作用**：控制地图上展示哪些类型的攻击事件，减少视觉噪音

### 5. 数据源健康 `.health-section` / `#healthGrid`
- **内容**：每个数据源一个彩色圆点（绿=正常 / 黄=数据过期 / 红=故障），比例徽章 `#healthBadge`
- **生成**：`renderHealth()` 从 `D.health`（`{n: name, err: boolean, stale: boolean}`数组），`err` 由 `src.status !== 'active'` 得出
- **作用**：监控情报供给链，快速发现哪个数据源掉线或无数据

---

## 中央区域

### 地区 Tab `#regionTabs`
- **内容**：6 个按钮（全球 / 美洲 / 欧洲 / 中东 / APAC / 中国）
- **生成**：点击后过滤 `D.geoAttacks` 并重绘地图
- **作用**：聚焦某个地区的攻击活动

### 地图 `#mapContainer`
- **内容**：带标记点的交互式地图，支持平面（`#flatMap`）和地球仪（`#globeViz`）两种模式，点击标记弹出详情 `#mapPopup`
- **生成**：`drawFlatMap()` / `plotGlobeMarkers()` 从 `D.geoAttacks`（`{type, lat, lon, label, severity, source, cveId, ip}`）渲染
- **作用**：地理维度可视化攻击来源和目标分布，主要用于大屏展示；支持全屏模式

### 底部浮动 Tab `#tabBar`（位于地图区域内）
四个内容 Tab，叠加在地图下方区域：

#### CVE Tab `#tab-cve`
- **内容**：CVE 时间线 / 统计图表（Canvas 渲染）
- **生成**：从 `D.cves.recent` 数组绘制
- **作用**：近期 CVE 趋势可视化

#### ATT&CK Tab `#tab-attack`
- **内容**：MITRE ATT&CK 战术热力图（Canvas 渲染）
- **生成**：从 `D.attackMatrix` 渲染
- **作用**：展示当前观测到的攻击技术覆盖情况

#### Actors Tab `#tab-actors` / `#actorGrid`
- **内容**：勒索软件/APT 组织卡片，显示名称和受害者数量
- **生成**：`renderActors()` 从 `D.actors.ransomwareGroups`（`{name, victimCount}`）
- **下钻**：点击跳转到 Ransomware.live 对应页面
- **作用**：快速掌握活跃威胁行为者及其活动规模

#### China Tab `#tab-china` / `#chinaGrid`
- **内容**：2×2 计数网格（CNCERT告警 / CNVD漏洞 / CNNVD漏洞 / 新闻）+ 最新 CERT 告警列表
- **生成**：`renderChinaIntel()` 从 `D.chinaIntel` + `D.certAlerts.china`
- **下钻**：告警条目点击跳转到 CNCERT/CNVD/CNNVD 原始页面
- **作用**：聚合中国区情报来源，单一入口查看中文威胁信息

### 安全新闻 `#newsGrid`
- **内容**：最多 20 条新闻卡片，显示来源徽章（带颜色）、时间、标题
- **生成**：`renderNewsCards()` 合并 `D.securityNews` + `D.newsFeed`
- **下钻**：点击卡片标题跳转原始文章 URL（`target="_blank"`）
- **数据源颜色**：CISA（红）/ NVD（橙）/ ENISA（黄）/ FreeBuf（绿）/ Anquanke（强调色）/ 4hou（蓝）/ Bluesky（蓝）/ CNCERT（绿）/ OTX（紫）
- **作用**：聚合多语言安全媒体，分析师快速浏览最新动态

### CVE Trends `#trendGrid`
- **内容**：6 项统计卡片
  - 追踪 CVE 总数、高危数量、在 KEV 中的数量、有 PoC 的数量、平均 CVSS 分、近 7 天新增数
- **生成**：`renderCveTrends()` 从 `D.cves`（totalTracked、criticalCount、kevCount、recent 数组）
- **作用**：漏洞维度数字全貌，判断漏洞压力

### AI Threat Brief `#llmBrief`
- **内容**：AI 生成的威胁分析卡片，每张包含：标题、分析摘要、信号标签
- **生成**：`renderLlmBrief()` 从 `D.ideas`（`{title, rationale, content, signals[]}`），由 inject.mjs 调用 LLM 生成
- **作用**：将多源原始数据提炼为可操作的威胁结论，是面板中信息密度最高的分析输出

---

## 右侧栏

### 1. Cross-Source Signals `#signalsList`
- **内容**：关联信号卡片，带严重度徽章（CRITICAL / HIGH / MEDIUM）、标题、描述
- **生成**：`renderSignals()` 从 `D.delta.signals.correlated` + `D.delta.signals.atomic`；若无数据则从 KEV、C2、攻击源等自动生成
- **作用**：**结论层**——多个来源印证同一威胁时触发，信噪比最高，SOC 最优先响应

### 2. Threat Feed `#feedList`
- **内容**：原始威胁条目，按严重度+时间排序，每条显示：级别徽章、来源徽章、时间、标题、类型
- **生成**：`renderFeed()` 从 `D.newsFeed`（sorted by level then timestamp）
- **下钻**：点击条目跳转原始来源 URL（`target="_blank"`）
- **作用**：**原料层**——各数据源的原始输出汇总，信号的证据来源

### 3. Hot Metrics `#hotMetrics`
- **内容**：6 项关键指标（高危CVE / KEV数 / C2数 / 威胁组织数 / 地理标记数 / CERT告警数）
- **生成**：`renderHotMetrics()` 直接读 `D.cves`、`D.iocs`、`D.actors`、`D.geoAttacks`、`D.certAlerts`
- **作用**：与 Sensor Grid 高度重叠，计划在布局优化中合并

### 4. Sweep Delta `#sweepDelta`
- **内容**：本次扫描与上次的变化摘要
  - 新增信号数（按 C/H/M 分级）
  - 数据源变化（新增/失效）
  - 整体威胁级别
  - 升级信号列表（before → after）
- **生成**：`renderSweepDelta()` 从 `D.delta`（summary、signals.atomic with direction='escalated'）
- **作用**：告诉分析师「这次扫描发现了什么新变化」，是持续监控场景下最关键的差异化信息

---

## 底部

### Ticker `#tickerBar`
- **内容**：横向无限滚动的威胁标题条，附严重度徽章（[CRITICAL] / [HIGH] 等）
- **生成**：`renderTicker()` 从 `D.newsFeed` 取前 30 条，内容复制一份实现无缝循环
- **作用**：大屏展示时背景信息流，不需要交互即可持续呈现最新动态

---

## 数据流概览

```
数据源 (36个) → briefing.mjs → runs/latest.json
                                      ↓
                              inject.mjs (数据整合+LLM分析)
                                      ↓
                            server.mjs (currentData)
                              ↙              ↘
                    GET /api/data          SSE /events
                          ↓                    ↓
                  jarvis.html 初始加载    实时推送更新
                          ↓                    ↓
                       let D = {}  ←──  updateAll()
```

---

## 面板与 D 对象字段映射

| 面板 | D 字段 |
|------|--------|
| 威胁等级/指数 | `D.threats` |
| Sensor Grid | `D.cves`, `D.iocs`, `D.actors`, `D.geoAttacks`, `D.chinaIntel`, `D.newsFeed` |
| IOC Monitor | `D.iocs` |
| CERT Alerts | `D.certAlerts`, `D.chinaIntel` |
| Map | `D.geoAttacks` |
| Actors | `D.actors.ransomwareGroups` |
| China | `D.chinaIntel`, `D.certAlerts.china` |
| News Grid | `D.securityNews`, `D.newsFeed` |
| CVE Trends | `D.cves` |
| AI Brief | `D.ideas` |
| Signals | `D.delta.signals` |
| Threat Feed | `D.newsFeed` |
| Hot Metrics | `D.cves`, `D.iocs`, `D.actors`, `D.geoAttacks`, `D.certAlerts` |
| Sweep Delta | `D.delta` |
| Health Grid | `D.health` |
| Ticker | `D.newsFeed` |
