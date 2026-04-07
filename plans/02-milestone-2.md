# M2 — Compilation Pipeline (6 weeks)

Canvas clusters compile into Epics → Phases → Tickets. All middle-layer agents. Export for manual handoff.

**Prerequisite:** M1 complete (canvas, notes, Connector agent, views)

---

## Parallel Work Streams

```
Week 5          Week 6          Week 7          Week 8          Week 9          Week 10
─────────────── ─────────────── ─────────────── ─────────────── ─────────────── ───────────────

Stream F: Synthesizer + Cluster Detection
[F1 Cluster     [F2 Synthesizer [F3 "Compile
 detection:      agent: draft    to epic"
 find groups     epic proposals  flow with
 of related      from clusters,  accept/edit/
 notes]          surface dupes]  reject UI]

Stream G: Intent Layer (L4)
[G1 Intent      [G2 Roadmap     [G3 AI-assisted
 CRUD, status    view: Gantt/    re-planning:
 management,     swim-lane,      "re-derive
 link notes      timeline]       next 4 weeks"]
 to intents]

Stream H: Epic Spec Editor (L3)
                [H1 Epic editor: [H2 Clarification [H3 Stale badge
                 PRD + tech plan  dialogue: AI       + re-sync from
                 + open Qs,       asks questions     canvas sources,
                 Tiptap sections] Traycer-style]     version diff]

Stream I: Architect Agent (L3 → L2)
                                [I1 Phase         [I2 Phase UI:
                                 generation from    drag/merge/
                                 epic, file-level   split/reorder,
                                 change plans,      status workflow,
                                 mock codebase]     context bundles]

Stream J: Decomposer Agent (L2 → L1)
                                                  [J1 Ticket       [J2 Ticket UI:   [J3 Export:
                                                   generation from   card view,       clipboard,
                                                   phase, prompt     acceptance       markdown,
                                                   payload format,   criteria,        JSON, prompt
                                                   context compile]  agent rec]       payloads]

Stream K: Strategist + Historian
[K1 Strategist: [K2 Historian:                    [K3 Round Table
 surface blocked  "why did we                      mode: address
 /stale/contra-   decide this"                     question to
 dictory intents, walk graph                       all agents,
 suggest fixes]   backwards]                       multi-perspective]
```

---

## Stream F: Synthesizer + Cluster Detection

### F1 — Cluster Detection (Week 5)
- Algorithm: semantic similarity (embeddings) + shared edges + co-occurrence
- Group notes into candidate clusters (3-15 notes each)
- Surface clusters in a side rail: "These 7 notes look like one feature"
- User can accept, dismiss, or edit clusters
- Tests: golden inputs with expected cluster outputs

### F2 — Synthesizer Agent (Week 6)
- Given a cluster → draft an epic proposal (title, one-paragraph summary, key decisions)
- Surface contradictions: "Note A says X, Note B says the opposite"
- Surface duplicates: "This note from 2 weeks ago says the same thing"
- Passive: suggestions appear in side rail, never interrupt
- AgentRun logging + eval harness

### F3 — Compile-to-Epic Flow (Week 7)
- "Compile to Epic" button on cluster cards
- Preview: AI-drafted epic with source notes visible
- Accept → creates L3 Epic node linked to source canvas notes
- Edit → inline editing before accepting
- Reject → dismiss, can re-trigger later

**Depends on:** C1-C2 (Connector edges), B1 (node store)

---

## Stream F.5: Storage Adapters (parallel with F)

### F.5a — PostgreSQL Adapter (Week 5)
- Implement `PostgresAdapter` — frontend calls Rust API, Rust uses SQLx
- Same StorageAdapter interface as IndexedDB adapter, but routes through REST/WebSocket to Rust backend
- Connection string via `DATABASE_URL` env var (Rust reads it)
- Migrations via `sqlx-cli` in `backend/migrations/` (shared with Supabase)

### F.5b — SQLite Adapter (Week 5)
- Implement `SQLiteAdapter` — Rust backend with `sqlx::sqlite`
- Same migrations adapted for SQLite dialect
- For desktop (Tauri + Rust backend as sidecar) and lightweight self-host

### F.5c — Docker Compose (Week 6)
- `docker-compose.yml`: atlas-frontend (SvelteKit) + atlas-backend (Rust binary) + postgres
- Multi-stage `Dockerfile` for Rust backend (build → slim runtime, ~20MB image)
- `docker compose up` → Mode B running in 30 seconds
- Seed script with demo data

**Depends on:** A1 (StorageAdapter interface from M1)

---

## Stream F.6: Project Onboarding — GitHub + Markdown (parallel with F)

Full details in `12-project-onboarding.md`.

### F.6a — GitHub Scanner + Cartographer Agent (Week 5)
- Fetch commits (1000), PRs (500), branches, file tree, README + docs
- Cartographer agent: classify PRs → Tickets, group by semantic similarity → Epics, infer Intents from release tags/milestones
- PR body parsing: extract decisions, constraints, references as Canvas notes
- Commit message mining: conventional commits → typed notes

### F.6b — Review & Accept UI (Week 6)
- Preview proposed graph: nodes colored by source, confidence scores visible
- Edit before import: reclassify, merge, split, delete, add edges
- Accept → commit entire graph + backfill synthetic events (dated to original timestamps)
- Timeline scrubber immediately works for historical data

### F.6c — Incremental Re-sync + Markdown Import (Week 7)
- "Sync from GitHub" — import new PRs/commits since last scan
- Markdown folder import: parse headings, bullets, blockquotes → classified notes
- Deduplication: embedding similarity + cross-references + file path overlap

**Depends on:** C1 (Connector classification), L1 or GitHub OAuth prep

---

## Stream G: Intent Layer (L4)

### G1 — Intent CRUD (Week 5)
- Create/edit Intent nodes: name, target outcome, deadline, status
- Status lifecycle: active → paused → achieved → abandoned
- Link canvas notes to Intents (manual + AI-suggested)
- Link Epics under Intents (parent_id relationship)
- Orphan detection: Epics without Intent parent get flagged

### G2 — Roadmap View (Week 6)
- Gantt-style or swim-lane layout
- X-axis: time, Y-axis: Intents
- Child Epics shown as blocks under their parent Intent
- Status color coding (active=blue, paused=gray, achieved=green, abandoned=red)
- Drag to reorder or reschedule

### G3 — AI Re-planning (Week 7)
- "Re-derive next N weeks" command
- Input: new constraints (text), existing Intents + Epics
- Output: proposed re-arrangement of Epics under Intents, with rationale
- Accept/edit/reject flow (same pattern as F3)
- Strategist agent powers this

**Depends on:** B1 (node store), A1 (scaffold)

---

## Stream H: Epic Spec Editor (L3)

### H1 — Epic Editor (Week 6)
- Structured document: PRD section, Tech Plan section, Open Questions, Decision Log
- Each section is a TipTap editor instance (via `svelte-tiptap`)
- Sidebar: linked canvas notes, constraints, risks (pulled from L5)
- Version history (node_version table)

### H2 — Clarification Dialogue (Week 7)
- AI asks clarifying questions about the epic (Traycer-style)
- Chat-within-epic: scoped conversation to refine the spec
- Answers get folded into the PRD or Tech Plan sections
- Questions can be marked resolved or deferred

### H3 — Stale Detection + Re-sync (Week 8)
- When a source canvas note changes → epic gets "stale" badge
- One-click "re-sync from sources": AI re-derives affected sections
- Diff view: show what changed between current epic and re-derived version
- Accept partial changes (per-section)

**Depends on:** F3 (compile-to-epic flow)

---

## Stream I: Architect Agent (L3 → L2)

### I1 — Phase Generation (Week 7-8)
- Given an Epic → propose 2-5 Phases, ordered by dependency
- Each phase: objective, file-level change list, arch notes, verification criteria, complexity estimate
- Mock codebase mode: use a fixture directory to test file-level planning
- Context bundle: relevant slice of upstream Intent + Epic + canvas notes
- Tests: golden epic inputs → expected phase decompositions

### I2 — Phase UI (Week 8-9)
- Phase list under each Epic
- Drag to reorder, merge two phases, split one phase
- Insert phase between existing ones → AI re-derives downstream context
- Status workflow: ready for ticketing → in progress → in review → done
- Phase detail panel: objective, file changes, context bundle

**Depends on:** H1 (epic editor), data model (phase payload schema)

---

## Stream J: Decomposer Agent (L2 → L1)

### J1 — Ticket Generation (Week 8-9)
- Given a Phase → generate 3-10 tickets
- Each ticket: title, intent paragraph, file paths, acceptance criteria, prompt payload
- Prompt payload: structured handoff doc that coding agents can consume
- Context bundle compilation: walk upstream layers, extract relevant context
- Recommended agent field (Claude Code / Cursor / Codex)
- Tests: golden phase inputs → expected ticket outputs

### J2 — Ticket UI (Week 9)
- Ticket cards under each Phase
- Card shows: title, file paths, status, complexity
- Detail panel: full prompt payload, acceptance criteria checklist
- Status: open → in progress → in review → done → verified

### J3 — Export System (Week 10)
- **"Copy Command" button** on ticket card → copies `claude --print "..."` with full compiled context to clipboard
- **"Download CLAUDE.md"** → renders ticket as markdown file with intent, files, AC, upstream epic/phase context
- **Phase batch export** → ordered list of commands with dependency annotations (which ticket blocks which)
- **"Export for Conductor"** → JSON config with tickets, repos, prompts, dependency graph, parallelization waves
- **"Download All CLAUDE.md"** → zip of one file per ticket + README with execution order
- **Keyboard shortcuts:** `⌘⇧C` (copy command for selected ticket), `⌘⇧E` (export entire phase)
- Context bundling: `PromptCompiler` walks ticket → phase → epic → intent → canvas notes, includes only what fits
- See `05-claude-code-integration.md` for full export format details

**Depends on:** I1 (phase generation)

---

## Stream K: Strategist + Historian

### K1 — Strategist Agent (Week 5-6)
- Analyze Intent layer: surface blocked intents, stale intents, contradictions
- Suggestions in side rail: "Intent X is blocked by unresolved Question Y"
- "What changes if I drop Milestone X?" scenario analysis
- AgentRun logging + eval harness

### K2 — Historian Agent (Week 6-7)
- "Why did we decide this?" — walk the graph backwards from any node
- Given a ticket → show the chain: ticket → phase → epic → intent → canvas notes
- Decision log per Intent: auto-generated from Decision-typed canvas notes
- Provenance panel on every node

### K3 — Round Table Mode (Week 8)
- Address a question to all agents at once
- Each agent responds from its layer's perspective
- Responses shown in a multi-column or tabbed view
- Example: "Should we kill module X?" → Strategist (milestone impact), Architect (code impact), Historian (origin), Reviewer (open PRs affected)

**Depends on:** G1 (intents), C1 (connector), I1 (architect)

---

## Stream L.pre: Multi-Project + Multi-Repo (parallel with I, J)

Full details in `13-multi-project-multi-repo.md`.

### L.pre.a — Multi-Project UI (Week 5-7)
- Project CRUD: create, rename, delete, archive
- Project switcher in sidebar + ⌘K (⌘1/⌘2/⌘3 to quick-switch)
- Project color coding across all views
- Global Pool: unassigned notes, drag-to-assign to a project
- Cross-project search: ⌘K finds nodes across all projects (project badge on results)
- Unified roadmap: all projects' Intents on one timeline, filter by project

### L.pre.b — Multi-Repo Wiring (Week 8-9)
- Repo management UI: connect repos, assign to projects, set primary
- `project_repo` join table wired to all queries
- Architect agent reads file trees from ALL repos in a project
- Decomposer assigns tickets to specific repos (repo badge on ticket cards)
- Cross-repo edges in Graph view (styled differently: dashed + repo color)
- File-level plans reference `{ repoId, path }` instead of bare paths

**Depends on:** A1 (data model with workspace/project/project_repo tables)

---

## M2 Recurring Work (continuous)

### Testing (every week)
- Week 5: Agent eval harness infrastructure (runner, fixtures, PR comment reporter)
- Week 5-6: Connector eval suite (100 golden classification inputs, 50 edge inference pairs)
- Week 6-7: Synthesizer eval suite (20 cluster → epic golden inputs)
- Week 7-8: Architect eval suite (10 epic → phase golden inputs)
- Week 8-9: Decomposer eval suite (15 phase → ticket golden inputs)
- Week 9: Integration tests for full compile pipeline (canvas → epic → phase → ticket)
- Week 10: E2E flows for compilation, roadmap view, export

### Security (Week 5 + Week 10)
- Week 5: API key encrypted storage in Rust backend (provider_config table)
- Week 5: Rate limiting middleware for LLM calls (per-provider, per-project daily cap)
- Week 10: Review prompt injection surface — agent prompts use structured input, user content delimited

### Documentation (every week)
- ADRs: capability-based provider routing, agent eval methodology
- Validation docs for all M2 features (synthesizer, intent CRUD, epic editor, phases, tickets, export)
- Agent documentation: prompt templates, expected behavior, eval thresholds
- Docker setup guide (Mode B)

### Code Cleanup (Week 10, 3 days)
- Refactor patterns that emerged during M1-M2
- Extract shared agent utilities (callModel wrapper, eval runner, context bundle compiler)
- Dead code sweep across frontend + backend
- Performance profiling: identify slow queries, optimize hot paths
- Update tech debt registry

---

## M2 Exit Criteria

- [ ] Canvas clusters detected and surfaced automatically
- [ ] Clusters compile into well-formed Epic specs
- [ ] Epics decompose into 2-5 Phases with file-level plans
- [ ] Phases decompose into 3-10 actionable Tickets
- [ ] Tickets export as markdown/JSON with full context
- [ ] Prompt payloads are consumable by Claude Code / Cursor
- [ ] Intent roadmap view renders correctly with time axis
- [ ] Re-planning produces coherent re-derived plans
- [ ] Stale detection works when canvas notes change
- [ ] Round Table mode returns multi-agent perspectives
- [ ] All compilation steps are reversible (draft → accept/reject)
- [ ] GitHub repo import produces a populated graph within 2 minutes (500 PRs)
- [ ] Imported nodes have correct source provenance and confidence scores
- [ ] Timeline scrubber shows backfilled history from before Atlas existed
- [ ] Incremental re-sync imports only new PRs/commits
- [ ] Markdown folder import classifies docs into correct note types
- [ ] Multiple projects can be created and switched between
- [ ] Global Pool holds unassigned notes, drag-to-assign works
- [ ] Cross-project search returns results from all projects
- [ ] Unified roadmap shows all projects' Intents on one timeline
- [ ] Multiple repos can be linked to a project
- [ ] Architect reads file trees from all repos in a project
- [ ] Tickets are scoped to a specific repo with repo badge visible
- [ ] All compilation events (epic/phase/ticket generation, re-plans) recorded in event log
- [ ] Timeline scrubber shows compilation events as markers
- [ ] Scrubbing roadmap view shows what the plan looked like at any past point
- [ ] Playback mode MVP: animate project evolution at configurable speed
