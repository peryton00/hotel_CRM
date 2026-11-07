use argon2::PasswordVerifier;
use axum::{
    extract::State,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{
    auth::{
        claims::{AppMetadata, SupabaseClaims, UserMetadata},
        AuthenticatedUser,
    },
    config::AppState,
    error::AppError,
    models::common::ApiResponse,
};

#[derive(Debug, Deserialize)]
pub struct LoginPayload {
    pub login_id: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyAdminPasswordPayload {
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
struct StaffAuthRow {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub name: String,
    pub role: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub pin_hash: String,
    pub is_active: bool,
    pub shift: Option<String>,
    pub assigned_section: Option<String>,
    pub login_id: Option<String>,
}

pub fn verify_password(stored: &str, entered: &str) -> bool {
    let stored = stored.trim();
    let entered = entered.trim();
    if stored.is_empty() || entered.is_empty() {
        return false;
    }
    // Direct match (password set in Supabase)
    if stored == entered {
        return true;
    }
    // Argon2 match if stored as Argon2 hash
    if stored.starts_with("$argon2") {
        if let Ok(parsed_hash) = argon2::PasswordHash::new(stored) {
            return argon2::Argon2::default()
                .verify_password(entered.as_bytes(), &parsed_hash)
                .is_ok();
        }
    }
    false
}

pub async fn get_me(user: AuthenticatedUser) -> impl IntoResponse {
    Json(ApiResponse::success(json!({
        "user_id": user.user_id,
        "email": user.email,
        "role": user.role,
    })))
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginPayload>,
) -> Result<impl IntoResponse, AppError> {
    let identifier = payload.login_id.trim();
    let password = payload.password.trim();

    if identifier.is_empty() || password.is_empty() {
        return Err(AppError::BadRequest(
            "Access ID and password are required".to_string(),
        ));
    }

    let staff = sqlx::query_as::<_, StaffAuthRow>(
        r#"
        SELECT id, restaurant_id, name, role, email, phone, pin_hash, is_active,
               shift, assigned_section, login_id
        FROM staff_members
        WHERE is_active = true
          AND (
            LOWER(COALESCE(email, '')) = LOWER($1)
            OR LOWER(COALESCE(login_id, '')) = LOWER($1)
            OR LOWER(name) = LOWER($1)
            OR phone = $1
            OR phone_e164 = $1
          )
        ORDER BY (CASE WHEN role = 'ADMIN' THEN 0 ELSE 1 END)
        LIMIT 1
        "#,
    )
    .bind(identifier)
    .fetch_optional(&state.pool)
    .await?;

    let staff = match staff {
        Some(s) => s,
        None => {
            return Err(AppError::Unauthorized(
                "Invalid ID or password. Access is restricted to credentials set in Supabase.".to_string(),
            ));
        }
    };

    if !verify_password(&staff.pin_hash, password) {
        return Err(AppError::Unauthorized(
            "Invalid ID or password. Access is restricted to credentials set in Supabase.".to_string(),
        ));
    }

    let exp = (Utc::now() + chrono::Duration::days(7)).timestamp();
    let claims = SupabaseClaims {
        sub: staff.id.to_string(),
        email: staff.email.clone(),
        role: Some(staff.role.to_lowercase()),
        aud: Some("authenticated".to_string()),
        exp,
        iat: Some(Utc::now().timestamp()),
        iss: state.config.supabase_url.clone().map(|u| format!("{}/auth/v1", u.trim_end_matches('/'))),
        app_metadata: Some(AppMetadata {
            provider: Some("email".to_string()),
            providers: Some(vec!["email".to_string()]),
            role: Some(staff.role.to_lowercase()),
            restaurant_id: Some(staff.restaurant_id),
        }),
        user_metadata: Some(UserMetadata {
            full_name: Some(staff.name.clone()),
            name: Some(staff.name.clone()),
            phone: staff.phone.clone(),
        }),
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.config.supabase_jwt_secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(format!("Failed to generate authentication token: {}", e)))?;

    Ok(Json(ApiResponse::success(json!({
        "token": token,
        "user": {
            "id": staff.id,
            "restaurant_id": staff.restaurant_id,
            "name": staff.name,
            "role": staff.role.to_uppercase(),
            "email": staff.email.unwrap_or_else(|| "".to_string()),
            "phone": staff.phone.unwrap_or_else(|| "".to_string()),
            "shift": staff.shift.unwrap_or_else(|| "General Shift".to_string()),
            "assigned_section": staff.assigned_section.unwrap_or_else(|| "Main Dining Floor".to_string()),
            "login_id": staff.login_id.unwrap_or_else(|| staff.name.to_lowercase().replace(' ', ".")),
        }
    }))))
}

pub async fn verify_admin_password(
    State(state): State<AppState>,
    Json(payload): Json<VerifyAdminPasswordPayload>,
) -> Result<impl IntoResponse, AppError> {
    let password = payload.password.trim();
    if password.is_empty() {
        return Ok(Json(ApiResponse::success(json!({ "valid": false }))));
    }

    let admin_row: Option<(String,)> = sqlx::query_as(
        r#"
        SELECT pin_hash FROM staff_members
        WHERE role = 'ADMIN' AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1
        "#,
    )
    .fetch_optional(&state.pool)
    .await?;

    let is_valid = match admin_row {
        Some((pin_hash,)) => verify_password(&pin_hash, password),
        None => false,
    };

    Ok(Json(ApiResponse::success(json!({ "valid": is_valid }))))
}
