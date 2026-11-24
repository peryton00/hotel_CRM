use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{
        billing::{
            CreatePaymentRequest, CreateRefundRequest, Payment, ReceiptData, ReceiptItemData,
            Refund, SettleOrderRequest, SplitBill, SplitOrderRequest,
        },
        order::{Order, OrderItem},
        paise::Paise,
        restaurant::Restaurant,
    },
    services::outbox_service::OutboxService,
};

pub struct BillingRepository;

impl BillingRepository {
    pub async fn settle_order(
        pool: &PgPool,
        restaurant_id: Uuid,
        order_id: Uuid,
        _staff_id: Option<Uuid>,
        req: SettleOrderRequest,
    ) -> Result<Payment, AppError> {
        let mut tx = pool.begin().await?;

        // 1. Idempotency check
        if let Some(ref idem) = req.idempotency_key {
            let existing = sqlx::query_as::<_, Payment>(
                r#"
                SELECT id, restaurant_id, order_id, split_bill_id, amount_paise, payment_method,
                       status, NULL::text as upi_transaction_ref, idempotency_key, settled_at, notes,
                       created_at, created_at as updated_at, false as legacy_unknown_timestamp
                FROM payments
                WHERE restaurant_id = $1 AND idempotency_key = $2
                "#,
            )
            .bind(restaurant_id)
            .bind(idem)
            .fetch_optional(&mut *tx)
            .await?;

            if let Some(payment) = existing {
                tx.rollback().await?;
                return Ok(payment);
            }
        }

        // 2. Fetch order
        let order = sqlx::query_as::<_, Order>(
            r#"
            SELECT id, restaurant_id, COALESCE(order_number, 'ORD-' || UPPER(SUBSTRING(id::text, 1, 8))) AS order_number, order_type, pickup_reference, status, payment_status, payment_method,
                   table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, applied_coupon_code, tax_paise,
                   cgst_rate::float8 AS cgst_rate, sgst_rate::float8 AS sgst_rate,
                   service_charge_paise, round_off_paise, total_amount_paise, notes,
                   server_staff_id,
                   CASE 
                       WHEN seating_session_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                       THEN seating_session_id::uuid 
                       ELSE NULL 
                   END AS seating_session_id,
                   created_at, updated_at, settled_at, cancelled_at,
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

        if order.status.to_lowercase() == "cancelled" {
            return Err(AppError::BadRequest(
                "Cannot settle a cancelled order".to_string(),
            ));
        }

        if order.payment_status.to_lowercase() == "paid" {
            return Err(AppError::Conflict(
                "Order has already been fully settled".to_string(),
            ));
        }

        // Fetch any sibling unpaid orders for the same table session to settle all rounds together into 1 bill
        let sibling_orders = if let Some(tbl_id) = order.table_id {
            if let Some(session_id) = order.seating_session_id {
                sqlx::query_as::<_, Order>(
                    r#"
                    SELECT id, restaurant_id, COALESCE(order_number, 'ORD-' || UPPER(SUBSTRING(id::text, 1, 8))) AS order_number, order_type, pickup_reference, status, payment_status, payment_method,
                           table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, applied_coupon_code, tax_paise,
                           cgst_rate::float8 AS cgst_rate, sgst_rate::float8 AS sgst_rate,
                           service_charge_paise, round_off_paise, total_amount_paise, notes,
                           server_staff_id,
                           CASE 
                               WHEN seating_session_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                               THEN seating_session_id::uuid 
                               ELSE NULL 
                           END AS seating_session_id,
                           created_at, updated_at, settled_at, cancelled_at,
                           legacy_unknown_timestamp
                    FROM orders
                    WHERE restaurant_id = $1 
                      AND seating_session_id::text = $2::text
                      AND id != $3
                      AND status NOT IN ('cancelled') 
                      AND payment_status != 'paid'
                    FOR UPDATE
                    "#,
                )
                .bind(restaurant_id)
                .bind(session_id.to_string())
                .bind(order.id)
                .fetch_all(&mut *tx)
                .await?
            } else {
                sqlx::query_as::<_, Order>(
                    r#"
                    SELECT id, restaurant_id, COALESCE(order_number, 'ORD-' || UPPER(SUBSTRING(id::text, 1, 8))) AS order_number, order_type, pickup_reference, status, payment_status, payment_method,
                           table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, applied_coupon_code, tax_paise,
                           cgst_rate::float8 AS cgst_rate, sgst_rate::float8 AS sgst_rate,
                           service_charge_paise, round_off_paise, total_amount_paise, notes,
                           server_staff_id,
                           CASE 
                               WHEN seating_session_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                               THEN seating_session_id::uuid 
                               ELSE NULL 
                           END AS seating_session_id,
                           created_at, updated_at, settled_at, cancelled_at,
                           legacy_unknown_timestamp
                    FROM orders
                    WHERE restaurant_id = $1 
                      AND table_id = $2 
                      AND id != $3
                      AND status NOT IN ('cancelled') 
                      AND payment_status != 'paid'
                      AND created_at >= NOW() - INTERVAL '4 hours'
                    FOR UPDATE
                    "#,
                )
                .bind(restaurant_id)
                .bind(tbl_id)
                .bind(order.id)
                .fetch_all(&mut *tx)
                .await?
            }
        } else {
            Vec::new()
        };

        let now = Utc::now();

        // 3. Aggregate all rounds into single unified bill & apply discounts
        let combined_subtotal_paise: i64 =
            order.subtotal_paise + sibling_orders.iter().map(|s| s.subtotal_paise).sum::<i64>();
        let combined_tax_paise: i64 =
            order.tax_paise + sibling_orders.iter().map(|s| s.tax_paise).sum::<i64>();
        let combined_gross_total_paise: i64 = combined_subtotal_paise + combined_tax_paise;

        let has_coupon = req.applied_coupon_code.is_some() || order.applied_coupon_code.is_some();
        let raw_discount_paise = req.discount_paise.unwrap_or(order.discount_paise);
        let total_tax_rate = order.cgst_rate.unwrap_or(2.5) + order.sgst_rate.unwrap_or(2.5);

        let (final_discount_paise, final_tax_paise, final_total_paise, final_coupon_code) =
            if has_coupon {
                // Coupon discount applies to total BEFORE taxes
                let coupon_discount = raw_discount_paise.min(combined_subtotal_paise).max(0);
                let taxable_paise = (combined_subtotal_paise - coupon_discount).max(0);
                let tax_paise = if combined_subtotal_paise > 0 {
                    ((taxable_paise as f64) * total_tax_rate / 100.0).round() as i64
                } else {
                    0
                };
                let unrounded_total = taxable_paise + tax_paise;
                // Round to nearest whole rupee (100 paise) so chargeable amount never shows pointed/decimal value
                let rounded_rupees = ((unrounded_total as f64) / 100.0).round() as i64;
                let final_total = (rounded_rupees * 100).max(0);
                (
                    coupon_discount,
                    tax_paise,
                    final_total,
                    req.applied_coupon_code.or(order.applied_coupon_code),
                )
            } else {
                // Admin discount / round-off applies to total AFTER taxes
                let admin_discount = raw_discount_paise.min(combined_gross_total_paise).max(0);
                let unrounded_total = (combined_gross_total_paise - admin_discount).max(0);
                // Round to nearest whole rupee (100 paise) so chargeable amount never shows pointed/decimal value
                let rounded_rupees = ((unrounded_total as f64) / 100.0).round() as i64;
                let final_total = (rounded_rupees * 100).max(0);
                (admin_discount, combined_tax_paise, final_total, None)
            };

        let payment_amount = if req.discount_paise.is_some() || !sibling_orders.is_empty() {
            final_total_paise
        } else {
            req.amount_paise
        };

        // 4. Record payment
        let payment = sqlx::query_as::<_, Payment>(
            r#"
            INSERT INTO payments (
                restaurant_id, order_id, amount_paise, payment_method, status,
                idempotency_key, settled_at, notes
            )
            VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7)
            RETURNING id, restaurant_id, order_id, split_bill_id, amount_paise, payment_method,
                      status, NULL::text as upi_transaction_ref, idempotency_key, settled_at, notes,
                      created_at, created_at as updated_at, false as legacy_unknown_timestamp
            "#,
        )
        .bind(restaurant_id)
        .bind(order.id)
        .bind(payment_amount)
        .bind(&req.payment_method)
        .bind(req.idempotency_key)
        .bind(now)
        .bind(req.notes)
        .fetch_one(&mut *tx)
        .await?;

        // 5. Update primary order and mark ALL sibling orders in the table session as paid
        sqlx::query(
            r#"
            UPDATE orders
            SET payment_status = 'paid',
                status = 'completed',
                payment_method = $1,
                discount_paise = $2,
                applied_coupon_code = $3,
                tax_paise = $4,
                total_amount_paise = $5,
                subtotal_paise = $6,
                settled_at = $7,
                updated_at = NOW()
            WHERE restaurant_id = $8 AND id = $9
            "#,
        )
        .bind(&req.payment_method)
        .bind(final_discount_paise)
        .bind(&final_coupon_code)
        .bind(final_tax_paise)
        .bind(final_total_paise)
        .bind(combined_subtotal_paise)
        .bind(now)
        .bind(restaurant_id)
        .bind(order.id)
        .execute(&mut *tx)
        .await?;

        let _ = sqlx::query(
            r#"
            UPDATE split_bills
            SET payment_status = 'paid',
                payment_method = $1,
                settled_at = $2,
                updated_at = NOW()
            WHERE order_id = $3
            "#,
        )
        .bind(&req.payment_method)
        .bind(now)
        .bind(order.id)
        .execute(&mut *tx)
        .await;

        for sib in &sibling_orders {
            sqlx::query(
                r#"
                UPDATE orders
                SET payment_status = 'paid',
                    status = 'completed',
                    payment_method = $1,
                    settled_at = $2,
                    updated_at = NOW()
                WHERE restaurant_id = $3 AND id = $4
                "#,
            )
            .bind(&req.payment_method)
            .bind(now)
            .bind(restaurant_id)
            .bind(sib.id)
            .execute(&mut *tx)
            .await?;
        }

        // Clear seating_session_id for all orders in this session so the session is
        // destroyed on billing completion — prevents new customers being merged into old bills
        if let Some(session_id) = order.seating_session_id {
            sqlx::query(
                "UPDATE orders SET seating_session_id = NULL, updated_at = NOW() WHERE restaurant_id = $1 AND seating_session_id::text = $2::text",
            )
            .bind(restaurant_id)
            .bind(session_id.to_string())
            .execute(&mut *tx)
            .await?;
        }

        // Release table to AVAILABLE and reset session since bill is fully settled
        if let Some(tbl_id) = order.table_id {
            let released_info = sqlx::query_as::<_, (Uuid, String)>(
                r#"
                UPDATE tables
                SET status = 'AVAILABLE'::table_status, active_order_id = NULL, current_seating_session_id = NULL, updated_at = NOW()
                WHERE id = $1 AND restaurant_id = $2
                RETURNING id, COALESCE(table_number, number)
                "#,
            )
            .bind(tbl_id)
            .bind(restaurant_id)
            .fetch_optional(&mut *tx)
            .await?;

            if let Some((t_id, t_num)) = released_info {
                crate::ws::broadcast_table_status(t_id, &t_num, "AVAILABLE", true, None);
            }
        }

        // 6. Generate and store unified invoice (wrapped in a savepoint)
        let invoice_num = format!("INV-{}", order.order_number);
        let _ = sqlx::query("SAVEPOINT invoice_sp").execute(&mut *tx).await;
        let inv_res = sqlx::query(
            r#"
            INSERT INTO invoices (
                restaurant_id, order_id, invoice_number, subtotal_paise,
                discount_paise, discount_amount_paise, tax_paise, tax_amount_paise,
                total_paise, total_amount_paise, payment_status
            )
            VALUES ($1, $2, $3, $4, $5, $5, $6, $6, $7, $7, 'PAID')
            ON CONFLICT (restaurant_id, invoice_number) DO UPDATE
            SET subtotal_paise = EXCLUDED.subtotal_paise,
                discount_paise = EXCLUDED.discount_paise,
                discount_amount_paise = EXCLUDED.discount_amount_paise,
                tax_paise = EXCLUDED.tax_paise,
                tax_amount_paise = EXCLUDED.tax_amount_paise,
                total_paise = EXCLUDED.total_paise,
                total_amount_paise = EXCLUDED.total_amount_paise,
                payment_status = 'PAID',
                updated_at = NOW()
            "#,
        )
        .bind(restaurant_id)
        .bind(order.id)
        .bind(&invoice_num)
        .bind(combined_subtotal_paise)
        .bind(final_discount_paise)
        .bind(final_tax_paise)
        .bind(final_total_paise)
        .execute(&mut *tx)
        .await;

        if inv_res.is_err() {
            let _ = sqlx::query("ROLLBACK TO SAVEPOINT invoice_sp")
                .execute(&mut *tx)
                .await;
        } else {
            let _ = sqlx::query("RELEASE SAVEPOINT invoice_sp")
                .execute(&mut *tx)
                .await;
        }

        // 7. Emit outbox event for sync
        let outbox_payload = serde_json::json!({
            "payment_id": payment.id,
            "order_id": order.id,
            "restaurant_id": restaurant_id,
            "amount_paise": payment.amount_paise,
            "discount_paise": final_discount_paise,
            "total_paise": final_total_paise,
            "payment_method": payment.payment_method,
            "settled_at": payment.settled_at,
            "order_number": order.order_number,
        });
        let idem = payment
            .idempotency_key
            .clone()
            .unwrap_or_else(|| format!("pay-settle-{}", payment.id));
        OutboxService::emit_event(
            &mut tx,
            "payment",
            payment.id,
            "PAYMENT_SETTLED",
            outbox_payload,
            &idem,
        )
        .await?;

        tx.commit().await?;

        Ok(payment)
    }

    pub async fn record_payment(
        pool: &PgPool,
        restaurant_id: Uuid,
        req: CreatePaymentRequest,
    ) -> Result<Payment, AppError> {
        let mut tx = pool.begin().await?;

        if let Some(ref idem) = req.idempotency_key {
            let existing = sqlx::query_as::<_, Payment>(
                r#"
                SELECT id, restaurant_id, order_id, split_bill_id, amount_paise, payment_method,
                       status, upi_transaction_ref, idempotency_key, settled_at, notes,
                       created_at, updated_at, false as legacy_unknown_timestamp
                FROM payments
                WHERE restaurant_id = $1 AND idempotency_key = $2
                "#,
            )
            .bind(restaurant_id)
            .bind(idem)
            .fetch_optional(&mut *tx)
            .await?;

            if let Some(payment) = existing {
                tx.rollback().await?;
                return Ok(payment);
            }
        }

        let now = Utc::now();

        let payment = sqlx::query_as::<_, Payment>(
            r#"
            INSERT INTO payments (
                restaurant_id, order_id, split_bill_id, amount_paise, payment_method,
                status, upi_transaction_ref, idempotency_key, settled_at, notes,
                created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, $9, $8, $8)
            RETURNING id, restaurant_id, order_id, split_bill_id, amount_paise, payment_method,
                      status, upi_transaction_ref, idempotency_key, settled_at, notes,
                      created_at, updated_at, false as legacy_unknown_timestamp
            "#,
        )
        .bind(restaurant_id)
        .bind(req.order_id)
        .bind(req.split_bill_id)
        .bind(req.amount_paise)
        .bind(&req.payment_method)
        .bind(req.upi_transaction_ref)
        .bind(req.idempotency_key)
        .bind(now)
        .bind(req.notes)
        .fetch_one(&mut *tx)
        .await?;

        if let Some(sb_id) = req.split_bill_id {
            sqlx::query(
                r#"
                UPDATE split_bills
                SET payment_status = 'paid',
                    payment_method = $1,
                    settled_at = $2,
                    updated_at = $2
                WHERE id = $3
                "#,
            )
            .bind(&req.payment_method)
            .bind(now)
            .bind(sb_id)
            .execute(&mut *tx)
            .await?;

            let unpaid_count: (i64,) = sqlx::query_as(
                r#"
                SELECT COUNT(*) FROM split_bills
                WHERE order_id = $1 AND payment_status != 'paid'
                "#,
            )
            .bind(req.order_id)
            .fetch_one(&mut *tx)
            .await?;

            if unpaid_count.0 == 0 {
                sqlx::query(
                    r#"
                    UPDATE orders
                    SET payment_status = 'paid',
                        status = 'completed',
                        payment_method = $1,
                        settled_at = $2,
                        updated_at = $2
                    WHERE id = $3
                    "#,
                )
                .bind(&req.payment_method)
                .bind(now)
                .bind(req.order_id)
                .execute(&mut *tx)
                .await?;

                crate::ws::broadcast_order_status(
                    req.order_id,
                    None,
                    None,
                    "COMPLETED",
                    Some("PAID"),
                );
            } else {
                sqlx::query(
                    r#"
                    UPDATE orders
                    SET payment_status = 'partially_paid',
                        updated_at = $1
                    WHERE id = $2
                    "#,
                )
                .bind(now)
                .bind(req.order_id)
                .execute(&mut *tx)
                .await?;

                crate::ws::broadcast_order_status(
                    req.order_id,
                    None,
                    None,
                    "SERVED",
                    Some("PARTIALLY_PAID"),
                );
            }
        } else {
            crate::ws::broadcast_order_status(req.order_id, None, None, "COMPLETED", Some("PAID"));
        }

        tx.commit().await?;

        Ok(payment)
    }

    pub async fn split_order(
        pool: &PgPool,
        restaurant_id: Uuid,
        order_id: Uuid,
        req: SplitOrderRequest,
    ) -> Result<Vec<SplitBill>, AppError> {
        let mut tx = pool.begin().await?;

        let order = sqlx::query_as::<_, Order>(
            r#"
            SELECT id, restaurant_id, order_number, order_type, status, payment_status,
                   table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, tax_paise,
                   service_charge_paise, round_off_paise, total_amount_paise, notes,
                   server_staff_id, created_at, updated_at, settled_at, cancelled_at,
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

        if order.status.to_lowercase() == "cancelled" {
            return Err(AppError::BadRequest(
                "Cannot split a cancelled order".to_string(),
            ));
        }

        // Cannot split an already paid order
        if order.payment_status.to_lowercase() == "paid" {
            return Err(AppError::Conflict(
                "Cannot split an already settled order".to_string(),
            ));
        }

        // Check if any split bill for this order has already been settled/paid
        let paid_split_exists: (bool,) = sqlx::query_as(
            r#"
            SELECT EXISTS(
                SELECT 1 FROM split_bills 
                WHERE order_id = $1 AND LOWER(payment_status) IN ('paid', 'completed')
            )
            "#,
        )
        .bind(order.id)
        .fetch_one(&mut *tx)
        .await?;

        if paid_split_exists.0 {
            return Err(AppError::Conflict(
                "Cannot re-split an order with already settled split bills. Please settle the remaining parts.".to_string(),
            ));
        }

        // Safe to reset unpaid splits for this order
        sqlx::query("DELETE FROM split_bills WHERE order_id = $1")
            .bind(order.id)
            .execute(&mut *tx)
            .await?;

        let mut created_splits = Vec::new();

        if req.split_type == "equal" {
            let ways = req.ways.unwrap_or(2).clamp(2, 20);
            let splits_paise = Paise(order.total_amount_paise).split_equally(ways);

            for (idx, split_paise) in splits_paise.into_iter().enumerate() {
                let split = sqlx::query_as::<_, SplitBill>(
                    r#"
                    INSERT INTO split_bills (restaurant_id, order_id, split_index, split_total_count, split_type, amount_paise, payment_status)
                    VALUES ($1, $2, $3, $4, 'equal', $5, 'pending')
                    ON CONFLICT (order_id, split_index) DO UPDATE
                    SET split_total_count = EXCLUDED.split_total_count,
                        split_type = EXCLUDED.split_type,
                        amount_paise = EXCLUDED.amount_paise,
                        payment_status = EXCLUDED.payment_status,
                        updated_at = NOW()
                    RETURNING id, order_id, COALESCE(split_number, split_index) AS split_number, split_type, COALESCE(amount_paise, total_amount_paise) AS amount_paise, payment_status,
                              settled_at, payment_id, created_at, COALESCE(updated_at, created_at) AS updated_at
                    "#,
                )
                .bind(restaurant_id)
                .bind(order.id)
                .bind((idx + 1) as i32)
                .bind(ways as i32)
                .bind(split_paise.0)
                .fetch_one(&mut *tx)
                .await?;

                created_splits.push(split);
            }

            // Clean up any extraneous higher split indices if re-split into fewer parts
            let _ = sqlx::query("DELETE FROM split_bills WHERE order_id = $1 AND split_index > $2")
                .bind(order.id)
                .bind(ways as i32)
                .execute(&mut *tx)
                .await;

            let _ = sqlx::query(
                "UPDATE orders SET is_split = TRUE, split_count = $1, payment_status = 'partially_paid', updated_at = NOW() WHERE id = $2"
            )
            .bind(ways as i32)
            .bind(order.id)
            .execute(&mut *tx)
            .await;
        } else {
            return Err(AppError::BadRequest(
                "Only 'equal' split type is currently supported".to_string(),
            ));
        }

        tx.commit().await?;

        Ok(created_splits)
    }

    pub async fn create_refund(
        pool: &PgPool,
        restaurant_id: Uuid,
        order_id: Uuid,
        req: CreateRefundRequest,
        staff_id: Option<Uuid>,
    ) -> Result<Refund, AppError> {
        let mut tx = pool.begin().await?;

        // Check order
        let order = sqlx::query_as::<_, Order>(
            r#"
            SELECT id, restaurant_id, COALESCE(order_number, 'ORD-' || UPPER(SUBSTRING(id::text, 1, 8))) AS order_number, order_type, pickup_reference, status, payment_status, payment_method,
                   table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, applied_coupon_code, tax_paise,
                   cgst_rate::float8 AS cgst_rate, sgst_rate::float8 AS sgst_rate,
                   service_charge_paise, round_off_paise, total_amount_paise, notes,
                   server_staff_id,
                   CASE 
                       WHEN seating_session_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                       THEN seating_session_id::uuid 
                       ELSE NULL 
                   END AS seating_session_id,
                   created_at, updated_at, settled_at, cancelled_at,
                   legacy_unknown_timestamp
            FROM orders
            WHERE restaurant_id = $1 AND id = $2
            "#,
        )
        .bind(restaurant_id)
        .bind(order_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound("Order not found".to_string()))?;

        // Refund cannot exceed order total
        if req.refund_amount_paise > order.total_amount_paise {
            return Err(AppError::BadRequest(
                "Refund amount cannot exceed the order total amount".to_string(),
            ));
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

        let refund = sqlx::query_as::<_, Refund>(
            r#"
            INSERT INTO refunds (
                restaurant_id, order_id, payment_id, refund_amount_paise, reason,
                status, requested_at, refund_method, processed_by_staff_id, idempotency_key
            )
            VALUES ($1, $2, $3, $4, $5, 'requested', NOW(), $6, $7, $8)
            RETURNING id, restaurant_id, order_id, payment_id, refund_amount_paise, reason,
                      status, requested_at, completed_at, cancelled_at, refund_method,
                      processed_by_staff_id, idempotency_key, created_at, updated_at,
                      legacy_unknown_timestamp
            "#,
        )
        .bind(restaurant_id)
        .bind(order.id)
        .bind(req.payment_id)
        .bind(req.refund_amount_paise)
        .bind(&req.reason)
        .bind(req.refund_method)
        .bind(valid_staff_id)
        .bind(req.idempotency_key)
        .fetch_one(&mut *tx)
        .await?;

        // Emit outbox event for sync
        let outbox_payload = serde_json::json!({
            "refund_id": refund.id,
            "restaurant_id": restaurant_id,
            "order_id": order.id,
            "payment_id": refund.payment_id,
            "refund_amount_paise": refund.refund_amount_paise,
            "reason": refund.reason,
            "status": refund.status,
            "requested_at": refund.requested_at,
        });
        let idem = refund
            .idempotency_key
            .clone()
            .unwrap_or_else(|| format!("refund-req-{}", refund.id));
        OutboxService::emit_event(
            &mut tx,
            "refund",
            refund.id,
            "REFUND_REQUESTED",
            outbox_payload,
            &idem,
        )
        .await?;

        tx.commit().await?;

        Ok(refund)
    }

    pub async fn update_refund_status(
        pool: &PgPool,
        restaurant_id: Uuid,
        refund_id: Uuid,
        new_status: &str,
    ) -> Result<Refund, AppError> {
        let mut tx = pool.begin().await?;

        let refund = sqlx::query_as::<_, Refund>(
            r#"
            SELECT id, restaurant_id, order_id, payment_id, refund_amount_paise, reason,
                   status, requested_at, completed_at, cancelled_at, refund_method,
                   processed_by_staff_id, idempotency_key, created_at, updated_at,
                   legacy_unknown_timestamp
            FROM refunds
            WHERE restaurant_id = $1 AND id = $2 FOR UPDATE
            "#,
        )
        .bind(restaurant_id)
        .bind(refund_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound("Refund record not found".to_string()))?;

        if refund.status != "requested" {
            return Err(AppError::Conflict(format!(
                "Refund is already in '{}' terminal state",
                refund.status
            )));
        }

        let now = Utc::now();
        let (completed_at, cancelled_at) = match new_status {
            "completed" => (Some(now), None),
            "cancelled" => (None, Some(now)),
            _ => {
                return Err(AppError::BadRequest(
                    "Status must be completed or cancelled".to_string(),
                ))
            }
        };

        let updated_refund = sqlx::query_as::<_, Refund>(
            r#"
            UPDATE refunds
            SET status = $3,
                completed_at = $4,
                cancelled_at = $5,
                updated_at = NOW()
            WHERE restaurant_id = $1 AND id = $2
            RETURNING id, restaurant_id, order_id, payment_id, refund_amount_paise, reason,
                      status, requested_at, completed_at, cancelled_at, refund_method,
                      processed_by_staff_id, idempotency_key, created_at, updated_at,
                      legacy_unknown_timestamp
            "#,
        )
        .bind(restaurant_id)
        .bind(refund.id)
        .bind(new_status)
        .bind(completed_at)
        .bind(cancelled_at)
        .fetch_one(&mut *tx)
        .await?;

        // If completed, check if order should be marked refunded
        if new_status == "completed" {
            let total_refunded_row: (Option<i64>,) = sqlx::query_as(
                "SELECT SUM(refund_amount_paise) FROM refunds WHERE order_id = $1 AND status = 'completed'"
            )
            .bind(refund.order_id)
            .fetch_one(&mut *tx)
            .await?;

            let total_completed = total_refunded_row.0.unwrap_or(0);

            let (order_total_paise, order_id): (i64, Uuid) =
                sqlx::query_as("SELECT total_amount_paise, id FROM orders WHERE id = $1")
                    .bind(refund.order_id)
                    .fetch_one(&mut *tx)
                    .await?;

            if total_completed >= order_total_paise {
                sqlx::query(
                    "UPDATE orders SET payment_status = 'refunded', updated_at = NOW() WHERE id = $1",
                )
                .bind(order_id)
                .execute(&mut *tx)
                .await?;
            }
        }

        // Emit outbox event for sync
        let outbox_payload = serde_json::json!({
            "refund_id": updated_refund.id,
            "restaurant_id": restaurant_id,
            "status": new_status,
            "completed_at": updated_refund.completed_at,
            "cancelled_at": updated_refund.cancelled_at,
        });
        let idem = format!(
            "refund-status-{}-{}",
            updated_refund.id,
            Utc::now().timestamp_millis()
        );
        OutboxService::emit_event(
            &mut tx,
            "refund",
            updated_refund.id,
            "REFUND_STATUS_UPDATED",
            outbox_payload,
            &idem,
        )
        .await?;

        tx.commit().await?;

        Ok(updated_refund)
    }

    pub async fn generate_receipt(
        pool: &PgPool,
        restaurant_id: Uuid,
        order_id: Uuid,
    ) -> Result<ReceiptData, AppError> {
        let restaurant = sqlx::query_as::<_, Restaurant>(
            r#"
            SELECT id, name, slug, phone, email, address, city, state, postal_code,
                   gstin, fssai_license, currency, timezone, is_active, created_at, updated_at
            FROM restaurants
            WHERE id = $1
            "#,
        )
        .bind(restaurant_id)
        .fetch_one(pool)
        .await?;

        let order = sqlx::query_as::<_, Order>(
            r#"
            SELECT id, restaurant_id, COALESCE(order_number, 'ORD-' || UPPER(SUBSTRING(id::text, 1, 8))) AS order_number, order_type, pickup_reference, status, payment_status, payment_method,
                   table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, applied_coupon_code, tax_paise,
                   cgst_rate::float8 AS cgst_rate, sgst_rate::float8 AS sgst_rate,
                   service_charge_paise, round_off_paise, total_amount_paise, notes,
                   server_staff_id,
                   CASE 
                       WHEN seating_session_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                       THEN seating_session_id::uuid 
                       ELSE NULL 
                   END AS seating_session_id,
                   created_at, updated_at, settled_at, cancelled_at,
                   legacy_unknown_timestamp
            FROM orders
            WHERE restaurant_id = $1 AND id = $2
            "#,
        )
        .bind(restaurant_id)
        .bind(order_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Order not found".to_string()))?;

        let all_order_ids: Vec<Uuid> = if let Some(_tbl_id) = order.table_id {
            if let Some(sid) = order.seating_session_id {
                sqlx::query_scalar(
                    "SELECT id FROM orders WHERE restaurant_id = $1 AND seating_session_id::text = $2::text",
                )
                .bind(restaurant_id)
                .bind(sid.to_string())
                .fetch_all(pool)
                .await
                .unwrap_or_else(|_| vec![order.id])
            } else {
                vec![order.id]
            }
        } else {
            vec![order.id]
        };

        let items = sqlx::query_as::<_, OrderItem>(
            r#"
            SELECT id, order_id, menu_item_id, item_name, quantity, unit_price_paise,
                   subtotal_paise, tax_paise, discount_paise, total_paise, notes, status, created_at
            FROM order_items
            WHERE order_id = ANY($1)
            ORDER BY created_at ASC
            "#,
        )
        .bind(&all_order_ids)
        .fetch_all(pool)
        .await?;

        let receipt_items = items
            .into_iter()
            .map(|i| ReceiptItemData {
                name: i.item_name,
                quantity: i.quantity,
                unit_price_paise: i.unit_price_paise,
                total_paise: i.total_paise,
            })
            .collect();

        let table_number = if let Some(table_id) = order.table_id {
            let row: Option<(String,)> =
                sqlx::query_as("SELECT table_number FROM tables WHERE id = $1")
                    .bind(table_id)
                    .fetch_optional(pool)
                    .await?;
            row.map(|r| r.0)
        } else {
            None
        };

        Ok(ReceiptData {
            restaurant_name: restaurant.name,
            gstin: restaurant.gstin,
            fssai_license: restaurant.fssai_license,
            address: restaurant.address,
            order_number: order.order_number,
            order_type: order.order_type,
            table_number,
            customer_name: order.customer_name,
            customer_phone: order.customer_phone_e164,
            date: order.created_at,
            items: receipt_items,
            subtotal_paise: order.subtotal_paise,
            discount_paise: order.discount_paise,
            tax_paise: order.tax_paise,
            round_off_paise: order.round_off_paise,
            final_amount_paise: order.total_amount_paise,
            payment_status: order.payment_status,
            payment_method: order.payment_method,
        })
    }

    pub async fn get_split_bills(
        pool: &PgPool,
        restaurant_id: Uuid,
        order_id: Option<Uuid>,
    ) -> Result<Vec<SplitBill>, AppError> {
        let splits = if let Some(oid) = order_id {
            sqlx::query_as::<_, SplitBill>(
                r#"
                SELECT sb.id, sb.order_id,
                       COALESCE(sb.split_number, sb.split_index, 1) AS split_number,
                       COALESCE(sb.split_total_count, 1) AS split_total_count,
                       sb.split_type,
                       COALESCE(sb.amount_paise, sb.total_amount_paise, 0) AS amount_paise,
                       sb.payment_status, sb.settled_at, sb.payment_id,
                       COALESCE(sb.payment_method, '') AS payment_method,
                       sb.created_at, COALESCE(sb.updated_at, sb.created_at) AS updated_at,
                       COALESCE(o.order_number, 'ORD-' || UPPER(SUBSTRING(o.id::text, 1, 8))) AS order_number,
                       o.order_type, o.customer_name, o.pickup_reference,
                       CASE WHEN o.total_amount_paise > 0 THEN
                         ROUND(COALESCE(sb.amount_paise, sb.total_amount_paise, 0)::numeric
                               * o.subtotal_paise / NULLIF(o.total_amount_paise, 0))::bigint
                       ELSE 0 END AS subtotal_paise,
                       CASE WHEN o.total_amount_paise > 0 THEN
                         ROUND(COALESCE(sb.amount_paise, sb.total_amount_paise, 0)::numeric
                               * o.discount_paise / NULLIF(o.total_amount_paise, 0))::bigint
                       ELSE 0 END AS discount_paise,
                       CASE WHEN o.total_amount_paise > 0 THEN
                         ROUND(COALESCE(sb.amount_paise, sb.total_amount_paise, 0)::numeric
                               * o.tax_paise / NULLIF(o.total_amount_paise, 0))::bigint
                       ELSE 0 END AS tax_paise
                FROM split_bills sb
                JOIN orders o ON o.id = sb.order_id
                WHERE o.restaurant_id = $1 AND sb.order_id = $2
                ORDER BY COALESCE(sb.split_number, sb.split_index, 1) ASC
                "#,
            )
            .bind(restaurant_id)
            .bind(oid)
            .fetch_all(pool)
            .await?
        } else {
            sqlx::query_as::<_, SplitBill>(
                r#"
                SELECT sb.id, sb.order_id,
                       COALESCE(sb.split_number, sb.split_index, 1) AS split_number,
                       COALESCE(sb.split_total_count, 1) AS split_total_count,
                       sb.split_type,
                       COALESCE(sb.amount_paise, sb.total_amount_paise, 0) AS amount_paise,
                       sb.payment_status, sb.settled_at, sb.payment_id,
                       COALESCE(sb.payment_method, '') AS payment_method,
                       sb.created_at, COALESCE(sb.updated_at, sb.created_at) AS updated_at,
                       COALESCE(o.order_number, 'ORD-' || UPPER(SUBSTRING(o.id::text, 1, 8))) AS order_number,
                       o.order_type, o.customer_name, o.pickup_reference,
                       CASE WHEN o.total_amount_paise > 0 THEN
                         ROUND(COALESCE(sb.amount_paise, sb.total_amount_paise, 0)::numeric
                               * o.subtotal_paise / NULLIF(o.total_amount_paise, 0))::bigint
                       ELSE 0 END AS subtotal_paise,
                       CASE WHEN o.total_amount_paise > 0 THEN
                         ROUND(COALESCE(sb.amount_paise, sb.total_amount_paise, 0)::numeric
                               * o.discount_paise / NULLIF(o.total_amount_paise, 0))::bigint
                       ELSE 0 END AS discount_paise,
                       CASE WHEN o.total_amount_paise > 0 THEN
                         ROUND(COALESCE(sb.amount_paise, sb.total_amount_paise, 0)::numeric
                               * o.tax_paise / NULLIF(o.total_amount_paise, 0))::bigint
                       ELSE 0 END AS tax_paise
                FROM split_bills sb
                JOIN orders o ON o.id = sb.order_id
                WHERE o.restaurant_id = $1
                ORDER BY sb.created_at DESC
                LIMIT 500
                "#,
            )
            .bind(restaurant_id)
            .fetch_all(pool)
            .await?
        };

        Ok(splits)
    }
}
