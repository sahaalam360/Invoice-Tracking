/* ==========================================================================
   Handysz Courier — data layer (localStorage)
   Self-contained persistence: invoices, staff, settings, session.
   ========================================================================== */
(function (global) {
  "use strict";

  const PREFIX = "handysz:";
  const KEY = {
    invoices: PREFIX + "invoices",
    staff: PREFIX + "staff",
    settings: PREFIX + "settings",
    session: PREFIX + "session",
    seeded: PREFIX + "seeded",
  };

  const STATUSES = ["Pending", "Picked Up", "In Transit", "Delivered", "Returned"];

  /* ---------- low-level helpers ---------- */
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  /* ---------- id generation ---------- */
  function pad(n) { return String(n).padStart(2, "0"); }
  function makeId() {
    const d = new Date();
    const stamp = "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      "-" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    const rnd = Math.floor(1000 + Math.random() * 9000);
    return "INV-" + stamp + "-" + rnd;
  }

  /* ---------- default data ---------- */
  function defaultSettings() {
    return {
      companyName: "Handysz",
      tagline: "Courier & Delivery",
      phone: "017853-51615",
      address: "Dhaka, Bangladesh",
      website: "",
      currency: "৳",
    };
  }

  function defaultStaff() {
    return [
      { id: "ST-001", name: "Administrator", password: "admin123", role: "Admin", active: true },
      { id: "ST-002", name: "Rider Rahim", password: "rider123", role: "Staff", active: true },
    ];
  }

  /* demo invoices so the app is instantly understandable */
  function demoInvoices() {
    const now = Date.now();
    const day = 86400000;
    const customers = [
      { name: "Tanvir Ahmed", phone: "01711-223344", address: "House 12, Road 5, Dhanmondi, Dhaka", product: "iPhone 15 Case", qty: 1, price: 450, delivery: 60 },
      { name: "Nusrat Jahan", phone: "01822-556677", address: "Flat 3B, Banani, Dhaka", product: "Wireless Earbuds", qty: 2, price: 1200, delivery: 80 },
      { name: "Rakib Hasan", phone: "01911-889900", address: "Uttara Sector 7, Dhaka", product: "Denim Jacket", qty: 1, price: 1450, delivery: 100 },
      { name: "Sadia Islam", phone: "01622-334455", address: "Mirpur 10, Dhaka", product: "Skincare Set", qty: 1, price: 890, delivery: 60 },
      { name: "Mehedi Hasan", phone: "01788-112233", address: "Gulshan 2, Dhaka", product: "Running Shoes", qty: 1, price: 2350, delivery: 120 },
      { name: "Farhana Akter", phone: "01522-445566", address: "Motijheel, Dhaka", product: "Smart Watch", qty: 1, price: 3200, delivery: 100 },
      { name: "Imran Khan", phone: "01811-778899", address: "Khilgaon, Dhaka", product: "Gaming Mouse", qty: 3, price: 700, delivery: 70 },
      { name: "Sharmin Sultana", phone: "01933-990011", address: "Bashundhara R/A, Dhaka", product: "Handbag", qty: 1, price: 1800, delivery: 90 },
    ];
    const statusFlow = ["Pending", "Picked Up", "In Transit", "Delivered"];
    return customers.map((c, i) => {
      const created = now - (customers.length - i) * day - Math.floor(Math.random() * 6) * 3600000;
      let status = statusFlow[i % statusFlow.length];
      // make one returned for variety
      if (i === 5) status = "Returned";
      if (i === 7) status = "In Transit";
      const history = [{ status: "Pending", at: created, by: "Administrator" }];
      if (status !== "Pending") {
        const step = (created + now) / 2;
        if (statusFlow.indexOf(status) >= 1) history.push({ status: "Picked Up", at: step, by: "Rider Rahim" });
        if (statusFlow.indexOf(status) >= 2 && status !== "Returned") history.push({ status: "In Transit", at: (step + now) / 2, by: "Rider Rahim" });
        if (status === "Returned") history.push({ status: "Returned", at: (step + now) / 2, by: "Rider Rahim" });
        else if (status === "Delivered") history.push({ status: "Delivered", at: now, by: "Rider Rahim" });
      }
      return {
        id: "INV-20260" + (7 - i) + "-10" + i + "0",
        customer: c.name, phone: c.phone, address: c.address,
        product: c.product, qty: c.qty, price: c.price, delivery: c.delivery,
        note: "", staff: i % 2 === 0 ? "Administrator" : "Rider Rahim",
        status: status, createdAt: created, updatedAt: now, history: history,
      };
    });
  }

  /* ---------- invoices ---------- */
  function getInvoices() {
    const list = read(KEY.invoices, []);
    return Array.isArray(list) ? list : [];
  }
  function saveInvoices(list) { write(KEY.invoices, list); }

  function getInvoice(id) {
    return getInvoices().find((i) => i.id === id) || null;
  }
  function addInvoice(inv) {
    const list = getInvoices();
    list.unshift(inv);
    saveInvoices(list);
    return inv;
  }
  function updateInvoice(id, patch) {
    const list = getInvoices();
    const idx = list.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    list[idx] = Object.assign({}, list[idx], patch, { updatedAt: Date.now() });
    saveInvoices(list);
    return list[idx];
  }
  function deleteInvoice(id) {
    saveInvoices(getInvoices().filter((i) => i.id !== id));
  }
  function setStatus(id, status, by) {
    const inv = getInvoice(id);
    if (!inv) return null;
    const history = (inv.history || []).slice();
    history.push({ status: status, at: Date.now(), by: by || "System" });
    return updateInvoice(id, { status: status, history: history });
  }
  function stats() {
    const list = getInvoices();
    const today = new Date().toDateString();
    const s = {
      total: list.length,
      pending: 0, picked: 0, transit: 0, delivered: 0, returned: 0,
      today: 0, codTotal: 0,
    };
    list.forEach((i) => {
      if (i.status === "Pending") s.pending++;
      else if (i.status === "Picked Up") s.picked++;
      else if (i.status === "In Transit") s.transit++;
      else if (i.status === "Delivered") s.delivered++;
      else if (i.status === "Returned") s.returned++;
      if (new Date(i.createdAt).toDateString() === today) s.today++;
      if (i.status === "Delivered") s.codTotal += Number(i.qty || 0) * Number(i.price || 0) + Number(i.delivery || 0);
    });
    return s;
  }

  /* ---------- staff ---------- */
  function getStaff() { return read(KEY.staff, []); }
  function saveStaff(list) { write(KEY.staff, list); }
  function findStaff(id, password) {
    return getStaff().find((s) => s.id.toLowerCase() === String(id).toLowerCase() && s.password === password && s.active !== false) || null;
  }
  function addStaff(staff) {
    const list = getStaff();
    if (list.some((s) => s.id.toLowerCase() === staff.id.toLowerCase())) return { ok: false, error: "Staff ID already exists." };
    list.push(staff);
    saveStaff(list);
    return { ok: true };
  }
  function updateStaff(id, patch) {
    const list = getStaff();
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    list[idx] = Object.assign({}, list[idx], patch);
    saveStaff(list);
    return true;
  }
  function removeStaff(id) {
    saveStaff(getStaff().filter((s) => s.id !== id));
  }

  /* ---------- settings ---------- */
  function getSettings() {
    return Object.assign({}, defaultSettings(), read(KEY.settings, {}));
  }
  function saveSettings(s) { write(KEY.settings, s); }

  /* ---------- session ---------- */
  function getSession() { return read(KEY.session, null); }
  function setSession(user) { write(KEY.session, user); }
  function clearSession() { localStorage.removeItem(KEY.session); }

  /* ---------- data management ---------- */
  function exportData() {
    return JSON.stringify({
      app: "handysz-courier",
      version: 1,
      exportedAt: new Date().toISOString(),
      invoices: getInvoices(),
      staff: getStaff(),
      settings: getSettings(),
    }, null, 2);
  }
  function importData(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, error: "File is not valid JSON." }; }
    if (!data || !Array.isArray(data.invoices)) return { ok: false, error: "Unrecognised backup file." };
    saveInvoices(data.invoices);
    if (Array.isArray(data.staff)) saveStaff(data.staff);
    if (data.settings && typeof data.settings === "object") saveSettings(data.settings);
    return { ok: true };
  }
  function clearAll() {
    [KEY.invoices, KEY.staff, KEY.settings].forEach((k) => localStorage.removeItem(k));
    init(true);
  }
  function loadDemo() {
    saveInvoices(demoInvoices());
    return getInvoices().length;
  }

  /* ---------- init / seed ---------- */
  function init(force) {
    if (force || !localStorage.getItem(KEY.seeded)) {
      if (!read(KEY.staff, null)) saveStaff(defaultStaff());
      if (!read(KEY.settings, null)) saveSettings(defaultSettings());
      if (!read(KEY.invoices, null)) saveInvoices(demoInvoices());
      localStorage.setItem(KEY.seeded, "1");
    }
  }

  global.Store = {
    STATUSES, makeId, init, loadDemo, clearAll,
    getInvoices, getInvoice, addInvoice, updateInvoice, deleteInvoice, setStatus, stats,
    getStaff, findStaff, addStaff, updateStaff, removeStaff,
    getSettings, saveSettings,
    getSession, setSession, clearSession,
    exportData, importData,
  };
})(window);
