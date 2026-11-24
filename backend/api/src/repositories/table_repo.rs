use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::table::{CreateTableRequest, RestaurantTable},
    services::outbox_service::OutboxService,
};

pub struct TableRepository;

impl TableRepository {
    pub async fn list_by_restaurant(
        pool: &PgPool,
        restaurant_id: Uuid,
    ) -> Result<Vec<RestaurantTable>, AppError> {
        // Automatically release any OCCUPIED table that has no active orders
        let _ = sqlx::query(
            r#"
            UPDATE tables t
            SET status = 'AVAILABLE'::table_status, active_order_id = NULL, current_seating_session_id = NULL, updated_at = NOW()
            WHERE t.restaurant_id = $1
              AND t.status = 'OCCUPIED'::table_status
              AND NOT EXISTS (
                  SELECT 1 FROM orders o
                  WHERE o.table_id = t.id
                    AND o.restaurant_id = t.restaurant_id
                    AND LOWER(o.status) NOT IN ('completed', 'cancelled')
              )
            "#,
        )
        .bind(restaurant_id)
        .execute(pool)
        .await;

        let tables = sqlx::query_as::<_, RestaurantTable>(
            r#"
            SELECT id, restaurant_id,
                   COALESCE(table_number, number) AS table_number,
                   capacity, section,
                   status::text AS status,
                   COALESCE(qr_code_identifier, qr_token) AS qr_code_identifier,
                   active_order_id, assigned_staff_id,
                   ordering_enabled,
                   CASE 
                       WHEN current_seating_session_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                       THEN current_seating_session_id::uuid 
                       ELSE NULL 
                   END AS current_seating_session_id,
                   created_at, updated_at
            FROM tables
            WHERE restaurant_id = $1
            ORDER BY number ASC
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
            SELECT id, restaurant_id,
                   COALESCE(table_number, number) AS table_number,
                   capacity, section,
                   status::text AS status,
                   COALESCE(qr_code_identifier, qr_token) AS qr_code_identifier,
                   active_order_id, assigned_staff_id,
                   ordering_enabled,
                   CASE 
                       WHEN current_seating_session_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                       THEN current_seating_session_id::uuid 
                       ELSE NULL 
                   END AS current_seating_session_id,
                   created_at, updated_at
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
        status: Option<&str>,
        active_order_id: Option<Uuid>,
        assigned_staff_id: Option<Option<Uuid>>,
        ordering_enabled: Option<bool>,
    ) -> Result<RestaurantTable, AppError> {
        let existing = Self::get_by_id(pool, restaurant_id, table_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Table not found".to_string()))?;

        let new_status = status.unwrap_or(&existing.status);
        let normalized_status = match new_status.to_uppercase().as_str() {
            "OCCUPIED" | "SEATED" | "ACTIVE" => "OCCUPIED".to_string(),
            "DIRTY" | "CLEANING" | "BILLED" => "DIRTY".to_string(),
            "RESERVED" => "RESERVED".to_string(),
            _ => "AVAILABLE".to_string(),
        };
        let new_active_order = if normalized_status == "OCCUPIED" {
            active_order_id.or(existing.active_order_id)
        } else {
            None
        };
        let new_assigned_staff = match assigned_staff_id {
            Some(val) => val,
            None => existing.assigned_staff_id,
        };

        // PentAGI Session Pinning: Ephemeral session generated when table is seated, wiped when freed
        let new_session_id: Option<Uuid> = if normalized_status == "OCCUPIED" {
            if existing.status.to_uppercase() != "OCCUPIED"
                || existing.current_seating_session_id.is_none()
            {
                Some(Uuid::new_v4())
            } else {
                existing.current_seating_session_id
            }
        } else {
            None
        };

        let table = sqlx::query_as::<_, RestaurantTable>(
            r#"
            UPDATE tables
            SET status = $3::text::table_status,
                active_order_id = $4,
                assigned_staff_id = $5,
                ordering_enabled = COALESCE($6, ordering_enabled),
                current_seating_session_id = $7,
                updated_at = NOW()
            WHERE restaurant_id = $1 AND id = $2
            RETURNING id, restaurant_id,
                      COALESCE(table_number, number) AS table_number,
                      capacity, section,
                      status::text AS status,
                      COALESCE(qr_code_identifier, qr_token) AS qr_code_identifier,
                      active_order_id, assigned_staff_id,
                      ordering_enabled,
                      CASE 
                          WHEN current_seating_session_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                          THEN current_seating_session_id::uuid 
                          ELSE NULL 
                      END AS current_seating_session_id,
                      created_at, updated_at
            "#,
        )
        .bind(restaurant_id)
        .bind(table_id)
        .bind(&normalized_status)
        .bind(new_active_order)
        .bind(new_assigned_staff)
        .bind(ordering_enabled)
        .bind(new_session_id)
        .fetch_one(pool)
        .await?;

        // Live Push: Broadcast table state transition instantly to POS and Customer Menus
        crate::ws::broadcast_table_status(
            table.id,
            &table.table_number,
            &table.status,
            table.ordering_enabled,
            table.current_seating_session_id,
        );

        Ok(table)
    }

    pub async fn create_table(
        pool: &PgPool,
        restaurant_id: Uuid,
        req: CreateTableRequest,
    ) -> Result<RestaurantTable, AppError> {
        let qr_token = req
            .qr_code_identifier
            .clone()
            .unwrap_or_else(|| format!("QR-{}", Uuid::new_v4().to_string()[..8].to_uppercase()));
        let capacity = req.capacity.unwrap_or(4);
        let section = req.section.unwrap_or_else(|| "Main Dining".to_string());
        let table = sqlx::query_as::<_, RestaurantTable>(
            r#"
            INSERT INTO tables (
                restaurant_id, number, capacity, section,
                qr_token, qr_code_identifier, status, ordering_enabled
            )
            VALUES ($1, $2, $3, $4, $5, $5, 'AVAILABLE', true)
            RETURNING id, restaurant_id,
                      COALESCE(table_number, number) AS table_number,
                      capacity, section,
                      status::text AS status,
                      COALESCE(qr_code_identifier, qr_token) AS qr_code_identifier,
                      active_order_id, assigned_staff_id,
                      ordering_enabled,
                      CASE 
                          WHEN current_seating_session_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                          THEN current_seating_session_id::uuid 
                          ELSE NULL 
                      END AS current_seating_session_id,
                      created_at, updated_at
            "#,
        )
        .bind(restaurant_id)
        .bind(&req.table_number)
        .bind(capacity)
        .bind(&section)
        .bind(&qr_token)
        .fetch_one(pool)
        .await?;

        Ok(table)
    }

    pub async fn delete_table(
        pool: &PgPool,
        restaurant_id: Uuid,
        table_id: Uuid,
    ) -> Result<(), AppError> {
        sqlx::query("DELETE FROM tables WHERE restaurant_id = $1 AND id = $2")
            .bind(restaurant_id)
            .bind(table_id)
            .execute(pool)
            .await?;

        Ok(())
    }

    pub async fn assign_staff(
        pool: &PgPool,
        restaurant_id: Uuid,
        table_id: Uuid,
        assigned_staff_id: Option<Uuid>,
    ) -> Result<RestaurantTable, AppError> {
        let valid_staff_id = match assigned_staff_id {
            Some(id) => sqlx::query_scalar::<_, Uuid>(
                "SELECT id FROM staff_members WHERE id = $1 OR auth_user_id = $1 LIMIT 1",
            )
            .bind(id)
            .fetch_optional(pool)
            .await
            .unwrap_or(None),
            None => None,
        };

        let table = sqlx::query_as::<_, RestaurantTable>(
            r#"
            UPDATE tables
            SET assigned_staff_id = $3,
                updated_at = NOW()
            WHERE restaurant_id = $1 AND id = $2
            RETURNING id, restaurant_id,
                      COALESCE(table_number, number) AS table_number,
                      capacity, section,
                      status::text AS status,
                      COALESCE(qr_code_identifier, qr_token) AS qr_code_identifier,
                      active_order_id, assigned_staff_id,
                      ordering_enabled,
                      CASE 
                          WHEN current_seating_session_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                          THEN current_seating_session_id::uuid 
                          ELSE NULL 
                      END AS current_seating_session_id,
                      created_at, updated_at
            "#,
        )
        .bind(restaurant_id)
        .bind(table_id)
        .bind(valid_staff_id)
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
            SELECT id, restaurant_id,
                   COALESCE(table_number, number) AS table_number,
                   capacity, section,
                   status::text AS status,
                   COALESCE(qr_code_identifier, qr_token) AS qr_code_identifier,
                   active_order_id, assigned_staff_id,
                   ordering_enabled,
                   CASE 
                       WHEN current_seating_session_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                       THEN current_seating_session_id::uuid 
                       ELSE NULL 
                   END AS current_seating_session_id,
                   created_at, updated_at
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
            SELECT id, restaurant_id,
                   COALESCE(table_number, number) AS table_number,
                   capacity, section,
                   status::text AS status,
                   COALESCE(qr_code_identifier, qr_token) AS qr_code_identifier,
                   active_order_id, assigned_staff_id,
                   ordering_enabled,
                   CASE 
                       WHEN current_seating_session_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                       THEN current_seating_session_id::uuid 
                       ELSE NULL 
                   END AS current_seating_session_id,
                   created_at, updated_at
            FROM tables
            WHERE restaurant_id = $1 AND id = $2 FOR UPDATE
            "#,
        )
        .bind(restaurant_id)
        .bind(to_table_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound("Destination table not found".to_string()))?;

        if to_table.status.to_lowercase() != "available" {
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
            SET status = 'AVAILABLE', active_order_id = NULL, updated_at = NOW()
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
            SET status = 'OCCUPIED', active_order_id = $1, updated_at = NOW()
            WHERE id = $2 AND restaurant_id = $3
            "#,
        )
        .bind(active_order_id)
        .bind(to_table_id)
        .bind(restaurant_id)
        .execute(&mut *tx)
        .await?;

        // 6. Record transfer in table_transfers
        let staff_name = if let Some(staff_id) = performed_by {
            sqlx::query_scalar::<_, String>(
                "SELECT name FROM staff_members WHERE id = $1 OR auth_user_id = $1 LIMIT 1",
            )
            .bind(staff_id)
            .fetch_optional(&mut *tx)
            .await
            .unwrap_or(None)
            .unwrap_or_else(|| "Admin / POS".to_string())
        } else {
            "Admin / POS".to_string()
        };

        sqlx::query(
            r#"
            INSERT INTO table_transfers (restaurant_id, order_id, source_table_id, destination_table_id, staff_name)
            VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(restaurant_id)
        .bind(active_order_id)
        .bind(from_table_id)
        .bind(to_table_id)
        .bind(staff_name)
        .execute(&mut *tx)
        .await?;

        // 7. Emit outbox event for sync
        let outbox_payload = serde_json::json!({
            "order_id": active_order_id,
            "restaurant_id": restaurant_id,
            "from_table_id": from_table_id,
            "to_table_id": to_table_id,
            "reason": reason,
            "performed_by": performed_by,
        });
        let idem = format!(
            "table-transfer-{}-{}-{}",
            active_order_id,
            to_table_id,
            chrono::Utc::now().timestamp_millis()
        );
        OutboxService::emit_event(
            &mut tx,
            "table",
            from_table_id,
            "TABLE_TRANSFERRED",
            outbox_payload,
            &idem,
        )
        .await?;

        tx.commit().await?;

        Ok(())
    }
}
