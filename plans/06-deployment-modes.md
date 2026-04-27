# Butterfly — Deployment Modes & Open Source Strategy

Butterfly is open source (MIT or AGPLv3 — decide before launch). Three deployment modes from zero-infra to full cloud, all from the same codebase.

---

## Three Modes

### Mode A: Fully Local (Zero Infrastructure)
No server, no database, no account. Download and run.

- **Storage:** IndexedDB (Dexie.js) in the browser, or SQLite via better-sqlite3 / sql.js
- **Backend:** None. All logic runs client-side or in an optional local Electron/Tauri shell
- **AI:** BYO API keys only (calls go direct from client to provider APIs)
- **GitHub:** OAuth device flow (no server-side callback needed), or personal access token
- **Who it's for:** Solo founders, "just let me think" users, privacy-conscious, air-gapped

### Mode B: Local Server + PostgreSQL
Run Butterfly as a single Rust binary with a real database. Docker one-liner.

- **Storage:** PostgreSQL (local Docker container or any Postgres instance)
- **Backend:** Rust (Axum) binary on localhost — single process, ~20MB
- **AI:** BYO API keys, stored encrypted in local DB
- **GitHub:** GitHub App or PAT, webhook receiver via ngrok/cloudflared for PR events
- **Who it's for:** Power users, small teams on a shared machine, self-hosters

### Mode C: Supabase Cloud Deploy
One-click deploy to Supabase. Full cloud, zero ops.

- **Storage:** Supabase PostgreSQL (managed)
- **Auth:** Supabase Auth (GitHub OAuth built-in)
- **Realtime:** Supabase Realtime for sync (replaces custom sync engine)
- **Storage:** Supabase Storage for attachments/wireframes
- **Backend:** Rust binary on Fly.io / Railway (single container, low memory)
- **Who it's for:** Teams, users who want cloud sync, deploy-and-forget

---

## Architecture: Two-Layer Storage

### Frontend: StorageAdapter (TypeScript)

The SvelteKit frontend uses a `StorageAdapter` interface for all data access. In Mode A (browser-only), it talks directly to IndexedDB. In Modes B/C, it talks to the Rust API.

```typescript
// frontend/src/lib/storage/adapter.ts

interface StorageAdapter {
  // Node CRUD
  getNode(id: string): Promise<Node | null>;
  listNodes(filter: NodeFilter): Promise<Node[]>;
  createNode(node: CreateNode): Promise<Node>;
  updateNode(id: string, patch: Partial<Node>): Promise<Node>;
  deleteNode(id: string): Promise<void>;

  // Edges
  getEdges(nodeId: string): Promise<NodeEdge[]>;
  createEdge(edge: CreateEdge): Promise<NodeEdge>;
  deleteEdge(id: string): Promise<void>;

  // Versions
  getVersions(nodeId: string): Promise<NodeVersion[]>;

  // Agent runs
  logAgentRun(run: CreateAgentRun): Promise<AgentRun>;

  // Search
  searchNodes(query: string, filter?: NodeFilter): Promise<Node[]>;

  // Sync (for local modes)
  getPendingChanges(): Promise<Change[]>;
  markSynced(changeIds: string[]): Promise<void>;
}
```

**Frontend Implementations:**

```typescript
// Mode A: browser-only, zero-server
class IndexedDBAdapter implements StorageAdapter {
  private db: Dexie;
  // All operations local via Dexie
  // Full-text search via lunr.js index
  // No sync — fully self-contained
}

// Modes B/C: calls Rust API
class ApiAdapter implements StorageAdapter {
  private baseUrl: string; // http://localhost:3001 or https://api.butterfly.dev
  // All operations are REST calls to Rust backend
  // WebSocket for realtime updates
}

// Mode C extension: adds Supabase Auth + Realtime
class SupabaseAdapter extends ApiAdapter {
  // Supabase Auth for login (GitHub OAuth)
  // Supabase Realtime subscriptions for live node/edge updates
  // Supabase Storage for file uploads
}
```

### Backend: Rust API (Axum + SQLx)

The Rust backend handles all database access, AI agent orchestration, and GitHub integration.

```rust
// backend/src/db/mod.rs

// SQLx with compile-time query checking
// Supports both PostgreSQL and SQLite via feature flags
#[cfg(feature = "postgres")]
pub type DbPool = sqlx::PgPool;

#[cfg(feature = "sqlite")]
pub type DbPool = sqlx::SqlitePool;

// Same query interface, different backends
pub async fn get_node(pool: &DbPool, id: Uuid) -> Result<Node> { ... }
pub async fn list_nodes(pool: &DbPool, filter: NodeFilter) -> Result<Vec<Node>> { ... }
pub async fn create_node(pool: &DbPool, node: CreateNode) -> Result<Node> { ... }
```

```rust
// backend/src/routes/mod.rs — Axum REST API

pub fn router() -> Router {
    Router::new()
        .route("/api/nodes", get(list_nodes).post(create_node))
        .route("/api/nodes/:id", get(get_node).patch(update_node).delete(delete_node))
        .route("/api/nodes/:id/edges", get(get_edges).post(create_edge))
        .route("/api/nodes/:id/versions", get(get_versions))
        .route("/api/search", get(search_nodes))
        .route("/api/agents/runs", get(list_runs).post(log_run))
        .route("/api/providers", get(list_providers).post(configure_provider))
        // GitHub webhooks
        .route("/api/webhooks/github", post(handle_github_webhook))
        // Export
        .route("/api/export/ticket/:id", get(export_ticket))
        .route("/api/export/phase/:id", get(export_phase))
        // WebSocket for realtime
        .route("/ws", get(ws_handler))
}
```

---

## Repository Structure

```
butterfly/
├── frontend/                       # SvelteKit 2 + Svelte 5
│   ├── src/
│   │   ├── routes/                 # SvelteKit file-based routing
│   │   │   ├── +layout.svelte
│   │   │   ├── +page.svelte        # Canvas (default view)
│   │   │   ├── roadmap/            # Roadmap view
│   │   │   └── settings/           # API keys, providers, preferences
│   │   ├── lib/
│   │   │   ├── components/         # Canvas, NoteCard, GraphView, Kanban, CommandPalette
│   │   │   ├── storage/            # StorageAdapter interface + implementations
│   │   │   │   ├── adapter.ts
│   │   │   │   ├── indexeddb.ts    # Mode A (browser-only)
│   │   │   │   ├── api.ts          # Modes B/C (calls Rust backend)
│   │   │   │   └── supabase.ts     # Mode C (extends api.ts with Supabase Auth/Realtime)
│   │   │   ├── stores/             # Svelte 5 rune-based state ($state, $derived)
│   │   │   ├── agents/             # Frontend agent logic (classification, provider registry)
│   │   │   └── types/              # Zod schemas, shared TypeScript types
│   │   └── app.html
│   ├── static/
│   ├── svelte.config.js
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── package.json
│   └── tsconfig.json
│
├── backend/                        # Rust + Axum
│   ├── src/
│   │   ├── main.rs                 # Entry point, Axum server setup
│   │   ├── routes/                 # API route handlers
│   │   │   ├── mod.rs
│   │   │   ├── nodes.rs
│   │   │   ├── edges.rs
│   │   │   ├── agents.rs
│   │   │   ├── providers.rs
│   │   │   └── github.rs           # Webhook handlers
│   │   ├── db/                     # SQLx queries, models
│   │   │   ├── mod.rs
│   │   │   ├── nodes.rs
│   │   │   ├── edges.rs
│   │   │   └── migrations.rs
│   │   ├── export/                 # Export system (prompt compiler, formatters)
│   │   │   ├── mod.rs
│   │   │   ├── prompt.rs           # PromptCompiler: context chain → prompt
│   │   │   └── formats.rs          # Clipboard, CLAUDE.md, Conductor JSON
│   │   ├── ai/                     # LLM client abstraction
│   │   │   ├── mod.rs
│   │   │   ├── anthropic.rs
│   │   │   ├── openai.rs
│   │   │   └── types.rs
│   │   ├── github/                 # GitHub API client (Octocrab)
│   │   │   ├── mod.rs
│   │   │   ├── auth.rs
│   │   │   └── webhooks.rs
│   │   └── ws/                     # WebSocket for realtime updates
│   │       └── mod.rs
│   ├── migrations/                 # SQLx migrations (SQL files)
│   │   ├── 0001_create_project.sql
│   │   ├── 0002_create_node.sql
│   │   └── ...
│   ├── Cargo.toml
│   └── Cargo.lock
│
├── desktop/                        # Tauri shell (optional, wraps frontend + backend)
│   ├── src-tauri/
│   │   ├── src/main.rs             # Embeds Axum backend as sidecar
│   │   └── Cargo.toml
│   └── package.json
│
├── supabase/                       # Supabase project config (Mode C)
│   ├── migrations/                 # Symlink or copy from backend/migrations/
│   ├── seed.sql
│   └── config.toml
│
├── docker/
│   ├── docker-compose.yml          # Mode B: frontend + backend + postgres
│   ├── Dockerfile.backend          # Multi-stage Rust build (~20MB final image)
│   └── Dockerfile.frontend         # SvelteKit Node adapter
│
├── .github/
│   └── workflows/
│       ├── ci.yml                  # Lint, typecheck, cargo clippy, test, build
│       └── release.yml             # Build binaries for macOS/Linux, Docker push
│
├── LICENSE                         # AGPLv3
├── CLAUDE.md                       # Project context for Claude Code contributors
├── CONTRIBUTING.md
└── README.md
```

---

## Setup Commands by Mode

### Mode A: Fully Local (browser only)
```bash
git clone https://github.com/yourusername/butterfly
cd butterfly/frontend
pnpm install
pnpm dev
# Open http://localhost:5173
# All data in browser IndexedDB. No server needed.
# Set API keys in Settings > AI Providers (keys stored in browser, calls go direct to LLM providers)
```

### Mode B: Local Server + PostgreSQL
```bash
git clone https://github.com/yourusername/butterfly
cd butterfly
cp .env.example .env
# Edit .env: set DATABASE_URL, API keys

# Option 1: Docker (recommended)
docker compose up
# Builds Rust binary in multi-stage Docker build, starts frontend + backend + postgres

# Option 2: Manual
cd backend && cargo build --release
cd ../frontend && pnpm install
# Terminal 1:
DATABASE_URL=postgres://localhost/butterfly ./backend/target/release/butterfly-server
# Terminal 2:
cd frontend && pnpm dev
```

### Mode C: Supabase Cloud
```bash
git clone https://github.com/yourusername/butterfly
cd butterfly

# 1. Create Supabase project at supabase.com
# 2. Copy connection details
cp .env.example .env
# Edit .env:
#   PUBLIC_SUPABASE_URL=https://xxx.supabase.co
#   PUBLIC_SUPABASE_ANON_KEY=eyJ...
#   SUPABASE_SERVICE_ROLE_KEY=eyJ...
#   DATABASE_URL=postgres://...pooler connection string

# 3. Run migrations
cd backend && sqlx migrate run
# Or: supabase db push (if using supabase CLI)

# 4. Deploy
# Backend: fly deploy (Dockerfile.backend → ~20MB container)
# Frontend: vercel deploy or fly deploy (SvelteKit Node adapter)

# Or one-click:
# [Deploy to Fly.io] [Deploy to Railway] buttons in README
```

---

## Environment Detection & Mode Selection

```typescript
// frontend/src/lib/storage/index.ts

type DeploymentMode = 'local-browser' | 'local-server' | 'supabase';

function detectMode(): DeploymentMode {
  // SvelteKit uses PUBLIC_ prefix for client-accessible env vars
  if (import.meta.env.PUBLIC_SUPABASE_URL) return 'supabase';
  if (import.meta.env.PUBLIC_API_URL) return 'local-server';
  return 'local-browser';
}

function createStorage(mode: DeploymentMode): StorageAdapter {
  switch (mode) {
    case 'local-browser':
      return new IndexedDBAdapter();
    case 'local-server':
      return new ApiAdapter(import.meta.env.PUBLIC_API_URL);
    case 'supabase':
      return new SupabaseAdapter({
        url: import.meta.env.PUBLIC_SUPABASE_URL!,
        anonKey: import.meta.env.PUBLIC_SUPABASE_ANON_KEY!,
        apiUrl: import.meta.env.PUBLIC_API_URL!,
      });
  }
}
```

---

## Supabase-Specific Features

### Row-Level Security
```sql
-- Every table gets RLS
ALTER TABLE node ENABLE ROW LEVEL SECURITY;

-- Users can only see nodes in their projects
CREATE POLICY "Users see own project nodes"
  ON node FOR SELECT
  USING (project_id IN (
    SELECT project_id FROM project_member
    WHERE user_id = auth.uid()
  ));

-- Similar policies for INSERT, UPDATE, DELETE
```

### Realtime Subscriptions
```typescript
// In Supabase mode, subscribe to live changes
supabase
  .channel('nodes')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'node', filter: `project_id=eq.${projectId}` },
    (payload) => nodeStore.applyRemoteChange(payload)
  )
  .subscribe();
```

### Supabase Storage (Attachments)
```typescript
// Wireframes, exports, file uploads
const { data } = await supabase.storage
  .from('attachments')
  .upload(`${projectId}/${nodeId}/${filename}`, file);
```

### Supabase Auth
```typescript
// GitHub OAuth via Supabase (no custom OAuth server needed)
await supabase.auth.signInWithOAuth({ provider: 'github' });
```

---

## Migration Strategy

Migrations are written once in SQL and live in `backend/migrations/`. SQLx manages them for both local PostgreSQL and Supabase:

```
backend/migrations/
├── 0001_create_project.sql
├── 0002_create_node.sql
├── 0003_create_node_edge.sql
├── 0004_create_node_version.sql
├── 0005_create_repo.sql
├── 0006_create_pr.sql
├── 0007_create_verification_report.sql
├── 0008_create_agent_run.sql
├── 0009_create_provider_config.sql
├── 0010_create_export_log.sql
└── 0012_add_rls_policies.sql      # Supabase-only, guarded by DO $$ BEGIN IF ... END $$
```

For local PG: `sqlx migrate run` (or the Rust binary runs migrations on startup).
For Supabase: `supabase db push` or `sqlx migrate run` against the pooler URL.
SQLite: feature-flagged `#[cfg(feature = "sqlite")]` with equivalent schema (UUID → TEXT, TIMESTAMPTZ → TEXT, JSONB → TEXT).

---

## Open Source Specifics

### License Decision
- **MIT** — maximum adoption, companies can fork freely, but no protection against proprietary forks
- **AGPLv3** — copyleft, anyone who hosts it must share modifications, protects the community
- **BSL → MIT** — Business Source License that converts to MIT after 2 years (the Sentry/Grafana model)

Recommendation: **AGPLv3** — Butterfly is a tool, not a library. AGPL ensures hosted versions contribute back without limiting local/self-hosted use.

### Contributing Guide
- `CONTRIBUTING.md` with: setup, architecture overview, PR conventions
- Issue templates: bug, feature request, agent improvement
- `CLAUDE.md` at repo root: project context for Claude Code contributors
- Good first issues labeled for onboarding

### CI/CD
```yaml
# .github/workflows/ci.yml
# Frontend:
- pnpm lint + svelte-check (typecheck)
- Vitest unit tests
- Playwright e2e tests (browser-only mode)
- SvelteKit build check

# Backend:
- cargo fmt --check
- cargo clippy -- -D warnings
- cargo test (unit + integration against PG via Docker service)
- cargo build --release (ensure it compiles)
- insta snapshot tests for API responses

# Cross:
- Docker compose build (ensure full stack builds)
- Agent eval harness (on model upgrade PRs only)
```

### Release Artifacts
```yaml
# .github/workflows/release.yml (on tag)
- Build Rust binary: macOS (aarch64 + x86_64), Linux (x86_64, aarch64)
- Build Docker images: backend + frontend
- Push to GitHub Container Registry
- GitHub Release with pre-built binaries
- Optional: Homebrew tap formula
```

---

## Impact on Milestone Plans

### M1 Changes
- **A1 (scaffold):** Set up `frontend/` (SvelteKit) + `backend/` (Cargo workspace with Axum)
- **A1:** Implement `IndexedDBAdapter` as the default (browser-only mode works from day 1)
- **A1:** `StorageAdapter` interface defined upfront, all CRUD goes through it
- **A1:** Rust backend skeleton: Axum + SQLx + initial migrations, `cargo test` passing

### M2 Changes
- **New task (Week 5):** Rust API routes for all node/edge/version CRUD
- **New task (Week 5):** `ApiAdapter` (frontend → Rust backend via REST)
- **New task (Week 6):** Docker Compose setup for Mode B (Rust multi-stage build + PG)
- **J3 (Export, Week 10):** Include `docker compose up` instructions in export/setup docs

### M3 Changes
- **New task (Week 11):** `SupabaseAdapter` extending ApiAdapter
- **New task (Week 11):** Supabase Auth integration (replaces custom OAuth for Mode C)
- **New task (Week 12):** RLS policies, Realtime subscriptions
- **New task (Week 14):** Deploy configs (Fly.io, Railway), one-click Supabase setup
- **New task (Week 14):** Release workflow: pre-built Rust binaries for macOS/Linux
- **New task (Week 14):** README with setup instructions for all 3 modes
