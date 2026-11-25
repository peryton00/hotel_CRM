use hotel_crm_api::{config::AppConfig, migrations};
use sqlx::PgPool;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = AppConfig::from_env();
    let init_admin = std::env::args().nth(1).as_deref() == Some("--init-admin");
    if init_admin && !config.is_offline_first {
        return Err("Admin provisioning requires LOCAL_DATABASE_URL".into());
    }
    let pool = PgPool::connect(&config.database_url).await?;
    if config.is_offline_first {
        migrations::LOCAL.run(&pool).await?;
    } else {
        migrations::migrate_cloud(&pool).await?;
    }
    if init_admin {
        let password = std::env::var("POS_INITIAL_PASSWORD")?;
        if password.trim().len() < 12 {
            return Err("Use at least 12 characters for POS_INITIAL_PASSWORD".into());
        }
        let hash = hotel_crm_api::routes::auth_routes::hash_password(password.trim())?;
        let mut tx = pool.begin().await?;
        sqlx::query("LOCK TABLE staff_members IN SHARE ROW EXCLUSIVE MODE")
            .execute(&mut *tx)
            .await?;
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM staff_members WHERE role='ADMIN' AND is_active)",
        )
        .fetch_one(&mut *tx)
        .await?;
        if exists {
            return Err("An active administrator already exists".into());
        }
        let id = uuid::Uuid::from_u128(1);
        sqlx::query("INSERT INTO restaurants(id,slug,name) VALUES($1,'restaurant','Restaurant') ON CONFLICT(id) DO NOTHING")
            .bind(id).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO staff_members(restaurant_id,name,role,login_id,pin_hash) VALUES($1,'Administrator','ADMIN','admin',$2)")
            .bind(id).bind(hash).execute(&mut *tx).await?;
        tx.commit().await?;
        println!("Local administrator created.");
    }
    println!("Database migrations complete.");
    Ok(())
}
