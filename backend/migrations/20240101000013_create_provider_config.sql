CREATE TABLE provider_config (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id       UUID NOT NULL REFERENCES workspace(id),
    provider           TEXT NOT NULL,
    api_key_encrypted  TEXT,
    model_overrides    JSONB DEFAULT '{}',
    is_enabled         BOOLEAN DEFAULT true,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);
