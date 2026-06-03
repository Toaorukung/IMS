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
  currentSection: 'dashboard',
  editingId: null
};

/* ===== INIT ===== */
$(document).ready(async function () {
  const page = document.body.dataset.page || 'home';
  const STAFF_ALLOWED_PAGES = ['withdrawal'];

  // 1. ถ้าไม่มี token เลย → ไป login ทันที (ไม่รอ server)
  if (!Auth.isLoggedIn()) { window.location.replace('/login/'); return; }

  // 2. โหลด user จาก cache เพื่อ render sidebar ทันที (ไม่รอ server)
  const cachedUser = Auth.getUser();
  if (!cachedUser) { window.location.replace('/login/'); return; }

  // ตั้ง role จาก cache เพื่อให้ initLayout ใช้ได้ทันที
  Auth.setCachedRole(cachedUser.role);
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
    if (!check.ok) { window.location.replace('/login/'); return; }
    // อัพเดท user จาก server (เผื่อ role หรือชื่อเปลี่ยน)
    App.user = check.user;
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
    if (!Auth.isAdmin() && !STAFF_ALLOWED_PAGES.includes(page)) {
      window.location.replace('/dashboard/withdrawal/');
    }
  });

  // 5. ตรวจ page permission จาก cache ก่อน (กัน flash ของ content)
  if (!Auth.isAdmin() && !STAFF_ALLOWED_PAGES.includes(page)) {
    window.location.replace('/dashboard/withdrawal/');
    return;
  }

  // Prefetch shared data
  prefetchData();

  // URL param: ?new=1 to auto-open create modal
  const urlParams = new URLSearchParams(window.location.search);

  // Page-specific init
  switch (page) {
    case 'home':       loadDashboard();  break;
    case 'purchase':   loadPurchase();   if (urlParams.get('new') === '1') setTimeout(openPurchaseModal, 600); break;
    case 'receive':    loadReceive();    break;
    case 'stock':      loadStock();      break;
    case 'withdrawal': loadWithdrawal(); if (urlParams.get('new') === '1') setTimeout(openWithdrawalModal, 600); break;
    case 'recipients': loadRecipients(); break;
    case 'report':     initReports();    break;
    case 'products':   loadProducts();   break;
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
    recipients: '/dashboard/recipients/',
    reports:    '/dashboard/report/',
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
      '<div class="col-12 text-center text-muted py-3">' +
      'ยังไม่มีสาขา ' +
      '<button class="btn btn-sm btn-primary ms-2" onclick="openBranchModal()">' +
      '<i class="fas fa-plus me-1"></i>เพิ่มสาขาแรก</button></div>'
    );
    return;
  }
  $('#branch-overview-body').html(branches.map(b => {
    const lowCls = b.low_stock_items > 0 ? 'text-danger fw-bold' : '';
    return `<div class="col-xl-3 col-md-4 col-sm-6">
      <div class="branch-card">
        <div class="branch-card-header">
          <i class="fas fa-store-alt me-2"></i><span class="branch-card-name">${b.name}</span>
          <button class="btn-branch-edit ms-auto" title="แก้ไข"
            onclick="openEditBranch('${b.id}','${(b.name||'').replace(/'/g,"\\'")}','${(b.address||'').replace(/'/g,"\\'")}','${(b.phone||'').replace(/'/g,"\\'")}')">
            <i class="fas fa-edit"></i>
          </button>
        </div>
        <div class="branch-card-body">
          <div class="branch-stat-row">
            <span class="bstat-label"><i class="fas fa-tags me-1"></i>สินค้า</span>
            <span class="bstat-val">${Fmt.number(b.total_products)}</span>
          </div>
          <div class="branch-stat-row">
            <span class="bstat-label"><i class="fas fa-warehouse me-1"></i>มูลค่าสต็อค</span>
            <span class="bstat-val">${Fmt.currency(b.total_stock_value)}</span>
          </div>
          <div class="branch-stat-row">
            <span class="bstat-label"><i class="fas fa-file-export me-1"></i>รอเบิก</span>
            <span class="bstat-val">${Fmt.number(b.pending_withdrawals)}</span>
          </div>
          <div class="branch-stat-row">
            <span class="bstat-label"><i class="fas fa-exclamation-triangle me-1"></i>สต็อคต่ำ</span>
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
  $('#modalBranchLabel').text('เพิ่มสาขา');
  new bootstrap.Modal('#modalBranch').show();
}
function openEditBranch(id, name, address, phone) {
  _editingBranchId = id;
  $('#branch-name').val(name);
  $('#branch-address').val(address);
  $('#branch-phone').val(phone);
  $('#modalBranchLabel').text('แก้ไขสาขา');
  new bootstrap.Modal('#modalBranch').show();
}
async function saveBranch() {
  const name = $('#branch-name').val().trim();
  if (!name) { showToast('กรุณากรอกชื่อสาขา', 'warning'); return; }
  const data = { name, address: $('#branch-address').val().trim(), phone: $('#branch-phone').val().trim() };
  if (_editingBranchId) data.id = _editingBranchId;
  $('#btn-save-branch').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>บันทึก...');
  try {
    const res = _editingBranchId ? await API.updateBranch(data) : await API.addBranch(data);
    if (res.success) {
      showToast(_editingBranchId ? 'อัพเดทสาขาสำเร็จ!' : 'เพิ่มสาขาสำเร็จ!', 'success');
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
    const res = await API.getImports();
    if (!res.success) throw new Error(res.message);
    App.imports = res.data || [];
    renderPurchaseTable(App.imports);
  } catch (e) { showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger'); }
}

function renderPurchaseTable(data) {
  const filtered = purchaseFilter === 'all' ? data : data.filter(r => r.status === purchaseFilter);
  if (!filtered.length) {
    $('#purchase-table-body').html('<tr><td colspan="8" class="text-center text-muted py-4">ไม่พบข้อมูล</td></tr>');
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

function openPurchaseModal() {
  App.editingId = null;
  $('#po-form')[0].reset();
  $('#po-exchange-rate').val(CONFIG.EXCHANGE_RATE_DEFAULT);
  $('#rate-hint').html('<i class="fas fa-circle-notch fa-spin me-1"></i>กำลังโหลดอัตราปัจจุบัน...');
  $('#po-items-container').html('');
  addPoItem();
  calcPoTotal();
  $('#modalPurchaseLabel').text('สร้างรายการสั่งซื้อใหม่');
  new bootstrap.Modal('#modalPurchase').show();
  fetchLiveRate();
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
    `<option value="${p.id}" data-name="${p.name}" data-unit="${p.unit}">${p.name}</option>`).join('');
  const html = `<div class="item-row" id="poi-${id}">
    <div class="row g-2 align-items-end">
      <div class="col-md-5">
        <label class="form-label small mb-1">สินค้า</label>
        <select class="form-select form-select-sm po-product-select" onchange="calcPoTotal()">
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

function calcPoTotal() {
  let totalYuan = 0;
  $('#po-items-container .item-row').each(function () {
    const qty   = parseFloat($(this).find('.po-qty').val()) || 0;
    const price = parseFloat($(this).find('.po-unit-price').val()) || 0;
    const sub   = qty * price;
    $(this).find('.po-subtotal').val(sub.toFixed(2));
    totalYuan += sub;
  });
  const rate     = parseFloat($('#po-exchange-rate').val()) || 1;
  const freight  = parseFloat($('#po-freight').val()) || 0;
  const baseTHB  = totalYuan * rate;
  $('#po-total-yuan').text(Fmt.yuan(totalYuan));
  $('#po-base-thb').text(Fmt.currency(baseTHB));
  $('#po-total-thb').text(Fmt.currency(baseTHB + freight));
}

$('#po-exchange-rate, #po-freight').on('input', calcPoTotal);

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
    freight_cost:  parseFloat($('#po-freight').val()) || 0,
    status: 'pending', items, notes: $('#po-notes').val(),
    created_by: App.user.name
  };

  $('#btn-save-po').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>บันทึก...');
  try {
    const res = await API.addImport(payload);
    if (res.success) {
      showToast('บันทึกรายการสั่งซื้อสำเร็จ!', 'success');
      bootstrap.Modal.getOrCreateInstance('#modalPurchase').hide();
      loadPurchase();
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
      <div class="cost-row"><span>ค่าโกดัง</span><span>${Fmt.currency(costs.warehouse_fee || 0)}</span></div>
      <div class="cost-row"><span>ค่า VAT</span><span>${Fmt.currency(costs.vat || 0)}</span></div>
      <div class="cost-row total"><span>ต้นทุนรวมทั้งหมด</span><span>${Fmt.currency(rec.total_cost)}</span></div>
    </div>
    ${rec.notes ? `<div class="mt-3"><strong>หมายเหตุ:</strong> ${rec.notes}</div>` : ''}`;
  $('#view-import-body').html(html);
  new bootstrap.Modal('#modalViewImport').show();
}

async function markReceived(id) {
  const rec = App.imports.find(r => r.id === id);
  if (!rec) return;
  // Open receive modal
  $('#rc-po-id').val(id);
  $('#rc-po-ref').text(id + ' – ' + rec.supplier);
  const items = Array.isArray(rec.items) ? rec.items : [];
  // Cost calc
  const baseTHB = (parseFloat(rec.yuan_amount || 0)) * (parseFloat(rec.exchange_rate || 1));
  const freight = parseFloat(rec.freight_cost || 0);
  $('#rc-base-thb').text(Fmt.currency(baseTHB + freight));
  ['customs_duty', 'clearance_fee', 'transport_fee', 'warehouse_fee', 'vat'].forEach(k => $(`#rc-${k}`).val('0'));
  calcReceiveCost();
  new bootstrap.Modal('#modalReceive').show();
}

function calcReceiveCost() {
  const keys = ['customs_duty', 'clearance_fee', 'transport_fee', 'warehouse_fee', 'vat'];
  const base = parseFloat(($('#rc-base-thb').text() || '0').replace(/[฿,]/g, '')) || 0;
  let addCost = 0;
  keys.forEach(k => { addCost += parseFloat($(`#rc-${k}`).val()) || 0; });
  $('#rc-add-cost').text(Fmt.currency(addCost));
  $('#rc-total-cost').text(Fmt.currency(base + addCost));
}
$('#rc-customs_duty, #rc-clearance_fee, #rc-transport_fee, #rc-warehouse_fee, #rc-vat').on('input', calcReceiveCost);

async function confirmReceived() {
  const id = $('#rc-po-id').val();
  const import_costs = {
    customs_duty:   parseFloat($('#rc-customs_duty').val()) || 0,
    clearance_fee:  parseFloat($('#rc-clearance_fee').val()) || 0,
    transport_fee:  parseFloat($('#rc-transport_fee').val()) || 0,
    warehouse_fee:  parseFloat($('#rc-warehouse_fee').val()) || 0,
    vat:            parseFloat($('#rc-vat').val()) || 0
  };
  $('#btn-confirm-receive').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>บันทึก...');
  try {
    const res = await API.updateImportStatus(id, 'received', import_costs);
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
    if (!App.imports.length) {
      const res = await API.getImports();
      if (res.success) App.imports = res.data || [];
    }
    const pending = App.imports.filter(r => r.status !== 'received');
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
          </div>
          <button class="btn btn-sm btn-success" onclick="markReceived('${r.id}')"><i class="fas fa-check me-1"></i>${t('btn_receive')}</button>
        </div>
        <div class="panel-body">
          <div class="row g-3">
            <div class="col-sm-4"><small class="text-muted d-block">วันที่สั่งซื้อ</small>${Fmt.date(r.order_date)}</div>
            <div class="col-sm-4"><small class="text-muted d-block">ราคาสินค้า</small>${Fmt.yuan(r.yuan_amount)} (${Fmt.currency(r.base_cost_thb)})</div>
            <div class="col-sm-4"><small class="text-muted d-block">ต้นทุนรวม</small>${Fmt.currency(r.total_cost)}</div>
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
async function loadStock() {
  try {
    const res = await API.getStock();
    if (!res.success) throw new Error(res.message);
    App.stock = res.data || [];
    renderStockTable(App.stock);
    // Stats
    const total = App.stock.length;
    const low   = App.stock.filter(s => parseFloat(s.quantity || 0) <= parseFloat(s.min_stock || 0) && parseFloat(s.min_stock || 0) > 0).length;
    const value = App.stock.reduce((sum, s) => sum + parseFloat(s.quantity || 0) * parseFloat(s.cost_price || 0), 0);
    $('#stock-stat-total').text(total);
    $('#stock-stat-low').text(low);
    $('#stock-stat-value').text(Fmt.currency(value));
  } catch (e) { showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger'); }
}

function renderStockTable(data) {
  if (!data.length) {
    $('#stock-table-body').html('<tr><td colspan="8" class="text-center text-muted py-4">ไม่พบข้อมูล</td></tr>');
    return;
  }
  $('#stock-table-body').html(data.map(s => {
    const qty    = parseFloat(s.quantity || 0);
    const minQty = parseFloat(s.min_stock || 0);
    const val    = qty * parseFloat(s.cost_price || 0);
    const isLow  = minQty > 0 && qty <= minQty;
    const orderBtn = isLow
      ? `<button class="btn btn-sm btn-warning" title="${t('btn_order')}"
           onclick="window.location.href='/dashboard/purchase/?new=1&product=${encodeURIComponent(s.product_id)}'">
           <i class="fas fa-shopping-cart me-1"></i>${t('btn_order')}</button>`
      : '';
    return `<tr ${isLow ? 'class="table-warning"' : ''}>
      <td><span class="fw-semibold">${s.product_code || '-'}</span></td>
      <td>${s.product_name || s.product_id}</td>
      <td class="text-center fw-bold ${isLow ? 'text-danger' : ''}">${Fmt.number(qty)}</td>
      <td class="text-center">${s.unit || '-'}</td>
      <td class="text-end">${Fmt.currency(s.cost_price)}</td>
      <td class="text-end fw-semibold">${Fmt.currency(val)}</td>
      <td>${isLow ? `<span class="badge bg-danger">${t('status_low_badge')}</span>` : `<span class="badge bg-success">${t('status_normal_badge')}</span>`}</td>
      <td>${orderBtn}</td>
    </tr>`;
  }).join(''));
}

$('#stock-search').on('input', function () {
  const q = $(this).val().toLowerCase();
  const filtered = App.stock.filter(s =>
    (s.product_name || '').toLowerCase().includes(q) ||
    (s.product_code || '').toLowerCase().includes(q)
  );
  renderStockTable(filtered);
});

// ============================================================
// SECTION: WITHDRAWAL (เบิกสินค้า)
// ============================================================
let wdFilter = 'all';
async function loadWithdrawal() {
  try {
    const res = await API.getWithdrawals();
    if (!res.success) throw new Error(res.message);
    App.withdrawals = res.data || [];
    renderWithdrawalTable(App.withdrawals);
  } catch (e) { showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger'); }
}

function renderWithdrawalTable(data) {
  const filtered = wdFilter === 'all' ? data : data.filter(r => r.status === wdFilter);
  if (!filtered.length) {
    $('#wd-table-body').html('<tr><td colspan="7" class="text-center text-muted py-4">ไม่พบข้อมูล</td></tr>');
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

function openWithdrawalModal() {
  App.editingId = null;
  $('#wd-form')[0].reset();
  $('#wd-items-container').html('');
  addWdItem();
  calcWdTotal();
  // Refresh recipients
  populateRecipientSelects();
  new bootstrap.Modal('#modalWithdrawal').show();
}

function addWdItem() {
  const id = Date.now();
  const prodOpts = App.products.map(p =>
    `<option value="${p.id}" data-name="${p.name}" data-unit="${p.unit}" data-cost="${p.cost_price}">${p.name} (${p.code || '-'})</option>`
  ).join('');
  const html = `<div class="item-row" id="wdi-${id}">
    <div class="row g-2 align-items-end">
      <div class="col-md-5">
        <label class="form-label small mb-1">สินค้า</label>
        <select class="form-select form-select-sm wd-product-select" onchange="onWdProductChange(this)">
          <option value="">-- เลือกสินค้า --</option>${prodOpts}</select>
      </div>
      <div class="col-md-2">
        <label class="form-label small mb-1">คงเหลือ</label>
        <input type="text" class="form-control form-control-sm wd-avail bg-light" readonly value="-">
      </div>
      <div class="col-md-2">
        <label class="form-label small mb-1">จำนวนเบิก</label>
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
    status: 'pending', created_by: App.user.name
  };

  $('#btn-save-wd').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>บันทึก...');
  try {
    const res = await API.addWithdrawal(payload);
    if (res.success) {
      showToast('บันทึกใบเบิกสำเร็จ!', 'success');
      bootstrap.Modal.getOrCreateInstance('#modalWithdrawal').hide();
      loadWithdrawal();
      const sr = await API.getStock(); if (sr.success) App.stock = sr.data || [];
    } else throw new Error(res.message);
  } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'danger'); }
  $('#btn-save-wd').prop('disabled', false).html('<i class="fas fa-save me-1"></i>บันทึก');
}

async function changeWdStatus(id, status) {
  const label = status === 'completed' ? 'ยืนยันเบิกสำเร็จ' : 'ยืนยันคืนสินค้า';
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
          <span class="text-muted small">เบิกไปทั้งหมด <strong>${item.quantity}</strong> ${item.unit || 'ชิ้น'}</span>
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

function printReceipt(w) {
  const items = Array.isArray(w.items) ? w.items : [];
  const win = window.open('', '_blank', 'width=600,height=800');
  win.document.write(`<!DOCTYPE html><html lang="th"><head>
    <meta charset="UTF-8"><title>ใบเบิกสินค้า ${w.id}</title>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
    <style>body{font-family:Sarabun,sans-serif;padding:30px;max-width:600px;margin:0 auto}
    h2{text-align:center;font-size:1.5rem;margin-bottom:4px}.sub{text-align:center;color:#666;margin-bottom:24px}
    table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ddd;padding:8px 10px;font-size:.9rem}
    th{background:#f5f5f5;font-weight:700}.text-right{text-align:right}.total{font-weight:700;font-size:1rem}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:.9rem}
    .sign-area{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px;text-align:center}
    .sign-line{border-top:1px solid #333;padding-top:8px;margin-top:40px}
    @media print{.no-print{display:none}}</style></head>
    <body>
    <h2>ใบเบิกสินค้า</h2>
    <div class="sub">${CONFIG.APP_NAME}</div>
    <div class="meta">
      <div><strong>รหัส:</strong> ${w.id}</div>
      <div><strong>วันที่:</strong> ${Fmt.date(w.withdrawal_date || w.created_at)}</div>
      <div><strong>ผู้รับ:</strong> ${w.recipient_name || '-'}</div>
      <div><strong>แผนก:</strong> ${w.department || '-'}</div>
      <div><strong>ประเภท:</strong> ${w.type === 'return' ? 'คืนสินค้า' : 'เบิกสินค้า'}</div>
      <div><strong>สถานะ:</strong> ${statusLabel(w.status)}</div>
    </div>
    <table><thead><tr><th>สินค้า</th><th>จำนวน</th><th class="text-right">ราคา/ชิ้น</th><th class="text-right">รวม</th></tr></thead>
    <tbody>${items.map(i => `<tr><td>${i.product_name || i.product_id}</td><td>${i.quantity}</td>
      <td class="text-right">${Fmt.currency(i.unit_price || 0)}</td>
      <td class="text-right">${Fmt.currency((i.quantity || 0) * (i.unit_price || 0))}</td></tr>`).join('')}
    <tr class="total"><td colspan="3" class="text-right">รวมทั้งหมด</td>
    <td class="text-right">${Fmt.currency(w.total_value)}</td></tr></tbody></table>
    ${w.notes ? `<p><strong>หมายเหตุ:</strong> ${w.notes}</p>` : ''}
    <div class="sign-area">
      <div><div class="sign-line">ผู้เบิก</div><div>${w.recipient_name || ''}</div></div>
      <div><div class="sign-line">ผู้อนุมัติ</div><div>${w.created_by || ''}</div></div>
    </div>
    <div style="text-align:center;margin-top:20px"><button class="no-print" onclick="window.print()">🖨️ พิมพ์</button></div>
    </body></html>`);
  win.document.close();
}

// ============================================================
// SECTION: RECIPIENTS (ผู้รับสินค้า)
// ============================================================
async function loadRecipients() {
  try {
    const res = await API.getRecipients();
    if (!res.success) throw new Error(res.message);
    App.recipients = res.data || [];
    renderRecipientsTable(App.recipients);
    populateRecipientSelects();
  } catch (e) { showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger'); }
}

function renderRecipientsTable(data) {
  if (!data.length) {
    $('#recipients-table-body').html('<tr><td colspan="6" class="text-center text-muted py-4">ไม่พบข้อมูล</td></tr>');
    return;
  }
  $('#recipients-table-body').html(data.map(r => `<tr>
    <td class="fw-semibold">${r.name}</td>
    <td>${r.department || '-'}</td>
    <td>${r.position || '-'}</td>
    <td>${r.phone || '-'}</td>
    <td>${r.email || '-'}</td>
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
  $('#rcp-notes').val(r.notes);
  $('#modalRecipientLabel').text('แก้ไขผู้รับสินค้า');
  new bootstrap.Modal('#modalRecipient').show();
}

async function saveRecipient() {
  const name = $('#rcp-name').val().trim();
  if (!name) { showToast('กรุณากรอกชื่อผู้รับ', 'warning'); return; }
  const data = { name, department: $('#rcp-dept').val(), position: $('#rcp-pos').val(),
    phone: $('#rcp-phone').val(), email: $('#rcp-email').val(), notes: $('#rcp-notes').val() };
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
        const cost     = parseFloat(item.unit_price || 0);   // ต้นทุนที่บันทึกตอนเบิก
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
      $('#rpt-profit-body').html('<tr><td colspan="8" class="text-center text-muted">ไม่มีข้อมูลการเบิกในเดือนนี้</td></tr>');
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
  csv += `\n=== รายการเบิกสินค้า ===\n`;
  csv += `รหัส,วันที่,ผู้รับ,แผนก,มูลค่ารวม,สถานะ\n`;
  d.withdrawals.forEach(w => {
    csv += `${w.id},${Fmt.date(w.withdrawal_date || w.created_at)},${w.recipient_name || ''},${w.department || ''},${w.total_value},${statusLabel(w.status)}\n`;
  });
  csv += `\n=== สรุป ===\n`;
  csv += `ต้นทุนนำเข้ารวม,${d.totals.total_import_cost}\n`;
  csv += `มูลค่าเบิกจ่ายรวม,${d.totals.total_withdrawal_value}\n`;
  csv += `มูลค่าสต็อคปัจจุบัน,${d.totals.total_stock_value}\n`;
  csv += `รายได้รวม (ราคาขาย),${$('#rpt-stat-revenue').text()}\n`;
  csv += `ต้นทุนสินค้าที่เบิก,${$('#rpt-stat-cogs').text()}\n`;
  csv += `กำไรขั้นต้น,${$('#rpt-stat-profit').text()}\n`;
  csv += `Gross Margin,${$('#rpt-stat-margin').text()}\n`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `รายงาน_${monthNames[meta.month]}_${meta.year}.csv`;
  link.click();
  showToast('ส่งออกไฟล์สำเร็จ!', 'success');
}

// ============================================================
// SECTION: PRODUCTS (จัดการสินค้า)
// ============================================================
async function loadProducts() {
  try {
    const res = await API.getProducts();
    if (!res.success) throw new Error(res.message);
    App.products = res.data || [];
    renderProductsTable(App.products);
    populateProductSelects();
  } catch (e) { showToast('โหลดข้อมูลล้มเหลว: ' + e.message, 'danger'); }
}

function renderProductsTable(data) {
  if (!data.length) {
    $('#products-table-body').html('<tr><td colspan="8" class="text-center text-muted py-4">ไม่พบข้อมูล</td></tr>');
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
