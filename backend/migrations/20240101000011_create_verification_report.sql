CREATE TABLE verification_report (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_id   UUID NOT NULL REFERENCES node(id),
    severity    TEXT NOT NULL,
    findings    JSONB NOT NULL,
    pr_id       UUID REFERENCES pr(id),
    created_at  TIMESTAMPTZ DEFAULT now()
);
