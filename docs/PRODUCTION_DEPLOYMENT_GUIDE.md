# Production Deployment & Readiness Guide
**HOTEL_CRM Zero-Cost High-Performance Architecture**

This guide provides the complete, step-by-step procedure to deploy the entire **HOTEL_CRM** platform to production for **$0.00/month** with **zero cold starts**, enterprise-grade reliability, and high-speed global delivery.

---

## 1. System Architecture Overview

```
                      ┌──────────────────────────────────────────────┐
                      │              Customer's Phone                │
                      │  Scans Table QR: https://menu.domain/table/.. │
                      └──────────────────────┬───────────────────────┘
                                             │ HTTPS
                                             ▼
                               ┌───────────────────────────┐
                               │     Vercel Edge CDN       │
                               │  customer-menu (Next.js)  │
                               └─────────────┬─────────────┘
                                             │ REST / WebSocket
                                             ▼
┌───────────────────────────┐  HTTPS   ┌───────────────────────────┐
│       UptimeRobot         ├─────────►│        Render.com         │
│  (10m ping: /health/live) │          │  Rust Axum API (Docker)   │
└───────────────────────────┘          └─────────────┬─────────────┘
                                                     │ SQL (Port 6543)
                                                     ▼
                                       ┌───────────────────────────┐
                                       │     Supabase Cloud        │
                                       │  PostgreSQL (Persistent)  │
                                       └─────────────▲─────────────┘
                                                     │ SQL / Sync
                                                     │
                                       ┌─────────────┴─────────────┐
                                       │  Local Restaurant POS PC  │
                                       │    Angular 21 Admin CRM   │
                                       │  + USB Thermal Printers   │
                                       └───────────────────────────┘
```

### Free Tier Allocation Matrix

| Component | Platform | Free Tier Quota | Measured Usage | Cold-Start Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **Database** | **Supabase** | 500 MB Storage, Unlimited Queries | ~15 MB | Never pauses with daily restaurant traffic |
| **Backend API** | **Render** | 750 Instance Hours/Month, 512 MB RAM | ~28 MB RAM, 744 hrs/mo | Kept 100% awake via 10m ping to `/health/live` |
| **Uptime Keeper** | **UptimeRobot** | 50 Monitors, 5m intervals | 1 Monitor | Pings `/health/live` every 10 minutes |
| **Customer Web** | **Vercel** | 100 GB Bandwidth/Month, Global CDN | ~200 MB / mo | 0ms static, ~200ms dynamic edge execution |
| **Admin POS** | **Local PC** | Unlimited (Local Machine) | Native | Direct access to hardware thermal printers |

---

## 2. Phase 1: Database Setup (Supabase)

### Step 1.1: Create Project & Region
1. Log in to [supabase.com](https://supabase.com).
2. Click **New Project**.
3. Choose a name (e.g., `hotel-crm-prod`).
4. Select the region closest to the restaurant (e.g., `ap-south-1` Mumbai).
5. Set a strong database password and **save it securely**.

### Step 1.2: Obtain Connection String
1. Go to **Project Settings** $\rightarrow$ **Database**.
2. Scroll to **Connection String** and select the **URI** tab.
3. Choose **Transaction Pooler** (Mode: `Transaction`, Port: `6543`) for high-concurrency API performance:
   ```
   postgresql://postgres.[PROJECT_REF]:[YOUR_PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require
   ```

### Step 1.3: Run Database Migrations
1. In the Supabase Dashboard, open **SQL Editor**.
2. Create a new query, paste the contents of [`supabase/schema.sql`](file:///c:/Users/sudip/OneDrive/Desktop/webProjects/HOTEL_CRM/supabase/schema.sql), and click **Run**.
3. (Optional) Run [`supabase/mock_data.sql`](file:///c:/Users/sudip/OneDrive/Desktop/webProjects/HOTEL_CRM/supabase/mock_data.sql) if you wish to seed demo menu categories and tables.
4. Verify that tables (`restaurants`, `tables`, `menu_items`, `orders`, `order_items`, `payments`, etc.) appear under **Table Editor**.

### Step 1.4: Copy API Credentials
Under **Project Settings** $\rightarrow$ **API**, copy:
- **Project URL**: `https://[PROJECT_REF].supabase.co`
- **JWT Secret**: Found under *JWT Settings* (used for admin authentication).

---

## 3. Phase 2: Backend API Deployment (Render)

The backend compiles from the production multi-stage Dockerfile located at [`backend/api/Dockerfile`](file:///c:/Users/sudip/OneDrive/Desktop/webProjects/HOTEL_CRM/backend/api/Dockerfile).

### Step 2.1: Create Web Service on Render
1. Log in to [render.com](https://render.com).
2. Click **New +** $\rightarrow$ **Web Service**.
3. Connect your GitHub repository.
4. Configure the service settings:
   - **Name**: `hotel-crm-api` (or custom name)
   - **Region**: Choose closest to database (e.g., `Singapore` or `Frankfurt`)
   - **Branch**: `main`
   - **Root Directory**: `backend/api`
   - **Runtime**: **Docker**
   - **Instance Type**: **Free (0.1 CPU, 512 MB RAM)**

### Step 2.2: Add Environment Variables
In the Render configuration screen, expand **Environment Variables** and add:

| Key | Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://postgres.[REF]:[PASS]@aws-0-[REG].pooler.supabase.com:6543/postgres?sslmode=require` | Supabase Transaction Pooler URI |
| `PORT` | `3000` | Port Axum listens on inside container |
| `ENVIRONMENT` | `production` | Production mode |
| `ALLOWED_ORIGINS` | `https://*.vercel.app,http://localhost:4200` | Allowed CORS origins for customer web and admin |
| `SUPABASE_URL` | `https://[PROJECT_REF].supabase.co` | Supabase project endpoint |
| `SUPABASE_JWT_SECRET` | `[YOUR_SUPABASE_JWT_SECRET]` | JWT signing and validation secret |

### Step 2.3: Deploy & Verify
1. Click **Deploy Web Service**.
2. Wait ~3–4 minutes for the multi-stage Docker build to compile the Rust binary.
3. Once the status shows **Live**, copy your public URL:
   ```
   https://hotel-crm-api-xxxx.onrender.com
   ```
4. Test the health endpoint in your browser or terminal:
   ```bash
   curl -I https://hotel-crm-api-xxxx.onrender.com/health/live
   ```
   Expected response: `HTTP/2 200 OK`.

---

## 4. Phase 3: Zero Cold-Start Setup (UptimeRobot)

Render free instances spin down after 15 minutes of zero traffic. We eliminate this delay completely by configuring a lightweight heartbeat ping every 10 minutes.

- $31 \text{ days} \times 24 \text{ hours} = 744 \text{ hours}$.
- 744 hours is **under** Render's monthly quota of **750 free hours**.
- One service running 24/7 stays 100% free forever without cold starts.

### Step-by-Step Heartbeat Configuration:
1. Sign up for free at [uptimerobot.com](https://uptimerobot.com) (or [cron-job.org](https://cron-job.org)).
2. Click **+ Add New Monitor**.
3. Fill in the monitor settings:
   - **Monitor Type**: `HTTP(s)`
   - **Friendly Name**: `Hotel CRM API Warm-Keeper`
   - **URL (or IP)**: `https://hotel-crm-api-xxxx.onrender.com/health/live`
   - **Monitoring Interval**: **Every 10 minutes** (or 5 minutes)
4. Click **Create Monitor**.

> [!TIP]
> The `/health/live` route executes entirely in memory without touching Supabase or disk. It consumes less than 0.001% CPU per ping and keeps Render permanently awake.

---

## 5. Phase 4: Customer Menu Deployment (Vercel)

The customer frontend is built on **Next.js 16** with Turbopack and React 19.

### Step 4.1: Import into Vercel
1. Log in to [vercel.com](https://vercel.com) and click **Add New...** $\rightarrow$ **Project**.
2. Select your repository.
3. In **Configure Project**, click **Edit** next to **Root Directory**:
   - Set Root Directory to: **`customer-menu`**
   - Click **Save**.
4. Framework Preset will auto-detect **Next.js**.

### Step 4.2: Configure Environment Variables
Expand **Environment Variables** in Vercel and enter:

| Key | Value | Notes |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | `https://hotel-crm-api-xxxx.onrender.com` | Your live Render backend URL |
| `NEXT_PUBLIC_RESTAURANT_ID` | `00000000-0000-0000-0000-000000000001` | Your restaurant UUID from Supabase |

### Step 4.3: Deploy & Verify Table Scan
1. Click **Deploy**.
2. Once the build finishes, test a live table link:
   ```
   https://your-customer-menu.vercel.app/table/tbl-01
   ```
3. Verify:
   - Menu categories and items load from Supabase.
   - Items can be added to the cart.
   - Order placement triggers properly.

---

## 6. Phase 5: Admin POS Setup (Local Restaurant Machine)

The Admin CRM operates from the cashier / billing desk to manage live orders and print physical ESC/POS thermal receipts.

### Step 5.1: Configure Backend & Customer QR Menu URLs
In [`frontend/restaurant-web/src/environments/environment.prod.ts`](file:///c:/Users/sudip/OneDrive/Desktop/webProjects/HOTEL_CRM/frontend/restaurant-web/src/environments/environment.prod.ts) (and `environment.desktop.ts`):
```typescript
export const environment = {
  production: true,
  apiBaseUrl: 'https://hotel-crm-api-xxxx.onrender.com/api/v1',
  customerMenuUrl: 'https://your-customer-menu.vercel.app', // <--- Your Vercel Customer Menu URL
  supabaseUrl: 'https://[PROJECT_REF].supabase.co',
  supabaseAnonKey: 'sb_publishable_...',
  useMockRepositories: false,
  isDesktop: true,
};
```

> [!TIP]
> **Dynamic QR Domain Override (Without Rebuilding)**:
> In the Admin POS browser console or settings, you can override the Customer Menu URL dynamically on the fly:
> ```javascript
> localStorage.setItem('hotel_crm_customer_menu_url', 'https://your-customer-menu.vercel.app');
> ```
> The Table QR Generator automatically reads this key first, then falls back to `environment.customerMenuUrl`.

### Step 5.2: Install on the Restaurant Computer

You have two installation methods for the restaurant cashier:

#### Method A: Native Desktop App (Recommended — Tauri .msi / .exe)
1. On your development machine, build the native Windows installer:
   ```bash
   npm run tauri:build
   ```
2. The standalone installer is generated at:
   `src-tauri/target/release/bundle/msi/HOTEL CRM_1.0.0_x64_en-US.msi` (or `.exe`).
3. Copy this installer to the restaurant's computer via USB or Google Drive and double-click to install.
4. It creates a desktop icon, launches in a dedicated kiosk-capable window, and communicates natively with Windows thermal printer spoolers (`winspool.drv`).

#### Method B: Browser PWA / Web POS
1. Open Google Chrome or Microsoft Edge on the restaurant computer.
2. Navigate to your local or hosted Admin POS URL (e.g., `http://localhost:4200` or your Cloudflare Pages domain).
3. Click the **"Install Hotel CRM"** icon in the browser address bar to install it as a desktop Progressive Web App (PWA).

### Step 5.3: Thermal Receipt Printer Configuration
1. Connect the 80mm or 58mm thermal receipt printer via USB or local network (e.g. `192.168.1.100:9100`).
2. Open Admin CRM $\rightarrow$ **Settings** $\rightarrow$ **Hardware / Printers**.
3. Select your Windows spooler printer name or enter the printer IP.
4. Click **Test Print** to verify ESC/POS receipt font alignment and paper cutter.

---

## 7. Production Verification & Go-Live Checklist

Complete this checklist before serving live restaurant customers:

- [ ] **Database Persistence**: Supabase project created, schema loaded, and connection pool verified.
- [ ] **Backend 24/7 Liveness**: Render deployment active, `curl https://<api>/health/live` returns `200 OK`.
- [ ] **Heartbeat Pinger**: UptimeRobot monitor active with green 10-minute check intervals.
- [ ] **CORS Origins**: Render `ALLOWED_ORIGINS` contains the exact Vercel domain (`https://<project>.vercel.app`).
- [ ] **Table QR Standees**: QR codes printed pointing to `https://<vercel-domain>/table/[token]`.
- [ ] **Delivered Orders Feed**: Tested customer checkout; items group cleanly in Blinkit style without redundant card wrappers.
- [ ] **Offline POS Warning**: When Admin POS computer is disconnected, customer checkout shows the "Call Staff for Order Confirmation" modal instead of hanging.
- [ ] **Billing Invariants**: SGST and CGST percentages match the admin database configuration across customer bill preview and thermal receipt printouts.

---

## 8. Emergency Recovery & Troubleshooting

### Issue A: Customer app shows "Network Error" on QR Scan
- **Cause**: Backend CORS policy blocked request or backend URL is wrong.
- **Fix**: Check `ALLOWED_ORIGINS` in Render dashboard. Ensure Vercel domain is present without trailing slashes.

### Issue B: Supabase Paused after Extended Vacation
- **Cause**: Restaurant was closed for >7 days with zero queries.
- **Fix**: Open Supabase Dashboard and click **Restore Project** (takes ~90 seconds).

### Issue C: Thermal Printer Prints Garbage Characters
- **Cause**: Baud rate or character encoding mismatch.
- **Fix**: In Admin Settings, ensure printer code page is set to `PC437` or `WPC1252` and baud rate is `9600` or `115200`.
