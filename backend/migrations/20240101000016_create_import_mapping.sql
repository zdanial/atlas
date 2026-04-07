CREATE TABLE import_mapping (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id      UUID NOT NULL REFERENCES import_source(id),
    external_id    TEXT NOT NULL,
    external_type  TEXT NOT NULL,
    node_id        UUID NOT NULL REFERENCES node(id),
    confidence     FLOAT,
    created_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE(source_id, external_id, external_type)
);
