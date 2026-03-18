// ============================================================
// layout.js – Shared sidebar renderer สำหรับทุกหน้าใน dashboard
// ============================================================

function initLayout(activePage) {
  const isAdmin = Auth.isAdmin(); // อ่านจาก closure — ไม่ได้อ่านจาก sessionStorage

  const menuMain = isAdmin ? [
    { key: 'home',      icon: 'fa-tachometer-alt', label: 'แดชบอร์ด',           url: '/dashboard/home/' },
    { key: 'purchase',  icon: 'fa-shopping-cart',  label: 'สั่งซื้อสินค้า',      url: '/dashboard/purchase/' },
    { key: 'receive',   icon: 'fa-truck-loading',  label: 'รับสินค้า / ต้นทุน',  url: '/dashboard/receive/' },
    { key: 'stock',     icon: 'fa-warehouse',      label: 'สต็อคสินค้า',         url: '/dashboard/stock/' }
  ] : [];

  const menuWithdrawal = isAdmin ? [
    { key: 'withdrawal', icon: 'fa-file-export', label: 'เบิกสินค้า',    url: '/dashboard/withdrawal/' },
    { key: 'recipients', icon: 'fa-users',       label: 'ผู้รับสินค้า',  url: '/dashboard/recipients/' }
  ] : [
    { key: 'withdrawal', icon: 'fa-file-export', label: 'เบิกสินค้า',    url: '/dashboard/withdrawal/' }
  ];

  const menuSettings = isAdmin ? [
    { key: 'report',   icon: 'fa-chart-bar', label: 'รายงานรายเดือน', url: '/dashboard/report/' },
    { key: 'products', icon: 'fa-tags',      label: 'จัดการสินค้า',   url: '/dashboard/products/' }
  ] : [];

  function makeNavItems(items) {
    return items.map(item =>
      `<li><a class="nav-link${item.key === activePage ? ' active' : ''}" href="${item.url}">` +
      `<i class="fas ${item.icon}"></i>${item.label}</a></li>`
    ).join('');
  }

  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-brand d-flex align-items-center gap-2">
      <div class="sidebar-brand-icon"><i class="fas fa-boxes"></i></div>
      <div>
        <div class="sidebar-brand-text">ระบบเบิกสินค้า</div>
        <div class="sidebar-brand-ver">v1.0.8</div>
      </div>
    </div>
    ${isAdmin ? `<div class="sidebar-section-label">เมนูหลัก</div>
    <ul class="sidebar-nav list-unstyled">${makeNavItems(menuMain)}</ul>` : ''}
    <div class="sidebar-section-label">การเบิกจ่าย</div>
    <ul class="sidebar-nav list-unstyled">${makeNavItems(menuWithdrawal)}</ul>
    ${isAdmin ? `<div class="sidebar-section-label">รายงาน & ตั้งค่า</div>
    <ul class="sidebar-nav list-unstyled">${makeNavItems(menuSettings)}</ul>` : ''}
    <div class="sidebar-footer">
      <div class="d-flex align-items-center gap-2">
        <div style="width:36px;height:36px;border-radius:50%;background:#1e293b;display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-user-circle" style="font-size:1.1rem;color:#64748b;"></i>
        </div>
        <div>
          <div class="sidebar-user-name" id="user-name">-</div>
          <div class="sidebar-user-role" id="user-role">-</div>
        </div>
      </div>
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
}
