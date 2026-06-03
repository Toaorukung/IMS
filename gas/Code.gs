function getSpreadsheet() { return SpreadsheetApp.getActiveSpreadsheet(); }
function getSheet(name) { return getSpreadsheet().getSheetByName(name); }

// ---------- Setup / Migration ----------
/**
 * รันฟังก์ชันนี้จาก Apps Script Editor ครั้งเดียวหลัง deploy
 * - สร้าง sheet ที่ขาด พร้อม header + style
 * - sheet ที่มีอยู่แล้ว: เพิ่มคอลัมน์ branch_id ถ้ายังไม่มี
 * - ไม่แตะข้อมูลแถวอื่น ปลอดภัยกับ sheet ที่มีข้อมูลแล้ว
 */
function setupAllSheets() {
  const ss = getSpreadsheet();

  const SHEET_DEFS = {
    'Branches':    ['id','name','address','phone','created_at','status'],
    'Users':       ['id','username','password','name','role','status','created_at','branch_id'],
    'Tokens':      ['token','user_id','username','created_at','expires_at'],
    'Products':    ['id','code','name','category','unit','cost_price','selling_price','min_stock','notes','created_at','status','branch_id'],
    'Stock':       ['id','product_id','product_name','product_code','unit','quantity','cost_price','min_stock','last_updated','branch_id'],
    'Imports':     ['id','order_date','supplier','items','yuan_amount','exchange_rate','base_cost_thb','freight_cost','import_costs','additional_costs','total_cost','status','notes','created_at','created_by','branch_id'],
    'Withdrawals': ['id','withdrawal_date','recipient_id','recipient_name','department','items','total_value','type','notes','status','created_by','created_at','branch_id'],
    'Recipients':  ['id','name','department','position','phone','email','notes','status','created_at','branch_id']
  };

  // Sheets ที่ไม่ต้องมี branch_id
  const NO_BRANCH_ID = new Set(['Tokens']);

  const log = [];

  Object.keys(SHEET_DEFS).forEach(function(sheetName) {
    const headers = SHEET_DEFS[sheetName];
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      // ยังไม่มี sheet → สร้างใหม่พร้อม header
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      _styleHeader(sheet, headers.length);
      log.push('✅ ' + sheetName + ': สร้างใหม่ (' + headers.length + ' คอลัมน์)');
      return;
    }

    // Sheet มีอยู่แล้ว
    if (sheet.getLastRow() === 0) {
      // ว่างเปล่า → ใส่ header
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      _styleHeader(sheet, headers.length);
      log.push('✅ ' + sheetName + ': เพิ่ม header (' + headers.length + ' คอลัมน์)');
      return;
    }

    // มีข้อมูลแล้ว → ตรวจและเพิ่ม branch_id ถ้าขาด
    if (!NO_BRANCH_ID.has(sheetName)) {
      const existingHdrs = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
        .map(function(h) { return String(h).trim(); });
      if (!existingHdrs.includes('branch_id')) {
        const nextCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, nextCol).setValue('branch_id');
        _styleHeader(sheet, nextCol); // style ทั้งแถว header ใหม่
        log.push('🔧 ' + sheetName + ': เพิ่มคอลัมน์ branch_id (คอลัมน์ที่ ' + nextCol + ')');
      } else {
        log.push('☑️  ' + sheetName + ': ครบแล้ว');
      }
    } else {
      log.push('☑️  ' + sheetName + ': ครบแล้ว (ไม่ต้องการ branch_id)');
    }
  });

  const summary = log.join('\n');
  Logger.log(summary);
  // แสดงผลใน dialog ถ้าเรียกจาก Editor
  try {
    SpreadsheetApp.getUi().alert('ผลการตั้งค่า Sheet\n\n' + summary);
  } catch (e) { /* ไม่มี UI (เรียกผ่าน trigger) */ }
  return summary;
}

function _styleHeader(sheet, colCount) {
  var r = sheet.getRange(1, 1, 1, colCount);
  r.setBackground('#1a56db');
  r.setFontColor('#ffffff');
  r.setFontWeight('bold');
  r.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  // Auto-resize columns (best-effort)
  for (var i = 1; i <= colCount; i++) {
    try { sheet.autoResizeColumn(i); } catch (e) {}
  }
}

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
      case 'getProducts':            return getProducts(p);
      case 'addProduct':             return addProduct(p);
      case 'updateProduct':          return updateProduct(p);
      case 'deleteProduct':          return deleteProduct(p);
      case 'getStock':               return getStock(p);
      case 'getImports':             return getImports(p);
      case 'addImport':              return addImport(p);
      case 'updateImportStatus':     return updateImportStatus(p);
      case 'getWithdrawals':         return getWithdrawals(p);
      case 'addWithdrawal':          return addWithdrawal(p);
      case 'updateWithdrawalStatus': return updateWithdrawalStatus(p);
      case 'partialReturn':          return partialReturn(p);
      case 'getRecipients':          return getRecipients(p);
      case 'addRecipient':           return addRecipient(p);
      case 'updateRecipient':        return updateRecipient(p);
      case 'getDashboardStats':      return getDashboardStats(p);
      case 'getMonthlyReport':       return getMonthlyReport(p);
      case 'getBranches':            return getBranches();
      case 'addBranch':              return addBranch(p);
      case 'updateBranch':           return updateBranch(p);
      case 'getBranchOverview':      return getBranchOverview();
      case 'getUsers':               return getUsers(p);
      case 'addUser':                return addUser(p);
      case 'updateUser':             return updateUser(p);
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
function filterByBranch(rows, branchId) {
  if (!branchId) return rows;
  return rows.filter(function(r) { return String(r.branch_id || '') === String(branchId); });
}

// ---------- Branch Lookup ----------
function getBranchName(branchId) {
  if (!branchId) return '';
  const sheet = getSheet('Branches');
  if (!sheet) return branchId;
  const branches = sheetToObjects(sheet);
  const branch = branches.find(function(b) { return b.id === branchId; });
  return branch ? (branch.name || branchId) : branchId;
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
  if (tkSheet) {
    // ลบ token เดิมของ user นี้ทั้งหมดก่อน (1 user = 1 token เท่านั้น)
    const lastRow = tkSheet.getLastRow();
    if (lastRow >= 2) {
      const usernamCol = tkSheet.getRange(2, 3, lastRow - 1, 1).getValues(); // column 3 = username
      for (let i = usernamCol.length - 1; i >= 0; i--) {
        if (String(usernamCol[i][0]) === String(user.username)) {
          tkSheet.deleteRow(i + 2);
        }
      }
    }
    tkSheet.appendRow([token, user.id, user.username, now(), new Date(Date.now() + 86400000).toISOString()]);
  }
  const branchId   = user.branch_id || '';
  const branchName = getBranchName(branchId);
  return { success: true, token, user: {
    id: user.id, username: user.username, name: user.name, role: user.role,
    branch_id: branchId, branch_name: branchName
  }};
}

function validateToken(data) {
  const tkSheet = getSheet('Tokens');
  if (!tkSheet) return { success: false };
  const tokens = sheetToObjects(tkSheet);
  const tk = tokens.find(t => t.token === data.token);
  if (!tk) return { success: false };

  // ตรวจสอบวันหมดอายุ
  if (tk.expires_at && new Date() > new Date(tk.expires_at)) {
    return { success: false, message: 'Token หมดอายุ กรุณาเข้าสู่ระบบใหม่' };
  }

  // ดึงข้อมูล user พร้อม role จากชีท Users
  const userSheet = getSheet('Users');
  if (!userSheet) return { success: false };
  const users = sheetToObjects(userSheet);
  const user = users.find(u => u.username === tk.username && u.status === 'active');
  if (!user) return { success: false, message: 'บัญชีถูกระงับหรือไม่พบในระบบ' };

  const branchId   = user.branch_id || '';
  const branchName = getBranchName(branchId);
  return { success: true, user: {
    id: user.id, username: user.username, name: user.name, role: user.role,
    branch_id: branchId, branch_name: branchName
  }};
}

// ---------- Products ----------
function getProducts(p) {
  const sheet = getSheet('Products');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Products' };
  const branchId = (p || {}).branch_id || '';
  let data = sheetToObjects(sheet).filter(pr => pr.status !== 'inactive');
  data = filterByBranch(data, branchId);
  return { success: true, data };
}

function addProduct(data) {
  const sheet = getSheet('Products');
  if (!sheet) return { success: false };
  const id       = uid('PRD');
  const branchId = data.branch_id || '';
  sheet.appendRow([id, data.code || '', data.name, data.category || '', data.unit || 'ชิ้น',
    parseFloat(data.cost_price) || 0, parseFloat(data.selling_price) || 0,
    parseInt(data.min_stock) || 0, data.notes || '', now(), 'active', branchId]);
  const stockSheet = getSheet('Stock');
  if (stockSheet) stockSheet.appendRow([uid('STK'), id, data.name, data.code || '',
    data.unit || 'ชิ้น', 0, parseFloat(data.cost_price) || 0, parseInt(data.min_stock) || 0, now(), branchId]);
  return { success: true, id, message: 'เพิ่มสินค้าสำเร็จ' };
}

function updateProduct(data) {
  const sheet = getSheet('Products');
  if (!sheet) return { success: false };
  const rows = sheetToObjects(sheet);
  const existing = rows.find(function(r) { return r.id === data.id; });
  const ok = updateRow(sheet, data.id, data);
  // If cost_price changed → revalue all stock lots at the new price
  if (ok && existing && data.cost_price !== undefined &&
      parseFloat(data.cost_price) !== parseFloat(existing.cost_price)) {
    revalueStock(data.id, parseFloat(data.cost_price));
  }
  return { success: ok, message: ok ? 'อัพเดทสำเร็จ' : 'ไม่พบสินค้า' };
}

function deleteProduct(data) {
  const sheet = getSheet('Products');
  if (!sheet) return { success: false };
  const ok = updateRow(sheet, data.id, { status: 'inactive' });
  return { success: ok, message: ok ? 'ลบสำเร็จ' : 'ไม่พบสินค้า' };
}

// ---------- Stock (FIFO Lot-based) ----------

// Append a new stock lot row
// col layout: id, product_id, product_name, product_code, unit, quantity, cost_price, min_stock, last_updated, branch_id
function addStockLot(productId, quantity, cost, branchId) {
  var sheet = getSheet('Stock');
  if (!sheet) return;
  var prodSheet = getSheet('Products');
  var prod = prodSheet ? sheetToObjects(prodSheet).find(function(p) { return p.id === productId; }) : null;
  var lotId = uid('LOT');
  var bId = branchId || (prod ? (prod.branch_id || '') : '');
  sheet.appendRow([
    lotId,
    productId,
    prod ? (prod.name || '') : '',
    prod ? (prod.code || '') : '',
    prod ? (prod.unit || '') : '',
    parseFloat(quantity) || 0,
    parseFloat(cost) || 0,
    prod ? (parseFloat(prod.min_stock) || 0) : 0,
    now(),
    bId
  ]);
}

// FIFO deduction: deduct quantity from oldest (top) lots first
// col indices (0-based): 1=product_id, 5=quantity, 8=last_updated
function deductStockFIFO(productId, quantity) {
  var sheet = getSheet('Stock');
  if (!sheet || sheet.getLastRow() < 2) return;
  var remaining = parseFloat(quantity);
  var lastRow = sheet.getLastRow();
  var allVals = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  for (var i = 0; i < allVals.length && remaining > 0; i++) {
    if (String(allVals[i][1]) !== String(productId)) continue; // col index 1 = product_id
    var rowNo = i + 2;
    var qty = parseFloat(allVals[i][5]) || 0; // col index 5 = quantity
    if (qty <= 0) continue;
    if (qty <= remaining) {
      sheet.getRange(rowNo, 6).setValue(0);
      remaining -= qty;
    } else {
      sheet.getRange(rowNo, 6).setValue(qty - remaining);
      remaining = 0;
    }
    sheet.getRange(rowNo, 9).setValue(now());
  }
}

// Revalue: consolidate all existing lots into one new lot at new cost (triggered by cost_price edit)
function revalueStock(productId, newCost) {
  var sheet = getSheet('Stock');
  var prodSheet = getSheet('Products');
  var prod = prodSheet ? sheetToObjects(prodSheet).find(function(p) { return p.id === productId; }) : null;
  var branchId = prod ? (prod.branch_id || '') : '';

  if (!sheet || sheet.getLastRow() < 2) {
    addStockLot(productId, 0, newCost, branchId);
    return;
  }
  var lastRow = sheet.getLastRow();
  var allVals = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  var totalQty = 0;
  for (var i = 0; i < allVals.length; i++) {
    if (String(allVals[i][1]) !== String(productId)) continue;
    var qty = parseFloat(allVals[i][5]) || 0;
    totalQty += qty;
    if (qty > 0) {
      sheet.getRange(i + 2, 6).setValue(0);
      sheet.getRange(i + 2, 9).setValue(now());
    }
  }
  addStockLot(productId, totalQty, newCost, branchId);
}

// getStock: aggregate all lots per product_id into one summary row (weighted avg cost)
function getStock(p) {
  var sheet = getSheet('Stock');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Stock' };
  var branchId = (p || {}).branch_id || '';
  var rows = sheetToObjects(sheet);
  if (branchId) rows = rows.filter(function(r) { return String(r.branch_id || '') === String(branchId); });
  var map = {};
  rows.forEach(function(r) {
    var pid = String(r.product_id);
    var qty = parseFloat(r.quantity) || 0;
    var cost = parseFloat(r.cost_price) || 0;
    if (!map[pid]) {
      map[pid] = {
        id: r.id,
        product_id: pid,
        product_name: r.product_name || '',
        product_code: r.product_code || '',
        min_stock: r.min_stock || 0,
        unit: r.unit || '',
        branch_id: r.branch_id || '',
        quantity: 0,
        cost_price: 0,
        _total_value: 0,
        last_updated: r.last_updated || ''
      };
    }
    map[pid].quantity += qty;
    map[pid]._total_value += qty * cost;
    var d1 = new Date(r.last_updated || 0);
    var d2 = new Date(map[pid].last_updated || 0);
    if (d1 > d2) map[pid].last_updated = r.last_updated;
  });
  var result = Object.keys(map).map(function(pid) {
    var p = map[pid];
    p.cost_price = p.quantity > 0 ? p._total_value / p.quantity : 0;
    delete p._total_value;
    return p;
  });
  return { success: true, data: result };
}

// ---------- Imports (Purchase Orders) ----------
function getImports(p) {
  const sheet = getSheet('Imports');
  if (!sheet) return { success: false };
  const branchId = (p || {}).branch_id || '';
  let rows = sheetToObjects(sheet);
  rows = filterByBranch(rows, branchId);
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
  const branchId  = data.branch_id || '';
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
    data.status || 'pending', data.notes || '', now(), data.created_by || '', branchId]);

  if (data.status === 'received') {
    items.forEach(function(item) { addStockLot(item.product_id, parseFloat(item.quantity), parseFloat(item.unit_cost), branchId); });
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
    const branchId = record.branch_id || '';
    items.forEach(function(item) { addStockLot(item.product_id, parseFloat(item.quantity), parseFloat(item.unit_cost), branchId); });
  }
  return { success: true, message: 'อัพเดทสถานะสำเร็จ' };
}

// ---------- Withdrawals ----------
function getWithdrawals(p) {
  const sheet = getSheet('Withdrawals');
  if (!sheet) return { success: false };
  const branchId = (p || {}).branch_id || '';
  let rows = sheetToObjects(sheet);
  rows = filterByBranch(rows, branchId);
  rows.forEach(r => {
    try { r.items = JSON.parse(r.items); } catch (_) { r.items = []; }
  });
  return { success: true, data: rows };
}

function addWithdrawal(data) {
  const sheet = getSheet('Withdrawals');
  if (!sheet) return { success: false };
  const id       = uid('WDR');
  const branchId = data.branch_id || '';
  const items    = Array.isArray(data.items) ? data.items : [];
  const total    = items.reduce((s, i) => s + (parseFloat(i.quantity) * (parseFloat(i.unit_price) || 0)), 0);

  sheet.appendRow([id, data.withdrawal_date || now(), data.recipient_id || '',
    data.recipient_name || '', data.department || '', JSON.stringify(items),
    total, data.type || 'normal', data.notes || '',
    data.status || 'pending', data.created_by || '', now(), branchId]);

  if (data.status === 'completed') {
    if (data.type === 'return') {
      items.forEach(function(i) { addStockLot(i.product_id, parseFloat(i.quantity), parseFloat(i.unit_price) || 0, branchId); });
    } else {
      items.forEach(function(i) { deductStockFIFO(i.product_id, parseFloat(i.quantity)); });
    }
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
  const branchId  = record.branch_id || '';
  updateRow(sheet, data.id, { status: data.status });

  let items = [];
  try { items = JSON.parse(record.items); } catch (_) {}

  const isNormal = record.type === 'normal';
  if (data.status === 'completed' && oldStatus !== 'completed') {
    if (isNormal) {
      items.forEach(function(i) { deductStockFIFO(i.product_id, parseFloat(i.quantity)); });
    } else {
      items.forEach(function(i) { addStockLot(i.product_id, parseFloat(i.quantity), 0, branchId); });
    }
  } else if (data.status === 'returned' && oldStatus === 'completed') {
    if (isNormal) {
      items.forEach(function(i) { addStockLot(i.product_id, parseFloat(i.quantity), 0, branchId); });
    } else {
      items.forEach(function(i) { deductStockFIFO(i.product_id, parseFloat(i.quantity)); });
    }
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

  var currentItems = [];
  try { currentItems = JSON.parse(record.items); } catch (_) {}

  const isNormal = record.type === 'normal';
  const branchId = record.branch_id || '';
  returnItems.forEach(function(item) {
    if (isNormal) {
      addStockLot(item.product_id, parseFloat(item.quantity), 0, branchId);
    } else {
      deductStockFIFO(item.product_id, parseFloat(item.quantity));
    }
    var ci = currentItems.find(function(i) { return i.product_id === item.product_id; });
    if (ci) {
      ci.quantity = parseFloat(ci.quantity) - parseFloat(item.quantity);
      if (ci.quantity < 0) ci.quantity = 0;
    }
  });

  var remainingItems = currentItems.filter(function(i) { return parseFloat(i.quantity) > 0; });
  var newStatus = (remainingItems.length === 0) ? 'returned' : 'partial_returned';
  updateRow(sheet, data.id, { status: newStatus, items: JSON.stringify(remainingItems) });
  return { success: true, message: 'คืนสินค้าสำเร็จ' };
}

// ---------- Recipients ----------
function getRecipients(p) {
  const sheet = getSheet('Recipients');
  if (!sheet) return { success: false };
  const branchId = (p || {}).branch_id || '';
  let rows = sheetToObjects(sheet).filter(r => r.status === 'active');
  rows = filterByBranch(rows, branchId);
  return { success: true, data: rows };
}

function addRecipient(data) {
  const sheet = getSheet('Recipients');
  if (!sheet) return { success: false };
  const id       = uid('RCP');
  const branchId = data.branch_id || '';
  sheet.appendRow([id, data.name, data.department || '', data.position || '',
    "'" + data.phone || '', data.email || '', data.notes || '', 'active', now(), branchId]);
  return { success: true, id, message: 'เพิ่มผู้รับสินค้าสำเร็จ' };
}

function updateRecipient(data) {
  const sheet = getSheet('Recipients');
  if (!sheet) return { success: false };
  const ok = updateRow(sheet, data.id, data);
  return { success: ok, message: ok ? 'อัพเดทสำเร็จ' : 'ไม่พบผู้รับ' };
}

// ---------- Users ----------
function getUsers(p) {
  const sheet = getSheet('Users');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Users' };
  const requesterRole = (p || {}).requester_role || '';
  const requesterBranch = (p || {}).requester_branch || '';
  let users = sheetToObjects(sheet).map(function(u) {
    // ไม่ส่ง password กลับ
    return { id: u.id, username: u.username, name: u.name, role: u.role,
             status: u.status, created_at: u.created_at, branch_id: u.branch_id || '',
             branch_name: getBranchName(u.branch_id || '') };
  });
  // admin สาขาเห็นเฉพาะ user ในสาขาตัวเอง
  if (requesterRole === 'admin' && requesterBranch) {
    users = users.filter(function(u) { return String(u.branch_id) === String(requesterBranch); });
  }
  return { success: true, data: users };
}

function addUser(data) {
  const sheet = getSheet('Users');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Users' };
  // ตรวจ username ซ้ำ
  const existing = sheetToObjects(sheet);
  if (existing.find(function(u) { return String(u.username) === String(data.username); })) {
    return { success: false, message: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' };
  }
  if (!data.username || !data.password || !data.name) {
    return { success: false, message: 'กรุณากรอก username, password และชื่อ' };
  }
  const validRoles = ['superadmin', 'admin', 'staff'];
  if (!validRoles.includes(data.role)) {
    return { success: false, message: 'role ไม่ถูกต้อง (superadmin / admin / staff)' };
  }
  const id = uid('USR');
  sheet.appendRow([id, data.username, data.password, data.name,
    data.role, 'active', now(), data.branch_id || '']);
  return { success: true, id, message: 'เพิ่มผู้ใช้สำเร็จ' };
}

function updateUser(data) {
  const sheet = getSheet('Users');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Users' };
  if (!data.id) return { success: false, message: 'ไม่ระบุ id' };
  const updates = {};
  if (data.name     !== undefined) updates.name      = data.name;
  if (data.role     !== undefined) updates.role      = data.role;
  if (data.status   !== undefined) updates.status    = data.status;
  if (data.branch_id !== undefined) updates.branch_id = data.branch_id;
  if (data.password && data.password.trim() !== '') updates.password = data.password;
  const ok = updateRow(sheet, data.id, updates);
  return { success: ok, message: ok ? 'อัพเดทสำเร็จ' : 'ไม่พบผู้ใช้' };
}

// ---------- Branches ----------
function getBranches() {
  const sheet = getSheet('Branches');
  if (!sheet) return { success: true, data: [] };
  return { success: true, data: sheetToObjects(sheet).filter(b => String(b.status) === 'active') };
}

function addBranch(data) {
  const sheet = getSheet('Branches');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Branches กรุณาสร้างชีทในกูเกิลชีทก่อน' };
  const id = uid('BRN');
  sheet.appendRow([id, data.name || '', data.address || '', data.phone || '', now(), 'active']);
  return { success: true, id, message: 'เพิ่มสาขาสำเร็จ' };
}

function updateBranch(data) {
  const sheet = getSheet('Branches');
  if (!sheet) return { success: false };
  const ok = updateRow(sheet, data.id, data);
  return { success: ok, message: ok ? 'อัพเดทสำเร็จ' : 'ไม่พบสาขา' };
}

function getBranchOverview() {
  const branches = getBranches().data || [];
  const result   = branches.map(function(branch) {
    const stats = getDashboardStats({ branch_id: branch.id }).data || {};
    return {
      id:                branch.id,
      name:              branch.name,
      address:           branch.address || '',
      phone:             branch.phone   || '',
      total_products:    stats.total_products    || 0,
      total_stock_value: stats.total_stock_value || 0,
      total_stock_units: stats.total_stock_units || 0,
      low_stock_items:   stats.low_stock_items   || 0,
      pending_withdrawals: stats.pending_withdrawals || 0,
      completed_today:   stats.completed_today   || 0,
      month_imports:     stats.month_imports      || 0
    };
  });
  return { success: true, data: result };
}

// ---------- Dashboard Stats ----------
function getDashboardStats(p) {
  const branchId = (p || {}).branch_id || '';
  const stats = { total_products: 0, low_stock_items: 0, total_stock_value: 0, total_stock_units: 0,
    pending_withdrawals: 0, completed_today: 0, month_imports: 0, pending_imports: 0, total_recipients: 0 };

  const stockSheet = getSheet('Stock');
  if (stockSheet) {
    let rows = sheetToObjects(stockSheet);
    if (branchId) rows = rows.filter(function(r) { return String(r.branch_id || '') === String(branchId); });
    // Aggregate lots per product_id
    const stockMap = {};
    rows.forEach(function(r) {
      const pid = String(r.product_id);
      const qty = parseFloat(r.quantity) || 0;
      if (!stockMap[pid]) stockMap[pid] = { quantity: 0, min_stock: parseFloat(r.min_stock) || 0, total_value: 0 };
      stockMap[pid].quantity   += qty;
      stockMap[pid].total_value += qty * (parseFloat(r.cost_price) || 0);
    });
    const aggregated = Object.values(stockMap);
    stats.total_products    = aggregated.length;
    stats.low_stock_items   = aggregated.filter(function(p) { return p.min_stock > 0 && p.quantity <= p.min_stock; }).length;
    stats.total_stock_value = aggregated.reduce(function(s, p) { return s + p.total_value; }, 0);
    stats.total_stock_units = aggregated.reduce(function(s, p) { return s + p.quantity; }, 0);
  }

  const wSheet = getSheet('Withdrawals');
  if (wSheet) {
    let rows = sheetToObjects(wSheet);
    if (branchId) rows = rows.filter(function(r) { return String(r.branch_id || '') === String(branchId); });
    stats.pending_withdrawals = rows.filter(r => r.status === 'pending').length;
    const todayStr = new Date().toDateString();
    stats.completed_today = rows.filter(r => r.status === 'completed' &&
      new Date(r.created_at).toDateString() === todayStr).length;
  }

  const iSheet = getSheet('Imports');
  if (iSheet) {
    let rows = sheetToObjects(iSheet);
    if (branchId) rows = rows.filter(function(r) { return String(r.branch_id || '') === String(branchId); });
    stats.pending_imports = rows.filter(r => r.status === 'pending').length;
    const m = new Date().getMonth(); const y = new Date().getFullYear();
    stats.month_imports = rows.filter(r => {
      const d = new Date(r.order_date); return d.getMonth() === m && d.getFullYear() === y;
    }).length;
  }

  const rSheet = getSheet('Recipients');
  if (rSheet) {
    let rows = sheetToObjects(rSheet);
    if (branchId) rows = rows.filter(function(r) { return String(r.branch_id || '') === String(branchId); });
    stats.total_recipients = rows.filter(r => r.status === 'active').length;
  }

  return { success: true, data: stats };
}

// ---------- Monthly Report ----------
function getMonthlyReport(params) {
  const month    = parseInt(params.month) - 1;
  const year     = parseInt(params.year);
  const branchId = params.branch_id || '';
  const report   = { month: params.month, year: params.year, imports: [], withdrawals: [], stock: [], totals: {} };

  const iSheet = getSheet('Imports');
  if (iSheet) {
    let rows = sheetToObjects(iSheet);
    if (branchId) rows = rows.filter(function(r) { return String(r.branch_id || '') === String(branchId); });
    report.imports = rows.filter(r => {
      const d = new Date(r.order_date); return d.getMonth() === month && d.getFullYear() === year;
    });
    report.imports.forEach(r => { try { r.items = JSON.parse(r.items); } catch (_) { r.items = []; } });
    report.totals.total_import_cost = report.imports.reduce((s, r) => s + parseFloat(r.total_cost || 0), 0);
  }

  const wSheet = getSheet('Withdrawals');
  if (wSheet) {
    let rows = sheetToObjects(wSheet);
    if (branchId) rows = rows.filter(function(r) { return String(r.branch_id || '') === String(branchId); });
    report.withdrawals = rows.filter(r => {
      const d = new Date(r.withdrawal_date || r.created_at);
      return d.getMonth() === month && d.getFullYear() === year && r.status === 'completed';
    });
    report.withdrawals.forEach(r => { try { r.items = JSON.parse(r.items); } catch (_) { r.items = []; } });
    report.totals.total_withdrawal_value = report.withdrawals.reduce((s, r) => s + parseFloat(r.total_value || 0), 0);
  }

  const sSheet = getSheet('Stock');
  if (sSheet) {
    let rows = sheetToObjects(sSheet);
    if (branchId) rows = rows.filter(function(r) { return String(r.branch_id || '') === String(branchId); });
    report.stock = rows;
    report.totals.total_stock_value = rows.reduce((s, r) =>
      s + parseFloat(r.quantity) * parseFloat(r.cost_price), 0);
  }
  return { success: true, data: report };
}
