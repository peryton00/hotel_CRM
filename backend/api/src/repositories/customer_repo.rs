use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::customer::{CreateCustomerRequest, CreateReservationRequest, Customer, Reservation},
};

pub struct CustomerRepository;

impl CustomerRepository {
    pub async fn list_customers(
        pool: &PgPool,
        restaurant_id: Uuid,
        search: Option<String>,
    ) -> Result<Vec<Customer>, AppError> {
        let customers = if let Some(q) = search {
            let pattern = format!("%{}%", q.trim());
            sqlx::query_as::<_, Customer>(
                r#"
                SELECT id, restaurant_id, name, phone, email, address, notes,
                       visit_count, total_spend_paise, created_at, updated_at
                FROM customers
                WHERE restaurant_id = $1 AND (name ILIKE $2 OR phone ILIKE $2)
                ORDER BY name ASC
                LIMIT 50
                "#,
            )
            .bind(restaurant_id)
            .bind(pattern)
            .fetch_all(pool)
            .await?
        } else {
            sqlx::query_as::<_, Customer>(
                r#"
                SELECT id, restaurant_id, name, phone, email, address, notes,
                       visit_count, total_spend_paise, created_at, updated_at
                FROM customers
                WHERE restaurant_id = $1
                ORDER BY visit_count DESC, name ASC
                LIMIT 50
                "#,
            )
            .bind(restaurant_id)
            .fetch_all(pool)
            .await?
        };

        Ok(customers)
    }

    pub async fn create_customer(
        pool: &PgPool,
        restaurant_id: Uuid,
        req: CreateCustomerRequest,
    ) -> Result<Customer, AppError> {
        let customer = sqlx::query_as::<_, Customer>(
            r#"
            INSERT INTO customers (restaurant_id, name, phone, email, address, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (restaurant_id, phone) DO UPDATE
            SET name = EXCLUDED.name,
                email = COALESCE(EXCLUDED.email, customers.email),
                address = COALESCE(EXCLUDED.address, customers.address),
                notes = COALESCE(EXCLUDED.notes, customers.notes),
                updated_at = NOW()
            RETURNING id, restaurant_id, name, phone, email, address, notes,
                      visit_count, total_spend_paise, created_at, updated_at
            "#,
        )
        .bind(restaurant_id)
        .bind(&req.name)
        .bind(&req.phone)
        .bind(&req.email)
        .bind(&req.address)
        .bind(&req.notes)
        .fetch_one(pool)
        .await?;

        Ok(customer)
    }

    pub async fn list_reservations(
        pool: &PgPool,
        restaurant_id: Uuid,
        from_time: Option<DateTime<Utc>>,
    ) -> Result<Vec<Reservation>, AppError> {
        let reservations = if let Some(t) = from_time {
            sqlx::query_as::<_, Reservation>(
                r#"
                SELECT id, restaurant_id, table_id, customer_id, customer_name, customer_phone,
                       guest_count, reservation_time, status, special_requests, created_at, updated_at
                FROM reservations
                WHERE restaurant_id = $1 AND reservation_time >= $2
                ORDER BY reservation_time ASC
                "#,
            )
            .bind(restaurant_id)
            .bind(t)
            .fetch_all(pool)
            .await?
        } else {
            sqlx::query_as::<_, Reservation>(
                r#"
                SELECT id, restaurant_id, table_id, customer_id, customer_name, customer_phone,
                       guest_count, reservation_time, status, special_requests, created_at, updated_at
                FROM reservations
                WHERE restaurant_id = $1
                ORDER BY reservation_time ASC
                LIMIT 100
                "#,
            )
            .bind(restaurant_id)
            .fetch_all(pool)
            .await?
        };

        Ok(reservations)
    }

    pub async fn create_reservation(
        pool: &PgPool,
        restaurant_id: Uuid,
        req: CreateReservationRequest,
    ) -> Result<Reservation, AppError> {
        let reservation = sqlx::query_as::<_, Reservation>(
            r#"
            INSERT INTO reservations (
                restaurant_id, table_id, customer_id, customer_name, customer_phone,
                guest_count, reservation_time, status, special_requests
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', $8)
            RETURNING id, restaurant_id, table_id, customer_id, customer_name, customer_phone,
                      guest_count, reservation_time, status, special_requests, created_at, updated_at
            "#,
        )
        .bind(restaurant_id)
        .bind(req.table_id)
        .bind(req.customer_id)
        .bind(&req.customer_name)
        .bind(&req.customer_phone)
        .bind(req.guest_count)
        .bind(req.reservation_time)
        .bind(&req.special_requests)
        .fetch_one(pool)
        .await?;

        Ok(reservation)
    }

    pub async fn update_reservation_status(
        pool: &PgPool,
        restaurant_id: Uuid,
        reservation_id: Uuid,
        new_status: &str,
    ) -> Result<Reservation, AppError> {
        let res = sqlx::query_as::<_, Reservation>(
            r#"
            UPDATE reservations
            SET status = $3, updated_at = NOW()
            WHERE restaurant_id = $1 AND id = $2
            RETURNING id, restaurant_id, table_id, customer_id, customer_name, customer_phone,
                      guest_count, reservation_time, status, special_requests, created_at, updated_at
            "#,
        )
        .bind(restaurant_id)
        .bind(reservation_id)
        .bind(new_status)
        .fetch_one(pool)
        .await?;

        Ok(res)
    }
}
