use sqlx::PgPool;
use uuid::Uuid;

use crate::{error::AppError, models::table::RestaurantTable};

pub struct TableRepository;

impl TableRepository {
    pub async fn list_by_restaurant(
        pool: &PgPool,
        restaurant_id: Uuid,
    ) -> Result<Vec<RestaurantTable>, AppError> {
        let tables = sqlx::query_as::<_, RestaurantTable>(
            r#"
            SELECT id, restaurant_id, table_number, capacity, section, status,
                   qr_code_identifier, active_order_id, created_at, updated_at
            FROM tables
            WHERE restaurant_id = $1
            ORDER BY table_number ASC
            "#,
        )
        .bind(restaurant_id)
        .fetch_all(pool)
        .await?;

        Ok(tables)
    }

    pub async fn get_by_id(
        pool: &PgPool,
        restaurant_id: Uuid,
        table_id: Uuid,
    ) -> Result<Option<RestaurantTable>, AppError> {
        let table = sqlx::query_as::<_, RestaurantTable>(
            r#"
            SELECT id, restaurant_id, table_number, capacity, section, status,
                   qr_code_identifier, active_order_id, created_at, updated_at
            FROM tables
            WHERE restaurant_id = $1 AND id = $2
            "#,
        )
        .bind(restaurant_id)
        .bind(table_id)
        .fetch_optional(pool)
        .await?;

        Ok(table)
    }

    pub async fn update_status(
        pool: &PgPool,
        restaurant_id: Uuid,
        table_id: Uuid,
        status: &str,
        active_order_id: Option<Uuid>,
    ) -> Result<RestaurantTable, AppError> {
        let table = sqlx::query_as::<_, RestaurantTable>(
            r#"
            UPDATE tables
            SET status = $3,
                active_order_id = $4,
                updated_at = NOW()
            WHERE restaurant_id = $1 AND id = $2
            RETURNING id, restaurant_id, table_number, capacity, section, status,
                      qr_code_identifier, active_order_id, created_at, updated_at
            "#,
        )
        .bind(restaurant_id)
        .bind(table_id)
        .bind(status)
        .bind(active_order_id)
        .fetch_one(pool)
        .await?;

        Ok(table)
    }

    pub async fn transfer_table(
        pool: &PgPool,
        restaurant_id: Uuid,
        from_table_id: Uuid,
        to_table_id: Uuid,
        reason: Option<String>,
        performed_by: Option<Uuid>,
    ) -> Result<(), AppError> {
        let mut tx = pool.begin().await?;

        // 1. Get from_table active order
        let from_table = sqlx::query_as::<_, RestaurantTable>(
            r#"
            SELECT id, restaurant_id, table_number, capacity, section, status,
                   qr_code_identifier, active_order_id, created_at, updated_at
            FROM tables
            WHERE restaurant_id = $1 AND id = $2 FOR UPDATE
            "#,
        )
        .bind(restaurant_id)
        .bind(from_table_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound("Source table not found".to_string()))?;

        let active_order_id = from_table.active_order_id.ok_or_else(|| {
            AppError::BadRequest("Source table has no active order to transfer".to_string())
        })?;

        // 2. Verify target table is available
        let to_table = sqlx::query_as::<_, RestaurantTable>(
            r#"
            SELECT id, restaurant_id, table_number, capacity, section, status,
                   qr_code_identifier, active_order_id, created_at, updated_at
            FROM tables
            WHERE restaurant_id = $1 AND id = $2 FOR UPDATE
            "#,
        )
        .bind(restaurant_id)
        .bind(to_table_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound("Destination table not found".to_string()))?;

        if to_table.status != "available" {
            return Err(AppError::Conflict(
                "Destination table is not available".to_string(),
            ));
        }

        // 3. Update active order's table_id
        sqlx::query(
            r#"
            UPDATE orders
            SET table_id = $1, updated_at = NOW()
            WHERE id = $2 AND restaurant_id = $3
            "#,
        )
        .bind(to_table_id)
        .bind(active_order_id)
        .bind(restaurant_id)
        .execute(&mut *tx)
        .await?;

        // 4. Update source table to available
        sqlx::query(
            r#"
            UPDATE tables
            SET status = 'available', active_order_id = NULL, updated_at = NOW()
            WHERE id = $1 AND restaurant_id = $2
            "#,
        )
        .bind(from_table_id)
        .bind(restaurant_id)
        .execute(&mut *tx)
        .await?;

        // 5. Update target table to occupied with order_id
        sqlx::query(
            r#"
            UPDATE tables
            SET status = 'occupied', active_order_id = $1, updated_at = NOW()
            WHERE id = $2 AND restaurant_id = $3
            "#,
        )
        .bind(active_order_id)
        .bind(to_table_id)
        .bind(restaurant_id)
        .execute(&mut *tx)
        .await?;

        // 6. Record transfer in table_transfers
        sqlx::query(
            r#"
            INSERT INTO table_transfers (restaurant_id, order_id, from_table_id, to_table_id, reason, performed_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(restaurant_id)
        .bind(active_order_id)
        .bind(from_table_id)
        .bind(to_table_id)
        .bind(reason)
        .bind(performed_by)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(())
    }
}
