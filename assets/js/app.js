// ============================================================
// app.js – Main Application Logic สำหรับ dashboard.html
// ============================================================

/* ===== STATE ===== */
const App = {
  user: null,
  products: [],
  stock: [],
  imports: [],
  withdrawals: [],
  recipients: [],
  branches: [],
  transfers: [],
  currentSection: 'dashboard',
  editingId: null
};

/* ===== INIT ===== */
$(document).ready(async function () {
  const page = document.body.dataset.page || 'home';
  const STAFF_ALLOWED_PAGES = ['withdrawal', 'withdrawal-items'];
  const SUPERADMIN_ONLY_PAGES = ['users'];

  // 1. ถ้าไม่มี token เลย → ไป login ทันที (ไม่รอ server)
  if (!Auth.isLoggedIn()) { window.location.replace('/login/'); return; }

  // 2. โหลด user จาก cache เพื่อ render sidebar ทันที (ไม่รอ server)
  const cachedUser = Auth.getUser();
  if (!cachedUser) { Auth.clear(); window.location.replace('/login/'); return; }

  // ตั้ง role จาก cache เพื่อให้ initLayout ใช้ได้ทันที
  Auth.setCachedRole(cachedUser.role);
  document.body.classList.toggle('is-superadmin', Auth.isSuperAdmin()); // เปิดคอลัมน์ "สาขา" ให้ superadmin
  App.user = cachedUser;

  // 3. Render sidebar และ UI ทันทีจาก cache (ไม่มี flash)
  if (typeof initLayout === 'function') initLayout(page);
  $('#user-name').text(App.user.name || App.user.username);
  $('#user-role').text(Auth.isSuperAdmin() ? 'ผู้ดูแลระบบหลัก' : Auth.isAdmin() ? 'ผู้ดูแลระบบ' : 'พนักงาน');

  // Logout
  $('#btn-logout').on('click', function () {
    Auth.clear();
    window.location.replace('/login/');
  });

  // 4. Verify กับ server ใน background (security check)
  //    ถ้า token หมดอายุ / ถูกลบ / role เปลี่ยน → redirect
  Auth.verifyAccess().then(check => {
    if (!check.ok) {
      // token ถูกลบ/หมดอายุจริง → token ถูกล้างแล้วใน verifyAccess → ไป login (หน้า login จะแสดงฟอร์ม ไม่เด้งกลับ)
      // ถ้าเป็น network error (ไม่มี expired) → อยู่หน้าเดิมด้วย cache ไม่ต้องเด้ง กัน loop ตอนเน็ตหลุด
      if (check.expired) window.location.replace('/login/');
      return;
    }
    // อัพเดท user จาก server (เผื่อ role หรือชื่อเปลี่ยน)
    App.user = check.user;
    document.body.classList.toggle('is-superadmin', Auth.isSuperAdmin()); // ยืนยันสิทธิ์คอลัมน์สาขาจาก server
    $('#user-name').text(App.user.name || App.user.username);
    $('#user-role').text(Auth.isSuperAdmin() ? 'ผู้ดูแลระบบหลัก' : Auth.isAdmin() ? 'ผู้ดูแลระบบ' : 'พนักงาน');
    // อัพเดท branch badge หลัง server ยืนยัน (กรณี branch_name เปลี่ยน)
    const u = check.user;
    if (u && u.branch_name) {
      const badge = Auth.isSuperAdmin()
        ? '<span class="sidebar-branch-badge superadmin"><i class="fas fa-sitemap me-1"></i>สาขาหลัก</span>'
        : `<span class="sidebar-branch-badge"><i class="fas fa-store-alt me-1"></i>${u.branch_name}</span>`;
      $('#user-branch').html(badge);
    }
    // ตรวจ page permission หลัง server ยืนยัน role จริง
    if (SUPERADMIN_ONLY_PAGES.includes(page) && !Auth.isSuperAdmin()) {
      window.location.replace('/dashboard/home/');
    } else if (!Auth.isAdmin() && !STAFF_ALLOWED_PAGES.includes(page)) {
      window.location.replace('/dashboard/withdrawal/');
    }
  });

  // 5. ตรวจ page permission จาก cache ก่อน (กัน flash ของ content)
  if (SUPERADMIN_ONLY_PAGES.includes(page) && !Auth.isSuperAdmin()) {
    window.location.replace('/dashboard/home/'); return;
  }
  if (!Auth.isAdmin() && !STAFF_ALLOWED_PAGES.includes(page)) {
    window.location.replace('/dashboard/withdrawal/'); return;
  }

  // Prefetch shared data
  prefetchData();

  // แจ้งหน้าที่ต้องการรู้ว่า app init เสร็จแล้ว (เช่น หน้า users)
  document.dispatchEvent(new Event('appReady'));

  // URL param: ?new=1 to auto-open create modal
  const urlParams = new URLSearchParams(window.location.search);

  // Page-specific init
  switch (page) {
    case 'home':       loadDashboard();  break;
    case 'purchase':   loadPurchase();   if (urlParams.get('new') === '1') setTimeout(openPurchaseModal, 600); break;
    case 'receive':    loadReceive();    break;
    case 'stock':         loadStock();              break;
    case 'stock-imports': loadStockImportHistory(); break;
    case 'bestsellers':   loadBestSellers();        break;
    case 'withdrawal': loadWithdrawal(); if (urlParams.get('new') === '1') setTimeout(openWithdrawalModal, 600); break;
    case 'withdrawal-items': loadWithdrawalItems(); break;
    case 'transfer':   loadTransfer();   if (urlParams.get('new') === '1') setTimeout(openTransferModal, 600); break;
    case 'recipients': loadRecipients(); break;
    case 'report':     initReports();    break;
    case 'expenses':   loadExpenses();   break;
    case 'income':     loadIncome();     break;
    case 'products':   loadProducts();   break;
    case 'users':      /* handled by inline script in users/index.html */ break;
  }
});

/* ===== PREFETCH ===== */
async function prefetchData() {
  try {
    const [p, s, r] = await Promise.all([API.getProducts(), API.getStock(), API.getRecipients()]);
    if (p.success) App.products   = p.data || [];
    if (s.success) App.stock      = s.data || [];
    if (r.success) App.recipients = r.data || [];
    populateProductSelects();
    populateRecipientSelects();
  } catch (_) {}
}

/* ===== NAVIGATION ===== */
function loadSection(name) {
  const urls = {
    dashboard:  '/dashboard/home/',
    purchase:   '/dashboard/purchase/',
    receive:    '/dashboard/receive/',
    stock:      '/dashboard/stock/',
    withdrawal: '/dashboard/withdrawal/',
    transfer:   '/dashboard/transfer/',
    recipients: '/dashboard/recipients/',
    reports:    '/dashboard/report/',
    expenses:   '/dashboard/expenses/',
    income:     '/dashboard/income/',
    products:   '/dashboard/products/'
  };
  if (urls[name]) window.location.href = urls[name];
}

/* ===== TOAST ===== */
function showToast(msg, type = 'success') {
  const icons = { success: 'fa-check-circle', danger: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  const id = 'toast_' + Date.now();
  const html = `<div id="${id}" class="toast-item ${type}">
    <i class="fas ${icons[type] || 'fa-info-circle'}"></i><span>${msg}</span></div>`;
  $('#toast-container').append(html);
  setTimeout(() => {
    $(`#${id}`).css('animation', 'slideOut .3s ease-in forwards');
    setTimeout(() => $(`#${id}`).remove(), 320);
  }, 3500);
}

/* ===== LOADING ===== */
function showLoading(sel) {
  $(sel + ' .section-data').html(`<div class="loading-overlay">
    <div class="spinner-border text-primary me-3"></div><span>กำลังโหลดข้อมูล...</span></div>`);
}

/**
 * ป้องกันกดซ้ำ — disable ปุ่ม + แสดง spinner ระหว่าง async fn
 * @param {string|jQuery} selector  — ปุ่มที่ต้องการล็อค
 * @param {string}        restoreHtml — HTML ที่จะ restore หลัง fn เสร็จ
 * @param {Function}      fn          — async function ที่ต้องการรัน
 */
async function withBtnLoading(selector, restoreHtml, fn) {
  const $btn = $(selector);
  $btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>บันทึก...');
  try { await fn(); } finally { $btn.prop('disabled', false).html(restoreHtml); }
}

/**
 * Custom confirm dialog (แทน window.confirm) — สวยกว่า + แสดงอนิเมชั่นกำลังโหลดระหว่าง action
 * opts: { title, message(HTML), okText, okClass, icon, iconClass(warn|danger|info), loadingText, onConfirm:async }
 * คืน Promise → resolve เป็นค่าที่ onConfirm คืน (หรือ true) ถ้ายืนยัน / false ถ้ายกเลิก
 * ถ้า onConfirm โยน error → แสดง toast แล้วเปิด dialog ค้างไว้ให้กดใหม่/ปิดได้
 */
function uiConfirm(opts) {
  opts = opts || {};
  if (!document.getElementById('modalConfirm')) {
    $('body').append(`
      <div class="modal fade" id="modalConfirm" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-confirm">
          <div class="modal-content">
            <div class="confirm-overlay" id="confirm-overlay">
              <div class="spinner-border"></div>
              <div class="confirm-overlay-text mt-3" id="confirm-overlay-text">กำลังดำเนินการ...</div>
            </div>
            <div class="modal-body text-center p-4">
              <div class="confirm-icon warn" id="confirm-icon"><i class="fas fa-exclamation-triangle"></i></div>
              <h5 class="confirm-title mt-3 mb-2" id="confirm-title">ยืนยัน</h5>
              <div class="confirm-msg text-muted" id="confirm-msg"></div>
              <div class="d-flex gap-2 justify-content-center mt-4">
                <button type="button" class="btn btn-light px-4" id="confirm-no">ยกเลิก</button>
                <button type="button" class="btn btn-danger px-4" id="confirm-yes">ยืนยัน</button>
              </div>
            </div>
          </div>
        </div>
      </div>`);
  }

  return new Promise(function(resolve) {
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalConfirm'), { backdrop: 'static' });
    $('#confirm-title').text(opts.title || 'ยืนยัน');
    $('#confirm-msg').html(opts.message || '');
    $('#confirm-yes').text(opts.okText || 'ยืนยัน').attr('class', 'btn px-4 ' + (opts.okClass || 'btn-danger'));
    $('#confirm-icon').attr('class', 'confirm-icon ' + (opts.iconClass || 'warn'))
      .html(`<i class="fas ${opts.icon || 'fa-exclamation-triangle'}"></i>`);
    $('#confirm-overlay-text').text(opts.loadingText || 'กำลังดำเนินการ...');
    $('#confirm-overlay').removeClass('show');
    $('#confirm-yes, #confirm-no').prop('disabled', false);

    let settled = false;
    function close(val) {
      settled = true;
      $('#confirm-yes').off('click.cfm'); $('#confirm-no').off('click.cfm');
      modal.hide();
      resolve(val);
    }
    $('#confirm-no').off('click.cfm').on('click.cfm', function() { if (!settled) close(false); });
    $('#confirm-yes').off('click.cfm').on('click.cfm', async function() {
      if (settled) return;
      $('#confirm-overlay').addClass('show');                 // อนิเมชั่นกำลังโหลด
      $('#confirm-yes, #confirm-no').prop('disabled', true);
      try {
        const result = opts.onConfirm ? await opts.onConfirm() : true;
        close(result === undefined ? true : result);
      } catch (e) {
        $('#confirm-overlay').removeClass('show');
        $('#confirm-yes, #confirm-no').prop('disabled', false);
        showToast((e && e.message) ? e.message : 'เกิดข้อผิดพลาด', 'danger');
      }
    });
    modal.show();
  });
}

/* ===== CONFIRM DIALOG ===== */
function confirmAction(msg, cb) {
  if (confirm(msg)) cb();
}

/* ===== FORMAT HELPERS ===== */
function statusLabel(s) {
  const keyMap = { pending: 'status_pending', 'in-transit': 'status_in_transit', received: 'status_received',
              approved: 'status_approved', completed: 'status_completed', returned: 'status_returned',
              cancelled: 'status_cancelled', normal: 'status_normal_badge', return: 'status_return',
              partial_returned: 'status_partial_returned' };
  return typeof t === 'function' ? t(keyMap[s] || s) : s;
}

/* ===== POPULATE SELECTS ===== */
function populateProductSelects() {
  const opts = App.products.map(p =>
    `<option value="${p.id}" data-unit="${p.unit}" data-cost="${p.cost_price}" data-name="${p.name}">${p.name} (${p.code || '-'})</option>`
  ).join('');
  const label = typeof t === 'function' ? t('select_product') : '-- เลือกสินค้า --';
  $('.product-select').html(`<option value="">${label}</option>` + opts);
}

function populateRecipientSelects() {
  const opts = App.recipients.map(r =>
    `<option value="${r.id}" data-dept="${r.department}" data-name="${r.name}">${r.name} – ${r.department}</option>`
  ).join('');
  const label = typeof t === 'function' ? t('select_recipient') : '-- เลือกผู้รับ --';
  $('#wd-recipient').html(`<option value="">${label}</option>` + opts);
}

// ============================================================
// SECTION: DASHBOARD
// ============================================================
async function loadDashboard() {
  // superadmin: โหลดภาพรวมสาขาพร้อมกัน
  if (Auth.isSuperAdmin()) loadBranchOverview();

  try {
    const res = await API.getDashboardStats();
    if (!res.success) throw new Error(res.message);
    const d = res.data;
    $('#stat-products').text(Fmt.number(d.total_products));
    $('#stat-stock').text(Fmt.number(d.total_stock_units || d.total_stock || 0));
    $('#stat-pending-imports').text(Fmt.number(d.pending_imports || d.pending_orders || 0));
    $('#stat-today-withdrawals').text(Fmt.number(d.completed_today || d.today_withdrawals || 0));
    if (d.low_stock_items > 0) {
      $('#stock-alert-panel').removeClass('d-none');
      $('#stock-alert-items').text(d.low_stock_items + ' รายการ');
    }
  } catch (e) { showToast('โหลดแดชบอร์ดล้มเหลว: ' + e.message, 'danger'); }

  // Recent withdrawals
  try {
    const wr = await API.getWithdrawals();
    if (wr.success) {
      const recent = (wr.data || []).slice(-5).reverse();
      App.withdrawals = wr.data || [];
      renderRecentWithdrawals(recent);
    }
  } catch (_) {}

  // Low stock
  try {
    if (App.stock.length === 0) {
      const sr = await API.getStock();
      if (sr.success) App.stock = sr.data || [];
    }
    const low = App.stock.filter(s => parseFloat(s.quantity || 0) <= parseFloat(s.min_stock || 0) && parseFloat(s.min_stock || 0) > 0).slice(0, 5);
    renderLowStockList(low);
  } catch (_) {}
}

function renderRecentWithdrawals(items) {
  if (!items.length) {
    $('#recent-withdrawals-body').html('<tr><td colspan="5" class="text-center text-muted py-4">ยังไม่มีข้อมูล</td></tr>');
    return;
  }
  $('#recent-withdrawals-body').html(items.map(w => {
    const wItems = Array.isArray(w.items) ? w.items : [];
    return `<tr>
      <td><span class="fw-semibold">${w.id}</span></td>
      <td>${Fmt.date(w.withdrawal_date || w.created_at)}</td>
      <td>${w.recipient_name || '-'}</td>
      <td class="text-center">${wItems.length} รายการ</td>
      <td>${Fmt.statusBadge(w.status)}</td>
    </tr>`;
  }).join(''));
}

// ============================================================
// BRANCH OVERVIEW (superadmin)
// ============================================================
async function loadBranchOverview() {
  try {
    const res = await API.getBranchOverview();
    if (!res.success) return;
    renderBranchOverview(res.data || []);
  } catch (_) {}
}

function renderBranchOverview(branches) {
  const $panel = $('#branch-overview-panel');
  if (!$panel.length) return;
  $panel.removeClass('d-none');
  if (!branches.length) {
    $('#branch-overview-body').html(
      `<div class="col-12 text-center text-muted py-3">${t('no_branches_msg')} ` +
      `<button class="btn btn-sm btn-primary ms-2" onclick="openBranchModal()">` +
      `<i class="fas fa-plus me-1"></i>${t('btn_add_first_branch')}</button></div>`
    );
    return;
  }
  $('#branch-overview-body').html(branches.map(b => {
    const lowCls = b.low_stock_items > 0 ? 'text-danger fw-bold' : '';
    return `<div class="col-xl-3 col-md-4 col-sm-6">
      <div class="branch-card">
        <div class="branch-card-header">
          <i class="fas fa-store-alt me-2"></i><span class="branch-card-name">${b.name}</span>
          <button class="btn-branch-edit ms-auto" title="${t('th_manage')}"
            onclick="openEditBranch('${b.id}')">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn-branch-edit ms-1" title="${t('btn_delete_branch')}" style="background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.4);color:#fca5a5;"
            onclick="confirmDeleteBranch('${b.id}','${(b.name||'').replace(/'/g,"\\'")}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
        <div class="branch-card-body">
          <div class="branch-stat-row">
            <span class="bstat-label"><i class="fas fa-tags me-1"></i>${t('bstat_products')}</span>
            <span class="bstat-val">${Fmt.number(b.total_products)}</span>
          </div>
          <div class="branch-stat-row">
            <span class="bstat-label"><i class="fas fa-warehouse me-1"></i>${t('bstat_stock_val')}</span>
            <span class="bstat-val">${Fmt.currency(b.total_stock_value)}</span>
          </div>
          <div class="branch-stat-row">
            <span class="bstat-label"><i class="fas fa-file-export me-1"></i>${t('bstat_pending_wd')}</span>
            <span class="bstat-val">${Fmt.number(b.pending_withdrawals)}</span>
          </div>
          <div class="branch-stat-row">
            <span class="bstat-label"><i class="fas fa-exclamation-triangle me-1"></i>${t('bstat_low_stock')}</span>
            <span class="bstat-val ${lowCls}">${Fmt.number(b.low_stock_items)}</span>
          </div>
        </div>
      </div>
    </div>`;
  }).join(''));
}

let _editingBranchId = null;
function openBranchModal() {
  _editingBranchId = null;
  $('#branch-form')[0].reset();
  $('#modalBranchLabel').text(t('modal_add_branch'));
  new bootstrap.Modal('#modalBranch').show();
}
async function openEditBranch(id) {
  // ดึงข้อมูลสาขาเต็ม (รวม name_en/tax_id ที่ overview ไม่ได้ส่งมา)
  let b = (App.branches || []).find(x => String(x.id) === String(id));
  if (!b) {
    try { const r = await API.getBranches(); if (r.success) { App.branches = r.data || []; b = App.branches.find(x => String(x.id) === String(id)); } } catch (_) {}
  }
  b = b || {};
  _editingBranchId = id;
  $('#branch-name').val(b.name || '');
  $('#branch-name-en').val(b.name_en || '');
  $('#branch-tax-id').val(b.tax_id || '');
  $('#branch-address').val(b.address || '');
  $('#branch-phone').val(b.phone || '');
  $('#modalBranchLabel').text(t('modal_edit_branch'));
  new bootstrap.Modal('#modalBranch').show();
}
async function confirmDeleteBranch(id, name) {
  if (!confirm(`${t('confirm_delete_branch')}\n"${name}"`)) return;
  try {
    const res = await API.deleteBranch(id);
    if (res.success) {
      showToast(t('btn_delete_branch') + ' สำเร็จ', 'success');
      loadBranchOverview();
    } else throw new Error(res.message);
  } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'); }
}

async function saveBranch() {
  const name = $('#branch-name').val().trim();
  if (!name) { showToast('กรุณากรอกชื่อสาขา', 'warning'); return; }
  const data = { name, name_en: $('#branch-name-en').val().trim(), tax_id: $('#branch-tax-id').val().trim(),
    address: $('#branch-address').val().trim(), phone: $('#branch-phone').val().trim() };
  if (_editingBranchId) data.id = _editingBranchId;
  $('#btn-save-branch').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>บันทึก...');
  try {
    const res = _editingBranchId ? await API.updateBranch(data) : await API.addBranch(data);
    if (res.success) {
      showToast(_editingBranchId ? 'อัพเดทสาขาสำเร็จ!' : 'เพิ่มสาขาสำเร็จ!', 'success');
      App.branches = []; // ล้าง cache ให้ดึงข้อมูลใหม่รอบหน้า
      bootstrap.Modal.getOrCreateInstance('#modalBranch').hide();
      loadBranchOverview();
    } else throw new Error(res.message);
  } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'); }
  $('#btn-save-branch').prop('disabled', false).html('<i class="fas fa-save me-1"></i>บันทึก');
}

function renderLowStockList(items) {
  if (!items.length) {
    $('#low-stock-list').html('<div class="text-muted text-center py-3 small">สต็อคปกติทุกรายการ 👍</div>');
    return;
  }
  $('#low-stock-list').html(items.map(s => `
    <div class="low-stock-alert">
      <div class="d-flex justify-content-between align-items-center">
        <span class="fw-semibold">${s.product_name || s.product_code || s.product_id}</span>
        <span class="badge bg-warning text-dark">${s.quantity} ${s.unit}</span>
      </div>
      <small class="text-muted">คงเหลือต่ำกว่า ${s.min_stock} ${s.unit}</small>
    </div>`).join(''));
}

// ============================================================
// SECTION: PURCHASE (สั่งซื้อสินค้า)
// ============================================================
let purchaseFilter = 'all';
async function loadPurchase() {
  try {
    const [res] = await Promise.all([API.getImports(), ensureBranchesLoaded()]);
    if (!res.success) throw new Error(res.message);
    App.imports = res.data || [];
    renderPurchaseTable(App.imports);
  } catch (e) { showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger'); }
}

function renderPurchaseTable(data) {
  const filtered = purchaseFilter === 'all' ? data : data.filter(r => r.status === purchaseFilter);
  if (!filtered.length) {
    $('#purchase-table-body').html(`<tr><td colspan="${colspanWithBranch(8)}" class="text-center text-muted py-4">ไม่พบข้อมูล</td></tr>`);
    return;
  }
  $('#purchase-table-body').html(filtered.map(r => {
    const itemCount = Array.isArray(r.items) ? r.items.length : 0;
    return `<tr>
      <td class="fw-semibold">${r.id}</td>
      <td>${Fmt.date(r.order_date)}</td>
      <td>${r.supplier || '-'}</td>
      <td class="text-center">${itemCount} รายการ</td>
      <td class="text-end">${Fmt.yuan(r.yuan_amount)} <small class="text-muted">× ${r.exchange_rate}</small></td>
      <td class="text-end fw-semibold">${Fmt.currency(r.total_cost)}</td>
      <td>${Fmt.statusBadge(r.status)}</td>
      ${branchCell(r.branch_id)}
      <td>
        <button class="btn btn-sm btn-outline-primary me-1" onclick="viewImport('${r.id}')"><i class="fas fa-eye"></i></button>
        ${r.status !== 'received' ? `<button class="btn btn-sm btn-outline-success" onclick="markReceived('${r.id}')"><i class="fas fa-check"></i> รับของ</button>` : ''}
      </td>
    </tr>`;
  }).join(''));
}

$(document).on('click', '.purchase-filter', function () {
  $('.purchase-filter').removeClass('active');
  $(this).addClass('active');
  purchaseFilter = $(this).data('filter');
  renderPurchaseTable(App.imports);
});

async function openPurchaseModal(record = null) {
  App.editingId = record ? record.id : null;
  $('#po-form')[0].reset();
  $('#po-items-container').html('');
  $('#modalPurchaseLabel').html(record
    ? '<i class="fas fa-edit me-2"></i>แก้ไขรายการสั่งซื้อ'
    : '<i class="fas fa-shopping-cart me-2"></i>' + t('modal_po_title'));
  new bootstrap.Modal('#modalPurchase').show();

  if (!App.products.length) {
    $('#po-items-container').html(
      '<div class="text-center text-muted py-3"><div class="spinner-border spinner-border-sm text-primary me-2"></div>กำลังโหลดรายการสินค้า...</div>'
    );
    try {
      const res = await API.getProducts();
      if (res.success) { App.products = res.data || []; }
    } catch (_) {}
    $('#po-items-container').html('');
  }

  if (record) {
    // Edit mode — pre-fill from saved record
    $('#po-supplier').val(record.supplier || '');
    $('#po-order-date').val(record.order_date ? record.order_date.split('T')[0] : '');
    $('#po-exchange-rate').val(record.exchange_rate || CONFIG.EXCHANGE_RATE_DEFAULT);
    $('#po-notes').val(record.notes || '');
    $('#rate-hint').html('<i class="fas fa-info-circle text-primary me-1"></i>อัตราที่บันทึกไว้ตอนสั่งซื้อ');
    const items = Array.isArray(record.items) ? record.items : [];
    items.forEach(function(item) {
      addPoItem();
      const $row = $('#po-items-container .item-row').last();
      $row.find('.po-product-select').val(item.product_id);
      $row.find('.po-qty').val(item.quantity);
      $row.find('.po-unit-price').val(item.unit_price_yuan || 0);
    });
    if (!items.length) addPoItem();
  } else {
    // Create mode
    $('#po-exchange-rate').val(CONFIG.EXCHANGE_RATE_DEFAULT);
    $('#rate-hint').html('<i class="fas fa-circle-notch fa-spin me-1"></i>กำลังโหลดอัตราปัจจุบัน...');
    addPoItem();
    fetchLiveRate();
  }

  calcPoTotal();
}

/* ===== LIVE EXCHANGE RATE FETCH ===== */
async function fetchLiveRate() {
  const $btn  = $('#btn-refresh-rate');
  const $hint = $('#rate-hint');
  $btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm"></span>');

  function applyRate(rate) {
    $('#po-exchange-rate').val(rate);
    calcPoTotal();
    const now = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    $hint.html('<i class="fas fa-check-circle text-success me-1"></i>อัตราล่าสุด (' + now + ' น.)');
  }

  // fawazahmed0/currency-api: open-source, free forever, no key, updated daily
  // Primary: jsDelivr CDN | Backup: Cloudflare Pages (same data source)
  const ENDPOINTS = [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json',
    'https://latest.currency-api.pages.dev/v1/currencies/cny.json'
  ];
  let fetched = false;
  for (const url of ENDPOINTS) {
    try {
      const res  = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const rate = data.cny && data.cny.thb ? parseFloat(data.cny.thb).toFixed(4) : null;
      if (!rate) continue;
      applyRate(rate);
      fetched = true;
      break;
    } catch (_) { /* try next */ }
  }
  if (!fetched) {
    $('#po-exchange-rate').val(CONFIG.EXCHANGE_RATE_DEFAULT);
    calcPoTotal();
    $hint.html('<i class="fas fa-exclamation-triangle text-warning me-1"></i>ไม่สามารถเชื่อมต่อได้ ใช้ค่าสำรอง ' + CONFIG.EXCHANGE_RATE_DEFAULT);
  }
  $btn.prop('disabled', false).html('<i class="fas fa-sync-alt"></i>');
}

function addPoItem() {
  const id = Date.now();
  const prodOpts = App.products.map(p =>
    `<option value="${p.id}" data-name="${p.name}" data-unit="${p.unit}" data-cost="${p.cost_price || 0}">${p.name}</option>`).join('');
  const html = `<div class="item-row" id="poi-${id}">
    <div class="row g-2 align-items-end">
      <div class="col-md-5">
        <label class="form-label small mb-1">สินค้า</label>
        <select class="form-select form-select-sm po-product-select" onchange="onPoProductChange(this)">
          <option value="">-- เลือกสินค้า --</option>${prodOpts}</select>
      </div>
      <div class="col-md-2">
        <label class="form-label small mb-1">จำนวน</label>
        <input type="number" class="form-control form-control-sm po-qty" value="1" min="1" oninput="calcPoTotal()">
      </div>
      <div class="col-md-2">
        <label class="form-label small mb-1">ราคา/ชิ้น (¥)</label>
        <input type="number" class="form-control form-control-sm po-unit-price" value="0" min="0" oninput="calcPoTotal()">
      </div>
      <div class="col-md-2">
        <label class="form-label small mb-1">รวม (¥)</label>
        <input type="text" class="form-control form-control-sm po-subtotal bg-light" readonly>
      </div>
      <div class="col-md-1 text-end">
        <button type="button" class="btn btn-sm btn-outline-danger" onclick="$(this).closest('.item-row').remove(); calcPoTotal()">
          <i class="fas fa-trash"></i></button>
      </div>
    </div>
  </div>`;
  $('#po-items-container').append(html);
}

function onPoProductChange(sel) {
  const cost = parseFloat($(sel).find(':selected').data('cost')) || 0;
  const rate  = parseFloat($('#po-exchange-rate').val()) || 1;
  const row   = $(sel).closest('.item-row');
  if (cost > 0) row.find('.po-unit-price').val((cost / rate).toFixed(2));
  calcPoTotal();
}

function calcPoTotal() {
  let totalYuan = 0;
  $('#po-items-container .item-row').each(function () {
    const qty   = parseFloat($(this).find('.po-qty').val()) || 0;
    const price = parseFloat($(this).find('.po-unit-price').val()) || 0;
    const sub   = qty * price;
    $(this).find('.po-subtotal').val(sub.toFixed(2));
    totalYuan += sub;
  });
  const rate    = parseFloat($('#po-exchange-rate').val()) || 1;
  const baseTHB = totalYuan * rate;
  $('#po-total-yuan').text(Fmt.yuan(totalYuan));
  $('#po-base-thb').text(Fmt.currency(baseTHB));
}

$('#po-exchange-rate').on('input', calcPoTotal);

async function savePurchaseOrder() {
  const supplier = $('#po-supplier').val().trim();
  const orderDate = $('#po-order-date').val();
  if (!supplier || !orderDate) { showToast('กรุณากรอกข้อมูลให้ครบ', 'warning'); return; }

  const items = [];
  $('#po-items-container .item-row').each(function () {
    const productId = $(this).find('.po-product-select').val();
    const name      = $(this).find('.po-product-select option:selected').data('name') || '';
    const qty       = parseFloat($(this).find('.po-qty').val()) || 0;
    const unitPrice = parseFloat($(this).find('.po-unit-price').val()) || 0;
    if (productId && qty > 0) items.push({ product_id: productId, product_name: name, quantity: qty, unit_price_yuan: unitPrice, unit_cost: unitPrice * parseFloat($('#po-exchange-rate').val()) });
  });

  if (!items.length) { showToast('กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ', 'warning'); return; }

  const payload = {
    supplier, order_date: orderDate,
    yuan_amount:   parseFloat($('#po-total-yuan').text().replace('¥', '').replace(/,/g, '')) || 0,
    exchange_rate: parseFloat($('#po-exchange-rate').val()) || 1,
    freight_cost:  0,
    status: 'pending', items, notes: $('#po-notes').val(),
    created_by: App.user.name
  };

  $('#btn-save-po').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>บันทึก...');
  try {
    const res = App.editingId
      ? await API.updateImport({ id: App.editingId, ...payload })
      : await API.addImport(payload);
    if (res.success) {
      showToast(App.editingId ? 'แก้ไขรายการสำเร็จ!' : 'บันทึกรายการสั่งซื้อสำเร็จ!', 'success');
      bootstrap.Modal.getOrCreateInstance('#modalPurchase').hide();
      App.imports = [];
      document.body.dataset.page === 'receive' ? loadReceive() : loadPurchase();
    } else throw new Error(res.message);
  } catch (e) {
    showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger');
  }
  $('#btn-save-po').prop('disabled', false).html('<i class="fas fa-save me-1"></i>บันทึก');
}

function viewImport(id) {
  const rec = App.imports.find(r => r.id === id);
  if (!rec) return;
  const items = Array.isArray(rec.items) ? rec.items : [];
  const costs = rec.import_costs || {};
  const html = `
    <div class="row g-3 mb-3">
      <div class="col-sm-6"><strong>รหัส:</strong> ${rec.id}</div>
      <div class="col-sm-6"><strong>วันที่:</strong> ${Fmt.date(rec.order_date)}</div>
      <div class="col-sm-6"><strong>ซัพพลายเออร์:</strong> ${rec.supplier || '-'}</div>
      <div class="col-sm-6"><strong>สถานะ:</strong> ${Fmt.statusBadge(rec.status)}</div>
    </div>
    <h6 class="fw-bold mb-2">รายการสินค้า</h6>
    <table class="table table-sm mb-3"><thead><tr><th>สินค้า</th><th>จำนวน</th><th>ราคา/ชิ้น (¥)</th></tr></thead>
    <tbody>${items.map(i => `<tr><td>${i.product_name || i.product_id}</td><td>${i.quantity}</td><td>${Fmt.yuan(i.unit_price_yuan || 0)}</td></tr>`).join('')}</tbody></table>
    <div class="cost-summary">
      <div class="cost-row"><span>ราคาสินค้า (¥)</span><span>${Fmt.yuan(rec.yuan_amount)}</span></div>
      <div class="cost-row"><span>อัตราแลกเปลี่ยน</span><span>${rec.exchange_rate} บาท/หยวน</span></div>
      <div class="cost-row"><span>ราคาสินค้า (฿)</span><span>${Fmt.currency(rec.base_cost_thb)}</span></div>
      <div class="cost-row"><span>ค่า Freight</span><span>${Fmt.currency(rec.freight_cost)}</span></div>
      <div class="cost-row"><span>ภาษีนำเข้า</span><span>${Fmt.currency(costs.customs_duty || 0)}</span></div>
      <div class="cost-row"><span>ค่าเคลียร์ริ่ง</span><span>${Fmt.currency(costs.clearance_fee || 0)}</span></div>
      <div class="cost-row"><span>ค่าขนส่ง</span><span>${Fmt.currency(costs.transport_fee || 0)}</span></div>
      <div class="cost-row"><span>ค่าแพคเกจจิ้ง</span><span>${Fmt.currency(costs.warehouse_fee || 0)}</span></div>
      <div class="cost-row"><span>ค่า VAT</span><span>${Fmt.currency(costs.vat || 0)}</span></div>
      <div class="cost-row total"><span>ต้นทุนรวมทั้งหมด</span><span>${Fmt.currency(rec.total_cost)}</span></div>
    </div>
    ${rec.notes ? `<div class="mt-3"><strong>หมายเหตุ:</strong> ${rec.notes}</div>` : ''}`;
  $('#view-import-body').html(html);
  new bootstrap.Modal('#modalViewImport').show();
}

function editImport(id) {
  const rec = App.imports.find(r => r.id === id);
  if (!rec) return;
  openPurchaseModal(rec);
}

async function deleteImportConfirm(id) {
  const rec = App.imports.find(r => r.id === id);
  if (!rec) return;
  confirmAction(`ลบรายการสั่งซื้อ ${id} (${rec.supplier || '-'}) ?\nการลบไม่สามารถกู้คืนได้`, async () => {
    try {
      const res = await API.deleteImport(id);
      if (res.success) {
        showToast('ลบรายการสำเร็จ', 'success');
        App.imports = [];
        document.body.dataset.page === 'receive' ? loadReceive() : loadPurchase();
      } else throw new Error(res.message);
    } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'); }
  });
}

async function markReceived(id) {
  const rec = App.imports.find(r => r.id === id);
  if (!rec) return;
  // Open receive modal
  $('#rc-po-id').val(id);
  $('#rc-po-ref').text(id + ' – ' + rec.supplier);

  // เลือกสาขาที่จะรับเข้า (โกดัง): superadmin เลือกได้ / admin ล็อกที่สาขาตัวเอง
  if (!(App.branches && App.branches.length)) {
    try { const b = await API.getBranches(); if (b.success) App.branches = b.data || []; } catch (_) {}
  }
  const isSuper  = Auth.isSuperAdmin();
  const myBranch = Auth.getBranchId();
  let brOpts = '<option value="">-- เลือกสาขาที่จะรับ --</option>';
  (App.branches || []).forEach(b => {
    if (!isSuper && String(b.id) !== String(myBranch)) return;
    brOpts += `<option value="${b.id}">${b.name || b.id}</option>`;
  });
  $('#rc-branch').html(brOpts);
  $('#rc-branch').val(isSuper ? (rec.branch_id || '') : (myBranch || rec.branch_id || ''));
  $('#rc-branch').prop('disabled', !isSuper && !!myBranch);

  const items = Array.isArray(rec.items) ? rec.items : [];
  // Cost calc
  const baseTHB = (parseFloat(rec.yuan_amount || 0)) * (parseFloat(rec.exchange_rate || 1));
  $('#rc-base-thb').text(Fmt.currency(baseTHB));
  $('#rc-freight').val('0');
  ['customs_duty', 'clearance_fee', 'transport_fee', 'warehouse_fee', 'vat'].forEach(k => $(`#rc-${k}`).val('0'));
  calcReceiveCost();
  new bootstrap.Modal('#modalReceive').show();
}

function calcReceiveCost() {
  const keys = ['customs_duty', 'clearance_fee', 'transport_fee', 'warehouse_fee', 'vat'];
  const base    = parseFloat(($('#rc-base-thb').text() || '0').replace(/[฿,]/g, '')) || 0;
  const freight = parseFloat($('#rc-freight').val()) || 0;
  let addCost = 0;
  keys.forEach(k => { addCost += parseFloat($(`#rc-${k}`).val()) || 0; });
  $('#rc-freight-display').text(Fmt.currency(freight));
  $('#rc-add-cost').text(Fmt.currency(addCost));
  $('#rc-total-cost').text(Fmt.currency(base + freight + addCost));
}
$('#rc-freight, #rc-customs_duty, #rc-clearance_fee, #rc-transport_fee, #rc-warehouse_fee, #rc-vat').on('input', calcReceiveCost);

async function confirmReceived() {
  const id           = $('#rc-po-id').val();
  const branchId     = $('#rc-branch').val();
  if (!branchId) { showToast('กรุณาเลือกสาขาที่จะรับสินค้า', 'warning'); return; }
  const freight_cost = parseFloat($('#rc-freight').val()) || 0;
  const import_costs = {
    customs_duty:   parseFloat($('#rc-customs_duty').val()) || 0,
    clearance_fee:  parseFloat($('#rc-clearance_fee').val()) || 0,
    transport_fee:  parseFloat($('#rc-transport_fee').val()) || 0,
    warehouse_fee:  parseFloat($('#rc-warehouse_fee').val()) || 0,
    vat:            parseFloat($('#rc-vat').val()) || 0
  };
  $('#btn-confirm-receive').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>บันทึก...');
  try {
    const res = await API.updateImportStatus(id, 'received', import_costs, freight_cost, branchId);
    if (res.success) {
      showToast('รับสินค้าและอัพเดทสต็อคสำเร็จ!', 'success');
      bootstrap.Modal.getOrCreateInstance('#modalReceive').hide();
      loadPurchase();
      // Refresh stock
      const sr = await API.getStock();
      if (sr.success) App.stock = sr.data || [];
    } else throw new Error(res.message);
  } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'); }
  $('#btn-confirm-receive').prop('disabled', false).html('<i class="fas fa-check me-1"></i>ยืนยันรับสินค้า');
}

// ============================================================
// SECTION: RECEIVE (รับสินค้า/ต้นทุน) – สั้นๆ เน้น pending POs
// ============================================================
async function loadReceive() {
  try {
    await ensureBranchesLoaded();
    if (!App.imports.length) {
      const res = await API.getImports();
      if (res.success) App.imports = res.data || [];
    }
    const pending = App.imports.filter(r => r.status !== 'received' && r.status !== 'cancelled');
    if (!pending.length) {
      $('#receive-list').html('<div class="text-center text-muted py-5"><i class="fas fa-check-circle fa-3x mb-3 text-success"></i><p>ไม่มีรายการรอรับสินค้า</p></div>');
      return;
    }
    $('#receive-list').html(pending.map(r => {
      const items = Array.isArray(r.items) ? r.items : [];
      return `<div class="panel mb-3">
        <div class="panel-header">
          <div><span class="fw-bold">${r.id}</span> – ${r.supplier || '-'}
            <span class="ms-2">${Fmt.statusBadge(r.status)}</span>
            ${Auth.isSuperAdmin() ? `<span class="badge bg-light text-dark border fw-normal ms-1"><i class="fas fa-store-alt me-1 text-muted"></i>${branchName(r.branch_id)}</span>` : ''}
          </div>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-sm btn-outline-secondary" onclick="viewImport('${r.id}')"><i class="fas fa-eye me-1"></i>รายละเอียด</button>
            <button class="btn btn-sm btn-outline-primary" onclick="editImport('${r.id}')"><i class="fas fa-edit me-1"></i>แก้ไข</button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteImportConfirm('${r.id}')"><i class="fas fa-trash me-1"></i>ลบ</button>
            <button class="btn btn-sm btn-success" onclick="markReceived('${r.id}')"><i class="fas fa-check me-1"></i>${t('btn_receive')}</button>
          </div>
        </div>
        <div class="panel-body">
          <div class="row g-3">
            <div class="col-6 col-sm-3"><small class="text-muted d-block">วันที่สั่งซื้อ</small>${Fmt.date(r.order_date)}</div>
            <div class="col-6 col-sm-3"><small class="text-muted d-block">อัตราแลกเปลี่ยน</small><span class="fw-semibold">${r.exchange_rate}</span> <small class="text-muted">฿/¥</small></div>
            <div class="col-6 col-sm-3"><small class="text-muted d-block">ราคาสินค้า</small>${Fmt.yuan(r.yuan_amount)} <small class="text-muted">(${Fmt.currency(r.base_cost_thb)})</small></div>
            <div class="col-6 col-sm-3"><small class="text-muted d-block">ต้นทุนรวม</small>${Fmt.currency(r.total_cost)}</div>
          </div>
          <div class="mt-3"><small class="text-muted">รายการ:</small> ${items.map(i => `<span class="badge bg-light text-dark border me-1">${i.product_name || i.product_id} ×${i.quantity}</span>`).join('')}</div>
        </div>
      </div>`;
    }).join(''));
  } catch (e) { showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger'); }
}

// ============================================================
// SECTION: STOCK (สต็อคสินค้า)
// ============================================================
// มุมมองหน้า stock: '__all__' = ภาพรวมทุกสาขา (รวมยอดตาม รหัส+ชื่อ) / อื่น ๆ = branch_id เฉพาะสาขา
let stockView = '__all__';

async function loadStock() {
  try {
    const [res] = await Promise.all([API.getStock(), ensureBranchesLoaded()]);
    if (!res.success) throw new Error(res.message);
    App.stock = res.data || [];
    populateStockBranchFilter();
    applyStockView();
  } catch (e) { showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger'); }
}

// เติม dropdown เลือกสาขา (เฉพาะ superadmin — admin/staff เห็นสาขาตัวเองอยู่แล้ว)
function populateStockBranchFilter() {
  if (!Auth.isSuperAdmin()) return;
  let opts = '<option value="__all__">ภาพรวมทุกสาขา (รวมยอด)</option>';
  (App.branches || []).forEach(function (b) {
    opts += `<option value="${b.id}">${b.name || b.id}</option>`;
  });
  $('#stock-branch-filter').html(opts).val(stockView).show();
}

// รวมยอดสต็อกตาม รหัส+ชื่อสินค้า (ใช้ทั้งมุมมองภาพรวมข้ามสาขา และมุมมองรายสาขา)
function aggregateStockByProduct(rows) {
  const map = {};
  (rows || []).forEach(function (s) {
    const key  = `${(s.product_code || '').trim().toLowerCase()}|${(s.product_name || '').trim().toLowerCase()}`;
    const qty  = parseFloat(s.quantity  || 0);
    const cost = parseFloat(s.cost_price || 0);
    const minQ = parseFloat(s.min_stock || 0);
    if (!map[key]) {
      map[key] = {
        _aggregated: true, product_code: s.product_code || '',
        product_name: s.product_name || s.product_id || '', unit: s.unit || '',
        quantity: 0, _value: 0, min_stock: 0, _branches: {}, _pids: {}
      };
    }
    const g = map[key];
    g.quantity  += qty;
    g._value    += qty * cost;
    g.min_stock += minQ;
    if (s.branch_id)  g._branches[s.branch_id]  = true;
    if (s.product_id) g._pids[s.product_id]     = true;
    if (!g.unit && s.unit) g.unit = s.unit;
  });
  return Object.keys(map).map(function (k) {
    const g = map[k];
    g.cost_price = g.quantity > 0 ? g._value / g.quantity : 0;
    const branchIds = Object.keys(g._branches);
    const pids      = Object.keys(g._pids);
    g.branch_count  = branchIds.length;
    // ถ้ารวมมาจากสาขาเดียว/สินค้าเดียว เก็บ id จริงไว้เพื่อแสดงชื่อสาขา + ปุ่มได้ตามปกติ
    g.branch_id   = branchIds.length === 1 ? branchIds[0] : '';
    g.product_id  = pids.length      === 1 ? pids[0]      : '';
    g.product_ids = pids; // ทุก product_id ที่รวมอยู่ (ใช้ดึงประวัตินำเข้ารวมทุก lot/สาขา)
    return g;
  }).sort(function (a, b) { return (a.product_code || '').localeCompare(b.product_code || ''); });
}

// dataset ตามมุมมองที่เลือก (ยังไม่กรองคำค้น)
function stockViewRows() {
  if (stockView === '__all__') {
    return aggregateStockByProduct(App.stock);
  }
  const rows = App.stock.filter(function (s) { return String(s.branch_id || '') === String(stockView); });
  return aggregateStockByProduct(rows);
}

// render ตาราง + stats ตามมุมมอง แล้วค่อยกรองด้วยคำค้น
function applyStockView() {
  const rows = stockViewRows();
  const total = rows.length;
  const low   = rows.filter(s => parseFloat(s.quantity || 0) <= parseFloat(s.min_stock || 0) && parseFloat(s.min_stock || 0) > 0).length;
  const qty   = rows.reduce((sum, s) => sum + parseFloat(s.quantity || 0), 0);
  const value = rows.reduce((sum, s) => sum + parseFloat(s.quantity || 0) * parseFloat(s.cost_price || 0), 0);
  $('#stock-stat-total').text(total);
  $('#stock-stat-low').text(low);
  $('#stock-stat-qty').text(Fmt.number(qty));
  $('#stock-stat-value').text(Fmt.currency(value));

  const q = ($('#stock-search').val() || '').toLowerCase();
  const filtered = q
    ? rows.filter(s => (s.product_name || '').toLowerCase().includes(q) || (s.product_code || '').toLowerCase().includes(q))
    : rows;
  renderStockTable(filtered);
}

function renderStockTable(data) {
  if (!data.length) {
    $('#stock-table-body').html(`<tr><td colspan="${colspanWithBranch(8)}" class="text-center text-muted py-4">ไม่พบข้อมูล</td></tr>`);
    return;
  }
  $('#stock-table-body').html(data.map(s => {
    const qty    = parseFloat(s.quantity || 0);
    const minQty = parseFloat(s.min_stock || 0);
    const val    = qty * parseFloat(s.cost_price || 0);
    const isLow  = minQty > 0 && qty <= minQty;
    const hasPid  = !!s.product_id;          // รวมมาจาก product_id เดียว → ผูกปุ่มสั่งซื้อได้
    const multiBr = (s.branch_count || 0) > 1; // อยู่หลายสาขา → โชว์จำนวนสาขาแทนชื่อ
    const pidList = (s.product_ids || []).join(','); // product_id ทุกตัวของแถวนี้
    const safeName = (s.product_name || '').replace(/'/g, "\\'");
    const orderBtn = (hasPid && isLow)
      ? `<button class="btn btn-sm btn-warning" title="${t('btn_order')}"
           onclick="window.location.href='/dashboard/purchase/?new=1&product=${encodeURIComponent(s.product_id)}'">
           <i class="fas fa-shopping-cart me-1"></i>${t('btn_order')}</button>`
      : '';
    // ปุ่มประวัตินำเข้า — แสดงเสมอ ส่ง product_id ทุกตัวที่รวมอยู่ (กรองตามสาขาที่เลือกอยู่แล้ว)
    const historyBtn = pidList
      ? `<button class="btn btn-sm btn-outline-info me-1" title="${t('btn_import_history')}"
          onclick="openStockImportHistory('${pidList}', '${safeName}')">
          <i class="fas fa-history"></i></button>`
      : '';
    // อยู่หลายสาขา → badge จำนวนสาขา; สาขาเดียว → ชื่อสาขาจริง
    const brCell = multiBr
      ? `<td class="col-branch"><span class="badge bg-light text-dark border fw-normal"><i class="fas fa-store-alt me-1 text-muted"></i>${s.branch_count} สาขา</span></td>`
      : branchCell(s.branch_id);
    const actionCell = (historyBtn || orderBtn)
      ? `<td class="text-end">${historyBtn}${orderBtn}</td>`
      : '<td></td>';
    return `<tr ${isLow ? 'class="table-warning"' : ''}>
      <td><span class="fw-semibold">${s.product_code || '-'}</span></td>
      <td>${s.product_name || s.product_id}</td>
      <td class="text-center fw-bold ${isLow ? 'text-danger' : ''}">${Fmt.number(qty)}</td>
      <td class="text-center">${s.unit || '-'}</td>
      <td class="text-end">${Fmt.currency(s.cost_price)}</td>
      <td class="text-end fw-semibold">${Fmt.currency(val)}</td>
      <td>${isLow ? `<span class="badge bg-danger">${t('status_low_badge')}</span>` : `<span class="badge bg-success">${t('status_normal_badge')}</span>`}</td>
      ${brCell}
      ${actionCell}
    </tr>`;
  }).join(''));
}

function openStockImportHistory(productIds, productName) {
  // productIds = product_id เดียว หรือหลายตัวคั่นด้วย comma
  window.location.href = `/dashboard/stock/imports/?ids=${encodeURIComponent(productIds)}&name=${encodeURIComponent(productName)}`;
}

async function loadStockImportHistory() {
  const params      = new URLSearchParams(window.location.search);
  const productIds  = params.get('ids') || params.get('id') || ''; // รองรับลิงก์เก่า (?id=) ด้วย
  const productName = params.get('name') || productIds;

  if (!productIds) {
    $('#sih-table-body').html(`<tr><td colspan="${colspanWithBranch(8)}" class="text-center text-danger py-5">ไม่พบรหัสสินค้า</td></tr>`);
    return;
  }

  $('#sih-product-title').text(productName);
  document.title = `${t('modal_stock_import_history')}: ${productName}`;

  $('#sih-table-body').html(`<tr><td colspan="${colspanWithBranch(8)}" class="text-center py-5"><div class="spinner-border spinner-border-sm text-primary me-2"></div>กำลังโหลด...</td></tr>`);

  try {
    const idArr = productIds.split(',').map(s => s.trim()).filter(Boolean);
    const idSet = new Set(idArr);

    // ประกอบประวัติฝั่ง client จาก endpoint ที่ deploy อยู่แล้ว (ไม่ต้องพึ่ง getStockImportHistory)
    const [stockRes, impRes, trRes] = await Promise.all([
      API.getStock(),
      API.getImports(),
      Auth.isAdmin() ? API.getTransfers() : Promise.resolve({ success: true, data: [] })
    ]);
    await ensureBranchesLoaded();

    // map product_id → code/name/branch จากสต็อกจริง (รหัสเดียวกันคนละสาขา = คนละ product_id)
    const codeOf = {}, nameOf = {}, branchOf = {};
    ((stockRes && stockRes.success && stockRes.data) || []).forEach(s => {
      const pid = String(s.product_id);
      if (s.product_code && !codeOf[pid])   codeOf[pid]   = String(s.product_code).trim();
      if (s.product_name && !nameOf[pid])   nameOf[pid]   = String(s.product_name).trim();
      if (s.branch_id    && !branchOf[pid]) branchOf[pid] = String(s.branch_id);
    });
    // คีย์จับคู่: ใช้ code ถ้ามี ไม่งั้นใช้ชื่อ (สอดคล้องกับการรวมแถวหน้าสต็อก = code|name)
    const keyOf = (code, name) =>
      String(code || '').trim().toLowerCase() || String(name || '').trim().toLowerCase();

    // คีย์ + สาขาเป้าหมาย จาก product_id ที่ขอมา (= สาขาที่กำลังดู)
    const targetKeys = new Set(), targetBranches = new Set();
    idArr.forEach(pid => {
      const k = keyOf(codeOf[pid], nameOf[pid]); if (k) targetKeys.add(k);
      const b = branchOf[pid];                   if (b) targetBranches.add(b);
    });
    const hasKeys = targetKeys.size > 0, hasBranches = targetBranches.size > 0;

    const data = [];

    // ที่มา 1: การนำเข้า — match ด้วย product_id หรือ (code ตรง + อยู่ในสาขาเป้าหมาย)
    ((impRes && impRes.success && impRes.data) || []).forEach(r => {
      const items = Array.isArray(r.items) ? r.items : [];
      const tQty  = items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
      const freight  = parseFloat(r.freight_cost || 0);
      const addCosts = parseFloat(r.additional_costs || 0);
      const extraPerUnit = (r.status === 'received' && tQty > 0) ? (freight + addCosts) / tQty : 0;
      items.forEach(item => {
        const pid = String(item.product_id);
        const k   = keyOf(codeOf[pid], nameOf[pid] || item.product_name);
        const b   = branchOf[pid] || String(r.branch_id || '');
        const matched = idSet.has(pid) || (hasKeys && k && targetKeys.has(k) && (!hasBranches || targetBranches.has(b)));
        if (!matched) return;
        data.push({
          import_id:  r.id, product_id: pid, order_date: r.order_date, supplier: r.supplier,
          status:     r.status, quantity: parseFloat(item.quantity) || 0,
          unit_cost:  (parseFloat(item.unit_cost || item.cost_price) || 0) + extraPerUnit,
          branch_id:  b, branch_name: branchName(b), source: 'import'
        });
      });
    });

    // ที่มา 2: การโยกของเข้าสาขา — match ด้วย code/ชื่อ + to_branch อยู่ในสาขาเป้าหมาย
    if (hasKeys) ((trRes && trRes.success && trRes.data) || []).forEach(tr => {
      if (String(tr.status || 'completed') === 'cancelled') return;
      const k   = keyOf(tr.product_code, tr.product_name);
      const toB = String(tr.to_branch_id || '');
      if (!k || !targetKeys.has(k)) return;
      if (hasBranches && !targetBranches.has(toB)) return;
      data.push({
        import_id:  tr.id, product_id: String(tr.product_id || ''), order_date: tr.transfer_date,
        supplier:   'โยกจาก ' + (branchName(tr.from_branch_id) || tr.from_branch_id || '-'),
        status:     'transfer', quantity: parseFloat(tr.quantity) || 0,
        unit_cost:  parseFloat(tr.dest_unit_cost) || 0,
        branch_id:  toB, branch_name: branchName(toB), source: 'transfer'
      });
    });

    data.sort((a, b) => new Date(b.order_date || 0) - new Date(a.order_date || 0));

    if (!data.length) {
      $('#sih-stats-row').hide();
      $('#sih-table-body').html(`<tr><td colspan="${colspanWithBranch(8)}" class="text-center text-muted py-5">${t('no_import_history')}</td></tr>`);
      return;
    }

    const totalQty = data.reduce((s, r) => s + r.quantity, 0);
    const totalVal = data.reduce((s, r) => s + r.quantity * r.unit_cost, 0);
    $('#sih-stat-count').text(data.length);
    $('#sih-stat-qty').text(Fmt.number(totalQty));
    $('#sih-stat-val').text(Fmt.currency(totalVal));
    $('#sih-stats-row').show();

    $('#sih-table-body').html(data.map(r => {
      const safeSupplier = (r.supplier || '').replace(/'/g, "\\'");
      const extraBtn = (r.status === 'received' && Auth.isAdmin())
        ? `<button class="btn btn-sm btn-outline-warning" title="${t('btn_add_extra_cost')}"
             onclick="openAddExtraCost('${r.import_id}', '${r.product_id || ''}', ${r.quantity}, '${safeSupplier}', '${r.order_date}')">
             <i class="fas fa-plus me-1"></i>${t('btn_add_extra_cost')}</button>`
        : '';
      const branchTd = `<td class="col-branch"><span class="badge bg-light text-dark border fw-normal"><i class="fas fa-store-alt me-1 text-muted"></i>${r.branch_name || r.branch_id || '-'}</span></td>`;
      return `<tr>
        <td>${Fmt.date(r.order_date)}</td>
        <td>${r.supplier || '-'}</td>
        ${branchTd}
        <td class="text-center fw-bold">${Fmt.number(r.quantity)}</td>
        <td class="text-end">${Fmt.currency(r.unit_cost)}</td>
        <td class="text-end fw-semibold">${Fmt.currency(r.quantity * r.unit_cost)}</td>
        <td>${Fmt.statusBadge(r.status)}</td>
        <td><small class="text-muted">${r.import_id}</small></td>
        <td class="text-end">${extraBtn}</td>
      </tr>`;
    }).join(''));
  } catch (e) {
    showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger');
    $('#sih-table-body').html(`<tr><td colspan="${colspanWithBranch(8)}" class="text-center text-danger py-4"><i class="fas fa-exclamation-circle me-2"></i>${e.message}</td></tr>`);
  }
}

let _ecModalInstance = null;
let _ecProductId = ''; // product_id ของแถวที่กำลังเพิ่มต้นทุนแฝง (หน้าประวัติอาจรวมหลาย product_id)

function openAddExtraCost(importId, productId, qty, supplier, orderDate) {
  _ecProductId = productId || '';
  $('#ec-import-id').val(importId);
  $('#ec-orig-qty').val(qty);
  $('#ec-amount').val('');
  $('#ec-note').val('');
  $('#ec-per-unit').text('-');
  $('#ec-info-text').text(`${supplier || '-'} | ${Fmt.date(orderDate)} | ${t('th_qty')}: ${Fmt.number(qty)} ${t('th_unit')}`);
  _ecModalInstance = _ecModalInstance || new bootstrap.Modal(document.getElementById('modalExtraCost'));
  _ecModalInstance.show();
}

function updateEcPerUnit() {
  const qty    = parseFloat($('#ec-orig-qty').val()) || 0;
  const amount = parseFloat($('#ec-amount').val())   || 0;
  const per    = qty > 0 && amount > 0 ? amount / qty : 0;
  $('#ec-per-unit').text(per > 0 ? Fmt.currency(per) : '-');
}

async function saveExtraCost() {
  // ใช้ product_id ของแถวที่กดเพิ่ม (ไม่ใช่จาก URL เพราะหน้านี้อาจรวมหลาย product_id)
  const productId = _ecProductId || new URLSearchParams(window.location.search).get('id') || '';
  const importId  = $('#ec-import-id').val();
  const amount    = parseFloat($('#ec-amount').val()) || 0;
  const note      = $('#ec-note').val().trim();

  if (!amount || amount <= 0) { showToast(t('lbl_extra_amount') + ' ต้องมากกว่า 0', 'warning'); return; }

  const $btn = $('#btn-ec-save');
  $btn.prop('disabled', true).html('<div class="spinner-border spinner-border-sm me-2"></div>กำลังบันทึก...');

  try {
    const res = await API.addImportExtraCost({ import_id: importId, product_id: productId, amount, note });
    if (!res.success) throw new Error(res.message);
    showToast(res.message || 'บันทึกสำเร็จ', 'success');
    bootstrap.Modal.getInstance(document.getElementById('modalExtraCost')).hide();
    loadStockImportHistory();
  } catch (e) {
    showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger');
  } finally {
    $btn.prop('disabled', false).html(`<i class="fas fa-save me-1"></i>${t('btn_save_cost')}`);
  }
}

// ============================================================
// สินค้าขายดี (Best Sellers) — ใช้ข้อมูลบิลขาย (Withdrawals)
// ============================================================
let _bsMode = 'day';

function _bsYmd(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

async function loadBestSellers() {
  // ตั้งค่าเริ่มต้น = วันนี้ / เดือนนี้ / ปีนี้
  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  $('#bs-date').val(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
  $('#bs-month').val(`${today.getFullYear()}-${pad(today.getMonth() + 1)}`);
  $('#bs-year').val(today.getFullYear());

  // สลับโหมดช่วงเวลา
  $('#bs-mode-group button').on('click', function () {
    _bsMode = $(this).data('mode');
    $('#bs-mode-group button').removeClass('active');
    $(this).addClass('active');
    $('#bs-input-day').toggle(_bsMode === 'day');
    $('#bs-input-month').toggle(_bsMode === 'month');
    $('#bs-input-year').toggle(_bsMode === 'year');
    renderBestSellers();
  });
  $('#bs-date, #bs-month, #bs-year').on('change', renderBestSellers);

  $('#bs-grid').html(`<div class="text-center text-muted py-5 w-100"><div class="spinner-border spinner-border-sm text-primary me-2"></div>กำลังโหลด...</div>`);
  try {
    const [wRes, pRes] = await Promise.all([API.getWithdrawals(), API.getProducts()]);
    App.withdrawals = (wRes && wRes.success) ? (wRes.data || []) : [];
    App.products    = (pRes && pRes.success) ? (pRes.data || []) : [];
  } catch (e) {
    showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger');
  }
  renderBestSellers();
}

function renderBestSellers() {
  // map product_id → code/ชื่อ/ราคาขาย (ไว้รวมสินค้าเดียวกันข้ามสาขาด้วย code|ชื่อ และคิดมูลค่าขาย)
  const pmap = {};
  (App.products || []).forEach(p => {
    pmap[String(p.id)] = { code: String(p.code || '').trim(), name: p.name, selling: parseFloat(p.selling_price || 0) };
  });

  // ตัวกรองช่วงเวลาตามโหมด
  let matchPeriod;
  if (_bsMode === 'day') {
    const v = $('#bs-date').val();
    matchPeriod = d => v && _bsYmd(d) === v;
  } else if (_bsMode === 'month') {
    const v = $('#bs-month').val(); // YYYY-MM
    matchPeriod = d => !!v && _bsYmd(d).slice(0, 7) === v;
  } else {
    const v = parseInt($('#bs-year').val());
    matchPeriod = d => !!v && new Date(d).getFullYear() === v;
  }

  const agg = {};
  let totalQty = 0, totalVal = 0;
  (App.withdrawals || []).forEach(w => {
    if (w.type === 'return') return;                                            // ข้ามรายการคืน
    if (w.status !== 'completed' && w.status !== 'partial_returned') return;    // นับเฉพาะที่จ่ายออกแล้ว
    if (!matchPeriod(w.withdrawal_date || w.created_at)) return;
    (Array.isArray(w.items) ? w.items : []).forEach(it => {
      const qty = parseFloat(it.quantity || 0);
      if (qty <= 0) return;
      const pm   = pmap[String(it.product_id)] || {};
      const code = pm.code || '';
      const name = it.product_name || pm.name || it.product_id;
      const key  = (code ? code.toLowerCase() : '') || String(name).trim().toLowerCase();
      const selling = pm.selling || parseFloat(it.unit_price || 0);
      const value   = selling * qty;
      if (!agg[key]) agg[key] = { name, code, qty: 0, value: 0, orders: 0 };
      agg[key].qty    += qty;
      agg[key].value  += value;
      agg[key].orders += 1;
      totalQty += qty;
      totalVal += value;
    });
  });

  const rows = Object.values(agg).sort((a, b) => b.qty - a.qty || b.value - a.value);

  if (!rows.length) {
    $('#bs-stats').hide();
    $('#bs-grid').html(`<div class="text-center text-muted py-5 w-100"><i class="fas fa-trophy fa-3x mb-3 opacity-25 d-block"></i>${t('bs_no_data')}</div>`);
    return;
  }

  $('#bs-stat-products').text(Fmt.number(rows.length));
  $('#bs-stat-qty').text(Fmt.number(totalQty));
  $('#bs-stat-value').text(Fmt.currency(totalVal));
  $('#bs-stats').show();

  const maxQty = rows[0].qty || 1;
  const medals = ['🥇', '🥈', '🥉'];
  $('#bs-grid').html(rows.map((r, i) => {
    const rank    = i + 1;
    const rankCls = rank <= 3 ? `rank-${rank}` : '';
    const medal   = rank <= 3 ? `<span class="bs-medal">${medals[rank - 1]}</span>` : '';
    const pct     = Math.max(5, Math.round(r.qty / maxQty * 100));
    return `<div class="bs-card ${rankCls}">
      <div class="bs-rank">#${rank}</div>
      <div class="bs-name">${medal}${r.name}</div>
      <div class="bs-code">${r.code || '&nbsp;'}</div>
      <div class="bs-qty">${Fmt.number(r.qty)} <small>${t('bs_unit_sold')}</small></div>
      <div class="bs-bar"><span style="width:${pct}%"></span></div>
      <div class="bs-value"><i class="fas fa-wallet me-1"></i>${Fmt.currency(r.value)}</div>
    </div>`;
  }).join(''));
}

$('#stock-search').on('input', function () { applyStockView(); });

// เปลี่ยนสาขา/มุมมองภาพรวม → re-render ตาราง + stats
$(document).on('change', '#stock-branch-filter', function () {
  stockView = $(this).val();
  applyStockView();
});

// ============================================================
// SECTION: WITHDRAWAL (ขายสินค้า)
// ============================================================
let wdFilter = 'all';
async function loadWithdrawal() {
  try {
    const [res] = await Promise.all([API.getWithdrawals(), ensureBranchesLoaded()]);
    if (!res.success) throw new Error(res.message);
    App.withdrawals = res.data || [];
    renderWithdrawalTable(App.withdrawals);
  } catch (e) { showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger'); }

  // โหลดข้อมูลประกอบสำหรับพิมพ์ใบกำกับภาษี (หัวกระดาษสาขา / ที่อยู่-เลขภาษีลูกค้า / หน่วยสินค้า)
  try {
    const [b, r, p] = await Promise.all([
      (App.branches   && App.branches.length)   ? Promise.resolve(null) : API.getBranches(),
      (App.recipients && App.recipients.length) ? Promise.resolve(null) : API.getRecipients(),
      (App.products   && App.products.length)   ? Promise.resolve(null) : API.getProducts()
    ]);
    if (b && b.success) App.branches   = b.data || [];
    if (r && r.success) App.recipients = r.data || [];
    if (p && p.success) App.products   = p.data || [];
  } catch (_) {}
}

function renderWithdrawalTable(data) {
  const filtered = wdFilter === 'all' ? data : data.filter(r => r.status === wdFilter);
  if (!filtered.length) {
    $('#wd-table-body').html(`<tr><td colspan="${colspanWithBranch(7)}" class="text-center text-muted py-4">ไม่พบข้อมูล</td></tr>`);
    return;
  }
  $('#wd-table-body').html(filtered.map(w => {
    const items = Array.isArray(w.items) ? w.items : [];
    return `<tr>
      <td class="fw-semibold">${w.id}</td>
      <td>${Fmt.date(w.withdrawal_date || w.created_at)}</td>
      <td>${w.recipient_name || '-'}</td>
      <td>${w.department || '-'}</td>
      <td class="text-center">${items.length} รายการ</td>
      <td>${Fmt.statusBadge(w.type === 'return' ? 'return' : w.status)}</td>
      ${branchCell(w.branch_id)}
      <td>
        <button class="btn btn-sm btn-outline-primary me-1" title="ดูรายละเอียด" onclick="viewWithdrawal('${w.id}')"><i class="fas fa-eye"></i></button>
        ${w.status === 'pending' ? `<button class="btn btn-sm btn-outline-success me-1" onclick="changeWdStatus('${w.id}','completed')"><i class="fas fa-check"></i></button>` : ''}
        ${(w.status === 'completed' || w.status === 'partial_returned') ? `<button class="btn btn-sm btn-outline-warning" onclick="openReturnModal('${w.id}')"><i class="fas fa-undo"></i> คืน</button>` : ''}
      </td>
    </tr>`;
  }).join(''));
}

$(document).on('click', '.wd-filter', function () {
  $('.wd-filter').removeClass('active');
  $(this).addClass('active');
  wdFilter = $(this).data('filter');
  renderWithdrawalTable(App.withdrawals);
});

// ============================================================
// SECTION: WITHDRAWAL ITEMS (สรุปการขายรายสินค้า — รายวัน/เดือน/ปี)
// ============================================================
const wdiState = { mode: 'day', branch: '__all__' };

async function loadWithdrawalItems() {
  // ตั้งค่าเริ่มต้นของตัวเลือกวัน/เดือน/ปี (ครั้งแรกที่โหลด)
  const today = new Date();
  const iso   = today.toISOString().slice(0, 10);
  if (!$('#wdi-date').val())  $('#wdi-date').val(iso);
  if (!$('#wdi-month').val()) $('#wdi-month').val(iso.slice(0, 7));
  if (!$('#wdi-year').val())  $('#wdi-year').val(today.getFullYear());

  $('#wdi-table-body').html('<tr><td colspan="7" class="text-center text-muted py-5"><div class="spinner-border spinner-border-sm text-primary me-2"></div>กำลังโหลด...</td></tr>');
  try {
    const [w, p] = await Promise.all([
      API.getWithdrawals(),
      (App.products && App.products.length) ? Promise.resolve(null) : API.getProducts()
    ]);
    if (!w.success) throw new Error(w.message);
    App.withdrawals = w.data || [];
    if (p && p.success) App.products = p.data || [];
    await ensureBranchesLoaded();
  } catch (e) {
    showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger');
    $('#wdi-table-body').html('<tr><td colspan="7" class="text-center text-danger py-4">โหลดข้อมูลไม่สำเร็จ</td></tr>');
    return;
  }
  populateWdiBranchFilter();
  renderWithdrawalItems();
}

// dropdown สาขา (เฉพาะ superadmin — admin/staff เห็นเฉพาะสาขาตัวเองอยู่แล้ว)
function populateWdiBranchFilter() {
  if (!Auth.isSuperAdmin()) return;
  let opts = '<option value="__all__">ทุกสาขา</option>';
  (App.branches || []).forEach(function (b) {
    opts += `<option value="${b.id}">${b.name || b.id}</option>`;
  });
  $('#wdi-branch').html(opts).val(wdiState.branch);
  $('#wdi-branch-wrap').show();
}

// สลับมุมมอง รายวัน/รายเดือน/รายปี
function wdiSetMode(mode) {
  wdiState.mode = mode;
  $('#wdi-mode-group button').removeClass('active');
  $(`#wdi-mode-group button[data-mode="${mode}"]`).addClass('active');
  $('#wdi-pick-day').toggle(mode === 'day');
  $('#wdi-pick-month').toggle(mode === 'month');
  $('#wdi-pick-year').toggle(mode === 'year');
  renderWithdrawalItems();
}

// แยกวันที่ (รองรับ 'YYYY-MM-DD' และ ISO จาก created_at)
function wdiParseYMD(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { y: +m[1], mo: +m[2], d: +m[3] };
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return null;
  return { y: dt.getFullYear(), mo: dt.getMonth() + 1, d: dt.getDate() };
}

// วันที่อยู่ในช่วงที่เลือกหรือไม่
function wdiInPeriod(dateStr) {
  const p = wdiParseYMD(dateStr);
  if (!p) return false;
  if (wdiState.mode === 'day') {
    const sel = wdiParseYMD($('#wdi-date').val());
    return !!sel && p.y === sel.y && p.mo === sel.mo && p.d === sel.d;
  }
  if (wdiState.mode === 'month') {
    const m = String($('#wdi-month').val()).match(/^(\d{4})-(\d{2})/);
    return !!m && p.y === +m[1] && p.mo === +m[2];
  }
  return p.y === (parseInt($('#wdi-year').val(), 10) || 0); // year
}

// ป้ายบอกช่วงที่กำลังดู
function wdiPeriodLabel() {
  if (wdiState.mode === 'day')   return $('#wdi-date').val()  ? `(${Fmt.date($('#wdi-date').val())})` : '';
  if (wdiState.mode === 'month') return $('#wdi-month').val() ? `(เดือน ${$('#wdi-month').val()})` : '';
  return $('#wdi-year').val() ? `(ปี ${$('#wdi-year').val()})` : '';
}

function renderWithdrawalItems() {
  // รวมเฉพาะบิลขายที่ของออกจริง: type=normal + completed/partial_returned
  // (items ของ partial_returned ถูกหักจำนวนที่คืนแล้วใน partialReturn → เป็นยอดออกสุทธิ)
  const branch = Auth.isSuperAdmin() ? ($('#wdi-branch').val() || '__all__') : '__all__';
  wdiState.branch = branch;

  const map = {};
  (App.withdrawals || []).forEach(function (w) {
    if (w.type === 'return') return;
    if (w.status !== 'completed' && w.status !== 'partial_returned') return;
    if (branch !== '__all__' && String(w.branch_id || '') !== String(branch)) return;
    if (!wdiInPeriod(w.withdrawal_date || w.created_at)) return;

    const items = Array.isArray(w.items) ? w.items : [];
    items.forEach(function (it) {
      const prod = (App.products || []).find(function (p) { return String(p.id) === String(it.product_id); });
      const code = prod ? (prod.code || '') : '';
      const unit = prod ? (prod.unit || '') : '';
      const name = it.product_name || (prod ? prod.name : '') || it.product_id || '-';
      const key  = code ? ('c:' + code.toLowerCase()) : ('n:' + String(name).toLowerCase());
      const qty  = parseFloat(it.quantity || 0);
      if (qty <= 0) return;
      if (!map[key]) map[key] = { code: code, name: name, unit: unit, qty: 0, value: 0, count: 0 };
      map[key].qty   += qty;
      map[key].value += qty * (parseFloat(it.unit_price || 0));
      map[key].count += 1;
      if (!map[key].unit && unit) map[key].unit = unit;
    });
  });

  let list = Object.keys(map).map(function (k) { return map[k]; });
  const q = ($('#wdi-search').val() || '').toLowerCase();
  if (q) list = list.filter(function (r) {
    return (r.name || '').toLowerCase().includes(q) || (r.code || '').toLowerCase().includes(q);
  });
  list.sort(function (a, b) { return b.qty - a.qty; });

  // stats
  $('#wdi-stat-items').text(list.length);
  $('#wdi-stat-qty').text(Fmt.number(list.reduce(function (s, r) { return s + r.qty; }, 0)));
  $('#wdi-stat-value').text(Fmt.currency(list.reduce(function (s, r) { return s + r.value; }, 0)));
  $('#wdi-period-label').text(wdiPeriodLabel());

  if (!list.length) {
    $('#wdi-table-body').html('<tr><td colspan="7" class="text-center text-muted py-4">ไม่มีการขายในช่วงที่เลือก</td></tr>');
    return;
  }
  $('#wdi-table-body').html(list.map(function (r, i) {
    return `<tr>
      <td class="text-center text-muted">${i + 1}</td>
      <td><span class="fw-semibold">${r.code || '-'}</span></td>
      <td>${r.name}</td>
      <td class="text-center">${r.unit || '-'}</td>
      <td class="text-end fw-bold text-primary">${Fmt.number(r.qty)}</td>
      <td class="text-center">${r.count}</td>
      <td class="text-end">${Fmt.currency(r.value)}</td>
    </tr>`;
  }).join(''));
}

$(document).on('input', '#wdi-search', function () { renderWithdrawalItems(); });

async function openWithdrawalModal() {
  App.editingId = null;
  $('#wd-form')[0].reset();
  $('#wd-items-container').html('');
  new bootstrap.Modal('#modalWithdrawal').show();

  // ถ้ายังไม่มีข้อมูล (prefetch ยังไม่เสร็จ) → โหลดก่อนสร้าง dropdown
  const needProducts   = !App.products.length;
  const needRecipients = !App.recipients.length;
  const needBranches   = !(App.branches && App.branches.length);
  const needStock      = !(App.stock && App.stock.length);
  if (needProducts || needRecipients || needBranches || needStock) {
    $('#wd-items-container').html(
      '<div class="text-center text-muted py-3"><div class="spinner-border spinner-border-sm text-primary me-2"></div>กำลังโหลดข้อมูล...</div>'
    );
    try {
      const [pr, rr, br, sr] = await Promise.all([
        needProducts   ? API.getProducts()   : Promise.resolve(null),
        needRecipients ? API.getRecipients() : Promise.resolve(null),
        needBranches   ? API.getBranches()   : Promise.resolve(null),
        needStock      ? API.getStock()      : Promise.resolve(null)
      ]);
      if (pr && pr.success) App.products   = pr.data || [];
      if (rr && rr.success) App.recipients = rr.data || [];
      if (br && br.success) App.branches   = br.data || [];
      if (sr && sr.success) App.stock      = sr.data || [];
    } catch (_) {}
    $('#wd-items-container').html('');
  }

  populateWdBranchSelect();
  addWdItem();
  calcWdTotal();
  populateRecipientSelects();
}

// เติม dropdown สาขาในโมดอลขาย — superadmin เลือกได้ทุกสาขา / admin+staff ล็อกที่สาขาตัวเอง
function populateWdBranchSelect() {
  const isSuper  = Auth.isSuperAdmin();
  const myBranch = Auth.getBranchId();
  let opts = '<option value="">-- เลือกสาขา --</option>';
  (App.branches || []).forEach(function (b) {
    if (!isSuper && String(b.id) !== String(myBranch)) return;
    opts += `<option value="${b.id}">${b.name || b.id}</option>`;
  });
  $('#wd-branch').html(opts);
  // admin/staff: ล็อกที่สาขาตัวเอง (เลือกอัตโนมัติ + ปิดการแก้)
  $('#wd-branch').val(isSuper ? '' : (myBranch || ''));
  $('#wd-branch').prop('disabled', !isSuper && !!myBranch);
}

// สินค้าเฉพาะสาขาที่เลือกในโมดอลขาย (กัน superadmin เลือกสินค้าผิดสาขาแล้วตัดสต็อกไม่ตรง lot)
function wdBranchProducts() {
  const bid = $('#wd-branch').val();
  if (!bid) return [];
  return (App.products || []).filter(function (p) { return String(p.branch_id || '') === String(bid); });
}

// เปลี่ยนสาขา → ล้างรายการเดิม (กัน product_id ค้างจากสาขาอื่น) แล้วเริ่มแถวใหม่
function onWdBranchChange() {
  $('#wd-items-container').html('');
  addWdItem();
  calcWdTotal();
}

function addWdItem() {
  const id = Date.now();
  const branchChosen = !!$('#wd-branch').val();
  const prodOpts = wdBranchProducts().map(p =>
    `<option value="${p.id}" data-name="${p.name}" data-unit="${p.unit}" data-cost="${p.cost_price}">${p.name} (${p.code || '-'})</option>`
  ).join('');
  const placeholder = branchChosen ? '-- เลือกสินค้า --' : '-- เลือกสาขาก่อน --';
  const html = `<div class="item-row" id="wdi-${id}">
    <div class="row g-2 align-items-end">
      <div class="col-md-5">
        <label class="form-label small mb-1">สินค้า</label>
        <select class="form-select form-select-sm wd-product-select" onchange="onWdProductChange(this)">
          <option value="">${placeholder}</option>${prodOpts}</select>
      </div>
      <div class="col-md-2">
        <label class="form-label small mb-1">คงเหลือ</label>
        <input type="text" class="form-control form-control-sm wd-avail bg-light" readonly value="-">
      </div>
      <div class="col-md-2">
        <label class="form-label small mb-1">จำนวนขาย</label>
        <input type="number" class="form-control form-control-sm wd-qty" value="1" min="1" oninput="calcWdTotal()">
      </div>
      <div class="col-md-2">
        <label class="form-label small mb-1">ราคา/ชิ้น (฿)</label>
        <input type="number" class="form-control form-control-sm wd-unit-price" value="0" min="0" oninput="calcWdTotal()">
      </div>
      <div class="col-md-1 text-end">
        <button type="button" class="btn btn-sm btn-outline-danger" onclick="$(this).closest('.item-row').remove(); calcWdTotal()">
          <i class="fas fa-trash"></i></button>
      </div>
    </div>
  </div>`;
  $('#wd-items-container').append(html);
}

function onWdProductChange(sel) {
  const opt = $(sel).find('option:selected');
  const pid = $(sel).val();
  const row = $(sel).closest('.item-row');
  const stockItem = App.stock.find(s => s.product_id === pid);
  row.find('.wd-avail').val(stockItem ? `${stockItem.quantity} ${stockItem.unit}` : '-');
  row.find('.wd-unit-price').val(opt.data('cost') || 0);
  calcWdTotal();
}

function calcWdTotal() {
  let total = 0;
  $('#wd-items-container .item-row').each(function () {
    total += (parseFloat($(this).find('.wd-qty').val()) || 0) *
             (parseFloat($(this).find('.wd-unit-price').val()) || 0);
  });
  $('#wd-total-value').text(Fmt.currency(total));
}

$('#wd-recipient').on('change', function () {
  const opt = $(this).find('option:selected');
  $('#wd-department').val(opt.data('dept') || '');
});

async function saveWithdrawal() {
  const recipientId   = $('#wd-recipient').val();
  const recipientOpt  = $('#wd-recipient option:selected');
  const recipientName = recipientOpt.data('name') || recipientOpt.text().split('–')[0].trim();
  const department    = $('#wd-department').val();
  const wdDate        = $('#wd-date').val();
  const type          = $('#wd-type').val();
  const branchId      = $('#wd-branch').val();

  if (!branchId) { showToast('กรุณาเลือกสาขาที่ขายสินค้า', 'warning'); return; }
  if (!recipientId || !wdDate) { showToast('กรุณากรอกข้อมูลให้ครบ', 'warning'); return; }

  const items = [];
  let stockError = false;
  $('#wd-items-container .item-row').each(function () {
    const productId   = $(this).find('.wd-product-select').val();
    const productName = $(this).find('.wd-product-select option:selected').data('name') || '';
    const qty         = parseFloat($(this).find('.wd-qty').val()) || 0;
    const unitPrice   = parseFloat($(this).find('.wd-unit-price').val()) || 0;
    if (!productId || qty <= 0) return;
    if (type === 'normal') {
      const si = App.stock.find(s => s.product_id === productId);
      if (si && qty > parseFloat(si.quantity || 0)) {
        showToast(`สินค้า "${productName}" สต็อคไม่เพียงพอ (มี ${si.quantity})`, 'warning');
        stockError = true; return false;
      }
    }
    items.push({ product_id: productId, product_name: productName, quantity: qty, unit_price: unitPrice });
  });
  if (stockError) return;
  if (!items.length) { showToast('กรุณาเพิ่มรายการสินค้า', 'warning'); return; }

  const payload = {
    recipient_id: recipientId, recipient_name: recipientName, department,
    withdrawal_date: wdDate, type, items, notes: $('#wd-notes').val(),
    status: 'pending', created_by: App.user.name, branch_id: branchId
  };

  $('#btn-save-wd').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>บันทึก...');
  try {
    const res = await API.addWithdrawal(payload);
    if (res.success) {
      showToast('บันทึกบิลขายสำเร็จ!', 'success');
      bootstrap.Modal.getOrCreateInstance('#modalWithdrawal').hide();
      loadWithdrawal();
      const sr = await API.getStock(); if (sr.success) App.stock = sr.data || [];
    } else throw new Error(res.message);
  } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'); }
  $('#btn-save-wd').prop('disabled', false).html('<i class="fas fa-save me-1"></i>บันทึก');
}

async function changeWdStatus(id, status) {
  const label = status === 'completed' ? 'ยืนยันการขายสำเร็จ' : 'ยืนยันคืนสินค้า';
  confirmAction(`${label}? สต็อคจะถูกอัพเดทโดยอัตโนมัติ`, async () => {
    try {
      const res = await API.updateWithdrawalStatus(id, status);
      if (res.success) {
        showToast('อัพเดทสถานะสำเร็จ!', 'success');
        loadWithdrawal();
        const sr = await API.getStock(); if (sr.success) App.stock = sr.data || [];
      } else throw new Error(res.message);
    } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'); }
  });
}

function openReturnModal(id) {
  const w = App.withdrawals.find(r => r.id === id);
  if (!w) return;
  const items = Array.isArray(w.items) ? w.items : [];
  $('#return-wd-id').val(id);
  $('#return-wd-ref').text(`${id} – ${w.recipient_name || '-'} (${w.department || '-'})`);

  const html = items.map((item, idx) => `
    <div class="item-row border rounded p-3 mb-2">
      <div class="row g-2 align-items-center">
        <div class="col-auto pt-1">
          <input class="form-check-input return-item-check" type="checkbox"
            id="ret-chk-${idx}"
            data-product-id="${item.product_id}"
            data-product-name="${(item.product_name || item.product_id).replace(/"/g, '&quot;')}"
            data-max="${item.quantity}" checked>
        </div>
        <div class="col">
          <label class="fw-semibold d-block" for="ret-chk-${idx}">${item.product_name || item.product_id}</label>
          <span class="text-muted small">ขายไปทั้งหมด <strong>${item.quantity}</strong> ${item.unit || 'ชิ้น'}</span>
        </div>
        <div class="col-md-3">
          <label class="form-label small mb-1">จำนวนที่คืน</label>
          <div class="input-group input-group-sm">
            <input type="number" class="form-control return-item-qty"
              id="ret-qty-${idx}" value="${item.quantity}" min="1" max="${item.quantity}" step="1">
            <span class="input-group-text">${item.unit || 'ชิ้น'}</span>
          </div>
        </div>
      </div>
    </div>`).join('');

  $('#return-items-container').html(html || '<p class="text-muted text-center py-3">ไม่มีรายการสินค้า</p>');
  $('#return-items-container').off('change.retChk').on('change.retChk', '.return-item-check', function () {
    const idx = this.id.replace('ret-chk-', '');
    $(`#ret-qty-${idx}`).prop('disabled', !this.checked);
  });
  new bootstrap.Modal('#modalReturn').show();
}

async function submitReturn() {
  const id = $('#return-wd-id').val();
  const returnItems = [];
  let valid = true;

  $('.return-item-check:checked').each(function () {
    if (!valid) return;
    const idx  = this.id.replace('ret-chk-', '');
    const qty  = parseFloat($(`#ret-qty-${idx}`).val()) || 0;
    const max  = parseFloat($(this).data('max')) || 0;
    if (qty <= 0 || qty > max) {
      showToast(`จำนวนที่คืนต้องอยู่ระหว่าง 1 ถึง ${max}`, 'warning');
      valid = false; return;
    }
    returnItems.push({
      product_id:   $(this).data('product-id'),
      product_name: $(this).data('product-name'),
      quantity:     qty
    });
  });

  if (!valid) return;
  if (!returnItems.length) { showToast('กรุณาเลือกรายการที่ต้องการคืนอย่างน้อย 1 รายการ', 'warning'); return; }

  $('#btn-submit-return').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>กำลังบันทึก...');
  try {
    const res = await API.partialReturn({ id, return_items: returnItems });
    if (res.success) {
      showToast('คืนสินค้าสำเร็จ! สต็อคถูกอัพเดทแล้ว', 'success');
      bootstrap.Modal.getOrCreateInstance('#modalReturn').hide();
      loadWithdrawal();
      const sr = await API.getStock(); if (sr.success) App.stock = sr.data || [];
    } else throw new Error(res.message);
  } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'); }
  $('#btn-submit-return').prop('disabled', false).html('<i class="fas fa-undo me-1"></i>ยืนยันคืนสินค้า');
}

function viewWithdrawal(id) {
  const w = App.withdrawals.find(r => r.id === id);
  if (!w) return;
  const items = Array.isArray(w.items) ? w.items : [];
  const html = `
    <div class="row g-3 mb-3">
      <div class="col-sm-6"><strong>รหัส:</strong> ${w.id}</div>
      <div class="col-sm-6"><strong>วันที่:</strong> ${Fmt.date(w.withdrawal_date || w.created_at)}</div>
      <div class="col-sm-6"><strong>ผู้รับ:</strong> ${w.recipient_name || '-'}</div>
      <div class="col-sm-6"><strong>แผนก:</strong> ${w.department || '-'}</div>
      <div class="col-sm-6"><strong>ประเภท:</strong> ${Fmt.statusBadge(w.type)}</div>
      <div class="col-sm-6"><strong>สถานะ:</strong> ${Fmt.statusBadge(w.status)}</div>
    </div>
    <h6 class="fw-bold mb-2">รายการสินค้า</h6>
    <table class="table table-sm">
      <thead><tr><th>สินค้า</th><th class="text-center">จำนวน</th><th class="text-end">ราคา/ชิ้น</th><th class="text-end">รวม</th></tr></thead>
      <tbody>${items.map(i => `<tr>
        <td>${i.product_name || i.product_id}</td>
        <td class="text-center">${i.quantity}</td>
        <td class="text-end">${Fmt.currency(i.unit_price || 0)}</td>
        <td class="text-end fw-semibold">${Fmt.currency((i.quantity || 0) * (i.unit_price || 0))}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3" class="text-end fw-bold">รวมทั้งหมด</td>
      <td class="text-end fw-bold text-primary">${Fmt.currency(w.total_value)}</td></tr></tfoot>
    </table>
    ${w.notes ? `<div><strong>หมายเหตุ:</strong> ${w.notes}</div>` : ''}`;
  $('#view-wd-body').html(html);
  $('#btn-print-receipt').off('click').on('click', () => printReceipt(w));
  new bootstrap.Modal('#modalViewWd').show();
}

// แปลงจำนวนเงินเป็นข้อความภาษาไทย เช่น 1070 → "หนึ่งพันเจ็ดสิบบาทถ้วน"
function bahtText(amount) {
  amount = Math.round((parseFloat(amount) || 0) * 100) / 100;
  const neg = amount < 0; amount = Math.abs(amount);
  const baht = Math.floor(amount);
  const satang = Math.round((amount - baht) * 100);
  const txtNum = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const txtPos = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  // อ่านเลขกลุ่มละ 6 หลัก (1..999999) — "เอ็ด" ใช้เมื่อหลักหน่วยเป็น 1 และกลุ่มมีหลักสูงกว่า
  function readGroup(g) {
    let r = ''; const sig = g.replace(/^0+/, '');
    for (let i = 0; i < g.length; i++) {
      const d = +g[i]; const pos = g.length - i - 1;
      if (d === 0) continue;
      if (pos === 1) { r += (d === 1) ? 'สิบ' : (d === 2) ? 'ยี่สิบ' : txtNum[d] + 'สิบ'; }
      else if (pos === 0 && d === 1 && sig.length > 1) { r += 'เอ็ด'; }
      else { r += txtNum[d] + txtPos[pos]; }
    }
    return r;
  }
  function readInt(n) {
    let s = String(n);
    if (s === '0') return 'ศูนย์';
    const groups = [];
    while (s.length > 0) { groups.unshift(s.slice(-6)); s = s.slice(0, -6); }
    let r = '';
    for (let g = 0; g < groups.length; g++) {
      if (parseInt(groups[g], 10) !== 0) r += readGroup(groups[g]) + 'ล้าน'.repeat(groups.length - 1 - g);
    }
    return r;
  }
  let result = '';
  if (baht > 0) result += readInt(baht) + 'บาท';
  if (satang > 0) result += readInt(satang) + 'สตางค์';
  else result += baht > 0 ? 'ถ้วน' : 'ศูนย์บาทถ้วน';
  return (neg ? 'ลบ' : '') + result;
}

// พิมพ์ใบกำกับภาษี/ใบส่งสินค้า/ใบแจ้งหนี้ — หัวกระดาษดึงจากสาขา (Branches), ราคารวม VAT แล้วแตกออก
function printReceipt(w) {
  const items = Array.isArray(w.items) ? w.items : [];
  const money = (n) => (parseFloat(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // escape สำหรับใส่ใน HTML attribute / ข้อความ — กันค่าจากผู้ใช้ทำ layout เพี้ยนหรือ inject
  const escA = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // ผู้ขาย (หัวกระดาษ) = สาขาที่ออกเอกสาร
  const branch = (App.branches || []).find(b => String(b.id) === String(w.branch_id)) || {};
  const sellerTh   = branch.name || (App.user && App.user.branch_name) || CONFIG.APP_NAME;
  const sellerEn   = branch.name_en || '';
  const sellerAddr = branch.address || '';
  const sellerTel  = branch.phone || '';
  const sellerTax  = branch.tax_id || '';

  // ลูกค้า = ผู้รับสินค้า
  const rcp      = (App.recipients || []).find(r => String(r.id) === String(w.recipient_id)) || {};
  const custName = w.recipient_name || rcp.name || '';
  const custAddr = rcp.address || '';
  const custTax  = rcp.tax_id || '';

  // หน่วยสินค้า — ดึงจาก Products
  const prodById = {};
  (App.products || []).forEach(p => { prodById[String(p.id)] = p; });

  // ราคารวม VAT แล้ว → แตก VAT ออก (7%)  [ค่าตั้งต้น — สคริปต์ใน preview จะคำนวณซ้ำให้ลงตัว]
  const grand        = Math.round((parseFloat(w.total_value) || 0) * 100) / 100; // ยอดสุทธิ (รวม VAT)
  const preVat       = Math.round((grand / 1.07) * 100) / 100;                   // รวมเงิน (ก่อน VAT)
  const vat          = Math.round((grand - preVat) * 100) / 100;                 // VAT 7%
  const deposit      = Math.round((parseFloat(w.deposit) || 0) * 100) / 100;     // เงินมัดจำ (แก้ไขได้)
  const afterDeposit = preVat - deposit;

  // เลขที่เอกสาร + วันที่ — ใช้ค่าที่บันทึกไว้ (w.doc_no) ถ้ามี ไม่งั้นสร้างอัตโนมัติ
  const d = new Date(w.withdrawal_date || w.created_at || Date.now());
  const valid = !isNaN(d.getTime());
  const docNo   = w.doc_no || ('IV' + (valid ? d.getFullYear() : '') + (valid ? String(d.getMonth() + 1).padStart(2, '0') : '') + String(w.id).replace(/\D/g, '').slice(-4));
  const dateStr = valid ? `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}` : '';

  // แถวสินค้า — ช่อง qty/หน่วย/ราคา(ก่อน VAT) เป็น input แก้ไขได้ (เปิด-ปิดด้วยปุ่ม "แก้ไข")
  const minRows = 10;
  let rowsHtml = items.map((it, idx) => {
    const qty     = parseFloat(it.quantity) || 0;
    const unitInc = parseFloat(it.unit_price) || 0;
    const unitEx  = unitInc / 1.07;
    const lineEx  = qty * unitEx;
    const unit    = it.unit || (prodById[String(it.product_id)] && prodById[String(it.product_id)].unit) || '';
    return `<tr class="itemrow" data-pid="${escA(it.product_id || '')}">
      <td class="c"><span class="idx">${idx + 1}</span><button type="button" class="rowdel no-print" onclick="delRow(this)" title="ลบแถว">✕</button></td>
      <td></td>
      <td><span class="pname" data-edit>${escA(it.product_name || it.product_id || '')}</span></td>
      <td class="c"><input class="qty num" type="number" min="0" step="any" value="${qty}" oninput="recompute()" disabled></td>
      <td class="c"><input class="unit" type="text" style="text-align:center" value="${escA(unit)}" disabled></td>
      <td class="r"><input class="price num" type="number" min="0" step="any" value="${unitEx.toFixed(2)}" oninput="recompute()" disabled></td>
      <td class="r"><span class="lineAmt">${money(lineEx)}</span></td>
    </tr>`;
  }).join('');
  for (let i = items.length; i < minRows; i++) {
    rowsHtml += '<tr class="filler"><td class="c">&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
  }

  const win = window.open('', '_blank', 'width=820,height=1000');
  win.document.write(`<!DOCTYPE html><html lang="th"><head>
    <meta charset="UTF-8"><title>ใบกำกับภาษี ${docNo}</title>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box}
      body{font-family:Sarabun,sans-serif;color:#111;margin:0;padding:18px;font-size:13px}
      .sheet{max-width:780px;margin:0 auto}
      .top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
      .seller h1{font-size:20px;font-weight:700;margin:0}
      .seller h2{font-size:17px;font-weight:700;margin:0 0 4px}
      .seller .ln{font-size:11.5px;line-height:1.5;color:#222}
      .badge-box{border:1px solid #e07b1a;border-radius:6px;padding:4px 10px;font-size:12px;white-space:nowrap}
      .doctype{border:2px solid #e07b1a;border-radius:8px;text-align:center;padding:6px;margin:12px auto;max-width:430px;font-weight:700}
      .doctype .en{font-size:11px;font-weight:600;color:#333}
      .cust{display:flex;justify-content:space-between;gap:16px;margin-top:6px;font-size:12.5px}
      .cust .lbl{color:#0a3d91;font-weight:600}
      .cust .val{color:#0a3d91}
      .docno{color:#c0392b;font-weight:700}
      .chk{display:inline-block;width:13px;height:13px;border:1px solid #333;text-align:center;line-height:12px;font-size:11px;margin-right:3px;vertical-align:middle}
      table.items{width:100%;border-collapse:collapse;margin-top:10px}
      table.items th,table.items td{border:1px solid #333;padding:4px 6px;font-size:12px}
      table.items thead th{background:#e07b1a;color:#fff;text-align:center;font-weight:700}
      table.items td.c{text-align:center}table.items td.r{text-align:right}
      table.items tbody td{height:22px}
      .bottom{display:flex;border:1px solid #333;border-top:none}
      .bottom .left{flex:1.35;border-right:1px solid #333;padding:6px 8px}
      .bottom .right{flex:1}
      .words{border:1px solid #333;background:#f1eee9;padding:6px 8px;font-weight:600;min-height:34px}
      .note{font-size:10.5px;color:#333;margin-top:6px;line-height:1.45}
      .totrow{display:flex;justify-content:space-between;border-bottom:1px solid #333;padding:4px 8px}
      .totrow:last-child{border-bottom:none}
      .totrow .k{font-size:11.5px}.totrow .k small{color:#555;font-size:9.5px;display:block}
      .totrow .v{text-align:right;font-weight:600;min-width:90px}
      .grand{background:#e07b1a;color:#fff}.grand .v{font-weight:700}
      .vatcell{display:flex;align-items:center;gap:6px}
      .vatbox{border:1px solid #333;padding:0 6px;font-size:11px}
      .signs{display:flex;justify-content:space-between;gap:30px;margin-top:34px;text-align:center;font-size:12px}
      .signs > div{flex:1}
      .sigln{border-top:1px dotted #333;margin:34px 12px 4px}
      .toolbar{text-align:center;margin-top:16px;display:flex;gap:10px;justify-content:center}
      .toolbar button{padding:8px 18px;font-size:14px;cursor:pointer;border:1px solid #888;border-radius:6px;background:#fff}
      .toolbar button.primary{background:#e07b1a;color:#fff;border-color:#e07b1a}
      /* ช่องแก้ไข: ปกติดูเหมือนข้อความธรรมดา, เข้าโหมดแก้ไขจึงมีกรอบ */
      input,textarea{font-family:inherit;font-size:inherit;color:#111;border:none;background:transparent;padding:0;margin:0;width:100%}
      input:disabled,textarea:disabled{-webkit-text-fill-color:#111;opacity:1;color:#111}
      input.num{text-align:right}
      .depedit{display:none} body.editing .depedit{display:inline-block;width:92px} body.editing #depV{display:none}
      [data-edit]{outline:none}
      .rowdel{display:none;margin-left:5px;cursor:pointer;border:none;background:#fdeaea;color:#c0392b;border-radius:3px;font-size:11px;line-height:1;padding:1px 4px}
      .additembar{display:none;margin-top:6px}
      .additembar button{font-size:12px;padding:4px 10px;cursor:pointer;border:1px dashed #e07b1a;border-radius:5px;background:#fffdf7;color:#b3610f}
      body.editing input:not(:disabled),body.editing textarea:not(:disabled){border:1px solid #e0b07a;border-radius:3px;background:#fffdf7;padding:1px 3px}
      body.editing [data-edit]{outline:1px dashed #e07b1a;outline-offset:2px;min-width:40px;display:inline-block;background:#fffdf7}
      body.editing .rowdel{display:inline-block}
      body.editing .additembar{display:block}
      .edithint{display:none;text-align:center;color:#b3610f;font-size:11.5px;margin-top:6px}
      body.editing .edithint{display:block}
      @media print{
        .no-print{display:none}body{padding:0}@page{size:A4;margin:10mm}
        input,textarea{border:none!important;background:transparent!important;padding:0!important}
        .rowdel,.additembar,.edithint{display:none!important}
        [data-edit]{outline:none!important;background:transparent!important}
      }
    </style></head><body>
    <div class="sheet">
      <div class="top">
        <div class="seller">
          ${sellerEn ? `<h1>${sellerTh}</h1><h2>${sellerEn}</h2>` : `<h1>${sellerTh}</h1>`}
          ${sellerAddr ? `<div class="ln">${sellerAddr}</div>` : ''}
          <div class="ln">${sellerTel ? 'โทร. ' + sellerTel : ''}${sellerTel && sellerTax ? '&nbsp;&nbsp;&nbsp;' : ''}${sellerTax ? 'เลขประจำตัวผู้เสียภาษี ' + sellerTax : ''}</div>
        </div>
        <div class="badge-box">สำหรับบริษัท</div>
      </div>

      <div class="doctype">
        ต้นฉบับใบกำกับภาษี / ใบส่งสินค้า / ใบแจ้งหนี้
        <div class="en">ORIGINAL TAX INVOICE / DELIVERY ORDER / INVOICE</div>
      </div>

      <div class="cust">
        <div style="flex:1.4">
          <div><span class="lbl">นามลูกค้า</span> <span class="val" id="custNameV" data-edit>${escA(custName)}</span></div>
          <div><span class="lbl">ที่อยู่</span> <span class="val" id="custAddrV" data-edit>${escA(custAddr)}</span></div>
          <div><span class="lbl">เลขประจำตัวผู้เสียภาษี</span> <span class="val" id="custTaxV" data-edit>${escA(custTax)}</span>
            &nbsp;&nbsp;<span class="chk">X</span>สำนักงานใหญ่ &nbsp;<span class="chk">&nbsp;</span>สาขาที่</div>
        </div>
        <div style="text-align:right;white-space:nowrap">
          <div>เลขที่ <span class="docno" id="docNoV" data-edit>${escA(docNo)}</span></div>
          <div>วันที่ <span class="docno" id="dateV" data-edit>${dateStr}</span></div>
        </div>
      </div>

      <table class="items">
        <thead><tr>
          <th style="width:6%">ลำดับ</th><th style="width:12%">PO No.</th><th>รายละเอียด</th>
          <th style="width:9%">จำนวน</th><th style="width:9%">หน่วย</th>
          <th style="width:13%">ราคา/หน่วย</th><th style="width:14%">จำนวนเงิน</th>
        </tr></thead>
        <tbody id="itemBody">${rowsHtml}</tbody>
      </table>
      <div class="additembar no-print"><button type="button" onclick="addRow()">＋ เพิ่มแถวสินค้า</button></div>

      <div class="bottom">
        <div class="left">
          <div class="words">ตัวอักษร&nbsp;&nbsp;<span id="wordsV">( ${bahtText(grand)} )</span></div>
          <div class="note">
            หมายเหตุ :<br>
            1. กรณีชำระเงินโดยเช็คกรุณาสั่งจ่ายขีดคร่อมในนาม "${sellerTh}" เท่านั้น<br>
            2. สินค้าตามรายการข้างต้นแม้ได้ส่งมอบให้แก่ผู้ซื้อแล้ว ก็ยังถือเป็นทรัพย์สินของผู้ขายจนกว่าผู้ซื้อได้ชำระเงินครบเรียบร้อยแล้ว<br>
            3. บริษัทฯ ขอสงวนสิทธิ์ในการแก้ไขใบกำกับภาษีภายใน 7 วัน นับจากวันที่ระบุในใบกำกับภาษี (ผิด ตก ยกเว้น E. &amp; O.E.)
          </div>
        </div>
        <div class="right">
          <div class="totrow"><div class="k">รวมเงิน<small>TOTAL AMOUNT</small></div><div class="v" id="preVatV">${money(preVat)}</div></div>
          <div class="totrow"><div class="k">หัก เงินมัดจำ<small>DEPOSIT</small></div>
            <div class="v"><span id="depV">${deposit ? money(deposit) : '-'}</span><input id="depIn" class="num depedit" type="number" min="0" step="any" value="${deposit}" oninput="recompute()"></div></div>
          <div class="totrow"><div class="k">มูลค่าสินค้าหลังหักเงินมัดจำ<small>TOTAL AMOUNT AFTER DEPOSIT</small></div><div class="v" id="afterV">${money(afterDeposit)}</div></div>
          <div class="totrow"><div class="k vatcell">ภาษีมูลค่าเพิ่ม <span class="vatbox">7%</span><small>VAT</small></div><div class="v" id="vatV">${money(vat)}</div></div>
          <div class="totrow grand"><div class="k">ยอดเงินสุทธิ<small>GRAND TOTAL</small></div><div class="v" id="grandV">${money(grand)}</div></div>
        </div>
      </div>

      <div class="signs">
        <div><div class="sigln"></div>ผู้รับสินค้า / ผู้รับวางบิล<br><span style="font-size:10px;color:#666">วันที่ ........./........./.........</span></div>
        <div><div class="sigln"></div>ผู้ส่งสินค้า<br><span style="font-size:10px;color:#666">${w.created_by || ''}</span></div>
        <div><div class="sigln"></div>ผู้มีอำนาจลงนาม<br><span style="font-size:10px;color:#666">${sellerTh}</span></div>
      </div>

      <div class="edithint no-print">โหมดแก้ไข — แก้ช่องที่มีกรอบสีส้มได้ &middot; การแก้รายการสินค้าจะอัพเดทยอดบิล แต่ <b>ไม่</b> ปรับสต็อก</div>
      <div class="toolbar no-print">
        <button id="btnEdit" onclick="toggleEdit()">✏️ แก้ไข</button>
        <button id="btnSave" class="primary" style="display:none" onclick="saveBill()">💾 บันทึก</button>
        <button onclick="window.print()">🖨️ พิมพ์</button>
      </div>
    </div>
    <script>
      var CTX = ${JSON.stringify({ id: w.id, recipient_id: w.recipient_id || '' })};
      var editing = false;
      function money(n){ n = parseFloat(n); if (isNaN(n)) n = 0; return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
      function words(n){ try { return (window.opener && window.opener.bahtText) ? window.opener.bahtText(n) : ''; } catch (e) { return ''; } }
      function setV(id, t){ var el = document.getElementById(id); if (el) el.textContent = t; }
      function getText(id){ var el = document.getElementById(id); return el ? el.innerText.trim() : ''; }
      function recompute(){
        var pre = 0, rows = document.querySelectorAll('tr.itemrow');
        for (var i = 0; i < rows.length; i++) {
          var q = parseFloat(rows[i].querySelector('.qty').value) || 0;
          var p = parseFloat(rows[i].querySelector('.price').value) || 0; // ราคา/หน่วย ก่อน VAT
          var line = Math.round(q * p * 100) / 100;
          rows[i].querySelector('.lineAmt').textContent = money(line);
          pre += line;
        }
        pre = Math.round(pre * 100) / 100;                          // รวมเงิน = ผลรวมแถว (ลงตัวเสมอ)
        var dep = parseFloat(document.getElementById('depIn').value) || 0;
        var grand = Math.round(pre * 1.07 * 100) / 100;             // รวม VAT
        var vat = Math.round((grand - pre) * 100) / 100;
        var after = Math.round((pre - dep) * 100) / 100;
        setV('preVatV', money(pre)); setV('depV', dep ? money(dep) : '-');
        setV('afterV', money(after)); setV('vatV', money(vat)); setV('grandV', money(grand));
        setV('wordsV', '( ' + words(grand) + ' )');
      }
      function renumber(){ var r = document.querySelectorAll('tr.itemrow .idx'); for (var i = 0; i < r.length; i++) r[i].textContent = i + 1; }
      function delRow(btn){ var tr = btn.closest('tr'); if (tr) tr.remove(); renumber(); recompute(); }
      function addRow(){
        var tb = document.getElementById('itemBody');
        var tr = document.createElement('tr');
        tr.className = 'itemrow'; tr.setAttribute('data-pid', '');
        tr.innerHTML = '<td class="c"><span class="idx"></span><button type="button" class="rowdel no-print" onclick="delRow(this)" title="ลบแถว">✕</button></td>'
          + '<td></td>'
          + '<td><span class="pname" data-edit></span></td>'
          + '<td class="c"><input class="qty num" type="number" min="0" step="any" value="0" oninput="recompute()"></td>'
          + '<td class="c"><input class="unit" type="text" style="text-align:center" value=""></td>'
          + '<td class="r"><input class="price num" type="number" min="0" step="any" value="0.00" oninput="recompute()"></td>'
          + '<td class="r"><span class="lineAmt">0.00</span></td>';
        var filler = tb.querySelector('tr.filler');
        if (filler) tb.insertBefore(tr, filler); else tb.appendChild(tr);
        // ให้แถวใหม่อยู่ในสถานะแก้ไขเดียวกับทั้งบิล
        tr.querySelector('.pname').contentEditable = editing ? 'true' : 'false';
        var nins = tr.querySelectorAll('input'); for (var k = 0; k < nins.length; k++) nins[k].disabled = !editing;
        renumber(); recompute();
      }
      function toggleEdit(force){
        editing = (force === undefined) ? !editing : !!force;
        document.body.classList.toggle('editing', editing);
        var ins = document.querySelectorAll('input'); for (var i = 0; i < ins.length; i++) ins[i].disabled = !editing;
        var ed = document.querySelectorAll('[data-edit]'); for (var j = 0; j < ed.length; j++) ed[j].contentEditable = editing ? 'true' : 'false';
        document.getElementById('btnEdit').textContent = editing ? '✓ เสร็จ' : '✏️ แก้ไข';
        document.getElementById('btnSave').style.display = editing ? '' : 'none';
      }
      function parseDate(s){ var p = String(s || '').split('/'); if (p.length !== 3) return ''; var dd = ('0' + p[0]).slice(-2), mm = ('0' + p[1]).slice(-2), yy = p[2]; if (!yy) return ''; return yy + '-' + mm + '-' + dd; }
      function gather(){
        var items = [], rows = document.querySelectorAll('tr.itemrow');
        for (var i = 0; i < rows.length; i++) {
          var name = rows[i].querySelector('.pname').innerText.trim();
          var q = parseFloat(rows[i].querySelector('.qty').value) || 0;
          var unit = rows[i].querySelector('.unit').value.trim();
          var ex = parseFloat(rows[i].querySelector('.price').value) || 0;
          if (!name && q <= 0) continue;
          items.push({ product_id: rows[i].getAttribute('data-pid') || '', product_name: name, unit: unit,
                       quantity: q, unit_price: Math.round(ex * 1.07 * 100) / 100 }); // เก็บราคา/หน่วย แบบรวม VAT
        }
        return { id: CTX.id, recipient_id: CTX.recipient_id,
                 recipient_name: getText('custNameV'), cust_address: getText('custAddrV'), cust_tax: getText('custTaxV'),
                 doc_no: getText('docNoV'), withdrawal_date: parseDate(getText('dateV')),
                 deposit: parseFloat(document.getElementById('depIn').value) || 0, items: items };
      }
      async function saveBill(){
        if (!window.opener || !window.opener.saveEditedInvoice) { alert('ไม่พบหน้าต่างหลัก — กรุณาเปิดใบกำกับภาษีใหม่อีกครั้ง'); return; }
        var btn = document.getElementById('btnSave'); btn.disabled = true; var old = btn.textContent; btn.textContent = '⏳ กำลังบันทึก...';
        try {
          var res = await window.opener.saveEditedInvoice(gather());
          if (res && res.success) { alert('บันทึกบิลสำเร็จ'); toggleEdit(false); }
          else { alert('บันทึกไม่สำเร็จ: ' + ((res && res.message) || 'unknown')); }
        } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
        btn.disabled = false; btn.textContent = old;
      }
      recompute();
    <\/script>
    </body></html>`);
  win.document.close();
}

// บันทึกบิลที่แก้จากหน้าต่าง preview — ถูกเรียกผ่าน window.opener.saveEditedInvoice(payload)
// ต้องเป็น function declaration (global) เพื่อให้ popup เข้าถึงได้ผ่าน window.opener
// payload: { id, recipient_id, recipient_name, cust_address, cust_tax, doc_no, withdrawal_date, deposit, items[] }
async function saveEditedInvoice(payload) {
  try {
    // 1) อัพเดทบิลขาย — recipient_name / วันที่ / เลขที่เอกสาร / เงินมัดจำ / รายการ (total_value คำนวณฝั่ง server)
    const wRes = await API.updateWithdrawal({
      id:              payload.id,
      recipient_name:  payload.recipient_name,
      withdrawal_date: payload.withdrawal_date,
      doc_no:          payload.doc_no,
      deposit:         payload.deposit,
      items:           payload.items
    });
    if (!wRes || !wRes.success) return { success: false, message: (wRes && wRes.message) || 'อัพเดทบิลขายไม่สำเร็จ' };

    // 2) ที่อยู่ / เลขภาษี / ชื่อ ลูกค้า → เก็บที่ระเบียนผู้รับ (เฉพาะเมื่อมี recipient_id)
    //    ไม่ critical — ถ้าสิทธิ์ไม่พอ (staff) บิลก็บันทึกแล้ว จึงห่อด้วย try/catch
    if (payload.recipient_id) {
      try {
        await API.updateRecipient({
          id:      payload.recipient_id,
          name:    payload.recipient_name,
          address: payload.cust_address,
          tax_id:  payload.cust_tax
        });
      } catch (_) {}
    }

    // 3) refresh ข้อมูลในหน้าให้ตรงกับที่บันทึก
    try {
      const [wl, rl] = await Promise.all([API.getWithdrawals(), API.getRecipients()]);
      if (wl && wl.success) {
        App.withdrawals = wl.data || [];
        if (typeof renderWithdrawalTable === 'function') renderWithdrawalTable(App.withdrawals);
      }
      if (rl && rl.success) App.recipients = rl.data || [];
    } catch (_) {}

    if (typeof showToast === 'function') showToast('บันทึกบิลสำเร็จ', 'success');
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// ============================================================
// SECTION: TRANSFER (โยกของข้ามโกดัง/สาขา) — รองรับหลายรายการต่อการโยก 1 ครั้ง
// ============================================================

async function loadTransfer() {
  try {
    const [tf, br, st] = await Promise.all([
      API.getTransfers(),
      (App.branches && App.branches.length) ? Promise.resolve(null) : API.getBranches(),
      (App.stock    && App.stock.length)    ? Promise.resolve(null) : API.getStock()
    ]);
    if (tf && tf.success) App.transfers = tf.data || [];
    if (br && br.success) App.branches  = br.data || [];
    if (st && st.success) App.stock     = st.data || [];
    renderTransferTable(App.transfers);
  } catch (e) {
    showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger');
  }
}

// แปลง branch_id → ชื่อสาขา (ใช้ App.branches ที่โหลดไว้)
function branchName(id) {
  if (!id) return '-';
  const b = (App.branches || []).find(x => String(x.id) === String(id));
  return b ? (b.name || id) : id;
}

// <td> คอลัมน์สาขาสำหรับตาราง (ซ่อนอัตโนมัติด้วย .col-branch ยกเว้น superadmin)
function branchCell(id) {
  return `<td class="col-branch"><span class="badge bg-light text-dark border fw-normal"><i class="fas fa-store-alt me-1 text-muted"></i>${branchName(id)}</span></td>`;
}

// จำนวนคอลัมน์ของ empty-state ให้ครอบคลุมคอลัมน์สาขาเมื่อ superadmin
function colspanWithBranch(base) {
  return Auth.isSuperAdmin() ? base + 1 : base;
}

// โหลดรายชื่อสาขา (เฉพาะ superadmin ที่ต้องใช้ map ชื่อสาขา) — admin/staff ไม่ต้องเรียก API เกิน
async function ensureBranchesLoaded() {
  if (App.branches && App.branches.length) return;
  if (!Auth.isSuperAdmin()) return;
  try { const b = await API.getBranches(); if (b.success) App.branches = b.data || []; } catch (_) {}
}

function tfBranchName(id) { return branchName(id); }

let _tfGroups = {};     // key (batch_id|id) → array ของแถวในใบโยกเดียวกัน
let _tfDetailKey = null; // key ที่กำลังเปิดดูรายละเอียด

function renderTransferTable(data) {
  const rows = data || [];
  if (!rows.length) {
    $('#tf-table-body').html('<tr><td colspan="8" class="text-center text-muted py-5">ยังไม่มีรายการโยกของ</td></tr>');
    return;
  }
  // จัดกลุ่มแถวตาม batch_id (การโยกครั้งเดียว) — ข้อมูลเก่าไม่มี batch_id ใช้ id แทน
  const groups = {};
  const order  = [];
  rows.forEach(r => {
    const key = String(r.batch_id || r.id);
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(r);
  });
  _tfGroups = groups;
  order.sort((a, b) => String(groups[b][0].created_at || '').localeCompare(String(groups[a][0].created_at || '')));

  $('#tf-table-body').html(order.map(key => {
    const g           = groups[key];
    const first       = g[0];
    const isCancelled = String(first.status || 'completed') === 'cancelled';
    const totalValue  = g.reduce((s, r) => s + (parseFloat(r.total_value) || 0), 0);
    const extra       = g.reduce((s, r) => s + (parseFloat(r.transport_cost) || 0) + (parseFloat(r.labor_cost) || 0), 0);
    return `<tr class="${isCancelled ? 'text-muted' : ''}">
      <td>${Fmt.date(first.transfer_date || first.created_at)}</td>
      <td><span class="text-muted">${tfBranchName(first.from_branch_id)}</span> <i class="fas fa-arrow-right mx-1 text-primary"></i> <strong>${tfBranchName(first.to_branch_id)}</strong></td>
      <td class="text-center"><span class="badge bg-light text-dark border">${g.length} รายการ</span></td>
      <td class="text-end fw-semibold">${Fmt.currency(totalValue)}</td>
      <td class="text-end">${Fmt.currency(extra)}</td>
      <td>${first.created_by || '-'}</td>
      <td>${Fmt.statusBadge(isCancelled ? 'cancelled' : 'completed')}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-primary me-1" title="ดูรายละเอียด" onclick="viewTransferDetail('${key}')"><i class="fas fa-eye"></i></button>
        ${isCancelled
          ? `<button class="btn btn-sm btn-outline-secondary" title="ลบรายการ" onclick="cancelTransferConfirm('${key}', true)"><i class="fas fa-trash"></i></button>`
          : `<button class="btn btn-sm btn-outline-danger" title="ยกเลิก + ลบรายการ" onclick="cancelTransferConfirm('${key}', false)"><i class="fas fa-ban"></i></button>`}
      </td>
    </tr>`;
  }).join(''));
}

function viewTransferDetail(key) {
  const g = _tfGroups[key];
  if (!g || !g.length) return;
  _tfDetailKey = key;
  const first       = g[0];
  const isCancelled = String(first.status || 'completed') === 'cancelled';
  const totalValue  = g.reduce((s, r) => s + (parseFloat(r.total_value) || 0), 0);
  const extra       = g.reduce((s, r) => s + (parseFloat(r.transport_cost) || 0) + (parseFloat(r.labor_cost) || 0), 0);

  const itemsHtml = g.map(r => `<tr>
    <td>${r.product_name || r.product_id || '-'}${r.product_code ? ` <span class="text-muted small">(${r.product_code})</span>` : ''}</td>
    <td class="text-center">${Fmt.number(r.quantity)}</td>
    <td class="text-end">${Fmt.currency(r.unit_cost)}</td>
    <td class="text-end">${Fmt.currency(r.dest_unit_cost)}</td>
    <td class="text-end">${Fmt.currency(r.total_value)}</td>
  </tr>`).join('');

  $('#tf-detail-body').html(`
    <div class="row g-2 mb-3">
      <div class="col-md-6"><small class="text-muted d-block">เส้นทาง</small><strong>${tfBranchName(first.from_branch_id)}</strong> <i class="fas fa-arrow-right mx-1 text-primary"></i> <strong>${tfBranchName(first.to_branch_id)}</strong></div>
      <div class="col-md-3"><small class="text-muted d-block">วันที่</small>${Fmt.date(first.transfer_date || first.created_at)}</div>
      <div class="col-md-3"><small class="text-muted d-block">สถานะ</small>${Fmt.statusBadge(isCancelled ? 'cancelled' : 'completed')}</div>
      <div class="col-md-6"><small class="text-muted d-block">โดย</small>${first.created_by || '-'}</div>
      <div class="col-md-6"><small class="text-muted d-block">หมายเหตุ</small>${first.notes || '-'}</div>
    </div>
    <div class="table-responsive">
      <table class="table table-sm">
        <thead><tr><th>สินค้า</th><th class="text-center">จำนวน</th><th class="text-end">ต้นทุน/หน่วย (ต้นทาง)</th><th class="text-end">ต้นทุน/หน่วย (ปลายทาง)</th><th class="text-end">มูลค่า</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot><tr class="fw-bold"><td colspan="4" class="text-end">รวม ${g.length} รายการ (ค่าขนส่ง+แรง ${Fmt.currency(extra)})</td><td class="text-end">${Fmt.currency(totalValue)}</td></tr></tfoot>
      </table>
    </div>`);

  // ปุ่มในโมดอล: ใบที่ยกเลิกแล้ว (ข้อมูลเก่า) = ลบอย่างเดียว, ใบปกติ = ยกเลิก+ลบ
  $('#tf-detail-cancel-btn')
    .data('cancelled', isCancelled)
    .html(isCancelled ? '<i class="fas fa-trash me-1"></i>ลบรายการนี้' : '<i class="fas fa-ban me-1"></i>ยกเลิก + ลบรายการ');
  new bootstrap.Modal('#modalTransferDetail').show();
}

function cancelTransferFromDetail() {
  if (_tfDetailKey) cancelTransferConfirm(_tfDetailKey, $('#tf-detail-cancel-btn').data('cancelled') === true);
}

function cancelTransferConfirm(key, deleteOnly) {
  uiConfirm({
    title:       deleteOnly ? 'ลบรายการโยก' : 'ยกเลิกการโยก',
    message:     deleteOnly
      ? 'ลบรายการโยกนี้ออกจากระบบใช่หรือไม่?'
      : 'ระบบจะ<strong class="text-dark">คืนของกลับสาขาต้นทาง</strong> แล้วลบรายการนี้ออก<br><span class="small">(ต้องมีของคงเหลือพอที่สาขาปลายทาง)</span>',
    okText:      deleteOnly ? 'ลบรายการ' : 'ยืนยันยกเลิก',
    okClass:     'btn-danger',
    icon:        deleteOnly ? 'fa-trash' : 'fa-ban',
    iconClass:   'danger',
    loadingText: deleteOnly ? 'กำลังลบรายการ...' : 'กำลังยกเลิกและคืนของ...',
    onConfirm: async function() {
      const res = await API.cancelTransfer({ batch_id: key });
      if (!res || !res.success) throw new Error((res && res.message) || 'ยกเลิกไม่สำเร็จ');
      return res;
    }
  }).then(function(res) {
    if (!res) return; // ผู้ใช้กดยกเลิก
    showToast(res.message || 'ดำเนินการสำเร็จ', 'success');
    bootstrap.Modal.getOrCreateInstance('#modalTransferDetail').hide();
    API.getStock().then(function(sr) { if (sr && sr.success) App.stock = sr.data || []; }); // สต็อกเปลี่ยน → ดึงใหม่
    loadTransfer();
  });
}

function rebuildTransferToSelect() {
  const from = $('#tf-from').val();
  let opts = '<option value="">-- เลือกสาขาปลายทาง --</option>';
  (App.branches || []).forEach(b => {
    if (String(b.id) === String(from)) return; // ปลายทางต้องไม่ใช่ต้นทาง
    opts += `<option value="${b.id}">${b.name || b.id}</option>`;
  });
  const prev = $('#tf-to').val();
  $('#tf-to').html(opts);
  if (prev && String(prev) !== String(from)) $('#tf-to').val(prev);
}

// product_id ที่ถูกเลือกไว้แล้วในแถวอื่น (ยกเว้น select ที่ส่งมา) — ใช้ตัดออกจากตัวเลือก กันเลือกซ้ำ
function tfSelectedIds(exceptEl) {
  const ids = [];
  $('#tf-items-container .tf-product-select').each(function () {
    if (exceptEl && this === exceptEl) return;
    const v = $(this).val();
    if (v) ids.push(String(v));
  });
  return ids;
}

// สร้าง <option> รายการสินค้าจากสต็อกของสาขาต้นทาง (qty > 0)
// excludeIds = สินค้าที่เลือกในแถวอื่นแล้ว (ตัดออก), keepId = สินค้าที่แถวนี้เลือกอยู่ (คงไว้เสมอ)
function tfProductOptions(fromBranch, excludeIds, keepId) {
  excludeIds = excludeIds || [];
  keepId = String(keepId || '');
  if (!fromBranch) return '<option value="">-- เลือกสาขาต้นทางก่อน --</option>';
  const all = (App.stock || []).filter(s => String(s.branch_id || '') === String(fromBranch) && (parseFloat(s.quantity) || 0) > 0);
  if (!all.length) return '<option value="">-- สาขานี้ไม่มีสินค้าคงเหลือ --</option>';
  const list = all.filter(s => String(s.product_id) === keepId || excludeIds.indexOf(String(s.product_id)) === -1);
  let opts = '<option value="">-- เลือกสินค้า --</option>';
  list.forEach(s => {
    const nm = String(s.product_name || s.product_id || '').replace(/"/g, '&quot;');
    opts += `<option value="${s.product_id}" data-qty="${parseFloat(s.quantity) || 0}" data-unit="${s.unit || ''}" data-name="${nm}" data-cost="${parseFloat(s.cost_price) || 0}">${s.product_name || s.product_id} (คงเหลือ ${Fmt.number(s.quantity)} ${s.unit || ''})</option>`;
  });
  return opts;
}

// สร้างตัวเลือกของทุกแถวใหม่ โดยตัดสินค้าที่เลือกในแถวอื่นออก (คงค่าที่แต่ละแถวเลือกไว้)
function refreshTransferProductSelects() {
  const from = $('#tf-from').val();
  $('#tf-items-container .tf-product-select').each(function () {
    const cur = String($(this).val() || '');
    $(this).html(tfProductOptions(from, tfSelectedIds(this), cur)).val(cur);
  });
}

// เพิ่มแถวสินค้า 1 รายการในโมดอลโยก
function addTransferItem() {
  const rid  = 'tfi-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const from = $('#tf-from').val();
  const html = `<div class="item-row" id="${rid}">
    <div class="row g-2 align-items-end">
      <div class="col-md-6">
        <label class="form-label small mb-1">สินค้า</label>
        <select class="form-select form-select-sm tf-product-select" onchange="onTfItemChange(this)">${tfProductOptions(from)}</select>
      </div>
      <div class="col-md-3">
        <label class="form-label small mb-1">คงเหลือต้นทาง</label>
        <input type="text" class="form-control form-control-sm tf-item-avail bg-light" readonly value="-">
      </div>
      <div class="col-md-2">
        <label class="form-label small mb-1">จำนวนที่ย้าย</label>
        <input type="number" class="form-control form-control-sm tf-item-qty" min="0" step="any" value="0" oninput="calcTransferPreview()">
      </div>
      <div class="col-md-1 text-end">
        <button type="button" class="btn btn-sm btn-outline-danger" title="ลบรายการ" onclick="removeTransferItem('${rid}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  </div>`;
  $('#tf-items-container').append(html);
  refreshTransferProductSelects(); // แถวใหม่ตัดสินค้าที่เลือกไปแล้วออก
}

function removeTransferItem(rid) {
  $('#' + rid).remove();
  if (!$('#tf-items-container .item-row').length) addTransferItem(); // เหลืออย่างน้อย 1 แถว
  refreshTransferProductSelects(); // สินค้าของแถวที่ลบกลับมาเลือกได้
  calcTransferPreview();
}

function onTfItemChange(sel) {
  const $row = $(sel).closest('.item-row');
  const opt  = $(sel).find('option:selected');
  if ($(sel).val()) {
    $row.find('.tf-item-avail').val(`${Fmt.number(opt.data('qty') || 0)} ${opt.data('unit') || ''}`);
  } else {
    $row.find('.tf-item-avail').val('-');
  }
  refreshTransferProductSelects(); // ซ่อนสินค้าที่เพิ่งเลือกจากแถวอื่น / คืนสินค้าที่ยกเลิก
  calcTransferPreview();
}

function openTransferModal() {
  if (!(App.branches && App.branches.length)) {
    showToast('กำลังโหลดข้อมูลสาขา กรุณาลองอีกครั้งใน 1-2 วินาที', 'info');
    loadTransfer();
    return;
  }
  $('#tf-form')[0].reset();
  $('#tf-date').val(new Date().toISOString().split('T')[0]);
  $('#tf-dest-cost').text('฿0.00');

  const isSuper  = Auth.isSuperAdmin();
  const myBranch = Auth.getBranchId();

  // สาขาต้นทาง: superadmin เลือกได้ทุกสาขา / admin ล็อกที่สาขาตัวเอง
  let fromOpts = '<option value="">-- เลือกสาขาต้นทาง --</option>';
  (App.branches || []).forEach(b => {
    if (!isSuper && String(b.id) !== String(myBranch)) return;
    fromOpts += `<option value="${b.id}">${b.name || b.id}</option>`;
  });
  $('#tf-from').html(fromOpts);
  if (!isSuper && myBranch) $('#tf-from').val(myBranch).prop('disabled', true);
  else $('#tf-from').prop('disabled', false);

  rebuildTransferToSelect();
  $('#tf-items-container').empty();
  addTransferItem();               // เริ่มต้น 1 แถว
  calcTransferPreview();

  new bootstrap.Modal('#modalTransfer').show();
}

function onTransferFromChange() {
  rebuildTransferToSelect();
  // เปลี่ยนสาขาต้นทาง → ล้างสินค้าที่เลือกไว้ทุกแถว แล้วสร้างตัวเลือกใหม่
  $('#tf-items-container .tf-product-select').val('');
  $('#tf-items-container .tf-item-avail').val('-');
  refreshTransferProductSelects();
  calcTransferPreview();
}

// รวมทุกแถว → สรุปต้นทุน (โดยประมาณ ใช้ weighted-avg; ค่าจริงคำนวณ FIFO ฝั่ง server)
function calcTransferPreview() {
  const transport = parseFloat($('#tf-transport').val()) || 0;
  const labor     = parseFloat($('#tf-labor').val()) || 0;
  let costSum = 0;
  $('#tf-items-container .item-row').each(function () {
    const $r  = $(this);
    const opt = $r.find('.tf-product-select option:selected');
    if (!$r.find('.tf-product-select').val()) return;
    const qty = parseFloat($r.find('.tf-item-qty').val()) || 0;
    if (qty <= 0) return;
    costSum += qty * (parseFloat(opt.data('cost')) || 0);
  });
  const extra = transport + labor;
  $('#tf-sum-goods').text(Fmt.currency(costSum));
  $('#tf-sum-extra').text(Fmt.currency(extra));
  $('#tf-dest-cost').text(Fmt.currency(costSum + extra));
}

async function saveTransfer() {
  const fromBranch = $('#tf-from').val();
  const toBranch   = $('#tf-to').val();

  if (!fromBranch)                             { showToast('กรุณาเลือกสาขาต้นทาง', 'warning'); return; }
  if (!toBranch)                               { showToast('กรุณาเลือกสาขาปลายทาง', 'warning'); return; }
  if (String(fromBranch) === String(toBranch)) { showToast('สาขาต้นทางและปลายทางต้องไม่เหมือนกัน', 'warning'); return; }

  // เก็บรายการสินค้าจากทุกแถว + validate
  const items = [];
  let valid = true;
  $('#tf-items-container .item-row').each(function () {
    if (!valid) return;
    const $r    = $(this);
    const sel   = $r.find('.tf-product-select');
    const opt   = sel.find('option:selected');
    const pid   = sel.val();
    const qty   = parseFloat($r.find('.tf-item-qty').val()) || 0;
    if (!pid && qty <= 0) return; // แถวว่าง — ข้าม
    if (!pid)            { showToast('กรุณาเลือกสินค้าให้ครบทุกแถว หรือลบแถวที่ว่าง', 'warning'); valid = false; return; }
    const name  = opt.data('name') || '';
    const avail = parseFloat(opt.data('qty')) || 0;
    if (qty <= 0)        { showToast(`กรุณาระบุจำนวนของ "${name}"`, 'warning'); valid = false; return; }
    if (qty > avail)     { showToast(`"${name}": จำนวนเกินสต็อกคงเหลือ (มี ${Fmt.number(avail)})`, 'warning'); valid = false; return; }
    items.push({ product_id: pid, product_name: name, quantity: qty });
  });
  if (!valid) return;
  if (!items.length) { showToast('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ', 'warning'); return; }

  // กันเลือกสินค้าซ้ำกันหลายแถว
  const pids = items.map(i => i.product_id);
  if (new Set(pids).size !== pids.length) { showToast('มีสินค้าซ้ำกันหลายแถว กรุณารวมเป็นแถวเดียว', 'warning'); return; }

  const payload = {
    items,
    from_branch_id: fromBranch,
    to_branch_id:   toBranch,
    transport_cost: parseFloat($('#tf-transport').val()) || 0,
    labor_cost:     parseFloat($('#tf-labor').val()) || 0,
    transfer_date:  $('#tf-date').val(),
    notes:          $('#tf-notes').val(),
    created_by:     App.user ? App.user.name : ''
  };

  $('#btn-save-tf').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>กำลังโยก...');
  try {
    const res = await API.addTransfer(payload);
    if (res.success) {
      showToast(res.message || 'โยกของสำเร็จ!', 'success');
      bootstrap.Modal.getOrCreateInstance('#modalTransfer').hide();
      const sr = await API.getStock(); if (sr.success) App.stock = sr.data || []; // สต็อกเปลี่ยน → ดึงใหม่
      loadTransfer();
    } else throw new Error(res.message);
  } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'); }
  $('#btn-save-tf').prop('disabled', false).html('<i class="fas fa-dolly me-1"></i>ยืนยันโยกของ');
}

// ============================================================
// SECTION: RECIPIENTS (ผู้รับสินค้า)
// ============================================================
async function loadRecipients() {
  try {
    const [res] = await Promise.all([API.getRecipients(), ensureBranchesLoaded()]);
    if (!res.success) throw new Error(res.message);
    App.recipients = res.data || [];
    renderRecipientsTable(App.recipients);
    populateRecipientSelects();
  } catch (e) { showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger'); }
}

function renderRecipientsTable(data) {
  if (!data.length) {
    $('#recipients-table-body').html(`<tr><td colspan="${colspanWithBranch(6)}" class="text-center text-muted py-4">ไม่พบข้อมูล</td></tr>`);
    return;
  }
  $('#recipients-table-body').html(data.map(r => `<tr>
    <td class="fw-semibold">${r.name}</td>
    <td>${r.department || '-'}</td>
    <td>${r.position || '-'}</td>
    <td>${r.phone || '-'}</td>
    <td>${r.email || '-'}</td>
    ${branchCell(r.branch_id)}
    <td>
      <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditRecipient('${r.id}')"><i class="fas fa-edit"></i></button>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteRecipient('${r.id}')"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join(''));
}

function openAddRecipient() {
  App.editingId = null;
  $('#recipient-form')[0].reset();
  $('#modalRecipientLabel').text('เพิ่มผู้รับสินค้า');
  new bootstrap.Modal('#modalRecipient').show();
}

function openEditRecipient(id) {
  const r = App.recipients.find(x => x.id === id);
  if (!r) return;
  App.editingId = id;
  $('#rcp-name').val(r.name);
  $('#rcp-dept').val(r.department);
  $('#rcp-pos').val(r.position);
  $('#rcp-phone').val(r.phone);
  $('#rcp-email').val(r.email);
  $('#rcp-tax-id').val(r.tax_id);
  $('#rcp-address').val(r.address);
  $('#rcp-notes').val(r.notes);
  $('#modalRecipientLabel').text('แก้ไขผู้รับสินค้า');
  new bootstrap.Modal('#modalRecipient').show();
}

async function saveRecipient() {
  const name = $('#rcp-name').val().trim();
  if (!name) { showToast('กรุณากรอกชื่อผู้รับ', 'warning'); return; }
  const data = { name, department: $('#rcp-dept').val(), position: $('#rcp-pos').val(),
    phone: $('#rcp-phone').val(), email: $('#rcp-email').val(), notes: $('#rcp-notes').val(),
    tax_id: $('#rcp-tax-id').val().trim(), address: $('#rcp-address').val().trim() };
  if (App.editingId) data.id = App.editingId;

  $('#btn-save-rcp').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>บันทึก...');
  try {
    const res = App.editingId ? await API.updateRecipient(data) : await API.addRecipient(data);
    if (res.success) {
      showToast(App.editingId ? 'อัพเดทสำเร็จ!' : 'เพิ่มผู้รับสำเร็จ!', 'success');
      bootstrap.Modal.getOrCreateInstance('#modalRecipient').hide();
      loadRecipients();
    } else throw new Error(res.message);
  } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'); }
  $('#btn-save-rcp').prop('disabled', false).html('<i class="fas fa-save me-1"></i>บันทึก');
}

async function deleteRecipient(id) {
  confirmAction('ต้องการลบผู้รับคนนี้?', async () => {
    try {
      const res = await API.updateRecipient({ id, status: 'inactive' });
      if (res.success) { showToast('ลบสำเร็จ', 'success'); loadRecipients(); }
      else throw new Error(res.message);
    } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'); }
  });
}

// ============================================================
// SECTION: REPORTS (รายงาน)
// ============================================================
function initReports() {
  const now = new Date();
  $('#rpt-month').val(now.getMonth() + 1);
  $('#rpt-year').val(now.getFullYear());
  $('#rpt-data').hide();
  $('#rpt-placeholder').show();
}

async function generateReport() {
  const month = $('#rpt-month').val();
  const year  = $('#rpt-year').val();
  if (!month || !year) { showToast('กรุณาเลือกเดือนและปี', 'warning'); return; }

  $('#btn-gen-report').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>กำลังโหลด...');
  try {
    const res = await API.getMonthlyReport(month, year);
    if (!res.success) throw new Error(res.message);
    const d = res.data;
    $('#rpt-placeholder').hide();

    // Summary
    $('#rpt-stat-imports').text(d.imports.length);
    $('#rpt-stat-import-cost').text(Fmt.currency(d.totals.total_import_cost));
    $('#rpt-stat-withdrawals').text(d.withdrawals.length);
    $('#rpt-stat-stock-value').text(Fmt.currency(d.totals.total_stock_value));
    $('#rpt-stat-expenses').text(Fmt.currency(d.totals.total_expenses || 0));

    // Profit calculation
    // สร้าง map product_id → selling_price จาก App.products
    const priceMap = {};
    App.products.forEach(p => { priceMap[p.id] = { selling: parseFloat(p.selling_price || 0), name: p.name }; });

    // รวมยอดกำไรต่อสินค้า
    const profitByProduct = {};
    d.withdrawals.forEach(w => {
      const items = Array.isArray(w.items) ? w.items : [];
      items.forEach(item => {
        const qty      = parseFloat(item.quantity || 0);
        const cost     = parseFloat(item.unit_price || 0);   // ต้นทุนที่บันทึกตอนขาย
        const selling  = (priceMap[item.product_id] || {}).selling || cost;
        const name     = item.product_name || (priceMap[item.product_id] || {}).name || item.product_id;
        const revenue  = selling * qty;
        const cogs     = cost * qty;
        const profit   = revenue - cogs;
        if (!profitByProduct[item.product_id]) {
          profitByProduct[item.product_id] = { name, qty: 0, revenue: 0, cogs: 0, profit: 0, cost, selling };
        }
        profitByProduct[item.product_id].qty     += qty;
        profitByProduct[item.product_id].revenue += revenue;
        profitByProduct[item.product_id].cogs    += cogs;
        profitByProduct[item.product_id].profit  += profit;
      });
    });

    const profitRows = Object.values(profitByProduct);
    const totalRevenue = profitRows.reduce((s, r) => s + r.revenue, 0);
    const totalCOGS    = profitRows.reduce((s, r) => s + r.cogs, 0);
    const totalProfit  = totalRevenue - totalCOGS;
    const margin       = totalRevenue > 0 ? (totalProfit / totalRevenue * 100) : 0;

    $('#rpt-stat-revenue').text(Fmt.currency(totalRevenue));
    $('#rpt-stat-cogs').text(Fmt.currency(totalCOGS));
    const profitColor = totalProfit >= 0 ? 'text-success' : 'text-danger';
    $('#rpt-stat-profit').html(`<span class="${profitColor}">${Fmt.currency(totalProfit)}</span>`);
    $('#rpt-stat-margin').html(`<span class="${profitColor}">${margin.toFixed(1)}%</span>`);

    const totalExpenses = parseFloat(d.totals.total_expenses) || 0;
    const netProfit     = totalProfit - totalExpenses;
    const netColor      = netProfit >= 0 ? 'text-success' : 'text-danger';
    $('#rpt-stat-net-profit').html(`<span class="${netColor}">${Fmt.currency(netProfit)}</span>`);

    // Profit table
    if (profitRows.length) {
      $('#rpt-profit-body').html(profitRows.map(r => {
        const m = r.revenue > 0 ? (r.profit / r.revenue * 100) : 0;
        const cls = r.profit >= 0 ? 'text-success' : 'text-danger';
        return `<tr>
          <td>${r.name}</td>
          <td class="text-center">${Fmt.number(r.qty)}</td>
          <td class="text-end">${Fmt.currency(r.cost)}</td>
          <td class="text-end">${Fmt.currency(r.selling)}</td>
          <td class="text-end">${Fmt.currency(r.revenue)}</td>
          <td class="text-end">${Fmt.currency(r.cogs)}</td>
          <td class="text-end fw-bold ${cls}">${Fmt.currency(r.profit)}</td>
          <td class="text-end ${cls}">${m.toFixed(1)}%</td>
        </tr>`;
      }).join('') + `<tr class="table-light fw-bold">
        <td colspan="4">รวมทั้งหมด</td>
        <td class="text-end">${Fmt.currency(totalRevenue)}</td>
        <td class="text-end">${Fmt.currency(totalCOGS)}</td>
        <td class="text-end ${profitColor}">${Fmt.currency(totalProfit)}</td>
        <td class="text-end ${profitColor}">${margin.toFixed(1)}%</td>
      </tr>`);
    } else {
      $('#rpt-profit-body').html('<tr><td colspan="8" class="text-center text-muted">ไม่มีข้อมูลการขายในเดือนนี้</td></tr>');
    }

    // Import table
    if (d.imports.length) {
      $('#rpt-imports-body').html(d.imports.map(r => `<tr>
        <td>${r.id}</td><td>${Fmt.date(r.order_date)}</td>
        <td>${r.supplier || '-'}</td><td>${Fmt.yuan(r.yuan_amount)}</td>
        <td>${Fmt.currency(r.freight_cost)}</td><td class="fw-semibold">${Fmt.currency(r.total_cost)}</td>
        <td>${Fmt.statusBadge(r.status)}</td></tr>`).join(''));
    } else {
      $('#rpt-imports-body').html('<tr><td colspan="7" class="text-center text-muted">ไม่มีข้อมูล</td></tr>');
    }

    // Withdrawal table
    if (d.withdrawals.length) {
      $('#rpt-wd-body').html(d.withdrawals.map(w => `<tr>
        <td>${w.id}</td><td>${Fmt.date(w.withdrawal_date || w.created_at)}</td>
        <td>${w.recipient_name || '-'}</td><td>${w.department || '-'}</td>
        <td class="fw-semibold">${Fmt.currency(w.total_value)}</td>
        <td>${Fmt.statusBadge(w.status)}</td></tr>`).join(''));
    } else {
      $('#rpt-wd-body').html('<tr><td colspan="6" class="text-center text-muted">ไม่มีข้อมูล</td></tr>');
    }

    // Expenses table in report
    if (d.expenses && d.expenses.length) {
      $('#rpt-expenses-body').html(d.expenses.map(r => `<tr>
        <td>${Fmt.date(r.date)}</td>
        <td><span class="badge bg-secondary">${r.category || '-'}</span></td>
        <td>${r.description || '-'}</td>
        <td class="text-end fw-semibold">${Fmt.currency(r.amount)}</td>
      </tr>`).join('') + `<tr class="table-light fw-bold">
        <td colspan="3">รวมค่าใช้จ่าย</td>
        <td class="text-end">${Fmt.currency(d.totals.total_expenses)}</td>
      </tr>`);
    } else {
      $('#rpt-expenses-body').html('<tr><td colspan="4" class="text-center text-muted">ไม่มีค่าใช้จ่ายในเดือนนี้</td></tr>');
    }

    // Store for export
    App._reportData = d;
    App._reportMeta = { month, year };
    $('#rpt-data').show();
    showToast('โหลดรายงานสำเร็จ!', 'success');
  } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'); }
  $('#btn-gen-report').prop('disabled', false).html('<i class="fas fa-search me-1"></i>สร้างรายงาน');
}

function exportToExcel() {
  if (!App._reportData) { showToast('กรุณาสร้างรายงานก่อน', 'warning'); return; }
  const d = App._reportData;
  const meta = App._reportMeta;
  const monthNames = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  // Create CSV (universal export)
  let csv = `\uFEFF`;  // BOM for Thai encoding
  csv += `รายงานประจำเดือน ${monthNames[meta.month]} ${parseInt(meta.year) + 543}\n\n`;
  csv += `=== รายการสั่งซื้อ ===\n`;
  csv += `รหัส,วันที่,ซัพพลายเออร์,ราคาหยวน,อัตราแลก,ต้นทุนฐาน(฿),ค่า Freight,ต้นทุนเพิ่มเติม,ต้นทุนรวม,สถานะ\n`;
  d.imports.forEach(r => {
    csv += `${r.id},${Fmt.date(r.order_date)},${r.supplier || ''},${r.yuan_amount},${r.exchange_rate},${r.base_cost_thb},${r.freight_cost},${r.additional_costs},${r.total_cost},${statusLabel(r.status)}\n`;
  });
  csv += `\n=== รายการขายสินค้า ===\n`;
  csv += `รหัส,วันที่,ผู้รับ,แผนก,มูลค่ารวม,สถานะ\n`;
  d.withdrawals.forEach(w => {
    csv += `${w.id},${Fmt.date(w.withdrawal_date || w.created_at)},${w.recipient_name || ''},${w.department || ''},${w.total_value},${statusLabel(w.status)}\n`;
  });
  csv += `\n=== ค่าใช้จ่ายรายเดือน ===\n`;
  csv += `วันที่,หมวดหมู่,รายละเอียด,จำนวนเงิน\n`;
  (d.expenses || []).forEach(r => {
    csv += `${Fmt.date(r.date)},${r.category || ''},${r.description || ''},${r.amount}\n`;
  });
  csv += `\n=== สรุป ===\n`;
  csv += `ต้นทุนนำเข้ารวม,${d.totals.total_import_cost}\n`;
  csv += `มูลค่าการขายรวม,${d.totals.total_withdrawal_value}\n`;
  csv += `มูลค่าสต็อคปัจจุบัน,${d.totals.total_stock_value}\n`;
  csv += `รายได้รวม (ราคาขาย),${$('#rpt-stat-revenue').text()}\n`;
  csv += `ต้นทุนสินค้าที่ขาย,${$('#rpt-stat-cogs').text()}\n`;
  csv += `กำไรขั้นต้น,${$('#rpt-stat-profit').text()}\n`;
  csv += `Gross Margin,${$('#rpt-stat-margin').text()}\n`;
  csv += `ค่าใช้จ่ายรายเดือน,${d.totals.total_expenses || 0}\n`;
  csv += `กำไรสุทธิ (หลังหักค่าใช้จ่าย),${$('#rpt-stat-net-profit').text()}\n`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `รายงาน_${monthNames[meta.month]}_${meta.year}.csv`;
  link.click();
  showToast('ส่งออกไฟล์สำเร็จ!', 'success');
}

// ============================================================
// SECTION: EXPENSES (ค่าใช้จ่ายรายเดือน)
// ============================================================
async function loadExpenses() {
  const month = $('#exp-filter-month').val();
  const year  = $('#exp-filter-year').val();
  try {
    const [expRes, catRes] = await Promise.all([
      API.getExpenses(month, year),
      App._expenseCategories ? Promise.resolve({ success: true, data: App._expenseCategories }) : API.getExpenseCategories(),
      ensureBranchesLoaded()
    ]);
    if (!expRes.success) throw new Error(expRes.message);
    App._expenses = expRes.data || [];
    if (catRes.success) {
      App._expenseCategories = catRes.data || [];
      populateExpenseCategorySelect(App._expenseCategories);
    }
    renderExpensesTable(App._expenses);
  } catch (e) { showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger'); }
}

function populateExpenseCategorySelect(categories) {
  const $sel = $('#exp-category');
  const current = $sel.val();
  $sel.html('<option value="">-- เลือกหมวดหมู่ --</option>');
  if (categories.length === 0) {
    $sel.append('<option value="" disabled>ยังไม่มีหมวดหมู่ — เพิ่มใน Sheet "ExpenseCategories"</option>');
  } else {
    categories.forEach(function(name) {
      $sel.append(`<option value="${name}">${name}</option>`);
    });
  }
  if (current) $sel.val(current);
}

function renderExpensesTable(data) {
  if (!data.length) {
    $('#expenses-table-body').html(`<tr><td colspan="${colspanWithBranch(6)}" class="text-center text-muted py-4">ไม่พบรายการค่าใช้จ่ายในเดือนนี้</td></tr>`);
    $('#exp-total').text('฿0.00');
    return;
  }
  const total = data.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  $('#expenses-table-body').html(data.map(r => `<tr>
    <td>${Fmt.date(r.date)}</td>
    <td><span class="badge bg-secondary">${r.category || '-'}</span></td>
    <td>${r.description || '-'}</td>
    <td class="text-end fw-semibold">${Fmt.currency(r.amount)}</td>
    <td class="text-muted small">${r.created_by || '-'}</td>
    ${branchCell(r.branch_id)}
    <td>
      <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditExpense('${r.id}')"><i class="fas fa-edit"></i></button>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteExpenseConfirm('${r.id}')"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join(''));
  $('#exp-total').text(Fmt.currency(total));
}

async function openAddExpenseModal() {
  App.editingId = null;
  $('#modalExpenseLabel').html('<i class="fas fa-receipt me-2"></i>เพิ่มค่าใช้จ่าย');
  $('#expense-form')[0].reset();
  $('#exp-date').val(new Date().toISOString().split('T')[0]);
  new bootstrap.Modal('#modalExpense').show();
  if (!App._expenseCategories) {
    $('#exp-category').html('<option value="">กำลังโหลดหมวดหมู่...</option>');
    const res = await API.getExpenseCategories();
    if (res.success) App._expenseCategories = res.data || [];
  }
  populateExpenseCategorySelect(App._expenseCategories || []);
}

function openEditExpense(id) {
  const r = (App._expenses || []).find(e => e.id === id);
  if (!r) return;
  App.editingId = id;
  $('#modalExpenseLabel').html('<i class="fas fa-edit me-2"></i>แก้ไขค่าใช้จ่าย');
  populateExpenseCategorySelect(App._expenseCategories || []);
  $('#exp-date').val(String(r.date).split('T')[0]);
  $('#exp-category').val(r.category || '');
  $('#exp-description').val(r.description || '');
  $('#exp-amount').val(r.amount || '');
  new bootstrap.Modal('#modalExpense').show();
}

async function saveExpense() {
  const date        = $('#exp-date').val();
  const category    = $('#exp-category').val();
  const description = $('#exp-description').val().trim();
  const amount      = parseFloat($('#exp-amount').val());

  if (!date || !category || isNaN(amount) || amount <= 0) {
    showToast('กรุณากรอกวันที่ หมวดหมู่ และจำนวนเงิน', 'warning'); return;
  }

  const payload = { date, category, description, amount };
  await withBtnLoading('#btn-save-expense',
    '<i class="fas fa-save me-1"></i>บันทึก', async () => {
    const res = App.editingId
      ? await API.updateExpense({ id: App.editingId, ...payload })
      : await API.addExpense(payload);
    if (!res.success) throw new Error(res.message);
    bootstrap.Modal.getInstance('#modalExpense').hide();
    showToast(res.message || 'บันทึกสำเร็จ', 'success');
    loadExpenses();
  }).catch(e => showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'));
}

async function deleteExpenseConfirm(id) {
  if (!confirm('ยืนยันลบรายการค่าใช้จ่ายนี้?')) return;
  try {
    const res = await API.deleteExpense(id);
    if (!res.success) throw new Error(res.message);
    showToast('ลบรายการสำเร็จ', 'success');
    loadExpenses();
  } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'); }
}

// ============================================================
// SECTION: INCOME (รายรับ / เงินกองกลาง)
// ============================================================
async function loadIncome() {
  const month = $('#inc-filter-month').val();
  const year  = $('#inc-filter-year').val();
  try {
    const [incRes, catRes, sumRes] = await Promise.all([
      API.getIncome(month, year),
      App._incomeCategories ? Promise.resolve({ success: true, data: App._incomeCategories }) : API.getIncomeCategories(),
      API.getIncomeSummary(month, year),
      ensureBranchesLoaded()
    ]);
    if (!incRes.success) throw new Error(incRes.message);
    App._income = incRes.data || [];
    if (catRes.success) {
      App._incomeCategories = catRes.data || [];
      populateIncomeCategorySelect(App._incomeCategories);
    }
    renderIncomeTable(App._income);
    if (sumRes.success) renderIncomeSummary(sumRes.data);
  } catch (e) { showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger'); }
}

function renderIncomeSummary(d) {
  const cum = d.cumulative || {}, mon = d.month || {};
  $('#inc-sum-month-income').text(Fmt.currency(mon.income || 0));
  $('#inc-sum-month-expenses').text(Fmt.currency(mon.expenses || 0));
  const remaining = cum.remaining || 0;
  $('#inc-sum-remaining').text(Fmt.currency(remaining));
  const $card = $('#inc-card-remaining');
  $card.removeClass('text-bg-success text-bg-danger');
  $card.addClass(remaining < 0 ? 'text-bg-danger' : 'text-bg-success');
  $('#inc-sum-total-income').text(Fmt.currency(cum.income || 0));
  $('#inc-sum-total-expenses').text(Fmt.currency(cum.expenses || 0));
}

function populateIncomeCategorySelect(categories) {
  const $sel = $('#inc-category');
  const current = $sel.val();
  $sel.html('<option value="">-- เลือกหมวดหมู่ --</option>');
  if (categories.length === 0) {
    $sel.append('<option value="" disabled>ยังไม่มีหมวดหมู่ — เพิ่มใน Sheet "IncomeCategories"</option>');
  } else {
    categories.forEach(function(name) {
      $sel.append(`<option value="${name}">${name}</option>`);
    });
  }
  if (current) $sel.val(current);
}

function renderIncomeTable(data) {
  if (!data.length) {
    $('#income-table-body').html(`<tr><td colspan="${colspanWithBranch(6)}" class="text-center text-muted py-4">ไม่พบรายการรายรับในเดือนนี้</td></tr>`);
    $('#inc-total').text('฿0.00');
    return;
  }
  const total = data.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  $('#income-table-body').html(data.map(r => `<tr>
    <td>${Fmt.date(r.date)}</td>
    <td><span class="badge bg-success">${r.category || '-'}</span></td>
    <td>${r.description || '-'}</td>
    <td class="text-end fw-semibold text-success">${Fmt.currency(r.amount)}</td>
    <td class="text-muted small">${r.created_by || '-'}</td>
    ${branchCell(r.branch_id)}
    <td>
      <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditIncome('${r.id}')"><i class="fas fa-edit"></i></button>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteIncomeConfirm('${r.id}')"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join(''));
  $('#inc-total').text(Fmt.currency(total));
}

async function openAddIncomeModal() {
  App.editingId = null;
  $('#modalIncomeLabel').html('<i class="fas fa-hand-holding-dollar me-2"></i>เพิ่มรายรับ');
  $('#income-form')[0].reset();
  $('#inc-date').val(new Date().toISOString().split('T')[0]);
  new bootstrap.Modal('#modalIncome').show();
  if (!App._incomeCategories) {
    $('#inc-category').html('<option value="">กำลังโหลดหมวดหมู่...</option>');
    const res = await API.getIncomeCategories();
    if (res.success) App._incomeCategories = res.data || [];
  }
  populateIncomeCategorySelect(App._incomeCategories || []);
}

function openEditIncome(id) {
  const r = (App._income || []).find(e => e.id === id);
  if (!r) return;
  App.editingId = id;
  $('#modalIncomeLabel').html('<i class="fas fa-edit me-2"></i>แก้ไขรายรับ');
  populateIncomeCategorySelect(App._incomeCategories || []);
  $('#inc-date').val(String(r.date).split('T')[0]);
  $('#inc-category').val(r.category || '');
  $('#inc-description').val(r.description || '');
  $('#inc-amount').val(r.amount || '');
  new bootstrap.Modal('#modalIncome').show();
}

async function saveIncome() {
  const date        = $('#inc-date').val();
  const category    = $('#inc-category').val();
  const description = $('#inc-description').val().trim();
  const amount      = parseFloat($('#inc-amount').val());

  if (!date || !category || isNaN(amount) || amount <= 0) {
    showToast('กรุณากรอกวันที่ หมวดหมู่ และจำนวนเงิน', 'warning'); return;
  }

  const payload = { date, category, description, amount };
  await withBtnLoading('#btn-save-income',
    '<i class="fas fa-save me-1"></i>บันทึก', async () => {
    const res = App.editingId
      ? await API.updateIncome({ id: App.editingId, ...payload })
      : await API.addIncome(payload);
    if (!res.success) throw new Error(res.message);
    bootstrap.Modal.getInstance('#modalIncome').hide();
    showToast(res.message || 'บันทึกสำเร็จ', 'success');
    loadIncome();
  }).catch(e => showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'));
}

async function deleteIncomeConfirm(id) {
  if (!confirm('ยืนยันลบรายการรายรับนี้?')) return;
  try {
    const res = await API.deleteIncome(id);
    if (!res.success) throw new Error(res.message);
    showToast('ลบรายการสำเร็จ', 'success');
    loadIncome();
  } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'); }
}

// ============================================================
// SECTION: PRODUCTS (จัดการสินค้า)
// ============================================================
async function loadProducts() {
  try {
    const [res] = await Promise.all([API.getProducts(), ensureBranchesLoaded()]);
    if (!res.success) throw new Error(res.message);
    App.products = res.data || [];
    renderProductsTable(App.products);
    populateProductSelects();
  } catch (e) { showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger'); }
}

function renderProductsTable(data) {
  if (!data.length) {
    $('#products-table-body').html(`<tr><td colspan="${colspanWithBranch(8)}" class="text-center text-muted py-4">ไม่พบข้อมูล</td></tr>`);
    return;
  }
  $('#products-table-body').html(data.map(p => `<tr>
    <td class="fw-semibold">${p.code || '-'}</td>
    <td>${p.name}</td>
    <td>${p.category || '-'}</td>
    <td class="text-center">${p.unit}</td>
    <td class="text-end">${Fmt.currency(p.cost_price)}</td>
    <td class="text-end">${Fmt.currency(p.selling_price)}</td>
    <td class="text-center">${p.min_stock}</td>
    ${branchCell(p.branch_id)}
    <td>
      <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditProduct('${p.id}')"><i class="fas fa-edit"></i></button>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteProductConfirm('${p.id}')"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join(''));
}

function openAddProduct() {
  App.editingId = null;
  $('#product-form')[0].reset();
  $('#modalProductLabel').text('เพิ่มสินค้าใหม่');
  new bootstrap.Modal('#modalProduct').show();
}

function openEditProduct(id) {
  const p = App.products.find(x => x.id === id);
  if (!p) return;
  App.editingId = id;
  $('#prod-code').val(p.code); $('#prod-name').val(p.name); $('#prod-cat').val(p.category);
  $('#prod-unit').val(p.unit); $('#prod-cost').val(p.cost_price); $('#prod-sell').val(p.selling_price);
  $('#prod-min').val(p.min_stock); $('#prod-notes').val(p.notes);
  $('#modalProductLabel').text('แก้ไขสินค้า');
  new bootstrap.Modal('#modalProduct').show();
}

async function saveProduct() {
  const name = $('#prod-name').val().trim();
  if (!name) { showToast('กรุณากรอกชื่อสินค้า', 'warning'); return; }
  const data = { name, code: $('#prod-code').val(), category: $('#prod-cat').val(),
    unit: $('#prod-unit').val() || 'ชิ้น', cost_price: $('#prod-cost').val(),
    selling_price: $('#prod-sell').val(), min_stock: $('#prod-min').val(), notes: $('#prod-notes').val() };
  if (App.editingId) data.id = App.editingId;

  $('#btn-save-prod').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>บันทึก...');
  try {
    const res = App.editingId ? await API.updateProduct(data) : await API.addProduct(data);
    if (res.success) {
      showToast(App.editingId ? 'อัพเดทสำเร็จ!' : 'เพิ่มสินค้าสำเร็จ!', 'success');
      bootstrap.Modal.getOrCreateInstance('#modalProduct').hide();
      loadProducts();
    } else throw new Error(res.message);
  } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'); }
  $('#btn-save-prod').prop('disabled', false).text('บันทึก');
}

async function deleteProductConfirm(id) {
  confirmAction('ต้องการลบสินค้านี้?', async () => {
    try {
      const res = await API.deleteProduct(id);
      if (res.success) { showToast('ลบสำเร็จ', 'success'); loadProducts(); }
      else throw new Error(res.message);
    } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'); }
  });
}

// ============================================================
// VERSION POLLER – ตรวจสอบเวอร์ชั่นใหม่ทุก 2 นาที
// เมื่อจะ deploy เวอร์ชั่นใหม่ ให้อัพเดทค่า "v" ใน /version.json
// ============================================================
(function () {
  let _currentVersion = null;
  let _timer = null;

  async function checkForUpdate() {
    try {
      const res = await fetch('/version.json?_=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const v = data && data.v;
      if (!v) return;
      if (_currentVersion === null) { _currentVersion = v; return; }  // เก็บ baseline
      if (v !== _currentVersion) {
        clearInterval(_timer);
        showToast('มีเวอร์ชั่นใหม่ กำลังรีโหลดหน้าเว็บ...', 'info');
        setTimeout(() => window.location.reload(), 3000);
      }
    } catch (_) { /* network error – ข้ามไป */ }
  }

  _timer = setInterval(checkForUpdate, 120_000); // poll ทุก 2 นาที
  checkForUpdate();                               // เก็บ baseline ทันที
})();
