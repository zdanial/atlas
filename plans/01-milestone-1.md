# M1 — Canvas + Connector (4 weeks)

Ship a standalone "thinking tool" beta: dump notes, auto-classify, see edges, switch views.

---

## Parallel Work Streams

```
Week 1          Week 2          Week 3          Week 4
─────────────── ─────────────── ─────────────── ───────────────

Stream A: Foundation + Canvas
[A1 Project     [A2 Canvas UI   [A3 Canvas       [A5 Polish +
 scaffold,       spatial layout,  interactions:    perf, drag
 data model,     pan/zoom,        multi-select,    smoothness,
 IndexedDB]      note cards]      resize, link]    mobile-safe]

Stream B: Note CRUD + Persistence
[B1 Node CRUD   [B2 Rich text   [B3 Local-first  [B5 Search +
 API, Zod        editor in        sync engine,     filter across
 validation,     note cards,      offline-first    notes]
 rune stores]  note types UI]   IndexedDB]

Stream C: Connector Agent
                [C1 Classifier  [C2 Edge          [C3 Background
                 pipeline:       inference:         loop: watch
                 note → type,    pairwise           for new notes,
                 LLM call +      similarity,        re-classify
                 fallback]       relation types]    stale ones]

Stream D: Views
                [D1 Kanban      [D2 Graph view    [D3 View
                 view: group     Svelvet/d3,       switcher,
                 by type,        force-directed,    shared
                 drag between]   edge rendering]    selection state]

Stream E: Command Palette + Keyboard
                                [E1 ⌘K palette,  [E2 Full
                                 note creation,    shortcut map,
                                 view switching,   vim-like
                                 search]           navigation]

Stream T: Temporal Foundation (see 07-temporal-navigation.md)
                                [T1 Event table, [T2 Timeline
                                 every CRUD       scrubber UI,
                                 writes event,    temporal context,
                                 graph state      wire all views
                                 reconstruction]  to scrubber]
```

---

## Stream A: Foundation + Canvas UI

### A1 — Project Scaffold (Week 1)
- **Frontend:** SvelteKit 2 + Svelte 5 (runes) + TypeScript strict (`frontend/`)
- **Backend:** Rust + Axum + tokio + SQLx (`backend/`), Cargo workspace
- Tailwind v4 + Bits UI (headless Svelte component library) setup
- `StorageAdapter` interface in `frontend/src/lib/storage/` (see `06-deployment-modes.md`)
- `IndexedDBAdapter` as default (browser-only Mode A works from day 1)
- SQLx migrations in `backend/migrations/` (see `04-data-model.md`)
- Svelte 5 runes for client state (`$state`, `$derived`) — all CRUD goes through `StorageAdapter`
- Vitest + Playwright config (frontend), `cargo test` (backend)
- CI pipeline (lint, type-check, `cargo clippy`, test)
- Data model supports workspaces + multiple projects from day 1 (see `13-multi-project-multi-repo.md`)
- Auto-create default workspace + default project on first run
- Project switcher hidden until second project exists
- `LICENSE` (AGPLv3), `CONTRIBUTING.md`, `CLAUDE.md` for contributors

### A2 — Canvas Spatial Layout (Week 2)
- HTML/CSS-transform based infinite canvas (no `<canvas>`)
- Pan (mouse drag / trackpad), zoom (pinch / scroll)
- Note card component: renders title, type badge, body preview
- Place notes at click position or auto-arrange
- Grid snapping (optional, toggleable)

### A3 — Canvas Interactions (Week 3)
- Multi-select (shift-click, box select)
- Drag to reposition, snap-to-grid
- Draw edges manually between notes (drag from edge handle)
- Delete notes/edges (with undo)
- Undo/redo stack (custom Svelte store with history)

### A5 — Canvas Polish (Week 4)
- 60fps pan/zoom with virtualization (only render visible notes)
- Minimap in corner
- Canvas background dots/grid
- Smooth animations on note creation/deletion
- Responsive: works at 1024px+ width

**Depends on:** nothing (foundational)

---

## Stream B: Note CRUD + Persistence

### B1 — Node CRUD + Store (Week 1)
- Svelte 5 rune-based store: `$state` for node map, `$derived` for filtered/sorted views
- Zod schemas (via `zod` — works in any TS project) for each node type's payload
- Optimistic updates (write to store → write to IndexedDB → sync to server)
- TanStack Query Svelte adapter for server sync (when backend exists)
- Unit tests for all CRUD operations

### B2 — Rich Text in Notes (Week 2)
- TipTap editor via `svelte-tiptap` in note cards (inline editing on double-click)
- Markdown shortcuts (headings, lists, bold, italic, code)
- Note type selector (dropdown of 12 types with icons)
- Type-specific color coding on note cards

### B3 — Local-First Sync (Week 3)
- IndexedDB adapter: full CRUD already works standalone (Mode A complete)
- Sync queue: pending changes buffer → batch POST to server (Mode B/C)
- Offline detection: show indicator, queue changes
- Conflict resolution: last-write-wins with timestamp
- Mode detection: auto-select adapter based on env vars (see `06-deployment-modes.md`)

### B5 — Search + Filter (Week 4)
- Full-text search across note titles and bodies
- Filter by type, date range, tags
- Results highlight in current view (canvas/kanban/graph)

**Depends on:** A1 (project scaffold, Svelte 5 rune stores)

---

## Stream C: Connector Agent

### C1 — Classifier Pipeline + Provider Registry (Week 2)
- `ProviderRegistry` class: register providers by capability, route calls (see `05-claude-code-integration.md`)
- `callModel()` abstraction: provider-agnostic LLM wrapper, routes through registry
- API key config: read from env vars (settings UI in M2)
- Classifier prompt: given note text → return type + confidence
- Batch classification: queue new unclassified notes
- Fallback: if LLM fails, default to "note" type
- AgentRun logging for every invocation
- Eval harness: 50 sample notes with expected types, assert ≥85% accuracy

### C2 — Edge Inference (Week 3)
- Pairwise comparison: given two notes, infer relation type + weight
- Smart batching: only compare new notes against recent notes (not full O(n²))
- Relation types: supports, contradicts, blocks, implements, duplicates, refines
- Write inferred edges to `node_edge` with `source: 'ai'`
- AI edges shown with dashed lines, human edges solid

### C3 — Background Loop (Week 4)
- Polling/event loop: watch for new or updated notes
- Re-classify notes whose body changed significantly
- Prune low-confidence edges over time
- Rate limiting: max N LLM calls per minute
- Cost tracking in AgentRun table

**Depends on:** B1 (node store), A1 (scaffold)

---

## Stream D: Views

### D1 — Kanban View (Week 2)
- Columns grouped by note type (12 columns, collapsible)
- Drag notes between columns (changes type)
- Card shows: title, body preview, edge count badge
- Column counts

### D2 — Graph View (Week 3)
- Svelvet (Svelte-native graph library) or d3-force with custom Svelte components
- Nodes = note cards (compact version)
- Edges = node_edges, styled by relation_type
- Force-directed layout via d3-force
- Click node to select in all views (shared selection state via Svelte context)

### D3 — View Switcher (Week 4)
- Tab bar or toggle: Canvas | Kanban | Graph
- Shared selection: selecting a node in one view highlights it in others
- Smooth transitions between views
- Persist last-used view per project

**Depends on:** A2 (canvas), B1 (node store)

---

## Stream E: Command Palette + Keyboard

### E1 — Command Palette (Week 3)
- ⌘K to open
- Commands: create note, switch view, search, change note type, delete, undo/redo
- Fuzzy search over commands and note titles
- Recent commands list

### E2 — Keyboard Shortcuts (Week 4)
- Full shortcut map: N=new note, D=delete, 1/2/3=switch view, /=search, Z=undo
- Vim-style: j/k to navigate between notes, Enter to edit, Esc to deselect
- Shortcut cheat sheet (? to toggle)

**Depends on:** A2 (canvas), B1 (node store)

---

## Stream T: Temporal Foundation

Full details in `07-temporal-navigation.md`. Time is a first-class citizen from day one.

### T1 — Event Sourcing + Graph Reconstruction (Week 3)
- `event` table in migrations (Rust backend) and IndexedDB (browser mode)
- Every node/edge CRUD operation also writes an event with `before_state` / `after_state`
- `GraphState` type: full snapshot of nodes + edges at a point in time
- Reconstruction function: find nearest snapshot → replay events → return graph state
- Snapshot generation: every 100 events (browser) or hourly (Rust background task)
- Rust API: `GET /api/projects/:id/state?at=<timestamp>`

### T2 — Timeline Scrubber + View Integration (Week 4)
- `TimelineScrubber.svelte`: range slider from project creation → now
- Event markers on the track (significant events as colored dots/diamonds)
- Play / pause / step-back / step-forward / go-live controls
- `TemporalContext` via Svelte context — shared across all views
- Canvas, Kanban, Graph views read from `temporal.graphState` instead of live store
- When `isLive=true` (default): zero overhead, graphState references the real store
- When scrubbing: reconstructed state, read-only view with subtle visual indicator

**Depends on:** A2 (canvas), B1 (node store), D2 (graph view)

---

## M1 Recurring Work (continuous, not a stream)

These run in parallel with all streams throughout M1:

### Testing (every week)
- Week 1: CI pipeline operational (cargo test, vitest, cargo clippy, pnpm lint, pnpm check)
- Week 2: Unit tests for all CRUD operations, storage adapters, Zod schemas
- Week 3: Integration tests for Connector agent (classification accuracy), e2e smoke test (Playwright: create note → verify persistence)
- Week 4: Full e2e suite for M1 flows (brain dump, view switching, scrubber), visual regression baselines captured

### Security (Week 1 + Week 4)
- Week 1: CSP headers, security middleware in Axum, no secrets in logs
- Week 1: API key storage encryption (IndexedDB + env var modes)
- Week 4: Security review of all user-facing inputs (note body, command palette), XSS audit on rendered rich text

### Documentation (every week)
- Week 1: ADRs for: universal node primitive, event sourcing, Rust backend, Svelte frontend, storage adapter pattern
- Week 2: Component stories for NoteCard, Canvas
- Week 3: Component stories for Kanban, Graph, CommandPalette, TimelineScrubber
- Week 4: Validation docs for all M1 features, quickstart guide (Mode A)

### Onboarding: Brain Dump Import (Week 2-3)
- `import_source` and `import_mapping` tables in migrations
- "Import from paste" via ⌘K — paste text, Connector classifies into notes, placed on canvas
- Validates the classification pipeline with real unstructured input
- See `12-project-onboarding.md`

### Code Cleanup (Week 4, 2 days)
- Remove prototype scaffolding and dead code
- `cargo clippy` clean, no `#[allow(...)]` suppressions
- Dependency audit: remove unused crates/packages
- Review all TODOs — convert to issues or resolve
- Tech debt registry: document any known shortcuts taken in M1

---

## M1 Exit Criteria

- [ ] User can dump 50+ notes onto a canvas without lag
- [ ] Notes are auto-classified into correct types ≥85% of the time
- [ ] AI-inferred edges appear within 5s of note creation
- [ ] Canvas/Kanban/Graph views all render the same data correctly
- [ ] ⌘K palette reaches all core actions
- [ ] Data persists across page reloads (IndexedDB)
- [ ] Timeline scrubber shows project history, scrub to any past state
- [ ] All views (canvas/kanban/graph) correctly render reconstructed past state
- [ ] Step-back/step-forward jumps between significant events
- [ ] All unit tests pass, e2e smoke test passes
