// dashboard/public/shell.js
import { authGuard, populateNav, logout } from './auth.js';

const NAV_ITEMS = [
  { id: 'briefing-center', href: '/',           icon: 'newspaper',      label: '简报中心' },
  { id: 'briefing',        href: '/briefing',   icon: 'biotech',        label: '威胁态势' },
  { id: 'search',          href: '/search',     icon: 'manage_search',  label: '实体搜索' },
  { id: 'workbench',       href: '/workbench',  icon: 'terminal',       label: '工作台'   },
  { id: 'watchlist',       href: '/watchlist',  icon: 'visibility',     label: '监视列表' },
  { id: 'sources',         href: '/sources',    icon: 'analytics',      label: '源健康状态' },
  { id: 'account',         href: '/account',    icon: 'account_circle', label: '账户管理' },
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
  <div class="flex items-center space-x-5">
    <div class="flex items-center space-x-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
      <span class="material-symbols-outlined text-sm text-cyan-400">database</span>
      <span id="nav-credits" class="font-mono-data text-xs text-cyan-400">-- Credits</span>
    </div>
    <button class="material-symbols-outlined text-slate-400 hover:text-cyan-400 transition-colors">notifications</button>
    <div class="relative pl-2 border-l border-white/10">
      <button id="user-menu-btn" class="flex items-center space-x-2 hover:opacity-80 transition-opacity">
        <div class="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
          <span class="material-symbols-outlined text-[16px] text-cyan-400">person</span>
        </div>
        <span id="nav-username" class="font-mono-data text-xs text-slate-300">OPERATOR</span>
        <span class="material-symbols-outlined text-[14px] text-slate-500">expand_more</span>
      </button>
      <div id="user-dropdown" class="hidden absolute right-0 top-[calc(100%+8px)] w-44 bg-slate-900 border border-white/10 rounded-lg shadow-2xl py-1 z-50">
        <a href="/account" class="flex items-center space-x-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-cyan-400 transition-colors">
          <span class="material-symbols-outlined text-[15px]">lock_reset</span><span>修改密码</span>
        </a>
        <div id="admin-menu-item" class="hidden">
          <div class="my-1 border-t border-white/5"></div>
          <a href="/admin" class="flex items-center space-x-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-amber-400 transition-colors">
            <span class="material-symbols-outlined text-[15px]">admin_panel_settings</span><span>后台管理</span>
          </a>
        </div>
        <div class="my-1 border-t border-white/5"></div>
        <button id="dropdown-logout" class="w-full flex items-center space-x-2 px-3 py-2 text-xs text-slate-400 hover:bg-white/5 hover:text-red-400 transition-colors">
          <span class="material-symbols-outlined text-[15px]">logout</span><span>注销登录</span>
        </button>
      </div>
    </div>
  </div>
</header>`;

  const navItems = NAV_ITEMS.map(item => buildNavItem(item, currentPage)).join('\n');
  const sidebar = `<aside class="fixed left-0 top-16 h-[calc(100vh-64px)] w-64 bg-slate-950/40 backdrop-blur-2xl border-r border-white/5 flex flex-col py-8 space-y-2 z-40">
  <nav class="flex-1 px-4 space-y-1">
    ${navItems}
  </nav>
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

  // Admin menu item
  if (user.is_admin) {
    document.getElementById('admin-menu-item')?.classList.remove('hidden');
  }

  // User dropdown toggle
  const menuBtn = document.getElementById('user-menu-btn');
  const dropdown = document.getElementById('user-dropdown');
  menuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle('hidden');
  });
  document.addEventListener('click', () => dropdown?.classList.add('hidden'));

  document.getElementById('dropdown-logout')?.addEventListener('click', logout);

  const content = document.getElementById('page-content');
  if (content) content.style.visibility = 'visible';

  return user;
}
