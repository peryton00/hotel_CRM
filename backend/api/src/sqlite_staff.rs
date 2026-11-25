use crate::{
    error::AppError,
    routes::auth_routes::{
        hash_password, verify_password, LoginPayload, VerifyAdminPasswordPayload,
    },
};
use axum::{
    extract::State,
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Clone)]
pub(super) struct StaffState {
    pub(super) pool: SqlitePool,
    secret: String,
}

#[derive(Serialize, Deserialize)]
struct Session {
    sub: String,
    exp: usize,
}

pub fn routes(pool: SqlitePool) -> Router {
    Router::new()
        .route("/ws/orders", get(websocket))
        .route("/events", get(events))
        .route("/sse", get(events))
        .route("/api/v1/events", get(events))
        .route("/api/v1/auth/setup", get(setup_status).post(setup))
        .route("/api/v1/auth/login", post(login))
        .route("/api/v1/auth/me", get(me))
        .route("/api/v1/auth/verify-admin-password", post(check_admin))
        .merge(crate::sqlite_sale::routes())
        .with_state(StaffState {
            pool,
            secret: format!("{}{}", Uuid::new_v4(), Uuid::new_v4()),
        })
}

async fn setup_status(State(state): State<StaffState>) -> Result<Json<Value>, AppError> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM users WHERE login_id IS NOT NULL OR pin_hash IS NOT NULL)",
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(json!({"required": !exists})))
}

async fn setup(
    State(state): State<StaffState>,
    Json(input): Json<LoginPayload>,
) -> Result<Json<Value>, AppError> {
    if input.login_id.trim() != "admin" || input.password.trim().chars().count() < 12 {
        return Err(AppError::BadRequest(
            "Use admin and a password of at least 12 characters.".into(),
        ));
    }
    let hash = hash_password(input.password.trim()).map_err(AppError::Internal)?;
    let rid = Uuid::from_u128(1).to_string();
    let mut tx = state.pool.begin().await?;
    sqlx::query("INSERT INTO restaurants(id,slug,name) VALUES(?,'restaurant','Restaurant') ON CONFLICT(id) DO NOTHING")
        .bind(&rid).execute(&mut *tx).await?;
    let inserted = sqlx::query("INSERT INTO users(id,restaurant_id,email,name,role,pin_hash,login_id) SELECT ?,?,'admin@localhost','Administrator','ADMIN',?,'admin' WHERE NOT EXISTS(SELECT 1 FROM users WHERE login_id IS NOT NULL OR pin_hash IS NOT NULL)")
        .bind(Uuid::new_v4().to_string()).bind(rid).bind(hash).execute(&mut *tx).await?;
    if inserted.rows_affected() != 1 {
        return Err(AppError::Conflict(
            "The till already has a staff account.".into(),
        ));
    }
    tx.commit().await?;
    login(State(state), Json(input)).await
}

async fn login(
    State(state): State<StaffState>,
    Json(input): Json<LoginPayload>,
) -> Result<Json<Value>, AppError> {
    use sqlx::Row;
    let row = sqlx::query("SELECT id,restaurant_id,name,email,role,permissions,pin_hash FROM users WHERE is_active=1 AND (login_id=? OR email=? COLLATE NOCASE) LIMIT 1")
        .bind(input.login_id.trim()).bind(input.login_id.trim()).fetch_optional(&state.pool).await?
        .ok_or_else(unauthorized)?;
    if !verify_password(row.get("pin_hash"), &input.password) {
        return Err(unauthorized());
    }
    let id: String = row.get("id");
    let token = jsonwebtoken::encode(
        &Default::default(),
        &Session {
            sub: id.clone(),
            exp: (chrono::Utc::now() + chrono::Duration::hours(12)).timestamp() as usize,
        },
        &jsonwebtoken::EncodingKey::from_secret(state.secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(Json(
        json!({"success":true,"data":{"token":token,"user":{"id":id,"name":row.get::<String,_>("name"),"role":row.get::<String,_>("role"),"email":row.get::<String,_>("email"),"restaurant_id":row.get::<String,_>("restaurant_id"),"permissions":serde_json::from_str::<Vec<String>>(row.get("permissions")).unwrap_or_default()}}}),
    ))
}

fn unauthorized() -> AppError {
    AppError::Unauthorized("Invalid staff credentials or expired session.".into())
}

pub(super) async fn identity(
    state: &StaffState,
    headers: &HeaderMap,
) -> Result<(String, String, String, String), AppError> {
    let session = checked_session(state, headers)?;
    sqlx::query_as("SELECT id,email,role,restaurant_id FROM users WHERE id=? AND is_active=1")
        .bind(session.sub)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(unauthorized)
}

async fn me(State(state): State<StaffState>, headers: HeaderMap) -> Result<Json<Value>, AppError> {
    let (id, email, role, _) = identity(&state, &headers).await?;
    Ok(Json(
        json!({"success":true,"data":{"user_id":id,"email":email,"role":role}}),
    ))
}

async fn check_admin(
    State(state): State<StaffState>,
    headers: HeaderMap,
    Json(input): Json<VerifyAdminPasswordPayload>,
) -> Result<Json<Value>, AppError> {
    let (_, _, _, rid) = identity(&state, &headers).await?;
    let hash:Option<String>=sqlx::query_scalar("SELECT pin_hash FROM users WHERE restaurant_id=? AND role='ADMIN' AND is_active=1 AND pin_hash IS NOT NULL LIMIT 1").bind(rid).fetch_optional(&state.pool).await?;
    Ok(Json(
        json!({"success":true,"data":{"valid":hash.is_some_and(|h|verify_password(&h,&input.password))}}),
    ))
}

fn checked_session(state: &StaffState, headers: &HeaderMap) -> Result<Session, AppError> {
    let token = headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .ok_or_else(unauthorized)?;
    let session = jsonwebtoken::decode::<Session>(
        token,
        &jsonwebtoken::DecodingKey::from_secret(state.secret.as_bytes()),
        &Default::default(),
    )
    .map_err(|_| unauthorized())?;
    Ok(session.claims)
}
async fn stream_lifetime(
    state: &StaffState,
    h: &HeaderMap,
) -> Result<std::time::Duration, AppError> {
    identity(state, h).await?;
    let exp = checked_session(state, h)?.exp as i64;
    Ok(std::time::Duration::from_secs(
        (exp - chrono::Utc::now().timestamp()).max(0) as u64,
    ))
}
async fn websocket(
    ws: axum::extract::WebSocketUpgrade,
    State(s): State<StaffState>,
    h: HeaderMap,
) -> Result<impl axum::response::IntoResponse, AppError> {
    let parts = crate::ws::staff_upgrade_parts(&h)?;
    Ok(crate::ws::upgrade(
        ws,
        stream_lifetime(&s, &parts.headers).await?,
    ))
}
async fn events(
    State(s): State<StaffState>,
    h: HeaderMap,
) -> Result<impl axum::response::IntoResponse, AppError> {
    Ok(crate::ws::event_stream(stream_lifetime(&s, &h).await?))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn first_admin_can_sign_in_but_cannot_be_replaced() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations_sqlite")
            .run(&pool)
            .await
            .unwrap();
        let state = StaffState {
            pool,
            secret: Uuid::new_v4().to_string(),
        };
        let credentials = || {
            Json(LoginPayload {
                login_id: "admin".into(),
                password: "test-password-only".into(),
            })
        };
        assert_eq!(
            setup_status(State(state.clone())).await.unwrap().0["required"],
            true
        );
        let response = setup(State(state.clone()), credentials()).await.unwrap().0;
        assert!(setup(State(state.clone()), credentials()).await.is_err());
        assert!(login(State(state.clone()), credentials()).await.is_ok());
        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            format!("Bearer {}", response["data"]["token"].as_str().unwrap())
                .parse()
                .unwrap(),
        );
        assert_eq!(
            me(State(state.clone()), headers.clone()).await.unwrap().0["data"]["role"],
            "ADMIN"
        );
        sqlx::query("UPDATE users SET is_active=0")
            .execute(&state.pool)
            .await
            .unwrap();
        assert!(me(State(state), headers).await.is_err());
    }
}
