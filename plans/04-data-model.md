# Atlas Data Model

Shared schema that underpins all milestones. Must be built first (M1 Week 1).

**Database access:** Rust backend uses SQLx with compile-time checked queries. Supports PostgreSQL (Mode B/C) and SQLite (Mode A desktop/Tauri) via feature flags. Frontend browser-only mode uses IndexedDB with the same logical schema.

## Core Tables

```sql
-- Universal node primitive (all layers share this)
CREATE TABLE node (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL,        -- goal, problem, hypothesis, idea, constraint, decision, question, risk, insight, reference, bet, note, intent, epic, phase, ticket
  layer         INT NOT NULL,         -- 0-5
  project_id    UUID NOT NULL REFERENCES project(id),
  parent_id     UUID REFERENCES node(id),
  title         TEXT NOT NULL,
  body          JSONB,                -- rich text (Tiptap/Lexical JSON)
  payload       JSONB,                -- type-specific fields, validated by Zod
  status        TEXT DEFAULT 'active',
  position_x    FLOAT,                -- canvas spatial position
  position_y    FLOAT,
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE node_edge (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     UUID NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  target_id     UUID NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,        -- supports, contradicts, blocks, implements, duplicates, refines
  weight        FLOAT DEFAULT 1.0,
  source        TEXT DEFAULT 'human', -- 'ai' | 'human'
  created_at    TIMESTAMPTZ DEFAULT now()
);

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

-- Workspace: top-level container for multiple projects
CREATE TABLE workspace (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,    -- URL-safe identifier
  owner_id      UUID,                    -- user who created it (Mode C)
  settings      JSONB DEFAULT '{}',      -- workspace-level settings (default provider, theme)
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Workspace membership (Mode C: multi-user)
CREATE TABLE workspace_member (
  workspace_id  UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',  -- owner, admin, member, viewer
  created_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE project (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspace(id),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,           -- unique within workspace
  description   TEXT,
  color         TEXT,                    -- project color for visual distinction
  settings      JSONB DEFAULT '{}',      -- project-level overrides (agent models, etc.)
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, slug)
);

-- GitHub repos (shared across projects — a repo can be in multiple projects)
CREATE TABLE repo (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspace(id),
  github_repo     TEXT NOT NULL,       -- owner/name
  install_id      TEXT,
  default_branch  TEXT DEFAULT 'main',
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, github_repo)
);

-- Many-to-many: projects ↔ repos
CREATE TABLE project_repo (
  project_id    UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  repo_id       UUID NOT NULL REFERENCES repo(id) ON DELETE CASCADE,
  is_primary    BOOLEAN DEFAULT false,   -- the "main" repo for branch conventions
  created_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (project_id, repo_id)
);

CREATE TABLE pr (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id       UUID NOT NULL REFERENCES repo(id),
  ticket_id     UUID REFERENCES node(id),
  number        INT NOT NULL,
  status        TEXT DEFAULT 'open',   -- open, merged, closed
  head_sha      TEXT,
  title         TEXT,
  url           TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE verification_report (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id     UUID NOT NULL REFERENCES node(id),
  severity      TEXT NOT NULL,         -- critical, major, minor, outdated
  findings      JSONB NOT NULL,
  pr_id         UUID REFERENCES pr(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agent_run (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent         TEXT NOT NULL,         -- connector, synthesizer, strategist, architect, decomposer, reviewer, historian
  layer         INT,
  input         JSONB,
  output        JSONB,
  model         TEXT,
  tokens        INT,
  cost          FLOAT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

## Rust Models (SQLx)

```rust
// backend/src/db/models.rs

#[derive(Debug, sqlx::FromRow, Serialize, Deserialize)]
pub struct Node {
    pub id: Uuid,
    pub r#type: String,
    pub layer: i32,
    pub project_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub title: String,
    pub body: Option<serde_json::Value>,
    pub payload: Option<serde_json::Value>,
    pub status: String,
    pub position_x: Option<f64>,
    pub position_y: Option<f64>,
    pub created_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

Payload validation happens in Rust via `serde` + custom validators per node type, and in TypeScript via Zod on the frontend.

## Temporal Tables (Event Sourcing)

```sql
-- Every state change, ordered by time — powers the timeline scrubber
CREATE TABLE event (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES project(id),
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type    TEXT NOT NULL,          -- node.created, node.updated, node.deleted,
                                        -- edge.created, edge.deleted, node.reclassified,
                                        -- compile.epic_from_cluster, compile.phases_from_epic,
                                        -- pr.opened, pr.merged, annotation, etc.
  entity_type   TEXT NOT NULL,          -- 'node', 'edge', 'pr', 'agent_run'
  entity_id     UUID NOT NULL,
  before_state  JSONB,                  -- snapshot before change (null for creates)
  after_state   JSONB,                  -- snapshot after change (null for deletes)
  actor         TEXT,                   -- 'user', 'connector', 'synthesizer', etc.
  metadata      JSONB
);

CREATE INDEX idx_event_project_time ON event(project_id, timestamp);
CREATE INDEX idx_event_entity ON event(entity_id, timestamp);

-- Periodic full-graph snapshots for fast temporal reconstruction
CREATE TABLE snapshot (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES project(id),
  timestamp     TIMESTAMPTZ NOT NULL,
  nodes         JSONB NOT NULL,         -- all nodes at this moment
  edges         JSONB NOT NULL,         -- all edges at this moment
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_snapshot_project_time ON snapshot(project_id, timestamp);
```

See `07-temporal-navigation.md` for full temporal architecture.

## Import Tables (Project Onboarding)

```sql
-- Track connected import sources for incremental re-sync
CREATE TABLE import_source (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES project(id),
  source_type   TEXT NOT NULL,         -- 'github', 'linear', 'jira', 'notion', 'markdown', 'paste'
  source_config JSONB NOT NULL,        -- connection details
  last_synced   TIMESTAMPTZ,
  sync_cursor   JSONB,                 -- pagination cursor for incremental sync
  status        TEXT DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Map external entities to Atlas nodes (dedup + incremental sync)
CREATE TABLE import_mapping (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     UUID NOT NULL REFERENCES import_source(id),
  external_id   TEXT NOT NULL,
  external_type TEXT NOT NULL,          -- 'pr', 'issue', 'page', 'commit', 'document'
  node_id       UUID NOT NULL REFERENCES node(id),
  confidence    FLOAT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_id, external_id, external_type)
);
```

## Payload Schemas (per node type)

Validated at both layers (Rust for API, Zod for frontend):

- **Canvas notes** (L5): `{ tags: string[], color?: string }`
- **Intent** (L4): `{ targetOutcome: string, deadline?: Date, timeHorizon?: string }`
- **Epic** (L3): `{ prd: RichText, techPlan: RichText, openQuestions: string[], wireframes?: string[] }`
- **Phase** (L2): `{ objective: string, fileChanges: FileChange[], archNotes: string, verifyCriteria: string[], complexity: 'low'|'med'|'high', contextBundle: UUID[] }`
- **Ticket** (L1): `{ intent: string, filePaths: RepoFilePath[], acceptanceCriteria: string[], promptPayload: string, recommendedAgent?: string, repoId?: UUID }`
  - `RepoFilePath = { repoId: UUID, path: string }` — multi-repo aware file references

## IndexedDB Mirror (Local-First, Mode A)

Use Dexie.js to mirror `node`, `node_edge`, and `node_version` tables locally in the browser. In Mode A (browser-only), this is the only storage — no sync needed. In Modes B/C, the frontend uses `ApiAdapter` to talk to the Rust backend instead.

Conflict resolution for future sync: last-write-wins for v1 (CRDT in v1.5).
