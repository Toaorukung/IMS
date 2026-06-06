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
    'Recipients':  ['id','name','department','position','phone','email','notes','status','created_at','branch_id'],
    'Expenses':    ['id','date','category','description','amount','branch_id','created_at','created_by'],
    'ExpenseCategories': ['name']
  };

  // Sheets ที่ไม่ต้องมี branch_id
  const NO_BRANCH_ID = new Set(['Tokens', 'ExpenseCategories']);

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
      case 'deleteBranch':           return deleteBranch(p);
      case 'getBranchOverview':      return getBranchOverview();
      case 'getUsers':               return getUsers(p);
      case 'addUser':                return addUser(p);
      case 'updateUser':             return updateUser(p);
      case 'getStockImportHistory':  return getStockImportHistory(p);
      case 'addImportExtraCost':     return addImportExtraCost(p);
      case 'deleteImport':           return deleteImport(p);
      case 'updateImport':           return updateImport(p);
      case 'getExpenses':            return getExpenses(p);
      case 'addExpense':             return addExpense(p);
      case 'updateExpense':          return updateExpense(p);
      case 'deleteExpense':          return deleteExpense(p);
      case 'getExpenseCategories':   return getExpenseCategories();
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

// Fix 6: guard non-superadmin with no branch — empty branchId means "all" only for superadmin
// role param optional; when omitted behaves as before (backward compat for internal callers)
function filterByBranch(rows, branchId, role) {
  if (!branchId) {
    // non-superadmin with no branch → return nothing, not everything
    if (role && role !== 'superadmin') return [];
    return rows;
  }
  return rows.filter(function(r) { return String(r.branch_id || '') === String(branchId); });
}

// ---------- Cache Helpers ----------
function _cacheGet(key) {
  try { var v = CacheService.getScriptCache().get(key); return v ? JSON.parse(v) : null; }
  catch (_) { return null; }
}
function _cachePut(key, value, ttl) {
  try { CacheService.getScriptCache().put(key, JSON.stringify(value), ttl || 300); } catch (_) {}
}
function _cacheRemove(key) {
  try { CacheService.getScriptCache().remove(key); } catch (_) {}
}

// ---------- Auth Gate ----------
// Fix 1: validate token server-side before allowing sensitive operations
// Uses CacheService so repeated calls within the TTL don't re-read sheets
function requireAuth(p, requiredRoles) {
  var token = (p || {}).token || '';
  if (!token) return { ok: false, message: 'กรุณาเข้าสู่ระบบ (token หายไป)' };
  var cacheKey = 'auth_' + token;
  var user = _cacheGet(cacheKey);
  if (!user) {
    var result = validateToken({ token: token });
    if (!result.success) return { ok: false, message: result.message || 'Token ไม่ถูกต้องหรือหมดอายุ' };
    user = result.user;
    _cachePut(cacheKey, user, 300);
  }
  if (requiredRoles && requiredRoles.length && requiredRoles.indexOf(user.role) === -1) {
    return { ok: false, message: 'ไม่มีสิทธิ์ดำเนินการนี้ (ต้องการ: ' + requiredRoles.join('/') + ')' };
  }
  return { ok: true, user: user };
}

// ---------- Branch Lookup ----------
// Fix 4: cache branch names — Branches sheet changes rarely, no need to re-read every validateToken
function getBranchName(branchId) {
  if (!branchId) return '';
  var cacheKey = 'bname_' + branchId;
  var cached = _cacheGet(cacheKey);
  if (cached !== null) return cached;
  var sheet = getSheet('Branches');
  if (!sheet) { _cachePut(cacheKey, branchId, 600); return branchId; }
  var branches = sheetToObjects(sheet);
  var branch = branches.find(function(b) { return b.id === branchId; });
  var name = branch ? (branch.name || branchId) : branchId;
  _cachePut(cacheKey, name, 600); // 10-minute TTL
  return name;
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

// getStock: quantity จาก Stock sheet + cost_price (weighted avg รวม extras) จาก Imports sheet
function getStock(p) {
  var stockSheet = getSheet('Stock');
  if (!stockSheet) return { success: false, message: 'ไม่พบชีท Stock' };
  var branchId = (p || {}).branch_id || '';

  // 1. รวม quantity + metadata จาก Stock lots
  var stockRows = sheetToObjects(stockSheet);
  if (branchId) stockRows = stockRows.filter(function(r) { return String(r.branch_id || '') === String(branchId); });
  var qtyMap = {};
  stockRows.forEach(function(r) {
    var pid = String(r.product_id);
    var qty = parseFloat(r.quantity) || 0;
    if (!qtyMap[pid]) {
      qtyMap[pid] = {
        product_id: pid, product_name: r.product_name || '',
        product_code: r.product_code || '', unit: r.unit || '',
        min_stock: parseFloat(r.min_stock) || 0, branch_id: r.branch_id || '',
        quantity: 0, last_updated: r.last_updated || '',
        _stock_value: 0  // fallback ถ้าไม่มีข้อมูล import
      };
    }
    qtyMap[pid].quantity += qty;
    qtyMap[pid]._stock_value += qty * (parseFloat(r.cost_price) || 0);
    var d1 = new Date(r.last_updated || 0);
    var d2 = new Date(qtyMap[pid].last_updated || 0);
    if (d1 > d2) qtyMap[pid].last_updated = r.last_updated;
  });

  // 2. คำนวณ weighted avg cost (รวม freight + extras) จาก Imports ที่ received แล้ว
  var costMap = {}; // product_id → { total_value, total_qty }
  var importSheet = getSheet('Imports');
  if (importSheet) {
    var importRows = sheetToObjects(importSheet).filter(function(r) { return r.status === 'received'; });
    if (branchId) importRows = importRows.filter(function(r) { return String(r.branch_id || '') === String(branchId); });
    importRows.forEach(function(r) {
      var items = [];
      try { items = JSON.parse(r.items); } catch (_) {}
      var totalQty = items.reduce(function(s, i) { return s + (parseFloat(i.quantity) || 0); }, 0);
      var extraPerUnit = totalQty > 0
        ? ((parseFloat(r.freight_cost) || 0) + (parseFloat(r.additional_costs) || 0)) / totalQty
        : 0;
      items.forEach(function(item) {
        var pid = String(item.product_id);
        var qty = parseFloat(item.quantity) || 0;
        var fullCost = (parseFloat(item.unit_cost) || 0) + extraPerUnit;
        if (!costMap[pid]) costMap[pid] = { total_value: 0, total_qty: 0 };
        costMap[pid].total_value += qty * fullCost;
        costMap[pid].total_qty  += qty;
      });
    });
  }

  // 3. Merge: quantity จาก Stock, cost_price จาก Imports (fallback: Stock lots)
  var result = Object.keys(qtyMap).map(function(pid) {
    var s = qtyMap[pid];
    var c = costMap[pid];
    var cost_price = (c && c.total_qty > 0)
      ? c.total_value / c.total_qty
      : (s.quantity > 0 ? s._stock_value / s.quantity : 0);
    return {
      product_id: pid, product_name: s.product_name, product_code: s.product_code,
      unit: s.unit, min_stock: s.min_stock, branch_id: s.branch_id,
      quantity: s.quantity, cost_price: cost_price, last_updated: s.last_updated
    };
  });

  return { success: true, data: result };
}

// ---------- Imports (Purchase Orders) ----------
// คืน import ทุกรายการที่มีสินค้านี้ เรียงจากใหม่ไปเก่า
function getStockImportHistory(p) {
  const sheet = getSheet('Imports');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Imports' };
  const productId = String((p || {}).product_id || '');
  const branchId  = (p || {}).branch_id || '';
  if (!productId) return { success: false, message: 'ต้องระบุ product_id' };

  let rows = sheetToObjects(sheet);
  rows = filterByBranch(rows, branchId);

  const result = [];
  rows.forEach(function(r) {
    var items = [];
    try { items = JSON.parse(r.items); } catch (_) { items = []; }
    var matchItem = items.find(function(it) { return String(it.product_id) === productId; });
    if (!matchItem) return;

    // คำนวณ extraPerUnit จาก record (freight + additional / จำนวนทุก item)
    // ใช้ได้ทั้ง import เก่าและใหม่ เพราะ items.unit_cost เก็บแค่ฐาน (¥×rate) เสมอ
    var totalQty = items.reduce(function(s, i) { return s + (parseFloat(i.quantity) || 0); }, 0);
    var freight  = parseFloat(r.freight_cost || 0);
    var addCosts = parseFloat(r.additional_costs || 0);
    var extraPerUnit = (r.status === 'received' && totalQty > 0) ? (freight + addCosts) / totalQty : 0;

    result.push({
      import_id:  r.id,
      order_date: r.order_date,
      supplier:   r.supplier,
      status:     r.status,
      quantity:   parseFloat(matchItem.quantity) || 0,
      unit_cost:  (parseFloat(matchItem.unit_cost || matchItem.cost_price) || 0) + extraPerUnit,
      created_at: r.created_at
    });
  });

  result.sort(function(a, b) {
    return new Date(b.order_date || b.created_at) - new Date(a.order_date || a.created_at);
  });

  return { success: true, data: result };
}

// เพิ่มต้นทุนแฝงให้ล็อตสินค้าที่รับมาแล้ว — แจกจ่าย extraPerUnit ไปยัง stock lots ที่เหลือ
function addImportExtraCost(p) {
  var auth = requireAuth(p, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };

  var importId  = String((p || {}).import_id  || '');
  var productId = String((p || {}).product_id || '');
  var amount    = parseFloat((p || {}).amount) || 0;
  var note      = (p || {}).note || '';

  if (!importId || !productId) return { success: false, message: 'ต้องระบุ import_id และ product_id' };
  if (amount <= 0) return { success: false, message: 'ยอดเงินต้องมากกว่า 0' };

  // ตรวจ import record
  var impSheet = getSheet('Imports');
  if (!impSheet) return { success: false, message: 'ไม่พบชีท Imports' };
  var importRecord = sheetToObjects(impSheet).find(function(r) { return r.id === importId; });
  if (!importRecord) return { success: false, message: 'ไม่พบรายการนำเข้า' };
  if (importRecord.status !== 'received')
    return { success: false, message: 'สามารถเพิ่มต้นทุนได้เฉพาะรายการที่รับสินค้าแล้ว (received)' };

  // หาจำนวนต้นฉบับจาก items
  var items = [];
  try { items = JSON.parse(importRecord.items); } catch (_) {}
  var matchItem = items.find(function(it) { return String(it.product_id) === productId; });
  if (!matchItem) return { success: false, message: 'ไม่พบสินค้านี้ในรายการนำเข้า' };

  var origQty = parseFloat(matchItem.quantity) || 0;
  if (origQty <= 0) return { success: false, message: 'จำนวนสินค้าในล็อตนี้เป็น 0' };

  var extraPerUnit = amount / origQty;

  // อัพเดท cost_price ของ stock lots ที่ยังมีสินค้าเหลือ
  var stockSheet = getSheet('Stock');
  if (!stockSheet || stockSheet.getLastRow() < 2)
    return { success: false, message: 'ไม่พบข้อมูลสต็อค' };

  var stockHdrs  = stockSheet.getRange(1, 1, 1, stockSheet.getLastColumn()).getValues()[0];
  var costCol    = stockHdrs.indexOf('cost_price') + 1;
  var updatedCol = stockHdrs.indexOf('last_updated') + 1;
  if (costCol === 0) return { success: false, message: 'ไม่พบคอลัมน์ cost_price ใน Stock' };

  var stockRows    = sheetToObjects(stockSheet);
  var updatedLots  = 0;
  var updatedUnits = 0;

  stockRows.forEach(function(row, i) {
    if (String(row.product_id) !== productId) return;
    var qty = parseFloat(row.quantity) || 0;
    if (qty <= 0) return; // ล็อตที่ถูกเบิกหมดแล้ว
    var newCost = (parseFloat(row.cost_price) || 0) + extraPerUnit;
    stockSheet.getRange(i + 2, costCol).setValue(newCost);
    if (updatedCol > 0) stockSheet.getRange(i + 2, updatedCol).setValue(now());
    updatedLots++;
    updatedUnits += qty;
  });

  if (updatedLots === 0)
    return { success: false, message: 'สินค้านี้ถูกเบิกออกหมดแล้ว ไม่มีสต็อคคงเหลือที่จะอัพเดท' };

  return {
    success: true,
    updated_lots: updatedLots,
    updated_units: updatedUnits,
    extra_per_unit: extraPerUnit,
    message: 'อัพเดทต้นทุนสำเร็จ ' + updatedLots + ' ล็อต (+' + extraPerUnit.toFixed(2) + ' ฿/ชิ้น)'
  };
}

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

function deleteImport(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Imports');
  if (!sheet) return { success: false };
  const rows = sheetToObjects(sheet);
  const idx  = rows.findIndex(function(r) { return r.id === data.id; });
  if (idx === -1) return { success: false, message: 'ไม่พบรายการ' };
  if (rows[idx].status === 'received') return { success: false, message: 'ไม่สามารถลบรายการที่รับสินค้าแล้ว' };
  sheet.deleteRow(idx + 2);
  return { success: true, message: 'ลบรายการสำเร็จ' };
}

function updateImport(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Imports');
  if (!sheet) return { success: false };
  const rows   = sheetToObjects(sheet);
  const record = rows.find(function(r) { return r.id === data.id; });
  if (!record) return { success: false, message: 'ไม่พบรายการ' };
  if (record.status === 'received') return { success: false, message: 'ไม่สามารถแก้ไขรายการที่รับสินค้าแล้ว' };
  const rate    = parseFloat(data.exchange_rate) || parseFloat(record.exchange_rate) || 1;
  const items   = (data.items || []).map(function(item) {
    return { product_id: item.product_id, product_name: item.product_name,
             quantity: item.quantity, unit_price_yuan: item.unit_price_yuan,
             unit_cost: (parseFloat(item.unit_price_yuan) || 0) * rate };
  });
  const yuanAmt = (data.items || []).reduce(function(s, i) {
    return s + (parseFloat(i.unit_price_yuan) || 0) * (parseFloat(i.quantity) || 0);
  }, 0);
  const baseTHB = yuanAmt * rate;
  updateRow(sheet, data.id, {
    supplier:      data.supplier,
    order_date:    data.order_date,
    exchange_rate: rate,
    yuan_amount:   yuanAmt,
    base_cost_thb: baseTHB,
    total_cost:    baseTHB,
    items:         JSON.stringify(items),
    notes:         data.notes !== undefined ? data.notes : (record.notes || '')
  });
  return { success: true, message: 'อัพเดทรายการสำเร็จ' };
}

function updateImportStatus(data) {
  const sheet = getSheet('Imports');
  if (!sheet) return { success: false };
  const rows   = sheetToObjects(sheet);
  const record = rows.find(r => r.id === data.id);
  if (!record) return { success: false, message: 'ไม่พบการสั่งซื้อ' };

  const updates = { status: data.status };

  if (data.import_costs) {
    const costs   = data.import_costs;
    const addCosts = (parseFloat(costs.customs_duty)  || 0) +
                     (parseFloat(costs.clearance_fee) || 0) +
                     (parseFloat(costs.transport_fee) || 0) +
                     (parseFloat(costs.warehouse_fee) || 0) +
                     (parseFloat(costs.vat)           || 0);
    updates.import_costs     = JSON.stringify(costs);
    updates.additional_costs = addCosts;

    const baseTHB   = parseFloat(record.base_cost_thb) || 0;
    const newFreight = data.freight_cost !== undefined
      ? (parseFloat(data.freight_cost) || 0)
      : (parseFloat(record.freight_cost) || 0);
    if (data.freight_cost !== undefined) updates.freight_cost = newFreight;
    updates.total_cost = baseTHB + newFreight + addCosts;
  }

  updateRow(sheet, data.id, updates);

  if (data.status === 'received') {
    let items = [];
    try { items = JSON.parse(record.items); } catch (_) {}
    const branchId = record.branch_id || '';

    // กระจายต้นทุนนำเข้า (freight + customs + clearance + transport + warehouse + vat)
    // หารเท่าๆ กันต่อชิ้น ทุก item ในล็อตนี้
    const freight  = parseFloat(updates.freight_cost      !== undefined ? updates.freight_cost      : record.freight_cost)      || 0;
    const addCosts = parseFloat(updates.additional_costs  !== undefined ? updates.additional_costs  : record.additional_costs)  || 0;
    const totalQty = items.reduce(function(s, i) { return s + (parseFloat(i.quantity) || 0); }, 0);
    const extraPerUnit = totalQty > 0 ? (freight + addCosts) / totalQty : 0;

    // items JSON เก็บ unit_cost ฐาน (¥×rate) เสมอ ไม่แตะ
    // stock lot ได้ต้นทุนเต็ม (รวม extras) ตอน addStockLot
    items.forEach(function(item) {
      const unitCost = (parseFloat(item.unit_cost) || 0) + extraPerUnit;
      addStockLot(item.product_id, parseFloat(item.quantity), unitCost, branchId);
    });
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
  // Fix 2: "'" + (data.phone || '') — parens required, otherwise "'" + undefined → "'undefined"
  sheet.appendRow([id, data.name, data.department || '', data.position || '',
    "'" + (data.phone || ''), data.email || '', data.notes || '', 'active', now(), branchId]);
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
  const auth = requireAuth(p, ['superadmin', 'admin']);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Users');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Users' };
  // ใช้ role/branch จาก server (token-verified) ไม่ใช่จาก request body
  const requesterRole   = auth.user.role;
  const requesterBranch = auth.user.branch_id || '';
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
  const auth = requireAuth(data, ['superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
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
  const auth = requireAuth(data, ['superadmin', 'admin']);
  if (!auth.ok) return { success: false, message: auth.message };
  // admin สาขาแก้ได้เฉพาะ user ในสาขาตัวเอง และไม่สามารถเปลี่ยน role เป็น superadmin
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
  const auth = requireAuth(data, ['superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Branches');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Branches กรุณาสร้างชีทในกูเกิลชีทก่อน' };
  const id = uid('BRN');
  sheet.appendRow([id, data.name || '', data.address || '', data.phone || '', now(), 'active']);
  return { success: true, id, message: 'เพิ่มสาขาสำเร็จ' };
}

function updateBranch(data) {
  const auth = requireAuth(data, ['superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Branches');
  if (!sheet) return { success: false };
  const ok = updateRow(sheet, data.id, data);
  return { success: ok, message: ok ? 'อัพเดทสำเร็จ' : 'ไม่พบสาขา' };
}

function deleteBranch(data) {
  const auth = requireAuth(data, ['superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Branches');
  if (!sheet) return { success: false };
  // ตรวจว่ายังมี user อยู่ในสาขานี้ไหม
  const userSheet = getSheet('Users');
  if (userSheet) {
    const users = sheetToObjects(userSheet).filter(function(u) {
      return String(u.branch_id) === String(data.id) && u.status === 'active';
    });
    if (users.length > 0) {
      return { success: false, message: 'ไม่สามารถลบได้ ยังมีผู้ใช้งาน ' + users.length + ' คนอยู่ในสาขานี้' };
    }
  }
  const ok = updateRow(sheet, data.id, { status: 'inactive' });
  return { success: ok, message: ok ? 'ลบสาขาสำเร็จ' : 'ไม่พบสาขา' };
}

// Fix 3: read each sheet once, aggregate per-branch in memory — O(4) reads not O(4N)
function getBranchOverview() {
  const branches = getBranches().data || [];
  if (!branches.length) return { success: true, data: [] };

  const stockRows = sheetToObjects(getSheet('Stock'))       || [];
  const wRows     = sheetToObjects(getSheet('Withdrawals')) || [];
  const iRows     = sheetToObjects(getSheet('Imports'))     || [];
  const todayStr  = new Date().toDateString();
  const m = new Date().getMonth();
  const y = new Date().getFullYear();

  const result = branches.map(function(branch) {
    const bid = branch.id;

    // Stock aggregation
    const stockFiltered = stockRows.filter(function(r) { return String(r.branch_id || '') === bid; });
    const stockMap = {};
    stockFiltered.forEach(function(r) {
      var pid = String(r.product_id);
      var qty = parseFloat(r.quantity) || 0;
      if (!stockMap[pid]) stockMap[pid] = { quantity: 0, min_stock: parseFloat(r.min_stock) || 0, total_value: 0 };
      stockMap[pid].quantity    += qty;
      stockMap[pid].total_value += qty * (parseFloat(r.cost_price) || 0);
    });
    const agg = Object.values(stockMap);
    const total_products    = agg.length;
    const total_stock_value = agg.reduce(function(s, p) { return s + p.total_value; }, 0);
    const total_stock_units = agg.reduce(function(s, p) { return s + p.quantity; }, 0);
    const low_stock_items   = agg.filter(function(p) { return p.min_stock > 0 && p.quantity <= p.min_stock; }).length;

    // Withdrawal stats
    const wFiltered = wRows.filter(function(r) { return String(r.branch_id || '') === bid; });
    const pending_withdrawals = wFiltered.filter(function(r) { return r.status === 'pending'; }).length;
    const completed_today     = wFiltered.filter(function(r) {
      return r.status === 'completed' && new Date(r.created_at).toDateString() === todayStr;
    }).length;

    // Import stats
    const month_imports = iRows.filter(function(r) {
      if (String(r.branch_id || '') !== bid) return false;
      var d = new Date(r.order_date);
      return d.getMonth() === m && d.getFullYear() === y;
    }).length;

    return {
      id: bid, name: branch.name,
      address: branch.address || '', phone: branch.phone || '',
      total_products, total_stock_value, total_stock_units,
      low_stock_items, pending_withdrawals, completed_today, month_imports
    };
  });
  return { success: true, data: result };
}

// ---------- Dashboard Stats ----------
function getDashboardStats(p) {
  const branchId = (p || {}).branch_id || '';
  const stats = { total_products: 0, low_stock_items: 0, total_stock_value: 0, total_stock_units: 0,
    pending_withdrawals: 0, completed_today: 0, month_imports: 0, pending_imports: 0, total_recipients: 0 };

  // Fix 5: use filterByBranch consistently (was inlining the same logic 4 times)
  const stockSheet = getSheet('Stock');
  if (stockSheet) {
    const rows = filterByBranch(sheetToObjects(stockSheet), branchId);
    const stockMap = {};
    rows.forEach(function(r) {
      const pid = String(r.product_id);
      const qty = parseFloat(r.quantity) || 0;
      if (!stockMap[pid]) stockMap[pid] = { quantity: 0, min_stock: parseFloat(r.min_stock) || 0, total_value: 0 };
      stockMap[pid].quantity    += qty;
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
    const rows = filterByBranch(sheetToObjects(wSheet), branchId);
    stats.pending_withdrawals = rows.filter(r => r.status === 'pending').length;
    const todayStr = new Date().toDateString();
    stats.completed_today = rows.filter(r => r.status === 'completed' &&
      new Date(r.created_at).toDateString() === todayStr).length;
  }

  const iSheet = getSheet('Imports');
  if (iSheet) {
    const rows = filterByBranch(sheetToObjects(iSheet), branchId);
    stats.pending_imports = rows.filter(r => r.status === 'pending').length;
    const m = new Date().getMonth(); const y = new Date().getFullYear();
    stats.month_imports = rows.filter(r => {
      const d = new Date(r.order_date); return d.getMonth() === m && d.getFullYear() === y;
    }).length;
  }

  const rSheet = getSheet('Recipients');
  if (rSheet) {
    const rows = filterByBranch(sheetToObjects(rSheet), branchId);
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

  const expSheet = getSheet('Expenses');
  report.expenses = [];
  report.totals.total_expenses = 0;
  if (expSheet) {
    let rows = sheetToObjects(expSheet);
    if (branchId) rows = rows.filter(function(r) { return String(r.branch_id || '') === String(branchId); });
    report.expenses = rows.filter(function(r) {
      const d = new Date(r.date);
      return d.getMonth() === month && d.getFullYear() === year;
    });
    report.totals.total_expenses = report.expenses.reduce(function(s, r) { return s + (parseFloat(r.amount) || 0); }, 0);
  }

  return { success: true, data: report };
}

// ---------- Expenses ----------
function getExpenses(p) {
  var sheet = getSheet('Expenses');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Expenses' };
  var branchId = (p || {}).branch_id || '';
  var month    = parseInt((p || {}).month);
  var year     = parseInt((p || {}).year);
  var rows     = sheetToObjects(sheet);
  rows = filterByBranch(rows, branchId);
  if (!isNaN(month) && !isNaN(year)) {
    rows = rows.filter(function(r) {
      var d = new Date(r.date);
      return d.getMonth() === month - 1 && d.getFullYear() === year;
    });
  }
  return { success: true, data: rows };
}

function addExpense(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  var sheet = getSheet('Expenses');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Expenses กรุณารัน setupAllSheets() ก่อน' };
  var id       = uid('EXP');
  var branchId = data.branch_id || auth.user.branch_id || '';
  sheet.appendRow([id, data.date || now().split('T')[0], data.category || '',
    data.description || '', parseFloat(data.amount) || 0, branchId, now(), auth.user.username || '']);
  return { success: true, id, message: 'บันทึกค่าใช้จ่ายสำเร็จ' };
}

function updateExpense(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  var sheet = getSheet('Expenses');
  if (!sheet) return { success: false };
  var ok = updateRow(sheet, data.id, {
    date:        data.date,
    category:    data.category,
    description: data.description,
    amount:      parseFloat(data.amount) || 0
  });
  return { success: ok, message: ok ? 'อัพเดทสำเร็จ' : 'ไม่พบรายการ' };
}

function deleteExpense(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  var sheet = getSheet('Expenses');
  if (!sheet) return { success: false };
  var rows = sheetToObjects(sheet);
  var idx  = rows.findIndex(function(r) { return r.id === data.id; });
  if (idx === -1) return { success: false, message: 'ไม่พบรายการ' };
  sheet.deleteRow(idx + 2);
  return { success: true, message: 'ลบรายการสำเร็จ' };
}

function getExpenseCategories() {
  var sheet = getSheet('ExpenseCategories');
  if (!sheet) return { success: true, data: [] };
  var rows = sheetToObjects(sheet);
  var names = rows.map(function(r) { return String(r.name || '').trim(); }).filter(Boolean);
  return { success: true, data: names };
}
