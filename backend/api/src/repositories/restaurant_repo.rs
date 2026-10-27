use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::restaurant::{Restaurant, StaffMember},
};

pub struct RestaurantRepository;

impl RestaurantRepository {
    pub async fn get_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Restaurant>, AppError> {
        let restaurant = sqlx::query_as::<_, Restaurant>(
            r#"
            SELECT id, name, slug, phone, email, address, city, state, postal_code,
                   gstin, fssai_license, currency, timezone, is_active, created_at, updated_at
            FROM restaurants
            WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        Ok(restaurant)
    }

    pub async fn list_staff(
        pool: &PgPool,
        restaurant_id: Uuid,
    ) -> Result<Vec<StaffMember>, AppError> {
        let staff = sqlx::query_as::<_, StaffMember>(
            r#"
            SELECT id, restaurant_id, auth_user_id, name, role, email, phone, is_active, created_at, updated_at
            FROM staff_members
            WHERE restaurant_id = $1 AND is_active = true
            ORDER BY name ASC
            "#,
        )
        .bind(restaurant_id)
        .fetch_all(pool)
        .await?;

        Ok(staff)
    }
}
