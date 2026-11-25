use axum::extract::FromRef;
use sqlx::PgPool;
use std::env;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub port: u16,
    pub database_url: String,
    pub local_database_url: Option<String>,
    pub device_sync_url: Option<String>,
    pub device_sync_token: Option<String>,
    pub is_offline_first: bool,
    pub supabase_jwt_secret: String,
    pub supabase_url: Option<String>,
    pub allowed_origins: Vec<String>,
    pub environment: String,
    pub allow_dev_auth: bool,
}

impl AppConfig {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();
        dotenvy::from_path("backend/api/.env").ok();
        dotenvy::from_path("../backend/api/.env").ok();

        // Also resolve .env located next to the running executable (e.g. installed app directory)
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                dotenvy::from_path(exe_dir.join(".env")).ok();
                dotenvy::from_path(exe_dir.join("backend/api/.env")).ok();
            }
        }

        let port = env::var("PORT")
            .ok()
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(3000);

        let local_database_url = env::var("LOCAL_DATABASE_URL")
            .ok()
            .filter(|s| !s.trim().is_empty());
        let device_sync_url = env::var("DEVICE_SYNC_URL")
            .ok()
            .filter(|s| !s.trim().is_empty());

        let database_url = local_database_url
            .clone()
            .or_else(|| env::var("DATABASE_URL").ok())
            .unwrap_or_else(|| "postgres://postgres:postgres@localhost:5432/hotel_crm".to_string());

        let is_offline_first = local_database_url.is_some();

        let secret_var = if is_offline_first {
            "POS_SESSION_SECRET"
        } else {
            "SUPABASE_JWT_SECRET"
        };
        let supabase_jwt_secret = env::var(secret_var)
            .ok()
            .filter(|s| s.len() >= 32)
            .unwrap_or_else(|| {
                format!(
                    "{}{}",
                    uuid::Uuid::new_v4().simple(),
                    uuid::Uuid::new_v4().simple()
                )
            });

        let supabase_url = if is_offline_first {
            None
        } else {
            env::var("SUPABASE_URL").ok()
        };

        let environment = env::var("ENVIRONMENT").unwrap_or_else(|_| "production".to_string());

        let allowed_origins_raw = env::var("ALLOWED_ORIGINS")
            .unwrap_or_else(|_| "http://tauri.localhost,https://tauri.localhost,tauri://localhost,http://localhost:4200,http://127.0.0.1:4200,http://localhost:3001,http://127.0.0.1:3001,https://gurukripadhaba-menu.vercel.app,http://127.0.0.1:3000,http://localhost:3000".to_string());

        let allowed_origins = allowed_origins_raw
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        let allow_dev_auth = cfg!(debug_assertions)
            && environment == "development"
            && env::var("ALLOW_DEV_AUTH")
                .map(|v| v.to_lowercase() == "true" || v == "1")
                .unwrap_or(false);

        Self {
            port,
            database_url,
            local_database_url,
            device_sync_url,
            device_sync_token: env::var("DEVICE_SYNC_TOKEN").ok(),
            is_offline_first,
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
