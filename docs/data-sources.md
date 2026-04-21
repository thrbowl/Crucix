# Crucix 数据源说明文档

**更新日期：** 2026-04-17  
**当前版本：** v1.4.0  
**活跃源数量：** 49 个（6 域）

---

## 状态说明

| 状态 | 含义 |
|------|------|
| ✅ active | 数据正常拉取中 |
| ⚠️ no_key | 需要 API Key，当前未配置 |
| 🔑 key_set | Key 已配置，功能完整 |
| ❌ disabled | 已从 briefing.mjs 移除（文件保留，未启用） |
| 💔 api_broken | API 端点失效，等待厂商修复 |

---

## 域 1 — 漏洞情报（Vuln Intel）

| 名称 | 源 ID | API / Feed URL | 内容类型 | 需要 Key | 注册地址 | ENV 变量 | 当前 Key | 状态 |
|------|--------|---------------|---------|---------|---------|---------|---------|------|
| CISA KEV | `CISA-KEV` | `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json` | 已知被利用漏洞目录（JSON） | 否 | — | — | — | ✅ active |
| NVD | `NVD` | `https://services.nvd.nist.gov/rest/json/cves/2.0` | CVE 漏洞详情（CVSS/CWE） | 可选（提升速率） | https://nvd.nist.gov/developers/request-an-api-key | `NVD_API_KEY` | `b5f46b00-bc08-40d6-b03d-a38ea4734807` | 🔑 key_set |
| EPSS | `EPSS` | `https://api.first.org/data/v1/epss` | CVE 被利用概率评分 | 否 | — | — | — | ✅ active |
| GitHub Advisory | `GitHub-Advisory` | `https://api.github.com/advisories` | 开源软件安全公告 | 可选（提升速率） | https://github.com/settings/tokens | `GITHUB_TOKEN` | 未配置 | ⚠️ no_key（降级为匿名 60req/h） |
| ExploitDB | `ExploitDB` | `https://www.exploit-db.com/rss.xml` | 公开 PoC / exploit 代码 | 否 | — | — | — | ✅ active |
| OSV | `OSV` | `https://api.osv.dev/v1/querybatch` | 开源生态漏洞（npm/PyPI/Go/…） | 否 | — | — | — | ✅ active |
| VulnCheck | `VulnCheck` | `https://api.vulncheck.com/v3/index/vulncheck-kev` | KEV 增强 + NVD2 漏洞利用数据 | 是 | https://vulncheck.com/token | `VULNCHECK_API_KEY` | `vulncheck_ac472…9913e76` | 🔑 key_set |
| CIRCL CVE | `CIRCL-CVE` | `https://cve.circl.lu/api/last/30` | 最新 30 条 CVE（含 CVSS、描述） | 否 | — | — | — | ✅ active |

---

## 域 2 — 威胁行为者与恶意软件（Threat Actors & Malware）

| 名称 | 源 ID | API / Feed URL | 内容类型 | 需要 Key | 注册地址 | ENV 变量 | 当前 Key | 状态 |
|------|--------|---------------|---------|---------|---------|---------|---------|------|
| AlienVault OTX | `OTX` | `https://otx.alienvault.com/api/v1` | IOC Pulses（IP/域名/文件哈希） | 是 | https://otx.alienvault.com/api | `OTX_API_KEY` | `fe2a40f…aa792e9` | 🔑 key_set |
| MalwareBazaar | `MalwareBazaar` | `https://mb-api.abuse.ch/api/v1/` | 恶意软件样本元数据（哈希/标签） | 可选（提升速率） | https://auth.abuse.ch/ | `ABUSECH_AUTH_KEY` | 未配置 | ✅ active（匿名可用） |
| ThreatFox | `ThreatFox` | `https://threatfox-api.abuse.ch/api/v1/` | IOC（C2/恶意软件 URL/哈希） | 可选（提升速率） | https://auth.abuse.ch/ | `ABUSECH_AUTH_KEY` | 未配置 | ✅ active（匿名可用） |
| Feodo Tracker | `Feodo` | `https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json` | 僵尸网络 C2 IP 封锁列表 | 否 | — | — | — | ✅ active |
| ATT&CK STIX | `ATT&CK-STIX` | `https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json` | MITRE ATT&CK TTP 战术/技术矩阵 | 否 | — | — | — | ✅ active |
| VirusTotal | `VirusTotal` | `https://www.virustotal.com/api/v3` | 文件/URL/IP 多引擎扫描结果 | 是 | https://www.virustotal.com/gui/join-us | `VIRUSTOTAL_API_KEY` | `4bfe5f1…95c2bc7` | 🔑 key_set |
| URLhaus | `URLhaus` | `https://urlhaus-api.abuse.ch/v1/urls/recent/` | 恶意 URL 数据库 | 可选（提升速率） | https://auth.abuse.ch/ | `ABUSECH_AUTH_KEY` | 未配置 | ✅ active（匿名可用） |
| CIRCL PDNS | `CIRCL-PDNS` | `https://www.circl.lu/pdns/query` | 被动 DNS 历史（C2 基础设施追踪） | 否（需配置监控域名） | — | `CIRCL_PDNS_DOMAINS` | 未配置 | ⚠️ no_key（需设域名才有效） |
| Hybrid Analysis | `Hybrid-Analysis` | `https://www.hybrid-analysis.com/api/v2/feed` | 沙箱分析报告（行为/IOC） | 是 | https://www.hybrid-analysis.com/apikeys | `HYBRID_ANALYSIS_KEY` | 未配置 | ⚠️ no_key |
| Malpedia | `Malpedia` | `https://malpedia.caad.fkie.fraunhofer.de/api` | 恶意软件家族参考库（行为/Actor 关联） | 是 | https://malpedia.caad.fkie.fraunhofer.de/api | `MALPEDIA_API_KEY` | 未配置 | ⚠️ no_key |
| ThreatBook（微步在线） | `ThreatBook` | `https://api.threatbook.cn/v3` | APT 情报 / IOC / 威胁分析 | 是 | https://x.threatbook.com | `THREATBOOK_API_KEY` | `c62215…b0c736` | 💔 api_broken（"Invalid Api method"，已注释） |

---

## 域 3 — 攻击活动与暴露面（Attack Activity & Exposure）

| 名称 | 源 ID | API / Feed URL | 内容类型 | 需要 Key | 注册地址 | ENV 变量 | 当前 Key | 状态 |
|------|--------|---------------|---------|---------|---------|---------|---------|------|
| GreyNoise | `GreyNoise` | `https://api.greynoise.io/v2/experimental/gnql` | 互联网扫描噪音分析（良性/恶意 IP） | 是（Community 免费） | https://viz.greynoise.io/signup | `GREYNOISE_API_KEY` | 未配置 | ⚠️ no_key |
| Shodan | `Shodan` | `https://api.shodan.io` | 互联网设备搜索 / 暴露面监控 | 是 | https://account.shodan.io | `SHODAN_API_KEY` | `t1rFs317RO0a0UTy…5C480` | 🔑 key_set |
| Censys | `Censys` | `https://search.censys.io/api/v2/hosts/search` | 互联网扫描暴露面（证书/端口/服务） | 是 | https://search.censys.io/account/api | `CENSYS_API_ID` / `CENSYS_API_SECRET` | 未配置 | ⚠️ no_key |
| AbuseIPDB | `AbuseIPDB` | `https://api.abuseipdb.com/api/v2/blacklist` | 众包恶意 IP 黑名单 | 是 | https://www.abuseipdb.com/register | `ABUSEIPDB_API_KEY` | `eaa5a566…b56afa1…` | 🔑 key_set |
| Cloudflare Radar | `Cloudflare-Radar` | `https://api.cloudflare.com/client/v4/radar` | 全球互联网流量趋势 / DDoS / BGP 异常 | 是（免费） | https://dash.cloudflare.com/profile/api-tokens | `CLOUDFLARE_API_TOKEN` | `cfk_tURx…17458e41` | 🔑 key_set |
| Spamhaus | `Spamhaus` | `https://www.spamhaus.org/drop/drop.txt` | DROP / EDROP IP 封锁列表（垃圾邮件/僵尸网络） | 否 | — | — | — | ✅ active |
| DShield | `DShield` | `https://isc.sans.edu/api/top10?json` | SANS ISC 蜜罐攻击数据（Top 攻击 IP/端口） | 否 | — | — | — | ✅ active |
| OpenPhish | `OpenPhish` | `https://openphish.com/feed.txt` | 活跃钓鱼 URL feed | 否 | — | — | — | ✅ active |
| Qianxin Hunter | `Qianxin-Hunter` | `https://api.hunter.how/search` | 资产搜索（IP/域名/服务指纹） | 是 | https://hunter.how | `HUNTER_API_KEY` | 未配置 | ⚠️ no_key |
| FOFA | `FOFA` | `https://fofa.info/api/v1` | 互联网资产搜索（中国视角） | 是 | https://fofa.info | `FOFA_EMAIL` / `FOFA_API_KEY` | `ouyangsheng@qianxin.com` / `15bcf53…` | 🔑 key_set |
| ZoomEye | `ZoomEye` | `https://api.zoomeye.org` | 互联网设备/服务扫描（中国视角） | 是 | https://www.zoomeye.org/profile | `ZOOMEYE_API_KEY` | `0ee6a5d8-ac7f-…77c4f` | 🔑 key_set |

---

## 域 4 — 事件追踪与情报社区（Event Tracking & Intel Community）

| 名称 | 源 ID | API / Feed URL | 内容类型 | 需要 Key | 注册地址 | ENV 变量 | 当前 Key | 状态 |
|------|--------|---------------|---------|---------|---------|---------|---------|------|
| Ransomware.live | `Ransomware-Live` | `https://api.ransomware.live/recentvictims` | 勒索软件最新受害者列表 | 否 | — | — | — | ✅ active |
| ENISA | `ENISA` | `https://www.enisa.europa.eu/rss.xml` | 欧盟网络安全局报告/公告 RSS | 否 | — | — | — | ✅ active |
| CISA Alerts | `CISA-Alerts` | `https://www.cisa.gov/cybersecurity-advisories/all.xml` | CISA 安全公告 RSS | 否 | — | — | — | ✅ active |
| CERTs International | `CERTs-Intl` | 多源 RSS（见下表） | 7 国 CERT 安全公告汇聚 | 否 | — | — | — | ✅ active |
| Telegram Channels | `Telegram` | `https://t.me/s/{channel}` | Telegram 公开安全频道信息流 | 可选（Bot Token 提升能力） | — | `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHANNELS` | 未配置 | ⚠️ 降级（无 Bot 则爬公开页） |
| The Hacker News | `HackerNews-RSS` | `https://thehackernews.com/feeds/posts/default` | 网络安全新闻 RSS | 否 | — | — | — | ✅ active |
| BleepingComputer | `BleepingComputer` | `https://www.bleepingcomputer.com/feed/` | 网络安全新闻 RSS（漏洞/勒索/事件） | 否 | — | — | — | ✅ active |
| SecurityWeek | `SecurityWeek` | `https://feeds.feedburner.com/securityweek` | 企业安全新闻 RSS | 否 | — | — | — | ✅ active |
| Tavily AI Search | `Tavily` | `https://api.tavily.com/search` | AI 主动搜索（8 条自定义安全查询/次） | 是 | https://tavily.com | `TAVILY_API_KEY` | 未配置 | ⚠️ no_key |

**CERTs-Intl 子源：**

| CERT | 国家/机构 | RSS URL |
|------|----------|---------|
| US-CERT | 美国 | `https://www.cisa.gov/news-events/alerts/rss.xml` |
| JPCERT | 日本 | `https://www.jpcert.or.jp/english/rss/jpcert-en.rdf` |
| AusCERT | 澳大利亚 | `https://www.auscert.org.au/rss/bulletins/` |
| NCSC | 英国 | `https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml` |
| BSI | 德国 | `https://www.bsi.bund.de/SiteGlobals/Functions/RSSFeed/RSSNewsfeed/RSSNewsfeed.xml` |
| ACSC | 澳大利亚网络安全中心 | `https://www.cyber.gov.au/...?type=rss` |
| ANSSI | 法国 | `https://www.cert.ssi.gouv.fr/feed/` |

---

## 域 5 — 中国情报源（China Intel）

| 名称 | 源 ID | API / Feed URL | 内容类型 | 需要 Key | 注册地址 | ENV 变量 | 当前 Key | 状态 |
|------|--------|---------------|---------|---------|---------|---------|---------|------|
| CNCERT | `CNCERT` | `https://www.cert.org.cn/publish/main/upload/File/rss.xml` | 国家互联网应急中心公告 RSS | 否 | — | — | — | ✅ active |
| CNVD | `CNVD` | `https://www.cnvd.org.cn/webinfo/list?type=2` | 国家漏洞数据库（HTML 抓取 / API） | 可选（API 提升数据量） | https://www.cnvd.org.cn | `CNVD_API_KEY` | 未配置 | ✅ active（降级为 HTML） |
| CNNVD | `CNNVD` | `https://www.cnnvd.org.cn/web/vulnerability/querylist.tag` | 国家信息安全漏洞库 | 可选（Token 提升访问） | https://www.cnnvd.org.cn | `CNNVD_TOKEN` | 未配置（需浏览器 Network 复制） | ✅ active（降级为 HTML） |
| 奇安信 TI（博客RSS） | `Qianxin` | `https://ti.qianxin.com/blog/rss.xml` | APT 情报博客 + API 数据 | 可选（API 扩展功能） | https://ti.qianxin.com | `QIANXIN_API_KEY` | `EnUowx…CTLa8B` | 🔑 key_set |
| 奇安信 TI（v3 API） | `Qianxin-TI` | `https://ti.qianxin.com/api/v3/` | APT/IOC/恶意软件（专用 v3 接口） | 是 | https://ti.qianxin.com | `QIANXIN_TI_API_KEY` | 未配置 | ⚠️ no_key |
| 百度千帆 AI 搜索 | `Baidu-Search` | `https://aip.baidubce.com/rpc/2.0/erniebot/v1/plugin/search` | ERNIE AI 主动搜索（5 中文安全关键词/次） | 是 | https://qianfan.cloud.baidu.com | `BAIDU_QIANFAN_API_KEY` / `BAIDU_QIANFAN_SECRET_KEY` | 未配置 | ⚠️ no_key |
| FreeBuf | `FreeBuf` | `https://www.freebuf.com/feed` | 国内安全新闻/研究 RSS | 否 | — | — | — | ✅ active |
| 安全客（Anquanke） | `Anquanke` | `https://api.anquanke.com/data/v1/rss` | 国内安全新闻/研究 RSS | 否 | — | — | — | ✅ active |
| 嘶吼（4hou） | `4hou` | `https://www.4hou.com/feed` | 国内安全新闻/研究 RSS | 否 | — | — | — | ✅ active |

---

## 域 6 — 厂商公告（Vendor Feeds）

### 国际厂商（Vendors-Intl）

| 名称 | 源 ID | RSS URL | 内容类型 | 需要 Key | 状态 |
|------|--------|---------|---------|---------|------|
| Microsoft MSRC | `Vendors-Intl` | `https://api.msrc.microsoft.com/update-guide/rss` | 微软安全更新公告 | 否 | ✅ active |
| Cisco Talos | `Vendors-Intl` | `https://blog.talosintelligence.com/feeds/posts/default` | 威胁研究/恶意软件分析 | 否 | ✅ active |
| Palo Alto Unit42 | `Vendors-Intl` | `https://unit42.paloaltonetworks.com/feed/` | APT/恶意软件/漏洞研究 | 否 | ✅ active |
| CrowdStrike | `Vendors-Intl` | `https://www.crowdstrike.com/blog/feed/` | 威胁情报/事件响应报告 | 否 | ✅ active |
| ESET WeLiveSecurity | `Vendors-Intl` | `https://www.welivesecurity.com/en/feed/` | 恶意软件研究/APT 分析 | 否 | ✅ active |
| Kaspersky Securelist | `Vendors-Intl` | `https://securelist.com/feed/` | APT/恶意软件深度分析 | 否 | ✅ active |
| IBM X-Force | `Vendors-Intl` | `https://securityintelligence.com/feed/` | 企业威胁情报/事件分析 | 否 | ✅ active |
| Check Point Research | `Vendors-Intl` | `https://research.checkpoint.com/feed/` | 漏洞研究/威胁分析 | 否 | ✅ active |
| Mandiant | `Vendors-Intl` | `https://cloud.google.com/blog/topics/threat-intelligence/rss` | APT 归因/事件响应报告 | 否 | ✅ active |
| Recorded Future | `Vendors-Intl` | `https://www.recordedfuture.com/feed` | 威胁情报研究报告 | 否 | ✅ active |

### 国内厂商（Vendors-CN）

| 名称 | 源 ID | RSS URL | 内容类型 | 需要 Key | 状态 |
|------|--------|---------|---------|---------|------|
| 360 CERT | `Vendors-CN` | `https://cert.360.cn/api/rss` | 安全公告/漏洞预警 | 否 | ✅ active |
| 绿盟科技 | `Vendors-CN` | `https://blog.nsfocus.net/feed/` | 安全研究/漏洞分析 | 否 | ✅ active |
| 腾讯 TSRC | `Vendors-CN` | `https://security.tencent.com/index.php/blog/rss` | 漏洞研究/安全公告 | 否 | ✅ active |
| 华为 PSIRT | `Vendors-CN` | `https://www.huawei.com/en/psirt/rss` | 华为产品安全公告 | 否 | ✅ active |
| 长亭科技 | `Vendors-CN` | `https://www.chaitin.cn/en/blog_rss` | 漏洞挖掘/安全研究 | 否 | ✅ active |
| 深信服千里目 | `Vendors-CN` | `https://sec.sangfor.com.cn/rss.xml` | 威胁情报/安全公告 | 否 | ✅ active |
| 安天 | `Vendors-CN` | `https://www.antiy.cn/rss.xml` | 恶意软件分析/APT 研究 | 否 | ✅ active |

---

## 已弃用源（文件保留，未注册）

以下源文件存在于 `apis/sources/` 但未注册到 `briefing.mjs`，已在 v1.4.0 移除：

| 名称 | 文件 | 移除版本 | 原因 |
|------|------|---------|------|
| BGP Ranking | `bgp-ranking.mjs` | v1.4.0 | 低效 / 不稳定 |
| Bluesky | `bluesky.mjs` | v1.4.0 | 低效 / 不稳定 |
| Shadowserver | `shadowserver.mjs` | v1.4.0 | 低效 / 不稳定 |
| PhishTank | `phishtank.mjs` | v1.4.0 | 已被 OpenPhish 替代 |

---

## Key 配置状态总览

| ENV 变量 | 对应源 | 已配置 |
|---------|-------|-------|
| `NVD_API_KEY` | NVD | ✅ |
| `VULNCHECK_API_KEY` | VulnCheck | ✅ |
| `OTX_API_KEY` | AlienVault OTX | ✅ |
| `VIRUSTOTAL_API_KEY` | VirusTotal | ✅ |
| `SHODAN_API_KEY` | Shodan | ✅ |
| `ABUSEIPDB_API_KEY` | AbuseIPDB | ✅ |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Radar | ✅ |
| `THREATBOOK_API_KEY` | ThreatBook（API 已失效） | ✅（但源禁用） |
| `QIANXIN_API_KEY` | 奇安信 TI（博客+API） | ✅ |
| `FOFA_EMAIL` / `FOFA_API_KEY` | FOFA | ✅ |
| `ZOOMEYE_API_KEY` | ZoomEye | ✅ |
| `X_API_BEARER` | X/Twitter（未使用） | ✅（暂无对应源） |
| `ACLED_EMAIL` / `ACLED_PASSWORD` | ACLED（暂无对应源） | ✅（暂无对应源） |
| `GITHUB_TOKEN` | GitHub Advisory | ❌ 未配置 |
| `GREYNOISE_API_KEY` | GreyNoise | ❌ 未配置 |
| `SHADOWSERVER_API_KEY` | Shadowserver（已弃用） | ❌ 未配置 |
| `CNVD_API_KEY` | CNVD | ❌ 未配置 |
| `CNNVD_TOKEN` | CNNVD | ❌ 未配置 |
| `ABUSECH_AUTH_KEY` | MalwareBazaar / ThreatFox / URLhaus | ❌ 未配置 |
| `HUNTER_API_KEY` | 奇安信 Hunter | ❌ 未配置 |
| `QIANXIN_TI_API_KEY` | 奇安信 TI v3 | ❌ 未配置 |
| `BAIDU_QIANFAN_API_KEY` / `BAIDU_QIANFAN_SECRET_KEY` | 百度千帆搜索 | ❌ 未配置 |
| `TAVILY_API_KEY` | Tavily AI 搜索 | ❌ 未配置 |
| `CENSYS_API_ID` / `CENSYS_API_SECRET` | Censys | ❌ 未配置 |
| `HYBRID_ANALYSIS_KEY` | Hybrid Analysis | ❌ 未配置 |
| `MALPEDIA_API_KEY` | Malpedia | ❌ 未配置 |
| `BING_API_KEY` | Bing（无对应源文件） | ❌ 未配置 |
| `INTELX_API_KEY` | IntelligenceX（无对应源文件） | ❌ 未配置 |
| `CIRCL_PDNS_DOMAINS` | CIRCL PDNS 监控域名列表 | ❌ 未配置 |

---

## 优先补全建议

以下 Key 免费可注册，补全后可直接提升数据覆盖率：

| 优先级 | Key | 说明 |
|--------|-----|------|
| 高 | `GREYNOISE_API_KEY` | 社区版免费，可补全攻击噪音分析 |
| 高 | `ABUSECH_AUTH_KEY` | 免费，3 个 abuse.ch 源（MalwareBazaar/ThreatFox/URLhaus）解锁完整 API |
| 高 | `GITHUB_TOKEN` | 免费，解除 GitHub Advisory 速率限制（60→5000 req/h） |
| 高 | `TAVILY_API_KEY` | 已有，填入即可启用 AI 搜索（.env 中占位符已存在） |
| 中 | `CENSYS_API_ID` / `SECRET` | 免费学术账号，暴露面监控更完整 |
| 中 | `HYBRID_ANALYSIS_KEY` | 免费，沙箱分析 feed |
| 中 | `MALPEDIA_API_KEY` | 免费，恶意软件参考库 |
| 中 | `HUNTER_API_KEY` | 已有（.env.example 注释"already have"），填入即可 |
| 中 | `QIANXIN_TI_API_KEY` | 已有（.env.example 注释"already have"），填入即可 |
| 中 | `BAIDU_QIANFAN_API_KEY` | 已有（.env.example 注释"already have"），填入即可 |
| 低 | `CNVD_API_KEY` | 降级模式已可工作（HTML 抓取） |
| 低 | `CNNVD_TOKEN` | 降级模式已可工作（HTML 抓取），Token 需从浏览器 Network 复制 |
