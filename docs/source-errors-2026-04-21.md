# 数据源错误诊断报告

**检测时间：** 2026-04-21  
**检测结果：** 33 正常 / 15 异常 / 1 失败（共 49 源）

---

## 一、缺少 API Key（no_key）

需要配置密钥才能使用，当前 .env 未填入：

| 数据源 | ENV 变量 | 错误信息 | 注册地址 |
|--------|---------|---------|---------|
| GreyNoise | `GREYNOISE_API_KEY` | HTTP 401 unauthorized | https://viz.greynoise.io/signup（社区版免费） |
| Censys | `CENSYS_API_ID` + `CENSYS_API_SECRET` | no_key | https://search.censys.io/account/api（免费学术账号） |
| Qianxin-TI | `QIANXIN_TI_API_KEY` | no_key | https://ti.qianxin.com |
| Baidu-Search | `BAIDU_QIANFAN_API_KEY` + `BAIDU_QIANFAN_SECRET_KEY` | no_key | https://qianfan.cloud.baidu.com |

---

## 二、Key 已配置但鉴权失败（key_invalid）

密钥已在 .env 中填入，但 API 返回 401，可能已过期或权限不足：

| 数据源 | ENV 变量 | 错误信息 | 处理建议 |
|--------|---------|---------|---------|
| Cloudflare-Radar | `CLOUDFLARE_API_TOKEN` | HTTP 401 Authentication error | 登录 Cloudflare 重新生成 API Token，确认权限包含 Radar:Read |

---

## 三、网络不通 / 被地区拦截（network / geo-block）

服务器网络环境访问受限，API 返回 403 或连接超时：

| 数据源 | 错误信息 | 原因分析 |
|--------|---------|---------|
| CISA-KEV | HTTP 403 Access Denied | CISA 对部分 IP 地区封锁（www.cisa.gov） |
| CISA-Alerts | HTTP 403 | 同上 |
| BleepingComputer | RSS unreachable | bleepingcomputer.com 访问受阻 |
| CIRCL-CVE | 超时 timeout 30s | cve.circl.lu 响应超时，可能网络拥堵或服务不稳定 |
| DShield | 无数据返回 | isc.sans.edu API 返回空，网络或服务暂时异常 |
| FreeBuf | RSS 与 HTML 均无条目 | freebuf.com 访问受阻或页面结构变更 |
| Qianxin-Hunter | 所有查询均失败 | api.hunter.how 访问受阻 |

---

## 四、API 端点变更（endpoint_changed）

服务商更换了 API 地址和认证方式：

| 数据源 | 错误信息 | 修复状态 | 处理建议 |
|--------|---------|---------|---------|
| ZoomEye | HTTP 403 "use api.zoomeye.ai instead" | ✅ URL 和认证头已更新（`api.zoomeye.org` → `api.zoomeye.ai`，`API-KEY` 头 → `Authorization: JWT`）；旧 UUID Key 不兼容新平台 | 登录 https://www.zoomeye.ai/profile 重新获取 Token，更新 `.env` `ZOOMEYE_API_KEY` |

---

## 五、配置缺失（config_missing）

功能依赖特定配置项，但当前未设置：

| 数据源 | 缺失配置 | 说明 |
|--------|---------|------|
| CIRCL-PDNS | `CIRCL_PDNS_DOMAINS` | 需在 .env 设置要监控的域名列表（如 `example.com,domain2.com`），否则无查询目标 |
| CNVD | `CNVD_API_KEY` + 公开 feed 也不可达 | 无 Key 时降级 HTML 抓取，但 HTML 也不可达（网络问题叠加） |
| Hybrid-Analysis | `HYBRID_ANALYSIS_KEY`（未配置） | API 未授权，返回空数据 |

---

## 六、汇总与处置优先级

| 优先级 | 类型 | 数据源 | 建议操作 |
|--------|------|--------|---------|
| 🔴 高 | key_invalid | Cloudflare-Radar | 重新生成 Cloudflare API Token（需用户操作） |
| 🔴 高 | endpoint_changed + key_invalid | ZoomEye | ✅ 代码已修复（URL + 认证头）；需用户在 zoomeye.ai 重新获取 Token |
| 🟡 中 | no_key | GreyNoise | 免费注册，填入 Key |
| 🟡 中 | no_key | Censys | 免费注册，填入 Key |
| 🟡 中 | no_key | Qianxin-TI | 填入已有 Key |
| 🟡 中 | no_key | Baidu-Search | 填入已有 Key |
| 🟡 中 | config_missing | CIRCL-PDNS | 设置 `CIRCL_PDNS_DOMAINS` |
| 🟡 中 | config_missing | Hybrid-Analysis | 注册免费 Key，填入 |
| 🟠 网络 | geo-block | CISA-KEV / CISA-Alerts | 考虑代理或境外节点 |
| 🟠 网络 | geo-block | BleepingComputer / FreeBuf / Qianxin-Hunter | 考虑代理，或标记为跳过 |
| 🟠 网络 | timeout | CIRCL-CVE / DShield | 临时不稳定，观察后续是否恢复 |
| ⚪ 低 | config_missing | CNVD | 网络通后降级模式自动恢复 |
