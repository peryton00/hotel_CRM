use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::menu::{
        CreateMenuCategoryRequest, CreateMenuItemRequest, MenuCategory, MenuItem,
        UpdateMenuItemRequest,
    },
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
                       base_price_paise, tax_rate_percent::float8 AS tax_rate_percent, is_veg, is_available,
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
                       base_price_paise, tax_rate_percent::float8 AS tax_rate_percent, is_veg, is_available,
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
                   base_price_paise, tax_rate_percent::float8 AS tax_rate_percent, is_veg, is_available,
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
                      base_price_paise, tax_rate_percent::float8 AS tax_rate_percent, is_veg, is_available,
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
        let dietary = if req.is_veg.unwrap_or(true) { "VEG" } else { "NON_VEG" };
        let item = sqlx::query_as::<_, MenuItem>(
            r#"
            INSERT INTO menu_items (
                restaurant_id, category_id, name, description, price_paise, base_price_paise,
                tax_rate_percent, dietary, is_veg, is_available, image_url,
                preparation_time_minutes, display_order
            )
            VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id, restaurant_id, category_id, name, description,
                      COALESCE(base_price_paise, price_paise) AS base_price_paise,
                      tax_rate_percent::float8 AS tax_rate_percent, is_veg, is_available,
                      image_url, preparation_time_minutes, display_order, created_at, updated_at
            "#,
        )
        .bind(restaurant_id)
        .bind(req.category_id)
        .bind(req.name)
        .bind(req.description)
        .bind(req.base_price_paise)
        .bind(req.tax_rate_percent.unwrap_or(5.0))
        .bind(dietary)
        .bind(req.is_veg.unwrap_or(true))
        .bind(req.is_available.unwrap_or(true))
        .bind(req.image_url)
        .bind(req.preparation_time_minutes.unwrap_or(15))
        .bind(req.display_order.unwrap_or(0))
        .fetch_one(pool)
        .await?;

        Ok(item)
    }

    pub async fn update_item(
        pool: &PgPool,
        restaurant_id: Uuid,
        item_id: Uuid,
        req: UpdateMenuItemRequest,
    ) -> Result<MenuItem, AppError> {
        let dietary = req.is_veg.map(|v| if v { "VEG" } else { "NON_VEG" });
        let item = sqlx::query_as::<_, MenuItem>(
            r#"
            UPDATE menu_items
            SET
                category_id = COALESCE($3, category_id),
                name = COALESCE($4, name),
                description = COALESCE($5, description),
                price_paise = COALESCE($6, price_paise),
                base_price_paise = COALESCE($6, base_price_paise),
                tax_rate_percent = COALESCE($7, tax_rate_percent),
                dietary = COALESCE($8, dietary),
                is_veg = COALESCE($9, is_veg),
                is_available = COALESCE($10, is_available),
                image_url = COALESCE($11, image_url),
                preparation_time_minutes = COALESCE($12, preparation_time_minutes),
                display_order = COALESCE($13, display_order),
                updated_at = NOW()
            WHERE restaurant_id = $1 AND id = $2
            RETURNING id, restaurant_id, category_id, name, description,
                      COALESCE(base_price_paise, price_paise) AS base_price_paise,
                      tax_rate_percent::float8 AS tax_rate_percent, is_veg, is_available,
                      image_url, preparation_time_minutes, display_order, created_at, updated_at
            "#,
        )
        .bind(restaurant_id)
        .bind(item_id)
        .bind(req.category_id)
        .bind(req.name)
        .bind(req.description)
        .bind(req.base_price_paise)
        .bind(req.tax_rate_percent)
        .bind(dietary)
        .bind(req.is_veg)
        .bind(req.is_available)
        .bind(req.image_url)
        .bind(req.preparation_time_minutes)
        .bind(req.display_order)
        .fetch_one(pool)
        .await?;

        Ok(item)
    }

    pub async fn delete_item(
        pool: &PgPool,
        restaurant_id: Uuid,
        item_id: Uuid,
    ) -> Result<(), AppError> {
        // Disassociate historical order items so existing orders & bills retain their snapshot without FK violation
        sqlx::query("UPDATE order_items SET menu_item_id = NULL WHERE menu_item_id = $1")
            .bind(item_id)
            .execute(pool)
            .await?;

        // Remove any recipe ingredient links if present
        let _ = sqlx::query("DELETE FROM recipe_ingredients WHERE menu_item_id = $1")
            .bind(item_id)
            .execute(pool)
            .await;

        sqlx::query(
            "DELETE FROM menu_items WHERE restaurant_id = $1 AND id = $2"
        )
        .bind(restaurant_id)
        .bind(item_id)
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn create_category(
        pool: &PgPool,
        restaurant_id: Uuid,
        req: CreateMenuCategoryRequest,
    ) -> Result<MenuCategory, AppError> {
        let slug = req.slug.unwrap_or_else(|| {
            req.name
                .to_lowercase()
                .chars()
                .map(|c| if c.is_alphanumeric() { c } else { '-' })
                .collect::<String>()
        });
        let category = sqlx::query_as::<_, MenuCategory>(
            r#"
            INSERT INTO menu_categories (
                restaurant_id, name, slug, display_order, is_active
            )
            VALUES ($1, $2, $3, $4, true)
            RETURNING id, restaurant_id, name, description, display_order, is_active, created_at, updated_at
            "#,
        )
        .bind(restaurant_id)
        .bind(req.name)
        .bind(slug)
        .bind(req.display_order.unwrap_or(0))
        .fetch_one(pool)
        .await?;

        Ok(category)
    }

    pub async fn delete_category(
        pool: &PgPool,
        restaurant_id: Uuid,
        category_id: Uuid,
    ) -> Result<(), AppError> {
        sqlx::query(
            "DELETE FROM menu_categories WHERE restaurant_id = $1 AND id = $2",
        )
        .bind(restaurant_id)
        .bind(category_id)
        .execute(pool)
        .await?;

        Ok(())
    }
}
