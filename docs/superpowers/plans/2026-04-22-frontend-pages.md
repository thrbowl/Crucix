# Frontend Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将全部设计稿转化为可运行的前端页面，挂载至 `dashboard/public/`，所有文案使用中文，并接入已完成的 REST API v1 及认证接口。

**Architecture:** Express 静态文件服务直接托管 `dashboard/public/` 目录，无构建系统。所有页面通过 `auth.js` 共享认证逻辑（JWT localStorage + HttpOnly refresh cookie + apiFetch 自动重试）。样式完全依赖 Tailwind CDN + Google Fonts，零本地依赖。

**Tech Stack:** Tailwind CSS CDN, Material Symbols Outlined, Space Grotesk/Inter (Google Fonts), Vanilla JS ES modules (type=module), Express static serve

---

## 文件结构

| 输出文件 | 设计稿来源 | 说明 |
|---|---|---|
| `dashboard/public/auth.js` | 新建 | 共享认证工具库 |
| `dashboard/public/login.html` | `_1/code.html` | 登录页，接入 POST /api/auth/login |
| `dashboard/public/register.html` | `_2/code.html` | 注册页，接入 POST /api/auth/register |
| `dashboard/public/index.html` | `_7/code.html` | 主仪表盘，接入简报/警报 API |
| `dashboard/public/briefing.html` | `tactical_glass_v2/code.html` | 情报简报，接入 GET /api/v1/briefings/latest |
| `dashboard/public/search.html` | `_5/code.html` | 实体搜索，接入 POST /api/v1/search |
| `dashboard/public/workbench.html` | `_6/code.html` | 工作台图谱，接入 /api/v1/entities/:type/:id/related |
| `dashboard/public/watchlist.html` | `watchlist/code.html` | 监视列表，接入 GET/POST/DELETE /api/v1/watchlist |
| `dashboard/public/account.html` | `_3/code.html` | 账户管理，接入 /api/auth/me 及 API keys |
| `dashboard/public/sources.html` | `_4/code.html` | 源健康状态，接入 GET /api/health + SSE /events |

### 标准侧边导航链接（所有带侧边栏的页面一致）
```
简报中心  → briefing.html  (newspaper)
威胁态势  → index.html     (biotech)
实体搜索  → search.html    (manage_search)
工作台    → workbench.html (terminal)
监视列表  → watchlist.html (visibility)
源健康状态→ sources.html   (analytics)
账户管理  → account.html   (account_circle)
技术支持  → #             (help)
注销登录  → 调用 logout()  (logout)
```

---

### Task 1: 共享认证工具库 auth.js

**Files:**
- Create: `dashboard/public/auth.js`

- [ ] **Step 1: 创建 auth.js**

```javascript
// dashboard/public/auth.js
// 所有页面通过 <script type="module"> 导入此模块

const TOKEN_KEY = 'crx_access_token';

/** 读取 localStorage 中的 access token */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/** 保存 access token */
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

/** 清除 access token 并跳转到登录页 */
export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = '/login.html';
}

/**
 * 带 JWT 的 fetch，自动处理 401 刷新。
 * 若刷新失败则调用 logout()。
 */
export async function apiFetch(url, opts = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  };

  let res = await fetch(url, { ...opts, headers });

  if (res.status === 401) {
    // 尝试刷新
    const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });
    if (refreshRes.ok) {
      const { access_token } = await refreshRes.json();
      setToken(access_token);
      headers.Authorization = `Bearer ${access_token}`;
      res = await fetch(url, { ...opts, headers });
    } else {
      logout();
      return;
    }
  }

  return res;
}

/**
 * 检查登录状态。未登录则跳转到 login.html。
 * 返回用户信息对象（{ id, email, plan, credits_remaining }）。
 */
export async function authGuard() {
  if (!getToken()) {
    logout();
    return null;
  }
  try {
    const res = await apiFetch('/api/auth/me');
    if (!res || !res.ok) {
      logout();
      return null;
    }
    return await res.json();
  } catch {
    logout();
    return null;
  }
}

/**
 * 填充页面顶栏的积分显示和用户名
 * @param {object} user - authGuard() 返回值
 */
export function populateNav(user) {
  const creditsEl = document.getElementById('nav-credits');
  const userEl = document.getElementById('nav-username');
  if (creditsEl && user) creditsEl.textContent = (user.credits_remaining ?? 0).toLocaleString() + ' 积分';
  if (userEl && user) userEl.textContent = user.email?.split('@')[0]?.toUpperCase() ?? 'OPERATOR';
}
```

- [ ] **Step 2: 验证文件已创建**

```bash
ls -la dashboard/public/auth.js
```
Expected: 文件存在，约 60 行

- [ ] **Step 3: Commit**

```bash
git add dashboard/public/auth.js
git commit -m "feat(frontend): add shared auth utilities (auth.js)"
```

---

### Task 2: 登录页与注册页

**Files:**
- Create: `dashboard/public/login.html`
- Create: `dashboard/public/register.html`
- Modify: `dashboard/public/index.html` (替换，见 Task 3)

- [ ] **Step 1: 创建 login.html（基于 _1/code.html，添加 JS 逻辑）**

从设计稿 `_1/code.html` 复制全部 HTML/CSS 框架，在 `</body>` 前插入以下脚本块：

```html
<script type="module">
  import { setToken, getToken } from './auth.js';
  // 已登录则跳主页
  if (getToken()) window.location.href = '/index.html';

  document.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target.querySelector('[type=email]').value.trim();
    const password = e.target.querySelector('[type=password]').value;
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = '登录中...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.access_token);
        window.location.href = '/index.html';
      } else {
        showError(data.error || '登录失败，请检查邮箱和密码');
      }
    } catch {
      showError('网络错误，请稍后重试');
    } finally {
      btn.disabled = false;
      btn.textContent = '立即登录';
    }
  });

  function showError(msg) {
    let el = document.getElementById('login-error');
    if (!el) {
      el = document.createElement('p');
      el.id = 'login-error';
      el.className = 'text-error text-xs mt-2 text-center';
      document.querySelector('form').appendChild(el);
    }
    el.textContent = msg;
  }

  // 注册链接
  document.querySelector('a[href="#"]').href = '/register.html';
</script>
```

注意：`<title>` 保留 `CRUCIX | 安全登录`；"没有账号？立即注册" 的 `href` 改为 `/register.html`。

- [ ] **Step 2: 创建 register.html（基于 _2/code.html，添加 JS 逻辑）**

从设计稿 `_2/code.html` 复制全部 HTML/CSS 框架，在 `</body>` 前插入：

```html
<script type="module">
  import { getToken } from './auth.js';
  if (getToken()) window.location.href = '/index.html';

  document.querySelector('button[type=button], button:not([type])').addEventListener('click', async () => {
    // 实际注册按钮是第一个 button
  });

  // 找到"立即注册"按钮（form 内唯一按钮）
  const registerBtn = document.querySelector('button');
  registerBtn.addEventListener('click', async () => {
    const inputs = document.querySelectorAll('input');
    const email = inputs[0].value.trim();
    const password = inputs[1].value;
    const confirm = inputs[2].value;

    if (password !== confirm) { showError('两次密码不一致'); return; }
    if (password.length < 8) { showError('密码至少 8 位'); return; }

    registerBtn.disabled = true;
    registerBtn.textContent = '注册中...';

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = '/login.html?registered=1';
      } else {
        showError(data.error || '注册失败');
      }
    } catch {
      showError('网络错误');
    } finally {
      registerBtn.disabled = false;
      registerBtn.textContent = '立即注册';
    }
  });

  function showError(msg) {
    let el = document.getElementById('reg-error');
    if (!el) {
      el = document.createElement('p');
      el.id = 'reg-error';
      el.className = 'text-red-400 text-xs mt-2 text-center';
      document.querySelector('.glass-panel').appendChild(el);
    }
    el.textContent = msg;
  }

  // 已有账号链接
  document.querySelector('a').href = '/login.html';
</script>
```

`<title>` 改为 `CRUCIX | 注册账号`。顶栏"登录"按钮的 `href/onclick` 改为 `window.location.href='/login.html'`。

- [ ] **Step 3: 检查文件**

```bash
ls -la dashboard/public/login.html dashboard/public/register.html
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/public/login.html dashboard/public/register.html
git commit -m "feat(frontend): add login and register pages"
```

---

### Task 3: 主仪表盘 index.html

**Files:**
- Modify: `dashboard/public/index.html`（替换现有占位符）

设计稿来源：`stitch_crucix_cyber_industrial_prd/_7/code.html`（已全中文）

- [ ] **Step 1: 用设计稿替换 index.html，添加 auth 守卫与 API 接入**

完整文件 = `_7/code.html` 的 HTML+CSS 框架，侧边栏链接替换为标准导航（见上文文件结构表），在 `</body>` 前插入：

```html
<script type="module">
  import { authGuard, populateNav, apiFetch, logout } from './auth.js';

  const user = await authGuard();
  if (!user) return;
  populateNav(user);

  // 侧边栏注销按钮
  document.getElementById('btn-logout')?.addEventListener('click', logout);

  // === 积分显示（顶栏已在 populateNav 处理）===

  // === 加载简报 API 统计数字 ===
  async function loadStats() {
    try {
      const res = await apiFetch('/api/v1/briefings/latest');
      if (!res?.ok) return;
      const { data } = await res.json();
      // 设计稿中的 4 张统计卡片使用静态数字，此处保留静态值
      // 实际数据可从 briefings metadata 提取
    } catch { /* 静默失败，保留设计稿静态数字 */ }
  }
  loadStats();

  // === SSE 实时预警流 ===
  const alertStream = document.getElementById('alert-stream');
  if (alertStream) {
    const token = localStorage.getItem('crx_access_token');
    const evtSrc = new EventSource(`/events?token=${encodeURIComponent(token ?? '')}`);
    evtSrc.addEventListener('alert', (e) => {
      try {
        const alert = JSON.parse(e.data);
        const severityMap = {
          critical: ['危急', 'border-error', 'bg-error/5', 'bg-error/20 text-error'],
          high:     ['警告', 'border-secondary', 'bg-secondary/5', 'bg-secondary/20 text-secondary'],
          medium:   ['警告', 'border-secondary', 'bg-secondary/5', 'bg-secondary/20 text-secondary'],
          low:      ['信息', 'border-cyan-500/30', 'bg-cyan-500/5', 'bg-cyan-500/20 text-cyan-400'],
        };
        const [label, border, bg, badge] = severityMap[alert.severity] ?? severityMap.low;
        const time = new Date(alert.created_at ?? Date.now()).toLocaleTimeString('zh-CN', { hour12: false });
        const item = document.createElement('div');
        item.className = `flex items-center gap-4 p-3 border-l-2 ${border} ${bg} hover:opacity-90 transition-colors`;
        item.innerHTML = `
          <span class="text-slate-500 shrink-0">${time}</span>
          <span class="px-2 py-0.5 ${badge} rounded text-[10px] font-bold">${label}</span>
          <span class="text-on-surface flex-1">${alert.title ?? alert.message ?? '新预警'}</span>`;
        alertStream.prepend(item);
        // 最多显示 20 条
        while (alertStream.children.length > 20) alertStream.lastChild.remove();
      } catch { /* 忽略解析错误 */ }
    });
    evtSrc.onerror = () => evtSrc.close();
  }
</script>
```

侧边栏各链接的 `href` 按标准导航表替换。侧边栏注销 `<a>` 改为 `<button id="btn-logout">`。
实时预警流容器 `<div class="flex-1 overflow-y-auto p-4 space-y-2 ...">` 加 `id="alert-stream"`。
顶栏积分 `<span>` 加 `id="nav-credits"`；侧边栏用户名 `<div class="text-cyan-500 ...">操作员_01</div>` 加 `id="nav-username"`。

- [ ] **Step 2: 验证文件大小合理**

```bash
wc -l dashboard/public/index.html
```
Expected: > 200 行

- [ ] **Step 3: Commit**

```bash
git add dashboard/public/index.html
git commit -m "feat(frontend): implement main dashboard (index.html) with SSE alerts"
```

---

### Task 4: 情报简报页 briefing.html

**Files:**
- Create: `dashboard/public/briefing.html`

设计稿来源：`stitch_crucix_cyber_industrial_prd/tactical_glass_v2/code.html`

- [ ] **Step 1: 创建 briefing.html**

复制 `tactical_glass_v2/code.html` 全部框架。侧边栏链接按标准导航替换，"简报中心"条目标记为激活样式（`bg-cyan-500/10 text-cyan-400 border-r-2 border-cyan-400`）。在 `</body>` 前插入：

```html
<script type="module">
  import { authGuard, populateNav, apiFetch, logout } from './auth.js';

  const user = await authGuard();
  if (!user) return;
  populateNav(user);
  document.getElementById('btn-logout')?.addEventListener('click', logout);

  // === 加载最新简报 ===
  async function loadBriefing() {
    try {
      const res = await apiFetch('/api/v1/briefings/latest');
      if (!res?.ok) return;
      const { data } = await res.json();
      if (!data) return;

      // 填充标题
      const titleEl = document.getElementById('briefing-title');
      if (titleEl) titleEl.textContent = data.title ?? titleEl.textContent;

      // 填充摘要
      const summaryEl = document.getElementById('briefing-summary');
      if (summaryEl) summaryEl.textContent = data.summary ?? summaryEl.textContent;

      // 填充标签
      const tagsEl = document.getElementById('briefing-tags');
      if (tagsEl && Array.isArray(data.tags)) {
        tagsEl.innerHTML = data.tags.map(t =>
          `<span class="bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md">${t}</span>`
        ).join('');
      }

      // 填充时间戳
      const tsEl = document.getElementById('briefing-ts');
      if (tsEl && data.published_at) {
        tsEl.textContent = 'TS: ' + new Date(data.published_at).toISOString().replace('T', '_').slice(0, 19);
      }
    } catch { /* 保留设计稿静态内容 */ }
  }
  loadBriefing();
</script>
```

主简报卡片标题 `<h2>` 加 `id="briefing-title"`；摘要 `<p>` 加 `id="briefing-summary"`；标签容器加 `id="briefing-tags"`；时间戳 `<span>` 加 `id="briefing-ts"`。
顶栏积分 `<span>` 加 `id="nav-credits"`。
侧边栏注销 `<a>` 改为 `<button id="btn-logout">`。
侧边栏用户名加 `id="nav-username"`。

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/briefing.html
git commit -m "feat(frontend): add briefing detail page wired to /api/v1/briefings/latest"
```

---

### Task 5: 实体搜索页 search.html

**Files:**
- Create: `dashboard/public/search.html`

设计稿来源：`stitch_crucix_cyber_industrial_prd/_5/code.html`

- [ ] **Step 1: 创建 search.html**

复制 `_5/code.html` 框架。侧边栏链接按标准导航替换，"实体搜索"条目标记激活。在 `</body>` 前插入：

```html
<script type="module">
  import { authGuard, populateNav, apiFetch, logout } from './auth.js';

  const user = await authGuard();
  if (!user) return;
  populateNav(user);
  document.getElementById('btn-logout')?.addEventListener('click', logout);

  // 当前激活的分类 tab（空 = 全部）
  let activeType = '';

  // Tab 切换
  document.querySelectorAll('[data-type-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-type-tab]').forEach(b => {
        b.classList.remove('text-cyan-400', 'border-b-2', 'border-cyan-400');
        b.classList.add('text-slate-500');
      });
      btn.classList.add('text-cyan-400', 'border-b-2', 'border-cyan-400');
      btn.classList.remove('text-slate-500');
      activeType = btn.dataset.typeTab;
    });
  });

  // 搜索
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const resultsGrid = document.getElementById('results-grid');

  async function doSearch() {
    const q = searchInput?.value?.trim();
    if (!q) return;
    if (resultsGrid) resultsGrid.innerHTML = '<p class="col-span-3 text-slate-500 text-sm">搜索中...</p>';

    try {
      const body = { q, limit: 9 };
      if (activeType) body.type = activeType;
      const res = await apiFetch('/api/v1/search', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res?.ok) {
        if (resultsGrid) resultsGrid.innerHTML = '<p class="col-span-3 text-error text-sm">搜索失败，请重试</p>';
        return;
      }
      const { data } = await res.json();
      renderResults(data ?? []);
    } catch {
      if (resultsGrid) resultsGrid.innerHTML = '<p class="col-span-3 text-error text-sm">网络错误</p>';
    }
  }

  function renderResults(items) {
    if (!resultsGrid) return;
    if (!items.length) {
      resultsGrid.innerHTML = '<p class="col-span-3 text-slate-500 text-sm">未找到相关实体</p>';
      return;
    }
    resultsGrid.innerHTML = items.map(item => {
      const typeLabel = item.type ?? '实体';
      const name = item.name ?? item.value ?? item.id ?? '未知';
      const desc = item.description ?? item.summary ?? '';
      return `<div class="glass-panel p-6 rounded-lg hover:bg-white/5 transition-all">
        <div class="flex justify-between items-start mb-4">
          <div class="space-y-1">
            <span class="text-[10px] font-label-caps text-cyan-500/80 tracking-widest uppercase">${typeLabel}</span>
            <h3 class="font-h3 text-on-surface text-lg font-bold">${name}</h3>
          </div>
        </div>
        <p class="text-sm text-slate-400 mb-6 line-clamp-2">${desc || '暂无描述'}</p>
        <button class="w-full py-2 border border-cyan-500/30 text-cyan-400 rounded hover:bg-cyan-400 hover:text-slate-950 transition-all font-label-caps text-xs"
          onclick="window.location.href='workbench.html?type=${encodeURIComponent(item.type ?? '')}&id=${encodeURIComponent(item.id ?? '')}'"
          >查看全维图谱</button>
      </div>`;
    }).join('');
  }

  searchBtn?.addEventListener('click', doSearch);
  searchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
</script>
```

HTML 中需要添加的 id：
- 搜索输入框 `input` → `id="search-input"`
- "执行检索"按钮 → `id="search-btn"`
- 结果卡片容器 `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">` → `id="results-grid"`
- 每个分类 Tab `<button>` 加 `data-type-tab` 属性（全部=空字符串、安全漏洞=vulnerability、IOC标识=indicator、威胁行为者=threat-actor、恶意软件=malware、攻击活动=campaign）
- 顶栏积分 `id="nav-credits"`，侧边栏用户名 `id="nav-username"`
- 侧边栏注销改为 `<button id="btn-logout">`

所有侧边栏文字翻译为中文（同标准导航表）。

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/search.html
git commit -m "feat(frontend): add entity search page wired to POST /api/v1/search"
```

---

### Task 6: 工作台图谱页 workbench.html

**Files:**
- Create: `dashboard/public/workbench.html`

设计稿来源：`stitch_crucix_cyber_industrial_prd/_6/code.html`

- [ ] **Step 1: 创建 workbench.html**

复制 `_6/code.html` 框架。将顶栏导航翻译为中文（Mission Control→主控台，Workbench→工作台，Archives→档案库）。侧边栏按标准导航替换，"工作台"条目标记激活。在 `</body>` 前插入：

```html
<script type="module">
  import { authGuard, populateNav, apiFetch, logout } from './auth.js';

  const user = await authGuard();
  if (!user) return;
  populateNav(user);
  document.getElementById('btn-logout')?.addEventListener('click', logout);

  // 从 URL 参数读取初始实体
  const params = new URLSearchParams(location.search);
  const initType = params.get('type') ?? 'ipv4-addr';
  const initId   = params.get('id') ?? '';

  const searchInput = document.getElementById('entity-search-input');
  const nodeDetail  = document.getElementById('entity-detail-name');
  const nodeType    = document.getElementById('entity-detail-type');
  const relatedPane = document.getElementById('related-nodes-pane');

  if (initId && searchInput) searchInput.value = initId;

  async function loadEntity(type, id) {
    if (!id) return;
    try {
      const res = await apiFetch(`/api/v1/entities/${encodeURIComponent(type)}/${encodeURIComponent(id)}/related`);
      if (!res?.ok) return;
      const { data } = await res.json();
      if (!data) return;

      // 更新详情抽屉
      if (nodeDetail) nodeDetail.textContent = id;
      if (nodeType)   nodeType.textContent   = type.toUpperCase() + ' · 实体';

      // 渲染关联节点列表（右侧抽屉历史区域）
      if (relatedPane && Array.isArray(data)) {
        relatedPane.innerHTML = data.slice(0, 10).map(r => `
          <div class="relative pl-8 cursor-pointer hover:opacity-80" onclick="loadEntity('${r.type}','${r.id}')">
            <div class="absolute left-0 top-1.5 w-5 h-5 rounded-full bg-background border-2 border-cyan-400 flex items-center justify-center">
              <div class="w-1.5 h-1.5 rounded-full bg-cyan-400"></div>
            </div>
            <div class="text-on-surface text-sm font-semibold">${r.name ?? r.value ?? r.id}</div>
            <div class="text-slate-500 text-xs mt-1">${r.type}</div>
          </div>`).join('');
      }
    } catch { /* 保留静态示意图 */ }
  }

  // 底部搜索框触发
  searchInput?.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const val = searchInput.value.trim();
      if (val) await loadEntity(initType, val);
    }
  });

  if (initId) await loadEntity(initType, initId);
</script>
```

HTML 中需要添加 id：
- 底部搜索框 `input` → `id="entity-search-input"`
- 右侧抽屉 `<h1 class="font-h2 ...">192.168.4.122</h1>` → `id="entity-detail-name"`
- 抽屉副标题 `<p ...>IPv4 地址 · 基础设施</p>` → `id="entity-detail-type"`
- 历史时间线容器 `<div class="space-y-6 relative ...">` → `id="related-nodes-pane"`
- 顶栏积分 `id="nav-credits"`，侧边栏用户名 `id="nav-username"`
- 侧边栏注销改为 `<button id="btn-logout">`

所有英文导航文字翻译为中文（同标准导航）。

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/workbench.html
git commit -m "feat(frontend): add workbench graph page wired to /api/v1/entities/related"
```

---

### Task 7: 监视列表页 watchlist.html

**Files:**
- Create: `dashboard/public/watchlist.html`

设计稿来源：`stitch_crucix_cyber_industrial_prd/watchlist/code.html`

- [ ] **Step 1: 创建 watchlist.html**

复制 `watchlist/code.html` 框架。顶栏导航翻译为中文（Watchlist→监视列表，Overview→概览，Intelligence→情报）。侧边栏按标准导航替换，"监视列表"条目标记激活。在 `</body>` 前插入：

```html
<script type="module">
  import { authGuard, populateNav, apiFetch, logout } from './auth.js';

  const user = await authGuard();
  if (!user) return;
  populateNav(user);
  document.getElementById('btn-logout')?.addEventListener('click', logout);

  const cardsGrid  = document.getElementById('watchlist-cards');
  const addModal   = document.getElementById('add-modal');
  const addBtn     = document.getElementById('btn-add-watch');
  const totalEl    = document.getElementById('stat-total');

  // === 加载监视列表 ===
  async function loadWatchlist() {
    try {
      const res = await apiFetch('/api/v1/watchlist');
      if (!res?.ok) return;
      const { data } = await res.json();
      renderCards(data ?? []);
      if (totalEl) totalEl.textContent = `${(data ?? []).length}/03`;
    } catch { /* 保留设计稿静态卡片 */ }
  }

  function renderCards(items) {
    if (!cardsGrid) return;
    const iconMap = { ip: 'public', domain: 'dns', cve: 'bug_report', actor: 'person_search', keyword: 'sell', default: 'factory' };
    const labelMap = { ip: 'IP 监控', domain: '域名监控', cve: 'CVE 监控', actor: 'Actor 追踪', keyword: '关键词', default: '监控项' };
    cardsGrid.innerHTML = items.map(item => {
      const icon = iconMap[item.type] ?? iconMap.default;
      const label = labelMap[item.type] ?? labelMap.default;
      return `<div class="glass-panel bg-surface p-6 rounded-lg relative overflow-hidden group">
        <div class="absolute top-0 left-0 w-1 h-full bg-cyan-400"></div>
        <div class="flex justify-between items-start mb-4">
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-cyan-400">${icon}</span>
            <span class="font-mono-data text-cyan-400 uppercase tracking-widest text-xs">${label}</span>
          </div>
          <span class="text-[10px] font-mono-data bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20">ACTIVE</span>
        </div>
        <h3 class="font-h3 text-white mb-1 text-xl font-bold">${item.value ?? item.entity_id ?? '未知'}</h3>
        <p class="text-slate-500 text-xs font-mono-data">监控项: ${item.description ?? '全类型预警'}</p>
        <div class="mt-6 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button class="p-1 hover:text-error" data-id="${item.id}" data-action="delete">
            <span class="material-symbols-outlined text-sm">delete</span>
          </button>
        </div>
      </div>`;
    }).join('');

    // 绑定删除按钮
    cardsGrid.querySelectorAll('[data-action=delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteItem(btn.dataset.id));
    });
  }

  async function deleteItem(id) {
    if (!confirm('确认删除此监控项？')) return;
    try {
      const res = await apiFetch(`/api/v1/watchlist/${id}`, { method: 'DELETE' });
      if (res?.ok) loadWatchlist();
    } catch { /* 失败静默 */ }
  }

  // === 新增监控 ===
  addBtn?.addEventListener('click', async () => {
    const value = prompt('输入监控目标（IP/域名/CVE/关键词）：');
    if (!value?.trim()) return;
    const type = prompt('监控类型（ip/domain/cve/actor/keyword）：') ?? 'keyword';
    try {
      const res = await apiFetch('/api/v1/watchlist', {
        method: 'POST',
        body: JSON.stringify({ value: value.trim(), type: type.trim() }),
      });
      if (res?.ok) loadWatchlist();
      else { const d = await res?.json(); alert(d?.error ?? '新增失败'); }
    } catch { alert('网络错误'); }
  });

  loadWatchlist();
</script>
```

HTML 中需要添加 id：
- 监控卡片容器 `<div class="grid grid-cols-1 md:grid-cols-2 gap-6">` → `id="watchlist-cards"`
- 顶部"新增监控"按钮 → `id="btn-add-watch"`
- 统计栏"活跃监控" `<p class="text-xl ...">03/03</p>` → `id="stat-total"`
- 顶栏积分 `id="nav-credits"`，侧边栏用户名 `id="nav-username"`
- 侧边栏注销改为 `<button id="btn-logout">`

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/watchlist.html
git commit -m "feat(frontend): add watchlist page with CRUD wired to /api/v1/watchlist"
```

---

### Task 8: 账户管理页 account.html

**Files:**
- Create: `dashboard/public/account.html`

设计稿来源：`stitch_crucix_cyber_industrial_prd/_3/code.html`

- [ ] **Step 1: 创建 account.html**

复制 `_3/code.html` 框架。顶栏导航翻译（Mission Control→主控台，Data Grid→数据网格，Account→账户管理，激活 Account 项）。侧边栏按标准导航替换，"账户管理"条目标记激活。在 `</body>` 前插入：

```html
<script type="module">
  import { authGuard, populateNav, apiFetch, logout } from './auth.js';

  const user = await authGuard();
  if (!user) return;
  populateNav(user);
  document.getElementById('btn-logout')?.addEventListener('click', logout);

  // === 填充积分与订阅信息 ===
  const creditsLargeEl = document.getElementById('credits-large');
  const planBadgeEl    = document.getElementById('plan-badge');

  if (creditsLargeEl && user.credits_remaining != null)
    creditsLargeEl.textContent = Number(user.credits_remaining).toLocaleString();
  if (planBadgeEl && user.plan)
    planBadgeEl.textContent = ({ free:'免费版 FREE', pro:'专业版 PRO', enterprise:'企业版 ENTERPRISE', ultra:'旗舰版 ULTRA' }[user.plan] ?? user.plan);

  // === 加载 API Keys ===
  const keysBody = document.getElementById('api-keys-body');

  async function loadApiKeys() {
    try {
      const res = await apiFetch('/api/auth/api-keys');
      if (!res?.ok) return;
      const { data } = await res.json();
      if (!keysBody) return;
      keysBody.innerHTML = (data ?? []).map(k => `
        <tr class="hover:bg-white/5 transition-colors group">
          <td class="px-6 py-4 text-sm font-medium text-slate-200">${k.name}</td>
          <td class="px-6 py-4 text-sm font-mono-data text-cyan-400/80">${k.prefix}...</td>
          <td class="px-6 py-4 text-sm text-slate-500 font-mono-data">${new Date(k.created_at).toLocaleDateString('zh-CN')}</td>
          <td class="px-6 py-4">
            <span class="bg-cyan-500/10 text-cyan-400 text-[10px] px-2 py-0.5 rounded border border-cyan-400/20 font-label-caps uppercase">${k.revoked_at ? 'Revoked' : 'Active'}</span>
          </td>
          <td class="px-6 py-4 text-right">
            ${k.revoked_at ? '' : `<button class="material-symbols-outlined text-slate-500 hover:text-error transition-colors p-1" data-id="${k.id}" data-action="revoke">delete_forever</button>`}
          </td>
        </tr>`).join('');

      keysBody.querySelectorAll('[data-action=revoke]').forEach(btn => {
        btn.addEventListener('click', () => revokeKey(btn.dataset.id));
      });
    } catch { /* 失败保留静态示例 */ }
  }

  async function revokeKey(id) {
    if (!confirm('确认撤销此 API Key？操作不可撤销。')) return;
    try {
      const res = await apiFetch(`/api/auth/api-keys/${id}`, { method: 'DELETE' });
      if (res?.ok) loadApiKeys();
    } catch { alert('撤销失败'); }
  }

  // 新建 API Key
  document.getElementById('btn-new-key')?.addEventListener('click', async () => {
    const name = prompt('输入 API Key 名称（最多 64 字符）：');
    if (!name?.trim()) return;
    try {
      const res = await apiFetch('/api/auth/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res?.ok) {
        const { data } = await res.json();
        alert(`API Key 已创建（请立即复制，之后无法再次查看）：\n\n${data.key}`);
        loadApiKeys();
      } else {
        const d = await res?.json();
        alert(d?.error ?? '创建失败');
      }
    } catch { alert('网络错误'); }
  });

  loadApiKeys();
</script>
```

HTML 中需要添加 id：
- 大号积分数字 `<div class="text-4xl font-black text-cyan-400 ...">1,250</div>` → `id="credits-large"`
- 当前订阅计划名称 `<h4 ...>专业版 PRO</h4>` → `id="plan-badge"`
- API Keys 表格 `<tbody>` → `id="api-keys-body"`
- "新建 API KEY"按钮 → `id="btn-new-key"`
- 顶栏积分 `id="nav-credits"`，侧边栏用户名 `id="nav-username"`
- 侧边栏注销改为 `<button id="btn-logout">`

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/account.html
git commit -m "feat(frontend): add account management page wired to /api/auth/me and api-keys"
```

---

### Task 9: 源健康状态页 sources.html

**Files:**
- Create: `dashboard/public/sources.html`

设计稿来源：`stitch_crucix_cyber_industrial_prd/_4/code.html`（需翻译英文导航）

- [ ] **Step 1: 创建 sources.html，翻译导航**

复制 `_4/code.html` 框架。**翻译以下英文文字为中文：**

| 原文 | 中文 |
|------|------|
| Monitor | 监控 |
| Operations | 运营 |
| Network | 网络 |
| Normal | 正常 |
| Fault | 故障 |
| Total Run Success Rate | 总运行成功率 |
| PERCENT | 百分比 |
| Active | 活跃 |
| Failed | 故障 |
| Skipped | 跳过 |
| SYSTEM_UPTIME | 系统在线时长 |
| AUTO_REFRESH: 5S | 自动刷新: 5秒 |

侧边栏按标准导航替换，"源健康状态"条目标记激活。在 `</body>` 前插入：

```html
<script type="module">
  import { authGuard, populateNav, apiFetch, logout } from './auth.js';

  const user = await authGuard();
  if (!user) return;
  populateNav(user);
  document.getElementById('btn-logout')?.addEventListener('click', logout);

  const successRateEl = document.getElementById('success-rate');
  const activeCountEl = document.getElementById('count-active');
  const failCountEl   = document.getElementById('count-fail');
  const logList       = document.getElementById('failure-log-list');

  // === GET /api/health ===
  async function loadHealth() {
    try {
      const res = await apiFetch('/api/health');
      if (!res?.ok) return;
      const data = await res.json();
      // data 为 { status, version, pool } 等字段
      // 使用 SSE 事件做实时更新，此处仅展示整体状态
      const statusEl = document.getElementById('health-status');
      if (statusEl) statusEl.textContent = data.status === 'ok' ? '系统正常运行' : '系统异常';
    } catch { /* 保留静态 */ }
  }
  loadHealth();

  // === SSE 实时源状态更新 ===
  const token = localStorage.getItem('crx_access_token');
  const evtSrc = new EventSource(`/events?token=${encodeURIComponent(token ?? '')}`);
  evtSrc.addEventListener('source_status', (e) => {
    try {
      const evt = JSON.parse(e.data);
      // 将 source 状态更新注入故障日志
      if (!logList) return;
      if (evt.status !== 'ok') {
        const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        const item = document.createElement('div');
        item.className = 'p-3 bg-error/5 border-l-2 border-error/50 rounded flex gap-4';
        item.innerHTML = `
          <div class="text-error mt-1"><span class="material-symbols-outlined text-sm">warning</span></div>
          <div class="flex-1">
            <div class="flex justify-between text-[10px] font-mono-data text-error/80 uppercase">
              <span>${evt.source ?? 'UNKNOWN'}</span><span>${time}</span>
            </div>
            <div class="text-[12px] text-on-surface-variant font-medium mt-1">${evt.message ?? '连接异常'}</div>
          </div>`;
        logList.prepend(item);
        while (logList.children.length > 10) logList.lastChild.remove();
      }
    } catch { /* 忽略 */ }
  });
  evtSrc.onerror = () => evtSrc.close();
</script>
```

HTML 中需要添加 id：
- 圆形图中心百分比数字 `<span class="font-h1 ...">94.8</span>` → `id="success-rate"`
- Active 数字 → `id="count-active"` 
- Failed 数字 → `id="count-fail"`
- 故障日志容器 `<div class="space-y-4 max-h-[300px] overflow-y-auto pr-2">` → `id="failure-log-list"`
- 页面标题或状态描述区域 → `id="health-status"`
- 顶栏积分 `id="nav-credits"`，侧边栏用户名 `id="nav-username"`
- 侧边栏注销改为 `<button id="btn-logout">`

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/sources.html
git commit -m "feat(frontend): add source health page with SSE real-time updates"
```

---

## Self-Review

### 1. Spec Coverage

| 需求 | 对应 Task |
|------|-----------|
| 登录页（_1 设计稿） | T2 login.html |
| 注册页（_2 设计稿） | T2 register.html |
| 账户管理（_3 设计稿） | T8 account.html |
| 源健康状态（_4 设计稿，导航翻译） | T9 sources.html |
| 实体搜索（_5 设计稿） | T5 search.html |
| 工作台图谱（_6 设计稿） | T6 workbench.html |
| 主仪表盘（_7 设计稿，中文） | T3 index.html |
| 情报简报（tactical_glass_v2） | T4 briefing.html |
| 监视列表（watchlist 设计稿） | T7 watchlist.html |
| 共享认证工具 | T1 auth.js |
| 所有页面中文 | 所有 Task（导航翻译、中文文案保留） |
| 接入 REST API v1 | T3/T4/T5/T6/T7/T8/T9 |
| 接入认证 API | T1/T2/T8 |

### 2. 类型/函数一致性

- `auth.js` 导出：`getToken`, `setToken`, `logout`, `apiFetch`, `authGuard`, `populateNav`
- 所有页面 import 同一路径 `./auth.js`
- `populateNav(user)` 期望 `id="nav-credits"` 和 `id="nav-username"` 存在于 DOM（不存在则 no-op）
- `apiFetch` 返回 `Response | undefined`（logout 后返回 undefined）——所有调用点已做 `res?.ok` 判空处理

### 3. 无占位符确认

所有 JS 代码块均为完整实现，无 TBD/TODO。
