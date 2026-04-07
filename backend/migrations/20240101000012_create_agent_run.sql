CREATE TABLE agent_run (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent       TEXT NOT NULL,
    layer       INT,
    input       JSONB,
    output      JSONB,
    model       TEXT,
    tokens      INT,
    cost        FLOAT,
    created_at  TIMESTAMPTZ DEFAULT now()
);
