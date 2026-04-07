CREATE TABLE project_repo (
    project_id  UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    repo_id     UUID NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
    is_primary  BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (project_id, repo_id)
);
