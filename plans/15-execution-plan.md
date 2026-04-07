# Atlas — Agent Swarm Execution Plan

40 self-contained work packages with explicit dependency DAGs. A swarm scheduler picks up whatever has all deps met. Each WP is sized for one agent (~1-4 days).

**How to read this:** Give each agent its work package + the referenced architecture docs. The agent has everything it needs. The `depends_on` field tells the scheduler when a WP is unblocked.

---

## Dependency Graph (simplified)

```
WAVE 0 ─────────────────────────────────────────────────────────────
  WP-00 Foundation

WAVE 1 ─────────────────────────────────────────────────────────────
  WP-01 Canvas Layout        WP-02 Node Stores + Zod
  WP-03 PG/SQLite Adapters

WAVE 2 ─────────────────────────────────────────────────────────────
  WP-04 Rich Text       WP-05 Kanban View      WP-06 Provider Registry
  WP-07 Intent CRUD     WP-08 Project Switcher  WP-09 Import Tables
  WP-10 Brain Dump Import

WAVE 3 ─────────────────────────────────────────────────────────────
  WP-11 Canvas Interactions   WP-12 Edge Inference    WP-13 Graph View
  WP-14 Command Palette       WP-15 Event Sourcing    WP-16 Docker Compose
  WP-17 Cluster Detection     WP-18 Strategist Agent  WP-19 GitHub Scanner
  WP-20 Roadmap View

WAVE 4 ─────────────────────────────────────────────────────────────
  WP-21 Canvas Polish    WP-22 Connector Loop     WP-23 View Switcher
  WP-24 Timeline Scrubber WP-25 Synthesizer Agent  WP-26 Search+Filter
  WP-27 Keyboard Shortcuts WP-28 Local-First Sync  WP-29 Review+Accept UI
  WP-30 Historian Agent    WP-31 Epic Editor

WAVE 5 ─────────────────────────────────────────────────────────────
  WP-32 Compile-to-Epic   WP-33 Stale Detection    WP-34 AI Replanning
  WP-35 Incremental Sync  WP-36 Multi-Repo Wiring

WAVE 6 ─────────────────────────────────────────────────────────────
  WP-37 Phase Generation   WP-38 Round Table Mode
  WP-39 Lens Framework     WP-40 GitHub OAuth

WAVE 7 ─────────────────────────────────────────────────────────────
  WP-41 Phase UI           WP-42 Ticket Generation
  WP-43 Codebase Reader    WP-44 Origin+Impact Lenses
  WP-45 Linear Import      WP-46 Jira Import

WAVE 8 ─────────────────────────────────────────────────────────────
  WP-47 Ticket UI          WP-48 Export System Core
  WP-49 Branch+PR Linking  WP-50 Reviewer Agent
  WP-51 Provider Settings UI  WP-52 Notion Import

WAVE 9 ─────────────────────────────────────────────────────────────
  WP-53 Batch Export+Conductor  WP-54 PR Status Sync
  WP-55 Rabbit-Hole Drilldown   WP-56 Cross-Source Dedup
  WP-57 Agent Model Assignment  WP-58 Doc Generation

WAVE 10 ────────────────────────────────────────────────────────────
  WP-59 Custom Templates+Polish  WP-60 Playback Polish
  WP-61 Supabase Mode            WP-62 Final E2E+Perf
  WP-63 Security Audit           WP-64 Docs+Validation
```

---

## Work Packages

### WP-00: Project Scaffold + Data Model
**Effort:** 3 days | **Depends on:** nothing | **Priority:** CRITICAL PATH
**Refs:** `04-data-model.md`, `06-deployment-modes.md`

**Deliverables:**
- `frontend/`: SvelteKit 2 + Svelte 5 (runes) + TypeScript strict + Tailwind v4 + Bits UI
- `backend/`: Rust + Axum + tokio + SQLx (Cargo workspace)
- All 16 SQL migrations from `04-data-model.md` (workspace, project, node, node_edge, node_version, event, snapshot, repo, project_repo, pr, verification_report, agent_run, provider_config, export_log, import_source, import_mapping)
- `StorageAdapter` TypeScript interface in `frontend/src/lib/storage/adapter.ts`
- `IndexedDBAdapter` stub implementing that interface (Dexie.js)
- CI pipeline: `cargo fmt --check`, `cargo clippy`, `cargo test`, `pnpm lint`, `pnpm check`, `vitest`
- Auto-create default workspace + project on first run
- AGPLv3 LICENSE, CONTRIBUTING.md, CLAUDE.md

**Acceptance Criteria:**
- [ ] `pnpm dev` starts SvelteKit on :5173
- [ ] `cargo run` starts Axum on :3001
- [ ] `cargo test` passes (at least 1 migration test)
- [ ] `pnpm test` passes (at least 1 adapter test)
- [ ] CI pipeline runs green on push

---

### WP-01: Canvas Spatial Layout
**Effort:** 3 days | **Depends on:** WP-00 | **Priority:** CRITICAL PATH
**Refs:** `14-user-flows.md` Flow 3, Flow 5a

**Deliverables:**
- `frontend/src/lib/components/Canvas.svelte` — HTML/CSS-transform infinite canvas
- Pan: mouse drag + trackpad scroll
- Zoom: pinch + scroll wheel with smooth animation
- `NoteCard.svelte` — renders title, type badge, body preview, color by type
- Notes placed at click position
- Grid snapping (toggleable via setting)
- Canvas background (dots/grid pattern)

**Acceptance Criteria:**
- [ ] Canvas renders 50+ notes without jank
- [ ] Pan and zoom are smooth (no CSS transition artifacts)
- [ ] Notes display at correct spatial positions
- [ ] Double-click creates a note at cursor position

---

### WP-02: Node CRUD Stores + Zod Schemas
**Effort:** 3 days | **Depends on:** WP-00 | **Priority:** CRITICAL PATH
**Refs:** `04-data-model.md` (payload schemas), `06-deployment-modes.md` (StorageAdapter)

**Deliverables:**
- Svelte 5 rune-based store in `frontend/src/lib/stores/nodes.ts`: `$state` node map, `$derived` filtered views
- Zod schemas for all node type payloads (canvas note, intent, epic, phase, ticket)
- Full CRUD through `StorageAdapter` → `IndexedDBAdapter`
- `IndexedDBAdapter` fully implemented (Dexie.js: node, node_edge, node_version tables)
- Optimistic updates: write to store → persist to IndexedDB
- TanStack Query Svelte adapter wired (for future server sync)
- Rust CRUD API routes: `GET/POST /api/nodes`, `GET/PATCH/DELETE /api/nodes/:id`, `GET/POST /api/nodes/:id/edges`

**Acceptance Criteria:**
- [ ] Create, read, update, delete nodes via store
- [ ] Data persists across page reload (IndexedDB)
- [ ] Zod validation rejects invalid payloads with correct errors
- [ ] Rust API routes return correct responses (tested with cargo test)
- [ ] ≥90% unit test coverage on stores + adapters

---

### WP-03: PostgreSQL + SQLite Storage Adapters
**Effort:** 2 days | **Depends on:** WP-00 | **Priority:** HIGH
**Refs:** `06-deployment-modes.md` (Architecture: Two-Layer Storage)

**Deliverables:**
- `ApiAdapter` in `frontend/src/lib/storage/api.ts` — calls Rust REST API
- Rust SQLx queries for all node/edge/version CRUD (compile-time checked)
- SQLite feature flag: `#[cfg(feature = "sqlite")]` with adapted schema
- WebSocket endpoint `/ws` for realtime push (Axum + tokio-tungstenite)
- `DATABASE_URL` env var for Rust connection

**Acceptance Criteria:**
- [ ] `ApiAdapter` passes same test suite as `IndexedDBAdapter`
- [ ] Rust backend serves CRUD over REST correctly
- [ ] SQLite mode compiles and passes tests via `cargo test --features sqlite`
- [ ] WebSocket connects and receives node change events

---

### WP-04: Rich Text Editor in Notes
**Effort:** 2 days | **Depends on:** WP-02 | **Priority:** HIGH
**Refs:** `14-user-flows.md` Flow 3

**Deliverables:**
- TipTap editor via `svelte-tiptap` embedded in `NoteCard.svelte`
- Inline editing on double-click, blur to save
- Markdown shortcuts: headings, lists, bold, italic, code blocks
- Note type selector: dropdown of 12 types with icons + colors
- Type-specific color coding on note card borders/headers

**Acceptance Criteria:**
- [ ] Double-click note → editor active with cursor
- [ ] Markdown shortcuts work (type `# ` → heading, `- ` → bullet)
- [ ] Type selector changes note type and persists
- [ ] Rich text body saved as TipTap JSON in `node.body`

---

### WP-05: Kanban View
**Effort:** 2 days | **Depends on:** WP-01, WP-02 | **Priority:** MEDIUM
**Refs:** `14-user-flows.md` Flow 5c

**Deliverables:**
- `KanbanView.svelte` — columns grouped by note type
- 12 columns (collapsible), drag notes between columns (changes type)
- Card: title, body preview, edge count badge
- Column counts, empty column placeholder

**Acceptance Criteria:**
- [ ] All note types have a column
- [ ] Dragging a note to a different column changes its type
- [ ] Column counts update in real-time
- [ ] Works with same data as canvas (shared store)

---

### WP-06: Provider Registry + Connector Classifier
**Effort:** 3 days | **Depends on:** WP-02 | **Priority:** CRITICAL PATH
**Refs:** `05-claude-code-integration.md` (Provider Registry), `14-user-flows.md` Flow 3-4

**Deliverables:**
- `ProviderRegistry` in Rust (`backend/src/ai/registry.rs`): capability-based routing
- `ModelProvider` trait + `AnthropicProvider`, `OpenAIProvider` implementations
- `callModel()` abstraction: provider-agnostic, reads API keys from env or `provider_config` table
- TypeScript mirror `frontend/src/lib/agents/providers.ts` (for Mode A browser-only)
- Connector classifier: given note text → return `{ type, confidence }`
- Classifier prompt template with structured JSON output
- Batch classification: queue unclassified notes, process in batches of 10
- Fallback to "note" type if LLM fails
- `agent_run` logging for every invocation
- Eval harness: 50 sample notes, assert ≥85% accuracy

**Acceptance Criteria:**
- [ ] `callModel(Capability::Classification, ...)` routes to correct provider
- [ ] Classifier returns valid note type + confidence for free text
- [ ] Batch classification processes 20 notes in <10s
- [ ] Eval suite passes ≥85% accuracy threshold
- [ ] Missing API key → graceful degradation (notes stay unclassified)

---

### WP-07: Intent CRUD + Linking
**Effort:** 2 days | **Depends on:** WP-02 | **Priority:** HIGH
**Refs:** `14-user-flows.md` Flow 8, `04-data-model.md` (intent payload)

**Deliverables:**
- Intent node CRUD (type='intent', layer=4)
- Status lifecycle: active → paused → achieved → abandoned
- Link canvas notes to intents (manual edge creation)
- Link epics under intents (parent_id)
- Orphan detection: flag epics with no parent intent
- Intent list view in sidebar

**Acceptance Criteria:**
- [ ] Create/edit/delete intents with name, target outcome, deadline, status
- [ ] Notes can be linked to intents via edge
- [ ] Orphan epic detection surfaces unlinked epics
- [ ] Status transitions work correctly

---

### WP-08: Multi-Project UI
**Effort:** 3 days | **Depends on:** WP-00 | **Priority:** HIGH
**Refs:** `13-multi-project-multi-repo.md`, `14-user-flows.md` Flow 14

**Deliverables:**
- Project CRUD: create, rename, archive, delete (soft)
- Project switcher in sidebar + `⌘K` integration
- `⌘1`/`⌘2`/`⌘3` quick-switch for recent projects
- Project color coding across all views (note cards, edges, graph nodes)
- Global Pool view: unassigned notes, drag-to-assign to a project
- Cross-project search: `⌘K` finds nodes across all projects with project badge

**Acceptance Criteria:**
- [ ] Create 3 projects, switch between them
- [ ] Each project has independent canvas/node data
- [ ] Notes in Global Pool can be dragged to a project
- [ ] Search finds nodes across projects with correct project badges
- [ ] Project switcher hidden when only 1 project exists

---

### WP-09: Import Source Tables + API
**Effort:** 1 day | **Depends on:** WP-00 | **Priority:** MEDIUM
**Refs:** `12-project-onboarding.md` (Data Model Additions)

**Deliverables:**
- Rust CRUD API for `import_source` and `import_mapping` tables
- `GET/POST /api/projects/:id/imports` — list/create import sources
- `GET /api/imports/:id/mappings` — list imported entity mappings
- Frontend types + Zod schemas for import_source and import_mapping

**Acceptance Criteria:**
- [ ] Import sources can be created and listed per project
- [ ] Import mappings track external_id → node_id relationship
- [ ] API routes tested with cargo test

---

### WP-10: Brain Dump (Paste) Import
**Effort:** 2 days | **Depends on:** WP-06, WP-09 | **Priority:** MEDIUM
**Refs:** `12-project-onboarding.md` (Brain Dump), `14-user-flows.md` Flow 13d

**Deliverables:**
- `⌘K` → "Import from paste" or `⌘V` on canvas with multi-paragraph text
- Single LLM call: text → structured JSON array of `{ text, type, related_to[] }`
- Create one note per extracted thought, classify each
- Infer edges from `related_to` field
- Preview split before confirming
- Records import_source (type='paste') and import_mappings

**Acceptance Criteria:**
- [ ] Pasting 5 paragraphs creates 5+ classified notes
- [ ] Notes placed on canvas with reasonable spacing
- [ ] Inferred edges connect related notes
- [ ] User can review split before confirming

---

### WP-11: Canvas Interactions
**Effort:** 3 days | **Depends on:** WP-01 | **Priority:** HIGH
**Refs:** `14-user-flows.md` Flow 3

**Deliverables:**
- Multi-select: shift-click individual notes, box-select with drag
- Drag to reposition selected notes (with snap-to-grid)
- Draw edges manually: drag from edge handle on note to another note
- Delete notes/edges: Backspace key, with undo
- Undo/redo stack: custom Svelte store tracking operations with full history
- Right-click context menu: delete, change type, change color

**Acceptance Criteria:**
- [ ] Box-select works, selected notes highlighted
- [ ] Drag-to-reposition moves all selected notes
- [ ] Edge drawing connects two notes visually and in store
- [ ] Undo reverses last 20 operations, redo restores them
- [ ] Backspace deletes selected notes with undo support

---

### WP-12: Edge Inference (Connector)
**Effort:** 2 days | **Depends on:** WP-06 | **Priority:** HIGH
**Refs:** `14-user-flows.md` Flow 4

**Deliverables:**
- Pairwise comparison: given two notes → infer relation type + weight
- Smart batching: only compare new notes against recent (last 50) notes
- Relation types: supports, contradicts, blocks, implements, duplicates, refines
- Write inferred edges to `node_edge` with `source='ai'`, `weight` = confidence
- AI edges rendered as dashed lines, human edges as solid
- Hover edge → tooltip with type + confidence
- Click edge → confirm, change type, or dismiss (dismissed never reappear)

**Acceptance Criteria:**
- [ ] New note triggers edge inference within 5s
- [ ] Inferred edges have correct relation types (eval: ≥75% precision)
- [ ] AI edges visually distinct from human edges
- [ ] Dismissed edges don't reappear

---

### WP-13: Graph View
**Effort:** 3 days | **Depends on:** WP-01, WP-02 | **Priority:** MEDIUM
**Refs:** `14-user-flows.md` Flow 5b

**Deliverables:**
- `GraphView.svelte` using Svelvet or d3-force with custom Svelte wrapper
- Nodes = compact note cards, edges = styled by relation_type
- Force-directed layout via d3-force (or Svelvet built-in)
- Click node → highlight connected subgraph
- Filter by note type, layer, or project
- Shared selection state via Svelte context (selecting in graph highlights in canvas)

**Acceptance Criteria:**
- [ ] 100 nodes + 200 edges render and settle layout in <2s
- [ ] Click node highlights it across all views
- [ ] Filter by type shows/hides correct nodes
- [ ] Edges styled differently per relation_type

---

### WP-14: Command Palette
**Effort:** 2 days | **Depends on:** WP-01, WP-02 | **Priority:** HIGH
**Refs:** `14-user-flows.md` Flow 20

**Deliverables:**
- `CommandPalette.svelte` — `⌘K` to open
- Commands: new note, switch view, search nodes, change note type, delete, undo/redo, switch project
- Fuzzy search over command names + node titles (across all projects)
- Recent commands list (persisted in localStorage)
- Results: node title, type badge, project badge, layer indicator

**Acceptance Criteria:**
- [ ] `⌘K` opens palette, typing filters results
- [ ] "New note" command creates a note
- [ ] Searching node titles finds results across projects
- [ ] Recent commands persist across sessions

---

### WP-15: Event Sourcing Foundation
**Effort:** 3 days | **Depends on:** WP-02 | **Priority:** CRITICAL PATH
**Refs:** `07-temporal-navigation.md` (Data Model, Snapshots)

**Deliverables:**
- Every node/edge CRUD writes an `event` record (before_state, after_state, actor, event_type)
- Event types: node.created, node.updated, node.deleted, edge.created, edge.deleted, node.reclassified
- IndexedDB event storage for Mode A
- Rust API: `POST /api/events` (automatic on CRUD), `GET /api/projects/:id/events?from=&to=`
- `GraphState` type: full snapshot of nodes + edges at a point in time
- Reconstruction: find nearest snapshot → replay events forward → return GraphState
- Snapshot generation: every 100 events (browser) or hourly (Rust tokio task)
- Rust API: `GET /api/projects/:id/state?at=<timestamp>`

**Acceptance Criteria:**
- [ ] Every CRUD operation produces a correct event with before/after state
- [ ] `GET /state?at=<timestamp>` returns correct graph for any past time
- [ ] Reconstruction from snapshot + 500 events takes <200ms
- [ ] Snapshots created automatically at configured intervals

---

### WP-16: Docker Compose (Mode B)
**Effort:** 1 day | **Depends on:** WP-03 | **Priority:** MEDIUM
**Refs:** `06-deployment-modes.md` (Setup Commands)

**Deliverables:**
- `docker-compose.yml`: atlas-frontend + atlas-backend + postgres
- Multi-stage `Dockerfile.backend`: build → slim runtime (~20MB)
- `Dockerfile.frontend`: SvelteKit Node adapter
- `.env.example` with all config vars
- Seed script with demo data (5 notes, 1 project)

**Acceptance Criteria:**
- [ ] `docker compose up` → full stack running in <60s (pre-built)
- [ ] Frontend connects to Rust API, data persists in PG
- [ ] `docker compose down && docker compose up` → data still there

---

### WP-17: Cluster Detection
**Effort:** 2 days | **Depends on:** WP-06, WP-12 | **Priority:** CRITICAL PATH
**Refs:** `14-user-flows.md` Flow 6

**Deliverables:**
- Algorithm: semantic similarity (embeddings via Embedding capability) + shared edges + temporal co-occurrence
- Group notes into candidate clusters (3-15 notes each)
- Side rail notification: "7 notes look like one feature — Review cluster"
- Cluster preview panel: list of notes, AI-drafted title + summary
- Contradiction detection: "Note A says X, Note B says the opposite"
- Duplicate detection: "This note from 2 weeks ago says the same thing"
- User actions: accept cluster, edit (add/remove notes), dismiss, split

**Acceptance Criteria:**
- [ ] 20 related notes produce 2-4 meaningful clusters
- [ ] Cluster titles are descriptive and accurate
- [ ] Contradictions flagged when present
- [ ] Accepted cluster gets visual group on canvas (dashed border)

---

### WP-18: Strategist Agent
**Effort:** 2 days | **Depends on:** WP-07, WP-06 | **Priority:** MEDIUM
**Refs:** `14-user-flows.md` Flow 15a

**Deliverables:**
- Analyze Intent layer: blocked intents, stale intents (no activity >2 weeks), contradictions
- Side rail suggestions: "Intent X is blocked by unresolved Question Y"
- "What if" analysis: "What changes if I drop Intent X?" → show downstream impact
- AgentRun logging + eval harness (5 golden scenarios)

**Acceptance Criteria:**
- [ ] Stale intents detected and surfaced
- [ ] Blocked intent chains identified correctly
- [ ] "What if" analysis returns coherent impact summary

---

### WP-19: GitHub Scanner + Cartographer
**Effort:** 3 days | **Depends on:** WP-06, WP-09 | **Priority:** HIGH
**Refs:** `12-project-onboarding.md` (GitHub), `14-user-flows.md` Flow 13a

**Deliverables:**
- `GitHubScanner` in Rust: fetch commits (1000), PRs (500), branches, file tree, README + docs
- Cartographer agent: classify PRs → Tickets, group by semantic similarity → Epics, infer Intents from release tags/milestones
- PR body parsing: extract decisions, constraints, references as Canvas notes
- Commit message mining: conventional commits → typed notes
- Synthetic event backfill: create events dated to original PR/commit timestamps

**Acceptance Criteria:**
- [ ] Scanning a 500-PR repo completes in <2 minutes
- [ ] PRs correctly classified into tickets with status based on merge state
- [ ] Semantic grouping produces reasonable epic candidates
- [ ] Synthetic events enable timeline scrubber for pre-Atlas history

---

### WP-20: Roadmap View
**Effort:** 3 days | **Depends on:** WP-07, WP-01 | **Priority:** HIGH
**Refs:** `14-user-flows.md` Flow 5d, Flow 8

**Deliverables:**
- `RoadmapView.svelte` — Gantt-style or swim-lane layout
- X-axis: time, Y-axis: Intents
- Child Epics shown as blocks under their parent Intent
- Status color coding: active=blue, paused=gray, achieved=green, abandoned=red
- Drag to reorder or reschedule intents/epics
- Filter by project (for unified cross-project roadmap)

**Acceptance Criteria:**
- [ ] Intents render on timeline with correct date ranges
- [ ] Epics appear as blocks under their parent intent
- [ ] Drag to reschedule updates dates
- [ ] Cross-project view shows all projects' intents

---

### WP-21: Canvas Polish + Perf
**Effort:** 2 days | **Depends on:** WP-11 | **Priority:** MEDIUM

**Deliverables:**
- 60fps pan/zoom with virtualization (only render visible notes)
- Minimap in corner showing full canvas extent
- Smooth animations on note creation/deletion (fade in/out)
- Responsive: works at 1024px+ width

**Acceptance Criteria:**
- [ ] 500 notes on canvas: 60fps pan/zoom
- [ ] Minimap shows correct positions
- [ ] Creating a note animates smoothly

---

### WP-22: Connector Background Loop
**Effort:** 1 day | **Depends on:** WP-12 | **Priority:** HIGH

**Deliverables:**
- Polling loop: watch for new/updated notes, queue classification + edge inference
- Re-classify notes whose body changed significantly since last classification
- Prune low-confidence edges (<0.3) over time
- Rate limiting: configurable max N LLM calls per minute
- Cost tracking: write to `agent_run` table after each call

**Acceptance Criteria:**
- [ ] New unclassified notes get classified within 60s
- [ ] Body edits trigger reclassification
- [ ] Rate limit prevents runaway API costs
- [ ] Cost tracking is accurate per run

---

### WP-23: View Switcher + Shared Selection
**Effort:** 1 day | **Depends on:** WP-05, WP-13 | **Priority:** MEDIUM

**Deliverables:**
- Tab bar: Canvas | Kanban | Graph | Roadmap (roadmap hidden until intents exist)
- `⌘1`/`⌘2`/`⌘3`/`⌘4` to switch views
- Shared selection: selecting a node in one view highlights it in others (via Svelte context)
- Persist last-used view per project in localStorage

**Acceptance Criteria:**
- [ ] Clicking tab switches view, data is same in all views
- [ ] Selecting note in graph highlights it in kanban
- [ ] View preference persists across page reloads

---

### WP-24: Timeline Scrubber + View Integration
**Effort:** 3 days | **Depends on:** WP-15, WP-13 | **Priority:** HIGH
**Refs:** `07-temporal-navigation.md` (Frontend), `14-user-flows.md` Flow 16

**Deliverables:**
- `TimelineScrubber.svelte`: range slider from project creation → now
- Event markers on track: epic compiled, phase generated, PR merged, etc.
- Controls: play/pause, step-back (prev significant event), step-forward, go-live
- Speed selector: 0.5x, 1x, 5x, 1min/s, 1hr/s, 1day/s
- `TemporalContext` via Svelte context — shared across all views
- All views (canvas, kanban, graph, roadmap) read from `temporal.graphState`
- When `isLive=true`: zero overhead (reference to live store)
- When scrubbing: reconstructed state from WP-15, read-only with visual indicator
- Manual annotations: user can add "This is when we pivoted" markers

**Acceptance Criteria:**
- [ ] Scrubbing backward shows notes disappearing, edges changing
- [ ] Scrubbing forward shows notes reappearing
- [ ] Play mode animates project evolution at selected speed
- [ ] Step-back/forward jumps between significant events
- [ ] All 4 views correctly render temporal state

---

### WP-25: Synthesizer Agent
**Effort:** 2 days | **Depends on:** WP-17 | **Priority:** CRITICAL PATH

**Deliverables:**
- Given a cluster → draft epic proposal: title, one-paragraph summary, key decisions
- Surface contradictions within cluster
- Surface duplicates across clusters and time
- Passive: suggestions in side rail, never interrupt
- AgentRun logging + eval harness (20 golden cluster → epic inputs, rubric score ≥3.5)

**Acceptance Criteria:**
- [ ] Cluster of 7 notes → coherent epic proposal
- [ ] Contradictions correctly identified
- [ ] Eval suite passes threshold

---

### WP-26: Search + Filter
**Effort:** 2 days | **Depends on:** WP-02 | **Priority:** MEDIUM

**Deliverables:**
- Full-text search across note titles and bodies (lunr.js for Mode A, PG tsvector for Mode B/C)
- Filter by: type, date range, status, layer, project
- Results highlight in current view (canvas: scroll to + pulse, kanban: scroll to column)
- Integrate into command palette search

**Acceptance Criteria:**
- [ ] Search finds notes by title and body content
- [ ] Filters narrow results correctly
- [ ] Clicking a result navigates to it in the current view

---

### WP-27: Keyboard Shortcuts
**Effort:** 1 day | **Depends on:** WP-14 | **Priority:** LOW

**Deliverables:**
- Full shortcut map: N=new note, D=delete, 1/2/3/4=switch view, /=search, Z=undo, ⇧Z=redo
- Vim-style: j/k to navigate between notes, Enter to edit, Esc to deselect
- `?` to toggle shortcut cheat sheet overlay
- Shortcut registration system (avoid conflicts)

**Acceptance Criteria:**
- [ ] All shortcuts work from canvas view
- [ ] Cheat sheet shows all shortcuts
- [ ] No shortcut conflicts with browser defaults

---

### WP-28: Local-First Sync Engine
**Effort:** 2 days | **Depends on:** WP-02, WP-03 | **Priority:** MEDIUM

**Deliverables:**
- Sync queue: buffer pending changes → batch POST to Rust API (Mode B/C)
- Offline detection: show indicator bar, queue changes
- Conflict resolution: last-write-wins with timestamp
- Mode detection: auto-select adapter based on `PUBLIC_SUPABASE_URL` / `PUBLIC_API_URL` / neither

**Acceptance Criteria:**
- [ ] Go offline → create notes → go online → notes sync
- [ ] Conflict resolution picks most recent write
- [ ] Mode detection selects correct adapter without user config

---

### WP-29: Review & Accept UI (Onboarding)
**Effort:** 2 days | **Depends on:** WP-19 | **Priority:** HIGH
**Refs:** `12-project-onboarding.md` (Review & Accept), `14-user-flows.md` Flow 13a

**Deliverables:**
- Preview proposed graph: nodes colored by source (GitHub=purple, Linear=blue, etc.)
- Confidence scores visible on each node
- Edit before import: reclassify, merge, split, delete, add/remove edges
- Low-confidence nodes highlighted for attention
- Accept → commit entire graph + backfill synthetic events
- Timeline scrubber immediately works for historical data

**Acceptance Criteria:**
- [ ] Proposed graph renders with source colors and confidence scores
- [ ] User can reclassify, merge, split nodes before import
- [ ] Accept commits graph and backfills events
- [ ] Timeline scrubber shows pre-import history

---

### WP-30: Historian Agent
**Effort:** 2 days | **Depends on:** WP-18, WP-15 | **Priority:** MEDIUM
**Refs:** `14-user-flows.md` Flow 15b

**Deliverables:**
- "Why does this exist?" context menu on any node
- Graph walk: ticket → phase → epic → intent → canvas notes (full provenance chain)
- Decision log per Intent: auto-generated from Decision-typed canvas notes
- Provenance panel: timeline of how this node evolved (from event log)

**Acceptance Criteria:**
- [ ] Click "Why" on a ticket → shows full upstream chain
- [ ] Decision log shows all Decision-typed notes linked to an intent
- [ ] Provenance panel shows creation, edits, reclassifications over time

---

### WP-31: Epic Spec Editor
**Effort:** 3 days | **Depends on:** WP-04 | **Priority:** CRITICAL PATH
**Refs:** `14-user-flows.md` Flow 9

**Deliverables:**
- `EpicEditor.svelte` — structured doc with TipTap sections: PRD, Tech Plan, Open Questions, Decision Log
- Each section is an independent TipTap editor instance
- Sidebar: linked canvas notes (clickable → navigate), constraints, risks
- Version history tab (reads from `node_version` table, diff between any two versions)
- Clarification dialogue: AI asks questions about the epic (scoped chat)
- Answers auto-fold into PRD or Tech Plan sections
- Questions can be marked resolved or deferred

**Acceptance Criteria:**
- [ ] Epic editor renders all 4 sections with TipTap
- [ ] Editing a section saves to node.payload
- [ ] Sidebar shows linked source canvas notes
- [ ] Version history shows all edits with diffs
- [ ] AI clarification asks relevant questions and folds answers

---

### WP-32: Compile-to-Epic Flow
**Effort:** 2 days | **Depends on:** WP-25, WP-31 | **Priority:** CRITICAL PATH
**Refs:** `14-user-flows.md` Flow 7

**Deliverables:**
- "Compile to Epic" button on accepted cluster cards
- Preview screen: left=source notes (read-only), right=AI-drafted epic
- AI drafts: PRD, Tech Plan, Open Questions, Decision Log (from Decision-typed notes)
- Accept → creates L3 Epic node linked to all source canvas notes via edges
- Edit → inline editing before accepting
- Reject → dismiss, can re-trigger later
- Writes `compile.epic_from_cluster` event

**Acceptance Criteria:**
- [ ] Compile produces a well-structured epic from 5-10 canvas notes
- [ ] Source notes are linked via edges (relation_type: 'implements')
- [ ] Accept/edit/reject flow works correctly
- [ ] Event recorded for timeline scrubber

---

### WP-33: Stale Detection + Re-sync
**Effort:** 1 day | **Depends on:** WP-32 | **Priority:** MEDIUM

**Deliverables:**
- When a source canvas note changes → epic gets orange "Stale" badge
- Click stale badge → diff view: current epic vs AI re-derived version
- Accept changes per-section or dismiss
- Background check every 5 minutes

**Acceptance Criteria:**
- [ ] Editing a canvas note that feeds into an epic marks epic as stale
- [ ] Diff view shows meaningful differences
- [ ] Accept updates the epic sections

---

### WP-34: AI Re-planning
**Effort:** 2 days | **Depends on:** WP-20, WP-18 | **Priority:** MEDIUM
**Refs:** `14-user-flows.md` Flow 8a

**Deliverables:**
- "Re-derive next N weeks" button on roadmap view
- Input: new constraints (text box) + current intents/epics
- Strategist agent proposes re-arrangement with rationale
- Accept/edit/reject flow (same pattern as compile-to-epic)
- Writes `compile.replan` event with before/after state

**Acceptance Criteria:**
- [ ] Re-planning produces coherent restructured roadmap
- [ ] Rationale explains why each change was made
- [ ] Before/after recorded in event log

---

### WP-35: Incremental Sync + Markdown Import
**Effort:** 2 days | **Depends on:** WP-29 | **Priority:** MEDIUM

**Deliverables:**
- "Sync from GitHub" button: import new PRs/commits since `import_source.last_synced`
- Uses `sync_cursor` for pagination
- Markdown folder import: parse headings → structure, bullets → notes, blockquotes → decisions
- Deduplication: embedding similarity + cross-references + file path overlap
- Review & accept flow (reuses WP-29 UI)

**Acceptance Criteria:**
- [ ] Re-sync imports only new PRs (not duplicating existing)
- [ ] Markdown folder with 10 files produces classified notes
- [ ] Duplicates detected with >85% embedding similarity

---

### WP-36: Multi-Repo Wiring
**Effort:** 3 days | **Depends on:** WP-08 | **Priority:** HIGH
**Refs:** `13-multi-project-multi-repo.md`

**Deliverables:**
- Repo management UI: connect repos (GitHub URL or local path), assign to projects, set primary
- `project_repo` join table wired to all CRUD queries
- Repo badge on node cards (for tickets scoped to specific repo)
- Cross-repo edges in Graph view (styled: dashed + repo color)
- File-level plans reference `{ repoId, path }` in ticket payload

**Acceptance Criteria:**
- [ ] Project can have 3 repos linked, 1 marked primary
- [ ] Same repo can be in multiple projects
- [ ] Ticket cards show repo badge
- [ ] Graph view shows cross-repo edges with distinct style

---

### WP-37: Phase Generation (Architect Agent)
**Effort:** 3 days | **Depends on:** WP-32 | **Priority:** CRITICAL PATH
**Refs:** `14-user-flows.md` Flow 10

**Deliverables:**
- Architect agent: given Epic → propose 2-5 ordered Phases
- Each phase: objective, file-level change list, arch notes, verification criteria, complexity estimate
- Context bundle: upstream Intent + Epic + relevant canvas notes
- Mock codebase mode for testing (fixture directory)
- Eval harness: 10 golden epic → phase inputs, ≥80% pass rate
- Writes `compile.phases_from_epic` event

**Acceptance Criteria:**
- [ ] Epic with PRD + Tech Plan → 2-5 well-ordered phases
- [ ] Each phase has meaningful file-level change lists
- [ ] Dependency ordering is correct (foundational phases first)
- [ ] Eval suite passes threshold

---

### WP-38: Round Table Mode
**Effort:** 2 days | **Depends on:** WP-30, WP-37 | **Priority:** LOW
**Refs:** `14-user-flows.md` Flow 15c

**Deliverables:**
- `⌘K` → "Ask all agents" → type a question
- Each agent responds from its perspective: Strategist (roadmap impact), Architect (code impact), Historian (origin context), Reviewer (open PRs)
- Multi-column or tabbed view for responses
- Example: "Should we kill module X?"

**Acceptance Criteria:**
- [ ] Question routed to all agents, responses displayed
- [ ] Each response reflects the agent's domain
- [ ] Works with at least 3 active agents

---

### WP-39: Lens Framework
**Effort:** 2 days | **Depends on:** WP-02 | **Priority:** MEDIUM
**Refs:** `14-user-flows.md` Flow 19

**Deliverables:**
- Lens = saved query: visible layers + filters + layout mode
- Built-in lenses: Roadmap (L4+L3, timeline), Sprint (L2+L1, kanban), Implementation (L1, grouped by repo)
- Custom lens creation: UI to pick layers, filters, layout → save with name
- Lens switcher in top nav
- Persist lenses per workspace

**Acceptance Criteria:**
- [ ] Built-in lenses show correct subsets of data
- [ ] Custom lens can be created, saved, and recalled
- [ ] Lens switcher works from any view

---

### WP-40: GitHub OAuth + Repo Binding
**Effort:** 3 days | **Depends on:** WP-36 | **Priority:** HIGH
**Refs:** `14-user-flows.md` Flow 18

**Deliverables:**
- GitHub App registration (dev + prod) with minimum permissions
- OAuth flow: install app → grant repo access → store `install_id` in `repo` table
- Rust GitHub client via `octocrab` with token refresh
- Webhook receiver: `POST /api/webhooks/github` with HMAC-SHA256 verification
- Wire repos to projects via `project_repo`

**Acceptance Criteria:**
- [ ] OAuth flow completes, repo appears in project settings
- [ ] Webhook HMAC verification rejects invalid signatures
- [ ] Token refresh works transparently
- [ ] Repo binds to project and shows in UI

---

### WP-41: Phase UI
**Effort:** 2 days | **Depends on:** WP-37 | **Priority:** HIGH

**Deliverables:**
- Phase list under each Epic (ordered by dependency)
- Drag to reorder, merge two phases, split one phase
- Insert phase between existing → Architect re-derives downstream context
- Status workflow: ready-for-ticketing → in-progress → in-review → done
- Phase detail panel: objective, file changes, context bundle, verification criteria

**Acceptance Criteria:**
- [ ] Phases render in order under epic
- [ ] Drag reorder updates parent_id ordering
- [ ] Status transitions work
- [ ] Phase detail shows all fields

---

### WP-42: Ticket Generation (Decomposer Agent)
**Effort:** 3 days | **Depends on:** WP-37 | **Priority:** CRITICAL PATH
**Refs:** `14-user-flows.md` Flow 11

**Deliverables:**
- Decomposer agent: given Phase → generate 3-10 tickets
- Each ticket: title, intent paragraph, file paths (`RepoFilePath[]`), acceptance criteria, prompt payload
- Context bundle compilation: walk upstream ticket → phase → epic → intent → canvas notes
- Recommended agent field (Claude Code / Cursor / Codex)
- Target repo (from phase's file change list, or user override)
- Eval harness: 15 golden phase → ticket inputs, ≥80% pass rate
- Writes `compile.tickets_from_phase` event

**Acceptance Criteria:**
- [ ] Phase with 3 file changes → 3-5 well-scoped tickets
- [ ] Each ticket has complete acceptance criteria
- [ ] Prompt payload includes full upstream context
- [ ] Eval suite passes threshold

---

### WP-43: Codebase Reader (GitHub)
**Effort:** 2 days | **Depends on:** WP-40 | **Priority:** HIGH

**Deliverables:**
- Fetch file tree via GitHub API (recursive tree endpoint)
- Fetch file contents on demand
- Cache file tree in memory, invalidate on webhook `push` events
- Architect agent reads real repo files instead of mock codebase
- File-level plans reference actual paths from the repo

**Acceptance Criteria:**
- [ ] File tree fetched for connected repos
- [ ] Architect generates phases with real file paths
- [ ] Cache invalidated on new push (webhook tested)

---

### WP-44: Origin + Impact Lenses
**Effort:** 2 days | **Depends on:** WP-39 | **Priority:** MEDIUM
**Refs:** `14-user-flows.md` Flow 19

**Deliverables:**
- **Origin lens:** select any node → walk all parent/source edges upward → vertical tree
- **Impact lens:** select any node → walk all child/target edges downward → tree + aggregate stats
- Highlight traversal path in graph view
- Aggregate stats on impact lens: N tickets, M PRs, K files changed

**Acceptance Criteria:**
- [ ] Origin lens: ticket traces back to canvas notes through full chain
- [ ] Impact lens: canvas note traces forward to all downstream nodes
- [ ] Traversal path highlighted in graph view

---

### WP-45: Linear Import
**Effort:** 2 days | **Depends on:** WP-29 | **Priority:** MEDIUM
**Refs:** `12-project-onboarding.md` (Linear)

**Deliverables:**
- Linear OAuth connection flow
- GraphQL query: projects, cycles, issues, documents, comments
- Mapping: Project→Intent, Issue(done)→Ticket, Issue(backlog)→Canvas note, Document→Epic
- Preserve labels as tags, comments as Decision/Question notes
- Reuse Review & Accept UI from WP-29

**Acceptance Criteria:**
- [ ] OAuth flow connects to Linear workspace
- [ ] 50 issues imported with correct layer classification
- [ ] Labels preserved, comments extracted as notes

---

### WP-46: Jira Import
**Effort:** 2 days | **Depends on:** WP-29 | **Priority:** MEDIUM
**Refs:** `12-project-onboarding.md` (Jira)

**Deliverables:**
- Jira OAuth 2.0 or API token connection
- REST API v3: epics, stories, tasks, sprints, comments
- Mapping: Epic→Epic, Story(done)→Ticket, Sprint→Phase, Comment→Canvas notes
- Handle custom fields (best-effort)
- Reuse Review & Accept UI

**Acceptance Criteria:**
- [ ] Connection via OAuth or API token
- [ ] Jira project with 100 issues imports correctly
- [ ] Custom fields imported where mappable

---

### WP-47: Ticket UI
**Effort:** 2 days | **Depends on:** WP-42 | **Priority:** HIGH

**Deliverables:**
- Ticket cards under each Phase: title, file paths, status, complexity, repo badge
- Ticket detail panel: full prompt payload, acceptance criteria checklist (toggleable)
- Status lifecycle: open → exported → in-progress → in-review → done → verified
- Ticket card actions: copy command, download CLAUDE.md, view context (links to WP-48)

**Acceptance Criteria:**
- [ ] Ticket cards render under phase
- [ ] Detail panel shows full prompt payload
- [ ] Status transitions work
- [ ] Repo badge shows correct repo

---

### WP-48: Export System Core
**Effort:** 3 days | **Depends on:** WP-42 | **Priority:** CRITICAL PATH
**Refs:** `05-claude-code-integration.md` (full spec), `14-user-flows.md` Flow 12

**Deliverables:**
- `PromptCompiler` in Rust (`backend/src/export/prompt.rs`): walks ticket → phase → epic → intent → canvas notes
- Context bundling rules per `05-claude-code-integration.md` (always: AC + phase + epic summary; conditionally: tech plan + source notes)
- **"Copy Command"** button → clipboard: `cd <repo-dir> && claude --print "..."`
- **"Download CLAUDE.md"** → markdown file with full context
- Multi-repo aware: command includes correct `cd` for ticket's target repo
- Export event written to `export_log` table
- Keyboard shortcut: `⌘⇧C` on selected ticket

**Acceptance Criteria:**
- [ ] Copy Command produces a valid `claude --print` command with full context
- [ ] CLAUDE.md contains intent, files, AC, upstream context, branch convention
- [ ] Multi-repo tickets include correct `cd <repo-dir>`
- [ ] Export logged in export_log table

---

### WP-49: Branch + PR Linking
**Effort:** 3 days | **Depends on:** WP-40, WP-47 | **Priority:** HIGH
**Refs:** `14-user-flows.md` Flow 18

**Deliverables:**
- Branch convention: `atlas/<project-slug>/<ticket-id>-<slug>`
- GitHub webhook: `create` event → parse ticket ID → auto-link → ticket status: "in-progress"
- PR opened for Atlas branch → auto-populate PR body (ticket spec + context + AC checklist)
- GitHub API: PATCH PR body with rendered template
- Multi-repo: scans all project repos for matching branches

**Acceptance Criteria:**
- [ ] Push branch `atlas/atlas/T-42-stripe-webhook` → ticket T-42 auto-linked
- [ ] PR body auto-populated with ticket spec
- [ ] Multi-repo: branches detected in any project repo

---

### WP-50: Reviewer Agent
**Effort:** 3 days | **Depends on:** WP-40, WP-42 | **Priority:** HIGH
**Refs:** `14-user-flows.md` Flow 18

**Deliverables:**
- Given PR diff + ticket spec → compare against acceptance criteria
- Classify drift: Critical, Major, Minor, Outdated
- Post structured comment on PR: summary, per-AC pass/fail, drift items with severity
- Store in `verification_report` table
- Re-run on force-push (updated PR)
- On PR merge: final verification, capture diff summary in ticket, mark verified/verified-with-drift
- Eval harness: 20 golden (PR diff, ticket spec) pairs, ≥80% severity accuracy

**Acceptance Criteria:**
- [ ] Reviewer posts structured comment on PR within 60s of open
- [ ] Per-AC pass/fail is accurate
- [ ] Drift severity classification matches eval expectations
- [ ] Merge triggers final verification and status update

---

### WP-51: Provider Settings UI
**Effort:** 2 days | **Depends on:** WP-06 | **Priority:** MEDIUM
**Refs:** `14-user-flows.md` Flow 17a

**Deliverables:**
- Settings > AI Providers page
- Add/edit/remove API keys per provider (Anthropic, OpenAI, Google, DeepSeek)
- Key validation on save (test call to list models)
- Encrypted storage in `provider_config` table (AES-256-GCM)
- Key display: masked `sk-ant-••••`, never visible in full
- Provider health status: green (valid), yellow (near rate limit), red (invalid)

**Acceptance Criteria:**
- [ ] Add API key → validated → shows green status
- [ ] Invalid key → shows red status with error
- [ ] Key never visible after save (only masked)
- [ ] Key encrypted in DB

---

### WP-52: Notion Import
**Effort:** 2 days | **Depends on:** WP-29 | **Priority:** LOW

**Deliverables:**
- Notion OAuth integration
- API: fetch databases, pages, blocks
- Mapping: Database row→Canvas note, Structured page→Epic, Unstructured→split into notes
- Parse block types: headings, bullets, toggles, callouts
- Reuse Review & Accept UI

**Acceptance Criteria:**
- [ ] OAuth connects to Notion workspace
- [ ] Notion database rows imported as classified notes
- [ ] Structured pages imported as epic candidates

---

### WP-53: Batch Export + Conductor Config
**Effort:** 2 days | **Depends on:** WP-48 | **Priority:** HIGH
**Refs:** `05-claude-code-integration.md` (formats 3-5)

**Deliverables:**
- **Phase batch export:** ordered list of all ticket commands with dependency annotations
- **"Copy All Commands"** → sequential commands respecting dependency order
- **"Export for Conductor"** → JSON config with: tickets, repos, prompts, dependency graph, parallelization waves
- **"Download All CLAUDE.md"** → zip of one file per ticket + README with execution order
- Keyboard shortcut: `⌘⇧E` on selected phase
- Bulk export: all tickets in an epic, or all ready tickets across phases

**Acceptance Criteria:**
- [ ] Phase with 5 tickets → ordered commands with correct dependency annotations
- [ ] Conductor JSON has valid structure with parallelization waves
- [ ] Zip download contains correct CLAUDE.md files + README
- [ ] Dependency ordering respects cross-repo ticket dependencies

---

### WP-54: PR Status Sync
**Effort:** 1 day | **Depends on:** WP-49 | **Priority:** MEDIUM

**Deliverables:**
- PR merged → ticket status: "done" → phase progress bar updates → epic completion % updates
- PR closed without merge → ticket: "needs-rework"
- PR review submitted → ticket: "in-review"
- Status bubble-up: recompute parent phase/epic/intent completion percentages
- Webhook handlers: `pull_request.closed`, `pull_request.review_submitted`

**Acceptance Criteria:**
- [ ] PR merge → ticket done → phase % updates → epic % updates
- [ ] Closed-without-merge → ticket needs-rework
- [ ] Status bubble-up is accurate across all layers

---

### WP-55: Rabbit-Hole Drilldown
**Effort:** 2 days | **Depends on:** WP-39 | **Priority:** MEDIUM
**Refs:** `14-user-flows.md` Flow 19

**Deliverables:**
- Click any node → side panel shows full vertical slice (L0 through L5)
- Each layer expandable/collapsible
- Links between layers are clickable (navigate to that node's view)
- Works in all views: canvas, kanban, graph, roadmap

**Acceptance Criteria:**
- [ ] Ticket drilldown shows: ticket → phase → epic → intent → canvas notes → PRs
- [ ] All links are clickable and navigate correctly
- [ ] Panel works from every view

---

### WP-56: Cross-Source Deduplication
**Effort:** 2 days | **Depends on:** WP-45, WP-46, WP-52 | **Priority:** LOW

**Deliverables:**
- Embedding similarity across all imported nodes (cosine > 0.85 = candidate)
- Cross-reference detection: Linear issue mentions PR number, Notion links to Jira
- Merge UI: side-by-side comparison, one-click merge or dismiss
- Confidence scores on all dedup candidates

**Acceptance Criteria:**
- [ ] Same feature in Linear + GitHub detected as duplicate
- [ ] Merge combines sources with correct provenance
- [ ] Dismiss prevents re-detection

---

### WP-57: Agent Model Assignment UI
**Effort:** 1 day | **Depends on:** WP-51 | **Priority:** LOW
**Refs:** `14-user-flows.md` Flow 17b-c

**Deliverables:**
- Per-agent model selector: dropdown of provider + model for each Atlas agent role
- Cost estimates shown inline (estimated $/1k calls based on model pricing)
- "Use for all agents" button for quick setup
- Daily spend limit: configurable cap, usage chart per agent per day
- Persist in `project.settings.agentProviders`

**Acceptance Criteria:**
- [ ] Each agent can be assigned a different model
- [ ] Cost estimates shown and roughly accurate
- [ ] Daily cap prevents overspend

---

### WP-58: Documentation Generation
**Effort:** 2 days | **Depends on:** WP-44, WP-50 | **Priority:** LOW
**Refs:** `14-user-flows.md` Flow 21

**Deliverables:**
- **why.md per file:** given file path → find all PRs that touched it → walk up chain → explain why
- **Changelog per milestone:** auto-generated from merged PRs grouped by intent
- **Decision log per intent:** from Decision-typed canvas notes + clarification dialogues
- Export as markdown, committable to repo
- Cross-repo: why.md references related changes in other repos

**Acceptance Criteria:**
- [ ] why.md for a file with 3 PRs shows correct provenance chain
- [ ] Changelog groups PRs under correct intents
- [ ] Decision log includes all Decision-typed notes

---

### WP-59: Custom Export Templates + Polish
**Effort:** 1 day | **Depends on:** WP-53 | **Priority:** LOW

**Deliverables:**
- Settings > Export Templates page
- User-defined prompt structure for team conventions
- Default templates: Claude Code, Cursor, generic markdown
- Template variables: `{{ticket.title}}`, `{{ticket.ac}}`, `{{epic.summary}}`, etc.
- Export format refinement based on usage patterns

**Acceptance Criteria:**
- [ ] Custom template saved and used for future exports
- [ ] Default templates produce valid output
- [ ] Template variables resolve correctly

---

### WP-60: Playback Polish
**Effort:** 2 days | **Depends on:** WP-24 | **Priority:** LOW

**Deliverables:**
- Smooth animations: notes fade in as created, edges draw themselves
- Clusters form visually, epics materialize
- PR merge events show status badge updates
- Project history page: full searchable timeline of all events
- Configurable playback: 0.5x to 1day/s

**Acceptance Criteria:**
- [ ] Playback at 60x shows meaningful project evolution
- [ ] Animations are smooth (no jumpy state transitions)
- [ ] Project history page is searchable and filterable

---

### WP-61: Supabase Mode (Mode C)
**Effort:** 3 days | **Depends on:** WP-03, WP-40 | **Priority:** MEDIUM
**Refs:** `06-deployment-modes.md` (Supabase)

**Deliverables:**
- `SupabaseAdapter` extending `ApiAdapter` with Auth + Realtime + Storage
- Supabase Auth: GitHub OAuth login, JWT verification in Axum middleware
- RLS policies: users see only their workspace's data
- Supabase Realtime: subscribe to node/edge changes for live sync
- Supabase Storage: file uploads for attachments/wireframes
- Deploy configs: Fly.io Dockerfile, Railway config
- `supabase/` directory with config + seed

**Acceptance Criteria:**
- [ ] Sign in with GitHub via Supabase Auth
- [ ] RLS: user A cannot see user B's data
- [ ] Realtime: changes from one tab appear in another
- [ ] Deploy to Fly.io works with `fly deploy`

---

### WP-62: Final E2E + Performance Suite
**Effort:** 3 days | **Depends on:** WP-48, WP-50, WP-24 | **Priority:** HIGH

**Deliverables:**
- 5 Playwright e2e flows:
  1. Brain dump: create notes → verify classification → view switching
  2. Compilation: cluster → epic → phases → tickets → export
  3. Temporal: create notes → scrub backward → verify state
  4. Settings: add API key → verify connected → assign model
  5. GitHub: bind repo → export ticket → mock PR → verify auto-link
- Performance benchmarks: 500 notes <500ms render, scrub <200ms, graph 200 nodes <2s
- Visual regression baselines captured
- Fixture GitHub org/repo for integration testing

**Acceptance Criteria:**
- [ ] All 5 e2e flows pass
- [ ] Performance benchmarks meet targets
- [ ] Visual regression baselines captured

---

### WP-63: Security Audit
**Effort:** 2 days | **Depends on:** WP-61, WP-50 | **Priority:** HIGH
**Refs:** `09-auth-security.md`

**Deliverables:**
- OWASP top 10 checklist pass (all items verified)
- GitHub webhook HMAC verification tested
- API key encryption verified (never in logs, never in API responses)
- RLS tested: user isolation confirmed
- CSP headers, XSS audit on rendered rich text
- Prompt injection audit: all agent prompts use structured input
- `cargo audit` + `pnpm audit` clean
- Rate limiting verified (LLM calls + API endpoints)

**Acceptance Criteria:**
- [ ] All OWASP checklist items pass
- [ ] No API keys in logs or responses
- [ ] RLS prevents cross-user data access
- [ ] No known vulnerabilities in dependencies

---

### WP-64: Docs + Validation Dashboard
**Effort:** 3 days | **Depends on:** WP-62 | **Priority:** MEDIUM
**Refs:** `10-docs-validation.md`

**Deliverables:**
- API docs: utoipa/OpenAPI annotations on all Rust handlers, Swagger UI at `/api/docs`
- Component docs: Histoire stories for all major components
- User docs: Starlight site with getting-started (3 modes), guides, reference
- ADRs for all architectural decisions
- Feature validation registry: every feature has validation doc with AC + test coverage
- Validation dashboard: CI-generated status page
- Self-hosting guide, Supabase deploy guide
- README with badges, screenshots, setup instructions
- CHANGELOG for v0.1.0

**Acceptance Criteria:**
- [ ] OpenAPI spec covers all endpoints
- [ ] Getting-started docs work for all 3 modes
- [ ] Validation dashboard shows status of all features
- [ ] README is complete with screenshots

---

## Summary

| Metric | Value |
|--------|-------|
| **Total work packages** | 65 (WP-00 through WP-64) |
| **Critical path length** | 12 WPs: 00→02→06→17→25→32→37→42→48→53→59 + polish |
| **Max parallel agents** | 10-12 (Waves 3-4) |
| **Estimated total effort** | ~140 agent-days |
| **Estimated wall-clock** | ~12-14 weeks with 4-6 parallel agents |

### Critical Path (longest dependency chain)
```
WP-00 Foundation
  → WP-02 Node Stores
    → WP-06 Provider Registry + Connector
      → WP-17 Cluster Detection
        → WP-25 Synthesizer
          → WP-32 Compile-to-Epic
            → WP-37 Phase Generation (Architect)
              → WP-42 Ticket Generation (Decomposer)
                → WP-48 Export System Core
                  → WP-53 Batch Export + Conductor
```

Optimize by throwing agents at all non-critical-path WPs in parallel while the critical path advances.
