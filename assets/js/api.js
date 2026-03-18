// ============================================================
// api.js – ชั้น API สำหรับติดต่อ Google Apps Script
// ============================================================

const API = (() => {
  async function get(action, params = {}) {
    const qs = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(`${CONFIG.GAS_URL}?${qs}`, { redirect: 'follow' });
    return res.json();
  }

  async function post(data) {
    const res = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify(data),
      // text/plain หลีกเลี่ยง CORS preflight
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow'
    });
    return res.json();
  }

  return {
    // Auth
    login: (username, password) => post({ action: 'login', username, password }),
    validateToken: (token)       => post({ action: 'validateToken', token }),

    // Products
    getProducts:   ()     => get('getProducts'),
    addProduct:    (d)    => post({ action: 'addProduct', ...d }),
    updateProduct: (d)    => post({ action: 'updateProduct', ...d }),
    deleteProduct: (id)   => post({ action: 'deleteProduct', id }),

    // Stock
    getStock: () => get('getStock'),

    // Imports
    getImports:          ()           => get('getImports'),
    addImport:           (d)          => post({ action: 'addImport', ...d }),
    updateImportStatus:  (id, status, import_costs) =>
      post({ action: 'updateImportStatus', id, status, import_costs }),

    // Withdrawals
    getWithdrawals:         ()           => get('getWithdrawals'),
    addWithdrawal:          (d)          => post({ action: 'addWithdrawal', ...d }),
    updateWithdrawalStatus: (id, status) => post({ action: 'updateWithdrawalStatus', id, status }),
    partialReturn:           (d)          => post({ action: 'partialReturn', ...d }),

    // Recipients
    getRecipients:   ()  => get('getRecipients'),
    addRecipient:    (d) => post({ action: 'addRecipient', ...d }),
    updateRecipient: (d) => post({ action: 'updateRecipient', ...d }),

    // Reports
    getDashboardStats: ()           => get('getDashboardStats'),
    getMonthlyReport:  (month, year)=> get('getMonthlyReport', { month, year }),

   
  };
})();

// ---------- Auth Helpers (ใช้ใน dashboard) ----------
// Auth ถูกห่อด้วย IIFE เพื่อซ่อน _verifiedRole ไว้ใน closure
// ไม่สามารถอ่านหรือแก้ไขได้จาก DevTools / sessionStorage โดยตรง
const Auth = (() => {
  // private — ไม่ expose ออกสู่ global scope
  let _verifiedRole = null;

  return {
    getToken: () => sessionStorage.getItem(CONFIG.TOKEN_KEY),
    getUser:  () => {
      const u = sessionStorage.getItem(CONFIG.USER_KEY);
      return u ? JSON.parse(u) : null;
    },
    save: (token, user) => {
      sessionStorage.setItem(CONFIG.TOKEN_KEY, token);
      sessionStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
    },
    clear: () => {
      _verifiedRole = null;
      sessionStorage.removeItem(CONFIG.TOKEN_KEY);
      sessionStorage.removeItem(CONFIG.USER_KEY);
    },
    isLoggedIn: () => !!sessionStorage.getItem(CONFIG.TOKEN_KEY),

    /**
     * ตรวจสอบ token กับ server ทุกครั้งที่โหลดหน้า
     * role ที่ได้จะถูกเก็บใน closure (_verifiedRole) เท่านั้น
     * — แก้ไข sessionStorage จาก DevTools ไม่มีผลต่อ role นี้
     * @returns {{ ok: boolean, user?: object }}
     */
    verifyAccess: async () => {
      const token = sessionStorage.getItem(CONFIG.TOKEN_KEY);
      if (!token) { _verifiedRole = null; return { ok: false }; }
      try {
        const res = await API.validateToken(token);
        if (res && res.success && res.user) {
          _verifiedRole = res.user.role;                          // เก็บใน closure
          sessionStorage.setItem(CONFIG.USER_KEY, JSON.stringify(res.user)); // sync display
          return { ok: true, user: res.user };
        }
      } catch (_) { /* network error */ }
      _verifiedRole = null;
      return { ok: false };
    },

    /** true เฉพาะเมื่อ server ยืนยันว่าเป็น admin */
    isAdmin: () => _verifiedRole === 'admin',

    /** ตั้งค่า role จาก cache (ใช้สำหรับ render UI ทันที ก่อน server ยืนยัน) */
    setCachedRole: (role) => { _verifiedRole = role; }
  };
})();

// ---------- Format Helpers ----------
const Fmt = {
  number:   (n) => parseFloat(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0 }),
  currency: (n) => '฿' + parseFloat(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  yuan:     (n) => '¥' + parseFloat(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 }),
  date:     (s) => {
    if (!s) return '-';
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  },
  dateTime: (s) => {
    if (!s) return '-';
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  },
  statusBadge: (status) => {
    const map = {
      pending:    '<span class="badge bg-warning text-dark">รอดำเนินการ</span>',
      'in-transit':'<span class="badge bg-info text-dark">กำลังขนส่ง</span>',
      received:   '<span class="badge bg-success">รับแล้ว</span>',
      approved:   '<span class="badge bg-primary">อนุมัติแล้ว</span>',
      completed:  '<span class="badge bg-success">เสร็จสิ้น</span>',
      returned:         '<span class="badge bg-secondary">คืนแล้ว</span>',
      partial_returned: '<span class="badge badge-teal">คืนบางส่วน</span>',
      cancelled:  '<span class="badge bg-danger">ยกเลิก</span>',
      normal:     '<span class="badge bg-primary">ปกติ</span>',
      return:     '<span class="badge bg-warning text-dark">คืนสินค้า</span>',
      active:     '<span class="badge bg-success">ใช้งาน</span>',
      inactive:   '<span class="badge bg-secondary">ไม่ใช้งาน</span>'
    };
    return map[status] || `<span class="badge bg-secondary">${status}</span>`;
  }
};
