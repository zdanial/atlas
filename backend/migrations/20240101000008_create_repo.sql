CREATE TABLE repo (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspace(id),
    github_repo     TEXT NOT NULL,
    install_id      TEXT,
    default_branch  TEXT DEFAULT 'main',
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(workspace_id, github_repo)
);
