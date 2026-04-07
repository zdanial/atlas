/// Database pool type alias — switches between PgPool and SqlitePool based on feature flag.

#[cfg(feature = "sqlite")]
pub type Pool = sqlx::SqlitePool;

#[cfg(not(feature = "sqlite"))]
pub type Pool = sqlx::PgPool;

#[cfg(feature = "sqlite")]
pub async fn connect(url: &str) -> Result<Pool, sqlx::Error> {
    use sqlx::sqlite::SqlitePoolOptions;
    SqlitePoolOptions::new()
        .max_connections(5)
        .connect(url)
        .await
}

#[cfg(not(feature = "sqlite"))]
pub async fn connect(url: &str) -> Result<Pool, sqlx::Error> {
    use sqlx::postgres::PgPoolOptions;
    PgPoolOptions::new().max_connections(10).connect(url).await
}

/// Run migrations from the appropriate directory.
pub async fn run_migrations(pool: &Pool) -> Result<(), sqlx::migrate::MigrateError> {
    #[cfg(feature = "sqlite")]
    {
        sqlx::migrate!("./migrations-sqlite").run(pool).await
    }
    #[cfg(not(feature = "sqlite"))]
    {
        sqlx::migrate!("./migrations").run(pool).await
    }
}
