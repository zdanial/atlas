CREATE TABLE export_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   UUID NOT NULL REFERENCES project(id),
    export_type  TEXT NOT NULL,
    target_id    UUID,
    payload      JSONB,
    created_at   TIMESTAMPTZ DEFAULT now()
);
