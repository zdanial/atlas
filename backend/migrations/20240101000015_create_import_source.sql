CREATE TABLE import_source (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID NOT NULL REFERENCES project(id),
    source_type    TEXT NOT NULL,
    source_config  JSONB NOT NULL,
    last_synced    TIMESTAMPTZ,
    sync_cursor    JSONB,
    status         TEXT DEFAULT 'active',
    created_at     TIMESTAMPTZ DEFAULT now()
);
