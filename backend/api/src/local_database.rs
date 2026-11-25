use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::SqlitePool;
use std::{path::Path, time::Duration};

/// Open the till database under the caller's application data directory.
pub async fn open(
    directory: &Path,
) -> Result<SqlitePool, Box<dyn std::error::Error + Send + Sync>> {
    tokio::fs::create_dir_all(directory).await?;
    let options = SqliteConnectOptions::new()
        .filename(directory.join("restaurant.sqlite3"))
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Full)
        .busy_timeout(Duration::from_secs(5));
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options)
        .await?;
    sqlx::migrate!("./migrations_sqlite").run(&pool).await?;
    Ok(pool)
}

/// Serve the SQLite-backed desktop endpoints on the till's loopback interface.
pub async fn serve(
    directory: &Path,
    shutdown: tokio::sync::oneshot::Receiver<()>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use axum::{extract::State, http::StatusCode, routing::get, Json, Router};

    async fn health(State(pool): State<SqlitePool>) -> Result<Json<serde_json::Value>, StatusCode> {
        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        Ok(Json(serde_json::json!({"status":"ok","database":"sqlite"})))
    }

    let pool = open(directory).await?;
    let worker_pool = pool.clone();
    let staff = crate::sqlite_staff::routes(pool.clone());
    let router = Router::new()
        .route("/api/v1/health", get(health)).route("/health",get(health)).route("/health/live",get(crate::routes::health::liveness)).route("/health/ready",get(health)).route("/api/v1/health/live",get(crate::routes::health::liveness)).route("/api/v1/health/ready",get(health))
        .fallback(|| async {
            (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({
                "error": {"message": "This operation is not available on the SQLite backend yet."}
            })))
        })
        .with_state(pool)
        .merge(staff)
        .layer(tower_http::cors::CorsLayer::new().allow_origin(["http://localhost:4200","http://127.0.0.1:4200","http://tauri.localhost","https://tauri.localhost","tauri://localhost"].map(|s| s.parse::<axum::http::HeaderValue>().unwrap())).allow_methods(tower_http::cors::Any).allow_headers(tower_http::cors::Any));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000").await?;
    let worker = match (
        std::env::var("DEVICE_SYNC_URL"),
        std::env::var("DEVICE_SYNC_TOKEN"),
    ) {
        (Ok(url), Ok(token)) => Some(tokio::spawn(crate::sync::sqlite::run(
            worker_pool,
            crate::sync::device::DeviceClient::new(&url, token)?,
        ))),
        _ => None,
    };
    let result = axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _ = shutdown.await;
        })
        .await;
    if let Some(task) = worker {
        task.abort();
    }
    result?;
    Ok(())
}

#[cfg(test)]
pub(crate) async fn remove_test_database(directory: &Path) {
    // WAL mode may leave sidecar files alongside the database. On Windows the
    // SQLite workers can briefly hold those files after the pool closes.
    for attempt in 1..=20 {
        match std::fs::remove_dir_all(directory) {
            Ok(()) => return,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound && !directory.exists() => return,
            Err(err)
                if attempt < 20
                    && (err.kind() == std::io::ErrorKind::DirectoryNotEmpty
                        || (cfg!(windows) && matches!(err.raw_os_error(), Some(5 | 32 | 33)))) =>
            {
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            Err(err) => panic!("Cannot remove test database {}: {err}", directory.display()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn reopening_preserves_restaurant_and_migration_history() {
        let directory =
            std::env::temp_dir().join(format!("restaurant-db-{}", uuid::Uuid::new_v4()));
        let pool = open(&directory).await.unwrap();
        sqlx::query("INSERT INTO restaurants (id, slug, name) VALUES ('r', 'r', 'Test')")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;
        let pool = open(&directory).await.unwrap();
        let name: String = sqlx::query_scalar("SELECT name FROM restaurants WHERE id='r'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(name, "Test");
        assert_eq!(
            sqlx::query_scalar::<_, i64>("PRAGMA foreign_keys")
                .fetch_one(&pool)
                .await
                .unwrap(),
            1
        );
        pool.close().await;
        remove_test_database(&directory).await;
    }
}
