# Butterfly — Onboarding Existing Projects

Most users won't start from a blank canvas. They have a repo with history, a backlog in Linear/Jira/Notion, scattered docs, and half-formed plans in their head. Butterfly needs to meet them where they are and bootstrap a full L0–L5 graph from what already exists.

---

## The Onboarding Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  "Import a Project"                                                  │
│                                                                      │
│  Step 1: Connect Sources                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                │
│  │ ◉ GitHub Repo │ │ ○ Linear     │ │ ○ Notion     │                │
│  │   owner/repo  │ │   workspace  │ │   workspace  │                │
│  └──────────────┘ └──────────────┘ └──────────────┘                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                │
│  │ ○ Jira       │ │ ○ Markdown   │ │ ○ Brain Dump │                │
│  │   project    │ │   folder     │ │   (paste)    │                │
│  └──────────────┘ └──────────────┘ └──────────────┘                │
│                                                                      │
│  Step 2: Butterfly Scans & Proposes a Graph                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Scanning...                                                 │    │
│  │  ✓ 847 commits across 14 contributors                       │    │
│  │  ✓ 23 open PRs, 156 merged PRs                              │    │
│  │  ✓ 42 Linear issues imported                                │    │
│  │  ✓ 8 Notion docs parsed                                     │    │
│  │  ◌ Inferring project structure...                            │    │
│  │  ◌ Classifying into Butterfly layers...                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Step 3: Review & Accept                                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Proposed graph:                                             │    │
│  │  3 Intents  •  7 Epics  •  12 Phases  •  34 Tickets         │    │
│  │  156 linked PRs  •  42 imported issues → canvas notes        │    │
│  │                                                               │    │
│  │  [Preview Graph]  [Edit Before Import]  [Accept & Import]     │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Source Connectors

### 1. GitHub Repository (primary, always available)

The richest source. A repo's git history, PRs, and file structure contain an enormous amount of implicit project knowledge.

**What Butterfly extracts:**

```
Git History
├── Commits → grouped by time + author + changed files
│   → AI infers: what areas of the codebase exist, who owns what,
│     what work happened when (feeds temporal layer from day 0)
│
├── PRs (merged) → become L0 Code nodes, linked to inferred Tickets
│   → PR title + body → AI classifies intent, groups into Epics
│   → PR files changed → file-level change map (feeds Architect)
│   → PR reviews → decision context (feeds Historian)
│
├── PRs (open) → become L1 Ticket nodes (in-progress)
│   → Linked to inferred Phase based on file overlap with merged PRs
│
├── Branches → naming convention detection
│   → feature/*, fix/*, chore/* → auto-classify into note types
│
├── README + docs/ → parsed into L5 Canvas notes
│   → AI classifies: goals, decisions, constraints, references
│
├── CHANGELOG / release tags → become L4 Intent milestones
│   → Each release = a milestone with child PRs as tickets
│
└── File structure → codebase map for Architect agent
    → Identifies modules, boundaries, hot files
```

**Implementation:**

```rust
// backend/src/onboarding/github.rs

pub struct GitHubScanner {
    client: Octocrab,
    repo: RepoConfig,
}

impl GitHubScanner {
    /// Phase 1: Collect raw data
    pub async fn scan(&self) -> ScanResult {
        let (commits, prs, branches, tree, readme) = tokio::join!(
            self.fetch_commits(since: None, limit: 1000),
            self.fetch_prs(state: "all", limit: 500),
            self.fetch_branches(),
            self.fetch_file_tree(),
            self.fetch_readme_and_docs(),
        );
        ScanResult { commits, prs, branches, tree, readme }
    }

    /// Phase 2: AI-assisted classification
    pub async fn classify(&self, scan: &ScanResult) -> ProposedGraph {
        // Group PRs by semantic similarity → candidate Epics
        // Group Epics by time + theme → candidate Intents
        // Map open PRs → Tickets
        // Parse docs → Canvas notes
        // Build edges between everything
    }
}
```

### 2. Linear Import

**What Butterfly extracts:**

| Linear Entity | Butterfly Node | Layer |
|---|---|---|
| Project | Intent (L4) | Maps to a milestone or strategic bet |
| Cycle | Intent or Phase (L4/L2) | Depends on scope |
| Issue (completed) | Ticket (L1) | With status=done, linked to PR if available |
| Issue (in-progress) | Ticket (L1) | With status=in-progress |
| Issue (backlog) | Canvas note (L5) | Type=Idea or Problem, not yet compiled |
| Label | Tag on nodes | Preserved as metadata |
| Comment thread | Canvas notes (L5) | Type=Decision, Insight, or Question |
| Document | Canvas notes (L5) or Epic (L3) | AI classifies based on structure |

**API:** Linear GraphQL API. OAuth connection or API key.

```graphql
# Fetch everything in one pass
query ImportProject($projectId: String!) {
  project(id: $projectId) {
    name
    description
    issues(first: 500) {
      nodes {
        title, description, state { name }, assignee { name },
        labels { nodes { name } }, comments { nodes { body } },
        attachments { nodes { url } }
      }
    }
    documents { nodes { title, content } }
    cycles { nodes { name, startsAt, endsAt, issues { nodes { id } } } }
  }
}
```

### 3. Jira Import

**What Butterfly extracts:**

| Jira Entity | Butterfly Node | Layer |
|---|---|---|
| Epic | Epic (L3) | Direct mapping |
| Story / Task (done) | Ticket (L1) | With linked PR if branch name matches |
| Story / Task (to-do) | Canvas note (L5) | Type=Idea, awaiting compilation |
| Sprint | Phase (L2) or Intent (L4) | AI classifies based on scope |
| Comment | Canvas notes (L5) | Decisions, questions extracted |
| Confluence page (linked) | Canvas notes (L5) or Epic body | Parsed and classified |

**API:** Jira REST API v3. OAuth 2.0 or API token.

### 4. Notion Import

**What Butterfly extracts:**

| Notion Entity | Butterfly Node | Layer |
|---|---|---|
| Database row | Canvas note (L5) | Type inferred from properties |
| Page (structured) | Epic (L3) | If it has sections like PRD, tech plan |
| Page (unstructured) | Canvas notes (L5) | Split into paragraphs, each classified |
| Inline database | Multiple canvas notes | One per row |
| Relation properties | Edges | Mapped to Butterfly relation types |

**API:** Notion API. OAuth integration.

### 5. Markdown Folder Import

For teams that keep specs/docs in a `docs/` folder or a separate repo:

```
docs/
├── roadmap.md           → Intent nodes (L4) + Canvas notes
├── architecture.md      → Canvas notes (type=Decision, Constraint)
├── features/
│   ├── auth.md          → Epic (L3) or Canvas notes depending on structure
│   └── payments.md      → Epic (L3)
└── meeting-notes/
    ├── 2026-03-01.md    → Canvas notes (type=Decision, Question, Insight)
    └── 2026-03-15.md    → Canvas notes
```

**Parser:** Markdown → AST (remark/unified), then:
- Headings → node boundaries
- Bullet lists → individual canvas notes
- `> blockquote` → Decision or Insight type
- `- [ ] TODO` → Idea or Ticket type
- Links → Reference type + edges to linked nodes

### 6. Brain Dump (Paste)

The simplest import: paste a wall of text, and Butterfly breaks it into notes.

```
User pastes:
"We need to ship auth by end of month. The current token refresh is broken,
users are getting logged out. Also we should look into SSO for enterprise.
Jake mentioned that the OAuth callback URL is hardcoded which is a problem
for self-hosted deploys. Oh and the rate limiter is too aggressive on the
login endpoint."

Butterfly creates:
├── Goal: "Ship auth by end of month"
├── Problem: "Token refresh broken — users getting logged out"
├── Idea: "SSO for enterprise"
├── Constraint: "OAuth callback URL is hardcoded"
├── Problem: "Rate limiter too aggressive on login endpoint"
└── Edges: all linked to Goal node, Constraint→Problem edge inferred
```

**Implementation:** Single LLM call with structured output:
```
Given this text, extract individual thoughts and classify each as:
Goal, Problem, Hypothesis, Idea, Constraint, Decision, Question, Risk, Insight, Reference, Bet, or Note.
Return as JSON array with { text, type, related_to[] }.
```

---

## The Onboarding Agent

A dedicated agent (the **Cartographer**) handles onboarding. It's not one of the 7 runtime agents — it runs once during import and hands off to the regular team.

### Cartographer's Job

1. **Scan** all connected sources in parallel
2. **Deduplicate** across sources (same feature described in Linear issue AND Notion doc AND PR)
3. **Classify** every entity into an Butterfly layer and node type
4. **Infer structure** — group nodes into Intents, Epics, Phases based on:
   - Explicit hierarchy (Linear project → issues, Jira epic → stories)
   - Semantic similarity (PR descriptions that talk about the same feature)
   - Temporal proximity (things that happened in the same sprint/week)
   - File overlap (PRs that touched the same files = probably same Epic)
5. **Infer edges** — supports, blocks, implements, refines, duplicates
6. **Propose** the full graph for human review
7. **Bootstrap the event log** — create synthetic events dated to when things originally happened, so the timeline scrubber works from day 0

### Deduplication Strategy

The same feature might appear in 3 places:
- Linear issue: "Implement Stripe checkout"
- Notion doc: "Payments integration spec"
- GitHub PR: "feat: add stripe webhook handler"

Cartographer uses:
1. **Title/description embedding similarity** (cosine > 0.85 = candidate duplicate)
2. **Entity cross-references** (Linear issue mentions PR number, PR body links to Notion page)
3. **File path overlap** (PR touches `src/payments/`, Linear issue mentions payments)

Duplicates are merged into a single node with provenance from all sources. The user can split them back apart during review.

### Synthetic Event Backfill

To make the timeline scrubber useful from the moment of import, Cartographer creates backdated events:

```rust
// For every imported PR:
Event {
    timestamp: pr.merged_at,       // original merge date, not import date
    event_type: "pr.merged",
    entity_id: pr_node.id,
    after_state: pr_node.to_json(),
    actor: "cartographer",
    metadata: json!({ "source": "github", "original_id": pr.number }),
}

// For every imported Linear issue:
Event {
    timestamp: issue.created_at,   // original creation date
    event_type: "node.created",
    entity_id: ticket_node.id,
    after_state: ticket_node.to_json(),
    actor: "cartographer",
    metadata: json!({ "source": "linear", "original_id": issue.id }),
}
```

This means you can scrub the timeline back to before Butterfly existed and see your project's history reconstructed.

---

## Review & Accept Flow

After scanning, the Cartographer presents its proposed graph. The user **must** review before anything is committed.

### Preview Mode
- Full graph view showing all proposed nodes and edges
- Nodes colored by source (GitHub=purple, Linear=blue, Notion=gray, etc.)
- Confidence scores on each node: "85% confident this is an Epic" vs "40% — might be a canvas note"
- Low-confidence nodes highlighted for attention

### Edit Before Import
- Reclassify any node (drag from L5 to L3, change type)
- Merge duplicate nodes the Cartographer missed
- Split nodes the Cartographer incorrectly merged
- Delete nodes that aren't relevant
- Add missing edges
- Rename/retitle nodes
- Move nodes between Intents/Epics

### Accept & Import
- One click commits the entire graph
- Events are backfilled with original timestamps
- Connector agent immediately starts inferring additional edges
- Synthesizer scans for clusters the Cartographer might have missed
- Project is ready to use — not a blank slate, a living graph of existing work

### Incremental Re-import
After initial onboarding, sources can be re-scanned:
- "Sync from GitHub" — import new PRs/commits since last scan
- "Sync from Linear" — import new/changed issues
- New entities go through the same classify → propose → review flow
- Existing nodes are matched by source ID to avoid re-importing

---

## Source-Specific Mapping Details

### GitHub PR → Butterfly Graph (the deepest mapping)

A single merged PR generates multiple nodes:

```
PR #142: "Add Stripe webhook handler"
    │
    ├── L1 Ticket: "Add Stripe webhook handler"
    │   ├── filePaths: [src/webhooks/stripe.rs, src/routes/payments.rs]
    │   ├── acceptanceCriteria: (extracted from PR checklist if present)
    │   └── status: done
    │
    ├── L0 Code: PR #142 (linked)
    │   ├── files_changed: 4
    │   ├── additions: 230, deletions: 12
    │   └── merged_at: 2026-03-15
    │
    ├── L5 Canvas Notes (extracted from PR body):
    │   ├── Decision: "Using raw webhooks instead of Stripe SDK events"
    │   ├── Constraint: "Must verify webhook signatures"
    │   └── Reference: "https://stripe.com/docs/webhooks"
    │
    └── Edges:
        ├── ticket → code (implements)
        ├── decision → ticket (supports)
        └── constraint → ticket (blocks → resolved)
```

### Commit Message Mining

Conventional commits are a goldmine:
```
feat(payments): add Stripe checkout      → Idea or Ticket
fix(auth): token refresh race condition  → Problem + Ticket
docs(api): update webhook documentation  → Reference
refactor(db): normalize user table       → Decision + Ticket
chore(deps): bump serde to 1.0.200      → Note (low signal, skip unless grouped)
```

Non-conventional commits: AI classifies from the message + diff summary.

---

## Data Model Additions

```sql
-- Track import sources for incremental re-sync
CREATE TABLE import_source (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES project(id),
  source_type   TEXT NOT NULL,         -- 'github', 'linear', 'jira', 'notion', 'markdown', 'paste'
  source_config JSONB NOT NULL,        -- connection details (repo URL, API token ref, etc.)
  last_synced   TIMESTAMPTZ,
  sync_cursor   JSONB,                 -- pagination cursor for incremental sync
  status        TEXT DEFAULT 'active', -- active, paused, disconnected
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Map imported entities to Butterfly nodes (for dedup + incremental sync)
CREATE TABLE import_mapping (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     UUID NOT NULL REFERENCES import_source(id),
  external_id   TEXT NOT NULL,          -- e.g., PR number, Linear issue ID, Notion page ID
  external_type TEXT NOT NULL,          -- 'pr', 'issue', 'page', 'commit', 'document'
  node_id       UUID NOT NULL REFERENCES node(id),
  confidence    FLOAT,                  -- Cartographer's classification confidence
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_id, external_id, external_type)
);

CREATE INDEX idx_import_mapping_node ON import_mapping(node_id);
CREATE INDEX idx_import_mapping_external ON import_mapping(source_id, external_id);
```

---

## Implementation Timeline

### M1: Foundation (Week 2-3)
- `import_source` and `import_mapping` tables in migrations
- Brain Dump (paste) import — simplest connector, validates the classification pipeline
- Wire into command palette: ⌘K → "Import from paste"

### M2: GitHub + Structured Imports (Week 5-7)
- **Week 5:** GitHub scanner — fetch commits, PRs, branches, file tree, docs
- **Week 5:** Cartographer agent — classify, group, propose graph
- **Week 6:** Review & Accept UI — preview graph, edit, accept
- **Week 6:** Synthetic event backfill for timeline scrubber
- **Week 7:** Incremental re-sync for GitHub ("Sync new PRs")
- **Week 7:** Markdown folder import

### M3: External Tool Imports (Week 11-12)
- **Week 11:** Linear import connector + OAuth
- **Week 11:** Jira import connector + OAuth
- **Week 12:** Notion import connector + OAuth
- **Week 12:** Deduplication across multiple sources

### Post-M3:
- CSV/JSON generic import (for anything else)
- Bidirectional sync (write back to Linear/Jira — v2 feature)
- Scheduled auto-sync (pull new issues every hour)

---

## Onboarding UX Principles

1. **Never start blank.** If a user connects a repo, Butterfly should have a populated graph within 2 minutes. An empty canvas after connecting a 500-PR repo is a failure.
2. **Low-confidence = visible.** Don't hide uncertainty. Show the user where the Cartographer is guessing so they can correct it.
3. **Imports are additive.** Importing never deletes or overwrites existing Butterfly nodes. New imports merge alongside existing work.
4. **Source provenance is permanent.** Every imported node knows where it came from. "This Epic was derived from Linear issue PROJ-142 + Notion page 'Payments Spec' + PRs #130-#145."
5. **Timeline from day zero.** Backfilled events mean the scrubber works immediately. The user can see their project's history from before Butterfly existed.
6. **Incremental, not all-or-nothing.** Users can import one source now, another next week. Each import enriches the graph.
