# SQL and schema audit

Source revision a0b1720. This ledger checks each fully qualified SQLx query call in backend/api/src against two fresh in-memory PGlite databases. Local used the startup migration order including seed. Cloud used supabase/schema.sql with stand-in Supabase roles/auth functions and table. The cloud startup batch subsequently aborted on a generated-column update. PREPARE checks parsing, table and column names, and parameter inference. Execution-time constraints, actual privileges, Rust decoding, business logic and concurrency require additional tests. A query used on just one database may legitimately fail on the other. Prepared does not mean the operation is correct.

| Source | Function | Statement | Fresh local | Fresh cloud |
|---|---|---|---|---|
| backend/api/src/bin/migrate.rs:16 | main | SELECT | Prepared | Prepared |
| backend/api/src/bin/migrate.rs:29 | main | SELECT | Prepared | Prepared |
| backend/api/src/gateway/client.rs:38 | spawn | INSERT | 42P01 relation "restaurant_heartbeats" does not exist | 42P01 relation "restaurant_heartbeats" does not exist |
| backend/api/src/gateway/client.rs:63 | is_restaurant_online | SELECT | 42P01 relation "restaurant_heartbeats" does not exist | 42P01 relation "restaurant_heartbeats" does not exist |
| backend/api/src/repositories/billing_repo.rs:33 | settle_order | SELECT | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:54 | settle_order | SELECT | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/billing_repo.rs:93 | settle_order | SELECT | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/billing_repo.rs:122 | settle_order | SELECT | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/billing_repo.rs:206 | settle_order | INSERT | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:229 | settle_order | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:257 | settle_order | UPDATE | 42703 column "updated_at" of relation "split_bills" does not exist | Prepared |
| backend/api/src/repositories/billing_repo.rs:274 | settle_order | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:296 | settle_order | UPDATE | 42703 column "seating_session_id" does not exist | Prepared |
| backend/api/src/repositories/billing_repo.rs:307 | settle_order | UPDATE | 42703 column "current_seating_session_id" of relation "tables" does not exist | Prepared |
| backend/api/src/repositories/billing_repo.rs:327 | settle_order | Other | Manual review (SAVEPOINT) | Manual review (SAVEPOINT) |
| backend/api/src/repositories/billing_repo.rs:328 | settle_order | INSERT | 42703 column "total_paise" of relation "invoices" does not exist | 428C9 cannot insert a non-DEFAULT value into column "discount_amount_paise" |
| backend/api/src/repositories/billing_repo.rs:359 | settle_order | Other | Manual review (ROLLBACK) | Manual review (ROLLBACK) |
| backend/api/src/repositories/billing_repo.rs:363 | settle_order | Other | Manual review (RELEASE) | Manual review (RELEASE) |
| backend/api/src/repositories/billing_repo.rs:407 | record_payment | SELECT | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:429 | record_payment | INSERT | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:455 | record_payment | UPDATE | 42703 column "updated_at" of relation "split_bills" does not exist | Prepared |
| backend/api/src/repositories/billing_repo.rs:471 | record_payment | SELECT | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:482 | record_payment | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:507 | record_payment | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:545 | split_order | SELECT | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:576 | split_order | SELECT | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:595 | split_order | DELETE | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:607 | split_order | INSERT | 42703 column "amount_paise" of relation "split_bills" does not exist | Prepared |
| backend/api/src/repositories/billing_repo.rs:633 | split_order | DELETE | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:639 | split_order | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:667 | create_refund | SELECT | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/billing_repo.rs:699 | create_refund | SELECT | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:709 | create_refund | INSERT | 42703 column "payment_id" of relation "refunds" does not exist | Prepared |
| backend/api/src/repositories/billing_repo.rs:771 | update_refund_status | SELECT | 42703 column "payment_id" does not exist | Prepared |
| backend/api/src/repositories/billing_repo.rs:805 | update_refund_status | UPDATE | 42703 column "payment_id" does not exist | Prepared |
| backend/api/src/repositories/billing_repo.rs:829 | update_refund_status | SELECT | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:839 | update_refund_status | SELECT | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:845 | update_refund_status | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:887 | generate_receipt | SELECT | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:899 | generate_receipt | SELECT | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/billing_repo.rs:925 | generate_receipt | SELECT | 42703 column "seating_session_id" does not exist | Prepared |
| backend/api/src/repositories/billing_repo.rs:940 | generate_receipt | SELECT | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:965 | generate_receipt | SELECT | Prepared | Prepared |
| backend/api/src/repositories/billing_repo.rs:1002 | get_split_bills | SELECT | 42703 column sb.split_number does not exist | Prepared |
| backend/api/src/repositories/billing_repo.rs:1037 | get_split_bills | SELECT | 42703 column sb.split_number does not exist | Prepared |
| backend/api/src/repositories/coupon_repo.rs:20 | list_coupons | SELECT | 42703 column "max_discount_amount_paise" does not exist | Prepared |
| backend/api/src/repositories/coupon_repo.rs:55 | create_coupon | INSERT | 42703 column "max_discount_amount_paise" does not exist | Prepared |
| backend/api/src/repositories/coupon_repo.rs:93 | update_status | UPDATE | 42703 column "max_discount_amount_paise" does not exist | Prepared |
| backend/api/src/repositories/coupon_repo.rs:120 | update_coupon | UPDATE | 42703 column "max_discount_amount_paise" does not exist | Prepared |
| backend/api/src/repositories/coupon_repo.rs:163 | delete_coupon | DELETE | Prepared | Prepared |
| backend/api/src/repositories/coupon_repo.rs:179 | validate_coupon | SELECT | 42703 column "max_discount_amount_paise" does not exist | Prepared |
| backend/api/src/repositories/coupon_repo.rs:245 | validate_coupon | SELECT | Prepared | Prepared |
| backend/api/src/repositories/coupon_repo.rs:318 | redeem_coupon | INSERT | 42703 column "restaurant_id" of relation "coupon_redemptions" does not exist | 42703 column "restaurant_id" of relation "coupon_redemptions" does not exist |
| backend/api/src/repositories/coupon_repo.rs:338 | redeem_coupon | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/customer_repo.rs:20 | list_customers | SELECT | 42703 column "total_spent_paise" does not exist | Prepared |
| backend/api/src/repositories/customer_repo.rs:38 | list_customers | SELECT | 42703 column "total_spent_paise" does not exist | Prepared |
| backend/api/src/repositories/customer_repo.rs:64 | create_customer | INSERT | 42703 column "total_spent_paise" does not exist | Prepared |
| backend/api/src/repositories/customer_repo.rs:99 | award_points | UPDATE | 42703 column "total_spent_paise" does not exist | Prepared |
| backend/api/src/repositories/customer_repo.rs:127 | list_reservations | SELECT | 42703 column "table_id" does not exist | Prepared |
| backend/api/src/repositories/customer_repo.rs:146 | list_reservations | SELECT | 42703 column "table_id" does not exist | Prepared |
| backend/api/src/repositories/customer_repo.rs:174 | create_reservation | INSERT | 42703 column "table_id" of relation "reservations" does not exist | Prepared |
| backend/api/src/repositories/customer_repo.rs:209 | update_reservation_status | UPDATE | 42703 column "table_id" does not exist | Prepared |
| backend/api/src/repositories/feedback_repo.rs:16 | list_feedback | SELECT | 42703 column f.is_public does not exist | Prepared |
| backend/api/src/repositories/feedback_repo.rs:45 | create_feedback | INSERT | 42703 column "is_public" of relation "customer_feedback" does not exist | Prepared |
| backend/api/src/repositories/feedback_repo.rs:75 | reply_feedback | UPDATE | 42703 column "is_public" does not exist | Prepared |
| backend/api/src/repositories/feedback_repo.rs:103 | toggle_visibility | UPDATE | 42703 column "is_public" does not exist | Prepared |
| backend/api/src/repositories/feedback_repo.rs:128 | list_public_feedback | SELECT | 42703 column f.is_public does not exist | Prepared |
| backend/api/src/repositories/inventory_repo.rs:20 | list_items | SELECT | Prepared | Prepared |
| backend/api/src/repositories/inventory_repo.rs:50 | create_item | INSERT | Prepared | Prepared |
| backend/api/src/repositories/inventory_repo.rs:87 | update_item | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/inventory_repo.rs:135 | record_wastage | SELECT | Prepared | Prepared |
| backend/api/src/repositories/inventory_repo.rs:156 | record_wastage | SELECT | Prepared | Prepared |
| backend/api/src/repositories/inventory_repo.rs:195 | record_wastage | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/inventory_repo.rs:209 | record_wastage | SELECT | Prepared | Prepared |
| backend/api/src/repositories/inventory_repo.rs:220 | record_wastage | INSERT | Prepared | Prepared |
| backend/api/src/repositories/inventory_repo.rs:244 | record_wastage | INSERT | Prepared | Prepared |
| backend/api/src/repositories/inventory_repo.rs:298 | list_movements | SELECT | Prepared | Prepared |
| backend/api/src/repositories/inventory_repo.rs:317 | list_movements | SELECT | Prepared | Prepared |
| backend/api/src/repositories/menu_repo.rs:19 | list_categories | SELECT | Prepared | Prepared |
| backend/api/src/repositories/menu_repo.rs:40 | list_items | SELECT | Prepared | Prepared |
| backend/api/src/repositories/menu_repo.rs:55 | list_items | SELECT | Prepared | Prepared |
| backend/api/src/repositories/menu_repo.rs:78 | get_item | SELECT | Prepared | Prepared |
| backend/api/src/repositories/menu_repo.rs:101 | update_availability | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/menu_repo.rs:130 | create_item | INSERT | Prepared | Prepared |
| backend/api/src/repositories/menu_repo.rs:169 | update_item | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/menu_repo.rs:218 | delete_item | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/menu_repo.rs:224 | delete_item | DELETE | 42703 column "menu_item_id" does not exist | 42703 column "menu_item_id" does not exist |
| backend/api/src/repositories/menu_repo.rs:229 | delete_item | DELETE | Prepared | Prepared |
| backend/api/src/repositories/menu_repo.rs:250 | create_category | INSERT | Prepared | Prepared |
| backend/api/src/repositories/menu_repo.rs:275 | update_category | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/menu_repo.rs:304 | delete_category | DELETE | Prepared | Prepared |
| backend/api/src/repositories/order_repo.rs:36 | create_order | SELECT | Prepared | Prepared |
| backend/api/src/repositories/order_repo.rs:58 | create_order | SELECT | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:117 | create_order | SELECT | Prepared | Prepared |
| backend/api/src/repositories/order_repo.rs:144 | create_order | SELECT | 42703 column "current_seating_session_id" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:158 | create_order | SELECT | 42703 column "seating_session_id" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:173 | create_order | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/order_repo.rs:189 | create_order | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/order_repo.rs:209 | create_order | INSERT | Prepared | Prepared |
| backend/api/src/repositories/order_repo.rs:240 | create_order | SELECT | 42703 column "current_seating_session_id" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:267 | create_order | INSERT | 42703 column "cgst_rate" of relation "orders" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:323 | create_order | INSERT | 42703 column "name" of relation "order_items" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:351 | create_order | UPDATE | 42703 column "current_seating_session_id" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:370 | create_order | INSERT | Prepared | Prepared |
| backend/api/src/repositories/order_repo.rs:411 | get_order | SELECT | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:440 | get_order | SELECT | 42703 column "name" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:475 | list_orders_by_customer_phone | SELECT | 42703 column "current_seating_session_id" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:486 | list_orders_by_customer_phone | SELECT | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:519 | list_orders_by_customer_phone | SELECT | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:556 | list_orders_by_customer_phone | SELECT | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:601 | list_orders_by_customer_phone | SELECT | 42703 column "name" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:642 | list_orders | SELECT | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:671 | list_orders | SELECT | Prepared | Prepared |
| backend/api/src/repositories/order_repo.rs:695 | list_orders | SELECT | 42703 column "name" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:740 | update_status | SELECT | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:777 | update_status | UPDATE | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:810 | update_status | SELECT | Prepared | Prepared |
| backend/api/src/repositories/order_repo.rs:827 | update_status | UPDATE | 42703 column "current_seating_session_id" of relation "tables" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:844 | update_status | SELECT | Prepared | Prepared |
| backend/api/src/repositories/order_repo.rs:855 | update_status | INSERT | Prepared | Prepared |
| backend/api/src/repositories/order_repo.rs:893 | update_status | SELECT | 42703 column "name" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:925 | assign_server | SELECT | Prepared | Prepared |
| backend/api/src/repositories/order_repo.rs:935 | assign_server | UPDATE | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:979 | update_items | SELECT | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:1009 | update_items | SELECT | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:1055 | update_items | DELETE | Prepared | Prepared |
| backend/api/src/repositories/order_repo.rs:1071 | update_items | INSERT | 42703 column "name" of relation "order_items" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:1102 | update_items | UPDATE | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/repositories/order_repo.rs:1149 | update_items | INSERT | Prepared | Prepared |
| backend/api/src/repositories/reports_repo.rs:24 | get_period_report | SELECT | Prepared | Prepared |
| backend/api/src/repositories/reports_repo.rs:67 | get_period_report | SELECT | Prepared | Prepared |
| backend/api/src/repositories/reports_repo.rs:104 | get_period_report | SELECT | 42703 column "legacy_unknown_timestamp" does not exist | Prepared |
| backend/api/src/repositories/reports_repo.rs:145 | get_period_report | SELECT | Prepared | Prepared |
| backend/api/src/repositories/reports_repo.rs:159 | get_period_report | SELECT | 42703 column sb.amount_paise does not exist | Prepared |
| backend/api/src/repositories/reports_repo.rs:182 | get_period_report | SELECT | Prepared | Prepared |
| backend/api/src/repositories/reports_repo.rs:211 | get_period_report | SELECT | Prepared | Prepared |
| backend/api/src/repositories/reports_repo.rs:249 | get_dashboard_summary | SELECT | Prepared | Prepared |
| backend/api/src/repositories/reports_repo.rs:256 | get_dashboard_summary | SELECT | Prepared | Prepared |
| backend/api/src/repositories/reports_repo.rs:264 | get_dashboard_summary | SELECT | Prepared | Prepared |
| backend/api/src/repositories/reports_repo.rs:269 | get_dashboard_summary | SELECT | Prepared | Prepared |
| backend/api/src/repositories/restaurant_repo.rs:13 | get_by_id | SELECT | 42703 column "cgst_rate" does not exist | 42703 column "whatsapp_templates" does not exist |
| backend/api/src/repositories/restaurant_repo.rs:48 | update | UPDATE | 42703 column "cgst_rate" does not exist | 42703 column "whatsapp_templates" does not exist |
| backend/api/src/repositories/restaurant_repo.rs:109 | list_staff | SELECT | 42703 column "permissions" does not exist | Prepared |
| backend/api/src/repositories/restaurant_repo.rs:131 | get_staff_by_id | SELECT | 42703 column "permissions" does not exist | Prepared |
| backend/api/src/repositories/table_repo.rs:18 | list_by_restaurant | UPDATE | 42703 column "current_seating_session_id" of relation "tables" does not exist | Prepared |
| backend/api/src/repositories/table_repo.rs:36 | list_by_restaurant | SELECT | 42703 column "current_seating_session_id" does not exist | Prepared |
| backend/api/src/repositories/table_repo.rs:68 | get_by_id | SELECT | 42703 column "current_seating_session_id" does not exist | Prepared |
| backend/api/src/repositories/table_repo.rs:138 | update_status | UPDATE | 42703 column "current_seating_session_id" does not exist | Prepared |
| backend/api/src/repositories/table_repo.rs:196 | create_table | INSERT | 42703 column "current_seating_session_id" does not exist | Prepared |
| backend/api/src/repositories/table_repo.rs:234 | delete_table | DELETE | Prepared | Prepared |
| backend/api/src/repositories/table_repo.rs:250 | assign_staff | SELECT | Prepared | Prepared |
| backend/api/src/repositories/table_repo.rs:260 | assign_staff | UPDATE | 42703 column "current_seating_session_id" does not exist | Prepared |
| backend/api/src/repositories/table_repo.rs:301 | transfer_table | SELECT | 42703 column "current_seating_session_id" does not exist | Prepared |
| backend/api/src/repositories/table_repo.rs:331 | transfer_table | SELECT | 42703 column "current_seating_session_id" does not exist | Prepared |
| backend/api/src/repositories/table_repo.rs:363 | transfer_table | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/table_repo.rs:377 | transfer_table | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/table_repo.rs:390 | transfer_table | UPDATE | Prepared | Prepared |
| backend/api/src/repositories/table_repo.rs:405 | transfer_table | SELECT | Prepared | Prepared |
| backend/api/src/repositories/table_repo.rs:417 | transfer_table | INSERT | Prepared | Prepared |
| backend/api/src/routes/auth_routes.rs:107 | login | SELECT | Prepared | Prepared |
| backend/api/src/routes/auth_routes.rs:203 | verify_admin_password | SELECT | Prepared | Prepared |
| backend/api/src/routes/health.rs:22 | readiness | SELECT | Prepared | Prepared |
| backend/api/src/routes/order_routes.rs:141 | assign_order_server | SELECT | Prepared | Prepared |
| backend/api/src/routes/public_routes.rs:59 | get_public_table | SELECT | 42703 column t.current_seating_session_id does not exist | Prepared |
| backend/api/src/routes/public_routes.rs:131 | get_public_restaurant_status | SELECT | Prepared | Prepared |
| backend/api/src/routes/public_routes.rs:173 | get_public_menu | SELECT | 42703 column "cgst_rate" does not exist | Prepared |
| backend/api/src/routes/public_routes.rs:276 | create_public_order | SELECT | Prepared | Prepared |
| backend/api/src/routes/public_routes.rs:307 | create_public_order | SELECT | 42703 column "current_seating_session_id" does not exist | Prepared |
| backend/api/src/routes/public_routes.rs:350 | create_public_order | SELECT | 42703 column "current_seating_session_id" does not exist | Prepared |
| backend/api/src/routes/public_routes.rs:527 | create_public_reservation | SELECT | 42703 column "table_id" does not exist | Prepared |
| backend/api/src/routes/public_routes.rs:613 | create_public_feedback | SELECT | 42703 column "is_public" does not exist | Prepared |
| backend/api/src/routes/public_routes.rs:687 | get_public_coupons | SELECT | 42703 column c.max_discount_amount_paise does not exist | Prepared |
| backend/api/src/routes/public_routes.rs:744 | get_public_restaurant_info | SELECT | Prepared | Prepared |
| backend/api/src/routes/public_routes.rs:794 | list_public_tables | SELECT | Prepared | Prepared |
| backend/api/src/routes/public_routes.rs:880 | get_public_customer_loyalty | SELECT | Prepared | Prepared |
| backend/api/src/routes/public_routes.rs:916 | get_public_customer_loyalty | SELECT | Prepared | Prepared |
| backend/api/src/routes/public_routes.rs:943 | get_public_customer_loyalty | SELECT | Prepared | Prepared |
| backend/api/src/routes/public_routes.rs:1017 | update_public_customer_profile | INSERT | Prepared | Prepared |
| backend/api/src/routes/public_routes.rs:1035 | update_public_customer_profile | UPDATE | Prepared | Prepared |
| backend/api/src/routes/restaurant_routes.rs:165 | create_staff_member | INSERT | 42703 column "permissions" of relation "staff_members" does not exist | Prepared |
| backend/api/src/routes/restaurant_routes.rs:231 | update_staff_member | UPDATE | Prepared | Prepared |
| backend/api/src/routes/restaurant_routes.rs:242 | update_staff_member | UPDATE | Prepared | Prepared |
| backend/api/src/routes/restaurant_routes.rs:276 | update_staff_member | UPDATE | 42703 column "permissions" of relation "staff_members" does not exist | Prepared |
| backend/api/src/routes/restaurant_routes.rs:291 | update_staff_member | UPDATE | Prepared | Prepared |
| backend/api/src/routes/restaurant_routes.rs:320 | delete_staff_member | UPDATE | Prepared | Prepared |
| backend/api/src/routes/restaurant_routes.rs:353 | mark_staff_attendance | INSERT | Prepared | Prepared |
| backend/api/src/routes/restaurant_routes.rs:379 | list_staff_attendance | SELECT | Prepared | Prepared |
| backend/api/src/routes/restaurant_routes.rs:427 | get_staff_performance | SELECT | Prepared | Prepared |
| backend/api/src/routes/restaurant_routes.rs:442 | get_staff_performance | SELECT | Prepared | Prepared |
| backend/api/src/routes/restaurant_routes.rs:566 | restaurant_heartbeat | INSERT | 42P01 relation "restaurant_heartbeats" does not exist | 42P01 relation "restaurant_heartbeats" does not exist |
| backend/api/src/services/outbox_service.rs:20 | emit_event | INSERT | Prepared | Prepared |
| backend/api/src/sync/worker.rs:67 | run_sync_cycle | SELECT | Prepared | Prepared |
| backend/api/src/sync/worker.rs:89 | run_sync_cycle | UPDATE | 42703 column "error_message" of relation "sync_outbox" does not exist | 42703 column "error_message" of relation "sync_outbox" does not exist |
| backend/api/src/sync/worker.rs:108 | run_sync_cycle | UPDATE | 42703 column "error_message" of relation "sync_outbox" does not exist | 42703 column "error_message" of relation "sync_outbox" does not exist |
| backend/api/src/sync/worker.rs:203 | sync_single_event | INSERT | Prepared | Prepared |
| backend/api/src/sync/worker.rs:280 | sync_single_event | INSERT | 42703 column "name" of relation "order_items" does not exist | Prepared |
| backend/api/src/sync/worker.rs:314 | sync_single_event | UPDATE | Prepared | Prepared |
| backend/api/src/sync/worker.rs:349 | sync_single_event | INSERT | Prepared | Prepared |
| backend/api/src/sync/worker.rs:369 | sync_single_event | UPDATE | Prepared | Prepared |
| backend/api/src/sync/worker.rs:412 | sync_single_event | INSERT | Prepared | Prepared |
| backend/api/src/sync/worker.rs:451 | sync_single_event | UPDATE | 22P02 invalid input value for enum table_status: "available" | 22P02 invalid input value for enum table_status: "available" |
| backend/api/src/sync/worker.rs:455 | sync_single_event | UPDATE | 22P02 invalid input value for enum table_status: "occupied" | 22P02 invalid input value for enum table_status: "occupied" |
| backend/api/src/sync/worker.rs:476 | pull_inbound_cloud_orders | SELECT | Prepared | Prepared |
| backend/api/src/sync/worker.rs:524 | pull_inbound_cloud_orders | SELECT | Prepared | Prepared |
| backend/api/src/sync/worker.rs:533 | pull_inbound_cloud_orders | INSERT | Prepared | Prepared |
| backend/api/src/sync/worker.rs:558 | pull_inbound_cloud_orders | SELECT | 42703 column "name" does not exist | Prepared |
| backend/api/src/sync/worker.rs:573 | pull_inbound_cloud_orders | INSERT | 42703 column "name" of relation "order_items" does not exist | Prepared |
| backend/api/src/sync/worker.rs:600 | pull_inbound_cloud_orders | UPDATE | 22P02 invalid input value for enum table_status: "occupied" | 22P02 invalid input value for enum table_status: "occupied" |
| backend/api/src/sync/worker.rs:612 | pull_inbound_cloud_orders | UPDATE | Prepared | Prepared |

## Public schema differences

Column comparison after initialization, including tables present on only one side. Types, nullability and generated values are included. Keys, privileges, defaults, triggers and indexes require separate checks.

| Table.column | Fresh local | Fresh cloud |
|---|---|---|
| coupon_assignments.assigned_by | Absent | uuid nullable |
| coupon_assignments.customer_id | uuid nullable | uuid required |
| coupon_assignments.max_redemptions | Absent | int4 nullable |
| coupon_assignments.redemptions_used | Absent | int4 nullable |
| coupon_assignments.restaurant_id | Absent | uuid required |
| coupon_assignments.status | Absent | varchar required |
| coupon_assignments.valid_from | Absent | timestamptz nullable |
| coupon_assignments.valid_until | Absent | timestamptz nullable |
| coupon_redemptions.discount_amount_applied_paise | int8 nullable | int8 nullable generated |
| coupons.discount_percentage | Absent | numeric nullable |
| coupons.discount_value | float8 required | float8 nullable |
| coupons.discount_value_paise | Absent | int8 nullable |
| coupons.end_date | timestamptz required | timestamptz nullable generated |
| coupons.is_targeted | Absent | bool nullable |
| coupons.max_discount_amount_paise | Absent | int8 nullable generated |
| coupons.min_order_value_paise | Absent | int8 nullable generated |
| coupons.one_time_per_customer | bool required | bool nullable |
| coupons.redemption_count | Absent | int4 nullable |
| coupons.start_date | timestamptz required | timestamptz nullable generated |
| coupons.total_usage_limit | Absent | int4 nullable |
| coupons.valid_from | Absent | timestamptz required |
| coupons.valid_until | Absent | timestamptz required |
| customer_auth_challenges.customer_id | Absent | uuid nullable |
| customer_auth_challenges.max_attempts | Absent | int4 required |
| customer_auth_challenges.restaurant_id | Absent | uuid nullable |
| customer_feedback.is_public | Absent | bool required |
| customers.phone | varchar nullable | varchar required |
| customers.total_spent_paise | Absent | int8 nullable generated |
| inventory_items.category | varchar required | varchar nullable |
| inventory_items.cost_per_unit_paise | int8 nullable | int8 required |
| inventory_items.min_threshold | numeric required | Absent |
| inventory_items.reorder_level | numeric nullable | numeric required |
| inventory_items.unit | varchar required | varchar nullable |
| inventory_items.unit_cost_paise | int8 required | Absent |
| inventory_items.unit_of_measure | varchar nullable | varchar required |
| invoice_prints.created_at | Absent | timestamptz required |
| invoice_prints.printed_by | Absent | uuid nullable |
| invoice_prints.reason | text nullable | text nullable generated |
| invoice_prints.reprint_reason | Absent | text nullable |
| invoices.discount_amount_paise | int8 required | int8 nullable generated |
| invoices.round_off_paise | Absent | int8 required |
| invoices.tax_amount_paise | int8 required | int8 nullable generated |
| invoices.total_amount_paise | int8 required | int8 nullable generated |
| invoices.total_paise | Absent | int8 required |
| menu_items.display_order | int4 required | int4 nullable |
| menu_items.is_veg | bool required | bool nullable |
| menu_items.preparation_time_minutes | int4 required | int4 nullable |
| order_items.discount_paise | int8 nullable | int8 required |
| order_items.item_name | varchar required | varchar nullable generated |
| order_items.item_total_paise | int8 nullable | int8 required |
| order_items.name | Absent | varchar required |
| order_items.special_instructions | text nullable | text nullable generated |
| order_items.subtotal_paise | int8 nullable | int8 required |
| order_items.tax_paise | int8 nullable | int8 required |
| order_items.total_paise | int8 nullable | int8 required |
| order_timeline_events.created_at | Absent | timestamptz required |
| order_timeline_events.note | text nullable | text nullable generated |
| orders.accepted_at | Absent | timestamptz nullable |
| orders.cgst_amount_paise | int8 required | int8 nullable |
| orders.cgst_rate | Absent | numeric nullable |
| orders.delivered_at | Absent | timestamptz nullable |
| orders.discount_amount_paise | int8 required | int8 nullable generated |
| orders.legacy_unknown_timestamp | bool required | bool nullable |
| orders.seating_session_id | Absent | varchar nullable |
| orders.served_at | Absent | timestamptz nullable generated |
| orders.sgst_amount_paise | int8 required | int8 nullable |
| orders.sgst_rate | Absent | numeric nullable |
| orders.tax_amount_paise | int8 required | int8 nullable generated |
| payments.legacy_unknown_timestamp | bool required | bool nullable |
| recipe_ingredients.created_at | timestamptz required | Absent |
| recipe_ingredients.unit | varchar required | Absent |
| recipe_ingredients.unit_of_measure | Absent | varchar required |
| recipes.instructions | Absent | text nullable |
| recipes.notes | text nullable | Absent |
| recipes.yield_servings | int4 required | numeric required |
| refunds.amount_paise | Absent | int8 nullable generated |
| refunds.authorized_by | Absent | uuid nullable |
| refunds.cancelled_at | Absent | timestamptz nullable |
| refunds.customer_name | varchar required | varchar nullable |
| refunds.legacy_unknown_timestamp | Absent | bool nullable |
| refunds.order_number | varchar required | varchar nullable |
| refunds.payment_id | Absent | uuid nullable |
| refunds.processed_by_staff_id | Absent | uuid nullable |
| refunds.refund_method | Absent | varchar nullable |
| refunds.requested_at | Absent | timestamptz nullable |
| refunds.staff_name | varchar required | varchar nullable |
| reservations.assigned_table_id | uuid nullable | uuid nullable generated |
| reservations.customer_id | Absent | uuid nullable |
| reservations.guest_count | int4 nullable | int4 nullable generated |
| reservations.reservation_date | Absent | date nullable |
| reservations.table_id | Absent | uuid nullable |
| restaurants.cgst_rate | Absent | numeric required |
| restaurants.sgst_rate | Absent | numeric required |
| restaurants.whatsapp_templates | jsonb nullable | Absent |
| split_bill_items.allocated_paise | Absent | int8 nullable generated |
| split_bills.amount_paise | Absent | int8 required |
| split_bills.payment_id | Absent | uuid nullable |
| split_bills.restaurant_id | uuid required | uuid nullable |
| split_bills.split_number | Absent | int4 nullable generated |
| split_bills.status | Absent | varchar nullable generated |
| split_bills.total_amount_paise | int8 required | int8 nullable generated |
| split_bills.total_splits | Absent | int4 nullable generated |
| split_bills.updated_at | Absent | timestamptz required |
| staff_members.permissions | Absent | jsonb required |
| stock_movements.balance_after | numeric nullable | numeric required |
| stock_movements.created_by | varchar nullable | Absent |
| stock_movements.ingredient_id | uuid nullable | Absent |
| stock_movements.inventory_item_id | uuid nullable | uuid required |
| stock_movements.new_stock | numeric nullable | Absent |
| stock_movements.previous_stock | numeric nullable | Absent |
| stock_movements.reason | text nullable | Absent |
| stock_movements.timestamp | timestamptz required | Absent |
| stock_movements.unit_cost_paise | int8 nullable | Absent |
| tables.current_seating_session_id | Absent | varchar nullable |
| tables.table_number | varchar nullable | varchar nullable generated |
| users.assigned_section | Absent | varchar nullable |
| users.created_at | Absent | timestamptz required |
| users.email | Absent | varchar required |
| users.id | Absent | uuid required |
| users.is_active | Absent | bool required |
| users.name | Absent | varchar required |
| users.permissions | Absent | jsonb required |
| users.phone | Absent | varchar nullable |
| users.pin_hash | Absent | varchar nullable |
| users.restaurant_id | Absent | uuid required |
| users.role | Absent | varchar required |
| users.shift | Absent | varchar nullable |
| users.updated_at | Absent | timestamptz required |
| wastage_records.ingredient_id | uuid nullable | Absent |
| wastage_records.inventory_item_id | uuid nullable | uuid required |
| wastage_records.reported_by | varchar nullable | Absent |
| wastage_records.timestamp | timestamptz required | Absent |
| wastage_records.unit | varchar nullable | Absent |
| wastage_records.unit_of_measure | varchar nullable | varchar required |
