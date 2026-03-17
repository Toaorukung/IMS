function getSpreadsheet() { return SpreadsheetApp.getActiveSpreadsheet(); }
function getSheet(name) { return getSpreadsheet().getSheetByName(name); }

// ---------- Entry Points ----------
function doGet(e) {
  const result = processRequest(e.parameter.action, e.parameter, null);
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let data = {};
  try { data = JSON.parse(e.postData.contents); } catch (_) {}
  const result = processRequest(data.action, null, data);
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function processRequest(action, params, body) {
  try {
    const p = body || params || {};
    switch (action) {
      case 'login':                  return login(p);
      case 'validateToken':          return validateToken(p);
      case 'getProducts':            return getProducts();
      case 'addProduct':             return addProduct(p);
      case 'updateProduct':          return updateProduct(p);
      case 'deleteProduct':          return deleteProduct(p);
      case 'getStock':               return getStock();
      case 'getImports':             return getImports();
      case 'addImport':              return addImport(p);
      case 'updateImportStatus':     return updateImportStatus(p);
      case 'getWithdrawals':         return getWithdrawals();
      case 'addWithdrawal':          return addWithdrawal(p);
      case 'updateWithdrawalStatus': return updateWithdrawalStatus(p);
      case 'partialReturn':          return partialReturn(p);
      case 'getRecipients':          return getRecipients();
      case 'addRecipient':           return addRecipient(p);
      case 'updateRecipient':        return updateRecipient(p);
      case 'getDashboardStats':      return getDashboardStats();
      case 'getMonthlyReport':       return getMonthlyReport(p);
      default: return { success: false, message: 'Unknown action: ' + action };
    }
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// ---------- Utilities ----------
function uid(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}
function now() { return new Date().toISOString(); }
function sheetToObjects(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const vals = sheet.getDataRange().getValues();
  const hdrs = vals[0];
  return vals.slice(1).map(row => {
    const obj = {};
    hdrs.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}
function updateRow(sheet, id, updates) {
  const rows = sheetToObjects(sheet);
  const idx  = rows.findIndex(r => r.id === id);
  if (idx === -1) return false;
  const hdrs  = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowNo = idx + 2;
  Object.keys(updates).forEach(k => {
    const col = hdrs.indexOf(k);
    if (col !== -1) sheet.getRange(rowNo, col + 1).setValue(updates[k]);
  });
  return true;
}

// ---------- Authentication ----------
function login(data) {
  const sheet = getSheet('Users');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Users' };
  const users = sheetToObjects(sheet);
  const user  = users.find(u =>
    String(u.username) === String(data.username) &&
    String(u.password) === String(data.password) &&
    u.status === 'active'
  );
  if (!user) return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  const token = Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
  const tkSheet = getSheet('Tokens');
  if (tkSheet) tkSheet.appendRow([token, user.id, user.username, now(), new Date(Date.now() + 86400000).toISOString()]);
  return { success: true, token, user: { id: user.id, username: user.username, name: user.name, role: user.role } };
}

function validateToken(data) {
  const sheet = getSheet('Tokens');
  if (!sheet) return { success: false };
  const tokens = sheetToObjects(sheet);
  const tk = tokens.find(t => t.token === data.token);
  if (!tk) return { success: false };
  return { success: true, username: tk.username };
}

// ---------- Products ----------
function getProducts() {
  const sheet = getSheet('Products');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Products' };
  return { success: true, data: sheetToObjects(sheet).filter(p => p.status !== 'inactive') };
}

function addProduct(data) {
  const sheet = getSheet('Products');
  if (!sheet) return { success: false };
  const id = uid('PRD');
  sheet.appendRow([id, data.code || '', data.name, data.category || '', data.unit || 'ชิ้น',
    parseFloat(data.cost_price) || 0, parseFloat(data.selling_price) || 0,
    parseInt(data.min_stock) || 0, data.notes || '', now(), 'active']);
  const stockSheet = getSheet('Stock');
  if (stockSheet) stockSheet.appendRow([uid('STK'), id, data.name, data.code || '',
    data.unit || 'ชิ้น', 0, parseFloat(data.cost_price) || 0, parseInt(data.min_stock) || 0, now()]);
  return { success: true, id, message: 'เพิ่มสินค้าสำเร็จ' };
}

function updateProduct(data) {
  const sheet = getSheet('Products');
  if (!sheet) return { success: false };
  const ok = updateRow(sheet, data.id, data);
  return { success: ok, message: ok ? 'อัพเดทสำเร็จ' : 'ไม่พบสินค้า' };
}

function deleteProduct(data) {
  const sheet = getSheet('Products');
  if (!sheet) return { success: false };
  const ok = updateRow(sheet, data.id, { status: 'inactive' });
  return { success: ok, message: ok ? 'ลบสำเร็จ' : 'ไม่พบสินค้า' };
}

// ---------- Stock ----------
function getStock() {
  const sheet = getSheet('Stock');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Stock' };
  return { success: true, data: sheetToObjects(sheet) };
}

function adjustStock(productId, delta, newCost) {
  const sheet = getSheet('Stock');
  if (!sheet) return;
  const rows = sheetToObjects(sheet);
  const idx  = rows.findIndex(r => String(r.product_id) === String(productId));
  if (idx === -1) return;
  const rowNo   = idx + 2;
  const current = parseFloat(sheet.getRange(rowNo, 6).getValue()) || 0;
  const updated = Math.max(0, current + delta);
  sheet.getRange(rowNo, 6).setValue(updated);
  sheet.getRange(rowNo, 9).setValue(now());
  if (newCost !== null && newCost !== undefined) sheet.getRange(rowNo, 7).setValue(newCost);
}

// ---------- Imports (Purchase Orders) ----------
function getImports() {
  const sheet = getSheet('Imports');
  if (!sheet) return { success: false };
  const rows = sheetToObjects(sheet);
  rows.forEach(r => {
    try { r.items = JSON.parse(r.items); } catch (_) { r.items = []; }
    try { r.import_costs = JSON.parse(r.import_costs); } catch (_) { r.import_costs = {}; }
  });
  return { success: true, data: rows };
}

function addImport(data) {
  const sheet = getSheet('Imports');
  if (!sheet) return { success: false };
  const id        = uid('IMP');
  const items     = data.items || [];
  const importCosts = data.import_costs || {};
  const baseTHB   = (parseFloat(data.yuan_amount) || 0) * (parseFloat(data.exchange_rate) || 1);
  const freight   = parseFloat(data.freight_cost) || 0;
  const addCosts  = (parseFloat(importCosts.customs_duty) || 0) +
                    (parseFloat(importCosts.clearance_fee) || 0) +
                    (parseFloat(importCosts.transport_fee) || 0) +
                    (parseFloat(importCosts.warehouse_fee) || 0) +
                    (parseFloat(importCosts.vat) || 0);
  const total     = baseTHB + freight + addCosts;

  sheet.appendRow([id, data.order_date || now(), data.supplier || '',
    JSON.stringify(items), parseFloat(data.yuan_amount) || 0,
    parseFloat(data.exchange_rate) || 1, baseTHB, freight,
    JSON.stringify(importCosts), addCosts, total,
    data.status || 'pending', data.notes || '', now(), data.created_by || '']);

  if (data.status === 'received') {
    items.forEach(item => adjustStock(item.product_id, parseFloat(item.quantity), parseFloat(item.unit_cost)));
  }
  return { success: true, id, total_cost: total, message: 'บันทึกการสั่งซื้อสำเร็จ' };
}

function updateImportStatus(data) {
  const sheet = getSheet('Imports');
  if (!sheet) return { success: false };
  const rows   = sheetToObjects(sheet);
  const record = rows.find(r => r.id === data.id);
  if (!record) return { success: false, message: 'ไม่พบการสั่งซื้อ' };
  const updates = { status: data.status };
  if (data.import_costs) updates.import_costs = JSON.stringify(data.import_costs);
  updateRow(sheet, data.id, updates);
  if (data.status === 'received') {
    let items = [];
    try { items = JSON.parse(record.items); } catch (_) {}
    items.forEach(item => adjustStock(item.product_id, parseFloat(item.quantity), parseFloat(item.unit_cost)));
  }
  return { success: true, message: 'อัพเดทสถานะสำเร็จ' };
}

// ---------- Withdrawals ----------
function getWithdrawals() {
  const sheet = getSheet('Withdrawals');
  if (!sheet) return { success: false };
  const rows = sheetToObjects(sheet);
  rows.forEach(r => {
    try { r.items = JSON.parse(r.items); } catch (_) { r.items = []; }
  });
  return { success: true, data: rows };
}

function addWithdrawal(data) {
  const sheet = getSheet('Withdrawals');
  if (!sheet) return { success: false };
  const id    = uid('WDR');
  const items = Array.isArray(data.items) ? data.items : [];
  const total = items.reduce((s, i) => s + (parseFloat(i.quantity) * (parseFloat(i.unit_price) || 0)), 0);

  sheet.appendRow([id, data.withdrawal_date || now(), data.recipient_id || '',
    data.recipient_name || '', data.department || '', JSON.stringify(items),
    total, data.type || 'normal', data.notes || '',
    data.status || 'pending', data.created_by || '', now()]);

  if (data.status === 'completed') {
    const sign = data.type === 'return' ? 1 : -1;
    items.forEach(i => adjustStock(i.product_id, sign * parseFloat(i.quantity), null));
  }
  return { success: true, id, message: 'บันทึกใบเบิกสำเร็จ' };
}

function updateWithdrawalStatus(data) {
  const sheet = getSheet('Withdrawals');
  if (!sheet) return { success: false };
  const rows   = sheetToObjects(sheet);
  const record = rows.find(r => r.id === data.id);
  if (!record) return { success: false, message: 'ไม่พบใบเบิก' };
  const oldStatus = record.status;
  updateRow(sheet, data.id, { status: data.status });

  let items = [];
  try { items = JSON.parse(record.items); } catch (_) {}

  const isNormal = record.type === 'normal';
  if (data.status === 'completed' && oldStatus !== 'completed') {
    items.forEach(i => adjustStock(i.product_id, isNormal ? -parseFloat(i.quantity) : parseFloat(i.quantity), null));
  } else if (data.status === 'returned' && oldStatus === 'completed') {
    items.forEach(i => adjustStock(i.product_id, isNormal ? parseFloat(i.quantity) : -parseFloat(i.quantity), null));
  }
  return { success: true, message: 'อัพเดทสถานะสำเร็จ' };
}

function partialReturn(data) {
  const sheet = getSheet('Withdrawals');
  if (!sheet) return { success: false };
  const rows   = sheetToObjects(sheet);
  const record = rows.find(r => r.id === data.id);
  if (!record) return { success: false, message: 'ไม่พบใบเบิก' };
  if (record.status !== 'completed' && record.status !== 'partial_returned')
    return { success: false, message: 'สามารถคืนได้เฉพาะใบเบิกที่เสร็จสิ้นแล้ว' };

  const returnItems = data.return_items || [];
  if (!returnItems.length) return { success: false, message: 'กรุณาระบุรายการที่ต้องการคืน' };

  // อ่านรายการสินค้าปัจจุบันในใบเบิก
  var currentItems = [];
  try { currentItems = JSON.parse(record.items); } catch (_) {}

  const isNormal = record.type === 'normal';
  returnItems.forEach(function(item) {
    // คืนสต็อค
    adjustStock(item.product_id, isNormal ? parseFloat(item.quantity) : -parseFloat(item.quantity), null);
    // ลดจำนวนในใบเบิก
    var ci = currentItems.find(function(i) { return i.product_id === item.product_id; });
    if (ci) {
      ci.quantity = parseFloat(ci.quantity) - parseFloat(item.quantity);
      if (ci.quantity < 0) ci.quantity = 0;
    }
  });

  // เก็บเฉพาะรายการที่ยังค้างอยู่ (จำนวน > 0)
  var remainingItems = currentItems.filter(function(i) { return parseFloat(i.quantity) > 0; });

  var newStatus = (remainingItems.length === 0) ? 'returned' : 'partial_returned';
  updateRow(sheet, data.id, { status: newStatus, items: JSON.stringify(remainingItems) });
  return { success: true, message: 'คืนสินค้าสำเร็จ' };
}

// ---------- Recipients ----------
function getRecipients() {
  const sheet = getSheet('Recipients');
  if (!sheet) return { success: false };
  return { success: true, data: sheetToObjects(sheet).filter(r => r.status === 'active') };
}

function addRecipient(data) {
  const sheet = getSheet('Recipients');
  if (!sheet) return { success: false };
  const id = uid('RCP');
  sheet.appendRow([id, data.name, data.department || '', data.position || '',
    "'" + data.phone || '', data.email || '', data.notes || '', 'active', now()]);
  return { success: true, id, message: 'เพิ่มผู้รับสินค้าสำเร็จ' };
}

function updateRecipient(data) {
  const sheet = getSheet('Recipients');
  if (!sheet) return { success: false };
  const ok = updateRow(sheet, data.id, data);
  return { success: ok, message: ok ? 'อัพเดทสำเร็จ' : 'ไม่พบผู้รับ' };
}

// ---------- Dashboard Stats ----------
function getDashboardStats() {
  const stats = { total_products: 0, low_stock_items: 0, total_stock_value: 0,
    pending_withdrawals: 0, completed_today: 0, month_imports: 0, total_recipients: 0 };

  const stockSheet = getSheet('Stock');
  if (stockSheet) {
    const rows = sheetToObjects(stockSheet);
    stats.total_products    = rows.length;
    stats.low_stock_items   = rows.filter(r => parseFloat(r.quantity) <= parseFloat(r.min_stock)).length;
    stats.total_stock_value = rows.reduce((s, r) => s + parseFloat(r.quantity) * parseFloat(r.cost_price), 0);
  }

  const wSheet = getSheet('Withdrawals');
  if (wSheet) {
    const rows = sheetToObjects(wSheet);
    stats.pending_withdrawals = rows.filter(r => r.status === 'pending').length;
    const todayStr = new Date().toDateString();
    stats.completed_today = rows.filter(r => r.status === 'completed' &&
      new Date(r.created_at).toDateString() === todayStr).length;
  }

  const iSheet = getSheet('Imports');
  if (iSheet) {
    const rows = sheetToObjects(iSheet);
    const m = new Date().getMonth(); const y = new Date().getFullYear();
    stats.month_imports = rows.filter(r => {
      const d = new Date(r.order_date); return d.getMonth() === m && d.getFullYear() === y;
    }).length;
  }

  const rSheet = getSheet('Recipients');
  if (rSheet) stats.total_recipients = sheetToObjects(rSheet).filter(r => r.status === 'active').length;

  return { success: true, data: stats };
}

// ---------- Monthly Report ----------
function getMonthlyReport(params) {
  const month = parseInt(params.month) - 1;
  const year  = parseInt(params.year);
  const report = { month: params.month, year: params.year, imports: [], withdrawals: [], stock: [], totals: {} };

  const iSheet = getSheet('Imports');
  if (iSheet) {
    const rows = sheetToObjects(iSheet);
    report.imports = rows.filter(r => {
      const d = new Date(r.order_date); return d.getMonth() === month && d.getFullYear() === year;
    });
    report.imports.forEach(r => { try { r.items = JSON.parse(r.items); } catch (_) { r.items = []; } });
    report.totals.total_import_cost = report.imports.reduce((s, r) => s + parseFloat(r.total_cost || 0), 0);
  }

  const wSheet = getSheet('Withdrawals');
  if (wSheet) {
    const rows = sheetToObjects(wSheet);
    report.withdrawals = rows.filter(r => {
      const d = new Date(r.withdrawal_date || r.created_at);
      return d.getMonth() === month && d.getFullYear() === year && r.status === 'completed';
    });
    report.withdrawals.forEach(r => { try { r.items = JSON.parse(r.items); } catch (_) { r.items = []; } });
    report.totals.total_withdrawal_value = report.withdrawals.reduce((s, r) => s + parseFloat(r.total_value || 0), 0);
  }

  const sSheet = getSheet('Stock');
  if (sSheet) {
    report.stock = sheetToObjects(sSheet);
    report.totals.total_stock_value = report.stock.reduce((s, r) =>
      s + parseFloat(r.quantity) * parseFloat(r.cost_price), 0);
  }
  return { success: true, data: report };
}
