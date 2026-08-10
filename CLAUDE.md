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
| `/dashboard/bestsellers/` | `bestsellers` | `loadBestSellers()` |
| `/dashboard/withdrawal/` | `withdrawal` | `loadWithdrawal()` |
| `/dashboard/transfer/` | `transfer` | `loadTransfer()` |
| `/dashboard/recipients/` | `recipients` | `loadRecipients()` |
| `/dashboard/report/` | `report` | `initReports()` |
| `/dashboard/products/` | `products` | `loadProducts()` |
| `/dashboard/categories/` | `categories` | `loadCategories()` |
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
Withdrawals: id, withdrawal_date, recipient_id, recipient_name, department, items, total_value, type, notes, status, created_by, created_at, branch_id, doc_no, deposit
Recipients:  id, name, department, position, phone, email, notes, status, created_at, branch_id, tax_id, address
Transfers:   id, transfer_date, product_id, product_name, product_code, quantity, from_branch_id, to_branch_id, transport_cost, labor_cost, unit_cost, dest_unit_cost, total_value, notes, created_by, created_at
Categories:  id, name, description, status, created_at
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

## Transfer System (โยกของข้ามโกดัง = ข้ามสาขา)

- หน้า `/dashboard/transfer/` (admin + superadmin; **staff เข้าไม่ได้**). admin โยกได้เฉพาะ **จากสาขาตัวเอง** (frontend ล็อก + backend `addTransfer` บังคับ); superadmin โยกจากสาขาใดก็ได้
- `addTransfer(data)` ใน GAS:
  1. ตรวจสต็อกต้นทางพอ + คำนวณต้นทุน FIFO ของจำนวนที่ตัด (`product_id` unique ต่อสาขา → ตัดเฉพาะสาขาต้นทาง)
  2. `deductStockFIFO(productId, qty)` ตัดสาขาต้นทาง
  3. หาสินค้าปลายทางด้วย **`code`** ในสาขาปลายทาง — ถ้าไม่มีจะ **สร้าง Product ใหม่** ในสาขาปลายทาง (copy ชื่อ/code/unit/selling_price/min_stock)
  4. `addStockLot(destProductId, qty, destUnitCost, toBranch)` — `destUnitCost = (costSum + ค่าขนส่ง + ค่ายกแรงงาน) / qty` (ค่าขนส่ง+ค่าแรง **capitalize เข้าต้นทุนปลายทาง**)
  5. append แถวประวัติใน sheet `Transfers`
- **ต้องรัน `setupAllSheets()` ใหม่** เพื่อสร้าง sheet `Transfers`
- preview ต้นทุนปลายทางในโมดอลเป็น **ค่าประมาณ** (ใช้ `cost_price` weighted-avg จาก getStock); ค่าจริงคำนวณ FIFO ฝั่ง server ตอนบันทึก

---

## Category System (หมวดหมู่สินค้า)

- **หมวดหมู่เป็น master list แยก** (sheet `Categories`, **global ไม่มี branch_id** — ใช้ร่วมทุกสาขา). จัดการที่หน้า `/dashboard/categories/` (admin + superadmin; **staff เข้าไม่ได้**)
- `Products.category` เก็บเป็น **ชื่อหมวด (string)** ไม่ใช่ id → backward-compatible กับข้อมูล free-text เดิม. sheet `Categories` เป็นแค่ controlled vocabulary ของ dropdown
- หน้า products: ช่อง `#prod-cat` เปลี่ยนจาก text input → `<select>` เติมจาก `App.categories` (`populateCategorySelect` ยังคงค่าเก่าที่ไม่อยู่ในลิสต์ไว้เสมอ)
- **rename หมวด** (`updateCategory`) → cascade อัพเดท `Products.category` ทุก row ที่ใช้ชื่อเดิม (`renameCategoryOnProducts`). **delete** = soft-delete (status=inactive); สินค้ายังคงป้ายชื่อหมวดเดิมไว้
- ตัวกรอง/แสดงผลตามหมวด (frontend ล้วน):
  - **products / stock**: dropdown `#prod-cat-filter` / `#stock-cat-filter` + คอลัมน์หมวดหมู่. Stock sheet ไม่มี category → map จาก `App.products` ด้วย code/ชื่อ (`buildProductCatMap`) แล้วแปะใน `aggregateStockByProduct`
  - **bestsellers**: dropdown `#bs-cat-filter` (category มาจาก `pmap` ของ product) + badge บนการ์ด
  - **report**: ตาราง "สรุปยอดขายตามหมวดหมู่" (`#rpt-cat-body`) จัดกลุ่ม profitByProduct ตาม category ของสินค้า
- `collectCategoryNames()` = หมวดที่ active ∪ หมวดที่ปรากฏจริงใน products (กันข้อมูลเก่าหายจาก filter); `populateCategoryFilter(sel)` ใส่ option แรก `__all__`
- **ต้องรัน `setupAllSheets()` ใหม่** เพื่อสร้าง sheet `Categories`

---

## Import Flow (ค่าใช้จ่าย)

```
PO สร้าง (purchase modal)
  └─ yuan_amount × exchange_rate = base_cost_thb
  └─ freight_cost = 0 (กำหนดตอน receive)
  └─ status: pending

รับสินค้า (receive modal — ทั้ง /purchase/ และ /receive/)
  └─ rc-branch = สาขา (โกดัง) ที่จะรับเข้า — superadmin เลือกได้ / admin ล็อกสาขาตัวเอง (จำเป็น)
  └─ rc-freight = ค่า Freight (กรอกตอนนี้)
  └─ rc-customs_duty, rc-clearance_fee, rc-transport_fee, rc-warehouse_fee, rc-vat
  └─ total_cost = base_cost_thb + freight_cost + additional_costs
  └─ status: received → addStockLot() สำหรับทุก item ลง "สาขาที่เลือกรับ" (receive_branch_id)
       unit_cost ต่อชิ้น = (unit_price_yuan × rate) + (freight + additional_costs) / total_qty_all_items
       ถ้ารับเข้าสาขาที่ไม่ใช่สาขาของ PO → resolveProductInBranch() จับคู่/สร้างสินค้าในสาขานั้นด้วย code
       (admin รับได้เฉพาะ PO ของสาขาตัวเอง — บังคับฝั่ง server)

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
| `resolveProductInBranch(srcProd, branchId, label)` | หา/สร้าง product ในสาขาที่ระบุ (จับคู่ด้วย code) — ใช้ตอนรับ/โยกข้ามสาขา |
| `addImportExtraCost` | บวกต้นทุนแฝงกระจาย lot ที่เหลือ |
| `getStockImportHistory` | filter Imports.items → history ต่อ product |
| `updateImportStatus` | อัพเดท status + freight/costs/total; รับเข้า `receive_branch_id` (สาขาที่รับ) |
| `getTransfers` / `addTransfer` | โยกของข้ามสาขา (ดู Transfer System) |
| `getCategories` / `addCategory` / `updateCategory` / `deleteCategory` | CRUD หมวดหมู่ (global). `updateCategory` cascade rename ไป `Products.category` (`renameCategoryOnProducts`); `deleteCategory` = soft-delete |

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
  user, products[], stock[], imports[], withdrawals[], recipients[], branches[], transfers[], categories[], currentSection, editingId
}
```

### Race Condition Pattern (modal + prefetch)

`prefetchData()` รันทันทีที่โหลดหน้า (**ไม่รอ**) — ถ้าเปิด modal ก่อน prefetch เสร็จ:
- `openPurchaseModal()` และ `openWithdrawalModal()` เป็น `async`
- ถ้า `App.products.length === 0` → แสดง spinner แล้ว fetch ใหม่ก่อน render items

### Product Select ใน Dynamic Rows

- `populateProductSelects()` target เฉพาะ `.product-select` class
- `.po-product-select` และ `.wd-product-select` ใน dynamic rows ต้อง build `<option>` จาก `App.products` ตอน `addPoItem()` / `addWdItem()` โดยตรง

### Autocomplete Engine (app.js)

ใช้ที่ **บิลขาย** (`/dashboard/withdrawal/`): ช่องผู้รับสินค้า + ช่องสินค้าในทุกแถวรายการ

- โครง DOM: `.ac-wrap` > `input.ac-input[data-ac=<type>]` + `div.ac-list` + `select.d-none`
- `<select>` ยังเป็น **source of truth** (ซ่อนไว้) → `saveWithdrawal()`, `onWdProductChange()`, handler เติมแผนก ใช้โค้ดเดิมไม่ต้องแก้
- ชนิดนิยามใน `AC_TYPES` — `recipient` (ค้น ชื่อ/แผนก/ตำแหน่ง/เบอร์/เลขภาษี) และ `product` (ค้น ชื่อ/code/หมวด/หน่วย, source = `wdBranchProducts()` จึงผูกกับสาขาที่เลือก)
- ค้นแบบ multi-token (ทุก token ต้องเจอ), จำกัด `AC_LIMIT = 50`, ไฮไลท์ด้วย `<mark>`
- คีย์บอร์ด ↑↓ Enter Esc; คลิกใช้ `mousedown` (blur ยิงก่อน click); `acSync()` เขียนข้อความกลับให้ตรงกับ id ที่เลือกจริงเสมอ
- เพิ่มชนิดใหม่ = เติม entry ใน `AC_TYPES` + ใส่โครง DOM ข้างบน ไม่ต้องแตะ event handler

---

## API Methods (api.js)

```js
API.getProducts()
API.addProduct(d) / updateProduct(d) / deleteProduct(id)
API.getCategories() / addCategory(d) / updateCategory(d) / deleteCategory(id)
API.getStock()
API.getImports() / addImport(d) / updateImportStatus(id, status, import_costs, freight_cost)
API.getWithdrawals() / addWithdrawal(d) / updateWithdrawalStatus(id, status) / updateWithdrawal(d) / partialReturn(d)
API.getRecipients() / addRecipient(d) / updateRecipient(d)
API.getTransfers() / addTransfer(d)
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

---

## Editable Tax Invoice (preview)

- `printReceipt(w)` เปิดหน้าต่าง preview (`window.open` + `document.write`) — แก้ไขได้ทุกช่องในเอกสาร
- ปุ่มใน toolbar: **แก้ไข** (toggle `body.editing`) → **บันทึก** (`saveBill()`) → **พิมพ์**
- ช่องแก้ไข: ลูกค้า (ชื่อ/ที่อยู่/เลขภาษี = `contenteditable [data-edit]`), เลขที่เอกสาร, วันที่, เงินมัดจำ, รายการสินค้า (qty/หน่วย/ราคา + เพิ่ม/ลบแถว). หัวกระดาษผู้ขายมาจาก Branches (แก้ที่หน้าจัดการสาขา)
- ราคา/หน่วยในใบ = **ก่อน VAT**; `recompute()` รวมแถว → VAT 7% → ยอดสุทธิ (คอลัมน์รวมลงตัวเสมอ)
- บันทึก: popup เรียก `window.opener.saveEditedInvoice(payload)` (ต้องเป็น classic script — function เป็น global บน window) → `API.updateWithdrawal` (เก็บ items เป็นราคา**รวม VAT**, server คำนวณ `total_value`) + `API.updateRecipient` (ที่อยู่/เลขภาษีลูกค้า)
- ⚠️ การแก้รายการสินค้า **ไม่** ปรับสต็อก (FIFO) — เป็นการแก้เอกสารบิลเท่านั้น
- ต้องรัน `setupAllSheets()` ใหม่เพื่อเพิ่มคอลัมน์ `doc_no`, `deposit` ใน Withdrawals (migration เติมคอลัมน์ที่ขาดอัตโนมัติ)
