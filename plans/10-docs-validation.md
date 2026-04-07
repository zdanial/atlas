# Atlas — Documentation & Feature Validation

Documentation is generated, validated, and versioned — never a chore someone does after the fact.

---

## Documentation Types

### 1. API Documentation (auto-generated)

```rust
// Rust backend uses `utoipa` crate for OpenAPI spec generation from code

#[utoipa::path(
    get,
    path = "/api/nodes",
    params(NodeFilter),
    responses(
        (status = 200, description = "List of nodes", body = Vec<Node>),
        (status = 401, description = "Unauthorized"),
    ),
    tag = "nodes"
)]
pub async fn list_nodes(...) -> ... { }
```

- OpenAPI 3.1 spec auto-generated from handler annotations
- Served at `/api/docs` (Swagger UI) in development
- Exported as `openapi.json` on every release
- **CI check:** spec is regenerated and diffed — if the spec changed but the committed `openapi.json` didn't, CI fails

### 2. Component Documentation (Storybook-style)

```
frontend/src/lib/components/
├── NoteCard/
│   ├── NoteCard.svelte
│   ├── NoteCard.test.ts          # Unit tests
│   └── NoteCard.stories.svelte   # Showcase: all states, variants, edge cases
├── TimelineScrubber/
│   ├── TimelineScrubber.svelte
│   ├── TimelineScrubber.test.ts
│   └── TimelineScrubber.stories.svelte
└── ...
```

Using **Histoire** (Svelte-native Storybook alternative):
- Every component has a `.stories.svelte` file showing all visual states
- Stories serve as living documentation — if a component changes, the story reflects it
- Published to a static site on every release: `atlas-docs.example.com/components`

### 3. Architecture Decision Records (ADRs)

```
docs/adr/
├── 001-universal-node-primitive.md
├── 002-event-sourcing-for-temporal.md
├── 003-rust-backend-over-node.md
├── 004-svelte-over-react.md
├── 005-storage-adapter-pattern.md
├── 006-byo-api-keys.md
├── 007-agplv3-license.md
└── TEMPLATE.md
```

**ADR format:**
```markdown
# ADR-NNN: Title

**Status:** Accepted | Superseded by ADR-NNN | Deprecated
**Date:** 2026-04-07
**Context:** What prompted this decision?
**Decision:** What we chose and why.
**Consequences:** What changes as a result. Trade-offs accepted.
```

**When to write an ADR:**
- Any architectural choice that was debated or non-obvious
- Switching technologies (e.g., React → Svelte, Node → Rust)
- Data model decisions (e.g., universal Node primitive vs separate tables)
- Security decisions (e.g., where API keys are stored)
- NOT for routine implementation choices

### 4. User-Facing Documentation

```
docs/
├── getting-started/
│   ├── quickstart.md              # 5-minute setup (Mode A)
│   ├── docker-setup.md            # Mode B: docker compose
│   ├── supabase-deploy.md         # Mode C: cloud deploy
│   └── api-keys.md                # Configuring LLM providers
├── guides/
│   ├── canvas-basics.md           # Brain dump workflow
│   ├── compilation-pipeline.md    # Canvas → Epic → Phase → Ticket
│   ├── github-integration.md      # Connecting repos, PR workflow
│   ├── timeline-scrubber.md       # Navigating through time
│   ├── agents.md                  # Working with the 7 agents
│   └── keyboard-shortcuts.md      # Full shortcut reference
├── reference/
│   ├── api.md                     # Link to OpenAPI docs
│   ├── note-types.md              # All 12 canvas note types
│   ├── relation-types.md          # All edge relation types
│   ├── lenses.md                  # Built-in lens definitions
│   └── cli.md                     # CLI usage (if applicable)
├── self-hosting/
│   ├── architecture.md            # System architecture overview
│   ├── configuration.md           # All env vars and settings
│   ├── backup-restore.md          # Database backup procedures
│   ├── upgrading.md               # Version upgrade guide
│   └── security.md                # Security hardening guide
└── contributing/
    ├── development-setup.md       # Dev environment setup
    ├── testing.md                 # How to run tests
    ├── architecture.md            # Codebase overview
    └── agents.md                  # How to modify/add agents
```

**Docs site:** Built with **Starlight** (Astro-based, fast, supports MDX). Deployed on every push to main.

---

## Feature Validation Registry

Every feature has a validation record: what it does, how it's tested, and its current status.

### Validation Document Format

```
docs/validation/
├── canvas-note-crud.md
├── connector-classification.md
├── timeline-scrubber.md
├── github-pr-linking.md
└── ...
```

Each file:

```markdown
# Feature: [Name]

**Layer:** L5 / L4 / L3 / L2 / L1 / L0 / Cross-cutting
**Milestone:** M1 / M2 / M3
**Status:** Validated | Partial | Not Started
**Last validated:** 2026-04-07
**Validated against:** v0.3.2

## Description
One paragraph: what this feature does from the user's perspective.

## Acceptance Criteria
- [ ] AC1: User can create a note via ⌘K → "New Note"
- [ ] AC2: Note appears on canvas at cursor position
- [ ] AC3: Note persists after page reload
- ...

## Test Coverage
| Test Type | File | Status |
|-----------|------|--------|
| Unit | `frontend/src/lib/stores/nodes.test.ts` | ✅ Pass |
| Integration | `backend/tests/api/nodes.rs` | ✅ Pass |
| E2E | `e2e/flows/brain-dump.spec.ts` | ✅ Pass |
| Visual | `e2e/screenshots/canvas-note.png` | ✅ Baseline |

## Known Limitations
- Notes don't support embedded images yet (planned M2)
- Max 1000 notes per canvas before performance degrades

## Dependencies
- Requires: StorageAdapter (IndexedDB or API)
- Required by: Connector classification, Kanban view, Graph view
```

### Validation Dashboard

The `docs/validation/` directory is parsed by a script that generates a status dashboard:

```
Feature Validation Status
─────────────────────────────────────────────────
Layer  Feature                     Status    Tests
─────────────────────────────────────────────────
L5     Canvas note CRUD            ✅ Valid  12/12
L5     Connector classification    ✅ Valid   8/8
L5     Edge inference              ⚠ Partial  5/7
L5     Canvas view                 ✅ Valid   6/6
L5     Kanban view                 ✅ Valid   4/4
L5     Graph view                  ⚠ Partial  3/5
L5     Timeline scrubber           ✅ Valid   9/9
L4     Intent CRUD                 ⬜ Not started
L4     Roadmap view                ⬜ Not started
...
─────────────────────────────────────────────────
Total: 45 features | 28 validated | 9 partial | 8 not started
```

This dashboard is generated in CI and published to the docs site. It's the single source of truth for "what works."

---

## Recurring Documentation Processes

### On Every PR
1. **API docs check:** if API routes changed, verify `openapi.json` was regenerated
2. **ADR check:** if a new architectural decision was made, an ADR should exist
3. **Validation doc check:** if a new feature was added, a validation doc should exist (enforced by PR template checklist)
4. **Component story check:** if a new component was added, a `.stories.svelte` should exist

### On Every Release
1. **Changelog generation:** auto-generated from conventional commits (git-cliff)
2. **Validation dashboard refresh:** re-run all validation docs against current state
3. **Docs site deploy:** push to docs hosting
4. **OpenAPI spec publish:** attach to GitHub Release

### Monthly
1. **ADR review:** are any accepted ADRs now out of date?
2. **Stale validation docs:** flag any not validated in > 60 days
3. **Dependency audit:** `cargo audit` + `pnpm audit`, update advisories in security docs

---

## Inline Documentation Standards

### Rust
- **Module-level doc comments** (`//!`) on every module explaining its purpose
- **Public function doc comments** (`///`) with examples for non-obvious functions
- **No comments on obvious code** — `/// Creates a node` above `pub async fn create_node()` is noise
- **`#[doc(hidden)]`** for internal helpers that shouldn't appear in generated docs

### Svelte / TypeScript
- **JSDoc on exported functions and types** — picked up by IDE and docs generators
- **No comments on obvious code**
- **Complex business logic** gets a `// Why:` comment explaining the non-obvious reason

### What NOT to document inline
- How a library works (link to its docs instead)
- What the code does when the name already says it
- TODO/FIXME (use GitHub Issues)
- Changelog-style notes (use git history)
