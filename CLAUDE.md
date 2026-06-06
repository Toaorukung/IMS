# IMS – Inventory Management System

## Stack & Architecture

- **Backend**: Google Apps Script (GAS) deployed as Web App (`gas/Code.gs`)
- **Database**: Google Sheets (8 sheets)
- **Frontend**: Static HTML/CSS/JS — Bootstrap 5.3 + jQuery 3.7 + Font Awesome 6.4
- **Auth**: Token-based, stored in `sessionStorage`, validated server-side via CacheService (5-min TTL)
- **i18n**: `data-i18n` attributes + `t()` function, language in `localStorage`, keys in `assets/js/i18n.js`
- **No build step** — ไฟล์ทุกอย่างพร้อมใช้งาน serve ตรงๆ

---

## Pages & Routes

| URL | `data-page` | ฟังก์ชัน init |
|-----|-------------|--------------|
| `/dashboard/home/` | `home` | `loadDashboard()` |
| `/dashboard/purchase/` | `purchase` | `loadPurchase()` |
| `/dashboard/receive/` | `receive` | `loadReceive()` |
| `/dashboard/stock/` | `stock` | `loadStock()` |
| `/dashboard/stock/imports/` | `stock-imports` | `loadStockImportHistory()` |
| `/dashboard/withdrawal/` | `withdrawal` | `loadWithdrawal()` |
| `/dashboard/recipients/` | `recipients` | `loadRecipients()` |
| `/dashboard/report/` | `report` | `initReports()` |
| `/dashboard/products/` | `products` | `loadProducts()` |
| `/dashboard/users/` | `users` | inline script |

Page switch ใน `app.js`: `switch(page)` ที่ `document.ready`

---

## Role System (3 ระดับ)

| Role | สาขา | สิทธิ์ |
|------|------|--------|
| `superadmin` | ไม่มี (เห็นทั้งหมด) | ทุกอย่าง รวมถึง user/branch management |
| `admin` | มี branch_id | ทุกอย่างยกเว้น user/branch CRUD |
| `staff` | มี branch_id | เข้าได้เฉพาะ `/dashboard/withdrawal/` |

- `Auth.isAdmin()` → `true` ทั้ง `admin` และ `superadmin`
- `Auth.isSuperAdmin()` → `true` เฉพาะ `superadmin`
- `filterByBranch(rows, branchId, role)` ใน GAS — ถ้า branchId ว่าง (superadmin) คืนทั้งหมด

---

## Google Sheets Schema

```
Branches:    id, name, address, phone, created_at, status
Users:       id, username, password, name, role, status, created_at, branch_id
Tokens:      token, user_id, username, created_at, expires_at
Products:    id, code, name, category, unit, cost_price, selling_price, min_stock, notes, created_at, status, branch_id
Stock:       id, product_id, product_name, product_code, unit, quantity, cost_price, min_stock, last_updated, branch_id
Imports:     id, order_date, supplier, items, yuan_amount, exchange_rate, base_cost_thb, freight_cost, import_costs, additional_costs, total_cost, status, notes, created_at, created_by, branch_id
Withdrawals: id, withdrawal_date, recipient_id, recipient_name, department, items, total_value, type, notes, status, created_by, created_at, branch_id
Recipients:  id, name, department, position, phone, email, notes, status, created_at, branch_id
```

- `items` ใน Imports และ Withdrawals เก็บเป็น **JSON string** ใน cell
- `import_costs` เก็บเป็น **JSON string**: `{ customs_duty, clearance_fee, transport_fee, warehouse_fee, vat }`
- `total_cost` ใน Imports = `base_cost_thb + freight_cost + additional_costs`

---

## Stock System (FIFO)

- Stock sheet มี **หลาย row ต่อ 1 สินค้า** (แต่ละ row = lot นำเข้าครั้งนึง)
- `addStockLot(productId, qty, cost, branchId)` — append row ใหม่
- `deductStockFIFO(productId, qty)` — ตัดจาก lot เก่าสุดที่มี `qty > 0` ก่อน
- `cost_price` ใน Products = weighted average ของ lot ที่เหลือ (แสดงใน UI)
- Import extra cost (`addImportExtraCost`) — คำนวณ `extraPerUnit = amount / origQty` แล้วบวกเข้า `cost_price` ของ **ทุก lot ที่ยังเหลือ** ของ product นั้น

---

## Import Flow (ค่าใช้จ่าย)

```
PO สร้าง (purchase modal)
  └─ yuan_amount × exchange_rate = base_cost_thb
  └─ freight_cost = 0 (กำหนดตอน receive)
  └─ status: pending

รับสินค้า (receive modal — ทั้ง /purchase/ และ /receive/)
  └─ rc-freight = ค่า Freight (กรอกตอนนี้)
  └─ rc-customs_duty, rc-clearance_fee, rc-transport_fee, rc-warehouse_fee, rc-vat
  └─ total_cost = base_cost_thb + freight_cost + additional_costs
  └─ status: received → addStockLot() สำหรับทุก item
       unit_cost ต่อชิ้น = (unit_price_yuan × rate) + (freight + additional_costs) / total_qty_all_items

ประวัตินำเข้าต่อสินค้า (/dashboard/stock/imports/?id=X&name=Y)
  └─ เปิดจาก stock table → openStockImportHistory()
  └─ ดาวน์โหลดผ่าน getStockImportHistory — filter จาก Imports.items JSON
  └─ ปุ่ม "เพิ่มต้นทุนแฝง" → openAddExtraCost() → addImportExtraCost()
```

---

## GAS Functions ที่สำคัญ

| ฟังก์ชัน | หน้าที่ |
|---------|--------|
| `requireAuth(p, roles)` | ตรวจ token + role, คืน `{ ok, user }` |
| `filterByBranch(rows, branchId)` | กรอง data ตาม branch (superadmin ได้ทั้งหมด) |
| `sheetToObjects(sheet)` | แปลง sheet → array of objects (row 1 = header) |
| `updateRow(sheet, id, updates)` | อัพเดท row ที่ column `id` ตรงกัน |
| `uid(prefix)` | สร้าง ID เช่น `IMP-20250101-abc123` |
| `addStockLot` | เพิ่ม lot ใหม่ใน Stock |
| `deductStockFIFO` | ตัดสต็อค FIFO |
| `addImportExtraCost` | บวกต้นทุนแฝงกระจาย lot ที่เหลือ |
| `getStockImportHistory` | filter Imports.items → history ต่อ product |
| `updateImportStatus` | อัพเดท status + บันทึก freight/costs/total |

GAS endpoint เดียว: `doGet` (action ใน query string) / `doPost` (action ใน JSON body)

---

## Frontend Files

| ไฟล์ | หน้าที่ |
|------|--------|
| `assets/js/config.js` | `CONFIG.GAS_URL` |
| `assets/js/api.js` | `API.*` methods + `Auth.*` + `Fmt.*` helpers |
| `assets/js/app.js` | ทุก page logic รวมกัน (switch by `data-page`) |
| `assets/js/layout.js` | render sidebar, topbar |
| `assets/js/i18n.js` | แปลภาษา TH/EN |
| `assets/css/style.css` | custom styles |

### App State

```js
App = {
  user, products[], stock[], imports[], withdrawals[], recipients[], currentSection, editingId
}
```

### Race Condition Pattern (modal + prefetch)

`prefetchData()` รันทันทีที่โหลดหน้า (**ไม่รอ**) — ถ้าเปิด modal ก่อน prefetch เสร็จ:
- `openPurchaseModal()` และ `openWithdrawalModal()` เป็น `async`
- ถ้า `App.products.length === 0` → แสดง spinner แล้ว fetch ใหม่ก่อน render items

### Product Select ใน Dynamic Rows

- `populateProductSelects()` target เฉพาะ `.product-select` class
- `.po-product-select` และ `.wd-product-select` ใน dynamic rows ต้อง build `<option>` จาก `App.products` ตอน `addPoItem()` / `addWdItem()` โดยตรง

---

## API Methods (api.js)

```js
API.getProducts()
API.addProduct(d) / updateProduct(d) / deleteProduct(id)
API.getStock()
API.getImports() / addImport(d) / updateImportStatus(id, status, import_costs, freight_cost)
API.getWithdrawals() / addWithdrawal(d) / updateWithdrawalStatus(id, status) / partialReturn(d)
API.getRecipients() / addRecipient(d) / updateRecipient(d)
API.getBranches() / addBranch(d) / updateBranch(d) / deleteBranch(id) / getBranchOverview()
API.getUsers() / addUser(d) / updateUser(d)
API.getDashboardStats() / getMonthlyReport(month, year)
API.getStockImportHistory(productId)
API.addImportExtraCost(d)
```

GET calls ส่ง `branch_id: Auth.getBranchId()` ทุกครั้งโดยอัตโนมัติ

---

## Navigation Patterns

- หน้าย่อย `/dashboard/stock/imports/` รับ `?id=PRODUCT_ID&name=PRODUCT_NAME` ผ่าน URL params
- `?new=1` ใน purchase/withdrawal → auto-open modal
- หน้าส่วนใหญ่ต่อกันผ่าน `window.location.href`

---

## Deployment

1. แก้ไข `gas/Code.gs` → Deploy as Web App ใน Google Apps Script
2. Copy URL → ใส่ใน `assets/js/config.js` (`CONFIG.GAS_URL`)
3. `setupAllSheets()` — รันครั้งเดียวหลัง deploy เพื่อสร้าง sheet headers

---

## Import Status Flow

```
pending → in-transit → received
```

- `received` เท่านั้นที่ trigger `addStockLot()` และ lock ค่าใช้จ่าย
- เพิ่มต้นทุนแฝง (`addImportExtraCost`) ทำได้เฉพาะ import ที่ `status === 'received'`
