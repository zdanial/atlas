CREATE TABLE IF NOT EXISTS node_version (
    id            TEXT PRIMARY KEY,
    node_id       TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
    version       INTEGER NOT NULL,
    body          TEXT,
    payload       TEXT,
    diff_summary  TEXT,
    author        TEXT,
    created_at    TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(node_id, version)
);
