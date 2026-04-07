CREATE TABLE IF NOT EXISTS event (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES project(id),
    timestamp     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    event_type    TEXT NOT NULL,
    entity_type   TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    before_state  TEXT,
    after_state   TEXT,
    actor         TEXT,
    metadata      TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_project_timestamp ON event (project_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_event_entity_timestamp ON event (entity_id, timestamp);
