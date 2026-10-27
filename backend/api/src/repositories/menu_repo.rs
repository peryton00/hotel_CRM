use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::menu::{CreateMenuItemRequest, MenuCategory, MenuItem},
};

pub struct MenuRepository;

impl MenuRepository {
    pub async fn list_categories(
        pool: &PgPool,
        restaurant_id: Uuid,
    ) -> Result<Vec<MenuCategory>, AppError> {
        let categories = sqlx::query_as::<_, MenuCategory>(
            r#"
            SELECT id, restaurant_id, name, description, display_order, is_active, created_at, updated_at
            FROM menu_categories
            WHERE restaurant_id = $1 AND is_active = true
            ORDER BY display_order ASC, name ASC
            "#,
        )
        .bind(restaurant_id)
        .fetch_all(pool)
        .await?;

        Ok(categories)
    }

    pub async fn list_items(
        pool: &PgPool,
        restaurant_id: Uuid,
        category_id: Option<Uuid>,
    ) -> Result<Vec<MenuItem>, AppError> {
        let items = if let Some(cat_id) = category_id {
            sqlx::query_as::<_, MenuItem>(
                r#"
                SELECT id, restaurant_id, category_id, name, description,
                       base_price_paise, tax_rate_percent, is_veg, is_available,
                       image_url, preparation_time_minutes, display_order, created_at, updated_at
                FROM menu_items
                WHERE restaurant_id = $1 AND category_id = $2
                ORDER BY display_order ASC, name ASC
                "#,
            )
            .bind(restaurant_id)
            .bind(cat_id)
            .fetch_all(pool)
            .await?
        } else {
            sqlx::query_as::<_, MenuItem>(
                r#"
                SELECT id, restaurant_id, category_id, name, description,
                       base_price_paise, tax_rate_percent, is_veg, is_available,
                       image_url, preparation_time_minutes, display_order, created_at, updated_at
                FROM menu_items
                WHERE restaurant_id = $1
                ORDER BY display_order ASC, name ASC
                "#,
            )
            .bind(restaurant_id)
            .fetch_all(pool)
            .await?
        };

        Ok(items)
    }

    pub async fn get_item(
        pool: &PgPool,
        restaurant_id: Uuid,
        item_id: Uuid,
    ) -> Result<Option<MenuItem>, AppError> {
        let item = sqlx::query_as::<_, MenuItem>(
            r#"
            SELECT id, restaurant_id, category_id, name, description,
                   base_price_paise, tax_rate_percent, is_veg, is_available,
                   image_url, preparation_time_minutes, display_order, created_at, updated_at
            FROM menu_items
            WHERE restaurant_id = $1 AND id = $2
            "#,
        )
        .bind(restaurant_id)
        .bind(item_id)
        .fetch_optional(pool)
        .await?;

        Ok(item)
    }

    pub async fn update_availability(
        pool: &PgPool,
        restaurant_id: Uuid,
        item_id: Uuid,
        is_available: bool,
    ) -> Result<MenuItem, AppError> {
        let item = sqlx::query_as::<_, MenuItem>(
            r#"
            UPDATE menu_items
            SET is_available = $3, updated_at = NOW()
            WHERE restaurant_id = $1 AND id = $2
            RETURNING id, restaurant_id, category_id, name, description,
                      base_price_paise, tax_rate_percent, is_veg, is_available,
                      image_url, preparation_time_minutes, display_order, created_at, updated_at
            "#,
        )
        .bind(restaurant_id)
        .bind(item_id)
        .bind(is_available)
        .fetch_one(pool)
        .await?;

        Ok(item)
    }

    pub async fn create_item(
        pool: &PgPool,
        restaurant_id: Uuid,
        req: CreateMenuItemRequest,
    ) -> Result<MenuItem, AppError> {
        let item = sqlx::query_as::<_, MenuItem>(
            r#"
            INSERT INTO menu_items (
                restaurant_id, category_id, name, description, base_price_paise,
                tax_rate_percent, is_veg, is_available, image_url,
                preparation_time_minutes, display_order
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id, restaurant_id, category_id, name, description,
                      base_price_paise, tax_rate_percent, is_veg, is_available,
                      image_url, preparation_time_minutes, display_order, created_at, updated_at
            "#,
        )
        .bind(restaurant_id)
        .bind(req.category_id)
        .bind(req.name)
        .bind(req.description)
        .bind(req.base_price_paise)
        .bind(req.tax_rate_percent.unwrap_or(5.0))
        .bind(req.is_veg.unwrap_or(true))
        .bind(req.is_available.unwrap_or(true))
        .bind(req.image_url)
        .bind(req.preparation_time_minutes.unwrap_or(15))
        .bind(req.display_order.unwrap_or(0))
        .fetch_one(pool)
        .await?;

        Ok(item)
    }
}
