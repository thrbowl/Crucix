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

// NOTE: item.href and item.icon must be static/trusted strings — no escaping is applied.
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

/**
 * Inject the shared topbar/sidebar into the DOM, run auth guard,
 * and reveal #page-content on success.
 * @param {string} currentPage - Must match an id in NAV_ITEMS (e.g. 'briefing-center')
 */
export async function initShell(currentPage) {
  injectShell(currentPage);

  const user = await authGuard();
  if (!user) return null;

  populateNav(user);
  document.getElementById('btn-logout')?.addEventListener('click', logout);

  const content = document.getElementById('page-content');
  if (content) content.style.visibility = 'visible';

  return user;
}
