CREATE TABLE project (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES workspace(id),
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL,
    description   TEXT,
    color         TEXT,
    settings      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE(workspace_id, slug)
);
