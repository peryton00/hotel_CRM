use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{
        common::{PaginatedResponse, PaginationQuery},
        order::{CreateOrderRequest, Order, OrderItem, OrderWithItems},
    },
    services::{order_service::OrderService, outbox_service::OutboxService},
};

pub struct OrderRepository;

impl OrderRepository {
    pub async fn create_order(
        pool: &PgPool,
        restaurant_id: Uuid,
        staff_id: Option<Uuid>,
        req: CreateOrderRequest,
    ) -> Result<OrderWithItems, AppError> {
        if req.items.is_empty() {
            return Err(AppError::BadRequest(
                "Cannot create order with no items".to_string(),
            ));
        }

        let mut tx = pool.begin().await?;

        // 1. Calculate items total in paise
        let mut subtotal_paise: i64 = 0;

        for item in &req.items {
            let item_subtotal = item.unit_price_paise * item.quantity as i64;
            subtotal_paise += item_subtotal;
        }

        // Fetch tax settings configured by admin from database
        type TaxRatesRow = (Option<f64>, Option<f64>, Option<f64>, Option<f64>);
        let rest_rates: Option<TaxRatesRow> = sqlx::query_as(
            "SELECT COALESCE(gst_rate, 5.0)::float8, COALESCE(cgst_rate, gst_rate / 2.0, 2.5)::float8, COALESCE(sgst_rate, gst_rate / 2.0, 2.5)::float8, COALESCE(service_charge_rate, 0.0)::float8 FROM restaurants WHERE id = $1"
        )
        .bind(restaurant_id)
        .fetch_optional(&mut *tx)
        .await?;

        let (gst_rate, cgst_rate, sgst_rate, service_charge_rate) = rest_rates
            .map(|(g, c, s, sc)| {
                (
                    g.unwrap_or(5.0),
                    c.unwrap_or(2.5),
                    s.unwrap_or(2.5),
                    sc.unwrap_or(0.0),
                )
            })
            .unwrap_or((5.0, 2.5, 2.5, 0.0));

        let discount_paise = req.discount_paise.unwrap_or(0).min(subtotal_paise);
        let breakdown = OrderService::calculate_bill(
            subtotal_paise,
            discount_paise,
            gst_rate,
            service_charge_rate,
            true,
        );

        // 2. Generate sequential order number count
        let _count_row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM orders WHERE restaurant_id = $1")
                .bind(restaurant_id)
                .fetch_one(&mut *tx)
                .await?;

        let valid_staff_id = match staff_id {
            Some(id) => sqlx::query_scalar::<_, Uuid>(
                "SELECT id FROM staff_members WHERE id = $1 OR auth_user_id = $1 LIMIT 1",
            )
            .bind(id)
            .fetch_optional(&mut *tx)
            .await
            .unwrap_or(None),
            None => None,
        };

        let cust_name = req
            .customer_name
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .unwrap_or("Walk-in Guest");
        let cust_phone = req
            .customer_phone
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .unwrap_or("+919999999999");

        // Online & POS Customer auto-enrollment: link order to customer record by phone
        let resolved_customer_id = if let Some(phone) = req
            .customer_phone
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| s.len() >= 10 && *s != "+919999999999")
        {
            let clean_phone = phone.chars().filter(|c| c.is_ascii_digit()).collect::<String>();
            let phone_to_match = if clean_phone.len() >= 10 {
                &clean_phone[clean_phone.len() - 10..]
            } else {
                phone
            };

            let existing_id = sqlx::query_scalar::<_, Uuid>(
                "SELECT id FROM customers WHERE restaurant_id = $1 AND (phone LIKE '%' || $2 OR phone_e164 LIKE '%' || $2) LIMIT 1",
            )
            .bind(restaurant_id)
            .bind(phone_to_match)
            .fetch_optional(&mut *tx)
            .await?;

            if let Some(cid) = existing_id {
                let _ = sqlx::query(
                    r#"
                    UPDATE customers
                    SET total_orders = COALESCE(total_orders, 0) + 1,
                        visit_count = COALESCE(visit_count, 0) + 1,
                        total_spend_paise = COALESCE(total_spend_paise, 0) + $2,
                        total_spent_paise = COALESCE(total_spent_paise, 0) + $2,
                        name = CASE WHEN name = 'Walk-in Guest' OR name = '' THEN $3 ELSE name END,
                        updated_at = NOW()
                    WHERE id = $1
                    "#,
                )
                .bind(cid)
                .bind(breakdown.final_amount_paise)
                .bind(cust_name)
                .execute(&mut *tx)
                .await;

                Some(cid)
            } else {
                let new_cid = sqlx::query_scalar::<_, Uuid>(
                    r#"
                    INSERT INTO customers (restaurant_id, name, phone, phone_e164, total_orders, visit_count, total_spend_paise, total_spent_paise, updated_at)
                    VALUES ($1, $2, $3, $3, 1, 1, $4, $4, NOW())
                    RETURNING id
                    "#,
                )
                .bind(restaurant_id)
                .bind(cust_name)
                .bind(phone)
                .bind(breakdown.final_amount_paise)
                .fetch_optional(&mut *tx)
                .await?;

                new_cid.or(req.customer_id)
            }
        } else {
            req.customer_id
        };

        // 3. Insert order
        let generated_order_number = format!("ORD-{}", &Uuid::new_v4().to_string()[..8].to_uppercase());
        let order = sqlx::query_as::<_, Order>(
            r#"
            INSERT INTO orders (
                restaurant_id, order_number, order_type, pickup_reference, status, payment_status,
                table_id, customer_id, customer_name, customer_phone_e164, customer_phone,
                subtotal_paise, discount_paise, applied_coupon_code, tax_paise,
                cgst_rate, sgst_rate,
                service_charge_paise, round_off_paise, total_amount_paise, notes,
                server_staff_id, legacy_unknown_timestamp
            )
            VALUES ($1, $2, $3, $4, 'confirmed', 'pending', $5, $6, $7, $8, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, false)
            RETURNING id, restaurant_id, order_number, order_type, pickup_reference, status, payment_status, payment_method,
                      table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, applied_coupon_code, tax_paise,
                      cgst_rate::float8 AS cgst_rate, sgst_rate::float8 AS sgst_rate,
                      service_charge_paise, round_off_paise, total_amount_paise, notes,
                      server_staff_id, created_at, updated_at, NULL::timestamptz AS settled_at, cancelled_at,
                      legacy_unknown_timestamp
            "#,
        )
        .bind(restaurant_id)
        .bind(&generated_order_number)
        .bind(&req.order_type)
        .bind(&req.pickup_reference)
        .bind(req.table_id)
        .bind(resolved_customer_id)
        .bind(cust_name)
        .bind(cust_phone)
        .bind(breakdown.subtotal_paise)
        .bind(breakdown.discount_paise)
        .bind(&req.applied_coupon_code)
        .bind(breakdown.tax_paise)
        .bind(cgst_rate)
        .bind(sgst_rate)
        .bind(breakdown.service_charge_paise)
        .bind(breakdown.round_off_paise)
        .bind(breakdown.final_amount_paise)
        .bind(&req.notes)
        .bind(valid_staff_id)
        .fetch_one(&mut *tx)
        .await?;

        // 4. Insert items
        let mut inserted_items = Vec::new();
        for item in req.items {
            let item_sub = item.unit_price_paise * item.quantity as i64;
            let item_tx = (item_sub as f64 * (gst_rate / 100.0)).round() as i64;
            let item_tot = item_sub + item_tx;

            let order_item = sqlx::query_as::<_, OrderItem>(
                r#"
                INSERT INTO order_items (
                    order_id, menu_item_id, name, quantity, unit_price_paise,
                    subtotal_paise, tax_paise, discount_paise, total_paise, item_total_paise, notes, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $8, $9, 'confirmed')
                RETURNING id, order_id, menu_item_id, name AS item_name, quantity, unit_price_paise,
                          subtotal_paise, tax_paise, discount_paise, total_paise, notes, status, created_at
                "#,
            )
            .bind(order.id)
            .bind(item.menu_item_id)
            .bind(item.item_name)
            .bind(item.quantity)
            .bind(item.unit_price_paise)
            .bind(item_sub)
            .bind(item_tx)
            .bind(item_tot)
            .bind(item.notes)
            .fetch_one(&mut *tx)
            .await?;

            inserted_items.push(order_item);
        }

        // 5. If table is assigned, mark table as occupied
        if let Some(table_id) = req.table_id {
            sqlx::query(
                r#"
                UPDATE tables
                SET status = 'OCCUPIED'::table_status, active_order_id = $1, updated_at = NOW()
                WHERE id = $2 AND restaurant_id = $3
                "#,
            )
            .bind(order.id)
            .bind(table_id)
            .bind(restaurant_id)
            .execute(&mut *tx)
            .await?;
        }

        // 6. Record timeline event
        sqlx::query(
            r#"
            INSERT INTO order_timeline_events (order_id, from_status, to_status, notes, performed_by)
            VALUES ($1, NULL, 'confirmed', 'Order created and confirmed', $2)
            "#,
        )
        .bind(order.id)
        .bind(valid_staff_id)
        .execute(&mut *tx)
        .await?;

        // 7. Emit outbox event for sync
        let outbox_payload = serde_json::to_value(&order).unwrap_or_default();
        let idem_key = format!("order-create-{}", order.id);
        OutboxService::emit_event(
            &mut tx,
            "order",
            order.id,
            "ORDER_CREATED",
            outbox_payload,
            &idem_key,
        )
        .await?;

        tx.commit().await?;

        Ok(OrderWithItems {
            order,
            items: inserted_items,
        })
    }

    pub async fn get_order(
        pool: &PgPool,
        restaurant_id: Uuid,
        order_id: Uuid,
    ) -> Result<Option<OrderWithItems>, AppError> {
        let order = sqlx::query_as::<_, Order>(
            r#"
            SELECT id, restaurant_id,
                   'ORD-' || UPPER(SUBSTRING(id::text, 1, 8)) AS order_number,
                   order_type, pickup_reference, status, payment_status, payment_method,
                   table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, applied_coupon_code, tax_paise,
                   COALESCE(cgst_rate, CASE WHEN subtotal_paise > 0 AND tax_paise > 0 THEN ROUND((tax_paise::numeric / subtotal_paise::numeric * 50.0), 2) ELSE 2.5 END)::float8 AS cgst_rate,
                   COALESCE(sgst_rate, CASE WHEN subtotal_paise > 0 AND tax_paise > 0 THEN ROUND((tax_paise::numeric / subtotal_paise::numeric * 50.0), 2) ELSE 2.5 END)::float8 AS sgst_rate,
                   service_charge_paise, round_off_paise, total_amount_paise, notes,
                   server_staff_id, created_at, updated_at, NULL::timestamptz AS settled_at, cancelled_at,
                   legacy_unknown_timestamp
            FROM orders
            WHERE restaurant_id = $1 AND id = $2
            "#,
        )
        .bind(restaurant_id)
        .bind(order_id)
        .fetch_optional(pool)
        .await?;

        if let Some(order) = order {
            let items = sqlx::query_as::<_, OrderItem>(
                r#"
                SELECT id, order_id, menu_item_id, name AS item_name, quantity, unit_price_paise,
                       subtotal_paise, tax_paise, discount_paise, total_paise, notes, status, created_at
                FROM order_items
                WHERE order_id = $1
                ORDER BY created_at ASC
                "#,
            )
            .bind(order.id)
            .fetch_all(pool)
            .await?;

            Ok(Some(OrderWithItems { order, items }))
        } else {
            Ok(None)
        }
    }

    pub async fn list_orders_by_customer_phone(
        pool: &PgPool,
        restaurant_id: Uuid,
        customer_phone: &str,
        table_id: Option<Uuid>,
    ) -> Result<Vec<OrderWithItems>, AppError> {
        let clean_phone = customer_phone.trim();
        let phone_pattern = if clean_phone.is_empty() {
            "%__NONE__%".to_string()
        } else {
            format!("%{}%", clean_phone)
        };
        let exact_e164 = format!("+91{}", clean_phone.trim_start_matches("91"));

        let orders = if let Some(tid) = table_id {
            sqlx::query_as::<_, Order>(
                r#"
                SELECT id, restaurant_id,
                       COALESCE(order_number, 'ORD-' || UPPER(SUBSTRING(id::text, 1, 8))) AS order_number,
                       order_type, pickup_reference, status, payment_status, payment_method,
                       table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, applied_coupon_code, tax_paise,
                       COALESCE(cgst_rate, CASE WHEN subtotal_paise > 0 AND tax_paise > 0 THEN ROUND((tax_paise::numeric / subtotal_paise::numeric * 50.0), 2) ELSE 2.5 END)::float8 AS cgst_rate,
                       COALESCE(sgst_rate, CASE WHEN subtotal_paise > 0 AND tax_paise > 0 THEN ROUND((tax_paise::numeric / subtotal_paise::numeric * 50.0), 2) ELSE 2.5 END)::float8 AS sgst_rate,
                       service_charge_paise, round_off_paise, total_amount_paise, notes,
                       server_staff_id, created_at, updated_at, NULL::timestamptz AS settled_at, cancelled_at,
                       legacy_unknown_timestamp
                FROM orders
                WHERE restaurant_id = $1
                  AND (
                      (table_id = $4 AND created_at >= NOW() - INTERVAL '24 hours')
                      OR customer_phone = $2
                      OR customer_phone_e164 = $2
                      OR customer_phone_e164 = $3
                      OR customer_phone LIKE $5
                  )
                ORDER BY created_at DESC
                LIMIT 50
                "#,
            )
            .bind(restaurant_id)
            .bind(clean_phone)
            .bind(&exact_e164)
            .bind(tid)
            .bind(&phone_pattern)
            .fetch_all(pool)
            .await?
        } else {
            sqlx::query_as::<_, Order>(
                r#"
                SELECT id, restaurant_id,
                       COALESCE(order_number, 'ORD-' || UPPER(SUBSTRING(id::text, 1, 8))) AS order_number,
                       order_type, pickup_reference, status, payment_status, payment_method,
                       table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, applied_coupon_code, tax_paise,
                       COALESCE(cgst_rate, CASE WHEN subtotal_paise > 0 AND tax_paise > 0 THEN ROUND((tax_paise::numeric / subtotal_paise::numeric * 50.0), 2) ELSE 2.5 END)::float8 AS cgst_rate,
                       COALESCE(sgst_rate, CASE WHEN subtotal_paise > 0 AND tax_paise > 0 THEN ROUND((tax_paise::numeric / subtotal_paise::numeric * 50.0), 2) ELSE 2.5 END)::float8 AS sgst_rate,
                       service_charge_paise, round_off_paise, total_amount_paise, notes,
                       server_staff_id, created_at, updated_at, NULL::timestamptz AS settled_at, cancelled_at,
                       legacy_unknown_timestamp
                FROM orders
                WHERE restaurant_id = $1
                  AND (
                      customer_phone = $2
                      OR customer_phone_e164 = $2
                      OR customer_phone_e164 = $3
                      OR customer_phone LIKE $4
                  )
                ORDER BY created_at DESC
                LIMIT 50
                "#,
            )
            .bind(restaurant_id)
            .bind(clean_phone)
            .bind(&exact_e164)
            .bind(&phone_pattern)
            .fetch_all(pool)
            .await?
        };

        if orders.is_empty() {
            return Ok(Vec::new());
        }

        // High Performance Batch: Fetch all items for all orders in ONE database round-trip
        let order_ids: Vec<Uuid> = orders.iter().map(|o| o.id).collect();
        let all_items = sqlx::query_as::<_, OrderItem>(
            r#"
            SELECT id, order_id, menu_item_id, name AS item_name, quantity, unit_price_paise,
                   subtotal_paise, tax_paise, discount_paise, total_paise, notes, status, created_at
            FROM order_items
            WHERE order_id = ANY($1)
            ORDER BY created_at ASC
            "#,
        )
        .bind(&order_ids)
        .fetch_all(pool)
        .await?;

        let mut items_map: std::collections::HashMap<Uuid, Vec<OrderItem>> = std::collections::HashMap::new();
        for item in all_items {
            items_map.entry(item.order_id).or_default().push(item);
        }

        let result = orders
            .into_iter()
            .map(|order| {
                let items = items_map.remove(&order.id).unwrap_or_default();
                OrderWithItems { order, items }
            })
            .collect();

        Ok(result)
    }

    pub async fn list_orders(
        pool: &PgPool,
        restaurant_id: Uuid,
        status: Option<String>,
        days: Option<i64>,
        pagination: PaginationQuery,
    ) -> Result<PaginatedResponse<OrderWithItems>, AppError> {
        let limit = pagination.limit();
        let offset = pagination.offset();
        let days_limit = days.unwrap_or(30) as f64;

        let items = sqlx::query_as::<_, Order>(
            r#"
            SELECT id, restaurant_id,
                   'ORD-' || UPPER(SUBSTRING(id::text, 1, 8)) AS order_number,
                   order_type, pickup_reference, status, payment_status, payment_method,
                   table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, applied_coupon_code, tax_paise,
                   COALESCE(cgst_rate, CASE WHEN subtotal_paise > 0 AND tax_paise > 0 THEN ROUND((tax_paise::numeric / subtotal_paise::numeric * 50.0), 2) ELSE 2.5 END)::float8 AS cgst_rate,
                   COALESCE(sgst_rate, CASE WHEN subtotal_paise > 0 AND tax_paise > 0 THEN ROUND((tax_paise::numeric / subtotal_paise::numeric * 50.0), 2) ELSE 2.5 END)::float8 AS sgst_rate,
                   service_charge_paise, round_off_paise, total_amount_paise, notes,
                   server_staff_id, created_at, updated_at, NULL::timestamptz AS settled_at, cancelled_at,
                   legacy_unknown_timestamp
            FROM orders
            WHERE restaurant_id = $1
              AND ($2::text IS NULL OR status = $2)
              AND ($3::float8 <= 0.0 OR created_at >= NOW() - ($3 * interval '1 day'))
            ORDER BY created_at DESC
            LIMIT $4 OFFSET $5
            "#,
        )
        .bind(restaurant_id)
        .bind(&status)
        .bind(days_limit)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        let count_row: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*) FROM orders
            WHERE restaurant_id = $1
              AND ($2::text IS NULL OR status = $2)
              AND ($3::float8 <= 0.0 OR created_at >= NOW() - ($3 * interval '1 day'))
            "#,
        )
        .bind(restaurant_id)
        .bind(&status)
        .bind(days_limit)
        .fetch_one(pool)
        .await?;

        let (orders, total) = (items, count_row.0);

        let page = pagination.page.unwrap_or(1);

        if orders.is_empty() {
            return Ok(PaginatedResponse::new(vec![], total, page, limit));
        }

        let order_ids: Vec<Uuid> = orders.iter().map(|o| o.id).collect();

        let all_items = sqlx::query_as::<_, OrderItem>(
            r#"
            SELECT id, order_id, menu_item_id, name AS item_name, quantity, unit_price_paise,
                   subtotal_paise, tax_paise, discount_paise, total_paise, notes, status, created_at
            FROM order_items
            WHERE order_id = ANY($1)
            ORDER BY created_at ASC
            "#,
        )
        .bind(&order_ids)
        .fetch_all(pool)
        .await?;

        let mut items_by_order: std::collections::HashMap<Uuid, Vec<OrderItem>> =
            std::collections::HashMap::new();
        for item in all_items {
            items_by_order.entry(item.order_id).or_default().push(item);
        }

        let orders_with_items: Vec<OrderWithItems> = orders
            .into_iter()
            .map(|order| {
                let items = items_by_order.remove(&order.id).unwrap_or_default();
                OrderWithItems { order, items }
            })
            .collect();

        Ok(PaginatedResponse::new(
            orders_with_items,
            total,
            page,
            limit,
        ))
    }

    pub async fn update_status(
        pool: &PgPool,
        restaurant_id: Uuid,
        order_id: Uuid,
        new_status: &str,
        notes: Option<String>,
        staff_id: Option<Uuid>,
    ) -> Result<OrderWithItems, AppError> {
        let mut tx = pool.begin().await?;

        let current_order = sqlx::query_as::<_, Order>(
            r#"
            SELECT id, restaurant_id,
                   'ORD-' || UPPER(SUBSTRING(id::text, 1, 8)) AS order_number,
                   order_type, pickup_reference, status, payment_status, payment_method,
                   table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, applied_coupon_code, tax_paise,
                   COALESCE(cgst_rate, CASE WHEN subtotal_paise > 0 AND tax_paise > 0 THEN ROUND((tax_paise::numeric / subtotal_paise::numeric * 50.0), 2) ELSE 2.5 END)::float8 AS cgst_rate,
                   COALESCE(sgst_rate, CASE WHEN subtotal_paise > 0 AND tax_paise > 0 THEN ROUND((tax_paise::numeric / subtotal_paise::numeric * 50.0), 2) ELSE 2.5 END)::float8 AS sgst_rate,
                   service_charge_paise, round_off_paise, total_amount_paise, notes,
                   server_staff_id, created_at, updated_at, NULL::timestamptz AS settled_at, cancelled_at,
                   legacy_unknown_timestamp
            FROM orders
            WHERE restaurant_id = $1 AND id = $2 FOR UPDATE
            "#,
        )
        .bind(restaurant_id)
        .bind(order_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound("Order not found".to_string()))?;

        OrderService::validate_status_transition(&current_order.status, new_status)?;

        let cancelled_at = if new_status == "cancelled" {
            Some(Utc::now())
        } else {
            current_order.cancelled_at
        };

        let updated_order = sqlx::query_as::<_, Order>(
            r#"
            UPDATE orders
            SET status = $3,
                cancelled_at = $4,
                updated_at = NOW()
            WHERE restaurant_id = $1 AND id = $2
            RETURNING id, restaurant_id,
                      'ORD-' || UPPER(SUBSTRING(id::text, 1, 8)) AS order_number,
                      order_type, pickup_reference, status, payment_status, payment_method,
                      table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, applied_coupon_code, tax_paise,
                      COALESCE(cgst_rate, CASE WHEN subtotal_paise > 0 AND tax_paise > 0 THEN ROUND((tax_paise::numeric / subtotal_paise::numeric * 50.0), 2) ELSE 2.5 END)::float8 AS cgst_rate,
                      COALESCE(sgst_rate, CASE WHEN subtotal_paise > 0 AND tax_paise > 0 THEN ROUND((tax_paise::numeric / subtotal_paise::numeric * 50.0), 2) ELSE 2.5 END)::float8 AS sgst_rate,
                      service_charge_paise, round_off_paise, total_amount_paise, notes,
                      server_staff_id, created_at, updated_at, NULL::timestamptz AS settled_at, cancelled_at,
                      legacy_unknown_timestamp
            "#,
        )
        .bind(restaurant_id)
        .bind(order_id)
        .bind(new_status)
        .bind(cancelled_at)
        .fetch_one(&mut *tx)
        .await?;

        // If completed or cancelled and table was occupied, release table to available & wipe session
        let mut released_table_info: Option<(Uuid, String)> = None;
        if (new_status == "completed" || new_status == "cancelled")
            && current_order.table_id.is_some()
        {
            released_table_info = sqlx::query_as::<_, (Uuid, String)>(
                r#"
                UPDATE tables
                SET status = 'AVAILABLE'::table_status, active_order_id = NULL, current_seating_session_id = NULL, updated_at = NOW()
                WHERE id = $1 AND restaurant_id = $2
                RETURNING id, COALESCE(table_number, number)
                "#,
            )
            .bind(current_order.table_id)
            .bind(restaurant_id)
            .fetch_optional(&mut *tx)
            .await?;
        }

        let valid_staff_id = match staff_id {
            Some(id) => sqlx::query_scalar::<_, Uuid>(
                "SELECT id FROM staff_members WHERE id = $1 OR auth_user_id = $1 LIMIT 1",
            )
            .bind(id)
            .fetch_optional(&mut *tx)
            .await
            .unwrap_or(None),
            None => None,
        };

        // Record timeline event
        sqlx::query(
            r#"
            INSERT INTO order_timeline_events (order_id, from_status, to_status, notes, performed_by)
            VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(order_id)
        .bind(&current_order.status)
        .bind(new_status)
        .bind(&notes)
        .bind(valid_staff_id)
        .execute(&mut *tx)
        .await?;

        // Emit outbox event for sync
        let outbox_payload = serde_json::json!({
            "order_id": order_id,
            "restaurant_id": restaurant_id,
            "from_status": &current_order.status,
            "to_status": new_status,
            "notes": notes,
            "staff_id": valid_staff_id,
        });
        let idem_key = format!(
            "order-status-{}-{}",
            order_id,
            Utc::now().timestamp_millis()
        );
        OutboxService::emit_event(
            &mut tx,
            "order",
            order_id,
            "ORDER_STATUS_UPDATED",
            outbox_payload,
            &idem_key,
        )
        .await?;

        let items = sqlx::query_as::<_, OrderItem>(
            r#"
            SELECT id, order_id, menu_item_id, name AS item_name, quantity, unit_price_paise,
                   subtotal_paise, tax_paise, discount_paise, total_paise, notes, status, created_at
            FROM order_items
            WHERE order_id = $1
            ORDER BY created_at ASC
            "#,
        )
        .bind(order_id)
        .fetch_all(&mut *tx)
        .await?;

        tx.commit().await?;

        if let Some((tbl_id, tbl_num)) = released_table_info {
            crate::ws::broadcast_table_status(
                tbl_id,
                &tbl_num,
                "AVAILABLE",
                true,
                None,
            );
        }

        Ok(OrderWithItems {
            order: updated_order,
            items,
        })
    }

    pub async fn assign_server(
        pool: &PgPool,
        restaurant_id: Uuid,
        order_id: Uuid,
        server_staff_id: Option<Uuid>,
    ) -> Result<Order, AppError> {
        let valid_staff_id = match server_staff_id {
            Some(id) => sqlx::query_scalar::<_, Uuid>(
                "SELECT id FROM staff_members WHERE id = $1 OR auth_user_id = $1 LIMIT 1",
            )
            .bind(id)
            .fetch_optional(pool)
            .await
            .unwrap_or(None),
            None => None,
        };

        let order = sqlx::query_as::<_, Order>(
            r#"
            UPDATE orders
            SET server_staff_id = $3,
                updated_at = NOW()
            WHERE restaurant_id = $1 AND id = $2
            RETURNING id, restaurant_id,
                      'ORD-' || UPPER(SUBSTRING(id::text, 1, 8)) AS order_number,
                      order_type, pickup_reference, status, payment_status, payment_method,
                      table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, applied_coupon_code, tax_paise,
                      COALESCE(cgst_rate, CASE WHEN subtotal_paise > 0 AND tax_paise > 0 THEN ROUND((tax_paise::numeric / subtotal_paise::numeric * 50.0), 2) ELSE 2.5 END)::float8 AS cgst_rate,
                      COALESCE(sgst_rate, CASE WHEN subtotal_paise > 0 AND tax_paise > 0 THEN ROUND((tax_paise::numeric / subtotal_paise::numeric * 50.0), 2) ELSE 2.5 END)::float8 AS sgst_rate,
                      service_charge_paise, round_off_paise, total_amount_paise, notes,
                      server_staff_id, created_at, updated_at, NULL::timestamptz AS settled_at, cancelled_at,
                      legacy_unknown_timestamp
            "#,
        )
        .bind(restaurant_id)
        .bind(order_id)
        .bind(valid_staff_id)
        .fetch_one(pool)
        .await?;

        Ok(order)
    }
}
