CREATE TABLE IF NOT EXISTS verification_report (
    id          TEXT PRIMARY KEY,
    target_id   TEXT NOT NULL REFERENCES node(id),
    severity    TEXT NOT NULL,
    findings    TEXT NOT NULL,
    pr_id       TEXT REFERENCES pr(id),
    created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
