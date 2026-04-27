# Butterfly — Multiple Projects & Multi-Repo Support

A single Butterfly instance supports many projects, and each project can span multiple repositories. Cross-project thinking is a feature, not a bug.

---

## Hierarchy

```
Workspace (top-level container)
├── Project A: "Butterfly" (repos: butterfly-frontend, butterfly-backend)
│   ├── L5 Canvas notes
│   ├── L4 Intents
│   ├── L3 Epics
│   ├── L2 Phases
│   ├── L1 Tickets (each scoped to a specific repo)
│   └── L0 PRs (linked to their repo)
│
├── Project B: "Marketing Site" (repo: marketing)
│   └── ...
│
├── Project C: "Shared Infra" (repos: butterfly-backend, marketing, infra-tools)
│   └── ... (same repo can appear in multiple projects)
│
└── Global Pool (notes not assigned to any project — cross-cutting ideas)
    └── Canvas notes that haven't been assigned yet
```

### Why Workspaces?

- **Mode A/B (single user):** One default workspace, transparent. The user never thinks about it.
- **Mode C (multi-user):** Workspaces isolate teams. Each workspace has its own members, projects, repos, and settings. A user can belong to multiple workspaces (personal + company).

---

## Multi-Project Features

### Project Switcher

```
┌─────────────────────────────────────────┐
│  ⌘K → "Switch project"                  │
│                                          │
│  ● Butterfly              3 repos, 142 notes │
│  ○ Marketing Site     1 repo, 23 notes   │
│  ○ Shared Infra       3 repos, 67 notes  │
│  ──────────────────────────────────       │
│  ○ Global Pool        12 unassigned notes │
│  ──────────────────────────────────       │
│  + Create new project                     │
└─────────────────────────────────────────┘
```

- Sidebar shows current project with quick-switch dropdown
- Each project has its own canvas, roadmap, and compilation pipeline
- Keyboard shortcut: `⌘1`/`⌘2`/`⌘3` to switch between recent projects
- Project color coding carries through all views (notes, edges, graph nodes)

### Global Pool

Notes that aren't assigned to a project live in the Global Pool:
- Capture ideas that don't belong anywhere yet
- The Synthesizer scans the Global Pool and suggests: "This note might belong in Project Butterfly"
- Drag a note from Global Pool to a project canvas to assign it
- Notes can be explicitly marked as "cross-project" — visible in multiple project canvases

### Cross-Project Views

Some views span all projects in a workspace:

**Unified Roadmap:** All Intents from all projects on one timeline. Filter by project. See how projects' milestones overlap and compete for time.

**Cross-Project Graph:** Show edges between nodes in different projects. "This Shared Infra epic blocks this Butterfly epic" — visible as a cross-project edge.

**Cross-Project Search:** ⌘K search finds nodes across all projects (with project badge on each result).

**Cross-Project Synthesis:** The Synthesizer can identify overlap between projects: "These notes in Butterfly and these notes in Marketing Site are talking about the same auth system."

### Project Settings

Each project has independent settings that override workspace defaults:

```jsonc
{
  // Agent model overrides (project-specific)
  "agentProviders": {
    "architect": { "providerId": "anthropic", "modelId": "claude-opus-4-6" }
  },
  // Which repos are linked
  "repos": ["butterfly-frontend", "butterfly-backend"],
  // Primary repo (for branch conventions)
  "primaryRepo": "butterfly-backend",
  // Canvas preferences
  "canvas": { "background": "dots", "snapToGrid": true },
  // Notification preferences
  "notifications": { "prMerged": true, "agentCompleted": true }
}
```

---

## Multi-Repo Support

### The Problem

Real products aren't one repo. A typical project might have:
- `butterfly-frontend` — SvelteKit app
- `butterfly-backend` — Rust API
- `butterfly-infra` — Terraform/Pulumi IaC
- `butterfly-docs` — documentation site
- `shared-libs` — shared utilities used by multiple projects

A single Epic ("Add Stripe checkout") might need changes in the frontend, backend, and infra repos. A Phase might produce tickets for different repos. The Architect needs to read all of them.

### Data Model

Projects link to repos via the `project_repo` join table (see `04-data-model.md`):

```
Project "Butterfly" ──┬── butterfly-frontend  (primary: false)
                  ├── butterfly-backend   (primary: true)
                  └── butterfly-infra     (primary: false)

Project "Marketing" ── marketing      (primary: true)

Project "Shared Infra" ──┬── butterfly-backend   (shared with Butterfly)
                         ├── marketing       (shared with Marketing)
                         └── infra-tools     (unique to this project)
```

Key rules:
- A repo can belong to multiple projects (shared repos are first-class)
- Each project has one **primary repo** — used for branch naming convention (`butterfly/<ticket-id>-<slug>`)
- Non-primary repos are still fully accessible to the Architect agent

### Repo-Scoped Tickets

When the Decomposer generates tickets from a Phase, each ticket is scoped to a specific repo:

```
Phase: "Add Stripe webhook handler"
├── Ticket T-42: "Add webhook endpoint"
│   └── repo: butterfly-backend
│       └── files: src/routes/payments.rs, src/webhooks/stripe.rs
│
├── Ticket T-43: "Add payment status UI"
│   └── repo: butterfly-frontend
│       └── files: src/routes/payments/+page.svelte, src/lib/components/PaymentStatus.svelte
│
└── Ticket T-44: "Add Stripe webhook secret to secrets manager"
    └── repo: butterfly-infra
        └── files: modules/secrets/main.tf
```

The ticket's `payload.repoId` field determines:
- Which repo the Architect reads when planning file-level changes
- Which repo the exported command `cd`s into (e.g., `cd ~/repos/butterfly-backend && claude --print "..."`)
- Which repo's branch naming convention to use
- Where the PR auto-link looks for matching branches

### Multi-Repo Architect

The Architect agent needs to understand the full codebase across repos:

```rust
// backend/src/agents/architect.rs

pub async fn plan_phase(
    epic: &Node,
    project_repos: &[RepoWithTree],  // all repos in the project
) -> Vec<Phase> {
    // 1. Fetch file trees for ALL repos in the project
    // 2. Identify which repos are affected by this epic
    // 3. Plan phases that may span repos
    // 4. For each ticket within a phase, assign to the correct repo
    // 5. Cross-repo dependencies are explicit:
    //    "T-44 (infra) must complete before T-42 (backend) can deploy"
}

pub struct RepoWithTree {
    pub repo: Repo,
    pub tree: Vec<FileEntry>,
    pub readme: Option<String>,
}
```

### Cross-Repo Edges

Edges can link nodes scoped to different repos:

```
Ticket T-42 (backend) ──blocks──▶ Ticket T-43 (frontend)
  "Backend endpoint must exist before frontend can call it"

Ticket T-44 (infra) ──blocks──▶ Ticket T-42 (backend)
  "Secret must be provisioned before endpoint can verify webhooks"
```

These show up in the Graph view as cross-repo edges (styled differently, e.g. dashed + repo color).

### Multi-Repo File Lookup

The "File → ticket reverse lookup" feature works across all repos in a project:

```
"Show me everything that touched src/routes/payments.rs in butterfly-backend"
→ Tickets T-42, T-78, T-103
→ Epics: "Stripe Integration", "Payment Refunds"
→ Intents: "Launch Payments v1", "Reduce Churn"
```

```
"Show me everything that touched the payments module across ALL repos"
→ butterfly-backend: src/routes/payments.rs, src/webhooks/stripe.rs
→ butterfly-frontend: src/routes/payments/+page.svelte
→ butterfly-infra: modules/secrets/main.tf (Stripe webhook secret)
→ All linked to the same Epic chain
```

### why.md Across Repos

The `why.md` generator (Historian agent) works per-repo but can cross-reference:

```markdown
<!-- butterfly-backend/src/routes/payments.rs -->
# Why does this file look like this?

## PR #142 — Add Stripe webhook endpoint (2026-03-15)
- Ticket: T-42 "Add webhook endpoint"
- Phase: "Add Stripe webhook handler"
- Epic: "Stripe Integration"
- Intent: "Launch Payments v1"
- Also see: butterfly-frontend PR #87 (payment status UI) and butterfly-infra PR #23 (secrets)
```

---

## Multi-Repo Export

When exporting a Phase with tickets across multiple repos, Butterfly generates repo-aware commands and Conductor configs:

```
Phase: "Add Stripe webhook handler" — Export for Conductor

{
  "wave1": [
    { "id": "T-44", "repo": "butterfly-infra", "cd": "~/repos/butterfly-infra",
      "prompt": "...Provision Stripe webhook secret..." }
  ],
  "wave2": [
    { "id": "T-42", "repo": "butterfly-backend", "cd": "~/repos/butterfly-backend",
      "prompt": "...Add webhook endpoint...\n\nNote: T-44 (infra) provisions the secret." }
  ],
  "wave3": [
    { "id": "T-43", "repo": "butterfly-frontend", "cd": "~/repos/butterfly-frontend",
      "prompt": "...Payment status UI...\n\nNote: Backend endpoint at GET /api/payments/status" }
  ]
}
```

Dependency ordering is automatic: the Decomposer agent marks cross-repo ticket dependencies, and the export system respects them in wave ordering.

---

## UI: Project Management

### Create Project

```
┌─────────────────────────────────────────┐
│  New Project                             │
│                                          │
│  Name: [Butterfly_________________]          │
│  Description: [Planning tool build___]   │
│  Color: [● blue ▾]                       │
│                                          │
│  Repositories:                           │
│  ┌───────────────────────────────────┐   │
│  │ ✓ butterfly-frontend    ○ primary     │   │
│  │ ✓ butterfly-backend     ● primary     │   │
│  │ ✓ butterfly-infra       ○ primary     │   │
│  │ ○ marketing         (other proj)  │   │
│  │ + Connect new repo                │   │
│  └───────────────────────────────────┘   │
│                                          │
│  Import sources: (optional)              │
│  [+ GitHub] [+ Linear] [+ Notion]        │
│                                          │
│  [Cancel]                [Create Project] │
└─────────────────────────────────────────┘
```

### Project Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  Butterfly (project)                                 [Settings]  │
│                                                              │
│  Repos: butterfly-frontend • butterfly-backend • butterfly-infra         │
│                                                              │
│  ┌─────────┬─────────┬──────────┬──────────┐               │
│  │ 142     │ 7       │ 12       │ 34       │               │
│  │ Notes   │ Epics   │ Phases   │ Tickets  │               │
│  └─────────┴─────────┴──────────┴──────────┘               │
│                                                              │
│  Active Intents:                                             │
│  ● Launch Payments v1          ████████░░ 78%               │
│  ● Reduce Auth Friction        ███░░░░░░░ 30%               │
│  ● Performance Overhaul        █░░░░░░░░░ 10%               │
│                                                              │
│  Recent Activity:                                            │
│  • PR #142 merged in butterfly-backend (T-42)    2h ago          │
│  • Epic "Payment Refunds" compiled           5h ago          │
│  • 3 new notes added to canvas               today          │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Timeline

### M1: Single Project Foundation (Weeks 1-4)

The data model supports multiple projects from day 1, but the UI defaults to a single project for simplicity:

- `workspace` and `project` tables in initial migrations
- Auto-create a default workspace + default project on first run
- Project switcher hidden until user creates a second project
- Global Pool available from the start (unassigned notes)
- `repo` and `project_repo` tables ready but not wired to UI yet

### M2: Multi-Project UI (Weeks 5-7)

- **Week 5:** Project CRUD UI — create, rename, delete, archive projects
- **Week 5:** Project switcher in sidebar + ⌘K
- **Week 6:** Project color coding in all views
- **Week 6:** Global Pool view — unassigned notes, drag-to-assign
- **Week 7:** Cross-project search (⌘K finds across all projects)
- **Week 7:** Unified roadmap view (all projects' Intents on one timeline)

### M2: Multi-Repo (Weeks 8-9)

- **Week 8:** Repo management UI — connect repos, assign to projects, set primary
- **Week 8:** `project_repo` join table wired up
- **Week 8:** Architect agent reads file trees from all repos in a project
- **Week 9:** Decomposer assigns tickets to specific repos
- **Week 9:** Ticket UI shows repo badge
- **Week 9:** Cross-repo edge visualization in Graph view

### M3: Multi-Repo Integration (Weeks 11-14)

- **Week 11:** Export commands include `cd <repo-dir>` per ticket's target repo
- **Week 12:** Branch convention respects repo-specific primary
- **Week 12:** PR auto-link scans all project repos
- **Week 13:** Conductor swarm JSON exports with cross-repo dependency waves
- **Week 13:** Cross-repo why.md generation
- **Week 14:** Cross-project Synthesizer (detect overlap between projects)

---

## Edge Cases

### Shared Repos
A repo belonging to multiple projects: PRs auto-link to the correct project based on the branch naming convention (`butterfly/<project-slug>/<ticket-id>-<slug>`). If ambiguous, Butterfly asks.

### Repo Removal
Removing a repo from a project doesn't delete nodes — it disconnects. Tickets scoped to that repo get a "repo disconnected" warning. PRs remain linked as historical artifacts.

### Project Deletion
Soft-delete: project goes to "Archived" state, nodes hidden from views but preserved in DB. Hard-delete requires explicit confirmation and purges all nodes, events, and import mappings.

### Cross-Project Nodes
A node can optionally appear in multiple projects (via a `node_project` join table if needed, but for v1 each node belongs to exactly one project). Cross-project edges handle the linking. Moving a node between projects is a drag-and-drop operation.

### Large Workspaces
Index per-project views by `project_id`. Workspace-level views (unified roadmap, cross-project search) use materialized views or pre-computed aggregations for performance at scale (100+ projects, 10k+ nodes).
