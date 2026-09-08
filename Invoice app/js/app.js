/* ==========================================================================
   Handysz Courier — application logic
   SPA shell with views: Dashboard, New Invoice, Invoices, Track, Settings
   ========================================================================== */
(function () {
  "use strict";

  const { icon, toast, esc, money, dateTime, dateTimeFull, timeAgo, initials, statusBadge, closeTopModal, debounce } = UI;

  Store.init();

  const App = {
    view: "dashboard",
    draftId: Store.makeId(),
    scanner: null,
    scanOpen: false,
  };

  /* ======================================================================
     Auth
     ====================================================================== */
  function currentUser() { return Store.getSession(); }
  function requireAuth() {
    const user = currentUser();
    if (!user) return false;
    fillUserChip(user);
    return true;
  }

  function fillUserChip(user) {
    const av = document.getElementById("sb-avatar");
    const name = document.getElementById("sb-name");
    const role = document.getElementById("sb-role");
    if (av) av.textContent = initials(user.name);
    if (name) name.textContent = user.name;
    if (role) role.textContent = user.role;
    const adminOnly = document.querySelectorAll("[data-admin]");
    adminOnly.forEach((el) => {
      if (user.role !== "Admin") el.hidden = true;
      else el.hidden = false;
    });
  }

  function doLogin() {
    const id = document.getElementById("login-staff").value.trim();
    const pass = document.getElementById("login-pass").value;
    const errEl = document.getElementById("login-error");
    if (!id || !pass) {
      showLoginError("Please enter your Staff ID and password.");
      return;
    }
    const user = Store.findStaff(id, pass);
    if (!user) {
      showLoginError("Invalid Staff ID or password. Try again.");
      document.getElementById("login-pass").value = "";
      return;
    }
    Store.setSession(user);
    hideLoginError();
    toast("Welcome back", user.name + " — you are signed in.", "success");
    showApp();
  }

  function doLogout() {
    Store.clearSession();
    if (App.scanner) { try { App.scanner.stop().catch(() => {}); } catch (e) {} App.scanner = null; App.scanOpen = false; }
    showLogin();
  }

  function showLoginError(msg) {
    const errEl = document.getElementById("login-error");
    errEl.hidden = false;
    errEl.querySelector("span").textContent = msg;
  }
  function hideLoginError() {
    document.getElementById("login-error").hidden = true;
  }

  function showLogin() {
    document.getElementById("login-screen").hidden = false;
    document.getElementById("app").hidden = true;
    document.getElementById("login-pass").value = "";
    const lname = document.getElementById("login-brand-name");
    if (lname) lname.textContent = Store.getSettings().companyName || "Handysz";
    const lid = document.getElementById("login-staff");
    setTimeout(() => lid && lid.focus(), 50);
  }

  function showApp() {
    document.getElementById("login-screen").hidden = true;
    document.getElementById("app").hidden = false;
    renderSettingsSummary();
    navigate("dashboard");
  }

  /* ======================================================================
     Router / navigation
     ====================================================================== */
  function navigate(view) {
    if (!currentUser()) { showLogin(); return; }
    if (!["dashboard", "new", "invoices", "track", "settings"].includes(view)) view = "dashboard";
    App.view = view;

    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    const target = document.getElementById("view-" + view);
    if (target) target.classList.add("active");

    document.querySelectorAll("[data-view]").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-view") === view);
    });

    const titles = { dashboard: "Dashboard", new: "New Invoice", invoices: "Invoices", track: "Track & Update", settings: "Settings" };
    const subs = {
      dashboard: "Overview of your delivery operation",
      new: "Create a shipment and print its receipt",
      invoices: "Search, filter and manage all shipments",
      track: "Scan a QR code or search by invoice ID",
      settings: "Manage your business profile and staff",
    };
    document.getElementById("page-title").textContent = titles[view];
    document.getElementById("page-sub").textContent = subs[view];

    if (view === "track") startScanner();
    else stopScanner();

    if (view === "dashboard") renderDashboard();
    if (view === "invoices") renderInvoices();
    if (view === "settings") renderSettings();
    if (view === "new") refreshDraftId(true);
  }

  /* ======================================================================
     Dashboard
     ====================================================================== */
  function renderDashboard() {
    const s = Store.stats();
    document.getElementById("stat-total").textContent = s.total;
    document.getElementById("stat-today").textContent = s.today;
    document.getElementById("stat-pending").textContent = s.pending;
    document.getElementById("stat-delivered").textContent = s.delivered;
    document.getElementById("stat-cod").textContent = money(s.codTotal, Store.getSettings().currency);

    const dist = [
      { label: "Pending", count: s.pending, color: "#94a3b8" },
      { label: "Picked Up", count: s.picked, color: "#0ea5e9" },
      { label: "In Transit", count: s.transit, color: "#f59e0b" },
      { label: "Delivered", count: s.delivered, color: "#10b981" },
      { label: "Returned", count: s.returned, color: "#ef4444" },
    ];
    const max = Math.max(1, ...dist.map((d) => d.count));
    document.getElementById("dist-bars").innerHTML = dist.map((d) => {
      const pct = Math.round((d.count / max) * 100);
      return '<div class="dist-row">' +
        '<span class="dist-label"><span class="dot" style="background:' + d.color + '"></span>' + d.label + "</span>" +
        '<span class="dist-track"><span class="dist-fill" style="width:' + pct + "%;background:" + d.color + '"></span></span>' +
        '<span class="dist-count">' + d.count + "</span></div>";
    }).join("");

    const list = Store.getInvoices().slice(0, 8);
    const tbody = document.getElementById("recent-tbody");
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="4"><div class="empty"><div class="empty-icon">' + icon("box") + '</div><h4>No invoices yet</h4><p>Create your first shipment to get started.</p></div></td></tr>';
      return;
    }
    const cur = Store.getSettings().currency;
    tbody.innerHTML = list.map((i) => {
      const total = Number(i.qty || 0) * Number(i.price || 0) + Number(i.delivery || 0);
      return '<tr data-id="' + esc(i.id) + '">' +
        '<td><div class="td-id">' + esc(i.id) + '</div><div class="td-sub">' + timeAgo(i.createdAt) + "</div></td>" +
        '<td><div class="td-main">' + esc(i.customer) + '</div><div class="td-sub">' + esc(i.product || "—") + "</div></td>" +
        "<td>" + statusBadge(i.status) + "</td>" +
        '<td class="td-amount">' + money(total, cur) + "</td></tr>";
    }).join("");
  }

  /* ======================================================================
     New Invoice
     ====================================================================== */
  function refreshDraftId(keep) {
    if (!keep) App.draftId = Store.makeId();
    const pvId = document.getElementById("pv-id");
    if (pvId) pvId.textContent = App.draftId;
    updatePreview();
  }

  function fieldVal(id) { return document.getElementById(id).value.trim(); }

  function updatePreview() {
    const cur = Store.getSettings().currency;
    const s = Store.getSettings();
    const qty = Number(document.getElementById("f-qty").value) || 0;
    const price = Number(document.getElementById("f-price").value) || 0;
    const delivery = Number(document.getElementById("f-delivery").value) || 0;
    const total = qty * price + delivery;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("pv-company", s.companyName);
    set("pv-tagline", s.tagline || "Courier & Delivery");
    set("pv-company-phone", s.phone);
    set("pv-customer", fieldVal("f-customer") || "—");
    set("pv-phone", fieldVal("f-phone") || "—");
    set("pv-address", fieldVal("f-address") || "—");
    set("pv-product", fieldVal("f-product") || "—");
    set("pv-qty", qty);
    set("pv-price", money(price, cur));
    set("pv-delivery", money(delivery, cur));
    set("pv-total", money(total, cur));
    set("pv-staff", currentUser() ? currentUser().name : "—");

    renderDraftQR();
  }

  function renderDraftQR() {
    const url = App.trackingUrl(App.draftId);
    drawQR("pv-qr", url);
    drawQR("receipt-qr", url);
    const rId = document.getElementById("receipt-id");
    if (rId) rId.textContent = App.draftId;
  }

  function drawQR(elId, text) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = "";
    try {
      new QRCode(el, { text: text, width: 110, height: 110, correctLevel: QRCode.CorrectLevel.M });
    } catch (e) { /* ignore */ }
  }

  function buildReceipt(data) {
    const cur = Store.getSettings().currency;
    const s = Store.getSettings();
    const qty = Number(data.qty) || 0;
    const price = Number(data.price) || 0;
    const delivery = Number(data.delivery) || 0;
    const total = qty * price + delivery;

    let html = "";
    html += '<div class="r-center"><div class="r-store">' + esc(s.companyName) + '</div>';
    html += '<div class="r-tag">' + esc(s.tagline || "Courier & Delivery") + "</div>";
    html += '<div>' + esc(s.phone) + "</div>";
    if (s.address) html += "<div>" + esc(s.address) + "</div>";
    html += "</div><hr class='r-line'>";

    html += '<div class="r-row"><span class="k">Invoice No.</span><span class="v">' + esc(data.id) + "</span></div>";
    html += '<div class="r-row"><span class="k">Date</span><span class="v">' + dateTimeFull(Date.now()) + "</span></div>";
    html += '<div class="r-row"><span class="k">Created by</span><span class="v">' + esc(data.staff) + "</span></div>";
    html += "<hr class='r-line'>";

    html += '<div class="r-section">Customer</div>';
    html += '<div class="r-row"><span class="k">Name</span><span class="v">' + esc(data.customer) + "</span></div>";
    html += '<div class="r-row"><span class="k">Phone</span><span class="v">' + esc(data.phone) + "</span></div>";
    if (data.address) html += '<div class="r-row"><span class="k">Address</span><span class="v">' + esc(data.address) + "</span></div>";
    html += "<hr class='r-line'>";

    html += '<div class="r-section">Items</div>';
    html += '<table class="r-items"><tr><th>Item</th><th>Qty</th><th>Total</th></tr>';
    html += "<tr><td>" + esc(data.product || "—") + "</td><td>" + qty + "</td><td>" + money(price * qty, cur) + "</td></tr>";
    html += "</table>";
    html += '<div class="r-row"><span class="k">Delivery fee</span><span class="v">' + money(delivery, cur) + "</span></div>";
    html += '<hr class="r-strong"><div class="r-row r-total"><span>COD Total</span><span>' + money(total, cur) + "</span></div>";
    html += "<hr class='r-line'>";

    html += '<div class="r-qr"><div id="receipt-qr"></div><div class="r-id" id="receipt-id">' + esc(data.id) + "</div></div>";
    html += '<div class="r-center"><div class="r-note">Scan to track your delivery in real time.</div>';
    html += "<div class='r-foot'>— Thank you for shopping with " + esc(s.companyName) + " —</div></div>";

    return html;
  }

  function saveInvoice() {
    const customer = fieldVal("f-customer");
    const phone = fieldVal("f-phone");
    if (!customer) { toast("Missing details", "Customer name is required.", "warn"); document.getElementById("f-customer").focus(); return; }
    if (!phone) { toast("Missing details", "Customer phone is required.", "warn"); document.getElementById("f-phone").focus(); return; }
    if (!fieldVal("f-product")) { toast("Missing details", "Please enter a product.", "warn"); document.getElementById("f-product").focus(); return; }

    const qty = Number(document.getElementById("f-qty").value) || 0;
    const price = Number(document.getElementById("f-price").value) || 0;
    if (qty <= 0 || price < 0) { toast("Missing details", "Enter a valid quantity and price.", "warn"); return; }

    const data = {
      id: App.draftId,
      customer, phone,
      address: fieldVal("f-address"),
      product: fieldVal("f-product"),
      qty, price,
      delivery: Number(document.getElementById("f-delivery").value) || 0,
      note: fieldVal("f-note"),
      staff: currentUser().name,
      status: "Pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      history: [{ status: "Pending", at: Date.now(), by: currentUser().name }],
    };

    Store.addInvoice(data);
    document.getElementById("receipt").innerHTML = buildReceipt(data);
    drawQR("receipt-qr", App.trackingUrl(data.id));
    document.getElementById("receipt-id").textContent = data.id;

    // prepare a fresh ID for the next invoice (preview keeps current values)
    App.draftId = Store.makeId();
    const pvId = document.getElementById("pv-id");
    if (pvId) pvId.textContent = App.draftId;
    renderDraftQR();

    toast("Invoice saved", data.id + " has been added to your records.", "success");
    openPrintPreview(data.id);
  }

  function openPrintPreview(id) {
    const inv = Store.getInvoice(id) || Store.getInvoices()[0];
    if (!inv) return;
    document.getElementById("receipt").innerHTML = buildReceipt(inv);
    drawQR("receipt-qr", App.trackingUrl(inv.id));
    document.getElementById("receipt-id").textContent = inv.id;
    openModal({
      title: "Print receipt",
      body: '<p style="margin:0;color:var(--muted)">The receipt is formatted for an <strong>80mm thermal printer</strong>.</p>' +
        '<div style="margin-top:14px;text-align:center"><button class="btn btn-gradient" id="btn-print-receipt">' + icon("printer") + " Print now</button>" +
        ' <button class="btn btn-secondary" id="btn-done-receipt">Done</button></div>',
      foot: "",
      onOpen: () => {
        document.getElementById("btn-print-receipt").addEventListener("click", () => window.print());
        document.getElementById("btn-done-receipt").addEventListener("click", () => closeTopModal());
      },
    });
  }

  function resetForm() {
    ["f-customer", "f-phone", "f-address", "f-product", "f-qty", "f-price", "f-delivery", "f-note"].forEach((id) => {
      document.getElementById(id).value = "";
    });
    document.getElementById("f-qty").value = "1";
    refreshDraftId(false);
    toast("New invoice ready", "Form cleared — start a new entry.", "info");
  }

  /* ======================================================================
     Invoices list
     ====================================================================== */
  function filteredInvoices() {
    const q = (document.getElementById("inv-search").value || "").trim().toLowerCase();
    const f = document.getElementById("inv-filter").value;
    return Store.getInvoices().filter((i) => {
      if (f !== "all" && i.status !== f) return false;
      if (!q) return true;
      return (i.id + " " + i.customer + " " + i.phone + " " + i.product).toLowerCase().includes(q);
    });
  }

  function renderInvoices() {
    const list = filteredInvoices();
    const tbody = document.getElementById("inv-tbody");
    const emptyEl = document.getElementById("inv-empty");
    const cur = Store.getSettings().currency;
    tbody.innerHTML = "";
    if (!list.length) {
      tbody.hidden = true;
      emptyEl.hidden = false;
      return;
    }
    tbody.hidden = false;
    emptyEl.hidden = true;

    const isAdmin = currentUser() && currentUser().role === "Admin";
    tbody.innerHTML = list.map((i) => {
      const total = Number(i.qty || 0) * Number(i.price || 0) + Number(i.delivery || 0);
      const opts = Store.STATUSES.map((st) => '<option value="' + st + '"' + (st === i.status ? " selected" : "") + ">" + st + "</option>").join("");
      return '<tr data-id="' + esc(i.id) + '">' +
        '<td><div class="td-id">' + esc(i.id) + '</div><div class="td-sub">' + dateTime(i.createdAt) + "</div></td>" +
        '<td><div class="td-main">' + esc(i.customer) + '</div><div class="td-sub">' + esc(i.phone) + "</div></td>" +
        '<td><div class="td-sub">' + esc(i.product || "—") + '</div><div class="td-sub">' + esc(i.staff) + "</div></td>" +
        '<td class="td-amount">' + money(total, cur) + "</td>" +
        "<td>" + statusBadge(i.status) + "</td>" +
        '<td><div class="row-actions">' +
        '<select class="select status-quick" data-id="' + esc(i.id) + '" style="width:150px;padding:6px 30px 6px 10px;font-size:13px">' + opts + "</select>" +
        '<button class="icon-btn" data-act="view" title="View details">' + icon("eye") + "</button>" +
        '<button class="icon-btn" data-act="print" title="Print receipt">' + icon("printer") + "</button>" +
        (isAdmin ? '<button class="icon-btn" data-act="delete" title="Delete" style="color:var(--danger)">' + icon("trash") + "</button>" : "") +
        "</div></td></tr>";
    }).join("");
  }

  function onTableClick(e) {
    const btn = e.target.closest("[data-act]");
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    const id = tr.getAttribute("data-id");
    if (btn) {
      const act = btn.getAttribute("data-act");
      if (act === "view") openDetail(id);
      else if (act === "print") { const inv = Store.getInvoice(id); if (inv) openPrintPreview(id); }
      else if (act === "delete") confirmDelete(id);
      return;
    }
    // clicking the row itself (but not a control) opens detail
    if (!e.target.closest("select") && !e.target.closest("button")) openDetail(id);
  }

  function confirmDelete(id) {
    const inv = Store.getInvoice(id);
    openModal({
      title: "Delete invoice?",
      body: "<p style='margin:0'>You're about to permanently delete <strong>" + esc(inv.id) + "</strong> for <strong>" + esc(inv.customer) + "</strong>. This cannot be undone.</p>",
      foot: '<button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-danger" id="btn-confirm-delete">Delete</button>',
      onOpen: () => {
        document.getElementById("btn-confirm-delete").addEventListener("click", () => {
          Store.deleteInvoice(id);
          closeTopModal();
          toast("Invoice deleted", inv.id + " was removed.", "success");
          renderInvoices();
          renderDashboard();
        });
      },
    });
  }

  function openDetail(id) {
    const i = Store.getInvoice(id);
    if (!i) return;
    const cur = Store.getSettings().currency;
    const total = Number(i.qty || 0) * Number(i.price || 0) + Number(i.delivery || 0);
    const isAdmin = currentUser() && currentUser().role === "Admin";

    const history = (i.history || []).slice().reverse().map((h, idx) =>
      '<li class="' + (idx === 0 ? "current" : "") + '"><span class="t-dot"></span>' +
      '<div class="t-status">' + esc(h.status) + '</div>' +
      '<div class="t-meta">' + esc(h.by || "System") + " · " + dateTimeFull(h.at) + "</div></li>"
    ).join("");

    const opts = Store.STATUSES.map((st) => '<option value="' + st + '"' + (st === i.status ? " selected" : "") + ">" + st + "</option>").join("");

    const body =
      '<div class="detail-list">' +
      '<div class="dl-item full"><div class="dl-key">Invoice ID</div><div class="dl-val td-id">' + esc(i.id) + "</div></div>" +
      '<div class="dl-item"><div class="dl-key">Customer</div><div class="dl-val">' + esc(i.customer) + "</div></div>" +
      '<div class="dl-item"><div class="dl-key">Phone</div><div class="dl-val">' + esc(i.phone) + "</div></div>" +
      '<div class="dl-item full"><div class="dl-key">Address</div><div class="dl-val">' + esc(i.address || "—") + "</div></div>" +
      '<div class="dl-item"><div class="dl-key">Product</div><div class="dl-val">' + esc(i.product || "—") + "</div></div>" +
      '<div class="dl-item"><div class="dl-key">Quantity</div><div class="dl-val">' + esc(i.qty) + "</div></div>" +
      '<div class="dl-item"><div class="dl-key">Item total</div><div class="dl-val">' + money(Number(i.qty || 0) * Number(i.price || 0), cur) + "</div></div>" +
      '<div class="dl-item"><div class="dl-key">Delivery fee</div><div class="dl-val">' + money(i.delivery, cur) + "</div></div>" +
      '<div class="dl-item full"><div class="dl-key">COD Total</div><div class="dl-val td-amount">' + money(total, cur) + "</div></div>" +
      '<div class="dl-item"><div class="dl-key">Created</div><div class="dl-val">' + dateTimeFull(i.createdAt) + "</div></div>" +
      '<div class="dl-item"><div class="dl-key">Created by</div><div class="dl-val">' + esc(i.staff || "—") + "</div></div>" +
      "</div>" +
      '<div class="section-title">Delivery status</div>' +
      (isAdmin
        ? '<div class="field"><select id="detail-status" class="select">' + opts + "</select></div>"
        : '<div>' + statusBadge(i.status) + "</div>") +
      '<div class="section-title">Status history</div>' +
      '<ul class="timeline">' + (history || '<li><div class="t-meta">No history</div></li>') + "</ul>";

    const foot =
      (isAdmin ? '<button class="btn btn-danger-soft" id="btn-detail-delete">' + icon("trash") + " Delete</button>" : "") +
      '<span style="flex:1"></span>' +
      '<button class="btn btn-secondary" id="btn-detail-print">' + icon("printer") + " Print</button>" +
      (isAdmin ? '<button class="btn btn-primary" id="btn-detail-save">' + icon("check") + " Save changes</button>" : '<button class="btn btn-primary" data-close>Close</button>');

    openModal({
      title: "Invoice details",
      body: body,
      foot: foot,
      onOpen: () => {
        const delBtn = document.getElementById("btn-detail-delete");
        if (delBtn) delBtn.addEventListener("click", () => { closeTopModal(); confirmDelete(id); });
        const prBtn = document.getElementById("btn-detail-print");
        if (prBtn) prBtn.addEventListener("click", () => openPrintPreview(id));
        const saveBtn = document.getElementById("btn-detail-save");
        if (saveBtn) saveBtn.addEventListener("click", () => {
          const st = document.getElementById("detail-status").value;
          if (st !== i.status) {
            Store.setStatus(id, st, currentUser().name);
            toast("Status updated", id + " → " + st, "success");
          }
          closeTopModal();
          renderInvoices();
          renderDashboard();
        });
      },
    });
  }

  /* ======================================================================
     Track & Update
     ====================================================================== */
  function startScanner() {
    if (App.scanOpen) return;
    const box = document.getElementById("scanner-box");
    if (!box || !window.Html5Qrcode) return;
    const idle = document.getElementById("scanner-idle");
    App.scanOpen = true;
    App.scanner = new Html5Qrcode("scanner-box");
    App.scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (text) => {
        const id = extractId(text);
        if (id) {
          if (navigator.vibrate) navigator.vibrate(100);
          loadTrackResult(id);
        } else {
          toast("Not a Handysz QR", "This QR code isn't from this system.", "warn");
        }
      },
      () => {}
    ).then(() => {
      if (!App.scanOpen) return;
      if (idle) idle.hidden = true;
      document.getElementById("scan-meta").textContent = "Camera active — point at a receipt QR code.";
    }).catch((err) => {
      App.scanOpen = false;
      if (idle) idle.hidden = false;
      document.getElementById("scan-meta").textContent = "Camera unavailable — search by invoice ID instead.";
      console.warn("Scanner error:", err);
    });
  }

  function stopScanner() {
    if (App.scanner && App.scanOpen) {
      App.scanOpen = false;
      App.scanner.stop().catch(() => {});
      App.scanner = null;
      const idle = document.getElementById("scanner-idle");
      if (idle) idle.hidden = false;
      document.getElementById("scan-meta").textContent = "Scanner is idle — tap to start.";
    }
  }

  function extractId(text) {
    text = String(text || "").trim();
    if (/^INV-[\w-]+$/i.test(text)) return text.toUpperCase();
    try {
      const u = new URL(text);
      return (u.searchParams.get("id") || "").toUpperCase() || null;
    } catch (e) { return null; }
  }

  function loadTrackResult(id) {
    const inv = Store.getInvoice(id);
    const holder = document.getElementById("track-result");
    if (!inv) {
      holder.innerHTML = '<div class="card"><div class="empty"><div class="empty-icon">' + icon("search") + '</div><h4>Invoice not found</h4><p>No record matches <strong>' + esc(id) + "</strong>. Check the ID and try again.</p></div></div>";
      return;
    }
    holder.innerHTML = renderTrackResult(inv);
    if (holder.scrollIntoView) holder.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderTrackResult(inv) {
    const cur = Store.getSettings().currency;
    const total = Number(inv.qty || 0) * Number(inv.price || 0) + Number(inv.delivery || 0);
    const history = (inv.history || []).slice().reverse().map((h, idx) =>
      '<li class="' + (idx === 0 ? "current" : "") + '"><span class="t-dot"></span>' +
      '<div class="t-status">' + esc(h.status) + '</div>' +
      '<div class="t-meta">' + esc(h.by || "System") + " · " + dateTimeFull(h.at) + "</div></li>"
    ).join("");

    return '<div class="card" style="overflow:hidden">' +
      '<div class="card-head"><div><h3>' + esc(inv.customer) + '</h3><div class="sub">' + esc(inv.id) + "</div></div>" +
      "<div>" + statusBadge(inv.status) + "</div></div>" +
      '<div class="card-pad">' +
      '<div class="detail-list" style="margin-bottom:8px">' +
      '<div class="dl-item"><div class="dl-key">Phone</div><div class="dl-val">' + esc(inv.phone) + "</div></div>" +
      '<div class="dl-item"><div class="dl-key">Product</div><div class="dl-val">' + esc(inv.product || "—") + "</div></div>" +
      '<div class="dl-item full"><div class="dl-key">Address</div><div class="dl-val">' + esc(inv.address || "—") + "</div></div>" +
      '<div class="dl-item"><div class="dl-key">Quantity</div><div class="dl-val">' + esc(inv.qty) + "</div></div>" +
      '<div class="dl-item"><div class="dl-key">COD Total</div><div class="dl-val td-amount">' + money(total, cur) + "</div></div>" +
      "</div>" +
      '<div class="section-title">Update status</div>' +
      '<div class="field-group" style="flex-direction:row;flex-wrap:wrap">' +
      '<select id="track-status" class="select" style="flex:1;min-width:180px">' +
      Store.STATUSES.map((st) => '<option value="' + st + '"' + (st === inv.status ? " selected" : "") + ">" + st + "</option>").join("") +
      "</select>" +
      '<button class="btn btn-success" id="btn-track-update">' + icon("check") + " Confirm update</button>" +
      "</div>" +
      '<div class="section-title">History</div>' +
      '<ul class="timeline">' + (history || '<li><div class="t-meta">No history</div></li>') + "</ul>" +
      "</div></div>";
  }

  function onTrackResultClick(e) {
    if (e.target.closest("#btn-track-update")) {
      const sel = document.getElementById("track-status");
      const id = (document.querySelector("#track-result .card-head .sub") || {}).textContent || "";
      if (!sel || !id) return;
      if (sel.value !== Store.getInvoice(id).status) {
        Store.setStatus(id, sel.value, currentUser().name);
        toast("Status updated", id + " → " + sel.value, "success");
        loadTrackResult(id);
        renderDashboard();
      }
    }
  }

  /* ======================================================================
     Settings
     ====================================================================== */
  function renderSettingsSummary() {
    const s = Store.getSettings();
    document.getElementById("setting-company").value = s.companyName;
    document.getElementById("setting-tagline").value = s.tagline || "";
    document.getElementById("setting-phone").value = s.phone;
    document.getElementById("setting-address").value = s.address || "";
    document.getElementById("setting-currency").value = s.currency;
  }

  function renderSettings() {
    renderSettingsSummary();
    renderStaffList();
  }

  function renderStaffList() {
    const list = Store.getStaff();
    const el = document.getElementById("staff-list");
    const cur = currentUser();
    el.innerHTML = list.map((s) =>
      '<div class="staff-row">' +
      '<div class="user-avatar">' + initials(s.name) + "</div>" +
      '<div class="s-info"><div class="s-name">' + esc(s.name) + " " + (s.id === cur.id ? '<span class="role-badge" style="margin-left:6px">You</span>' : "") + '</div>' +
      '<div class="s-meta">' + esc(s.id) + " · " + (s.active !== false ? "Active" : "Inactive") + "</div></div>" +
      '<span class="role-badge' + (s.role === "Admin" ? " admin" : "") + '">' + esc(s.role) + "</span>" +
      (cur.role === "Admin" && s.id !== cur.id
        ? '<button class="icon-btn" data-staff-del="' + esc(s.id) + '" title="Remove">' + icon("trash") + "</button>"
        : "") +
      "</div>"
    ).join("");
  }

  function saveSettingsForm() {
    const data = {
      companyName: document.getElementById("setting-company").value.trim() || "Handysz",
      tagline: document.getElementById("setting-tagline").value.trim(),
      phone: document.getElementById("setting-phone").value.trim(),
      address: document.getElementById("setting-address").value.trim(),
      currency: document.getElementById("setting-currency").value.trim() || "৳",
    };
    Store.saveSettings(data);
    renderSettingsSummary();
    toast("Settings saved", "Business profile updated.", "success");
    renderDashboard();
  }

  function openAddStaff() {
    openModal({
      title: "Add staff member",
      body:
        '<div class="field"><label>Full name <span class="req">*</span></label><input id="ns-name" class="input" placeholder="e.g. Rider Karim"></div>' +
        '<div class="field"><label>Staff ID <span class="req">*</span></label><input id="ns-id" class="input" placeholder="e.g. ST-003"></div>' +
        '<div class="field"><label>Password <span class="req">*</span></label><input id="ns-pass" class="input" type="text" placeholder="Min 6 characters"></div>' +
        '<div class="field"><label>Role</label><select id="ns-role" class="select"><option value="Staff">Staff</option><option value="Admin">Admin</option></select></div>',
      foot: '<button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" id="btn-confirm-add-staff">Add member</button>',
      onOpen: () => {
        document.getElementById("btn-confirm-add-staff").addEventListener("click", () => {
          const name = document.getElementById("ns-name").value.trim();
          const id = document.getElementById("ns-id").value.trim();
          const pass = document.getElementById("ns-pass").value.trim();
          const role = document.getElementById("ns-role").value;
          if (!name || !id || !pass) { toast("Missing details", "Fill in all fields.", "warn"); return; }
          if (pass.length < 6) { toast("Weak password", "Use at least 6 characters.", "warn"); return; }
          const res = Store.addStaff({ id, name, password: pass, role, active: true });
          if (!res.ok) { toast("Could not add", res.error, "error"); return; }
          closeTopModal();
          toast("Staff added", name + " can now sign in.", "success");
          renderStaffList();
        });
      },
    });
  }

  function resetPassword(id) {
    openModal({
      title: "Reset password",
      body: '<p style="margin:0 0 14px">Set a new password for <strong>' + esc(id) + "</strong>.</p>" +
        '<div class="field"><label>New password</label><input id="rp-pass" class="input" type="text" placeholder="Min 6 characters"></div>',
      foot: '<button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" id="btn-rp-save">Save</button>',
      onOpen: () => {
        document.getElementById("btn-rp-save").addEventListener("click", () => {
          const p = document.getElementById("rp-pass").value.trim();
          if (p.length < 6) { toast("Weak password", "Use at least 6 characters.", "warn"); return; }
          Store.updateStaff(id, { password: p });
          closeTopModal();
          toast("Password reset", id + " updated.", "success");
        });
      },
    });
  }

  function doExport() {
    const blob = new Blob([Store.exportData()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "handysz-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("Backup exported", "Your data was downloaded as JSON.", "success");
  }

  function doImport(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const res = Store.importData(reader.result);
      if (!res.ok) { toast("Import failed", res.error, "error"); return; }
      toast("Import complete", "Backup restored successfully.", "success");
      renderSettings();
      renderDashboard();
    };
    reader.readAsText(file);
  }

  function doLoadDemo() {
    const n = Store.loadDemo();
    toast("Demo data loaded", n + " sample invoices added.", "success");
    renderDashboard();
  }

  function doClearData() {
    openModal({
      title: "Erase all data?",
      body: "<p style='margin:0'>This permanently removes every invoice and resets staff to defaults. Consider exporting a backup first.</p>",
      foot: '<button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-danger" id="btn-confirm-clear">Erase everything</button>',
      onOpen: () => {
        document.getElementById("btn-confirm-clear").addEventListener("click", () => {
          Store.clearAll();
          closeTopModal();
          toast("Data cleared", "App has been reset to defaults.", "success");
          renderSettings();
          renderDashboard();
        });
      },
    });
  }

  /* ======================================================================
     Modal helper
     ====================================================================== */
  function openModal(opts) {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.innerHTML = '<div class="modal">' +
      '<div class="modal-head"><h3>' + esc(opts.title) + "</h3>" +
      '<button class="icon-btn" data-close>' + icon("x") + "</button></div>" +
      '<div class="modal-body">' + (opts.body || "") + "</div>" +
      (opts.foot !== "" ? '<div class="modal-foot">' + (opts.foot || "") + "</div>" : "") +
      "</div>";
    document.body.appendChild(wrap);

    wrap.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => wrap.remove()));
    wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) wrap.remove(); });

    if (opts.onOpen) opts.onOpen(wrap);
  }

  /* ======================================================================
     Tracking URL + global helpers
     ====================================================================== */
  App.trackingUrl = function (id) {
    const base = location.href.split("#")[0];
    // point at track.html (same folder), keeping relative URLs working anywhere
    const idx = base.lastIndexOf("/");
    const dir = idx === -1 ? "" : base.slice(0, idx + 1);
    return dir + "track.html?id=" + encodeURIComponent(id);
  };

  window.App = App;
  window.openInvoiceDetail = openDetail;
  /* ======================================================================
     Bootstrapping / event wiring
     ====================================================================== */
  function bindEvents() {
    // nav
    document.querySelectorAll("[data-view]").forEach((el) => {
      el.addEventListener("click", () => navigate(el.getAttribute("data-view")));
    });

    // login
    document.getElementById("login-btn").addEventListener("click", doLogin);
    document.getElementById("login-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
    document.getElementById("login-staff").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
    document.getElementById("login-toggle").addEventListener("click", () => {
      const p = document.getElementById("login-pass");
      const on = p.type === "password";
      p.type = on ? "text" : "password";
      document.getElementById("login-toggle").innerHTML = icon(on ? "eyeOff" : "eye");
    });
    document.getElementById("logout-btn").addEventListener("click", doLogout);

    // global quick add (topbar +)
    document.querySelectorAll("[data-nav-new]").forEach((b) => b.addEventListener("click", () => navigate("new")));

    // new invoice form
    const form = document.getElementById("invoice-form");
    form.addEventListener("submit", (e) => { e.preventDefault(); saveInvoice(); });
    document.getElementById("btn-reset").addEventListener("click", resetForm);
    ["f-customer", "f-phone", "f-address", "f-product", "f-qty", "f-price", "f-delivery"].forEach((id) => {
      document.getElementById(id).addEventListener("input", debounce(updatePreview, 120));
    });

    // invoices
    document.getElementById("inv-search").addEventListener("input", debounce(renderInvoices, 160));
    document.getElementById("inv-filter").addEventListener("change", renderInvoices);
    const invBody = document.getElementById("inv-tbody");
    invBody.addEventListener("click", onTableClick);
    invBody.addEventListener("change", (e) => {
      const sel = e.target.closest("select.status-quick");
      if (!sel) return;
      Store.setStatus(sel.getAttribute("data-id"), sel.value, currentUser().name);
      toast("Status updated", "Invoice is now " + sel.value + ".", "success");
      renderDashboard();
    });
    document.getElementById("recent-tbody").addEventListener("click", onTableClick);

    // track
    document.getElementById("btn-scan-toggle").addEventListener("click", () => {
      if (App.scanOpen) stopScanner();
      else startScanner();
    });
    document.getElementById("btn-track-search").addEventListener("click", () => {
      const q = document.getElementById("track-search").value.trim();
      if (!q) { toast("Enter an ID", "Type or scan an invoice ID first.", "warn"); return; }
      loadTrackResult(q);
    });
    document.getElementById("track-search").addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("btn-track-search").click();
    });
    document.getElementById("track-result").addEventListener("click", onTrackResultClick);

    // settings
    document.getElementById("btn-save-settings").addEventListener("click", saveSettingsForm);
    document.getElementById("btn-add-staff").addEventListener("click", openAddStaff);
    document.getElementById("staff-list").addEventListener("click", (e) => {
      const del = e.target.closest("[data-staff-del]");
      if (del) {
        const id = del.getAttribute("data-staff-del");
        Store.removeStaff(id);
        toast("Staff removed", id + " was deleted.", "success");
        renderStaffList();
      }
    });
    document.getElementById("btn-export").addEventListener("click", doExport);
    document.getElementById("btn-import").addEventListener("click", () => document.getElementById("import-file").click());
    document.getElementById("import-file").addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) doImport(e.target.files[0]);
      e.target.value = "";
    });
    document.getElementById("btn-demo").addEventListener("click", doLoadDemo);
    document.getElementById("btn-clear").addEventListener("click", doClearData);

    // esc closes modals
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeTopModal(); });
  }

  function boot() {
    bindEvents();
    if (requireAuth()) showApp();
    else showLogin();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
