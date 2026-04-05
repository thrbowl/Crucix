# Crucix v1.0.1 / v1.1.0 / v1.2.0 — 数据修复 + 大屏重塑 + 国际化 设计文档

**日期：** 2026-04-05
**状态：** 已确认
**背景：** 当前 v1.0.0 仪表盘存在三个核心问题：数据全为 0（源代码 bug + 字段名不匹配）、地球仪过小且布局空洞、Intelligence Feed 仍显示通用新闻而非安全资讯。

---

## 问题诊断

### 1. 数据源状态（42 个源）

**有效数据的 15 个源：**
CISA-KEV(20 vulns), NVD(30 CVEs), EPSS(50 high-risk), GitHub-Advisory(30), OSV(26), OTX(30 pulses), Feodo(12 C2s，但字段名不匹配), AbuseIPDB(50 IPs), Spamhaus(12), Ransomware-Live(50+ victims), CISA-Alerts(30), VirusTotal, Shodan, Anquanke(20), 4hou(20)

**字段名不匹配（inject.mjs 读不到数据）：**

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
- ThreatBook：API 首请求未传 apikey 参数
- Qianxin：API 失败 + RSS 不可达时错误返回 "no_credentials"
- ZoomEye：凭证检测逻辑有误
- FOFA：凭证检测逻辑有误
- ACLED：认证流程 bug

**真正缺 Key（3 个）：** GreyNoise, Shadowserver, CNVD

**免费源但返回空数据（8 个）：**
MalwareBazaar, ThreatFox, URLhaus, ATT&CK-STIX, ExploitDB(XML 截断), PhishTank, ENISA, BGP-Ranking

**RSS / 网页抓取失败（3 个）：** CNCERT, CNNVD, FreeBuf

**超时（2 个）：** Bluesky, Telegram

### 2. 布局问题

当前 jarvis.html 布局：
- 地球仪被压到右上角约 25% 面积
- 左侧是图层开关列表 + Source Health 列表（信息密度低）
- 中间 Intelligence Feed 占据大面积但内容是通用新闻
- 底部面板区域未充分利用

原版 CRUCIX MONITOR 布局（用户偏好）：
- 地球仪占据中央 60%+ 面积
- 左侧 Sensor Grid 有丰富实时计数
- 右侧 Cross-Source Signals + OSINT Stream
- 底部 Live News Ticker
- 整体数据密度高、视觉冲击力强

### 3. 非安全内容残留

`fetchAllNews()` 仍拉取 19 个通用 RSS（BBC, NYT, France 24 等），导致 Intelligence Feed 全部为普通新闻。

---

## 设计方案

### v1.0.1 — 数据修复（2-3 天）

**策略：** 只修 bug 不改布局，让数据"活"起来。

#### 修改清单

**1. inject.mjs 字段名对齐（7 处）：**

统一策略：在 inject.mjs 的 build* 函数中兼容两种字段名（优先读源实际返回的字段）。

```javascript
// 示例：Feodo
const c2List = data.sources.Feodo?.c2Servers || data.sources.Feodo?.activeC2s || [];
const c2Online = data.sources.Feodo?.onlineC2s || data.sources.Feodo?.onlineC2Count || 0;

// 示例：ThreatFox
const tfIOCs = data.sources.ThreatFox?.iocs || data.sources.ThreatFox?.recentIOCs || [];

// 示例：URLhaus
const uhUrls = data.sources.URLhaus?.recentUrls || data.sources.URLhaus?.activeUrls || [];
const uhOnline = data.sources.URLhaus?.totalUrls || data.sources.URLhaus?.onlineCount || 0;

// 示例：PhishTank
const ptUrls = data.sources.PhishTank?.recentPhish || data.sources.PhishTank?.urls || data.sources.PhishTank?.recentPhishing || [];

// 示例：FreeBuf
const fbArticles = data.sources.FreeBuf?.recentArticles || data.sources.FreeBuf?.articles || data.sources.FreeBuf?.items || [];

// 示例：Qianxin
const qxThreats = data.sources.Qianxin?.recentThreats || data.sources.Qianxin?.threats || data.sources.Qianxin?.items || [];
```

**2. 源代码修复（13 个源文件，ACLED 移除不修复）：**

| 文件 | 修复内容 |
|------|---------|
| `threatbook.mjs` | 修复 API 调用传参，确保 apikey 参数传入 |
| `qianxin.mjs` | 修复错误处理逻辑，API 失败不应返回 "no_credentials" |
| `zoomeye.mjs` | 修复凭证检测逻辑 |
| `fofa.mjs` | 修复凭证检测逻辑 |
| ~~`acled.mjs`~~ | 移除（非网安数据）→ 归档到 `_archived/` |
| `malwarebazaar.mjs` | 修复数据解析，确保 recentSamples 有值 |
| `threatfox.mjs` | 修复数据解析 |
| `urlhaus.mjs` | 修复数据解析 |
| `attack-stix.mjs` | 输出 `tactics` 和 `techniques` 数组 |
| `exploitdb.mjs` | 修复 XML 解析（fetch 工具截断问题） |
| `phishtank.mjs` | 修复解析逻辑 |
| `enisa.mjs` | 修复 RSS 解析 + 兜底 |
| `cncert.mjs` | 修复 RSS 抓取策略 |
| `freebuf-rss.mjs` | 修复 RSS URL 或改用备用抓取 |

**3. RSS 替换（inject.mjs `fetchAllNews()`）：**

替换全部通用 RSS 为安全类源：

| 类别 | RSS 源 |
|------|-------|
| 国际安全媒体 | The Hacker News, BleepingComputer, Krebs on Security, Dark Reading, SecurityWeek, Threatpost |
| 官方通报 | CISA Alerts RSS, US-CERT, ENISA News |
| 中国安全媒体 | FreeBuf RSS, 安全客 RSS, 嘶吼 RSS |
| 社区 | Reddit r/netsec, r/cybersecurity |

**4. 清理非安全数据残留：**
- `locales/en.json` 中旧 OSINT 词条（OPENSKY, FRED 等）删除
- 确认 `_archived/` 目录下旧源未被引用
- 移除 ACLED 冲突数据源：从 `briefing.mjs` 中去掉 ACLED import 和 runSource 调用，从 `inject.mjs` 中去掉 `acled` 相关合成逻辑和 `buildGeoAttacks` 中的 conflict 标记。ACLED 是地缘政治冲突数据，不属于网络安全情报范畴
- 删除 `apis/sources/acled.mjs` 或移至 `_archived/`
- `.env` / `.env.example` 中的 `ACLED_EMAIL` / `ACLED_PASSWORD` 标记为废弃或删除

#### 验收标准
- [ ] 至少 30/41 源返回有效数据（ACLED 已移除，总源数从 42 降至 41）
- [ ] 顶部状态栏 Active KEVs / APT Groups / Critical CVEs / Total IOCs 不再全为 0
- [ ] Intelligence Feed 全部为安全相关内容
- [ ] 地球仪上有来自 Feodo C2、AbuseIPDB、Ransomware-Live 的地理标记点

---

### v1.1.0 — 大屏重塑（4-5 天）

**策略：** 融合原版 CRUCIX MONITOR 的大布局风格与当前网安专业面板。

#### 布局设计

```
┌──────────────────────────────────────────────────────────────────────┐
│ CRUCIX MONITOR  [威胁指数█████ 72]  KEV:12  APT:5  CVE:30  IOC:186 │
│                  SWEEP 30s  Apr 5 14:21  Sources 36/42  [GLOBAL ▾]  │
├──────────┬───────────────────────────────────┬───────────────────────┤
│ SENSOR   │                                   │ CROSS-SOURCE SIGNALS  │
│ GRID     │                                   │                       │
│          │                                   │ SIGNAL 1              │
│ ● CVEs   │        3D GLOBE                   │ 漏洞武器化预警：      │
│   30     │        (60%+ 面积)                │ NVD + PoC + GreyNoise│
│ ● IOCs   │                                   │                       │
│   186    │        攻击弧线                    │ SIGNAL 2              │
│ ● C2     │        多类型标记                  │ C2 基础设施扩张...    │
│   45     │        实时动画                    │                       │
│ ● Ransom │                                   │ SIGNAL 3              │
│   12     │                                   │ 中国区高置信威胁...   │
│ ● Phish  │                                   ├───────────────────────┤
│   28     │                                   │ ALERT STREAM          │
│ ● CERT   │           标记图例                 │                       │
│   8      │  ● C2  ● 攻击源  ● 受害者  ● APT │ [CRIT] CVE-2026-xxxx │
│          │  ● 蜜罐 ● 暴露 ● CERT ● BGP     │ [HIGH] Ransomware... │
│ LAYERS   │                                   │ [MED]  Phishing...   │
│ [开关]   │                                   │ [LOW]  CERT alert... │
├──────────┴───────────────────────────────────┴───────────────────────┤
│ [CVE Timeline] [ATT&CK Heatmap] [Threat Actors] [China Intel] [LLM]│
│ ═══════════════════════════════════════════════════════════════════  │
│                    (Tab 切换面板区域)                                 │
├──────────────────────────────────────────────────────────────────────┤
│ ▶ SECURITY TICKER: CVE-2026-1234 actively exploited │ LockBit claims│
└──────────────────────────────────────────────────────────────────────┘
```

#### 地球仪增强

新增地理标记类型（补充现有 6 类）：
- APT 组织活动区域（紫色脉冲，来自 OTX pulses 的 geo 关联）
- 钓鱼目标国家（粉色点，来自 PhishTank）
- 漏洞利用热区（橙色热力，来自 EPSS 高分 CVE 影响的厂商/地区）
- 中国安全事件（金色点，来自 CNCERT/CNVD/CNNVD）

攻击弧线动画：从攻击源到受害者画 3D 弧线。

#### 验收标准
- [ ] 地球仪占据页面中心 60%+ 面积
- [ ] 左侧 Sensor Grid 所有计数器有实际数据
- [ ] 右侧 Signals + Alert Stream 有内容滚动
- [ ] 整体数据密度和视觉冲击力接近原版 CRUCIX MONITOR 截图
- [ ] 底部 Tab 面板切换正常
- [ ] 底部安全新闻 Ticker 滚动

---

### v1.2.0 — 国际化（3-4 天）

#### 实现方案

**服务端（已有基础设施）：**
- `lib/i18n.mjs` 已提供 `getLocale()`, `t()`, `getSupportedLocales()`
- `server.mjs` 已注入 `window.__CRUCIX_LOCALE__`
- 只需新增 `locales/zh.json` + 更新 `en.json` + `SUPPORTED_LOCALES` 添加 `zh`

**前端改造：**
- jarvis.html 中所有硬编码英文文案替换为 `t('key')` 调用
- 消费 `window.__CRUCIX_LOCALE__` 对象
- 顶栏添加 ZH/EN 切换按钮，切换时重新渲染文案（不刷新页面）
- 时间格式化 `toLocaleString` 根据语言动态切换

**翻译策略：**
- 专业缩写保留英文：CVE, IOC, APT, C2, EPSS, KEV, STIX, ATT&CK
- 面板标题、状态文案、告警级别等翻译为中文
- 数据源名称保留英文（NVD, CISA, OTX 等）

#### 验收标准
- [ ] 中英文一键切换，不刷新页面
- [ ] 中文界面无遗漏英文硬编码
- [ ] 安全术语缩写保持英文
- [ ] `.env` 中 `CRUCIX_LANG=zh` 可设置默认语言

---

## 时间线

| 版本 | 里程碑 | 完成标准 | 预计 |
|------|--------|---------|------|
| **v1.0.1** | 数据复活 | 30+ 源有数据，指标非 0，安全 RSS | 2-3 天 |
| **v1.1.0** | 大屏重塑 | 地球仪居中，融合布局，数据密度达标 | 4-5 天 |
| **v1.2.0** | 国际化 | 中英文切换完整可用 | 3-4 天 |

**总计：** 9-12 天

---

## 文件变更预览

### v1.0.1
```
修改:
  dashboard/inject.mjs              (字段名对齐 + RSS 替换)
  apis/sources/threatbook.mjs       (API 传参修复)
  apis/sources/qianxin.mjs          (错误处理修复)
  apis/sources/zoomeye.mjs          (凭证检测修复)
  apis/sources/fofa.mjs             (凭证检测修复)
  apis/sources/acled.mjs            (认证流程修复)
  apis/sources/malwarebazaar.mjs    (数据解析修复)
  apis/sources/threatfox.mjs        (数据解析修复)
  apis/sources/urlhaus.mjs          (数据解析修复)
  apis/sources/attack-stix.mjs      (输出结构修复)
  apis/sources/exploitdb.mjs        (XML 解析修复)
  apis/sources/phishtank.mjs        (解析修复)
  apis/sources/enisa.mjs            (RSS 兜底)
  apis/sources/cncert.mjs           (抓取策略修复)
  apis/sources/freebuf-rss.mjs      (RSS 修复)
  apis/briefing.mjs                 (移除 ACLED)
  locales/en.json                   (清理旧词条)
  .env.example                      (移除 ACLED 变量)

删除/归档:
  apis/sources/acled.mjs            (移至 _archived/)
```

### v1.1.0
```
修改:
  dashboard/public/jarvis.html      (全面布局重构)
  dashboard/inject.mjs              (新增地理标记类型)
```

### v1.2.0
```
新建:
  locales/zh.json
修改:
  lib/i18n.mjs                      (添加 zh 支持)
  dashboard/public/jarvis.html      (i18n 消费)
  locales/en.json                   (补全网安术语)
  .env.example                      (CRUCIX_LANG)
```
