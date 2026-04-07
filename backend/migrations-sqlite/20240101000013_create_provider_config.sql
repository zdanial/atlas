CREATE TABLE IF NOT EXISTS provider_config (
    id                 TEXT PRIMARY KEY,
    workspace_id       TEXT NOT NULL REFERENCES workspace(id),
    provider           TEXT NOT NULL,
    api_key_encrypted  TEXT,
    model_overrides    TEXT DEFAULT '{}',
    is_enabled         INTEGER DEFAULT 1,
    created_at         TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at         TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
