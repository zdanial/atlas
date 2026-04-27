# Butterfly — User Flows

Every flow a user encounters, from first launch to daily use. Edit this doc freely — it drives the replan.

---

## Flow 1: First Launch (Browser-Only Mode)

1. User opens Butterfly in browser → lands on **Welcome screen**
2. "Create your first workspace" → enter workspace name
3. Optional: "Import an existing project?" → branches to Flow 12 (Onboarding)
4. Skip → empty canvas with a single project created
5. Tooltip tour: "This is your canvas. Brain-dump here." (dismissable, never returns)

**No auth, no API keys required.** Data lives in IndexedDB. User can start dumping immediately.

---

## Flow 2: First Launch (Self-Hosted / Supabase)

1. User runs `docker compose up` or deploys to Supabase
2. Opens Butterfly → **Sign In** screen
   - Mode B (local server): optional passphrase or skip
   - Mode C (Supabase): "Sign in with GitHub" or email/password
3. After auth → same workspace creation as Flow 1
4. Prompt: "Set up AI providers to enable smart features" → links to Flow 17 (API Key Setup)

---

## Flow 3: Brain Dump (Canvas Input)

The core daily loop. User has a thought → captures it fast.

1. User is on the **Canvas view**
2. **Quick capture methods:**
   - Double-click empty space → new sticky note, cursor in text field
   - `⌘K` → command palette → "New note" → type and Enter
   - Paste text → auto-creates note(s) at cursor position
   - Drag-select multiple notes → group into a cluster manually
3. User types freely — no structure required
4. On blur / after 2s idle → **Connector agent** (background) classifies the note:
   - Type badge appears: Decision, Constraint, Question, Idea, Risk, Reference, Task
   - If classification seems wrong → click badge → dropdown to override
5. User keeps dumping. Canvas fills up organically.
6. Notes can be:
   - Moved (drag)
   - Resized (corner handle)
   - Colored (right-click → color picker, or auto-colored by type)
   - Connected (drag from edge dot to another note → creates edge)
   - Deleted (select → Backspace, with undo)

**Connector runs silently.** User never waits for it. If API key isn't set, notes just don't get classified — everything else works.

---

## Flow 4: Edge Inference (Automatic Connections)

1. As notes accumulate, Connector agent infers edges between related notes
2. Edges appear as light lines between notes (subtle, not distracting)
3. Edge types: supports, contradicts, depends_on, related, refines
4. User can:
   - Hover an edge → see its type + confidence
   - Click an edge → confirm, change type, or dismiss
   - Manually draw edges between any two notes
5. Dismissed edges don't reappear

---

## Flow 5: Canvas Views

User switches between views of the same data:

### 5a — Spatial Canvas (default)
- Free-form 2D canvas, infinite scroll
- Notes as cards, edges as lines
- Zoom with scroll/pinch, pan with drag on empty space

### 5b — Graph View
- Force-directed graph layout
- Nodes = notes, edges = connections
- Click node → highlight connected subgraph
- Filter by note type, layer, or project

### 5c — Kanban View
- Columns = note types (or custom grouping)
- Drag notes between columns to reclassify
- Useful for triage: "these Questions need answers, these Decisions are final"

### 5d — Roadmap View (unlocks after Intents exist)
- X-axis: time, Y-axis: Intents
- Epics shown as blocks under Intents
- Drag to reschedule

### View switching
- Tabs in top nav, or `⌘1`/`⌘2`/`⌘3`/`⌘4`
- All views share the same data — changes in one reflect everywhere
- Timeline scrubber available in every view (see Flow 16)

---

## Flow 6: Cluster Detection + Synthesis

The bridge from brain dump to structured planning.

1. After enough notes exist, **Synthesizer agent** detects clusters (groups of related notes)
2. **Side rail notification:** "7 notes look like one feature — Review cluster"
3. User clicks → **Cluster preview panel:**
   - List of notes in the cluster
   - AI-drafted title + one-paragraph summary
   - Contradictions flagged: "Note A says X, Note B says the opposite"
   - Duplicates flagged: "This note from 2 weeks ago says the same thing"
4. User can:
   - **Accept** cluster as-is
   - **Edit** cluster: add/remove notes, rename
   - **Dismiss** → cluster disappears from side rail (can re-trigger later)
   - **Split** → break into two clusters
5. Accepted cluster gets a visual group on canvas (dashed border, shared color)

---

## Flow 7: Compile to Epic (Canvas → L3)

1. On an accepted cluster card → **"Compile to Epic"** button
2. **Preview screen:**
   - Left: source canvas notes (read-only, scrollable)
   - Right: AI-drafted epic with sections:
     - PRD (product requirements)
     - Tech Plan
     - Open Questions
     - Decision Log (auto-populated from Decision-typed notes)
3. User reviews the draft:
   - **Accept** → creates Epic node linked to all source canvas notes
   - **Edit** → inline editing of any section before accepting
   - **Reject** → dismiss, can re-trigger later
4. Accepted epic appears in the roadmap and can be assigned to an Intent

---

## Flow 8: Intent Management (L4)

Intents are the "why" — high-level goals that organize epics.

1. `⌘K` → "New Intent" or from Roadmap view → "+" button
2. Fill in:
   - Name (e.g., "Ship real-time collaboration")
   - Target outcome (one sentence)
   - Deadline (optional)
   - Status: active / paused / achieved / abandoned
3. Link epics to intents:
   - Drag epic onto intent in roadmap view
   - Or from epic detail → "Parent Intent" dropdown
4. Orphan detection: epics without an intent get flagged in side rail
5. **AI re-planning** (Flow 8a):
   - "Re-derive next N weeks" button on roadmap
   - Input: new constraints (text box) + current intents/epics
   - Output: proposed re-arrangement with rationale
   - Same accept/edit/reject flow as compilation

---

## Flow 9: Epic Editor (L3 Detail)

1. Click an epic → opens **Epic Editor** (full-width panel or separate page)
2. Structured document with TipTap editors:
   - **PRD** section — product requirements
   - **Tech Plan** section — technical approach
   - **Open Questions** — unresolved items
   - **Decision Log** — decisions made (linked to canvas Decision notes)
3. Sidebar shows:
   - Source canvas notes (clickable → navigate to canvas)
   - Linked constraints and risks
   - Version history (click to diff)
4. **Clarification dialogue** (Flow 9a):
   - AI asks questions about the epic: "What authentication method?" "What's the expected scale?"
   - Chat-within-epic, scoped conversation
   - Answers auto-fold into PRD or Tech Plan sections
   - Questions can be marked resolved or deferred
5. **Stale detection** (Flow 9b):
   - When a source canvas note changes → epic gets orange "Stale" badge
   - Click → diff view: current epic vs re-derived version
   - Accept changes per-section or dismiss

---

## Flow 10: Phase Generation (L3 → L2)

1. From epic detail → **"Generate Phases"** button
2. **Architect agent** proposes 2-5 ordered phases:
   - Each phase: objective, file-level change list, verification criteria, complexity estimate
   - Phases ordered by dependency
3. **Preview screen:**
   - Phase cards in order, each expandable
   - Source epic visible in sidebar
4. User can:
   - **Accept all** → phases created under epic
   - **Edit** → modify individual phases before accepting
   - **Add/remove phases** manually
   - **Reorder** by dragging
5. After acceptance → phases appear as a list under the epic
6. Phase operations:
   - Drag to reorder
   - Merge two phases into one
   - Split one phase into two
   - Insert between existing → AI re-derives downstream context
   - Status: ready for ticketing → in progress → in review → done

---

## Flow 11: Ticket Generation (L2 → L1)

1. From phase detail → **"Generate Tickets"** button
2. **Decomposer agent** proposes 3-10 tickets:
   - Each ticket: title, intent paragraph, file paths, acceptance criteria, prompt payload
   - Context bundle: compiled from ticket → phase → epic → intent → canvas notes
   - Recommended agent (Claude Code / Cursor / Codex)
   - Target repo (for multi-repo projects)
3. **Preview screen:**
   - Ticket cards, each expandable to show full detail
   - Source phase visible in sidebar
4. User can accept/edit/reject (same pattern)
5. After acceptance → ticket cards appear under the phase
6. Ticket card shows: title, file paths, status, complexity, repo badge
7. Ticket detail panel: full prompt payload, acceptance criteria checklist
8. Status lifecycle: open → in progress → in review → done → verified

---

## Flow 12: Export & Handoff (L1 → Code)

Butterfly's output. This is how work leaves Butterfly and enters coding tools.

### 12a — Single Ticket Export
1. On a ticket card → **"Copy Command"** button (or `⌘⇧C`)
2. Copies to clipboard: `claude --print "..."` with full compiled context
3. User pastes into terminal → Claude Code executes
4. Alternative: **"Download CLAUDE.md"** → markdown file with full context

### 12b — Phase Batch Export
1. On a phase → **"Export Phase"** button (or `⌘⇧E`)
2. Options:
   - **Copy All Commands** → sequential commands respecting dependency order
   - **Download All CLAUDE.md** → zip of one file per ticket + README with execution order
   - **Export for Conductor** → JSON config with:
     - Tickets as tasks
     - Dependency graph
     - Parallelization waves (which tickets can run simultaneously)
     - Repo assignments
3. User takes the export to their coding tool of choice

### 12c — Bulk Export
1. From epic or roadmap → **"Export All Ready Tickets"**
2. Filters to tickets in "open" status across all phases
3. Same export format options as phase batch

### 12d — Custom Templates
1. Settings → Export Templates
2. User defines prompt structure for their team's conventions
3. Templates used for all future exports

---

## Flow 13: Project Onboarding (Import)

Bringing an existing project into Butterfly.

### 13a — GitHub Import
1. Settings → "Connect GitHub" → OAuth flow → select repos
2. **Scanning phase:** Butterfly fetches commits, PRs, branches, file tree, docs
3. **Cartographer agent** maps:
   - PRs → Tickets (with status based on merge state)
   - Grouped PRs → Epics (by semantic similarity)
   - Release tags/milestones → Intents
   - PR bodies → Canvas notes (decisions, constraints, references)
4. **Review & Accept UI:**
   - Preview proposed graph: nodes colored by source, confidence scores
   - Edit before import: reclassify, merge, split, delete, add edges
   - Accept → commit entire graph
5. Synthetic events backfilled (dated to original timestamps)
6. Timeline scrubber immediately works for historical data

### 13b — Markdown Folder Import
1. "Import Markdown" → select folder
2. Parser: headings → structure, bullets → notes, blockquotes → decisions
3. Same review & accept flow

### 13c — Linear / Jira / Notion Import (M3)
1. Connect via OAuth
2. Fetch projects/issues/documents
3. Cartographer maps to Butterfly layers
4. Review & accept
5. Incremental re-sync available after initial import

### 13d — Paste Import
1. `⌘V` a block of text on canvas
2. AI splits into individual notes, classifies each
3. User reviews the split before confirming

---

## Flow 14: Multi-Project Management

### 14a — Project Switching
1. Sidebar shows project list
2. Click to switch, or `⌘K` → type project name
3. Quick-switch: `⌘1`/`⌘2`/`⌘3` for first three projects
4. Each project has its own canvas, roadmap, epics, etc.

### 14b — Project CRUD
1. Sidebar → "+" to create project
2. Enter name, optional color, optional description
3. Archive / delete from project settings
4. Archived projects hidden from switcher but accessible via search

### 14c — Global Pool
1. Notes not assigned to any project live in the **Global Pool**
2. Accessible from sidebar → "Unassigned"
3. Drag a note onto a project in sidebar → assigns it
4. Cross-project Synthesizer may suggest: "This note in Project A relates to Epic in Project B"

### 14d — Cross-Project Views
1. **Unified Roadmap:** all projects' intents on one timeline, filter by project
2. **Cross-project search:** `⌘K` finds nodes across all projects (project badge on results)
3. **Cross-project graph:** see connections between projects

### 14e — Multi-Repo Setup
1. Project settings → "Repos" tab
2. Connect repos (from GitHub integration)
3. Assign primary repo, add additional repos
4. Repos can be shared across projects
5. Architect agent reads file trees from all repos in the project
6. Tickets are scoped to a specific repo (repo badge on ticket card)
7. Export commands include `cd <repo-dir>` for the correct repo

---

## Flow 15: Strategist + Historian Agents

### 15a — Strategist (Proactive)
- Side rail suggestions:
  - "Intent X is blocked by unresolved Question Y"
  - "These two intents contradict each other"
  - "Intent Z has been stale for 3 weeks"
- "What if" analysis: "What changes if I drop Intent X?" → shows impact

### 15b — Historian (On-Demand)
- Click any node → "Why does this exist?" in context menu
- Walks the graph backwards: ticket → phase → epic → intent → canvas notes
- Shows the full provenance chain
- Decision log per intent: auto-generated from Decision-typed canvas notes

### 15c — Round Table Mode
- `⌘K` → "Ask all agents" → type a question
- Example: "Should we kill module X?"
- Each agent responds from its perspective:
  - Strategist: milestone/roadmap impact
  - Architect: code/dependency impact
  - Historian: why it was built, original context
  - Reviewer: open PRs affected
- Responses in a multi-column or tabbed view

---

## Flow 16: Timeline Scrubber (Temporal Navigation)

Available in every view. Time is a first-class citizen.

1. **Scrubber bar** at bottom of every view
2. Drag to any past point → view reconstructs to that moment
3. What changes per view:
   - **Canvas:** notes appear/disappear, content reverts, edges change
   - **Graph:** nodes and connections at that point in time
   - **Roadmap:** plan as it looked then (intents, epics, phases)
   - **Kanban:** card positions and statuses at that time
4. **Markers** on the timeline for significant events:
   - Epic compiled, phase generated, ticket exported
   - PR merged, status change, re-plan
5. **Playback mode:**
   - Press play → watch the project evolve over time
   - Configurable speed (1x, 5x, 20x)
   - Pause at any point to inspect
6. **Node-level history:**
   - Click any node → "History" tab → see all versions
   - Diff between any two versions

---

## Flow 17: Settings & Configuration

### 17a — AI Provider Setup
1. Settings → "AI Providers"
2. Add API key per provider: Anthropic, OpenAI, Google, DeepSeek
3. On save → key validated (test call to list models)
4. Key stored encrypted (never visible again, only masked: `sk-ant-••••`)
5. Health status shown: green (valid), yellow (near rate limit), red (invalid/expired)

### 17b — Agent Model Assignment
1. Settings → "AI Providers" → "Agent Configuration"
2. Per-agent model selector:
   - Connector: fast + cheap (e.g., Haiku)
   - Synthesizer: mid-tier (e.g., Sonnet)
   - Architect: high capability (e.g., Opus)
   - etc.
3. Cost estimates shown inline
4. "Use for all agents" button for quick setup

### 17c — Cost Controls
1. Settings → "AI Providers" → "Spending"
2. Daily spend limit: `$[___]`
3. Usage chart: spend per agent per day
4. When cap hit → agents stop, user notified, can increase cap or wait

### 17d — Export Templates
1. Settings → "Export"
2. Custom prompt templates for ticket export
3. Default templates provided (Claude Code, Cursor, generic markdown)

### 17e — Workspace Settings
1. Settings → "Workspace"
2. Workspace name, default project settings
3. Member management (Mode C only): invite by email, role-based access

---

## Flow 18: GitHub Integration (Passive Tracking)

After export, Butterfly passively tracks what happens in GitHub.

1. User exports tickets → runs commands in Claude Code → code gets written
2. Developer (or agent) creates branch: `butterfly/<ticket-id>-<slug>`
3. Butterfly detects branch (webhook) → auto-links to ticket → status: "in progress"
4. PR opens → Butterfly auto-populates PR body with ticket spec + context
5. **Reviewer agent** runs on PR:
   - Compares diff against ticket acceptance criteria
   - Posts structured comment: per-AC pass/fail, drift items with severity
6. PR merges → ticket status: "done" → phase progress bar updates → epic completion % updates
7. PR closed without merge → ticket: "needs-rework"

User doesn't have to do anything after export. Butterfly watches and updates.

---

## Flow 19: Lenses (Saved Views)

1. Lens = saved combination of: visible layers + filters + layout mode
2. Built-in lenses:
   - **Roadmap:** L4 (Intents) + L3 (Epics), timeline layout
   - **Sprint:** L2 (Phases) + L1 (Tickets) in current phase, kanban
   - **Implementation:** L1 (Tickets) with file paths, grouped by repo
   - **Origin:** pick any node → see everything upstream
   - **Impact:** pick any node → see everything downstream
3. Custom lenses: pick layers, filters, layout → save with a name
4. Lens switcher in top nav
5. **Rabbit-hole drilldown:** click any node → side panel shows full vertical slice (L0 through L5), every layer expandable, all links clickable

---

## Flow 20: Search & Command Palette

1. `⌘K` opens command palette
2. Capabilities:
   - Search all nodes (notes, intents, epics, phases, tickets) across all projects
   - Quick actions: "New note", "New intent", "Compile cluster", "Export phase"
   - Navigation: jump to any view, project, or specific node
   - Settings shortcuts
3. Results show: node title, type badge, project badge, layer indicator
4. Recent commands remembered, fuzzy matching on all fields

---

## Flow 21: Documentation Generation

1. From any node → context menu → "Generate docs"
2. **why.md per file:** given a file path → all PRs that touched it → walk up the chain → explains why each change was made
3. **Changelog per milestone:** auto-generated from merged PRs grouped by intent
4. **Decision log per intent:** from Decision-typed canvas notes + clarification dialogues
5. Export as markdown, committable to repo

---

## Daily Workflow Summary

A typical day with Butterfly:

1. **Morning brain dump** (Flow 3): Open canvas, dump thoughts about what you learned yesterday, new requirements, questions
2. **Review suggestions** (Flow 6): Check side rail — Synthesizer found a new cluster, Strategist flagged a stale intent
3. **Compile** (Flow 7): Accept the cluster → compile to epic → edit the spec
4. **Plan** (Flow 10-11): Generate phases and tickets for the epic
5. **Export** (Flow 12): Copy commands for today's tickets → paste into Claude Code or Conductor
6. **Check progress** (Flow 18): Glance at roadmap — PRs merged overnight updated ticket statuses automatically
7. **End of day** (Flow 16): Scrub timeline back to see how the project evolved this week
