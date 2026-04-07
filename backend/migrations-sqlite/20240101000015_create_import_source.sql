CREATE TABLE IF NOT EXISTS import_source (
    id             TEXT PRIMARY KEY,
    project_id     TEXT NOT NULL REFERENCES project(id),
    source_type    TEXT NOT NULL,
    source_config  TEXT NOT NULL,
    last_synced    TEXT,
    sync_cursor    TEXT,
    status         TEXT DEFAULT 'active',
    created_at     TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
