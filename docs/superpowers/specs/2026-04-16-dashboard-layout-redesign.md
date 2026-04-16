# Dashboard Layout Redesign — Design Spec

**Date:** 2026-04-16  
**Status:** Approved  
**Scope:** jarvis.html 布局重构 + inject.mjs 数据结构调整

---

## 目标

将 dashboard 从当前「地图为中心、信息散落三处」的结构，改造为「持续监控优先、首屏信息完整、全面支持下钻」的 SOC 监控面板。同时为未来新增数据源做好扩展性设计。

---

## 设计约束

- **主要场景**：持续盯屏监控（SOC 值班）
- **运行环境**：个人工作站（可交互）+ 大屏投屏（只看不点）两者都支持
- **优先信息**：威胁级别变化 / 触发数据源 / IOC 指标 — 优先级相当
- **地图定位**：保留但降级，主要用于大屏展示，非分析核心
- **下钻方式**：新标签页打开源地址（`target="_blank"`）
- **扩展性**：新增数据源后，前端不需要改代码

---

## 布局设计

### 整体结构

```
┌─────────────────────────────────────────────────────────────────┐
│  TOP BAR: 威胁等级 | Delta方向 | 源健康比例 | Sweep计时 | 时间戳  │
│  STATS ROW: [KEV] [Critical CVE] [IOC] [C2] [APT] [CERT] [Geo] │
├───────────────┬─────────────────────────┬───────────────────────┤
│  左栏(状态)   │  中央(核心情报)          │  右栏(实时流)          │
│               │                         │                       │
│ 源健康        │  地图 (~35% 高度)        │  Cross-Source Signals │
│ (按域分组)    │  [全屏按钮] [平面/球切换]│  (CRITICAL 优先)      │
│               │  Map Layers 控件         │                       │
│ CERT Alerts   │  (内嵌在地图正下方)      │  ────────────────     │
│ (动态列表)    │                         │                       │
│               │  AI Brief               │  Threat Feed          │
│ IOC Monitor   │  (首屏可见)             │  (原始条目流)          │
│               │                         │                       │
│               │  Sweep Delta            │                       │
│               │  (首屏可见)             │                       │
│               │                         │                       │
│               │  ── 以下可滚动 ──        │                       │
│               │  [CVE][ATT&CK][Actors]  │                       │
│               │  [China] Tab 区          │                       │
│               │  CVE Trends             │                       │
│               │  News Grid              │                       │
└───────────────┴─────────────────────────┴───────────────────────┘
│               BOTTOM TICKER                                     │
└─────────────────────────────────────────────────────────────────┘
```

### 三栏职责

| 栏 | 职责 | 面板 |
|----|------|------|
| 左栏 | 运行状态（数据供给链是否健康） | 源健康、CERT Alerts、IOC Monitor |
| 中央 | 核心情报（发生了什么、AI分析） | 地图、AI Brief、Sweep Delta、Tab区、CVE Trends、News |
| 右栏 | 实时流（原始信号和条目） | Cross-Source Signals、Threat Feed |

---

## 删除/合并的面板

| 面板 | 处理方式 | 原因 |
|------|---------|------|
| Sensor Grid | 删除 | 与 Stats Row + Hot Metrics 完全重叠 |
| Hot Metrics | 删除 | 与 Sensor Grid 完全重叠 |
| 顶栏 4 个计数胶囊（KEV/APT/CVE/IOC） | 删除 | 移入 Stats Row，不重复展示 |
| Map Layers 控件（左栏） | 移位 | 移到地图正下方，就近原则 |
| 底部 Tab 叠在地图上 | 改为地图下方 Tab 区 | 消除视觉遮挡 |

---

## Stats Row

顶栏正下方一行数字胶囊，数据驱动（配置数组）：

```js
// inject.mjs 或 jarvis.html 内定义
const STATS_CONFIG = [
  { label: 'KEV',          getValue: d => d.cves?.kevCount,                   color: 'red'     },
  { label: 'Critical CVE', getValue: d => d.cves?.criticalCount,              color: 'orange'  },
  { label: 'IOC',          getValue: d => d.iocs?.total,                      color: 'accent'  },
  { label: 'C2',           getValue: d => d.iocs?.c2Count,                    color: 'darkred' },
  { label: 'APT',          getValue: d => d.actors?.ransomwareGroups?.length,  color: 'purple'  },
  { label: 'CERT',         getValue: d => d.certAlerts?.total,                color: 'green'   },
  { label: 'Geo',          getValue: d => d.geoAttacks?.length,               color: 'blue'    },
];
```

新增数据源带来新指标时，只在 STATS_CONFIG 加一项，布局自动适配（flex wrap）。

---

## 地图

- 高度从 ~60% 缩减到 ~35%
- 右上角加全屏按钮（⛶），点击后 `position:fixed; inset:0; z-index:9999`，再点或按 Esc 退出
- 平面/地球仪切换按钮保留
- Map Layers 控件移到地图正下方（不再在左侧栏）

---

## 下钻支持

### 设计原则

`sourceUrl` 字段由 inject.mjs 在生成每条数据时附加，jarvis.html 统一读 `item.url || item.sourceUrl`，不感知具体数据源。新增数据源只需在 inject.mjs 输出时带上 URL，前端无需改动。

### 各面板下钻规则

| 面板 | 点击目标 | 跳转目标 |
|------|---------|---------|
| CERT Alerts | 每条告警 | `item.url`（告警原始页） |
| IOC Monitor — Malware 行 | 标题 | MalwareBazaar 搜索页 |
| IOC Monitor — C2 行 | 标题 | ThreatFox 搜索页 |
| IOC Monitor — IP 行 | 标题 | AbuseIPDB 搜索页 |
| IOC Monitor — Phishing 行 | 标题 | PhishTank 搜索页 |
| Threat Feed | 每条条目 | `item.url` |
| News Grid | 每张卡片标题 | `item.url` |
| Actors | 每个组织卡片 | `https://ransomware.live/group/<name>` |
| China Tab — CERT 告警 | 每条 | `item.url` |
| CVE Trends — KEV 卡片 | 卡片 | CISA KEV catalog |
| CVE Trends — Critical 卡片 | 卡片 | NVD 高危搜索 |
| AI Brief | 每张卡片 | `signals[0].url`（若有） |
| Health Grid | 每个源 | 数据源官网（inject.mjs 固定映射） |
| Sweep Delta — 升级信号 | 每条 | 信号关联 URL（若有） |
| 地图 Popup | 「查看详情」按钮 | CVE → NVD；IP → AbuseIPDB |
| Signals | signal 标签 | `signal.url`（若有） |

### 视觉规则
- 可点击条目：`cursor: pointer` + hover `opacity: 0.85`
- 不加下划线（保持现有暗色风格）
- 所有链接：`target="_blank" rel="noopener noreferrer"`

---

## 扩展性设计

### Health Grid — 按域分组

```
Domain 1: Vuln Intel      ●●●●●●  6/6
Domain 2: Threat Actors   ●●●●●○  5/6  ← 点击展开
  ├ OTX          ●
  ├ MalwareBazaar ●
  └ VirusTotal   ○ (inactive: no_key)
Domain 3: Attack/Exposure ●●●●●●●● 8/8
...
```

- 默认展示域级别（域名 + 健康比例 + 汇总圆点）
- 点击域行展开，看每个源的状态圆点和 reason
- `D.health` 结构改为 `[{ domain, label, sources: [{n, err, stale, reason}] }]`
- 新增数据源加入对应域后自动出现，模板不变

### CERT Alerts — 动态列表

`D.certAlerts` 改为：
```js
{
  total: number,
  items: [{ source: 'CISA', label: 'CISA', count: 12, color: 'red', alerts: [...] }, ...]
}
```
渲染时遍历 `items`，新增 CERT 源后自动出现，不需要改模板。

### News Grid / Threat Feed — 固定上限

条目数量随源增多会膨胀，保持上限：News 20 条，Feed 30 条，inject.mjs 截断，布局稳定。

---

## 数据结构变更（inject.mjs）

| 字段 | 变更 |
|------|------|
| `D.health` | 从平铺数组改为按域分组：`[{domain, label, sources:[]}]` |
| `D.certAlerts` | 从固定字段（cisa/enisa/certs/china）改为动态 `items` 数组 |
| `D.newsFeed[].sourceUrl` | 新增字段，由各源注入，供下钻使用 |
| `D.certAlerts.items[].alerts[].url` | 确保每条告警带有原始链接 |

---

## 实现任务顺序

| Task | 文件 | 内容 |
|------|------|------|
| 1 | `inject.mjs` | D.health 按域分组；D.certAlerts 动态化；每条数据附加 sourceUrl |
| 2 | `jarvis.html` | 三栏布局重构；地图缩小；AI Brief / Sweep Delta 上移至首屏；Tab 区移出地图叠层 |
| 3 | `jarvis.html` | Stats Row 实现；删除 Sensor Grid、Hot Metrics；顶栏精简 |
| 4 | `jarvis.html` | 全面下钻链接支持 |
| 5 | `jarvis.html` | Health Grid 按域分组折叠 |

---

## 不变的内容

- `apis/briefing.mjs` — 不动
- `apis/sources/*.mjs` — 不动
- `server.mjs` — 不动
- Bottom Ticker — 保留，行为不变
- Signals 面板 — 保留，结构不变，加 signal 标签下钻
- ATT&CK Tab — 保留，内容不变
