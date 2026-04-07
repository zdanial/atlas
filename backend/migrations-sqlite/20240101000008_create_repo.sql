CREATE TABLE IF NOT EXISTS repo (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL REFERENCES workspace(id),
    github_repo     TEXT NOT NULL,
    install_id      TEXT,
    default_branch  TEXT DEFAULT 'main',
    created_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(workspace_id, github_repo)
);
