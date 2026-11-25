# Restaurant POS project audit

**Revision a0b1720 · 25 November 2026.** One restaurant, a dedicated backend and database, a Tauri 2 desktop POS and a public guest menu. The local database should remain authoritative for shifts, tickets and money throughout an internet outage.

## Implementation status

The desktop now opens SQLite when `LOCAL_DATABASE_URL` is unset. The local API covers staff setup and login, floor and kitchen operations, billing, refunds, coupons, payroll, stock, guest records and period reporting. The public menu and Render API use the separate Supabase database. Setup and compatibility-mode instructions are in [the deployment guide](PRODUCTION_DEPLOYMENT_GUIDE.md).

SQLite API tests cover restart and payment replay, equal and item-based bill allocation, refund limits, coupon usage, attendance and reporting. A separate integration test sent a split sale and a completed refund from SQLite through the device API to a disposable PostgreSQL cloud schema, validated the cloud balances, and checked that the local queue drained. Live hosted ordering, SMS delivery, physical printing and installation and recovery on the restaurant's Windows machine still need acceptance. Some staff-interface mutations still use optimistic browser state.

The findings and SQL preparation counts below describe the original audited revision.

## Original release decision

Hold public ordering and financial rollout. The fresh local database accepts its migrations, but application queries for taking orders, settling a bill, seating a table and producing a receipt fail against it. Independently, a cloud checkout can confirm an order which the local import worker never selects. Neither problem requires a framework rewrite.

## Evidence and limits

- Examined a repository with 325 tracked files including assets, two installers, three application packages, the messaging bridge, both PostgreSQL schema paths, the SQLite prototype, CI and packaging. Tests, source inspections and schema preparation establish different things.
- All 330 Angular tests and 22 Rust tests passed. The guest TypeScript check passed. The Rust suite includes SQLite and domain tests. The CI database job checks file presence.
- Applied all seven local SQL files in the same order as the server. Applied the master cloud schema separately with test roles, null-returning auth functions and a minimal auth.users table. PGlite supplied PostgreSQL semantics and the pgcrypto and uuid-ossp extensions. These were disposable databases with no restaurant records. The subsequent cloud startup batch failed on a generated column.
- Indexed 209 fully qualified SQLx query call sites in backend/api/src. Prepared all 206 data statements against both fresh schemas. The other three implement invoice savepoint control, and their sequence executed successfully in an isolated transaction. Local had 110 prepared and 96 failures. Cloud had 193 prepared and 13 failures. This is a cross-compatibility matrix. Some statements run on only one database. Heartbeats have separate runtime DDL. Several failures are consequences of the same missing column. The companion ledger lists each site and its first database error.
- Preparation does not execute mutations, run Rust result decoding, prove deployed RLS, measure plans on a restaurant-sized dataset, or prove concurrency safety. Dynamic SQL inside database functions and startup batches is distinct from the 209 SQLx call sites. Re-running the entire guest-to-kitchen workflow on real PostgreSQL, WebView2, a printer and a restored Windows machine remains necessary.
- Browser checks used existing local build assets and synthetic API responses. Layout measurements establish viewport geometry for the tested states. They do not establish hardware, accessibility or live workflow behavior.

## File-by-file remediation register

Paths below are relative to the repository root. P0 items can lose orders, misstate money, prevent basic operation or compromise privileged access. P1 items materially affect daily operations, privacy or release reliability. The SQL ledger gives exact function and line references for individual database operations.

| Priority | File or function | Finding and consequence | Edit and acceptance check |
|---|---|---|---|
| P0 | backend/api/migrations_local/001_core.sql through 006_orders_compatibility.sql; backend/api/src/server.rs, apply_local_migrations | Fresh local tables lack columns required by the shipped Rust repositories. Examples include order tax rates, table seating session, split amounts, reservation table association and feedback visibility. Startup logs migration errors and can serve requests before initialization finishes. | Define canonical writable columns. Ship forward-only migrations for existing installs, with a fresh-install path that reaches the same schema. Readiness must verify the migration version. Exercise the real Rust routes on both a new and an upgraded database. |
| P0 | supabase/schema.sql; backend/api/src/server.rs, ensure_schema_and_seed; backend/api/src/bin/migrate.rs | The master schema defines generated compatibility columns. The cloud startup batch updates table_number directly and aborts. Keeping separate mutation scripts in the server, CLI and schema file makes an installation dependent on its history. | Pick one versioned migration path for each deployment role. Write only base columns. Run migrations twice in CI and verify new and upgraded installations retain custom menu, staff credentials and historical invoices. |
| P0 | backend/api/src/routes/public_routes.rs, create_public_order; repositories/order_repo.rs, create_order; sync/worker.rs, pull_inbound_cloud_orders | Guest checkout creates DINE_IN/confirmed. The incoming order worker selects digital_qr/SUBMITTED. A disconnected terminal cannot recover these orders through that query. A cloud item-read error is also replaced with an empty list, allowing a header-only order to commit. | Use a stable guest request ID and separate source, kitchen status and delivery acknowledgement fields. Commit header, all lines and receipt of the request in one local transaction. Display kitchen acceptance only after acknowledgement. Restart between each step and compare IDs and line counts. |
| P0 | backend/api/src/sync/worker.rs:89,108,451,465; migrations_local/005_sync_outbox_inbox.sql | The worker writes error_message while the outbox defines last_error. Acknowledgement errors are ignored. The worker also writes lowercase table states rejected by the enum. Refund events fall through to success without a cloud operation. Depending on schema history this can cause perpetual replay or false acknowledgement. | Share typed event contracts, validate required payload fields, make unknown events visible failures, and persist acknowledgement only after a durable destination commit. Test supported event families, duplicates and interrupted retries. |
| P0 | backend/api/src/routes/public_routes.rs:396; repositories/order_repo.rs:46; customer-menu/app/table/[token]/checkout/page.tsx:373 | Guest-provided price and discount feed stored totals. Checkout separately rounds CGST and SGST and omits service charge and whole-rupee rounding in its grand total. A ₹10.55 subtotal at 2.5% + 2.5%, no discount or service charge, displays ₹11.07 by that calculation. The Rust calculation at 5% rounds the amount to ₹11.00. | Accept item IDs, quantities, choices and a coupon code. Quote on the server from current menu records. Persist the quote at acceptance and render it on checkout, receipt, and POS. Include half-paise boundaries, zero rates, service charge, void items and discount caps in shared fixtures. |
| P0 | backend/api/src/repositories/billing_repo.rs, settle_order and create_refund | Ordinary single-order settlement can take the client amount and then mark the order paid. The invoice savepoint intentionally lets a failed invoice write be discarded. Its INSERT fails preparation on both fresh schemas. Refund validation compares an individual request with the original order total. Multiple requests need a cumulative refundable balance. | Lock the relevant balance. Check the amount and currency against the authoritative unpaid amount, distinguish partial payments, enforce cumulative refund limits, persist immutable invoice data, and record the deciding staff ID. Exercise two tills or two rapid requests and reprint after restart. |
| P0 | supabase/schema.sql:1212; backend/api/src/routes/restaurant_routes.rs:151; auth/middleware.rs:46; frontend/restaurant-web/src/app/core/services/admin-auth.service.ts:310 | The auth-user trigger copies role and permissions from user metadata into authorization records. Impact depends on deployed account provisioning. Staff creation/update can fall back to storing the supplied password when hashing fails. Other paths cache administrator credentials, accept unsigned offline identities or accept legacy plaintext comparisons. Schema seed reapplies a known administrator credential. | Set roles through trusted staff provisioning, fail credential changes if hashing fails, remove browser-side credential verification, enforce role permissions in Rust and separate initial onboarding from database migrations. Test that credential rotation survives restarts and upgrades. |
| P0 conditional | installer.iss:48; backend/api/src/config.rs; src-tauri/src/lib.rs | The Inno installer copies the backend environment file. The desktop worker also uses a cloud database connection directly. Actual exposure depends on the configuration included at build time. | Inspect distributed release manifests privately, rotate any live credentials included, and provision revocable device access to the cloud sync API. Add an installer contents test. |
| P1 | backend/api/src/ws.rs; routes/public_routes.rs:447,790,994; repositories/feedback_repo.rs:128 | Customer history and profile operations rely on phone/table identifiers. The public table list includes QR tokens. A seating-session mismatch is checked only when both session values are present. Order and reservation broadcasts share subscribers. Public feedback includes favorable reviews even when the public flag is false, and returns internal resolution fields. | Separate browsing from private operations. Use expiring seating/order access and verified customer sessions. Require an active seat at checkout. Remove private identifiers and staff notes from public DTOs. Make explicit publication approval decisive. Test two tables and two different guests in the same restaurant. |
| P1 | supabase/schema.sql:903,936,1163; src/routes/mod.rs under backend/api; backend/api/src/printer.rs; whatsapp-bridge/index.js; src-tauri/tauri.conf.json | Anonymous direct database insertion policies provide another write path around Rust validation. Printer HTTP handlers accept requests without staff authentication. Local and cloud processes install the same router; the API binds all interfaces, the API and bridge allow wildcard origins, and Tauri has no configured CSP. A running local bridge handles account pairing, sending and logout. | Keep public API and authenticated sync routes on Render. Put printing behind Tauri commands or authenticated loopback IPC. Restrict database writes and origin lists. Configure a tested desktop CSP, local bridge credential and message/body limits. Verify installed network exposure and permission denial for a guest. |
| P1 | backend/api/src/routes/auth_routes.rs:193; src/error.rs; src/bin/migrate.rs under backend/api | The admin-password verification handler takes no authenticated actor and checks the first active admin. Database errors are returned to clients. The migration CLI prints staff identifiers and credential prefixes; with historical plaintext entries this can reveal password material. | Verify an identified manager at the privileged action, rate-limit attempts, return stable public errors, and omit all credential material from logs. |
| P1 | frontend/restaurant-web/src/app/core/services/network-status.service.ts:8; data-access/api/api-client.service.ts:149; data-access/services/restaurant-data.service.ts:3530 | A browser offline event can take the same path as a local database outage. Browser storage, direct Supabase fallbacks and the local SQL outbox form competing write paths. | Always try the local service for staff operations. Commit sales in PostgreSQL before success. Track local readiness, last successful cloud contact, pending count and oldest failure separately. Retain drafts in the UI with explicit draft status. |
| P1 | backend/api/src/repositories/reports_repo.rs:24,105,146,195,241; billing_repo.rs:510 | SUM(bigint) produces numeric, while several Rust report tuples expect i64. Verified the PostgreSQL aggregate type independently. Refund queries filter to completed before counting pending and cancelled. Receivables look for partial while billing writes partially_paid, and the unsplit query sums full order totals. The dashboard uses UTC calendar days, and COGS is an estimate of 35% of sales. | Decode the actual aggregate type or cast with explicit bounds. Calculate each metric from its own ledger event. Use remainder owing, local business-day boundaries and a half-open interval. Label estimated cost separately until actual recipe/stock costs are available. Reconcile a shift containing a partial payment, post-midnight sale and next-day refund. |
| P1 | backend/api/src/repositories/coupon_repo.rs:292; routes/public_routes.rs:847; guest checkout | Coupon limits are checked before the redemption transaction. The redemption INSERT references a missing restaurant_id on both schemas. The guest loyalty config ignores the database and returns a fixed seven-visit offer. Checkout has its own reward rules. | Publish one owner-configured policy and redeem it atomically against the locked order and coupon. Derive eligibility from verified completed visits. Cover one redemption left and two simultaneous checkouts. |
| P1 | backend/api/src/repositories/table_repo.rs:13; order_repo.rs; sync/worker.rs | Listing tables also changes occupancy and clears seating state if no active order exists. A party seated before ordering can lose its session just because someone refreshes the table list. The cloud worker stamps synced payments with NOW(), which can move yesterday's offline collections into today's totals. | Make table reads side-effect free. Record explicit seating and release transitions. Preserve occurrence, settlement and sync times as separate fields. Test seating followed by a refresh before the first item and settlement across midnight. |
| P1 | backend/api/src/repositories/menu_repo.rs:210; inventory_repo.rs:125 | Menu deletion detaches historical rows before deleting the menu item, outside a transaction; the recipe cleanup references a missing column on both schemas and discards the error. Inventory queries rely on additional local columns catalogued in the SQL ledger. | Archive menu items that already appear on a bill. Use correct recipe relationships and atomic writes. Exercise recipe and stock changes against migrated PostgreSQL, including a failed write and repeated wastage request. |
| P1 | frontend/restaurant-web/src/app/data-access/api/api-repositories.ts:157,212,515,524,634; backend/api/src/routes/mod.rs | The Angular repository declares customer-by-ID reads/updates, generic table updates, coupon assignment, invoice listing/lookup and print tracking that lack a matching server method/path. Its loyalty and feedback repositories return empty lists or locally fabricated success. Some screens use another data service, so this proves contract drift, not that every named screen fails. | Trace each button to its actual caller. Delete unused contracts, implement operations the restaurant offers, and make unavailable operations explicit. Run a consumer contract check for the route, HTTP method, payload, status and envelope. |
| P1 | customer-menu/lib/api.ts; customer-menu/lib/cart-context.tsx; backend/api/src/routes/public_routes.rs:994 | Menu fetch failures become empty menus and some history failures become empty history. The cart is global to the browser rather than a seating session. Phone normalization removes a leading 91 by string pattern in one path, which can alter a valid national number that starts with those digits. | Separate loading, unavailable and empty states. Scope the basket to a seating session and expire stale carts. Normalize phone numbers once on the server, validate length after normalization and retain the same canonical key for lookup and update. |
| P1 | backend/api/src/routes/public_routes.rs:268; ws.rs; gateway/client.rs | Checkout deduplication uses a four-second lookup by phone/table that does not compare basket contents. A connected client can also count as evidence the kitchen is online. | Use a durable checkout ID and return the original result on retry. Show received and kitchen-accepted as separate states. Apply a heartbeat expiry and device authentication. |
| P1 | backend/api/src/repositories/customer_repo.rs; feedback_repo.rs; routes/restaurant_routes.rs | Local reservation reads and writes expect table_id and local feedback expects is_public. These columns fail the clean-schema check. Staff and attendance paths also need local schema validation, and staff updates span multiple SQL writes. | Include reservation creation/status, feedback moderation, payroll/attendance fields and staff edit rollback in database integration tests. Provide pagination or search where capped lists otherwise look complete. |

## Additional checks on the running build and API contracts

- **The guest outage screen fails during rendering.** With a simulated unavailable table API, the existing Next.js production build returned HTTP 500. The server reported that it could not pass the Retry button's event handler from the server-rendered page. Use a regular retry link or a small client component. Verify a non-404 upstream error renders a usable customer screen, then restore connectivity and retry. See customer-menu/app/table/[token]/page.tsx:42.
- **The Angular desktop release builds successfully with network access.** It failed without access to the Google Fonts stylesheet during build-time inlining. The successful build produced 1.19 MB of initial raw assets, including 530.69 kB of styles, with tables and orders in lazy chunks. These are artifact sizes, not measured launch delays. Bundle licensed local fonts for reproducible offline builds and profile the largest screens on the target till before changing Angular.
- **The router has 98 method/path registrations.** Comparing 116 literal Angular API-client call sites with the registrations identified seven unmatched calls, all listed below. This comparison excludes dynamic paths and direct HTTP/fetch calls. A shared path still requires request and response shape checks.
- **Staff administration has two avoidable sources of inconsistency.** Staff updates hash and write a changed password twice in the same handler, with separate database operations. Staff performance falls back to November 2026 on malformed month input. Update credentials once in the same transaction as the staff change, reject invalid month input, and use the restaurant timezone for an omitted month. See backend/api/src/routes/restaurant_routes.rs:226 and :400.

## UI and breakpoint findings

Headless Chrome exercised local build artifacts. Mocked data and permissions allowed navigation without reaching a deployed backend. We measured the document width and checked for child elements beyond the viewport, which catches clipping even when the page hides overflow.

| Surface | Sizes and finding | Next edit or verification |
|---|---|---|
| Desktop login, dashboard, order queue, tables, billing, reports, staff, inventory and settings | Tested 1024 × 700 and 1280 × 800. Document widths stayed within the viewport. The table floor canvas and report tabs extended beyond it at both sizes. One initial 1024px billing sample was still mounting. | Confirm the last report tab and table are reachable with keyboard and touch. Preserve intentional canvas panning. Retest populated billing and payment/refund modals at minimum size before release. |
| Guest home, table menu and checkout | Tested 320 × 568, 360 × 800, 390 × 844 and 768 × 1024. No document-level horizontal overflow. On the 320px menu the item-count label extends past the viewport. | Allow the filter row to wrap or move the count to the category row. Source is customer-menu/app/table/[token]/MenuClient.tsx:506. Check the sticky category offset after wrapping. |
| Tauri minimum size and Windows scaling | The configured minimum is 1024 × 700 logical pixels. A 1366 × 768 display at 125% scaling has about 1093 × 614 logical pixels before the taskbar and frame. The current minimum exceeds the available height. | Allow a shorter logical window, keep settlement actions reachable through scrolling, and test on Windows at 125% and 150% with a real receipt printer. |
| Checkout keyboard and fixed actions | Checkout fixes its bottom action bar to the viewport. The geometry sample used an empty cart and did not exercise the mobile software keyboard, screen reader, or long localized text. | Test a populated cart with a coupon, the phone keyboard open, larger text and device safe-area insets. Confirm the total and Place Order remain reachable, and a retry preserves the request ID. |

## Unnecessary load and missing operational controls

1. Remove hosted admin and obsolete Angular customer targets from render.yaml after verifying deployment ownership. Its customer build command is absent from the Angular package. Keep the guest website project separate.
2. Move release installers out of normal Git history going forward and into release assets. The two tracked executables total 22,309,481 bytes. Decide which of Inno and NSIS is the supported release channel, then test that exact installer on clean Windows. Avoid rewriting existing Git history as routine cleanup.
3. Keep Angular and Axum. Untangle the 5,673-line restaurant data service by workflow, starting with orders and payments. Share barrel-free domain contracts where they remove duplicate calculations. Retire direct Supabase write fallbacks once each local equivalent is verified. Keep mock data behind test-only wiring.
4. Decide whether SQLite is supported. The active app uses PostgreSQL, while SQLite is enabled in the main SQLx dependency and covered by tests. Move SQLite-specific experiments to a development feature or separate target if PostgreSQL stays canonical. Retain useful tests until PostgreSQL equivalents exist.
5. Cache the published menu independently of kitchen availability. A customer should still be able to browse while the counter is reconnecting. Keep the last published time visible to staff and confirm current availability at acceptance.
6. Add a recoverable local installation: database setup and restricted credentials, migration/version checks, encrypted off-device backups, documented restore to a replacement PC, retryable printer jobs and a clear fallback when WhatsApp is unavailable. Avoid treating the cloud copy as a complete backup until a restore proves it.
7. Give the manager a shift-close reconciliation showing tender totals, completed refunds, unpaid balances, failed prints, and unacknowledged online orders. Add an operator-visible sync queue with retry history and a last successful sync time. Verify cold restart without internet at opening time.
8. CI should boot real disposable PostgreSQL for both schema paths, execute actual Rust handlers, and compare receipts and reports across an interrupted shift. Test fresh install, upgrade with historical data, two concurrent checkouts, two refunds and failure just after settlement. Pin clean release inputs, scan dependencies and the installer contents, and measure guest/desktop builds separately.

## Order of implementation

1. Establish one versioned schema contract per database role and make the query matrix pass for each statement's intended target. Verify runtime inserts and Rust SQLx result decoding. Preserve a backup and rehearse existing-data upgrades.
2. Move authoritative quoting, settlement, invoice persistence and refund authorization into transactions. Lock balances and add durable retry IDs.
3. Implement guest receipt, POS import, kitchen acknowledgement and financial sync replay as one tested lifecycle. Route desktop writes through the local backend.
4. Separate cloud, desktop and guest identities and permissions. Close direct write paths. Verify staff downgrade, password rotation, private feedback, printer authorization and installer provisioning.
5. Fix the UI findings and API-stub paths. Install on a clean Windows PC, trade one complete shift offline, reconnect, compare totals, restore onto a second PC and print historical receipts.

The SQL and schema ledger accompanies this report in SQL_SCHEMA_AUDIT.md.


## API route inventory

Axum registrations are grouped by HTTP method, effective path and handler. The client column counts matching literal Angular ApiClientService call sites found by static inspection. Zero includes guest fetches, direct HttpClient calls, websocket/SSE aliases, health checks and external callers. A count alone is insufficient grounds to remove an endpoint.

| Method | Registered path | Handler | Matched Angular call sites |
|---|---|---|---|
| GET | /api/v1/auth/me | auth_routes::get_me | 0 |
| POST | /api/v1/auth/login | auth_routes::login | 0 |
| POST | /api/v1/auth/verify-admin-password | auth_routes::verify_admin_password | 0 |
| GET | /api/v1/restaurants | restaurant_routes::get_current_restaurant | 2 |
| PUT | /api/v1/restaurants | restaurant_routes::update_current_restaurant | 1 |
| PUT | /api/v1/restaurants/settings | restaurant_routes::update_current_restaurant | 1 |
| POST | /api/v1/restaurants/heartbeat | restaurant_routes::restaurant_heartbeat | 1 |
| GET | /api/v1/restaurants/staff | restaurant_routes::list_staff_members | 3 |
| POST | /api/v1/restaurants/staff | restaurant_routes::create_staff_member | 1 |
| GET | /api/v1/restaurants/staff/attendance | restaurant_routes::list_staff_attendance | 1 |
| POST | /api/v1/restaurants/staff/attendance | restaurant_routes::mark_staff_attendance | 2 |
| GET | /api/v1/restaurants/staff/performance | restaurant_routes::get_staff_performance | 1 |
| PUT | /api/v1/restaurants/staff/:id | restaurant_routes::update_staff_member | 1 |
| DELETE | /api/v1/restaurants/staff/:id | restaurant_routes::delete_staff_member | 0 |
| GET | /api/v1/tables | table_routes::list_tables | 3 |
| POST | /api/v1/tables | table_routes::create_table | 2 |
| DELETE | /api/v1/tables/:id | table_routes::delete_table | 2 |
| PUT | /api/v1/tables/:id/status | table_routes::update_table_status | 4 |
| PUT | /api/v1/tables/:id/assign | table_routes::assign_table_staff | 1 |
| POST | /api/v1/tables/transfer | table_routes::transfer_table | 2 |
| GET | /api/v1/menu/categories | menu_routes::list_categories | 2 |
| POST | /api/v1/menu/categories | menu_routes::create_category | 2 |
| PUT | /api/v1/menu/categories/:id | menu_routes::update_category | 1 |
| DELETE | /api/v1/menu/categories/:id | menu_routes::delete_category | 2 |
| GET | /api/v1/menu/items | menu_routes::list_items | 2 |
| POST | /api/v1/menu/items | menu_routes::create_item | 2 |
| PUT | /api/v1/menu/items/:id | menu_routes::update_item | 2 |
| DELETE | /api/v1/menu/items/:id | menu_routes::delete_item | 2 |
| PUT | /api/v1/menu/items/:id/availability | menu_routes::update_availability | 3 |
| GET | /api/v1/orders | order_routes::list_orders | 4 |
| POST | /api/v1/orders | order_routes::create_order | 3 |
| GET | /api/v1/orders/:id | order_routes::get_order | 1 |
| PUT | /api/v1/orders/:id/items | order_routes::update_order_items | 2 |
| PUT | /api/v1/orders/:id/status | order_routes::update_order_status | 3 |
| PUT | /api/v1/orders/:id/server | order_routes::assign_order_server | 2 |
| POST | /api/v1/payments | billing_routes::record_payment | 1 |
| POST | /api/v1/orders/:id/settle | billing_routes::settle_order | 3 |
| POST | /api/v1/orders/:id/split | billing_routes::split_order | 1 |
| GET | /api/v1/orders/:id/split | billing_routes::get_order_split_bills | 0 |
| GET | /api/v1/split-bills | billing_routes::list_split_bills | 1 |
| POST | /api/v1/orders/:id/refund | billing_routes::create_refund | 1 |
| PUT | /api/v1/refunds/:id/status | billing_routes::update_refund_status | 0 |
| GET | /api/v1/orders/:id/receipt | billing_routes::get_receipt | 1 |
| GET | /api/v1/inventory/items | inventory_routes::list_items | 2 |
| POST | /api/v1/inventory/items | inventory_routes::create_item | 1 |
| PUT | /api/v1/inventory/items/:id | inventory_routes::update_item | 1 |
| POST | /api/v1/inventory/wastage | inventory_routes::record_wastage | 2 |
| GET | /api/v1/inventory/movements | inventory_routes::list_movements | 2 |
| GET | /api/v1/coupons | coupon_routes::list_coupons | 3 |
| POST | /api/v1/coupons | coupon_routes::create_coupon | 2 |
| PUT | /api/v1/coupons/:id | coupon_routes::update_coupon | 2 |
| PATCH | /api/v1/coupons/:id | coupon_routes::update_coupon | 0 |
| DELETE | /api/v1/coupons/:id | coupon_routes::delete_coupon | 1 |
| PUT | /api/v1/coupons/:id/status | coupon_routes::update_coupon_status | 1 |
| POST | /api/v1/coupons/validate | coupon_routes::validate_coupon | 1 |
| POST | /api/v1/coupons/redeem | coupon_routes::redeem_coupon | 0 |
| GET | /api/v1/customers | customer_routes::list_customers | 4 |
| POST | /api/v1/customers | customer_routes::create_customer | 3 |
| POST | /api/v1/customers/:id/points | customer_routes::award_points | 1 |
| GET | /api/v1/reservations | customer_routes::list_reservations | 3 |
| POST | /api/v1/reservations | customer_routes::create_reservation | 2 |
| PUT | /api/v1/reservations/:id/status | customer_routes::update_reservation_status | 4 |
| GET | /api/v1/feedback | feedback_routes::list_feedback | 2 |
| POST | /api/v1/feedback | feedback_routes::create_feedback | 1 |
| PUT | /api/v1/feedback/:id/reply | feedback_routes::reply_feedback | 1 |
| PUT | /api/v1/feedback/:id/visibility | feedback_routes::toggle_feedback_visibility | 1 |
| GET | /api/v1/reports/period | reports_routes::get_period_report | 0 |
| GET | /api/v1/dashboard/summary | reports_routes::get_dashboard_summary | 0 |
| POST | /api/v1/system/open-external | system_open_external | 0 |
| GET | /api/v1/printer/list | crate::printer::list_printers_route | 0 |
| POST | /api/v1/printer/print | crate::printer::print_escpos_route | 0 |
| GET | /health | health::health_check | 0 |
| GET | /health/live | health::liveness | 0 |
| GET | /health/ready | health::readiness | 0 |
| GET | /api/v1/health | health::health_check | 0 |
| GET | /api/v1/health/live | health::liveness | 0 |
| GET | /api/v1/health/ready | health::readiness | 0 |
| GET | /health/restaurant/:id | health::check_restaurant_availability | 0 |
| GET | /public/tables/:token | public_routes::get_public_table | 0 |
| GET | /public/menu | public_routes::get_public_menu | 0 |
| GET | /public/restaurant-status | public_routes::get_public_restaurant_status | 0 |
| POST | /public/orders | public_routes::create_public_order | 0 |
| GET | /public/orders | public_routes::get_customer_orders | 0 |
| GET | /public/coupons | public_routes::get_public_coupons | 0 |
| POST | /public/reservations | public_routes::create_public_reservation | 0 |
| GET | /public/feedback | public_routes::get_public_feedback | 0 |
| POST | /public/feedback | public_routes::create_public_feedback | 0 |
| GET | /public/restaurant-info | public_routes::get_public_restaurant_info | 0 |
| GET | /public/tables | public_routes::list_public_tables | 0 |
| GET | /public/loyalty-config | public_routes::get_public_loyalty_config | 0 |
| GET | /public/customer/loyalty | public_routes::get_public_customer_loyalty | 0 |
| GET | /public/customer-lookup | public_routes::get_public_customer_loyalty | 0 |
| POST | /public/customer/profile | public_routes::update_public_customer_profile | 0 |
| GET | /ws/orders | ws_routes::ws_handler | 0 |
| GET | /events | crate::ws::sse_handler | 0 |
| GET | /sse | crate::ws::sse_handler | 0 |
| GET | /api/v1/events | crate::ws::sse_handler | 0 |
| GET | /api/v1/health/restaurant/:id | health::check_restaurant_availability | 0 |

### Angular client calls without a matching registration

These methods may be dormant. Verify feature wiring before deciding whether to remove the method or implement the endpoint.

| Method | Client expression | Source |
|---|---|---|
| GET | /api/v1/customers/${id} | frontend/restaurant-web/src/app/data-access/api/api-repositories.ts:157 |
| PUT | /api/v1/customers/${id} | frontend/restaurant-web/src/app/data-access/api/api-repositories.ts:171 |
| PUT | /api/v1/tables/${id} | frontend/restaurant-web/src/app/data-access/api/api-repositories.ts:212 |
| POST | /api/v1/coupons/${couponId}/assign | frontend/restaurant-web/src/app/data-access/api/api-repositories.ts:515 |
| GET | /api/v1/invoices | frontend/restaurant-web/src/app/data-access/api/api-repositories.ts:524 |
| GET | /api/v1/orders/${orderId}/invoice | frontend/restaurant-web/src/app/data-access/api/api-repositories.ts:528 |
| PUT | /api/v1/invoices/${invoiceId}/print | frontend/restaurant-web/src/app/data-access/api/api-repositories.ts:536 |
