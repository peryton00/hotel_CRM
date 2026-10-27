use axum::extract::FromRef;
use sqlx::PgPool;
use std::env;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub port: u16,
    pub database_url: String,
    pub supabase_jwt_secret: String,
    pub supabase_url: Option<String>,
    pub allowed_origins: Vec<String>,
    pub environment: String,
    pub allow_dev_auth: bool,
}

impl AppConfig {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();

        let port = env::var("PORT")
            .ok()
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(3000);

        let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
            "postgres://postgres:postgres@localhost:5432/hotel_crm".to_string()
        });

        let supabase_jwt_secret = env::var("SUPABASE_JWT_SECRET").unwrap_or_else(|_| {
            "dev_jwt_secret_must_be_configured_in_production_environment_32chars".to_string()
        });

        let supabase_url = env::var("SUPABASE_URL").ok();

        let environment = env::var("ENVIRONMENT").unwrap_or_else(|_| "development".to_string());

        let allowed_origins_raw = env::var("ALLOWED_ORIGINS")
            .unwrap_or_else(|_| "http://localhost:4200,http://127.0.0.1:4200".to_string());

        let allowed_origins = allowed_origins_raw
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        let allow_dev_auth = env::var("ALLOW_DEV_AUTH")
            .map(|v| v.to_lowercase() == "true" || v == "1")
            .unwrap_or(environment == "development" || environment == "test");

        Self {
            port,
            database_url,
            supabase_jwt_secret,
            supabase_url,
            allowed_origins,
            environment,
            allow_dev_auth,
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: AppConfig,
}

impl FromRef<AppState> for PgPool {
    fn from_ref(state: &AppState) -> Self {
        state.pool.clone()
    }
}

impl FromRef<AppState> for AppConfig {
    fn from_ref(state: &AppState) -> Self {
        state.config.clone()
    }
}
