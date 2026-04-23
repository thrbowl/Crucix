# Shell 组件提取 + 双层认证守卫 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 7 个页面中重复的 topbar/sidebar 提取为 `shell.js` 统一模块，并实现服务端 cookie 检查 + 客户端 JWT 双层认证守卫。

**Architecture:** `shell.js` 同步注入 topbar/sidebar HTML，异步执行 `authGuard()`，认证通过后解除 `#page-content` 的 `visibility:hidden`。Express 在 `express.static` 之前插入中间件，检查 `refresh_token` cookie，无 cookie 则直接 302 到 `/login.html`。

**Tech Stack:** 原生 ES Module、Express.js cookie-parser

---

## 文件变更总览

| 文件 | 操作 | 内容 |
|---|---|---|
| `dashboard/public/shell.js` | 新建 | topbar + sidebar HTML，`initShell()` |
| `server.mjs` | 修改 | 中间件顺序调整 + HTML 守卫 |
| `dashboard/public/index.html` | 修改 | 删除 header(116-139) + aside(142-194)，加 `#page-content`，换脚本 |
| `dashboard/public/briefing.html` | 修改 | 删除 header(86-114) + aside(116-166)，加 `#page-content`，换脚本 |
| `dashboard/public/search.html` | 修改 | 删除 header(110-124) + aside(127-163)，加 `#page-content`，换脚本 |
| `dashboard/public/workbench.html` | 修改 | 删除 header(99-129) + aside(132-172)，加 `#page-content`，加 `ml-64`，换脚本 |
| `dashboard/public/watchlist.html` | 修改 | 删除 header(96-124) + aside(126-159)，加 `#page-content`，换脚本 |
| `dashboard/public/sources.html` | 修改 | 删除 nav(144-166) + aside(171-204)，加 `#page-content`，换脚本 |
| `dashboard/public/account.html` | 修改 | 删除 header(121-143) + aside(146-179)，加 `#page-content`，换脚本 |

---

## Task 1: 创建 shell.js

**Files:**
- Create: `dashboard/public/shell.js`

- [ ] **Step 1: 创建 shell.js**

```js
// dashboard/public/shell.js
import { authGuard, populateNav, logout } from './auth.js';

const NAV_ITEMS = [
  { id: 'briefing-center', href: '/index.html',     icon: 'newspaper',      label: '简报中心' },
  { id: 'briefing',        href: '/briefing.html',  icon: 'biotech',        label: '威胁态势' },
  { id: 'search',          href: '/search.html',    icon: 'manage_search',  label: '实体搜索' },
  { id: 'workbench',       href: '/workbench.html', icon: 'terminal',       label: '工作台'   },
  { id: 'watchlist',       href: '/watchlist.html', icon: 'visibility',     label: '监视列表' },
  { id: 'sources',         href: '/sources.html',   icon: 'analytics',      label: '源健康状态' },
  { id: 'account',         href: '/account.html',   icon: 'account_circle', label: '账户管理' },
];

function buildNavItem(item, currentPage) {
  const isActive = item.id === currentPage;
  const activeClass = 'bg-cyan-500/10 text-cyan-400 border-r-2 border-cyan-400 shadow-[inset_0_0_15px_rgba(0,229,255,0.1)]';
  const inactiveClass = 'text-slate-500 hover:bg-white/5 hover:text-cyan-200 transition-colors duration-300';
  return `<a href="${item.href}" class="flex items-center space-x-3 px-4 py-3 rounded font-['Space_Grotesk'] text-sm font-medium tracking-tight ${isActive ? activeClass : inactiveClass}">
    <span class="material-symbols-outlined">${item.icon}</span><span>${item.label}</span>
  </a>`;
}

function injectShell(currentPage) {
  const topbar = `<header class="fixed top-0 z-50 w-full h-16 flex justify-between items-center px-6 bg-slate-950/80 backdrop-blur-lg border-b border-white/10">
  <div class="flex items-center space-x-8">
    <span class="text-2xl font-black text-cyan-400 drop-shadow-[0_0_8px_rgba(0,229,255,0.6)] font-['Space_Grotesk'] tracking-wider uppercase">CRUCIX</span>
  </div>
  <div class="flex items-center space-x-6">
    <div class="flex items-center space-x-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
      <span class="material-symbols-outlined text-sm text-cyan-400">database</span>
      <span id="nav-credits" class="font-mono-data text-xs text-cyan-400">-- Credits</span>
    </div>
    <div class="flex space-x-4">
      <button class="material-symbols-outlined text-slate-400 hover:text-cyan-400 transition-colors">notifications</button>
      <button class="material-symbols-outlined text-slate-400 hover:text-cyan-400 transition-colors">settings</button>
    </div>
  </div>
</header>`;

  const navItems = NAV_ITEMS.map(item => buildNavItem(item, currentPage)).join('\n');
  const sidebar = `<aside class="fixed left-0 top-16 h-[calc(100vh-64px)] w-64 bg-slate-950/40 backdrop-blur-2xl border-r border-white/5 flex flex-col py-8 space-y-2 z-40">
  <div class="px-6 mb-8">
    <div class="flex items-center space-x-3 mb-1">
      <div class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
      <span id="nav-username" class="text-cyan-500 font-bold font-mono-data tracking-tight text-sm">OPERATOR</span>
    </div>
    <span class="text-slate-500 text-[10px] uppercase tracking-[0.2em]">Level 4 Access</span>
  </div>
  <nav class="flex-1 px-4 space-y-1">
    ${navItems}
  </nav>
  <div class="px-4 pt-4 mt-4 border-t border-white/5 space-y-1">
    <button id="btn-logout" class="flex items-center space-x-3 px-4 py-3 rounded text-slate-500 hover:bg-white/5 hover:text-cyan-200 w-full text-left font-['Space_Grotesk'] text-sm font-medium tracking-tight">
      <span class="material-symbols-outlined">logout</span><span>注销登录</span>
    </button>
  </div>
</aside>`;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = topbar + sidebar;
  document.body.prepend(...wrapper.children);
}

export async function initShell(currentPage) {
  injectShell(currentPage);

  const user = await authGuard();
  if (!user) return;

  populateNav(user);
  document.getElementById('btn-logout')?.addEventListener('click', logout);

  const content = document.getElementById('page-content');
  if (content) content.style.visibility = 'visible';
}
```

- [ ] **Step 2: 手动验证文件存在**

```bash
ls dashboard/public/shell.js
```

期望输出：`dashboard/public/shell.js`

- [ ] **Step 3: Commit**

```bash
git add dashboard/public/shell.js
git commit -m "feat: add shell.js with shared topbar/sidebar and auth guard"
```

---

## Task 2: 服务端 HTML 守卫（server.mjs）

**Files:**
- Modify: `server.mjs:58-60`

- [ ] **Step 1: 调整中间件顺序，在 express.static 之前加守卫**

当前 server.mjs 第 58-60 行：
```js
app.use(express.static(join(ROOT, 'dashboard/public')));
app.use(express.json());
app.use(cookieParser());
```

替换为：
```js
app.use(express.json());
app.use(cookieParser());

const PROTECTED_PAGES = [
  '/index.html', '/briefing.html', '/search.html',
  '/workbench.html', '/watchlist.html', '/sources.html', '/account.html',
];
app.use((req, res, next) => {
  if (PROTECTED_PAGES.includes(req.path) && !req.cookies?.refresh_token) {
    return res.redirect('/login.html');
  }
  next();
});

app.use(express.static(join(ROOT, 'dashboard/public')));
```

- [ ] **Step 2: 验证服务启动正常**

```bash
node --check server.mjs && echo "syntax OK"
```

期望输出：`syntax OK`

- [ ] **Step 3: 手动测试守卫（需要服务运行中）**

在浏览器中直接访问 `http://localhost:3117/index.html`（未登录状态），应被重定向到 `/login.html`。

- [ ] **Step 4: Commit**

```bash
git add server.mjs
git commit -m "feat: add server-side HTML guard for protected pages"
```

---

## Task 3: 更新 index.html

**Files:**
- Modify: `dashboard/public/index.html`

index.html 当前结构（body 内）：
- 第 116-139 行：`<header>` topbar → **删除**
- 第 140 行：`<div class="flex flex-1 pt-16 overflow-hidden">` → 加 `id="page-content" style="visibility:hidden"`
- 第 142-194 行：`<aside>` nav sidebar（在 flex div 内）→ **删除**
- 第 196 行：`<main class="flex-1 overflow-y-auto relative p-6 scanline">` → 加 `ml-64`
- 第 412-420 行：script 认证块 → **替换**

- [ ] **Step 1: 删除 topbar header（第 116-139 行）**

找到并删除整个块（从 `<!-- TopNavBar -->` 注释到 `</header>`）：

```html
<!-- 删除这一整块 -->
<!-- TopNavBar -->
<header class="fixed top-0 z-50 bg-slate-950/80 ...">
  ...
</header>
```

- [ ] **Step 2: 给 flex 容器加 page-content id（第 140 行）**

将：
```html
<div class="flex flex-1 pt-16 overflow-hidden">
```
改为：
```html
<div id="page-content" style="visibility:hidden" class="flex flex-1 pt-16 overflow-hidden">
```

- [ ] **Step 3: 删除 nav sidebar aside（第 142-194 行）**

找到并删除整个块（从 `<!-- SideNavBar -->` 注释到 `</aside>`）：

```html
<!-- 删除这一整块 -->
<!-- SideNavBar -->
<aside class="hidden md:flex flex-col h-full w-64 ...">
  ...
</aside>
```

- [ ] **Step 4: 给 main 加 ml-64（第 196 行）**

将：
```html
<main class="flex-1 overflow-y-auto relative p-6 scanline">
```
改为：
```html
<main class="flex-1 ml-64 overflow-y-auto relative p-6 scanline">
```

- [ ] **Step 5: 替换认证脚本块**

找到 script 块（约第 412 行）：
```html
<script type="module">
  import { authGuard, populateNav, logout } from './auth.js';

  const user = await authGuard();
  if (!user) return;
  populateNav(user);

  document.getElementById('btn-logout')?.addEventListener('click', logout);
  // ... 后续业务代码
```

替换开头三行 import + authGuard 调用：
```html
<script type="module">
  import { initShell } from './shell.js';
  await initShell('briefing-center');

  // 后续所有业务代码保持不变，从此处继续
```

- [ ] **Step 6: Commit**

```bash
git add dashboard/public/index.html
git commit -m "refactor: migrate index.html to shell.js"
```

---

## Task 4: 更新 briefing.html

**Files:**
- Modify: `dashboard/public/briefing.html`

briefing.html 当前结构：
- 第 86-114 行：`<header>` topbar → **删除**
- 第 116-166 行：`<aside>` nav sidebar → **删除**
- 第 168 行：`<main class="ml-64 pt-24 px-8 pb-12 min-h-screen ...">` → 加 `id="page-content" style="visibility:hidden"`（main 已有 ml-64）
- 第 405-411 行：script 认证块 → **替换**

- [ ] **Step 1: 删除 topbar header（第 86-114 行）**

删除从 `<header class="fixed top-0 w-full z-50 ...">` 到 `</header>` 的整块。

- [ ] **Step 2: 删除 nav sidebar aside（第 116-166 行）**

删除从 `<aside class="fixed left-0 top-16 ...">` 到 `</aside>` 的整块。

- [ ] **Step 3: 给 main 加 page-content id（现在约第 120 行）**

将：
```html
<main class="ml-64 pt-24 px-8 pb-12 min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(0,229,255,0.05),transparent_40%)]">
```
改为：
```html
<main id="page-content" style="visibility:hidden" class="ml-64 pt-24 px-8 pb-12 min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(0,229,255,0.05),transparent_40%)]">
```

- [ ] **Step 4: 替换认证脚本块**

找到 script 块（约第 300 行后）：
```html
<script type="module">
  import { authGuard, populateNav, apiFetch, logout } from './auth.js';

  const user = await authGuard();
  if (!user) return;
  populateNav(user);
  document.getElementById('btn-logout')?.addEventListener('click', logout);
  // ... 后续业务代码
```

替换为：
```html
<script type="module">
  import { initShell } from './shell.js';
  import { apiFetch } from './auth.js';
  await initShell('briefing');

  // 后续所有业务代码保持不变
```

- [ ] **Step 5: Commit**

```bash
git add dashboard/public/briefing.html
git commit -m "refactor: migrate briefing.html to shell.js"
```

---

## Task 5: 更新 search.html

**Files:**
- Modify: `dashboard/public/search.html`

search.html 当前结构：
- 第 110-124 行：`<header>` topbar → **删除**
- 第 125 行：`<div class="flex pt-16 min-h-screen">` → 加 `id="page-content" style="visibility:hidden"`
- 第 127-163 行：`<aside>` nav sidebar（在 flex div 内）→ **删除**
- 第 165 行：`<main class="flex-1 ml-64 p-8">` → 已有 ml-64，无需改动
- 约第 300+ 行：script 认证块 → **替换**

- [ ] **Step 1: 删除 topbar header（第 110-124 行）**

删除从 `<header class="fixed top-0 z-50 w-full h-16 ...">` 到 `</header>` 的整块。

- [ ] **Step 2: 给 flex 容器加 page-content id（第 125 行）**

将：
```html
<div class="flex pt-16 min-h-screen">
```
改为：
```html
<div id="page-content" style="visibility:hidden" class="flex pt-16 min-h-screen">
```

- [ ] **Step 3: 删除 nav sidebar aside（第 127-163 行，删除 header 后行号前移）**

删除从 `<aside class="fixed left-0 h-[calc(100vh-64px)] w-64 ...">` 到 `</aside>` 的整块。

- [ ] **Step 4: 替换认证脚本块**

找到 script 块（文件末尾）：
```html
<script type="module">
  import { authGuard, populateNav, apiFetch, logout } from './auth.js';

  const user = await authGuard();
  if (!user) return;
  populateNav(user);
  document.getElementById('btn-logout')?.addEventListener('click', logout);
  // ... 后续业务代码
```

替换为：
```html
<script type="module">
  import { initShell } from './shell.js';
  import { apiFetch } from './auth.js';
  await initShell('search');

  // 后续所有业务代码保持不变
```

- [ ] **Step 5: Commit**

```bash
git add dashboard/public/search.html
git commit -m "refactor: migrate search.html to shell.js"
```

---

## Task 6: 更新 workbench.html

**Files:**
- Modify: `dashboard/public/workbench.html`

workbench.html 当前结构：
- 第 99-129 行：`<header>` topbar → **删除**
- 第 130 行：`<div class="flex pt-16 h-screen overflow-hidden">` → 加 `id="page-content" style="visibility:hidden"`
- 第 132-172 行：`<aside class="hidden md:flex ...">` nav sidebar（在 flex div 内）→ **删除**
- 第 174 行：`<main class="flex-1 relative overflow-hidden ...">` → 加 `ml-64`
- **注意**：第 269-364 行有第二个 `<aside>`（详情面板，在 main 内部）→ **保留，不删除**
- 约第 383 行：script 认证块 → **替换**

- [ ] **Step 1: 删除 topbar header（第 99-129 行）**

删除从 `<header class="fixed top-0 left-0 right-0 z-50 ...">` 到 `</header>` 的整块。

- [ ] **Step 2: 给 flex 容器加 page-content id（第 130 行，删除 header 后行号前移）**

将：
```html
<div class="flex pt-16 h-screen overflow-hidden">
```
改为：
```html
<div id="page-content" style="visibility:hidden" class="flex pt-16 h-screen overflow-hidden">
```

- [ ] **Step 3: 删除 nav sidebar aside（第 132-172 行，删除 header 后行号前移）**

删除从 `<aside class="hidden md:flex flex-col h-full w-64 ...">` 到其对应 `</aside>` 的整块。
**注意：** 不要删除第 269-364 行（main 内部）那个 `<aside>`，那是详情面板。

- [ ] **Step 4: 给 main 加 ml-64**

将：
```html
<main class="flex-1 relative overflow-hidden bg-background grid-bg">
```
改为：
```html
<main class="flex-1 ml-64 relative overflow-hidden bg-background grid-bg">
```

- [ ] **Step 5: 替换认证脚本块**

找到 script 块：
```html
<script type="module">
  import { authGuard, populateNav, apiFetch, logout } from './auth.js';

  const user = await authGuard();
  if (!user) return;
  populateNav(user);
  document.getElementById('btn-logout')?.addEventListener('click', logout);
  // ... 后续业务代码
```

替换为：
```html
<script type="module">
  import { initShell } from './shell.js';
  import { apiFetch } from './auth.js';
  await initShell('workbench');

  // 后续所有业务代码保持不变
```

- [ ] **Step 6: Commit**

```bash
git add dashboard/public/workbench.html
git commit -m "refactor: migrate workbench.html to shell.js"
```

---

## Task 7: 更新 watchlist.html

**Files:**
- Modify: `dashboard/public/watchlist.html`

watchlist.html 当前结构：
- 第 96-124 行：`<header>` topbar → **删除**
- 第 126-159 行：`<aside>` nav sidebar（body 直接子元素）→ **删除**
- 第 161 行：`<main class="ml-64 mt-16 p-8 min-h-screen">` → 加 `id="page-content" style="visibility:hidden"`（main 已有 ml-64 和 mt-16）
- 约第 433 行：script 认证块 → **替换**

- [ ] **Step 1: 删除 topbar header（第 96-124 行）**

删除从 `<header class="fixed top-0 z-50 ...">` 到 `</header>` 的整块。

- [ ] **Step 2: 删除 nav sidebar aside（第 126-159 行，删除 header 后行号前移）**

删除从 `<aside class="fixed left-0 top-16 ...">` 到 `</aside>` 的整块。

- [ ] **Step 3: 给 main 加 page-content id**

将：
```html
<main class="ml-64 mt-16 p-8 min-h-screen">
```
改为：
```html
<main id="page-content" style="visibility:hidden" class="ml-64 mt-16 p-8 min-h-screen">
```

- [ ] **Step 4: 替换认证脚本块**

找到 script 块：
```html
<script type="module">
  import { authGuard, populateNav, apiFetch, logout } from './auth.js';

  const user = await authGuard();
  if (!user) return;
  populateNav(user);
  document.getElementById('btn-logout')?.addEventListener('click', logout);
  // ... 后续业务代码
```

替换为：
```html
<script type="module">
  import { initShell } from './shell.js';
  import { apiFetch } from './auth.js';
  await initShell('watchlist');

  // 后续所有业务代码保持不变
```

- [ ] **Step 5: Commit**

```bash
git add dashboard/public/watchlist.html
git commit -m "refactor: migrate watchlist.html to shell.js"
```

---

## Task 8: 更新 sources.html

**Files:**
- Modify: `dashboard/public/sources.html`

sources.html 当前结构（注意：topbar 是 `<nav>` 而非 `<header>`）：
- 第 144-166 行：`<nav>` topbar → **删除**
- 第 168 行：`<div class="flex h-screen pt-16">` → 加 `id="page-content" style="visibility:hidden"`
- 第 171-204 行：`<aside>` nav sidebar（在 flex div 内）→ **删除**
- 第 207 行：`<main class="flex-1 overflow-y-auto ... ml-64">` → 已有 ml-64，无需改动
- **注意**：第 213 行的 `<header>` 是页面内容区标题，不是 topbar，**保留**
- 约第 433 行：script 认证块 → **替换**

- [ ] **Step 1: 删除 topbar nav（第 144-166 行）**

删除从 `<!-- TopNavBar -->` 注释到 `</nav>` 的整块（带有 `fixed top-0 z-50` 样式的那个 `<nav>`）。

- [ ] **Step 2: 给 flex 容器加 page-content id（第 168 行，删除 nav 后行号前移）**

将：
```html
<div class="flex h-screen pt-16">
```
改为：
```html
<div id="page-content" style="visibility:hidden" class="flex h-screen pt-16">
```

- [ ] **Step 3: 删除 nav sidebar aside（第 171-204 行，删除 nav 后行号前移）**

删除从 `<aside class="fixed left-0 top-16 ...">` 到 `</aside>` 的整块（`<!-- Standard Sidebar -->` 注释下的那个）。

- [ ] **Step 4: 替换认证脚本块**

找到 script 块：
```html
<script type="module">
  import { authGuard, populateNav, apiFetch, logout } from './auth.js';

  const user = await authGuard();
  if (!user) return;
  populateNav(user);
  document.getElementById('btn-logout')?.addEventListener('click', logout);
  // ... 后续业务代码
```

替换为：
```html
<script type="module">
  import { initShell } from './shell.js';
  import { apiFetch } from './auth.js';
  await initShell('sources');

  // 后续所有业务代码保持不变
```

- [ ] **Step 5: Commit**

```bash
git add dashboard/public/sources.html
git commit -m "refactor: migrate sources.html to shell.js"
```

---

## Task 9: 更新 account.html

**Files:**
- Modify: `dashboard/public/account.html`

account.html 当前结构：
- 第 121-143 行：`<header>` topbar → **删除**
- 第 144 行：`<div class="flex min-h-screen pt-16">` → 加 `id="page-content" style="visibility:hidden"`
- 第 146-179 行：`<aside>` nav sidebar（在 flex div 内）→ **删除**
- 第 181 行：`<main class="flex-1 md:ml-64 p-8 overflow-y-auto scanline">` → 已有 ml-64，无需改动
- 约第 386 行：script 认证块 → **替换**

- [ ] **Step 1: 删除 topbar header（第 121-143 行）**

删除从 `<header class="fixed top-0 z-50 ...">` 到 `</header>` 的整块。

- [ ] **Step 2: 给 flex 容器加 page-content id（第 144 行，删除 header 后行号前移）**

将：
```html
<div class="flex min-h-screen pt-16">
```
改为：
```html
<div id="page-content" style="visibility:hidden" class="flex min-h-screen pt-16">
```

- [ ] **Step 3: 删除 nav sidebar aside（第 146-179 行，删除 header 后行号前移）**

删除从 `<aside class="fixed left-0 top-16 ...">` 到 `</aside>` 的整块。

- [ ] **Step 4: 替换认证脚本块**

找到 script 块：
```html
<script type="module">
  import { authGuard, populateNav, apiFetch, logout } from './auth.js';

  const user = await authGuard();
  if (!user) return;
  populateNav(user);
  document.getElementById('btn-logout')?.addEventListener('click', logout);
  // ... 后续业务代码
```

替换为：
```html
<script type="module">
  import { initShell } from './shell.js';
  import { apiFetch } from './auth.js';
  await initShell('account');

  // 后续所有业务代码保持不变
```

- [ ] **Step 5: Commit**

```bash
git add dashboard/public/account.html
git commit -m "refactor: migrate account.html to shell.js"
```

---

## Task 10: 集成验收

- [ ] **Step 1: 启动服务**

```bash
npm run dev
```

- [ ] **Step 2: 验证服务端守卫**

清除浏览器 cookie 后直接访问 `http://localhost:3117/index.html`，应立即跳转到 `/login.html`。

- [ ] **Step 3: 验证登录后正常访问**

登录后访问各页面，验证：
- topbar 显示正确（CRUCIX logo + 积分 + 按钮）
- sidebar 显示正确（用户名 + 菜单 + 当前页高亮 + 注销按钮）
- 页面内容正常加载（无可见的 visibility:hidden 闪烁）
- 7 个页面的菜单高亮项各自正确

- [ ] **Step 4: 验证注销功能**

点击注销按钮，应清除 token 并跳转到 `/login.html`，之后访问任何受保护页面应被重定向。

- [ ] **Step 5: 最终 commit**

```bash
git add -A
git commit -m "refactor: complete shell.js migration and dual-layer auth guard"
```
