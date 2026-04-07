CREATE TABLE pr (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id     UUID NOT NULL REFERENCES repo(id),
    ticket_id   UUID REFERENCES node(id),
    number      INT NOT NULL,
    status      TEXT DEFAULT 'open',
    head_sha    TEXT,
    title       TEXT,
    url         TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);
