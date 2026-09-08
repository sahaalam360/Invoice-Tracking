# Handysz Courier — Invoice & Delivery Tracking

A professional, installable web app for courier businesses: create invoices, print
**80mm thermal receipts** with QR codes, and track / update delivery status by
scanning those QR codes.

Everything runs **fully offline in the browser** — no server or database required.
Data is stored in `localStorage`, so it works by simply opening `index.html`.

## ✨ Features

- **Staff login** with roles (Admin vs Staff). Demo: `ST-001` / `admin123`
- **Dashboard** — totals, pending/delivered counts, COD collected, status distribution, recent activity
- **New Invoice** — live 80mm thermal receipt preview + print, with per-invoice QR code
- **Invoices** — search, filter by status, quick status updates, details with full status history, print, delete (admin)
- **Track & Update** — camera QR scanner or manual ID lookup to update delivery status
- **Public tracking page** (`track.html`) — customers scan their receipt to see progress
- **Settings** — business profile (name/phone/address/currency), staff management, JSON backup/import, demo data
- **PWA** — installable, works offline, custom app icon

## 🚀 Run it

Static site — open `Invoice app/index.html` in a browser, or serve it locally:

```bash
cd "Invoice app"
python3 -m http.server 8080
```

Then visit `http://localhost:8080`. (Camera scanning requires `https` or `localhost`.)

## 🔑 Demo accounts

| Staff ID | Password   | Role  |
| -------- | ---------- | ----- |
| ST-001   | admin123   | Admin |
| ST-002   | rider123   | Staff |

## 📁 Structure

```
Invoice app/
├── index.html          # Main app (login + dashboard + SPA views)
├── login.html          # Redirect to the sign-in screen
├── track.html          # Public customer-facing tracking page
├── manifest.webmanifest# PWA manifest
├── sw.js               # Service worker (offline caching)
├── css/style.css       # Design system
├── js/
│   ├── store.js        # Data layer (localStorage)
│   ├── ui.js           # Shared UI helpers (icons, toasts, formatting)
│   ├── app.js          # Application logic / views
│   └── vendor/         # qrcodejs + html5-qrcode (self-hosted)
└── icons/              # App icons
```

## 🖨️ Printing

Receipts are formatted for **80mm thermal printers**. In the print dialog set
margins to `None` and scale to `100%` for best results.
