CREATE TABLE IF NOT EXISTS import_mapping (
    id             TEXT PRIMARY KEY,
    source_id      TEXT NOT NULL REFERENCES import_source(id),
    external_id    TEXT NOT NULL,
    external_type  TEXT NOT NULL,
    node_id        TEXT NOT NULL REFERENCES node(id),
    confidence     REAL,
    created_at     TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(source_id, external_id, external_type)
);
