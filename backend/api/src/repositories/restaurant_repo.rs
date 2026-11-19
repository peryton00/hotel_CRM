use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::restaurant::{Restaurant, StaffMember, UpdateRestaurantPayload},
};

pub struct RestaurantRepository;

impl RestaurantRepository {
    pub async fn get_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Restaurant>, AppError> {
        let restaurant = sqlx::query_as::<_, Restaurant>(
            r#"
            SELECT id, name, slug, tagline, description, phone, email, address, city, state, postal_code,
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

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        payload: &UpdateRestaurantPayload,
    ) -> Result<Option<Restaurant>, AppError> {
        let restaurant = sqlx::query_as::<_, Restaurant>(
            r#"
            UPDATE restaurants
            SET name = COALESCE($1, name),
                tagline = COALESCE($2, tagline),
                description = COALESCE($3, description),
                phone = COALESCE($4, phone),
                email = COALESCE($5, email),
                address = COALESCE($6, address),
                city = COALESCE($7, city),
                state = COALESCE($8, state),
                postal_code = COALESCE($9, postal_code),
                gstin = COALESCE($10, gstin),
                fssai_license = COALESCE($11, fssai_license),
                updated_at = NOW()
            WHERE id = $12
            RETURNING id, name, slug, tagline, description, phone, email, address, city, state, postal_code,
                      gstin, fssai_license, currency, timezone, is_active, created_at, updated_at
            "#,
        )
        .bind(&payload.name)
        .bind(&payload.tagline)
        .bind(&payload.description)
        .bind(&payload.phone)
        .bind(&payload.email)
        .bind(&payload.address)
        .bind(&payload.city)
        .bind(&payload.state)
        .bind(&payload.postal_code)
        .bind(&payload.gstin)
        .bind(&payload.fssai_license)
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
            SELECT id, restaurant_id, auth_user_id, name, role, email, phone, is_active,
                   shift, assigned_section, login_id, monthly_salary_paise, payroll_cycle_start_day,
                   permissions, created_at, updated_at
            FROM staff_members
            WHERE restaurant_id = $1
            ORDER BY name ASC
            "#,
        )
        .bind(restaurant_id)
        .fetch_all(pool)
        .await?;

        Ok(staff)
    }

    pub async fn get_staff_by_id(
        pool: &PgPool,
        id: Uuid,
        restaurant_id: Uuid,
    ) -> Result<Option<StaffMember>, AppError> {
        let staff = sqlx::query_as::<_, StaffMember>(
            r#"
            SELECT id, restaurant_id, auth_user_id, name, role, email, phone, is_active,
                   shift, assigned_section, login_id, monthly_salary_paise, payroll_cycle_start_day,
                   permissions, created_at, updated_at
            FROM staff_members
            WHERE id = $1 AND restaurant_id = $2
            "#,
        )
        .bind(id)
        .bind(restaurant_id)
        .fetch_optional(pool)
        .await?;

        Ok(staff)
    }
}
