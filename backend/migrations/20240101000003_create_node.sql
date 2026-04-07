CREATE TABLE node (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type        TEXT NOT NULL,
    layer       INT NOT NULL,
    project_id  UUID NOT NULL REFERENCES project(id),
    parent_id   UUID REFERENCES node(id),
    title       TEXT NOT NULL,
    body        JSONB,
    payload     JSONB,
    status      TEXT DEFAULT 'active',
    position_x  FLOAT,
    position_y  FLOAT,
    created_by  UUID,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);
