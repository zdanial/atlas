use sqlx::PgPool;
use uuid::Uuid;

pub async fn seed_defaults(pool: &PgPool) -> anyhow::Result<()> {
    // Check if any workspace already exists.
    let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM workspace")
        .fetch_one(pool)
        .await?;

    if row.0 > 0 {
        tracing::info!("Workspaces already exist, skipping seed.");
        return Ok(());
    }

    tracing::info!("No workspaces found -- seeding default workspace and project...");

    let workspace_id = Uuid::new_v4();
    let project_id = Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO workspace (id, name, slug)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(workspace_id)
    .bind("Default Workspace")
    .bind("default")
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO project (id, workspace_id, name, slug)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(project_id)
    .bind(workspace_id)
    .bind("My First Project")
    .bind("my-first-project")
    .execute(pool)
    .await?;

    tracing::info!(
        workspace_id = %workspace_id,
        project_id = %project_id,
        "Seeded default workspace and project."
    );

    Ok(())
}
