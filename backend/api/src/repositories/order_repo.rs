use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{
        common::{PaginatedResponse, PaginationQuery},
        order::{CreateOrderRequest, Order, OrderItem, OrderWithItems},
    },
    services::order_service::OrderService,
};

pub struct OrderRepository;

impl OrderRepository {
    pub async fn create_order(
        pool: &PgPool,
        restaurant_id: Uuid,
        staff_id: Option<Uuid>,
        req: CreateOrderRequest,
    ) -> Result<OrderWithItems, AppError> {
        let mut tx = pool.begin().await?;

        // 1. Calculate items total in paise
        let mut subtotal_paise: i64 = 0;
        let mut _tax_paise: i64 = 0;

        for item in &req.items {
            let item_subtotal = item.unit_price_paise * item.quantity as i64;
            subtotal_paise += item_subtotal;
            // 5% standard tax per item
            let item_tax = (item_subtotal as f64 * 0.05).round() as i64;
            _tax_paise += item_tax;
        }

        let discount_paise = req.discount_paise.unwrap_or(0).min(subtotal_paise);
        let breakdown =
            OrderService::calculate_bill(subtotal_paise, discount_paise, 5.0, 0.0, true);

        // 2. Generate sequential order number
        let count_row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM orders WHERE restaurant_id = $1")
                .bind(restaurant_id)
                .fetch_one(&mut *tx)
                .await?;
        let order_number = format!("ORD-{:04}", count_row.0 + 1);

        // 3. Insert order
        let order = sqlx::query_as::<_, Order>(
            r#"
            INSERT INTO orders (
                restaurant_id, order_number, order_type, status, payment_status,
                table_id, customer_id, subtotal_paise, discount_paise, tax_paise,
                service_charge_paise, round_off_paise, total_amount_paise, notes,
                server_staff_id
            )
            VALUES ($1, $2, $3, 'confirmed', 'pending', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id, restaurant_id, order_number, order_type, status, payment_status,
                      table_id, customer_id, subtotal_paise, discount_paise, tax_paise,
                      service_charge_paise, round_off_paise, total_amount_paise, notes,
                      server_staff_id, created_at, updated_at, settled_at, cancelled_at,
                      legacy_unknown_timestamp
            "#,
        )
        .bind(restaurant_id)
        .bind(order_number)
        .bind(&req.order_type)
        .bind(req.table_id)
        .bind(req.customer_id)
        .bind(breakdown.subtotal_paise)
        .bind(breakdown.discount_paise)
        .bind(breakdown.tax_paise)
        .bind(breakdown.service_charge_paise)
        .bind(breakdown.round_off_paise)
        .bind(breakdown.final_amount_paise)
        .bind(&req.notes)
        .bind(staff_id)
        .fetch_one(&mut *tx)
        .await?;

        // 4. Insert items
        let mut inserted_items = Vec::new();
        for item in req.items {
            let item_sub = item.unit_price_paise * item.quantity as i64;
            let item_tx = (item_sub as f64 * 0.05).round() as i64;
            let item_tot = item_sub + item_tx;

            let order_item = sqlx::query_as::<_, OrderItem>(
                r#"
                INSERT INTO order_items (
                    order_id, menu_item_id, item_name, quantity, unit_price_paise,
                    subtotal_paise, tax_paise, discount_paise, total_paise, notes, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, 'confirmed')
                RETURNING id, order_id, menu_item_id, item_name, quantity, unit_price_paise,
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
                SET status = 'occupied', active_order_id = $1, updated_at = NOW()
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
        .bind(staff_id)
        .execute(&mut *tx)
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
        .await?;

        if let Some(order) = order {
            let items = sqlx::query_as::<_, OrderItem>(
                r#"
                SELECT id, order_id, menu_item_id, item_name, quantity, unit_price_paise,
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

    pub async fn list_orders(
        pool: &PgPool,
        restaurant_id: Uuid,
        status: Option<String>,
        pagination: PaginationQuery,
    ) -> Result<PaginatedResponse<Order>, AppError> {
        let limit = pagination.limit();
        let offset = pagination.offset();

        let (orders, total) = if let Some(st) = status {
            let items = sqlx::query_as::<_, Order>(
                r#"
                SELECT id, restaurant_id, order_number, order_type, status, payment_status,
                       table_id, customer_id, subtotal_paise, discount_paise, tax_paise,
                       service_charge_paise, round_off_paise, total_amount_paise, notes,
                       server_staff_id, created_at, updated_at, settled_at, cancelled_at,
                       legacy_unknown_timestamp
                FROM orders
                WHERE restaurant_id = $1 AND status = $2
                ORDER BY created_at DESC
                LIMIT $3 OFFSET $4
                "#,
            )
            .bind(restaurant_id)
            .bind(&st)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await?;

            let count_row: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM orders WHERE restaurant_id = $1 AND status = $2",
            )
            .bind(restaurant_id)
            .bind(&st)
            .fetch_one(pool)
            .await?;

            (items, count_row.0)
        } else {
            let items = sqlx::query_as::<_, Order>(
                r#"
                SELECT id, restaurant_id, order_number, order_type, status, payment_status,
                       table_id, customer_id, subtotal_paise, discount_paise, tax_paise,
                       service_charge_paise, round_off_paise, total_amount_paise, notes,
                       server_staff_id, created_at, updated_at, settled_at, cancelled_at,
                       legacy_unknown_timestamp
                FROM orders
                WHERE restaurant_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                "#,
            )
            .bind(restaurant_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await?;

            let count_row: (i64,) =
                sqlx::query_as("SELECT COUNT(*) FROM orders WHERE restaurant_id = $1")
                    .bind(restaurant_id)
                    .fetch_one(pool)
                    .await?;

            (items, count_row.0)
        };

        let page = pagination.page.unwrap_or(1);
        Ok(PaginatedResponse::new(orders, total, page, limit))
    }

    pub async fn update_status(
        pool: &PgPool,
        restaurant_id: Uuid,
        order_id: Uuid,
        new_status: &str,
        notes: Option<String>,
        staff_id: Option<Uuid>,
    ) -> Result<Order, AppError> {
        let mut tx = pool.begin().await?;

        let current_order = sqlx::query_as::<_, Order>(
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
            RETURNING id, restaurant_id, order_number, order_type, status, payment_status,
                      table_id, customer_id, subtotal_paise, discount_paise, tax_paise,
                      service_charge_paise, round_off_paise, total_amount_paise, notes,
                      server_staff_id, created_at, updated_at, settled_at, cancelled_at,
                      legacy_unknown_timestamp
            "#,
        )
        .bind(restaurant_id)
        .bind(order_id)
        .bind(new_status)
        .bind(cancelled_at)
        .fetch_one(&mut *tx)
        .await?;

        // If completed or cancelled and table was occupied, release table to available
        if (new_status == "completed" || new_status == "cancelled")
            && current_order.table_id.is_some()
        {
            sqlx::query(
                r#"
                UPDATE tables
                SET status = 'available', active_order_id = NULL, updated_at = NOW()
                WHERE id = $1 AND restaurant_id = $2
                "#,
            )
            .bind(current_order.table_id)
            .bind(restaurant_id)
            .execute(&mut *tx)
            .await?;
        }

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
        .bind(notes)
        .bind(staff_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(updated_order)
    }
}
