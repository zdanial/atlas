CREATE TABLE IF NOT EXISTS pr (
    id          TEXT PRIMARY KEY,
    repo_id     TEXT NOT NULL REFERENCES repo(id),
    ticket_id   TEXT REFERENCES node(id),
    number      INTEGER NOT NULL,
    status      TEXT DEFAULT 'open',
    head_sha    TEXT,
    title       TEXT,
    url         TEXT,
    created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
