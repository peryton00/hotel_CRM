use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{
        billing::{
            CreateRefundRequest, Payment, ReceiptData, ReceiptItemData, Refund, SettleOrderRequest,
            SplitBill, SplitOrderRequest,
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
                   table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, tax_paise,
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

        if order.payment_status.to_lowercase() == "paid" {
            return Err(AppError::Conflict(
                "Order has already been fully settled".to_string(),
            ));
        }

        let now = Utc::now();

        // 3. Deduct discount directly from total bill (not from product prices/subtotal)
        let (final_discount_paise, final_tax_paise, final_total_paise, final_coupon_code) =
            if let Some(disc) = req.discount_paise {
                let gross_total_paise = order.subtotal_paise + order.tax_paise;
                let discount = disc.min(gross_total_paise).max(0);
                let final_total = (gross_total_paise - discount).max(0);
                (
                    discount,
                    order.tax_paise,
                    final_total,
                    req.applied_coupon_code.or(order.applied_coupon_code),
                )
            } else {
                (
                    order.discount_paise,
                    order.tax_paise,
                    order.total_amount_paise,
                    order.applied_coupon_code,
                )
            };

        let payment_amount = if req.discount_paise.is_some() {
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

        // 5. Update order payment status, payment method, discount, tax, totals and settlement timestamp
        sqlx::query(
            r#"
            UPDATE orders
            SET payment_status = 'paid',
                payment_method = $1,
                discount_paise = $2,
                applied_coupon_code = $3,
                tax_paise = $4,
                total_amount_paise = $5,
                updated_at = NOW()
            WHERE restaurant_id = $6 AND id = $7
            "#,
        )
        .bind(&req.payment_method)
        .bind(final_discount_paise)
        .bind(&final_coupon_code)
        .bind(final_tax_paise)
        .bind(final_total_paise)
        .bind(restaurant_id)
        .bind(order.id)
        .execute(&mut *tx)
        .await?;

        // 6. Generate and store invoice (wrapped in a savepoint so best-effort failure never aborts order settlement tx)
        let invoice_num = format!("INV-{}", order.order_number);
        let _ = sqlx::query("SAVEPOINT invoice_sp").execute(&mut *tx).await;
        let inv_res = sqlx::query(
            r#"
            INSERT INTO invoices (
                restaurant_id, order_id, invoice_number, subtotal_paise, discount_amount_paise,
                discount_paise, tax_amount_paise, tax_paise, total_amount_paise, total_paise, payment_status
            )
            VALUES ($1, $2, $3, $4, $5, $5, $6, $6, $7, $7, 'PAID')
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(restaurant_id)
        .bind(order.id)
        .bind(&invoice_num)
        .bind(order.subtotal_paise)
        .bind(final_discount_paise)
        .bind(final_tax_paise)
        .bind(final_total_paise)
        .execute(&mut *tx)
        .await;

        if inv_res.is_err() {
            let _ = sqlx::query("ROLLBACK TO SAVEPOINT invoice_sp").execute(&mut *tx).await;
        } else {
            let _ = sqlx::query("RELEASE SAVEPOINT invoice_sp").execute(&mut *tx).await;
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

        // Cannot split an already paid order
        if order.payment_status == "paid" {
            return Err(AppError::Conflict(
                "Cannot split an already settled order".to_string(),
            ));
        }

        // Delete any existing unpaid splits for this order
        sqlx::query("DELETE FROM split_bills WHERE order_id = $1 AND payment_status != 'paid'")
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
                    INSERT INTO split_bills (order_id, split_number, split_type, amount_paise, payment_status)
                    VALUES ($1, $2, 'equal', $3, 'pending')
                    RETURNING id, order_id, split_number, split_type, amount_paise, payment_status,
                              settled_at, payment_id, created_at, updated_at
                    "#,
                )
                .bind(order.id)
                .bind((idx + 1) as i32)
                .bind(split_paise.0)
                .fetch_one(&mut *tx)
                .await?;

                created_splits.push(split);
            }
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
                   table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, tax_paise,
                   service_charge_paise, round_off_paise, total_amount_paise, notes,
                   server_staff_id, created_at, updated_at, NULL::timestamptz AS settled_at, cancelled_at,
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

            let order = sqlx::query_as::<_, Order>("SELECT * FROM orders WHERE id = $1")
                .bind(refund.order_id)
                .fetch_one(&mut *tx)
                .await?;

            if total_completed >= order.total_amount_paise {
                sqlx::query("UPDATE orders SET payment_status = 'refunded', updated_at = NOW() WHERE id = $1")
                    .bind(order.id)
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
        let idem = format!("refund-status-{}-{}", updated_refund.id, Utc::now().timestamp_millis());
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
                   table_id, customer_id, customer_name, customer_phone_e164, subtotal_paise, discount_paise, tax_paise,
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
        .await?
        .ok_or_else(|| AppError::NotFound("Order not found".to_string()))?;

        let items = sqlx::query_as::<_, OrderItem>(
            r#"
            SELECT id, order_id, menu_item_id, item_name, quantity, unit_price_paise,
                   subtotal_paise, tax_paise, discount_paise, total_paise, notes, status, created_at
            FROM order_items
            WHERE order_id = $1
            "#,
        )
        .bind(order.id)
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
}
