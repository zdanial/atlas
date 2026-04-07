CREATE TABLE IF NOT EXISTS project_repo (
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    repo_id     TEXT NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
    is_primary  INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (project_id, repo_id)
);
