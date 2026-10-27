use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::inventory::{
        CreateInventoryItemRequest, InventoryItem, RecordWastageRequest, StockMovement,
        WastageRecord,
    },
    services::inventory_service::InventoryService,
};

pub struct InventoryRepository;

impl InventoryRepository {
    pub async fn list_items(
        pool: &PgPool,
        restaurant_id: Uuid,
    ) -> Result<Vec<InventoryItem>, AppError> {
        let items = sqlx::query_as::<_, InventoryItem>(
            r#"
            SELECT id, restaurant_id, name, sku, category, unit_of_measure,
                   current_stock, reserved_stock, reorder_level, cost_per_unit_paise,
                   created_at, updated_at
            FROM inventory_items
            WHERE restaurant_id = $1
            ORDER BY name ASC
            "#,
        )
        .bind(restaurant_id)
        .fetch_all(pool)
        .await?;

        Ok(items)
    }

    pub async fn create_item(
        pool: &PgPool,
        restaurant_id: Uuid,
        req: CreateInventoryItemRequest,
    ) -> Result<InventoryItem, AppError> {
        let initial_stock = req.initial_stock.unwrap_or(0.0).max(0.0);
        let reorder_level = req.reorder_level.unwrap_or(5.0).max(0.0);

        let item = sqlx::query_as::<_, InventoryItem>(
            r#"
            INSERT INTO inventory_items (
                restaurant_id, name, sku, category, unit_of_measure,
                current_stock, reserved_stock, reorder_level, cost_per_unit_paise
            )
            VALUES ($1, $2, $3, $4, $5, $6, 0.0, $7, $8)
            RETURNING id, restaurant_id, name, sku, category, unit_of_measure,
                      current_stock, reserved_stock, reorder_level, cost_per_unit_paise,
                      created_at, updated_at
            "#,
        )
        .bind(restaurant_id)
        .bind(&req.name)
        .bind(&req.sku)
        .bind(&req.category)
        .bind(&req.unit_of_measure)
        .bind(initial_stock)
        .bind(reorder_level)
        .bind(req.cost_per_unit_paise)
        .fetch_one(pool)
        .await?;

        Ok(item)
    }

    pub async fn record_wastage(
        pool: &PgPool,
        restaurant_id: Uuid,
        req: RecordWastageRequest,
        staff_id: Option<Uuid>,
    ) -> Result<WastageRecord, AppError> {
        let mut tx = pool.begin().await?;

        // 1. Idempotency check
        if let Some(ref idem) = req.idempotency_key {
            let existing = sqlx::query_as::<_, WastageRecord>(
                r#"
                SELECT id, restaurant_id, inventory_item_id, quantity, unit_of_measure,
                       cost_impact_paise, reason, reported_by_staff_id, idempotency_key, created_at
                FROM wastage_records
                WHERE restaurant_id = $1 AND idempotency_key = $2
                "#,
            )
            .bind(restaurant_id)
            .bind(idem)
            .fetch_optional(&mut *tx)
            .await?;

            if let Some(record) = existing {
                tx.rollback().await?;
                return Ok(record);
            }
        }

        // 2. Fetch inventory item with lock
        let item = sqlx::query_as::<_, InventoryItem>(
            r#"
            SELECT id, restaurant_id, name, sku, category, unit_of_measure,
                   current_stock, reserved_stock, reorder_level, cost_per_unit_paise,
                   created_at, updated_at
            FROM inventory_items
            WHERE restaurant_id = $1 AND id = $2 FOR UPDATE
            "#,
        )
        .bind(restaurant_id)
        .bind(req.inventory_item_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound("Inventory item not found".to_string()))?;

        // Normalize units
        let converted_qty = InventoryService::convert_quantity(
            req.quantity,
            &req.unit_of_measure,
            &item.unit_of_measure,
        )?;

        if item.current_stock < converted_qty {
            return Err(AppError::BadRequest(format!(
                "Insufficient stock (current: {} {}, requested wastage: {} {})",
                item.current_stock, item.unit_of_measure, converted_qty, item.unit_of_measure
            )));
        }

        let new_stock = item.current_stock - converted_qty;
        let cost_impact =
            InventoryService::calculate_wastage_cost(converted_qty, item.cost_per_unit_paise);

        // 3. Update inventory item current_stock
        sqlx::query(
            r#"
            UPDATE inventory_items
            SET current_stock = $1, updated_at = NOW()
            WHERE id = $2 AND restaurant_id = $3
            "#,
        )
        .bind(new_stock)
        .bind(item.id)
        .bind(restaurant_id)
        .execute(&mut *tx)
        .await?;

        // 4. Insert wastage record
        let wastage = sqlx::query_as::<_, WastageRecord>(
            r#"
            INSERT INTO wastage_records (
                restaurant_id, inventory_item_id, quantity, unit_of_measure,
                cost_impact_paise, reason, reported_by_staff_id, idempotency_key
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, restaurant_id, inventory_item_id, quantity, unit_of_measure,
                      cost_impact_paise, reason, reported_by_staff_id, idempotency_key, created_at
            "#,
        )
        .bind(restaurant_id)
        .bind(item.id)
        .bind(converted_qty)
        .bind(&item.unit_of_measure)
        .bind(cost_impact)
        .bind(&req.reason)
        .bind(staff_id)
        .bind(req.idempotency_key)
        .fetch_one(&mut *tx)
        .await?;

        // 5. Insert stock movement ledger entry
        sqlx::query(
            r#"
            INSERT INTO stock_movements (
                restaurant_id, inventory_item_id, movement_type, quantity_change,
                balance_after, unit_cost_paise, reference_wastage_id, notes
            )
            VALUES ($1, $2, 'wastage', $3, $4, $5, $6, $7)
            "#,
        )
        .bind(restaurant_id)
        .bind(item.id)
        .bind(-converted_qty)
        .bind(new_stock)
        .bind(item.cost_per_unit_paise)
        .bind(wastage.id)
        .bind(format!("Wastage reported: {}", req.reason))
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(wastage)
    }

    pub async fn list_movements(
        pool: &PgPool,
        restaurant_id: Uuid,
        item_id: Option<Uuid>,
    ) -> Result<Vec<StockMovement>, AppError> {
        let movements = if let Some(id) = item_id {
            sqlx::query_as::<_, StockMovement>(
                r#"
                SELECT id, restaurant_id, inventory_item_id, movement_type, quantity_change,
                       balance_after, unit_cost_paise, reference_order_id, reference_wastage_id,
                       idempotency_key, notes, created_at
                FROM stock_movements
                WHERE restaurant_id = $1 AND inventory_item_id = $2
                ORDER BY created_at DESC
                LIMIT 100
                "#,
            )
            .bind(restaurant_id)
            .bind(id)
            .fetch_all(pool)
            .await?
        } else {
            sqlx::query_as::<_, StockMovement>(
                r#"
                SELECT id, restaurant_id, inventory_item_id, movement_type, quantity_change,
                       balance_after, unit_cost_paise, reference_order_id, reference_wastage_id,
                       idempotency_key, notes, created_at
                FROM stock_movements
                WHERE restaurant_id = $1
                ORDER BY created_at DESC
                LIMIT 100
                "#,
            )
            .bind(restaurant_id)
            .fetch_all(pool)
            .await?
        };

        Ok(movements)
    }
}
