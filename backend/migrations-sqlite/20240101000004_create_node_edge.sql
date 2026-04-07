CREATE TABLE IF NOT EXISTS node_edge (
    id             TEXT PRIMARY KEY,
    source_id      TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
    target_id      TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
    relation_type  TEXT NOT NULL,
    weight         REAL DEFAULT 1.0,
    source         TEXT DEFAULT 'human',
    created_at     TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
