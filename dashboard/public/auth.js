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
