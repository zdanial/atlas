CREATE TABLE IF NOT EXISTS agent_run (
    id          TEXT PRIMARY KEY,
    agent       TEXT NOT NULL,
    layer       INTEGER,
    input       TEXT,
    output      TEXT,
    model       TEXT,
    tokens      INTEGER,
    cost        REAL,
    created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
