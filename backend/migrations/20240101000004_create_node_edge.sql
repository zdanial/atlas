CREATE TABLE node_edge (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id      UUID NOT NULL REFERENCES node(id) ON DELETE CASCADE,
    target_id      UUID NOT NULL REFERENCES node(id) ON DELETE CASCADE,
    relation_type  TEXT NOT NULL,
    weight         FLOAT DEFAULT 1.0,
    source         TEXT DEFAULT 'human',
    created_at     TIMESTAMPTZ DEFAULT now()
);
