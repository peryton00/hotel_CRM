use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::feedback::{CreateFeedbackRequest, CustomerFeedback},
};

pub struct FeedbackRepository;

impl FeedbackRepository {
    pub async fn list_feedback(
        pool: &PgPool,
        restaurant_id: Uuid,
    ) -> Result<Vec<CustomerFeedback>, AppError> {
        let feedback = sqlx::query_as::<_, CustomerFeedback>(
            r#"
            SELECT f.id, f.restaurant_id, f.order_id,
                   COALESCE(f.customer_name, c.name, 'Valued Guest') as customer_name,
                   COALESCE(f.customer_phone, c.phone, '') as customer_phone,
                   f.rating, f.comments, f.resolution_note,
                   COALESCE(f.is_resolved, FALSE) as is_resolved,
                   f.created_at,
                   COALESCE(f.updated_at, f.created_at) as updated_at
            FROM customer_feedback f
            LEFT JOIN customers c ON f.customer_id = c.id
            WHERE f.restaurant_id = $1
            ORDER BY f.created_at DESC
            LIMIT 100
            "#,
        )
        .bind(restaurant_id)
        .fetch_all(pool)
        .await?;

        Ok(feedback)
    }

    pub async fn create_feedback(
        pool: &PgPool,
        restaurant_id: Uuid,
        req: CreateFeedbackRequest,
    ) -> Result<CustomerFeedback, AppError> {
        let feedback = sqlx::query_as::<_, CustomerFeedback>(
            r#"
            INSERT INTO customer_feedback (
                restaurant_id, order_id, customer_name, customer_phone, rating, comments
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, restaurant_id, order_id, customer_name, customer_phone,
                      rating, comments, resolution_note, is_resolved, created_at, updated_at
            "#,
        )
        .bind(restaurant_id)
        .bind(req.order_id)
        .bind(req.customer_name)
        .bind(req.customer_phone)
        .bind(req.rating)
        .bind(req.comments)
        .fetch_one(pool)
        .await?;

        Ok(feedback)
    }

    pub async fn reply_feedback(
        pool: &PgPool,
        restaurant_id: Uuid,
        feedback_id: Uuid,
        resolution_note: String,
    ) -> Result<CustomerFeedback, AppError> {
        let feedback = sqlx::query_as::<_, CustomerFeedback>(
            r#"
            UPDATE customer_feedback
            SET resolution_note = $3,
                is_resolved = true,
                updated_at = NOW()
            WHERE restaurant_id = $1 AND id = $2
            RETURNING id, restaurant_id, order_id, customer_name, customer_phone,
                      rating, comments, resolution_note, is_resolved, created_at, updated_at
            "#,
        )
        .bind(restaurant_id)
        .bind(feedback_id)
        .bind(resolution_note)
        .fetch_one(pool)
        .await?;

        Ok(feedback)
    }
}
