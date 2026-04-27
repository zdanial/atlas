# Butterfly — Product Requirements Document

> A spatial thinking canvas that compiles brain dumps into structured specs, tickets, and exportable commands — with full traceability from idea to merged PR.

---

## 1. Product Vision

Butterfly is a tool for thinking, planning, and documenting software projects. It replaces the gap between "I have thoughts in my head" and "I have an organized plan with tickets." The core loop:

1. **Brainstorm** — think out loud in conversation trees
2. **Plan** — promote mature ideas into a structured, dependency-aware project plan
3. **Document** — all work is automatically documented as a byproduct of brainstorming and planning
4. **Execute** — track progress against the plan, with live status

There is no separate "documentation phase." Docs are a view of the same data that brainstorming and planning produce. Nothing is maintained in two places.

---

## 2. Three Zones

The app has three zones: **Brainstorming**, **Planning**, and **Docs**. The layout is a flexible tiling system — one zone full-screen by default, with the ability to split into two zones side-by-side. E.g., brainstorming + planning when promoting items, planning + docs when reviewing.

### 2.1 Brainstorming

The brainstorming zone is for unstructured thinking via conversation trees.

#### Conversation Trees

- Each **root node** starts an independent conversation tree. A project can have many trees.
- A node represents a **topic/thread**, not a single message. A node may contain 5-10+ back-and-forth chat messages before branching.
- **Branching** happens when a conversation naturally splits into subtopics:
  - The LLM can propose "let's branch this into a separate thread" — creating a child node.
  - The user can manually fork by clicking a "new branch" button.
- **Child node context**: When a child is created, it receives selective context — the specific messages that prompted the fork, plus a brief summary of the parent thread. Not the full parent history (avoids token bloat at depth).

#### Canvas + Focused View (Hybrid Navigation)

- **Canvas view**: Birds-eye map of the conversation tree. Nodes are cards connected by edges showing the tree structure. For orientation, not detailed work.
- **Focused view**: Clicking a node opens it into a full thread view for active chatting. The tree structure is visible as navigation (breadcrumb/sidebar).
- The canvas is the map; the focused view is where you work.

#### Canvas Auto-Layout

- Tree nodes are **automatically arranged** in a tree layout (top-down or left-right).
- Users can **drag nodes** for temporary repositioning — useful for seeing things a certain way.
- Drag positions are **transient by default** — refreshing restores auto-layout.
- Users can **lock** a node's position to persist it across refreshes. Unlocked = auto-layout, locked = manual override.

#### Compaction

- Compaction replaces a branch of the tree with a **single AI-generated summary node**.
- The original nodes are **archived** — hidden from the active tree but still accessible if you drill into the summary node.
- The tree simplifies over time. Summary nodes are first-class nodes with their own content and chat capability.
- This mirrors how memory works: you don't remember every detail, you remember the conclusions.

---

### 2.2 Planning

The planning zone is for structured project management with dependency-aware sequencing.

#### Plan View (Outline + Sequence Bars)

Already implemented. A single unified view:
- **Left**: Collapsible outline tree showing the full hierarchy (features → epics → phases → tickets).
- **Right**: Inline horizontal sequence bars positioned by dependency wave. Bars at the same x-position are parallel. Dependency arrows connect items.
- **Status**: Click status dots to cycle draft → active → done.
- **Progress**: Parent nodes show completion counts and progress stripes.

#### Planning Inbox (Sidebar)

A slide-in sidebar panel within the planning zone for reviewing items before they enter the plan.

**How items enter the inbox:**
- **Manual promote**: User clicks "Promote" on a brainstorming node.
- **LLM-suggested**: During brainstorming, the LLM can propose "this should be a plan item," which auto-queues to the inbox.
- Inbox items are visually distinguished by source (manual vs LLM-suggested) for triage.

**Inbox item review (card-based):**
- Each item is a card showing: title, source brainstorming node link, LLM's suggested type/placement.
- **Expandable**: Click to see full brainstorming context and the LLM's suggested decomposition (e.g., "this idea → 1 epic + 3 tickets").
- **Preview**: Shows where items would land in the existing plan tree.
- **Cherry-picking**: Accept/reject individual items from a suggested bundle (accept the epic but not all tickets yet).
- **Dependencies**: LLM suggests dependencies as part of the integration proposal ("this blocks X," "this comes after Y"). User can modify during review and rewire later in the plan view.

#### Project Dashboard

A per-project view within the planning zone. Minimal to start:
- **Active Now**: Items with status "active" — what's currently in progress.
- **Up Next**: Next wave of unblocked items from the dependency ordering — what's ready to start.

More sections (blockers, recent completions, inbox count) will be added based on real usage.

---

### 2.3 Docs

Documentation is not a separate artifact. It is a **filtered, formatted view** of existing data:

- **Compaction summaries** from brainstorming → product context docs
- **Completed plan items** with descriptions and acceptance criteria → technical specs
- **Decision-type nodes** → Architecture Decision Records (ADRs)
- **Goal/constraint nodes** → project strategy docs

The docs zone renders this data in a readable, wiki-like format with cross-links. No separate maintenance. If the underlying brainstorming or plan data changes, docs update automatically.

---

## 3. Project Context (`_project.md`)

Each project has a `_project.md` file at the root of its folder. This file is a **bidirectional projection** of node data.

**Sections** (all derived from nodes, all editable):
- `vision` — from goal-type nodes
- `constraints` — from constraint-type nodes
- `tech-stack` — from relevant tags/nodes
- `active-goals` — from goal-type nodes with status "active"
- `open-decisions` — from unresolved decision-type nodes
- `key-risks` — from risk-type nodes
- `team` — from team-related nodes

**Bidirectional**: Reading the file compiles from nodes. Editing a section writes back to the underlying nodes (updating existing ones or creating new ones). There is no "override" or "staleness" — the file IS the data.

This file is automatically included in LLM context for all conversations within the project.

---

## 4. Storage: Markdown Files on Disk

### 4.1 Architecture

- **Source of truth**: Markdown files on disk in a flat project folder.
- **Runtime cache**: IndexedDB in the browser for fast reactive reads.
- **Sync**: On startup, read markdown folder → hydrate IndexedDB. On change, write to IndexedDB (instant reactivity) → async flush to markdown file.
- **File I/O**: All reads/writes go through the Rust/Axum backend. Frontend talks API only.

### 4.2 Folder Structure

Flat — all nodes as `.md` files in one directory. Hierarchy expressed through frontmatter (`parentId`) and `[[wikilinks]]`, not folder nesting.

```
my-project/
  _project.md                    # Project context (bidirectional)
  auth-system.md                 # Feature node
  oauth-flow.md                  # Epic node
  .oauth-flow.chat.md            # Chat history sidecar
  db-schema-ticket.md            # Ticket node
  session-brainstorm.md          # Brainstorming root node
  .session-brainstorm.chat.md    # Chat history sidecar
  token-refresh-thread.md        # Brainstorming child node
  ...
```

### 4.3 File Format

YAML frontmatter for all structured data. Body is clean markdown.

```markdown
---
id: abc-123
type: epic
status: active
layer: 3
tags: [auth, backend]
parentId: def-456
sortOrder: 2
payload:
  openQuestions:
    - How to handle token refresh?
---

# OAuth2 Flow

The authentication system uses OAuth2 with PKCE for secure
authorization without exposing client secrets...
```

### 4.4 Chat History

Stored in **sidecar files** — dot-prefixed to hide from casual browsing.

- Node file: `oauth-flow.md` (clean content)
- Chat file: `.oauth-flow.chat.md` (full message history)

Chat files contain the raw conversation (user/assistant messages, proposals). The node's body contains the refined/distilled content.

### 4.5 Interoperability

- Files are standard markdown — openable in Obsidian, VS Code, or any text editor.
- YAML frontmatter is the Obsidian/Jekyll convention — compatible with existing tooling.
- `[[wikilinks]]` for cross-references — Obsidian-native.
- Git-friendly — every change is a file diff.

---

## 5. Dev Integration (Light)

The data model stays generic (epic, phase, ticket work for any domain). Optional metadata fields enable dev context when present:

- **Git branch** linked to a ticket
- **PR status** (open, merged, closed)
- **File paths** referenced by a plan item

These are stored in the node's `payload` frontmatter. The UI shows dev-relevant info when these fields are populated. No GitHub sync or bidirectional integration — just metadata.

---

## 6. LLM Integration

### 6.1 Chat

Every node has a chat capability. The LLM responds with `{message, proposals[]}`:
- `message`: 1-3 sentence conversational reply.
- `proposals`: Structured state mutations (create_node, update_node, create_edge, etc.) that the user reviews and accepts/rejects.

### 6.2 First Response Titles

New nodes are created with title "Untitled." The LLM's first response MUST include an `update_node` proposal setting a concise title based on the user's message. Auto-applied without user review.

### 6.3 Integration Proposals

When promoting brainstorming items to the plan, the LLM generates an integration proposal containing:
- Suggested decomposition (e.g., 1 epic + 3 tickets)
- Suggested type and layer for each item
- Suggested parent placement in the plan hierarchy
- Suggested dependencies ("blocks X," "after Y")

All bundled in one reviewable proposal with cherry-picking.

### 6.4 Model Routing

- **Brainstorming chat**: Haiku (fast, cheap for conversational flow)
- **Planning / integration**: Sonnet (stronger reasoning for decomposition and dependency analysis)
- **Brain dump import**: Sonnet

### 6.5 Claude Code Container

A containerized Claude Code CLI wrapper (`services/claude-code/`) called through the Rust backend. Used for planning and brain dump operations that need stronger reasoning.

---

## 7. Milestones

### M1: Clean Up Current State
Goal: Stabilize what exists so it's usable as a foundation.

- [ ] Simplify Notes zone — drop graph/roadmap views, keep canvas + kanban only
- [ ] Remove AI-inferred edge suggestions (ConnectorStatus) — focus on parent-child as primary relationship
- [ ] Merge Promote + Integrate into single "Promote" action that uses AI
- [ ] Double-click note card always opens modal (not inline title editing)
- [ ] First LLM response on new notes must set the title
- [ ] Add project-level tag management (rename, delete across all nodes)
- [ ] Clean up unused imports (undo/redo, dead code)

### M2: Planning Inbox
Goal: Items can flow from brainstorming into the plan through a review process.

- [ ] Define inbox item data model — source node link, suggested decomposition, LLM-suggested vs manual flag
- [ ] "Promote" action on brainstorming nodes sends item to inbox
- [ ] LLM can auto-suggest items for the inbox during brainstorming chat
- [ ] Inbox sidebar panel in Planning zone (slide-in, badge with count)
- [ ] Card-based review — expandable cards with source context, suggested decomposition preview
- [ ] Cherry-pick acceptance — accept/reject individual items from a bundle
- [ ] LLM-suggested dependencies included in integration proposals
- [ ] Accepted items land in the plan with type, parent, and dependency edges

### M3: Project Dashboard
Goal: At-a-glance project status for daily use.

- [ ] Dashboard view within Planning zone (tab or toggle alongside Plan view)
- [ ] "Active Now" section — items with status active, grouped by type
- [ ] "Up Next" section — next unblocked wave from dependency ordering
- [ ] Wire dashboard data from existing node store + dependency graph

### M4: Dogfood Gate
Goal: Use Butterfly to develop Butterfly. If this works, the core loop is validated.

- [ ] Create an Butterfly project within Butterfly
- [ ] Brainstorm features using the current notes canvas
- [ ] Promote brainstormed items through the inbox into the plan
- [ ] Track development progress on the plan view
- [ ] Identify and fix friction points from real usage
- [ ] All subsequent Butterfly milestones managed inside Butterfly itself

### M5: Conversation Trees
Goal: Replace flat notes canvas with tree-structured brainstorming.

- [ ] Conversation tree data model — root nodes spawn independent trees, parentId chains form branches
- [ ] Branching: LLM proposes child threads, user can manually fork
- [ ] Selective context for child nodes — fork messages + parent summary (not full history)
- [ ] Canvas auto-layout algorithm (top-down tree)
- [ ] Transient drag — manual repositioning resets on refresh unless position-locked
- [ ] Position lock per node (persisted flag)
- [ ] Focused thread view — click a node to open full chat with tree navigation sidebar/breadcrumb

### M6: Compaction Upgrade
Goal: Compaction works as tree simplification, not just note merging.

- [ ] Compact a branch → single summary node replaces the branch in the tree
- [ ] Original nodes archived (hidden but accessible by drilling into summary)
- [ ] Summary node is a first-class node — has its own chat, can be compacted again
- [ ] Compaction summaries become the raw material for docs

### M7: Markdown File Storage
Goal: Source of truth moves from IndexedDB to markdown files on disk.

- [ ] Rust backend endpoints for file I/O — read/write/list/delete `.md` files in project folder
- [ ] File format: YAML frontmatter (id, type, status, layer, tags, parentId, payload) + markdown body
- [ ] Flat folder structure — all nodes as `.md` files, hierarchy via frontmatter
- [ ] Chat history sidecar files (`.{slug}.chat.md`)
- [ ] File watcher — detect external edits (Obsidian, VS Code) and sync back to IndexedDB
- [ ] Startup hydration — read markdown folder → populate IndexedDB cache
- [ ] Write-through — app changes → IndexedDB (instant) → async flush to `.md` file
- [ ] Slug generation for filenames (from title, deduplicated)

### M8: Bidirectional Project Context
Goal: `_project.md` is a live two-way projection of node data.

- [ ] `_project.md` generation — compile sections from typed nodes (goals, constraints, risks, decisions, etc.)
- [ ] Read path: parse `_project.md` → extract sections → surface in app
- [ ] Write path: editing a section in the app updates underlying nodes; editing in a text editor creates/updates nodes on sync
- [ ] Auto-include in LLM context for all project conversations
- [ ] Section mapping: vision ↔ goal nodes, constraints ↔ constraint nodes, risks ↔ risk nodes, decisions ↔ decision nodes, tech-stack ↔ tagged nodes

### M9: Docs View
Goal: Auto-generated, always-current documentation.

- [ ] Docs zone renders existing data in wiki-like format
- [ ] Compaction summaries → product context docs
- [ ] Completed plan items (with descriptions, acceptance criteria) → technical specs
- [ ] Decision-type nodes → ADRs (Architecture Decision Records)
- [ ] `[[wikilink]]` cross-references between docs (resolved from node titles/slugs)
- [ ] Formatted, readable output — not raw frontmatter, clean rendered pages

### M10: Flexible Tiling Layout
Goal: Zones can be arranged based on the task at hand.

- [ ] Default: one zone full-screen
- [ ] Split: two zones side-by-side (e.g., brainstorming + planning for promoting)
- [ ] Keyboard shortcuts to switch/split zones
- [ ] Zone state persisted per session

### M11: Dev Integration
Goal: Light software development metadata on plan items.

- [ ] Optional `payload` fields: git branch, PR URL, PR status, file paths
- [ ] UI shows dev info when populated (badge/link on plan items)
- [ ] No bidirectional sync — metadata only, manually set or set via LLM proposals

### M12: Dashboard Expansion
Goal: Richer project monitoring based on dogfooding feedback.

- [ ] Blockers section — items that are blocked, with what's blocking them
- [ ] Recently Completed — last N items done, for momentum
- [ ] Inbox preview — pending count + top items
- [ ] Brainstorming activity — recent threads with open conversations
- [ ] Custom sections based on real usage patterns

---

## 8. Data Model Summary

### Node (universal entity)

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| type | enum | note, idea, question, decision, insight, risk, goal, constraint, feature, epic, phase, ticket |
| layer | 1-5 | L5 brainstorming, L4 feature, L3 epic, L2 phase, L1 ticket |
| status | enum | draft, active, done, archived |
| title | string | Display name |
| body | markdown | Freeform content |
| parentId | UUID? | Tree parent reference |
| tags | string[] | Categorization |
| payload | object | Type-specific structured fields |
| positionX/Y | number? | Canvas position (null = auto-layout) |
| positionLocked | boolean | Whether manual position persists |
| sortOrder | number | Ordering among siblings |
| projectId | UUID | Parent project |

### Edge (relationships)

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| sourceId | UUID | From node |
| targetId | UUID | To node |
| relationType | enum | supports, contradicts, blocks, implements, refines, belongs-to, compacts |

### File representation

- Each node → one `.md` file (frontmatter + body)
- Chat history → `.{node-slug}.chat.md` sidecar
- Project context → `_project.md` (bidirectional)

---

## 9. Success Criteria

The product is successful when we can use Butterfly to develop Butterfly:

1. Brainstorm a feature in a conversation tree
2. Compact the brainstorming into a summary
3. Promote the summary into the project plan with decomposition
4. Track progress on the plan items with dependency ordering
5. Reference the auto-generated docs for context on past decisions
6. All of the above stored as markdown files browsable in Obsidian/VS Code
