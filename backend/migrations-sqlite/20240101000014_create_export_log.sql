CREATE TABLE IF NOT EXISTS export_log (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES project(id),
    export_type  TEXT NOT NULL,
    target_id    TEXT,
    payload      TEXT,
    created_at   TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
