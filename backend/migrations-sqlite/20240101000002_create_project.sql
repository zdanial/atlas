CREATE TABLE IF NOT EXISTS project (
    id            TEXT PRIMARY KEY,
    workspace_id  TEXT NOT NULL REFERENCES workspace(id),
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL,
    description   TEXT,
    color         TEXT,
    settings      TEXT DEFAULT '{}',
    created_at    TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(workspace_id, slug)
);
