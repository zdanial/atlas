CREATE TABLE IF NOT EXISTS node (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    layer       INTEGER NOT NULL,
    project_id  TEXT NOT NULL REFERENCES project(id),
    parent_id   TEXT REFERENCES node(id),
    title       TEXT NOT NULL,
    body        TEXT,
    payload     TEXT,
    status      TEXT DEFAULT 'active',
    position_x  REAL,
    position_y  REAL,
    created_by  TEXT,
    created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
