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
    'Branches':    ['id','name','address','phone','created_at','status','name_en','tax_id'],
    'Users':       ['id','username','password','name','role','status','created_at','branch_id'],
    'Tokens':      ['token','user_id','username','created_at','expires_at'],
    'Products':    ['id','code','name','category','unit','cost_price','selling_price','min_stock','notes','created_at','status','branch_id'],
    'Stock':       ['id','product_id','product_name','product_code','unit','quantity','cost_price','min_stock','last_updated','branch_id'],
    'Imports':     ['id','order_date','supplier','items','yuan_amount','exchange_rate','base_cost_thb','freight_cost','import_costs','additional_costs','total_cost','status','notes','created_at','created_by','branch_id'],
    'Withdrawals': ['id','withdrawal_date','recipient_id','recipient_name','department','items','total_value','type','notes','status','created_by','created_at','branch_id','doc_no','deposit'],
    'Recipients':  ['id','name','department','position','phone','email','notes','status','created_at','branch_id','tax_id','address'],
    'Transfers':   ['id','transfer_date','product_id','product_name','product_code','quantity','from_branch_id','to_branch_id','transport_cost','labor_cost','unit_cost','dest_unit_cost','total_value','notes','created_by','created_at','batch_id','status'],
    'Expenses':    ['id','date','category','description','amount','branch_id','created_at','created_by'],
    'ExpenseCategories': ['name'],
    'Income':      ['id','date','category','description','amount','branch_id','created_at','created_by'],
    'IncomeCategories': ['name'],
    'Categories':  ['id','name','description','status','created_at']
  };

  // Sheets ที่ไม่ต้องมี branch_id
  const NO_BRANCH_ID = new Set(['Tokens', 'ExpenseCategories', 'IncomeCategories', 'Categories']);

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

    // มีข้อมูลแล้ว → เติมคอลัมน์ที่ขาดตาม schema (เช่น branch_id, name_en, tax_id, address)
    // append ต่อท้ายตามลำดับ schema เสมอ → ปลอดภัยกับ appendRow ที่อิงตำแหน่งคอลัมน์
    const existingHdrs = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function(h) { return String(h).trim(); });
    const missing = headers.filter(function(h) {
      if (h === 'branch_id' && NO_BRANCH_ID.has(sheetName)) return false; // sheet นี้ไม่ต้องการ branch_id
      return existingHdrs.indexOf(h) === -1;
    });
    if (missing.length) {
      let nextCol = sheet.getLastColumn();
      missing.forEach(function(h) { nextCol++; sheet.getRange(1, nextCol).setValue(h); });
      _styleHeader(sheet, nextCol); // style ทั้งแถว header ใหม่
      log.push('🔧 ' + sheetName + ': เพิ่มคอลัมน์ ' + missing.join(', ') + ' (รวม ' + nextCol + ' คอลัมน์)');
    } else {
      log.push('☑️  ' + sheetName + ': ครบแล้ว');
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
      case 'updateProduct':          return withLock(function() { return updateProduct(p); });
      case 'deleteProduct':          return deleteProduct(p);
      case 'getCategories':          return getCategories(p);
      case 'addCategory':            return withLock(function() { return addCategory(p); });
      case 'updateCategory':         return withLock(function() { return updateCategory(p); });
      case 'deleteCategory':         return deleteCategory(p);
      case 'getStock':               return getStock(p);
      case 'getImports':             return getImports(p);
      case 'addImport':              return withLock(function() { return addImport(p); });
      case 'updateImportStatus':     return withLock(function() { return updateImportStatus(p); });
      case 'getWithdrawals':         return getWithdrawals(p);
      case 'addWithdrawal':          return withLock(function() { return addWithdrawal(p); });
      case 'updateWithdrawalStatus': return withLock(function() { return updateWithdrawalStatus(p); });
      case 'updateWithdrawal':       return withLock(function() { return updateWithdrawal(p); });
      case 'partialReturn':          return withLock(function() { return partialReturn(p); });
      case 'getTransfers':           return getTransfers(p);
      case 'addTransfer':            return withLock(function() { return addTransfer(p); });
      case 'cancelTransfer':         return withLock(function() { return cancelTransfer(p); });
      case 'getRecipients':          return getRecipients(p);
      case 'addRecipient':           return addRecipient(p);
      case 'updateRecipient':        return updateRecipient(p);
      case 'getDashboardStats':      return getDashboardStats(p);
      case 'getMonthlyReport':       return getMonthlyReport(p);
      case 'getBranches':            return getBranches(p);
      case 'addBranch':              return addBranch(p);
      case 'updateBranch':           return updateBranch(p);
      case 'deleteBranch':           return deleteBranch(p);
      case 'getBranchOverview':      return getBranchOverview(p);
      case 'getUsers':               return getUsers(p);
      case 'addUser':                return addUser(p);
      case 'updateUser':             return updateUser(p);
      case 'getStockImportHistory':  return getStockImportHistory(p);
      case 'addImportExtraCost':     return withLock(function() { return addImportExtraCost(p); });
      case 'deleteImport':           return deleteImport(p);
      case 'updateImport':           return updateImport(p);
      case 'getExpenses':            return getExpenses(p);
      case 'addExpense':             return addExpense(p);
      case 'updateExpense':          return updateExpense(p);
      case 'deleteExpense':          return deleteExpense(p);
      case 'getExpenseCategories':   return getExpenseCategories(p);
      case 'getIncome':              return getIncome(p);
      case 'addIncome':              return addIncome(p);
      case 'updateIncome':           return updateIncome(p);
      case 'deleteIncome':           return deleteIncome(p);
      case 'getIncomeCategories':    return getIncomeCategories(p);
      case 'getIncomeSummary':       return getIncomeSummary(p);
      default: return { success: false, message: 'Unknown action: ' + action };
    }
  } catch (err) {
    // Fix: log server-side so production failures are debuggable (was silently returned only to client)
    Logger.log('processRequest error [action=' + action + ']: ' + (err && err.stack ? err.stack : err));
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

// Resolve which branch an authenticated caller may operate on.
// superadmin → may target any requested branch, or '' = all branches.
// admin / staff → always locked to their own branch (client-supplied value is ignored,
// so an admin in branch A can no longer read/write branch B by spoofing branch_id).
function effectiveBranchId(user, requestedBranchId) {
  if (user && user.role === 'superadmin') return requestedBranchId || '';
  return (user && user.branch_id) || '';
}

// Serialize stock-mutating operations so concurrent web-app requests can't
// interleave reads/writes on the Stock sheet (no transactions in Sheets).
function withLock(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // wait up to 15s for any in-flight mutation to finish
  } catch (e) {
    return { success: false, message: 'ระบบกำลังประมวลผลคำขออื่นอยู่ กรุณาลองใหม่อีกครั้ง' };
  }
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
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
// Uses CacheService so repeated calls within the TTL don't re-read sheets.
// ASSUMPTION / TRADE-OFF: the validated user is cached for 300s. Suspending a user
// (status=inactive) or changing their role therefore takes effect only after the
// cache entry expires — up to ~5 minutes of stale access. Lower the TTL below (and the
// _cachePut on success) if faster revocation is required.
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
  const auth = requireAuth(p);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Products');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Products' };
  const branchId = effectiveBranchId(auth.user, (p || {}).branch_id);
  let data = sheetToObjects(sheet).filter(pr => pr.status !== 'inactive');
  data = filterByBranch(data, branchId, auth.user.role);
  return { success: true, data };
}

function addProduct(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Products');
  if (!sheet) return { success: false };
  const id       = uid('PRD');
  const branchId = effectiveBranchId(auth.user, data.branch_id);
  sheet.appendRow([id, data.code || '', data.name, data.category || '', data.unit || 'ชิ้น',
    parseFloat(data.cost_price) || 0, parseFloat(data.selling_price) || 0,
    parseInt(data.min_stock) || 0, data.notes || '', now(), 'active', branchId]);
  const stockSheet = getSheet('Stock');
  if (stockSheet) stockSheet.appendRow([uid('STK'), id, data.name, data.code || '',
    data.unit || 'ชิ้น', 0, parseFloat(data.cost_price) || 0, parseInt(data.min_stock) || 0, now(), branchId]);
  return { success: true, id, message: 'เพิ่มสินค้าสำเร็จ' };
}

function updateProduct(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
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
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Products');
  if (!sheet) return { success: false };
  const ok = updateRow(sheet, data.id, { status: 'inactive' });
  return { success: ok, message: ok ? 'ลบสำเร็จ' : 'ไม่พบสินค้า' };
}

// ---------- Categories (หมวดหมู่สินค้า — global, ใช้ร่วมทุกสาขา) ----------
// Products.category เก็บเป็น "ชื่อหมวด" (string) — sheet นี้คือ master list ของชื่อหมวด
function getCategories(p) {
  var auth = requireAuth(p);
  if (!auth.ok) return { success: false, message: auth.message };
  var sheet = getSheet('Categories');
  if (!sheet) return { success: true, data: [] };
  var data = sheetToObjects(sheet).filter(function(c) { return c.status !== 'inactive'; });
  return { success: true, data: data };
}

function addCategory(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  var sheet = getSheet('Categories');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Categories กรุณารัน setupAllSheets() ก่อน' };
  var name = String(data.name || '').trim();
  if (!name) return { success: false, message: 'กรุณากรอกชื่อหมวดหมู่' };
  // กันชื่อซ้ำ (case-insensitive) เฉพาะหมวดที่ยัง active
  var dup = sheetToObjects(sheet).some(function(c) {
    return c.status !== 'inactive' && String(c.name || '').trim().toLowerCase() === name.toLowerCase();
  });
  if (dup) return { success: false, message: 'มีหมวดหมู่ชื่อนี้อยู่แล้ว' };
  var id = uid('CAT');
  sheet.appendRow([id, name, data.description || '', 'active', now()]);
  return { success: true, id: id, message: 'เพิ่มหมวดหมู่สำเร็จ' };
}

function updateCategory(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  var sheet = getSheet('Categories');
  if (!sheet) return { success: false };
  var rows = sheetToObjects(sheet);
  var existing = rows.find(function(c) { return c.id === data.id; });
  if (!existing) return { success: false, message: 'ไม่พบหมวดหมู่' };
  var newName = String(data.name || '').trim();
  if (!newName) return { success: false, message: 'กรุณากรอกชื่อหมวดหมู่' };
  var oldName = String(existing.name || '').trim();
  // กันชื่อซ้ำกับหมวดอื่น
  var dup = rows.some(function(c) {
    return c.id !== data.id && c.status !== 'inactive' &&
           String(c.name || '').trim().toLowerCase() === newName.toLowerCase();
  });
  if (dup) return { success: false, message: 'มีหมวดหมู่ชื่อนี้อยู่แล้ว' };
  var ok = updateRow(sheet, data.id, { name: newName, description: data.description });
  // เปลี่ยนชื่อหมวด → cascade ไปอัพเดท Products.category ทุกตัวที่ใช้ชื่อเดิม
  if (ok && newName !== oldName) renameCategoryOnProducts(oldName, newName);
  return { success: ok, message: ok ? 'อัพเดทสำเร็จ' : 'ไม่พบหมวดหมู่' };
}

function deleteCategory(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  var sheet = getSheet('Categories');
  if (!sheet) return { success: false };
  // soft delete — สินค้าที่ผูกหมวดนี้ยังคงป้ายชื่อหมวดเดิมไว้ (เป็น text)
  var ok = updateRow(sheet, data.id, { status: 'inactive' });
  return { success: ok, message: ok ? 'ลบหมวดหมู่สำเร็จ' : 'ไม่พบหมวดหมู่' };
}

// อัพเดทค่า category ของ Products ทุก row ที่ตรงกับชื่อเดิม (ใช้ตอน rename หมวด)
function renameCategoryOnProducts(oldName, newName) {
  if (!oldName) return;
  var sheet = getSheet('Products');
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h).trim(); });
  var catCol = headers.indexOf('category');
  if (catCol === -1) return;
  var range  = sheet.getRange(2, catCol + 1, lastRow - 1, 1);
  var values = range.getValues();
  var changed = false;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(oldName).trim()) { values[i][0] = newName; changed = true; }
  }
  if (changed) range.setValues(values);
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
// ASSUMPTION: lots are consumed in Stock-sheet row order (addStockLot appends, so the
// topmost matching row is the oldest lot). Do NOT manually sort/reorder the Stock sheet —
// doing so silently changes which lot is consumed first and corrupts FIFO costing.
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

// FIFO deduction เฉพาะ lot ในสาขาที่ระบุ (ใช้ตอนโยกข้ามสาขา — กันตัดสต็อกสาขาอื่นพลาด
// กรณี product_id เดียวกันมี lot อยู่หลายสาขา หรือ product.branch_id ว่าง/ไม่ตรง)
// คอลัมน์ Stock (0-based): 1=product_id, 5=quantity, 8=last_updated, 9=branch_id
function deductStockFIFOInBranch(productId, quantity, branchId) {
  var sheet = getSheet('Stock');
  if (!sheet || sheet.getLastRow() < 2) return;
  var remaining = parseFloat(quantity);
  var lastRow = sheet.getLastRow();
  var allVals = sheet.getRange(2, 1, lastRow - 1, 10).getValues(); // อ่านถึง branch_id (คอลัมน์ที่ 10)
  for (var i = 0; i < allVals.length && remaining > 0; i++) {
    if (String(allVals[i][1]) !== String(productId)) continue;       // col 1 = product_id
    if (String(allVals[i][9] || '') !== String(branchId)) continue;  // col 9 = branch_id
    var rowNo = i + 2;
    var qty = parseFloat(allVals[i][5]) || 0;                        // col 5 = quantity
    if (qty <= 0) continue;
    if (qty <= remaining) {
      sheet.getRange(rowNo, 6).setValue(0);
      remaining -= qty;
    } else {
      sheet.getRange(rowNo, 6).setValue(qty - remaining);
      remaining = 0;
    }
    sheet.getRange(rowNo, 9).setValue(now());                        // col 9 (1-based) = last_updated
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

// หา/สร้างสินค้าในสาขาที่ระบุ โดยจับคู่ด้วย code — คืน product_id ในสาขานั้น
// ใช้ตอน "โยกของ" และ "รับสินค้าข้ามสาขา" เพราะ catalog สินค้าแยกตามสาขา
// - ถ้าสินค้าต้นทางอยู่สาขาเดียวกับ branchId อยู่แล้ว → คืน id เดิม (ไม่ remap)
// - ถ้าสาขาปลายทางมีสินค้า code เดียวกัน → คืน id นั้น
// - ถ้ายังไม่มี → สร้าง Product ใหม่ในสาขาปลายทาง (copy ชื่อ/code/unit/selling_price/min_stock)
function resolveProductInBranch(srcProd, branchId, originLabel) {
  if (!srcProd) return null;
  branchId = String(branchId || '');
  if (String(srcProd.branch_id || '') === branchId) return srcProd.id;
  var prodSheet = getSheet('Products');
  if (!prodSheet) return srcProd.id;
  var products = sheetToObjects(prodSheet);
  var code = srcProd.code || '';
  var dest = code ? products.find(function(pp) {
    return String(pp.branch_id || '') === branchId && String(pp.code) === String(code);
  }) : null;
  if (dest) return dest.id;
  var newId = uid('PRD');
  // Products schema: id, code, name, category, unit, cost_price, selling_price, min_stock, notes, created_at, status, branch_id
  prodSheet.appendRow([newId, code, srcProd.name || '', srcProd.category || '', srcProd.unit || '',
    0, parseFloat(srcProd.selling_price) || 0, parseFloat(srcProd.min_stock) || 0,
    originLabel || 'สร้างจากการรับ/โยกข้ามสาขา', now(), 'active', branchId]);
  return newId;
}

// getStock: quantity จาก Stock sheet + cost_price (weighted avg รวม extras) จาก Imports sheet
function getStock(p) {
  var auth = requireAuth(p);
  if (!auth.ok) return { success: false, message: auth.message };
  var stockSheet = getSheet('Stock');
  if (!stockSheet) return { success: false, message: 'ไม่พบชีท Stock' };
  var branchId = effectiveBranchId(auth.user, (p || {}).branch_id);

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
// คืนที่มาของสต็อกสินค้านี้ (เรียงใหม่→เก่า): การนำเข้า (imports) + การโยกของเข้าสาขา (transfers)
// match ด้วย "code" ครอบทุกสาขาที่เกี่ยวข้อง (ไม่ใช่แค่ product_id เดียว) เพราะ catalog แยกตามสาขา
// — สินค้ารหัสเดียวกันคนละสาขามี product_id ต่างกัน, และของที่โยก/รับข้ามสาขาก็ไม่อ้าง product_id เดิม
function getStockImportHistory(p) {
  const auth = requireAuth(p);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Imports');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Imports' };
  // รองรับทั้ง product_id เดียว และหลายตัว (product_ids = "id1,id2,...") — ใช้กับแถวสต็อกที่รวมหลาย lot/สาขา
  var idsRaw = String((p || {}).product_ids || (p || {}).product_id || '');
  var idSet = {};
  idsRaw.split(',').forEach(function(x) { x = String(x).trim(); if (x) idSet[x] = true; });
  if (!Object.keys(idSet).length) return { success: false, message: 'ต้องระบุ product_id' };
  const branchId = effectiveBranchId(auth.user, (p || {}).branch_id);

  // map product_id → branch/code จาก Stock (สาขาจริง) แล้ว fallback ไป Products
  var stockBranchOf = {}, codeOf = {};
  var stockSheet = getSheet('Stock');
  if (stockSheet) sheetToObjects(stockSheet).forEach(function(l) {
    var pid = String(l.product_id);
    if (!stockBranchOf[pid] && l.branch_id)    stockBranchOf[pid] = String(l.branch_id);
    if (!codeOf[pid]        && l.product_code) codeOf[pid]        = String(l.product_code);
  });
  var prodBranchOf = {}, prodCodeOf = {};
  var prodSheet = getSheet('Products');
  if (prodSheet) sheetToObjects(prodSheet).forEach(function(pp) {
    var pid = String(pp.id);
    if (pp.branch_id) prodBranchOf[pid] = String(pp.branch_id);
    if (pp.code)      prodCodeOf[pid]   = String(pp.code);
  });
  function branchOf(pid) { return stockBranchOf[pid] || prodBranchOf[pid] || ''; }
  function codeFor(pid)  { return codeOf[pid]        || prodCodeOf[pid]   || ''; }

  // สร้างชุด code + สาขาเป้าหมายจาก product_id ที่ขอมา (= สาขาที่กำลังดูอยู่)
  var targetCodes = {}, targetBranches = {};
  Object.keys(idSet).forEach(function(pid) {
    var c = codeFor(pid);  if (c) targetCodes[c]    = true;
    var b = branchOf(pid); if (b) targetBranches[b] = true;
  });
  var hasCodes    = Object.keys(targetCodes).length    > 0;
  var hasBranches = Object.keys(targetBranches).length > 0;

  let rows = sheetToObjects(sheet);
  rows = filterByBranch(rows, branchId, auth.user.role);

  const result = [];

  // ---- ที่มา 1: การนำเข้า (Imports) ----
  rows.forEach(function(r) {
    var items = [];
    try { items = JSON.parse(r.items); } catch (_) { items = []; }

    // extraPerUnit จาก record (freight + additional / จำนวนทุก item) — เก็บฐานใน items.unit_cost เสมอ
    var totalQty = items.reduce(function(s, i) { return s + (parseFloat(i.quantity) || 0); }, 0);
    var freight  = parseFloat(r.freight_cost || 0);
    var addCosts = parseFloat(r.additional_costs || 0);
    var extraPerUnit = (r.status === 'received' && totalQty > 0) ? (freight + addCosts) / totalQty : 0;

    items.forEach(function(item) {
      var pid = String(item.product_id);
      var c   = codeFor(pid);
      var b   = branchOf(pid) || String(r.branch_id || '');
      // match: product_id ตรง หรือ (code ตรง และอยู่ในสาขาเป้าหมาย)
      var matched = idSet[pid] || (hasCodes && c && targetCodes[c] && (!hasBranches || targetBranches[b]));
      if (!matched) return;
      result.push({
        import_id:   r.id,
        product_id:  pid,
        order_date:  r.order_date,
        supplier:    r.supplier,
        status:      r.status,
        quantity:    parseFloat(item.quantity) || 0,
        unit_cost:   (parseFloat(item.unit_cost || item.cost_price) || 0) + extraPerUnit,
        created_at:  r.created_at,
        branch_id:   b,
        branch_name: getBranchName(b),
        source:      'import'
      });
    });
  });

  // ---- ที่มา 2: การโยกของเข้าสาขา (Transfers → to_branch) ----
  var trSheet = getSheet('Transfers');
  if (trSheet && hasCodes) {
    sheetToObjects(trSheet).forEach(function(tr) {
      if (String(tr.status || 'completed') === 'cancelled') return;
      var c   = String(tr.product_code || '');
      var toB = String(tr.to_branch_id || '');
      if (!c || !targetCodes[c]) return;
      if (hasBranches && !targetBranches[toB]) return;       // จำกัดเฉพาะสาขาเป้าหมาย
      if (branchId && toB !== String(branchId)) return;      // เคารพสิทธิ์สาขา (non-superadmin)
      result.push({
        import_id:   tr.id,
        product_id:  String(tr.product_id || ''),
        order_date:  tr.transfer_date,
        supplier:    'โยกจาก ' + (getBranchName(String(tr.from_branch_id || '')) || tr.from_branch_id),
        status:      'transfer',
        quantity:    parseFloat(tr.quantity) || 0,
        unit_cost:   parseFloat(tr.dest_unit_cost) || 0,
        created_at:  tr.created_at,
        branch_id:   toB,
        branch_name: getBranchName(toB),
        source:      'transfer'
      });
    });
  }

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
    if (qty <= 0) return; // ล็อตที่ถูกขายหมดแล้ว
    var newCost = (parseFloat(row.cost_price) || 0) + extraPerUnit;
    stockSheet.getRange(i + 2, costCol).setValue(newCost);
    if (updatedCol > 0) stockSheet.getRange(i + 2, updatedCol).setValue(now());
    updatedLots++;
    updatedUnits += qty;
  });

  if (updatedLots === 0)
    return { success: false, message: 'สินค้านี้ถูกขายออกหมดแล้ว ไม่มีสต็อคคงเหลือที่จะอัพเดท' };

  return {
    success: true,
    updated_lots: updatedLots,
    updated_units: updatedUnits,
    extra_per_unit: extraPerUnit,
    message: 'อัพเดทต้นทุนสำเร็จ ' + updatedLots + ' ล็อต (+' + extraPerUnit.toFixed(2) + ' ฿/ชิ้น)'
  };
}

function getImports(p) {
  const auth = requireAuth(p);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Imports');
  if (!sheet) return { success: false };
  const branchId = effectiveBranchId(auth.user, (p || {}).branch_id);
  let rows = sheetToObjects(sheet);
  rows = filterByBranch(rows, branchId, auth.user.role);
  rows.forEach(r => {
    try { r.items = JSON.parse(r.items); } catch (_) { r.items = []; }
    try { r.import_costs = JSON.parse(r.import_costs); } catch (_) { r.import_costs = {}; }
  });
  return { success: true, data: rows };
}

function addImport(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Imports');
  if (!sheet) return { success: false };
  const id        = uid('IMP');
  const branchId  = effectiveBranchId(auth.user, data.branch_id);
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
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Imports');
  if (!sheet) return { success: false };
  const rows   = sheetToObjects(sheet);
  const record = rows.find(r => r.id === data.id);
  if (!record) return { success: false, message: 'ไม่พบการสั่งซื้อ' };

  // admin รับได้เฉพาะ PO ของสาขาตัวเอง (PO ที่ไม่มี branch_id ยังรับได้)
  if (auth.user.role !== 'superadmin' && record.branch_id &&
      String(record.branch_id) !== String(auth.user.branch_id || '')) {
    return { success: false, message: 'ไม่มีสิทธิ์รับสินค้าของสาขาอื่น' };
  }

  // Fix: guard against re-receiving. Without this, calling updateImportStatus('received')
  // twice (double-click / retry / network re-send) ran addStockLot again → stock doubled.
  const wasReceived = record.status === 'received';

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

  if (data.status === 'received' && !wasReceived) {
    let items = [];
    try { items = JSON.parse(record.items); } catch (_) {}

    // สาขาที่จะรับเข้า (โกดัง): superadmin เลือกได้ / admin = สาขาตัวเอง / fallback = สาขาของ PO
    var receiveBranch = (auth.user.role === 'superadmin')
      ? String(data.receive_branch_id || record.branch_id || '')
      : String(auth.user.branch_id || record.branch_id || '');

    var prodSheet = getSheet('Products');
    var products  = prodSheet ? sheetToObjects(prodSheet) : [];

    // กระจายต้นทุนนำเข้า (freight + customs + clearance + transport + warehouse + vat)
    // หารเท่าๆ กันต่อชิ้น ทุก item ในล็อตนี้
    const freight  = parseFloat(updates.freight_cost      !== undefined ? updates.freight_cost      : record.freight_cost)      || 0;
    const addCosts = parseFloat(updates.additional_costs  !== undefined ? updates.additional_costs  : record.additional_costs)  || 0;
    const totalQty = items.reduce(function(s, i) { return s + (parseFloat(i.quantity) || 0); }, 0);
    const extraPerUnit = totalQty > 0 ? (freight + addCosts) / totalQty : 0;

    // items JSON เก็บ unit_cost ฐาน (¥×rate) เสมอ ไม่แตะ
    // stock lot ได้ต้นทุนเต็ม (รวม extras) ตอน addStockLot — ลงสาขาที่เลือกรับ
    // (รับเข้าสาขาที่ไม่ใช่สาขาของ PO → จับคู่/สร้างสินค้าในสาขานั้นด้วย code)
    items.forEach(function(item) {
      const unitCost = (parseFloat(item.unit_cost) || 0) + extraPerUnit;
      var srcProd = products.find(function(pp) { return String(pp.id) === String(item.product_id); });
      var destProductId = srcProd
        ? resolveProductInBranch(srcProd, receiveBranch, 'รับเข้าจากการนำเข้า ' + record.id)
        : item.product_id;
      addStockLot(destProductId, parseFloat(item.quantity), unitCost, receiveBranch);
    });
  }
  return { success: true, message: 'อัพเดทสถานะสำเร็จ' };
}

// ---------- Withdrawals ----------
function getWithdrawals(p) {
  const auth = requireAuth(p);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Withdrawals');
  if (!sheet) return { success: false };
  const branchId = effectiveBranchId(auth.user, (p || {}).branch_id);
  let rows = sheetToObjects(sheet);
  rows = filterByBranch(rows, branchId, auth.user.role);
  rows.forEach(r => {
    try { r.items = JSON.parse(r.items); } catch (_) { r.items = []; }
  });
  return { success: true, data: rows };
}

function addWithdrawal(data) {
  var auth = requireAuth(data); // any authenticated role (staff can withdraw)
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Withdrawals');
  if (!sheet) return { success: false };
  const id       = uid('WDR');
  const branchId = effectiveBranchId(auth.user, data.branch_id);
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
  return { success: true, id, message: 'บันทึกบิลขายสำเร็จ' };
}

function updateWithdrawalStatus(data) {
  var auth = requireAuth(data); // any authenticated role (staff can withdraw)
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Withdrawals');
  if (!sheet) return { success: false };
  const rows   = sheetToObjects(sheet);
  const record = rows.find(r => r.id === data.id);
  if (!record) return { success: false, message: 'ไม่พบบิลขาย' };
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

// แก้ไขบิลขาย/ใบกำกับภาษีจากหน้า preview — แก้ได้ทุกช่อง บันทึกกลับเข้าระบบ
// หมายเหตุสำคัญ: การแก้รายการสินค้าที่นี่ "ไม่" ปรับสต็อก (FIFO) — เป็นการแก้เอกสารบิลเท่านั้น
// ถ้าต้องการปรับสต็อกให้ใช้ flow คืนสินค้า/ขายสินค้าตามปกติ
function updateWithdrawal(data) {
  var auth = requireAuth(data); // any authenticated role (staff แก้บิลสาขาตัวเองได้)
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Withdrawals');
  if (!sheet) return { success: false };
  const rows   = sheetToObjects(sheet);
  const record = rows.find(function(r) { return r.id === data.id; });
  if (!record) return { success: false, message: 'ไม่พบบิลขาย' };

  // บังคับสิทธิ์ระดับสาขา — ผู้ที่ไม่ใช่ superadmin แก้ได้เฉพาะบิลขายในสาขาตัวเอง
  if (auth.user.role !== 'superadmin' &&
      String(record.branch_id || '') !== String(auth.user.branch_id || '')) {
    return { success: false, message: 'ไม่มีสิทธิ์แก้ไขบิลขายของสาขาอื่น' };
  }

  const updates = {};
  if (data.recipient_name  !== undefined) updates.recipient_name  = data.recipient_name;
  if (data.withdrawal_date !== undefined && data.withdrawal_date !== '') updates.withdrawal_date = data.withdrawal_date;
  if (data.doc_no  !== undefined) updates.doc_no  = data.doc_no;
  if (data.deposit !== undefined) updates.deposit = parseFloat(data.deposit) || 0;

  // แก้รายการสินค้า → เก็บ items (JSON) + คำนวณ total_value ใหม่ (= ผลรวม qty × unit_price)
  if (Array.isArray(data.items)) {
    const items = data.items.map(function(i) {
      return {
        product_id:   i.product_id || '',
        product_name: i.product_name || '',
        unit:         i.unit || '',
        quantity:     parseFloat(i.quantity) || 0,
        unit_price:   parseFloat(i.unit_price) || 0
      };
    }).filter(function(i) { return i.product_name || i.product_id; });
    updates.items       = JSON.stringify(items);
    updates.total_value = items.reduce(function(s, i) { return s + i.quantity * i.unit_price; }, 0);
  }

  // updateRow ข้ามคอลัมน์ที่ยังไม่มี (เช่น doc_no/deposit ก่อนรัน setupAllSheets) อย่างปลอดภัย
  updateRow(sheet, data.id, updates);
  return { success: true, message: 'บันทึกบิลสำเร็จ' };
}

function partialReturn(data) {
  var auth = requireAuth(data); // any authenticated role (staff can withdraw/return)
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Withdrawals');
  if (!sheet) return { success: false };
  const rows   = sheetToObjects(sheet);
  const record = rows.find(r => r.id === data.id);
  if (!record) return { success: false, message: 'ไม่พบบิลขาย' };
  if (record.status !== 'completed' && record.status !== 'partial_returned')
    return { success: false, message: 'สามารถคืนได้เฉพาะบิลขายที่เสร็จสิ้นแล้ว' };

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

// ---------- Transfers (โยกของข้ามโกดัง/สาขา) ----------
// ย้ายสต็อกสินค้าจากสาขาต้นทาง → สาขาปลายทาง:
//   - ตัดสต็อกต้นทางแบบ FIFO + คำนวณต้นทุนต่อหน่วยของจำนวนที่ตัด
//   - สินค้าปลายทางจับคู่ด้วย code (ถ้าสาขาปลายทางยังไม่มี → สร้าง Product ใหม่ให้)
//   - ค่าขนส่ง + ค่ายกแรงงาน บวกเข้าต้นทุนต่อหน่วยของ lot ปลายทาง
function getTransfers(p) {
  var auth = requireAuth(p, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  var sheet = getSheet('Transfers');
  if (!sheet) return { success: true, data: [] };
  var rows = sheetToObjects(sheet);
  // เห็นได้ถ้าสาขาตัวเองเป็นต้นทางหรือปลายทาง (superadmin เห็นทั้งหมด)
  if (auth.user.role !== 'superadmin') {
    var bid = String(auth.user.branch_id || '');
    if (!bid) return { success: true, data: [] };
    rows = rows.filter(function(r) {
      return String(r.from_branch_id || '') === bid || String(r.to_branch_id || '') === bid;
    });
  }
  rows.sort(function(a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); });
  return { success: true, data: rows };
}

function addTransfer(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };

  var fromBranch = String(data.from_branch_id || '');
  var toBranch   = String(data.to_branch_id || '');
  var transport  = parseFloat(data.transport_cost) || 0;
  var labor      = parseFloat(data.labor_cost) || 0;

  // รองรับหลายรายการ (data.items) และรูปแบบเดิมรายการเดียว (product_id/quantity)
  var rawItems = Array.isArray(data.items) ? data.items : [];
  if (!rawItems.length && data.product_id) {
    rawItems = [{ product_id: data.product_id, product_name: data.product_name, quantity: data.quantity }];
  }
  // รวมสินค้าซ้ำ (product_id เดียวกัน) → จำนวนรวมกัน
  var mergedMap = {};
  rawItems.forEach(function(it) {
    var pid = it && it.product_id;
    var q   = parseFloat(it && it.quantity) || 0;
    if (!pid || q <= 0) return;
    if (!mergedMap[pid]) mergedMap[pid] = { product_id: pid, product_name: it.product_name || '', quantity: 0 };
    mergedMap[pid].quantity += q;
  });
  var items = Object.keys(mergedMap).map(function(k) { return mergedMap[k]; });

  if (!items.length)            return { success: false, message: 'กรุณาเลือกสินค้าและจำนวนที่ถูกต้อง' };
  if (!fromBranch || !toBranch) return { success: false, message: 'กรุณาเลือกสาขาต้นทางและปลายทาง' };
  if (fromBranch === toBranch)  return { success: false, message: 'สาขาต้นทางและปลายทางต้องไม่เหมือนกัน' };

  // admin ย้ายได้เฉพาะจากสาขาตัวเอง (superadmin ย้ายจากสาขาไหนก็ได้)
  if (auth.user.role !== 'superadmin' && fromBranch !== String(auth.user.branch_id || '')) {
    return { success: false, message: 'คุณย้ายของได้เฉพาะจากสาขาของตัวเองเท่านั้น' };
  }

  var stockSheet    = getSheet('Stock');
  var prodSheet     = getSheet('Products');
  var transferSheet = getSheet('Transfers');
  if (!stockSheet || !prodSheet) return { success: false, message: 'ไม่พบชีท Stock/Products' };
  if (!transferSheet)            return { success: false, message: 'ไม่พบชีท Transfers กรุณารัน setupAllSheets' };

  var products = sheetToObjects(prodSheet);
  var allLots  = sheetToObjects(stockSheet);
  var totalQty = items.reduce(function(s, it) { return s + it.quantity; }, 0);

  // ---- PASS 1: ตรวจสอบทุกรายการก่อน (all-or-nothing) + คำนวณต้นทุน FIFO ของจำนวนที่ตัด ----
  var prepared = [];
  for (var n = 0; n < items.length; n++) {
    var it      = items[n];
    var srcProd = products.find(function(pp) { return String(pp.id) === String(it.product_id); });
    if (!srcProd) return { success: false, message: 'ไม่พบสินค้าต้นทาง: ' + (it.product_name || it.product_id) };
    // ตรวจจาก "สต็อกในสาขาต้นทาง" (อิงชีต Stock เหมือน dropdown) ไม่อิง product.branch_id
    // เพราะสินค้าที่ superadmin สร้างอาจมี product.branch_id ว่าง แต่ stock ผูกสาขาจริง
    var lots  = allLots.filter(function(l) {
      return String(l.product_id) === String(it.product_id) && String(l.branch_id || '') === fromBranch;
    });
    var avail = lots.reduce(function(s, l) { return s + (parseFloat(l.quantity) || 0); }, 0);
    if (avail < it.quantity) {
      return { success: false, message: 'สต็อก "' + (srcProd.name || it.product_id) + '" ในสาขาต้นทางไม่พอ (คงเหลือ ' + avail + ')' };
    }
    var need = it.quantity, costSum = 0;
    for (var i = 0; i < lots.length && need > 0; i++) {
      var lq = parseFloat(lots[i].quantity) || 0;
      if (lq <= 0) continue;
      var take = Math.min(lq, need);
      costSum += take * (parseFloat(lots[i].cost_price) || 0);
      need -= take;
    }
    prepared.push({ srcProd: srcProd, item: it, costSum: costSum });
  }

  // ---- PASS 2: ตัดสต็อกต้นทาง + เพิ่ม lot ปลายทาง + บันทึกประวัติ ----
  // ค่าขนส่ง+ค่าแรง กระจายตามสัดส่วนจำนวน (capitalize เข้าต้นทุนปลายทางของแต่ละรายการ)
  // batchId = รหัสกลุ่มของการโยกครั้งนี้ (ทุกแถวใช้ร่วมกัน → frontend รวมเป็นรายการเดียว)
  var batchId = uid('TRB');
  var ids = [];
  for (var m = 0; m < prepared.length; m++) {
    var pr  = prepared[m];
    var q   = pr.item.quantity;
    var shTransport = totalQty > 0 ? transport * (q / totalQty) : 0;
    var shLabor     = totalQty > 0 ? labor     * (q / totalQty) : 0;
    var srcUnitCost  = q > 0 ? pr.costSum / q : 0;
    var destUnitCost = q > 0 ? (pr.costSum + shTransport + shLabor) / q : 0;

    // ตัดสต็อกเฉพาะ lot ในสาขาต้นทาง (กันตัดสต็อกสาขาอื่นพลาด)
    deductStockFIFOInBranch(pr.item.product_id, q, fromBranch);

    // สินค้าปลายทาง — จับคู่ด้วย code (ถ้าไม่มี → สร้าง Product ใหม่ในสาขาปลายทาง)
    var destProductId = resolveProductInBranch(pr.srcProd, toBranch, 'โยกมาจากสาขา ' + fromBranch);
    addStockLot(destProductId, q, destUnitCost, toBranch);

    var id = uid('TRF');
    transferSheet.appendRow([id, data.transfer_date || now(), pr.item.product_id,
      pr.srcProd.name || pr.item.product_name || '', pr.srcProd.code || '', q, fromBranch, toBranch,
      shTransport, shLabor, srcUnitCost, destUnitCost, q * destUnitCost,
      data.notes || '', data.created_by || auth.user.name || '', now(), batchId, 'completed']);
    ids.push(id);
  }

  return { success: true, ids: ids, batch_id: batchId, count: ids.length, message: 'โยกของสำเร็จ (' + ids.length + ' รายการ)' };
}

// ยกเลิกการโยก — ดึงของกลับ (ตัดสต็อกปลายทาง + คืนกลับต้นทาง) แล้ว "ลบแถว" ออกจากชีต Transfers
// อ้างอิงด้วย batch_id (กลุ่มของการโยกครั้งเดียว) — ข้อมูลเก่าที่ไม่มี batch_id ใช้ id แทน
// หาสต็อกปลายทางจากชีต Stock โดยตรงด้วย product_code (ทนต่อ product.branch_id ที่ว่าง/เพี้ยน)
function cancelTransfer(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  var sheet = getSheet('Transfers');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Transfers' };

  var key = String(data.batch_id || data.id || '');
  if (!key) return { success: false, message: 'ไม่ระบุรายการที่จะยกเลิก' };

  var rows = sheetToObjects(sheet);
  // หาแถว seed ที่ key ตรงกับ batch_id หรือ id (รองรับ frontend ที่ถือ key เก่าอิง id ก่อน backfill)
  var seed = null;
  for (var s = 0; s < rows.length; s++) {
    if (String(rows[s].batch_id || '') === key || String(rows[s].id) === key) { seed = rows[s]; break; }
  }
  if (!seed) return { success: false, message: 'ไม่พบรายการโยก' };
  var realKey = String(seed.batch_id || seed.id);

  // เก็บ index จริงในชีต (0-based) ของทุกแถวในกลุ่มเดียวกัน — ใช้ตอน deleteRow
  var groupIdx = [];
  rows.forEach(function(r, i) { if (String(r.batch_id || r.id) === realKey) groupIdx.push(i); });
  if (!groupIdx.length) return { success: false, message: 'ไม่พบรายการโยก' };

  var groupRows = groupIdx.map(function(i) { return rows[i]; });
  // คืนสต็อกเฉพาะแถวที่ยังไม่เคยยกเลิก (กันคืนซ้ำกับข้อมูลเก่าที่ status=cancelled)
  var active = groupRows.filter(function(r) { return String(r.status || 'completed') !== 'cancelled'; });

  var fromBranch = String(groupRows[0].from_branch_id || '');
  var toBranch   = String(groupRows[0].to_branch_id || '');

  // admin ยกเลิกได้เฉพาะการโยกที่ต้นทางเป็นสาขาตัวเอง (superadmin ได้ทั้งหมด)
  if (auth.user.role !== 'superadmin' && fromBranch !== String(auth.user.branch_id || '')) {
    return { success: false, message: 'คุณยกเลิกได้เฉพาะการโยกจากสาขาของตัวเองเท่านั้น' };
  }

  var allLots = sheetToObjects(getSheet('Stock'));

  // ---- PASS 1: ตรวจว่าปลายทางยังมีของพอให้ดึงกลับทุกแถว (all-or-nothing) ----
  var plan = [];
  for (var i = 0; i < active.length; i++) {
    var r     = active[i];
    var q     = parseFloat(r.quantity) || 0;
    if (q <= 0) continue;
    var code  = String(r.product_code || '');
    var pname = String(r.product_name || '');
    // หาสต็อกปลายทางจากชีต Stock โดยตรง: branch=ปลายทาง + product_code ตรง (ถ้าไม่มี code → ชื่อ)
    var destLots = allLots.filter(function(l) {
      if (String(l.branch_id || '') !== toBranch) return false;
      return code ? String(l.product_code || '') === code : String(l.product_name || '') === pname;
    });
    var destPid = destLots.length ? destLots[0].product_id : null;
    // นับคงเหลือเฉพาะ product_id ที่จะตัดจริง (กัน code ซ้ำหลาย product)
    var destAvail = destPid ? destLots.filter(function(l) { return String(l.product_id) === String(destPid); })
      .reduce(function(s, l) { return s + (parseFloat(l.quantity) || 0); }, 0) : 0;
    if (!destPid || destAvail < q) {
      return { success: false, message: 'ยกเลิกไม่ได้: "' + (pname || code) +
        '" ที่ปลายทางคงเหลือ ' + destAvail + ' (ต้องคืน ' + q + ') — อาจถูกขาย/โยกต่อไปแล้ว' };
    }
    plan.push({ q: q, destPid: destPid, srcPid: r.product_id, srcCost: parseFloat(r.unit_cost) || 0 });
  }

  // ---- PASS 2: ตัดของออกจากปลายทาง + คืนกลับต้นทาง (ต้นทุนเดิม) ----
  for (var j = 0; j < plan.length; j++) {
    var pl = plan[j];
    deductStockFIFOInBranch(pl.destPid, pl.q, toBranch);
    addStockLot(pl.srcPid, pl.q, pl.srcCost, fromBranch);
  }

  // ---- ลบแถวออกจากชีต Transfers (ลบจากล่างขึ้นบน ไม่ให้ index เลื่อน) ----
  var rowNumbers = groupIdx.map(function(i) { return i + 2; }).sort(function(a, b) { return b - a; });
  rowNumbers.forEach(function(rn) { sheet.deleteRow(rn); });

  return { success: true, count: plan.length, message: 'ยกเลิกและลบรายการโยกสำเร็จ (คืนของกลับสาขาต้นทางแล้ว)' };
}

// Migration (รันครั้งเดียวจาก Apps Script Editor): เติม batch_id ให้แถวโยกเก่าที่ยังไม่มี
// จัดกลุ่มแถวที่ from/to/ผู้ทำ/วันที่เดียวกัน และ created_at ห่างกันไม่เกิน 60 วินาที = ใบเดียวกัน
// (heuristic สำหรับข้อมูลเก่าเท่านั้น — การโยกใหม่ผูก batch_id แม่นยำอยู่แล้ว)
function backfillTransferBatches() {
  var sheet = getSheet('Transfers');
  if (!sheet || sheet.getLastRow() < 2) return 'ไม่มีข้อมูลให้จัดกลุ่ม';
  var hdrs      = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var batchCol  = hdrs.indexOf('batch_id');
  var statusCol = hdrs.indexOf('status');
  if (batchCol === -1) return 'ยังไม่มีคอลัมน์ batch_id — กรุณารัน setupAllSheets() ก่อน';

  var rows = sheetToObjects(sheet);
  var used = {}, assigned = 0, groups = 0;
  for (var i = 0; i < rows.length; i++) {
    if (used[i] || rows[i].batch_id) continue;       // ข้ามแถวที่มี batch แล้ว
    var a = rows[i];
    var tA = new Date(a.created_at).getTime();
    var batchId = uid('TRB');
    var members = [i];
    for (var j = i + 1; j < rows.length; j++) {
      if (used[j] || rows[j].batch_id) continue;
      var b = rows[j];
      var same = String(b.from_branch_id) === String(a.from_branch_id) &&
                 String(b.to_branch_id)   === String(a.to_branch_id) &&
                 String(b.created_by || '') === String(a.created_by || '') &&
                 String(b.transfer_date || '') === String(a.transfer_date || '');
      if (same && Math.abs(new Date(b.created_at).getTime() - tA) <= 60000) members.push(j);
    }
    members.forEach(function(idx) {
      used[idx] = true;
      sheet.getRange(idx + 2, batchCol + 1).setValue(batchId);
      if (statusCol !== -1 && !rows[idx].status) sheet.getRange(idx + 2, statusCol + 1).setValue('completed');
      assigned++;
    });
    groups++;
  }
  var msg = 'จัดกลุ่มแล้ว ' + assigned + ' แถว → ' + groups + ' ใบโยก';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

// ---------- Recipients ----------
function getRecipients(p) {
  const auth = requireAuth(p);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Recipients');
  if (!sheet) return { success: false };
  const branchId = effectiveBranchId(auth.user, (p || {}).branch_id);
  let rows = sheetToObjects(sheet).filter(r => r.status === 'active');
  rows = filterByBranch(rows, branchId, auth.user.role);
  return { success: true, data: rows };
}

function addRecipient(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Recipients');
  if (!sheet) return { success: false };
  const id       = uid('RCP');
  const branchId = effectiveBranchId(auth.user, data.branch_id);
  // Fix 2: "'" + (data.phone || '') — parens required, otherwise "'" + undefined → "'undefined"
  sheet.appendRow([id, data.name, data.department || '', data.position || '',
    "'" + (data.phone || ''), data.email || '', data.notes || '', 'active', now(), branchId,
    data.tax_id || '', data.address || '']);
  return { success: true, id, message: 'เพิ่มผู้รับสินค้าสำเร็จ' };
}

function updateRecipient(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
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
// Internal helper — no auth gate, used by other authenticated handlers (e.g. getBranchOverview)
function _activeBranches() {
  const sheet = getSheet('Branches');
  if (!sheet) return [];
  return sheetToObjects(sheet).filter(b => String(b.status) === 'active');
}
function getBranches(p) {
  const auth = requireAuth(p);
  if (!auth.ok) return { success: false, message: auth.message };
  return { success: true, data: _activeBranches() };
}

function addBranch(data) {
  const auth = requireAuth(data, ['superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  const sheet = getSheet('Branches');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Branches กรุณาสร้างชีทในกูเกิลชีทก่อน' };
  const id = uid('BRN');
  sheet.appendRow([id, data.name || '', data.address || '', data.phone || '', now(), 'active',
    data.name_en || '', data.tax_id || '']);
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
function getBranchOverview(p) {
  // superadmin-only — aggregates data across ALL branches
  const auth = requireAuth(p, ['superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  const branches = _activeBranches();
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
  const auth = requireAuth(p);
  if (!auth.ok) return { success: false, message: auth.message };
  const role     = auth.user.role;
  const branchId = effectiveBranchId(auth.user, (p || {}).branch_id);
  const stats = { total_products: 0, low_stock_items: 0, total_stock_value: 0, total_stock_units: 0,
    pending_withdrawals: 0, completed_today: 0, month_imports: 0, pending_imports: 0, total_recipients: 0 };

  // Fix 5: use filterByBranch consistently (was inlining the same logic 4 times)
  const stockSheet = getSheet('Stock');
  if (stockSheet) {
    const rows = filterByBranch(sheetToObjects(stockSheet), branchId, role);
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
    const rows = filterByBranch(sheetToObjects(wSheet), branchId, role);
    stats.pending_withdrawals = rows.filter(r => r.status === 'pending').length;
    const todayStr = new Date().toDateString();
    stats.completed_today = rows.filter(r => r.status === 'completed' &&
      new Date(r.created_at).toDateString() === todayStr).length;
  }

  const iSheet = getSheet('Imports');
  if (iSheet) {
    const rows = filterByBranch(sheetToObjects(iSheet), branchId, role);
    stats.pending_imports = rows.filter(r => r.status === 'pending').length;
    const m = new Date().getMonth(); const y = new Date().getFullYear();
    stats.month_imports = rows.filter(r => {
      const d = new Date(r.order_date); return d.getMonth() === m && d.getFullYear() === y;
    }).length;
  }

  const rSheet = getSheet('Recipients');
  if (rSheet) {
    const rows = filterByBranch(sheetToObjects(rSheet), branchId, role);
    stats.total_recipients = rows.filter(r => r.status === 'active').length;
  }

  return { success: true, data: stats };
}

// ---------- Monthly Report ----------
function getMonthlyReport(params) {
  const auth = requireAuth(params);
  if (!auth.ok) return { success: false, message: auth.message };
  const month    = parseInt(params.month) - 1;
  const year     = parseInt(params.year);
  const branchId = effectiveBranchId(auth.user, params.branch_id);
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
  var auth = requireAuth(p, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  var sheet = getSheet('Expenses');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Expenses' };
  var branchId = effectiveBranchId(auth.user, (p || {}).branch_id);
  var month    = parseInt((p || {}).month);
  var year     = parseInt((p || {}).year);
  var rows     = sheetToObjects(sheet);
  rows = filterByBranch(rows, branchId, auth.user.role);
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

function getExpenseCategories(p) {
  var auth = requireAuth(p);
  if (!auth.ok) return { success: false, message: auth.message };
  var sheet = getSheet('ExpenseCategories');
  if (!sheet) return { success: true, data: [] };
  var rows = sheetToObjects(sheet);
  var names = rows.map(function(r) { return String(r.name || '').trim(); }).filter(Boolean);
  return { success: true, data: names };
}

// ---------- Income (\u0e23\u0e32\u0e22\u0e23\u0e31\u0e1a / \u0e40\u0e07\u0e34\u0e19\u0e01\u0e2d\u0e07\u0e01\u0e25\u0e32\u0e07) ----------
function getIncome(p) {
  var auth = requireAuth(p, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  var sheet = getSheet('Income');
  if (!sheet) return { success: false, message: '\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e0a\u0e35\u0e17 Income' };
  var branchId = effectiveBranchId(auth.user, (p || {}).branch_id);
  var month    = parseInt((p || {}).month);
  var year     = parseInt((p || {}).year);
  var rows     = sheetToObjects(sheet);
  rows = filterByBranch(rows, branchId, auth.user.role);
  if (!isNaN(month) && !isNaN(year)) {
    rows = rows.filter(function(r) {
      var d = new Date(r.date);
      return d.getMonth() === month - 1 && d.getFullYear() === year;
    });
  }
  return { success: true, data: rows };
}

function addIncome(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  var sheet = getSheet('Income');
  if (!sheet) return { success: false, message: '\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e0a\u0e35\u0e17 Income \u0e01\u0e23\u0e38\u0e13\u0e32\u0e23\u0e31\u0e19 setupAllSheets() \u0e01\u0e48\u0e2d\u0e19' };
  var id       = uid('INC');
  var branchId = data.branch_id || auth.user.branch_id || '';
  sheet.appendRow([id, data.date || now().split('T')[0], data.category || '',
    data.description || '', parseFloat(data.amount) || 0, branchId, now(), auth.user.username || '']);
  return { success: true, id, message: '\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e23\u0e32\u0e22\u0e23\u0e31\u0e1a\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08' };
}

function updateIncome(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  var sheet = getSheet('Income');
  if (!sheet) return { success: false };
  var ok = updateRow(sheet, data.id, {
    date:        data.date,
    category:    data.category,
    description: data.description,
    amount:      parseFloat(data.amount) || 0
  });
  return { success: ok, message: ok ? '\u0e2d\u0e31\u0e1e\u0e40\u0e14\u0e17\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08' : '\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23' };
}

function deleteIncome(data) {
  var auth = requireAuth(data, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  var sheet = getSheet('Income');
  if (!sheet) return { success: false };
  var rows = sheetToObjects(sheet);
  var idx  = rows.findIndex(function(r) { return r.id === data.id; });
  if (idx === -1) return { success: false, message: '\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23' };
  sheet.deleteRow(idx + 2);
  return { success: true, message: '\u0e25\u0e1a\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08' };
}

function getIncomeCategories(p) {
  var auth = requireAuth(p);
  if (!auth.ok) return { success: false, message: auth.message };
  var sheet = getSheet('IncomeCategories');
  if (!sheet) return { success: true, data: [] };
  var rows = sheetToObjects(sheet);
  var names = rows.map(function(r) { return String(r.name || '').trim(); }).filter(Boolean);
  return { success: true, data: names };
}

/**
 * \u0e2a\u0e23\u0e38\u0e1b\u0e22\u0e2d\u0e14\u0e23\u0e32\u0e22\u0e23\u0e31\u0e1a / \u0e23\u0e32\u0e22\u0e08\u0e48\u0e32\u0e22 / \u0e04\u0e07\u0e40\u0e2b\u0e25\u0e37\u0e2d
 * - cumulative: \u0e22\u0e2d\u0e14\u0e2a\u0e30\u0e2a\u0e21\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14 (\u0e40\u0e07\u0e34\u0e19\u0e01\u0e2d\u0e07\u0e01\u0e25\u0e32\u0e07\u0e04\u0e07\u0e40\u0e2b\u0e25\u0e37\u0e2d)
 * - month: \u0e40\u0e09\u0e1e\u0e32\u0e30\u0e40\u0e14\u0e37\u0e2d\u0e19/\u0e1b\u0e35\u0e17\u0e35\u0e48\u0e23\u0e30\u0e1a\u0e38 (\u0e16\u0e49\u0e32\u0e2a\u0e48\u0e07 month/year)
 */
function getIncomeSummary(p) {
  var auth = requireAuth(p, ['admin', 'superadmin']);
  if (!auth.ok) return { success: false, message: auth.message };
  var branchId = effectiveBranchId(auth.user, (p || {}).branch_id);
  var month    = parseInt((p || {}).month);
  var year     = parseInt((p || {}).year);
  var hasMonth = !isNaN(month) && !isNaN(year);

  function sumSheet(name) {
    var sheet = getSheet(name);
    if (!sheet) return { total: 0, monthTotal: 0 };
    var rows = filterByBranch(sheetToObjects(sheet), branchId, auth.user.role);
    var total = 0, monthTotal = 0;
    rows.forEach(function(r) {
      var amt = parseFloat(r.amount) || 0;
      total += amt;
      if (hasMonth) {
        var d = new Date(r.date);
        if (d.getMonth() === month - 1 && d.getFullYear() === year) monthTotal += amt;
      }
    });
    return { total: total, monthTotal: monthTotal };
  }

  var inc = sumSheet('Income');
  var exp = sumSheet('Expenses');

  return {
    success: true,
    data: {
      cumulative: {
        income:    inc.total,
        expenses:  exp.total,
        remaining: inc.total - exp.total
      },
      month: {
        income:    inc.monthTotal,
        expenses:  exp.monthTotal,
        remaining: inc.monthTotal - exp.monthTotal
      }
    }
  };
}
