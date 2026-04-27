# Butterfly — Testing Strategy

Testing is not an afterthought bolted onto milestones. It's a parallel work stream that runs continuously, with dedicated time in every milestone for test infrastructure, coverage, and validation documentation.

---

## Testing Pyramid

```
                    ┌───────────┐
                    │   E2E     │  Playwright: full user flows
                    │  (few)    │  against real browser + real/mock API
                    ├───────────┤
                  ┌─┤Integration├─┐  Rust: API routes + DB (testcontainers-rs)
                  │ │ (moderate)│ │  Svelte: component + store integration
                  │ ├───────────┤ │
                ┌─┤ │   Unit    │ ├─┐  Rust: pure functions, DB queries (cargo test)
                │ │ │  (many)   │ │ │  TS: stores, adapters, utils (vitest)
                │ │ ├───────────┤ │ │
              ┌─┤ │ │Agent Evals│ │ ├─┐  Golden input/output sets per agent
              │ │ │ │(per model)│ │ │ │  Run on model upgrade, not every CI
              │ │ │ └───────────┘ │ │ │
              └─┴─┴───────────────┴─┴─┘
```

---

## Layer 1: Unit Tests

### Rust Backend (`cargo test`)
- **Every SQLx query** has a test against a real PG instance (via `sqlx::test` macro with test fixtures)
- **Every API handler** has a unit test for happy path + error cases
- **Event sourcing:** test that every CRUD operation produces the correct event with correct before/after state
- **Graph reconstruction:** test snapshot + event replay produces correct state for known inputs
- **Provider registry:** test capability routing, fallback behavior, missing API key handling
- **Snapshot tests** via `insta` crate for API response shapes — catch unintended breaking changes
- **Target:** every public function has at least one test. No PR merges with declining coverage.

### Frontend (`vitest`)
- **Storage adapters:** test IndexedDB adapter with fake-indexeddb, API adapter with MSW (Mock Service Worker)
- **Svelte stores:** test `$state` / `$derived` reactivity with `@testing-library/svelte`
- **Zod schemas:** test payload validation for all node types (valid inputs pass, invalid inputs reject with correct error)
- **Temporal reconstruction:** test client-side graph state rebuild from events
- **Utilities:** date formatting, slug generation, diff computation, etc.

### What's NOT unit tested
- CSS / visual layout (covered by e2e + visual regression)
- Third-party library internals (TipTap, d3-force)
- Exact LLM outputs (covered by agent evals)

---

## Layer 2: Integration Tests

### Rust API Integration (`cargo test` + testcontainers-rs)
- Spin up a real PostgreSQL container per test suite
- Test full request cycle: HTTP request → handler → DB query → response
- Test WebSocket connections: subscribe, receive event, unsubscribe
- Test GitHub webhook processing: parse payload → update DB → emit event
- Test export pipeline: compile prompt → render command → render CLAUDE.md → render Conductor JSON
- Test temporal API: create nodes over time → query state at various timestamps → verify accuracy

### Frontend Component Integration
- `@testing-library/svelte` for component trees
- Canvas: render 50 notes, verify spatial positions, pan/zoom behavior
- Command palette: open, search, execute command, verify side effect
- Timeline scrubber: set position, verify view updates to correct state
- Storage adapter switching: verify same component works with IndexedDB and API adapters

### Cross-Layer Integration (CI)
- Docker Compose test: start full stack, hit API from test client, verify responses
- Supabase integration: test against Supabase local dev (supabase start) for RLS, Auth, Realtime

---

## Layer 3: End-to-End Tests (Playwright)

### Core Flows (run on every PR)
```
Flow 1: Brain Dump
  → Open app → Create 10 notes via command palette
  → Verify notes appear on canvas
  → Verify Connector classifies notes (wait for type badges)
  → Switch to Kanban → verify grouping
  → Switch to Graph → verify edges visible

Flow 2: Compile Pipeline
  → Create cluster of related notes
  → Click "Compile to Epic"
  → Accept AI-drafted epic
  → Generate phases → verify phase list
  → Generate tickets → verify ticket cards
  → Export ticket as markdown → verify clipboard content

Flow 3: Temporal Navigation
  → Create notes over simulated time
  → Drag scrubber backwards → verify notes disappear
  → Drag forward → verify notes reappear
  → Step between events → verify correct state

Flow 4: Settings & API Keys
  → Open settings
  → Add API key → verify provider shows as connected
  → Change agent model assignment → verify dropdown persists

Flow 5: GitHub Integration (fixture repo)
  → Bind project to fixture repo
  → Generate ticket → execute (mock agent)
  → Verify PR auto-linked
  → Verify Reviewer comment posted
  → Merge PR → verify status bubbles up
```

### Visual Regression (Playwright screenshots)
- Capture screenshots of canvas, kanban, graph, roadmap, scrubber at known states
- Compare against baselines on PR — flag visual diffs for review
- Update baselines explicitly when design changes are intentional

### Performance Benchmarks (Playwright)
- 500 notes on canvas: render < 500ms, 60fps pan/zoom
- 50 epics in roadmap: render < 300ms
- Graph with 200 nodes + 500 edges: force layout settles < 2s
- Timeline scrub across 1000 events: state reconstruction < 200ms
- These run in CI but don't block — they report metrics and flag regressions

---

## Layer 4: Agent Evaluation Harness

Every AI agent ships with an eval set. Evals run on model upgrade PRs, not on every CI run (they're slow and cost money).

### Eval Structure
```
evals/
├── connector/
│   ├── classification/
│   │   ├── inputs.json          # 100 sample notes
│   │   └── expected.json        # expected type + confidence range
│   ├── edge_inference/
│   │   ├── inputs.json          # 50 note pairs
│   │   └── expected.json        # expected relation type
│   └── eval.config.json         # pass threshold: ≥85% accuracy
│
├── synthesizer/
│   ├── cluster_to_epic/
│   │   ├── inputs.json          # 20 note clusters
│   │   └── expected.json        # expected epic structure (graded rubric)
│   └── eval.config.json
│
├── architect/
│   ├── epic_to_phases/
│   │   ├── inputs.json          # 10 epics with mock codebase
│   │   └── expected.json        # expected phase decomposition (rubric)
│   └── eval.config.json
│
├── decomposer/
│   ├── phase_to_tickets/
│   │   ├── inputs.json          # 15 phases
│   │   └── expected.json        # expected ticket count, coverage
│   └── eval.config.json
│
├── reviewer/
│   ├── drift_detection/
│   │   ├── inputs.json          # 20 (PR diff, ticket spec) pairs
│   │   └── expected.json        # expected severity + findings
│   └── eval.config.json
│
└── run_evals.ts                 # Runner script, outputs report
```

### Eval Metrics
| Agent | Metric | Pass Threshold |
|-------|--------|----------------|
| Connector (classify) | Accuracy (exact type match) | ≥ 85% |
| Connector (edges) | Precision + Recall on relation type | ≥ 75% each |
| Synthesizer | Rubric score (0-5, human-graded) | ≥ 3.5 avg |
| Architect | Phase count within expected range, file coverage | ≥ 80% |
| Decomposer | Ticket count within range, AC completeness | ≥ 80% |
| Reviewer | Severity classification accuracy | ≥ 80% |

### Eval Workflow
1. Developer opens PR that changes a model (e.g., Connector → new prompt or new model version)
2. CI triggers eval workflow (`.github/workflows/evals.yml`)
3. Eval runner calls the agent with golden inputs, compares against expected outputs
4. Results posted as a PR comment: pass/fail per metric, regressions highlighted
5. Human reviews before merging

---

## CI Pipeline

```yaml
# .github/workflows/ci.yml — runs on every PR

jobs:
  rust-checks:
    steps:
      - cargo fmt --check
      - cargo clippy -- -D warnings
      - cargo test                    # unit + integration (testcontainers-rs)
      - cargo build --release

  frontend-checks:
    steps:
      - pnpm install
      - pnpm lint                     # eslint + svelte-check
      - pnpm check                    # TypeScript type checking
      - pnpm test                     # vitest unit + integration
      - pnpm build                    # SvelteKit build

  e2e:
    needs: [rust-checks, frontend-checks]
    steps:
      - docker compose -f docker-compose.test.yml up -d   # start full stack
      - pnpm test:e2e                 # Playwright flows 1-5
      - pnpm test:visual              # screenshot comparison

  performance:
    needs: [rust-checks, frontend-checks]
    steps:
      - docker compose -f docker-compose.test.yml up -d
      - pnpm test:perf                # benchmark suite, report metrics

# .github/workflows/evals.yml — runs only on model/prompt change PRs

on:
  pull_request:
    paths: ['evals/**', 'backend/src/ai/**', 'frontend/src/lib/agents/**']

jobs:
  agent-evals:
    steps:
      - pnpm run evals               # run all agent eval suites
      - post results as PR comment
```

---

## Test Data & Fixtures

### Seed Data
```
fixtures/
├── projects/
│   └── demo-project.json           # A complete project with notes, epics, phases, tickets
├── notes/
│   ├── brain-dump-50.json           # 50 varied canvas notes for testing
│   └── classified-30.json           # 30 notes with known correct types
├── github/
│   ├── webhook-push.json            # Sample GitHub webhook payloads
│   ├── webhook-pr-opened.json
│   └── webhook-pr-merged.json
├── temporal/
│   ├── events-100.json              # 100 events for timeline reconstruction testing
│   └── snapshot.json                # Known-good snapshot for comparison
└── repos/
    └── fixture-repo/                # Minimal repo for Architect agent testing
        ├── src/
        ├── package.json
        └── README.md
```

### Test Database
- **Rust integration tests:** `testcontainers-rs` spins up a fresh PG per test suite, runs migrations, seeds data, tears down after
- **E2E tests:** `docker-compose.test.yml` with a dedicated PG instance seeded with fixture data
- **Frontend tests:** `fake-indexeddb` for storage adapter tests, MSW for API mocking

---

## Coverage Targets

| Layer | Target | Enforcement |
|-------|--------|-------------|
| Rust unit | ≥ 80% line coverage | CI reports, no hard gate initially |
| Rust integration | All API routes covered | Checked in review |
| Frontend unit | ≥ 70% line coverage | CI reports |
| E2E | All 5 core flows pass | CI gate (blocks merge) |
| Visual regression | No unreviewed diffs | CI gate |
| Agent evals | All pass thresholds met | CI gate on model change PRs |

Coverage is tracked via `cargo-llvm-cov` (Rust) and `vitest --coverage` (frontend), reported in CI but not hard-gated until M2 (avoid slowing down early velocity).
