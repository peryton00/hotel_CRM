# Single-restaurant deployment

The Windows till runs the Angular CRM in Tauri 2, an embedded Rust API, and a local SQLite database by default. The public Next.js menu calls the Render guest API. Only Render connects to the restaurant's Supabase database. A device publishes menu and seating changes and retrieves pending tickets over HTTPS.

## Test the SQLite till

Run `npm run tauri:dev` from the repository root with `LOCAL_DATABASE_URL` unset, including in backend environment files. Create the first admin on the login screen. The app stores `restaurant.sqlite3` in its local application data directory and uses the built-in development catalog on a fresh database. The local SQLite API handles orders, kitchen status, equal and item-based bill splits, payments, coupon discounts, refunds, receipts, staff and payroll, inventory, guest records, and reports. The billing screen waits for server-assigned split IDs before offering the shares for payment. A completed refund changes collections in the period when it was completed. The original invoice remains available after a refund. Never use a prototype database containing sample restaurant data as a live restaurant database without first reviewing it.

Optional cloud sync uses `DEVICE_SYNC_URL` and `DEVICE_SYNC_TOKEN`. After committing tickets and payments locally, the till sends queued events, imports pending guest orders and acknowledges their delivery. For SQLite backups use the SQLite online backup API or close the till fully before copying the database and any accompanying WAL files. Verify a restored backup on a different device.

## Configure the PostgreSQL compatibility mode

1. Install PostgreSQL on the till and create a dedicated UTF-8 database and login that owns the restaurant schema. Keep the PostgreSQL listener on loopback.
2. Set `LOCAL_DATABASE_URL` in the environment of the Windows user running the till. Use `backend/api/.env.example` for the URL format. Set `POS_SESSION_SECRET` to a randomly generated secret of at least 32 characters if staff sessions should survive an application restart.
3. For a new installation, run the installed `pos-setup.exe --init-admin` (or the backend's `migrate --init-admin` in development) with `POS_INITIAL_PASSWORD` supplied privately in the process environment. This creates the initial restaurant and the `admin` login. Clear the password variable after provisioning. Subsequent launches automatically apply local migrations.
4. Set `DEVICE_SYNC_URL` to the HTTPS origin of the Render application and `DEVICE_SYNC_TOKEN` to a random device credential of at least 32 characters. Configure the same device credential in Render. Rotate it on both ends if replacing a till. The local POS also operates with sync omitted.
5. Build the Windows installer with `npm run build:installer` from the repository root on a Windows build machine with Inno Setup 6. The Inno installer packages the desktop build, database provisioning tool, and WhatsApp bridge with its own x64 Node.js runtime and production dependencies. On first launch, an administrator pairs the restaurant phone in Settings. The installed bridge listens on 127.0.0.1:3001 and keeps its pairing files under the Windows user’s local CRM app-data directory. The installer can be upgraded without replacing that directory. Packaged first-run setup and a real printer still need acceptance on a clean Windows machine.

## Initialize a fresh Supabase project

Run the entire `supabase/schema.sql` once in the dedicated project's SQL Editor. It creates the restaurant and records the cloud migration versions that Render checks at startup. An existing installation uses the Render migrator for upgrades. You can also leave a fresh project empty and let the first Render startup install the same schema. The default restaurant UUID for this till and the Vercel menu is `00000000-0000-0000-0000-000000000001`. The till publishes its menu and tables after device sync connects.

For a cloud menu preview on a fresh development project, optionally run `supabase/mock_data.sql` after `supabase/schema.sql`. It inserts five tables, four categories, and six menu items with the same identifiers as a fresh SQLite till. Staff open tables in the CRM to enable guest checkout.

For a full cloud development reset, stop Render and disconnect the till, run `supabase/reset.sql`, then install the schema again. The reset preserves Supabase Auth accounts. Use a fresh test till for a fresh end-to-end dataset. A previously synced till retains its local orders and delivery acknowledgments, so rebuilding the cloud this way cannot restore its historical sales.

## Configure Render and the menu

- Use one dedicated Supabase project per installation. Configure Render with `DATABASE_URL`, `DEVICE_SYNC_TOKEN`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET` and the exact guest origin in `ALLOWED_ORIGINS`. Keep the database connection and signing credentials in Render secrets. The hosted service starts by running the cloud migrator. New Supabase projects need the built-in auth schema and roles.
- Use the repository's `render.yaml` for the Rust service. The optional Docker build takes the repository root as its context and `backend/api/Dockerfile` as its Dockerfile.
- Build `customer-menu` with `NEXT_PUBLIC_API_URL` set to the Render origin and `NEXT_PUBLIC_RESTAURANT_ID` set to the restaurant UUID. The customer app uses server-rendered table URLs and needs a Next.js-capable host. The Angular CRM belongs on the till.
- Optional diner sign-in uses Supabase phone OTP. Enable the phone provider, configure SMS delivery, then build the menu with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The current Render verifier requires HS256 tokens signed by the configured project secret. Verify this against the project's JWT signing configuration before enabling accounts. Without SMS configuration the menu supports guest checkout and tab-scoped receipts. [Supabase phone sign-in](https://supabase.com/docs/guides/auth/phone-login)
- Render Free can take about a minute to wake after 15 minutes of inactivity. Vercel Hobby restricts use to personal or non-commercial projects. Budget separately for commercial menu hosting or adapt the guest site to a suitable static host. [Render free services](https://render.com/docs/free) Â· [Vercel Hobby](https://vercel.com/docs/plans/hobby)

## PostgreSQL backup and recovery

Use PostgreSQL client utilities matching the local server. Supply credentials through a PostgreSQL password file or the operating system's secret handling. With the standard `PGHOST`, `PGPORT`, `PGUSER` and `PGDATABASE` variables pointing to the local POS, `pg_dump --format=custom --file=shift.dump` takes a consistent database snapshot. Use a unique filename and store a protected copy away from the till.

Restore with `pg_restore --exit-on-error --single-transaction --dbname=restored_shift shift.dump` into a newly created empty UTF-8 database. Verify staff login, the latest receipt, payment and refund totals, and the oldest pending sync event before switching the till's connection. The CI workflow includes a disposable dump and restore comparison. The restaurant still needs a retention schedule and a recovery drill on its own hardware.
