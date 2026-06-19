// ============================================================
// layout.js – Shared sidebar renderer สำหรับทุกหน้าใน dashboard
// ============================================================

function initLayout(activePage) {
  const isAdmin      = Auth.isAdmin();
  const isSuperAdmin = typeof Auth.isSuperAdmin === 'function' ? Auth.isSuperAdmin() : false;
  const user         = Auth.getUser();
  const _t  = (typeof t === 'function') ? t : (k => k);
  const lang = (typeof I18n !== 'undefined') ? I18n.getLang() : 'th';

  const menuMain = isAdmin ? [
    { key: 'home',      icon: 'fa-tachometer-alt', label: _t('nav_home'),     url: '/dashboard/home/' },
    { key: 'purchase',  icon: 'fa-shopping-cart',  label: _t('nav_purchase'), url: '/dashboard/purchase/' },
    { key: 'receive',   icon: 'fa-truck-loading',  label: _t('nav_receive'),  url: '/dashboard/receive/' },
    { key: 'stock',     icon: 'fa-warehouse',      label: _t('nav_stock'),    url: '/dashboard/stock/' }
  ] : [];

  const menuWithdrawal = isAdmin ? [
    { key: 'withdrawal',       icon: 'fa-file-export',    label: _t('nav_withdrawal'),       url: '/dashboard/withdrawal/' },
    { key: 'withdrawal-items', icon: 'fa-clipboard-list', label: _t('nav_withdrawal_items'), url: '/dashboard/withdrawal/items/' },
    { key: 'transfer',         icon: 'fa-dolly',          label: _t('nav_transfer'),         url: '/dashboard/transfer/' },
    { key: 'recipients',       icon: 'fa-users',          label: _t('nav_recipients'),       url: '/dashboard/recipients/' }
  ] : [
    { key: 'withdrawal',       icon: 'fa-file-export',    label: _t('nav_withdrawal'),       url: '/dashboard/withdrawal/' },
    { key: 'withdrawal-items', icon: 'fa-clipboard-list', label: _t('nav_withdrawal_items'), url: '/dashboard/withdrawal/items/' }
  ];

  const menuSettings = isAdmin ? [
    { key: 'report',    icon: 'fa-chart-bar',    label: _t('nav_report'),    url: '/dashboard/report/' },
    { key: 'expenses',  icon: 'fa-receipt',       label: _t('nav_expenses'),  url: '/dashboard/expenses/' },
    { key: 'products',  icon: 'fa-tags',          label: _t('nav_products'),  url: '/dashboard/products/' },
    ...(isSuperAdmin ? [{ key: 'users', icon: 'fa-users-cog', label: _t('nav_users'), url: '/dashboard/users/' }] : [])
  ] : [];

  function makeNavItems(items) {
    return items.map(item =>
      `<li><a class="nav-link${item.key === activePage ? ' active' : ''}" href="${item.url}">` +
      `<i class="fas ${item.icon}"></i>${item.label}</a></li>`
    ).join('');
  }

  const langBtnLabel = lang === 'th' ? 'EN' : 'ภาษาไทย';
  const branchLabel = isSuperAdmin
    ? '<span class="sidebar-branch-badge superadmin"><i class="fas fa-sitemap me-1"></i>สาขาหลัก</span>'
    : user && user.branch_name
      ? `<span class="sidebar-branch-badge"><i class="fas fa-store-alt me-1"></i>${user.branch_name}</span>`
      : user && user.branch_id
        ? `<span class="sidebar-branch-badge"><i class="fas fa-store-alt me-1"></i>${user.branch_id}</span>`
        : '';

  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-brand d-flex align-items-center gap-2">
      <div class="sidebar-brand-icon"><i class="fas fa-boxes"></i></div>
      <div>
        <div class="sidebar-brand-text">${_t('sidebar_brand')}</div>
        <div class="sidebar-brand-ver">v1.2.1</div>
      </div>
    </div>
    ${isAdmin ? `<div class="sidebar-section-label">${_t('menu_main')}</div>
    <ul class="sidebar-nav list-unstyled">${makeNavItems(menuMain)}</ul>` : ''}
    <div class="sidebar-section-label">${_t('menu_dispatch')}</div>
    <ul class="sidebar-nav list-unstyled">${makeNavItems(menuWithdrawal)}</ul>
    ${isAdmin ? `<div class="sidebar-section-label">${_t('menu_reports')}</div>
    <ul class="sidebar-nav list-unstyled">${makeNavItems(menuSettings)}</ul>` : ''}
    <div class="sidebar-footer">
      <div class="d-flex align-items-center gap-2 mb-2">
        <div style="width:36px;height:36px;border-radius:50%;background:#1e293b;display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-user-circle" style="font-size:1.1rem;color:#64748b;"></i>
        </div>
        <div>
          <div class="sidebar-user-name" id="user-name">-</div>
          <div class="sidebar-user-role" id="user-role">-</div>
          ${branchLabel ? `<div id="user-branch">${branchLabel}</div>` : '<div id="user-branch"></div>'}
        </div>
      </div>
      <button class="btn btn-sm btn-outline-secondary w-100" onclick="I18n.setLang(I18n.getLang()==='th'?'en':'th')" style="font-size:.8rem;">
        🌐 ${langBtnLabel}
      </button>
    </div>`;

  // Mobile sidebar toggle
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  document.addEventListener('click', function (e) {
    const sidebar = document.getElementById('sidebar');
    const toggle  = document.getElementById('sidebar-toggle');
    if (!sidebar.contains(e.target) && (!toggle || !toggle.contains(e.target))) {
      sidebar.classList.remove('open');
    }
  });

  // Apply i18n translations to static HTML elements
  if (typeof I18n !== 'undefined') I18n.apply();
}
