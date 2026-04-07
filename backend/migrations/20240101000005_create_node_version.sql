CREATE TABLE node_version (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id       UUID NOT NULL REFERENCES node(id) ON DELETE CASCADE,
    version       INT NOT NULL,
    body          JSONB,
    payload       JSONB,
    diff_summary  TEXT,
    author        UUID,
    created_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE(node_id, version)
);
