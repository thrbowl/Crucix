# Shell 组件提取 + 双层认证守卫 设计文档

**日期：** 2026-04-23  
**状态：** 待实现

---

## 背景

7 个受保护页面各自复制了完全相同的 topbar（~30行）和 sidebar（~60行）HTML，维护困难。此外，页面仅依赖客户端 JS 守卫，未登录用户可直接通过 URL 获取 HTML 文件，存在安全隐患。

---

## 目标

1. 将 topbar + sidebar 提取为单一可维护的 `shell.js` 模块
2. 实现双层认证守卫：服务端拦截 HTML + 客户端 JWT 验证

---

## 架构

### 双层认证守卫

```
用户请求 /index.html
    ↓
【第一层】Express 中间件
    检查 refresh_token httpOnly Cookie
    无 cookie → 302 /login.html（终止）
    有 cookie → 放行，返回 HTML
    ↓
浏览器加载 HTML，执行 shell.js
    ↓
【第二层】前端 authGuard()
    检查 localStorage token + 调用 /api/auth/me
    失败 → logout() → /login.html（终止）
    成功 → 解除 visibility:hidden，页面可见
```

两层分工：
- 服务端：阻止未登录用户获取 HTML 结构
- 客户端：验证 token 有效性，防止 cookie 过期但页面可访问的边界情况

### 文件变更

```
dashboard/public/
├── shell.js          ← 新建
├── auth.js           ← 不改动
├── index.html        ← 删除 <header>/<aside>，引入 shell.js
├── briefing.html     ← 同上
├── search.html       ← 同上
├── workbench.html    ← 同上
├── watchlist.html    ← 同上
├── sources.html      ← 同上
└── account.html      ← 同上

server.mjs            ← 新增 HTML 守卫中间件
```

---

## 组件设计

### `shell.js`

对外暴露单一函数：

```js
export async function initShell(currentPage: string): Promise<void>
```

执行顺序（同步优先，异步在后）：

1. **同步**：向 `<body>` 插入 topbar HTML 和 sidebar HTML
2. **同步**：根据 `currentPage` 给对应菜单项加高亮 class
3. **异步**：调用 `authGuard()`，失败则终止（内部会 `logout()` 跳转）
4. **同步**：`populateNav(user)` 填充用户名和积分
5. **同步**：绑定 `#btn-logout` 点击事件
6. **同步**：将 `#page-content` 的 `visibility` 改为 `visible`

`currentPage` 合法值：

| 值 | 页面 | 菜单高亮项 |
|---|---|---|
| `briefing-center` | index.html | 简报中心 |
| `briefing` | briefing.html | 威胁态势 |
| `search` | search.html | 实体搜索 |
| `workbench` | workbench.html | 工作台 |
| `watchlist` | watchlist.html | 监视列表 |
| `sources` | sources.html | 源健康状态 |
| `account` | account.html | 账户管理 |

Sidebar 菜单项配置（内嵌于 `shell.js`）：

```js
const NAV_ITEMS = [
  { id: 'briefing-center', href: '/index.html',     icon: 'newspaper',      label: '简报中心' },
  { id: 'briefing',        href: '/briefing.html',  icon: 'biotech',        label: '威胁态势' },
  { id: 'search',          href: '/search.html',    icon: 'manage_search',  label: '实体搜索' },
  { id: 'workbench',       href: '/workbench.html', icon: 'terminal',       label: '工作台'   },
  { id: 'watchlist',       href: '/watchlist.html', icon: 'visibility',     label: '监视列表' },
  { id: 'sources',         href: '/sources.html',   icon: 'analytics',      label: '源健康状态' },
  { id: 'account',         href: '/account.html',   icon: 'account_circle', label: '账户管理' },
];
```

### 各页面改动模式

```html
<!-- 删除原 <header> 和 <aside> -->

<div id="page-content" style="visibility:hidden">
  <!-- 页面主体内容（不变） -->
</div>

<script type="module">
  import { initShell } from './shell.js';
  await initShell('search');

  // 页面自身的业务逻辑（原有代码，删除 authGuard/populateNav/logout 调用）
</script>
```

---

## 服务端守卫

在 `server.mjs` 的静态文件服务之前注册中间件：

```js
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
```

**放行规则：**
- `/login.html`, `/register.html`, `/loading.html` — 公开页面，不拦截
- 所有 `.js`, `.css` 等静态资源 — 不拦截
- `/api/*` — 由现有 JWT 中间件处理，不受此守卫影响

---

## 错误处理

| 场景 | 第一层（服务端）| 第二层（客户端）| 结果 |
|---|---|---|---|
| 无 cookie，无 token | 302 /login.html | 不执行 | 跳转登录 |
| 有 cookie，无 token | 放行 | authGuard 失败 → logout() | 跳转登录 |
| 有 cookie，token 过期 | 放行 | authGuard 调用 /api/auth/refresh，成功则继续 | 正常访问 |
| 有 cookie，refresh 也过期 | 放行 | refresh 失败 → logout()（清除 cookie）| 跳转登录 |
| 有 cookie，有效 token | 放行 | authGuard 成功 | 正常访问 |

---

## 不在范围内

- 修改 `auth.js` 内部逻辑
- 改动 `login.html` / `register.html` / `loading.html`
- 修改任何 API 路由
- 修改页面的视觉设计或业务逻辑
