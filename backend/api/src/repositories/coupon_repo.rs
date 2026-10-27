use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{
        coupon::{
            Coupon, CouponRedemption, RedeemCouponRequest, ValidateCouponRequest,
            ValidateCouponResponse,
        },
        paise::Paise,
    },
};

pub struct CouponRepository;

impl CouponRepository {
    pub async fn list_coupons(pool: &PgPool, restaurant_id: Uuid) -> Result<Vec<Coupon>, AppError> {
        let coupons = sqlx::query_as::<_, Coupon>(
            r#"
            SELECT id, restaurant_id, code, description, discount_type, discount_value,
                   min_order_amount_paise, max_discount_amount_paise, one_time_per_customer,
                   is_active, start_date, end_date, created_at, updated_at
            FROM coupons
            WHERE restaurant_id = $1 AND is_active = true
            ORDER BY code ASC
            "#,
        )
        .bind(restaurant_id)
        .fetch_all(pool)
        .await?;

        Ok(coupons)
    }

    pub async fn validate_coupon(
        pool: &PgPool,
        restaurant_id: Uuid,
        req: &ValidateCouponRequest,
    ) -> Result<ValidateCouponResponse, AppError> {
        let code_upper = req.code.trim().to_uppercase();

        let coupon = sqlx::query_as::<_, Coupon>(
            r#"
            SELECT id, restaurant_id, code, description, discount_type, discount_value,
                   min_order_amount_paise, max_discount_amount_paise, one_time_per_customer,
                   is_active, start_date, end_date, created_at, updated_at
            FROM coupons
            WHERE restaurant_id = $1 AND code = $2 AND is_active = true
            "#,
        )
        .bind(restaurant_id)
        .bind(&code_upper)
        .fetch_optional(pool)
        .await?;

        let coupon = match coupon {
            Some(c) => c,
            None => {
                return Ok(ValidateCouponResponse {
                    is_valid: false,
                    discount_paise: 0,
                    message: Some("Coupon code is invalid or expired".to_string()),
                    coupon: None,
                });
            }
        };

        let now = Utc::now();
        if let Some(start) = coupon.start_date {
            if now < start {
                return Ok(ValidateCouponResponse {
                    is_valid: false,
                    discount_paise: 0,
                    message: Some("Coupon is not yet active".to_string()),
                    coupon: Some(coupon),
                });
            }
        }
        if let Some(end) = coupon.end_date {
            if now > end {
                return Ok(ValidateCouponResponse {
                    is_valid: false,
                    discount_paise: 0,
                    message: Some("Coupon has expired".to_string()),
                    coupon: Some(coupon),
                });
            }
        }

        // Min order check
        if req.order_amount_paise < coupon.min_order_amount_paise {
            return Ok(ValidateCouponResponse {
                is_valid: false,
                discount_paise: 0,
                message: Some(format!(
                    "Order amount must be at least Rs. {:.2} to apply this coupon",
                    coupon.min_order_amount_paise as f64 / 100.0
                )),
                coupon: Some(coupon),
            });
        }

        // One-time per customer check
        if coupon.one_time_per_customer {
            if let Some(ref phone) = req.customer_phone {
                let redeemed_row: (i64,) = sqlx::query_as(
                    "SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id = $1 AND customer_phone = $2"
                )
                .bind(coupon.id)
                .bind(phone)
                .fetch_one(pool)
                .await?;

                if redeemed_row.0 > 0 {
                    return Ok(ValidateCouponResponse {
                        is_valid: false,
                        discount_paise: 0,
                        message: Some(
                            "This coupon has already been redeemed for this phone number"
                                .to_string(),
                        ),
                        coupon: Some(coupon),
                    });
                }
            }
        }

        // Calculate discount
        let raw_discount_paise = if coupon.discount_type == "percentage" {
            Paise(req.order_amount_paise)
                .percentage(coupon.discount_value)
                .0
        } else {
            (coupon.discount_value * 100.0).round() as i64
        };

        let final_discount = if let Some(max_disc) = coupon.max_discount_amount_paise {
            raw_discount_paise.min(max_disc)
        } else {
            raw_discount_paise
        };

        let final_discount = final_discount.min(req.order_amount_paise);

        Ok(ValidateCouponResponse {
            is_valid: true,
            discount_paise: final_discount,
            message: Some("Coupon applied successfully".to_string()),
            coupon: Some(coupon),
        })
    }

    pub async fn redeem_coupon(
        pool: &PgPool,
        restaurant_id: Uuid,
        req: RedeemCouponRequest,
    ) -> Result<CouponRedemption, AppError> {
        let val_req = ValidateCouponRequest {
            code: req.code.clone(),
            order_amount_paise: req.order_amount_paise,
            customer_phone: req.customer_phone.clone(),
            customer_id: req.customer_id,
        };

        let val_res = Self::validate_coupon(pool, restaurant_id, &val_req).await?;
        if !val_res.is_valid {
            return Err(AppError::BadRequest(
                val_res
                    .message
                    .unwrap_or_else(|| "Coupon is invalid".to_string()),
            ));
        }

        let coupon = val_res.coupon.unwrap();

        let mut tx = pool.begin().await?;

        // Insert redemption record
        let redemption = sqlx::query_as::<_, CouponRedemption>(
            r#"
            INSERT INTO coupon_redemptions (
                coupon_id, restaurant_id, order_id, customer_id, customer_phone, discount_applied_paise
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, coupon_id, restaurant_id, order_id, customer_id, customer_phone,
                      discount_applied_paise, redeemed_at
            "#,
        )
        .bind(coupon.id)
        .bind(restaurant_id)
        .bind(req.order_id)
        .bind(req.customer_id)
        .bind(req.customer_phone)
        .bind(val_res.discount_paise)
        .fetch_one(&mut *tx)
        .await?;

        // Update order discount and recompute totals
        sqlx::query(
            r#"
            UPDATE orders
            SET discount_paise = $1,
                total_amount_paise = GREATEST(0, subtotal_paise - $1 + tax_paise + service_charge_paise + round_off_paise),
                updated_at = NOW()
            WHERE id = $2 AND restaurant_id = $3
            "#,
        )
        .bind(val_res.discount_paise)
        .bind(req.order_id)
        .bind(restaurant_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(redemption)
    }
}
