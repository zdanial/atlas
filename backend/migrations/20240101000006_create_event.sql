CREATE TABLE event (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL REFERENCES project(id),
    timestamp     TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_type    TEXT NOT NULL,
    entity_type   TEXT NOT NULL,
    entity_id     UUID NOT NULL,
    before_state  JSONB,
    after_state   JSONB,
    actor         TEXT,
    metadata      JSONB
);

CREATE INDEX idx_event_project_timestamp ON event (project_id, timestamp);
CREATE INDEX idx_event_entity_timestamp ON event (entity_id, timestamp);
