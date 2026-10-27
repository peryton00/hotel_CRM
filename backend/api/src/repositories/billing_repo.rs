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
                       status, upi_transaction_ref, idempotency_key, settled_at, notes,
                       created_at, updated_at, legacy_unknown_timestamp
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
            SELECT id, restaurant_id, order_number, order_type, status, payment_status,
                   table_id, customer_id, subtotal_paise, discount_paise, tax_paise,
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

        if order.payment_status == "paid" {
            return Err(AppError::Conflict(
                "Order has already been fully settled".to_string(),
            ));
        }

        let now = Utc::now();

        // 3. Record payment
        let payment = sqlx::query_as::<_, Payment>(
            r#"
            INSERT INTO payments (
                restaurant_id, order_id, amount_paise, payment_method, status,
                upi_transaction_ref, idempotency_key, settled_at, notes
            )
            VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7, $8)
            RETURNING id, restaurant_id, order_id, split_bill_id, amount_paise, payment_method,
                      status, upi_transaction_ref, idempotency_key, settled_at, notes,
                      created_at, updated_at, legacy_unknown_timestamp
            "#,
        )
        .bind(restaurant_id)
        .bind(order.id)
        .bind(req.amount_paise)
        .bind(&req.payment_method)
        .bind(req.upi_transaction_ref)
        .bind(req.idempotency_key)
        .bind(now)
        .bind(req.notes)
        .fetch_one(&mut *tx)
        .await?;

        // 4. Update order payment status and settlement timestamp
        sqlx::query(
            r#"
            UPDATE orders
            SET payment_status = 'paid',
                settled_at = $1,
                updated_at = NOW()
            WHERE restaurant_id = $2 AND id = $3
            "#,
        )
        .bind(now)
        .bind(restaurant_id)
        .bind(order.id)
        .execute(&mut *tx)
        .await?;

        // 5. Generate and store invoice
        let invoice_num = format!("INV-{}", order.order_number);
        sqlx::query(
            r#"
            INSERT INTO invoices (
                restaurant_id, order_id, invoice_number, subtotal_paise, discount_paise,
                tax_paise, service_charge_paise, round_off_paise, final_amount_paise,
                payment_method, invoice_date
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (order_id) DO NOTHING
            "#,
        )
        .bind(restaurant_id)
        .bind(order.id)
        .bind(invoice_num)
        .bind(order.subtotal_paise)
        .bind(order.discount_paise)
        .bind(order.tax_paise)
        .bind(order.service_charge_paise)
        .bind(order.round_off_paise)
        .bind(order.total_amount_paise)
        .bind(&req.payment_method)
        .bind(now)
        .execute(&mut *tx)
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
                   table_id, customer_id, subtotal_paise, discount_paise, tax_paise,
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
            SELECT id, restaurant_id, order_number, order_type, status, payment_status,
                   table_id, customer_id, subtotal_paise, discount_paise, tax_paise,
                   service_charge_paise, round_off_paise, total_amount_paise, notes,
                   server_staff_id, created_at, updated_at, settled_at, cancelled_at,
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
        .bind(staff_id)
        .bind(req.idempotency_key)
        .fetch_one(&mut *tx)
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
            SELECT id, restaurant_id, order_number, order_type, status, payment_status,
                   table_id, customer_id, subtotal_paise, discount_paise, tax_paise,
                   service_charge_paise, round_off_paise, total_amount_paise, notes,
                   server_staff_id, created_at, updated_at, settled_at, cancelled_at,
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
            date: order.created_at,
            items: receipt_items,
            subtotal_paise: order.subtotal_paise,
            discount_paise: order.discount_paise,
            tax_paise: order.tax_paise,
            round_off_paise: order.round_off_paise,
            final_amount_paise: order.total_amount_paise,
            payment_status: order.payment_status,
            payment_method: None,
        })
    }
}
