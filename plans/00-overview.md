# Butterfly Implementation Plan — Overview

## Summary

Butterfly is a spatial thinking canvas that compiles brain dumps into structured specs, tickets, and exportable commands — with full traceability from idea to merged PR. It has 6 layers (Canvas L5 → Intent L4 → Epic L3 → Phase L2 → Ticket L1 → Code L0), 7 named AI planning agents (+ Cartographer for onboarding), and passive GitHub integration. Butterfly is the planning brain — it does not spawn or manage coding agents. Work leaves Butterfly as exported commands, CLAUDE.md files, or Conductor swarm configs.

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend** | SvelteKit 2 + Svelte 5 (runes), TypeScript strict | Compiled, no virtual DOM, sub-ms updates, stable |
| **Styling** | Tailwind v4, Bits UI (headless Svelte components) | |
| **Rich text** | TipTap (ProseMirror) via `svelte-tiptap` | Mature, extensible, Svelte bindings exist |
| **Graph view** | Svelvet or d3-force + custom Svelte wrapper | Native Svelte perf, no React bridge overhead |
| **Canvas** | Custom HTML + CSS transforms | Native text inputs, Svelte reactivity for updates |
| **Client state** | Svelte 5 runes (`$state`, `$derived`) | Built-in fine-grained reactivity, no extra lib |
| **Server state** | TanStack Query (Svelte adapter) | |
| **Storage** | StorageAdapter pattern (IndexedDB / SQLite / PostgreSQL / Supabase) | |
| **Backend** | Rust + Axum (tokio async runtime) | Blazing fast, memory-safe, single binary deploy |
| **DB access** | SQLx (compile-time checked queries) | No ORM overhead, raw SQL with type safety |
| **Migrations** | sqlx-cli / refinery | Shared SQL migrations for PG + SQLite |
| **Object storage** | Supabase Storage / S3 / local filesystem | |
| **Testing** | Vitest (frontend unit), Playwright (e2e), `cargo test` + `insta` (backend) | |
| **Monorepo** | Cargo workspace (backend) + pnpm workspace (frontend) | |
| **License** | AGPLv3 (recommended) | |

## Deployment Modes

| Mode | Storage | Backend | For |
|------|---------|---------|-----|
| **A: Local Browser** | IndexedDB | None | Solo, zero-infra, `pnpm dev` and go |
| **B: Local Server** | PostgreSQL (Docker) | Rust binary on localhost | Power users, self-hosters |
| **C: Supabase Cloud** | Supabase PG + Auth + Realtime | Rust on Fly.io / Railway | Teams, cloud sync, one-click deploy |

## Milestones

| Milestone | Scope | Duration |
|-----------|-------|----------|
| **M1** — Canvas + Connector | Brain-dump layer works e2e. Notes, classification, edges, 3 views. | 4 weeks |
| **M2** — Compilation Pipeline | Canvas → Epic → Phase → Ticket. All middle agents. Export. | 6 weeks |
| **M3** — Code Reality Layer | GitHub integration, Reviewer agent, full traceability. | 4 weeks |

## Parallelization Strategy

Each milestone is broken into **work streams** that can be built concurrently by separate agents/developers. Dependencies between streams are explicitly marked. See the per-milestone plans for details.

## Cross-Cutting Concerns

### Testing
Test pyramid: unit (Rust `cargo test` + Vitest), integration (testcontainers-rs + MSW), e2e (Playwright), agent evals (golden I/O sets). CI runs all on every PR. Visual regression via screenshot comparison. Performance benchmarks tracked per release. See `08-testing-strategy.md`.

### Auth & Security
Auth scales with deployment mode: none (browser-only) → optional passphrase (local server) → Supabase Auth with RLS (cloud). API keys encrypted at rest (AES-256-GCM). SQLx prevents injection at compile time. Threat model covers OWASP top 10. Audit logging for all security events. See `09-auth-security.md`.

### Documentation & Validation
API docs auto-generated (utoipa/OpenAPI). Component docs via Histoire (Svelte Storybook). ADRs for architectural decisions. Feature validation registry: every feature has acceptance criteria, test coverage map, and validated status. Dashboard generated in CI. See `10-docs-validation.md`.

### Recurring Processes
Background tasks (Connector loop, cleanup, snapshots) run as tokio tasks in the Rust backend. CI/CD: nightly e2e + benchmarks, weekly agent eval regression + dep audit. Code cleanup scheduled at end of each milestone. Tech debt explicitly tracked and targeted. Release checklist templated. See `11-recurring-processes.md`.

### Agent Handoff & Export
Butterfly is the planning brain, not the execution runtime. Every ticket compiles into a ready-to-run command (`claude --print "..."`) or downloadable CLAUDE.md with full upstream context. Phases export as ordered batch commands or Conductor swarm configs (JSON with dependency graph + parallelization waves). Copy, paste, go. GitHub integration passively tracks PRs back to tickets. See `05-claude-code-integration.md`.

### BYO API Keys (Forge-style)
API keys power Butterfly's *internal* planning agents (Connector, Synthesizer, Architect, etc.) — not coding agents. Capability-based provider registry. Users bring their own keys (Anthropic, OpenAI, Google, DeepSeek). Each agent role maps to a capability with configurable provider/model overrides.

### Multiple Projects & Multi-Repo
Workspace → Projects → Repos. Each project can link to multiple repos (frontend, backend, infra). Repos can be shared across projects. Tickets are repo-scoped with repo badges, exported commands `cd` into the correct repo, cross-repo dependencies are tracked. Cross-project views: unified roadmap, cross-project graph, workspace-wide search. See `13-multi-project-multi-repo.md`.

### Lenses & Navigation
Saved views (Lenses) combine visible layers + filters + layout mode. Built-in lenses: Roadmap, Sprint, Implementation, Origin (trace upstream), Impact (trace downstream). Custom lenses user-definable. Rabbit-hole drilldown: click any node → see full vertical slice L0 through L5. `⌘K` command palette for search, navigation, and quick actions across all projects. See `14-user-flows.md` Flows 5, 19, 20.

### Time as a First-Class Citizen
Every view has a timeline scrubber. Scrub backward to see the exact state of your canvas, roadmap, or graph at any past moment. Playback mode animates the project evolving over time. Event-sourced data model with periodic snapshots for fast reconstruction. See `07-temporal-navigation.md`.

## File Index

### Milestones
- `01-milestone-1.md` — M1: Canvas + Connector (4 weeks)
- `02-milestone-2.md` — M2: Compilation Pipeline (6 weeks)
- `03-milestone-3.md` — M3: Code Reality Layer (4 weeks)

### Architecture
- `04-data-model.md` — Schema, Rust models, Zod schemas, event sourcing tables
- `05-claude-code-integration.md` — Export system, prompt compiler, BYO API keys for planning agents
- `06-deployment-modes.md` — Local/Docker/Supabase deployment, repo structure, open source
- `07-temporal-navigation.md` — Timeline scrubber, event sourcing, playback mode

### Engineering Operations
- `08-testing-strategy.md` — Test pyramid, CI pipeline, agent evals, coverage targets, fixtures
- `09-auth-security.md` — Auth per mode, API key encryption, threat model, OWASP, audit logging, data retention
- `10-docs-validation.md` — API docs, ADRs, component stories, user docs, feature validation registry
- `11-recurring-processes.md` — Background tasks, CI/CD cadence, code cleanup, release process, monitoring
- `12-project-onboarding.md` — Import from GitHub/Linear/Jira/Notion/Markdown/paste, Cartographer agent
- `13-multi-project-multi-repo.md` — Workspaces, multiple projects, multi-repo projects, cross-project features

### User-Facing
- `14-user-flows.md` — All user flows end-to-end: brain dump, compilation, export, onboarding, settings, temporal nav

### Execution
- `15-execution-plan.md` — 65 self-contained work packages with dependency DAG, parallelization waves, critical path analysis — designed for agent swarm execution
