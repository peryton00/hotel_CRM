use sqlx::{migrate::Migrator, PgPool};

pub static LOCAL: Migrator = sqlx::migrate!("./migrations_local");
pub static CLOUD: Migrator = sqlx::migrate!("./migrations_cloud");

pub async fn verify_cloud(pool: &PgPool) -> Result<(), sqlx::Error> {
    let version: Option<i64> =
        sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations WHERE success")
            .fetch_one(pool)
            .await?;
    if version != CLOUD.iter().last().map(|migration| migration.version) {
        return Err(sqlx::Error::Protocol(
            "Cloud schema needs migration. Run the migrate binary before serving traffic.".into(),
        ));
    }
    Ok(())
}

/// Install the Supabase base schema on a new project, then apply forward upgrades.
pub async fn migrate_cloud(pool: &PgPool) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(718104521)")
        .execute(&mut *tx)
        .await?;
    let initialized: bool =
        sqlx::query_scalar("SELECT to_regclass('public.restaurants') IS NOT NULL")
            .fetch_one(&mut *tx)
            .await?;
    if !initialized {
        sqlx::raw_sql(include_str!("cloud_base.sql"))
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    CLOUD.run(pool).await?;
    Ok(())
}
