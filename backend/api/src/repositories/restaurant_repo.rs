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
                   gstin, fssai_license, currency, timezone, is_active,
                   COALESCE(gst_rate, 5.0)::float8 AS gst_rate,
                   COALESCE(cgst_rate, gst_rate / 2.0, 2.5)::float8 AS cgst_rate,
                   COALESCE(sgst_rate, gst_rate / 2.0, 2.5)::float8 AS sgst_rate,
                   COALESCE(service_charge_rate, 0.0)::float8 AS service_charge_rate,
                   google_review_url,
                   COALESCE(whatsapp_templates, '{}'::jsonb) AS whatsapp_templates,
                   created_at, updated_at
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
        let derived_gst_rate = match (payload.cgst_rate, payload.sgst_rate, payload.gst_rate) {
            (Some(c), Some(s), _) => Some(c + s),
            (Some(c), None, _) => Some(c * 2.0),
            (None, Some(s), _) => Some(s * 2.0),
            (None, None, Some(g)) => Some(g),
            (None, None, None) => None,
        };

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
                gst_rate = COALESCE($12, gst_rate),
                cgst_rate = COALESCE($13, cgst_rate),
                sgst_rate = COALESCE($14, sgst_rate),
                service_charge_rate = COALESCE($15, service_charge_rate),
                google_review_url = COALESCE($16, google_review_url),
                whatsapp_templates = COALESCE($17, whatsapp_templates),
                updated_at = NOW()
            WHERE id = $18
            RETURNING id, name, slug, tagline, description, phone, email, address, city, state, postal_code,
                      gstin, fssai_license, currency, timezone, is_active,
                      COALESCE(gst_rate, 5.0)::float8 AS gst_rate,
                      COALESCE(cgst_rate, gst_rate / 2.0, 2.5)::float8 AS cgst_rate,
                      COALESCE(sgst_rate, gst_rate / 2.0, 2.5)::float8 AS sgst_rate,
                      COALESCE(service_charge_rate, 0.0)::float8 AS service_charge_rate,
                      google_review_url,
                      COALESCE(whatsapp_templates, '{}'::jsonb) AS whatsapp_templates,
                      created_at, updated_at
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
        .bind(derived_gst_rate)
        .bind(payload.cgst_rate)
        .bind(payload.sgst_rate)
        .bind(payload.service_charge_rate)
        .bind(&payload.google_review_url)
        .bind(&payload.whatsapp_templates)
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
