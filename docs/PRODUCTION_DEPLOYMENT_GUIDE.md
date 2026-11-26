# Deploy one restaurant

The public menu runs on Vercel, the guest API runs on Render, and Render connects to Supabase PostgreSQL. The Windows CRM runs locally with SQLite. The till initiates an outbound HTTPS connection to Render, so the restaurant router needs no port forwarding.

The blocks below use **KEY: VALUE** to show each dashboard entry. Enter the left side in the **Key** field and the right side in **Value**. Replace angle-bracket placeholders with your own values. In a local `.env` file use `KEY=VALUE` instead.

## 1. Create the Supabase database and collect the values

1. Create a dedicated project. Choose a strong **database password** and save it in the restaurant's password manager. Open **SQL Editor → New query**, paste the entire [schema.sql](../supabase/schema.sql), and run it once on the fresh database. Future updates are applied by the Render migrator. [Create a Supabase project](https://supabase.com/dashboard/new) · [SQL Editor](https://supabase.com/dashboard/project/_/sql/new)
2. Open **Connect → Session pooler**. Copy the PostgreSQL URI for session mode (port `5432`), substitute the database password, and use TLS (`sslmode=require`). Percent-encode special characters in the password when inserting it into the URI. Keep the username, region and pooler hostname exactly as displayed. This is Render's `DATABASE_URL`. [Connection options and dashboard instructions](https://supabase.com/docs/guides/database/connecting-to-postgres)
3. Copy **Project URL** from **Connect** (normally `https://<project-ref>.supabase.co`). Use it for `SUPABASE_URL`. If enabling diner accounts, also copy the **publishable key** from **Settings → API Keys**. [Project dashboard](https://supabase.com/dashboard/projects) · [API Keys dashboard](https://supabase.com/dashboard/project/_/settings/api-keys)
4. Decide whether diners need phone sign-in. **Guest checkout** works without phone auth. For guest-only deployments, generate a private, stable signing secret for Render's `SUPABASE_JWT_SECRET` with the command below. For **phone sign-in**, the current backend requires the Supabase project's shared **HS256 JWT signing secret** and access tokens actively signed with that secret. Check **Settings → JWT Keys**. A publishable key, service-role API key, or asymmetric public key cannot verify HS256 tokens. If the project uses asymmetric signing, keep phone sign-in disabled until the backend supports its signing keys. [JWT Keys dashboard](https://supabase.com/dashboard/project/_/settings/jwt) · [Supabase signing keys](https://supabase.com/docs/guides/auth/signing-keys)
5. Generate a separate **device sync token** on your development machine. Save the output privately. Use the same token in Render and on the till. For guest-only deployments run the command a second time for the independent Render signing secret.

```sh
node -p "require('node:crypto').randomBytes(32).toString('hex')"
```

## 2. Deploy the Rust API on Render

Push the release to the Git repository you intend to deploy. In Render choose **New → Blueprint**, connect that repository and select the release branch. Use the root [render.yaml](../render.yaml). For an existing service use **Environment** to update values and deploy the release to that service. [Render dashboard](https://dashboard.render.com/) · [Blueprint deployment](https://render.com/docs/infrastructure-as-code) · [Environment settings](https://render.com/docs/configure-environment-variables)

Enter these values when Render prompts for secrets. Use the intended permanent Vercel production origin for `ALLOWED_ORIGINS`. If you don't have it yet, complete step 3 and update Render with the assigned domain before testing checkout.

```text
DATABASE_URL: postgresql://postgres.<project-ref>:<encoded-password>@<session-pooler-host>:5432/postgres?sslmode=require
SUPABASE_URL: https://<project-ref>.supabase.co
SUPABASE_JWT_SECRET: <private signing secret selected in step 1>
DEVICE_SYNC_TOKEN: <device sync token generated in step 1>
ALLOWED_ORIGINS: https://<customer-menu-domain>
```

The Blueprint supplies these three values automatically. For a manually created **Rust Web Service**, enter them along with the five above.

```text
ENVIRONMENT: production
PORT: 10000
ALLOW_DEV_AUTH: false
```

| Render service setting | Value |
|---|---|
| Root directory | `backend/api` |
| Build command | `cargo build --release --locked --bins` |
| Start command | `./target/release/migrate && ./target/release/hotel_crm_api` |
| Health check | `/health/ready` |

After deployment, copy the service's public **HTTPS URL** from its Overview. Open `https://<render-host>/health/ready` and look for HTTP 200 and `"status":"ready"`. The same Render origin supplies the Vercel API URL and the till sync URL. Leave `LOCAL_DATABASE_URL` unset on Render.

## 3. Deploy the customer menu on Vercel

Choose **Add New → Project**, import the same repository, select **Next.js** and set **Root Directory** to `customer-menu`. Keep the framework defaults for install, build and output. Under **Environment Variables**, add the following to **Production**, then deploy. Copy the permanent domain from **Settings → Domains** and use its full HTTPS origin in Render's `ALLOWED_ORIGINS`. Save and redeploy Render if you changed it. [Import a Vercel project](https://vercel.com/new) · [Environment variables](https://vercel.com/docs/environment-variables)

```text
NEXT_PUBLIC_API_URL: https://<render-host>
NEXT_PUBLIC_RESTAURANT_ID: 00000000-0000-0000-0000-000000000001
```

The UUID above is the restaurant row created by the schema and used by the till. The API URL is the Render origin without an `/api/v1` suffix. Redeploy Vercel after changing public variables so the new values reach the browser.

**Optional diner phone sign-in:** enable the Phone provider in Supabase Authentication, configure an SMS provider, confirm the signing setup in step 1, then add both values below in Vercel and redeploy. Keep both unset for guest-only checkout. Only public values belong in the `NEXT_PUBLIC_` variables. [Phone provider settings](https://supabase.com/dashboard/project/_/auth/providers) · [Phone login and SMS setup](https://supabase.com/docs/guides/auth/phone-login)

```text
NEXT_PUBLIC_SUPABASE_URL: https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: <publishable key from Supabase API Keys>
```

**Hosting choice:** Vercel Hobby is for personal, non-commercial use. Choose a commercially permitted plan for the restaurant. The Render Blueprint selects Free, which can introduce a cold start after inactivity. [Vercel Hobby terms](https://vercel.com/docs/plans/hobby) · [Render Free service behavior](https://render.com/docs/free)

## 4. Configure the Windows till and printed QR links

On a Windows build PC with the project dependencies, x64 Node.js, Rust, Tauri build tools, and Inno Setup 6 installed, run `npm run build:installer` from the repository root. Install the resulting `dist-installer/HOTEL-CRM-Setup-1.0.0.exe` on the till. Sign in to Windows as the person who runs the CRM. Open **Edit environment variables for your account → User variables → New** and add these two entries.

```text
DEVICE_SYNC_URL: https://<render-host>
DEVICE_SYNC_TOKEN: <exact same device sync token saved in Render>
```

Fully exit HOTEL CRM and reopen it from the Start menu. Create the first administrator in the desktop app. Leave `LOCAL_DATABASE_URL` unset so the installed CRM creates its local SQLite file. The installed frontend runs inside Tauri, the local API uses `127.0.0.1:3000`, and the packaged WhatsApp bridge uses `127.0.0.1:3001`. Pair WhatsApp in Settings if required.

In CRM **Settings**, set the **customer menu URL** to `https://<customer-menu-domain>` and save. This setting controls the website printed on table QR codes. Review the restaurant profile, prices, tax settings, starter menu and tables before taking real orders.

## 5. Verify the installation

1. With the CRM open and online, visit `https://<render-host>/public/tables?rid=00000000-0000-0000-0000-000000000001`. Confirm the response contains this till's tables. An empty list means table publication has not been verified. Compare the till's Render URL and shared token, then check sync logs.
2. Seat a test table in the CRM, open its QR preview and scan it with a phone on mobile data. Confirm the Vercel domain, restaurant, table and prices. Submit one test order and verify it appears once in the CRM.
3. Settle the test order, seat the next party and scan the same QR. Check that the new bill starts separately. Verify receipt printing and WhatsApp pairing on the installed PC before opening to guests.

## Test the SQLite till

Run `npm run tauri:dev` from the repository root with `LOCAL_DATABASE_URL` unset, including in backend environment files. Create the first admin on the login screen. The app stores `restaurant.sqlite3` in its local application data directory and uses the built-in development catalog on a fresh database. The local SQLite API handles orders, kitchen status, equal and item-based bill splits, payments, coupon discounts, refunds, receipts, staff and payroll, inventory, guest records, and reports. The billing screen waits for server-assigned split IDs before offering the shares for payment. A completed refund changes collections in the period when it was completed. The original invoice remains available after a refund. Never use a prototype database containing sample restaurant data as a live restaurant database without first reviewing it.

Optional cloud sync uses `DEVICE_SYNC_URL` and `DEVICE_SYNC_TOKEN`. After committing tickets and payments locally, the till sends queued events, imports pending guest orders and acknowledges their delivery. For SQLite backups use the SQLite online backup API or close the till fully before copying the database and any accompanying WAL files. Verify a restored backup on a different device.

## Configure the PostgreSQL compatibility mode

1. Install PostgreSQL on the till and create a dedicated UTF-8 database and login that owns the restaurant schema. Keep the PostgreSQL listener on loopback.
2. Set `LOCAL_DATABASE_URL` in the environment of the Windows user running the till. Use `backend/api/.env.example` for the URL format. Set `POS_SESSION_SECRET` to a randomly generated secret of at least 32 characters if staff sessions should survive an application restart.
3. For a new installation, run the installed `pos-setup.exe --init-admin` (or the backend's `migrate --init-admin` in development) with `POS_INITIAL_PASSWORD` supplied privately in the process environment. This creates the initial restaurant and the `admin` login. Clear the password variable after provisioning. Subsequent launches automatically apply local migrations.
4. Set `DEVICE_SYNC_URL` to the HTTPS origin of the Render application and `DEVICE_SYNC_TOKEN` to a random device credential of at least 32 characters. Configure the same device credential in Render. Rotate it on both ends if replacing a till. The local POS also operates with sync omitted.

## Development seed and reset

For a cloud menu preview on a fresh development project, optionally run `supabase/mock_data.sql` after `supabase/schema.sql`. It inserts five tables, four categories, and six menu items with the same identifiers as a fresh SQLite till. Staff open tables in the CRM to enable guest checkout.

For a full cloud development reset, stop Render and disconnect the till, run `supabase/reset.sql`, then install the schema again. The reset preserves Supabase Auth accounts. Use a fresh test till for a fresh end-to-end dataset. A previously synced till retains its local orders and delivery acknowledgments, so rebuilding the cloud this way cannot restore its historical sales.

## PostgreSQL backup and recovery

Use PostgreSQL client utilities matching the local server. Supply credentials through a PostgreSQL password file or the operating system's secret handling. With the standard `PGHOST`, `PGPORT`, `PGUSER` and `PGDATABASE` variables pointing to the local POS, `pg_dump --format=custom --file=shift.dump` takes a consistent database snapshot. Use a unique filename and store a protected copy away from the till.

Restore with `pg_restore --exit-on-error --single-transaction --dbname=restored_shift shift.dump` into a newly created empty UTF-8 database. Verify staff login, the latest receipt, payment and refund totals, and the oldest pending sync event before switching the till's connection. The CI workflow includes a disposable dump and restore comparison. The restaurant still needs a retention schedule and a recovery drill on its own hardware.
