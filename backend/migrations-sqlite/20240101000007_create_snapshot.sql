CREATE TABLE IF NOT EXISTS snapshot (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES project(id),
    timestamp   TEXT NOT NULL,
    nodes       TEXT NOT NULL,
    edges       TEXT NOT NULL,
    created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_snapshot_project_timestamp ON snapshot (project_id, timestamp);
