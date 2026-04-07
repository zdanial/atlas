CREATE TABLE snapshot (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES project(id),
    timestamp   TIMESTAMPTZ NOT NULL,
    nodes       JSONB NOT NULL,
    edges       JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_snapshot_project_timestamp ON snapshot (project_id, timestamp);
