# Butterfly — Recurring Processes & Operational Cadence

Processes that run continuously or on a schedule — not tied to any single milestone but essential to keeping the project healthy.

---

## Automated Recurring Tasks (Rust Backend)

These run as `tokio::spawn` background tasks in the Rust server:

### Every Minute
| Task | Description |
|------|-------------|
| **Connector background loop** | Check for unclassified/stale notes, queue classification + edge inference |
| **Provider health monitor** | Check API key validity, flag expired or rate-limited providers |
| **WebSocket heartbeat** | Ping connected clients, close dead connections |

### Every 5 Minutes
| Task | Description |
|------|-------------|
| **Synthesizer scan** | Look for new clusters, surface suggestions in side rail |
| **Status bubble-up** | Recompute phase/epic/milestone completion % from child statuses |
| **Stale detection** | Flag epics whose source canvas notes changed since compilation |

### Hourly
| Task | Description |
|------|-------------|
| **Snapshot creation** | Full graph snapshot for temporal navigation |
| **Cost accounting** | Aggregate agent_run costs per project, check daily caps |
| **GitHub token refresh** | Refresh installation tokens nearing expiry |

### Daily (3 AM local time)
| Task | Description |
|------|-------------|
| **Data cleanup** | Purge expired agent_runs (>90d), thin old snapshots |
| **Orphan detection** | Find nodes with no parent that should have one, surface warnings |
| **Storage usage** | Calculate per-project storage (DB + file uploads), surface if nearing limits |
| **Dependency audit** | `cargo audit` / `pnpm audit` (in CI, but also logged here for tracking) |

### Weekly
| Task | Description |
|------|-------------|
| **Snapshot thinning** | Keep 1 snapshot/day after 30 days, 1/week after 90 days |
| **Index maintenance** | PostgreSQL `REINDEX` on hot tables (event, node, node_edge) |
| **Provider health check** | Validate all stored API keys still work (make test call) |

### Implementation

```rust
// backend/src/tasks/mod.rs

pub mod cleanup;
pub mod connector;
pub mod synthesizer;
pub mod health;
pub mod snapshots;

pub fn spawn_all_tasks(pool: DbPool, config: AppConfig) {
    // Minute-level tasks
    tokio::spawn(connector::background_loop(pool.clone(), Duration::from_secs(60)));
    tokio::spawn(health::provider_monitor(pool.clone(), Duration::from_secs(60)));

    // 5-minute tasks
    tokio::spawn(synthesizer::scan_loop(pool.clone(), Duration::from_secs(300)));
    tokio::spawn(health::status_bubble_up(pool.clone(), Duration::from_secs(300)));
    tokio::spawn(health::stale_detection(pool.clone(), Duration::from_secs(300)));

    // Hourly tasks
    tokio::spawn(snapshots::create_periodic(pool.clone(), Duration::from_secs(3600)));
    tokio::spawn(health::cost_accounting(pool.clone(), Duration::from_secs(3600)));

    // Daily tasks (scheduled for 3 AM)
    tokio::spawn(cleanup::daily_cleanup(pool.clone()));

    // Weekly tasks
    tokio::spawn(cleanup::weekly_maintenance(pool.clone()));
}
```

---

## CI/CD Recurring Processes

### On Every Push to Main
| Process | Tool | Action |
|---------|------|--------|
| Full CI pipeline | GitHub Actions | Lint, test, build, e2e |
| Docs site deploy | Starlight + GitHub Pages | Rebuild and publish user docs |
| Validation dashboard | Custom script | Regenerate feature validation status |
| Docker image build | GitHub Actions | Build and push to GHCR (tagged `latest`) |

### On Every Release Tag
| Process | Tool | Action |
|---------|------|--------|
| Binary builds | GitHub Actions | Cross-compile Rust for macOS (aarch64, x86_64) + Linux (aarch64, x86_64) |
| Docker image tag | GitHub Actions | Tag image with version number |
| Changelog generation | git-cliff | Generate from conventional commits, attach to GitHub Release |
| OpenAPI spec | utoipa | Regenerate and attach to release |
| Migration check | sqlx | Verify all migrations are forward-compatible |

### Nightly (Main Branch)
| Process | Tool | Action |
|---------|------|--------|
| Full e2e suite | GitHub Actions (cron) | Run all Playwright flows + visual regression against main |
| Performance benchmarks | GitHub Actions (cron) | Run benchmark suite, post results to tracking issue |
| Dependency updates | Dependabot / Renovate | Open PRs for outdated deps (Cargo + pnpm) |
| Security audit | `cargo audit` + `pnpm audit` | Fail nightly if new advisories found |

### Weekly
| Process | Tool | Action |
|---------|------|--------|
| Agent eval regression | GitHub Actions (cron) | Run full agent eval suite against current models to catch upstream model drift |
| License compliance | `cargo deny` | Check no copyleft deps leaked into non-copyleft parts |
| Dead code detection | `cargo udeps` + custom script | Flag unused dependencies and dead code |

---

## Code Quality Recurring Processes

### Linting & Formatting (enforced in CI, auto-fixable locally)

```yaml
# Rust
cargo fmt --check             # Formatting (rustfmt)
cargo clippy -- -D warnings   # Lint (treat warnings as errors)
cargo deny check              # License + advisory check

# Frontend
pnpm lint                     # ESLint + svelte-check
pnpm format:check             # Prettier
pnpm check                    # TypeScript strict mode
```

### Code Cleanup Cadence

Not a one-time event — scheduled into every milestone:

| When | What | Time Budget |
|------|------|-------------|
| **End of each week** | Review TODOs added this week — convert to issues or resolve | 1 hour |
| **End of M1** | Dead code sweep, dependency audit, remove prototype scaffolding | 2 days |
| **End of M2** | Refactor patterns that emerged during M1-M2, extract shared utilities | 3 days |
| **End of M3** | Full audit: dead code, unused deps, performance profiling, security review | 1 week |
| **Before each release** | `cargo clippy`, `pnpm lint`, remove all `#[allow(...)]` suppressions, review all `// HACK` comments | 1 day |

### Technical Debt Tracking

Debt isn't ignored — it's explicitly tracked:

```markdown
<!-- docs/tech-debt.md — updated every Friday -->

# Technical Debt Registry

| ID | Description | Introduced | Milestone | Severity | Effort |
|----|-------------|-----------|-----------|----------|--------|
| TD-001 | IndexedDB adapter doesn't handle schema migrations on version bump | M1 | M2 | Medium | 1 day |
| TD-002 | Event replay is O(n) — needs cursor-based pagination for large projects | M1 | M3 | Low | 2 days |
| TD-003 | Connector agent re-classifies all notes on restart, should cache | M1 | M2 | Low | 0.5 day |
```

Every tech debt item has:
- When it was introduced (milestone)
- When it should be fixed (target milestone)
- Severity: how much it hurts if left unfixed
- Effort: rough estimate to resolve

---

## Release Process

### Versioning
- **Semver** (MAJOR.MINOR.PATCH)
- MAJOR: breaking API changes or data model changes requiring migration
- MINOR: new features, new agents, new views
- PATCH: bug fixes, performance improvements

### Release Checklist (manual, but templated)

```markdown
## Release v0.X.Y Checklist

### Pre-release
- [ ] All CI checks pass on main
- [ ] Nightly e2e suite passed within last 24h
- [ ] Agent evals all pass current thresholds
- [ ] No critical or high severity bugs open
- [ ] Tech debt items targeted for this release are resolved
- [ ] Validation dashboard shows no regressions
- [ ] Migration tested: upgrade from v0.(X-1) → v0.X works cleanly
- [ ] CHANGELOG.md reviewed and edited for clarity

### Release
- [ ] Tag `vX.Y.Z` on main
- [ ] CI builds binaries + Docker images + docs
- [ ] GitHub Release created with changelog + binaries
- [ ] Docker images pushed to GHCR with version tag
- [ ] Docs site updated

### Post-release
- [ ] Smoke test: fresh `docker compose up` with new version works
- [ ] Smoke test: `pnpm dev` browser-only mode works
- [ ] Announce in changelog / blog / community channel
- [ ] Update demo project if applicable
```

---

## Monitoring (Mode C: Supabase Cloud)

For self-hosted (Mode B) and cloud (Mode C) deployments:

### Health Endpoints
```rust
// backend/src/routes/health.rs

// GET /health — basic liveness (is the server running?)
// Returns: { "status": "ok", "version": "0.3.2" }

// GET /health/ready — readiness (is the DB connected? are background tasks running?)
// Returns: { "status": "ready", "db": "ok", "tasks": { "connector": "running", "cleanup": "idle" } }

// GET /health/metrics — Prometheus-compatible metrics
// Returns: process_cpu_seconds_total, http_requests_total, db_pool_size, agent_runs_total, etc.
```

### What to Monitor
| Metric | Alert Threshold |
|--------|----------------|
| API response time (p99) | > 500ms |
| DB connection pool exhaustion | > 80% used |
| Agent run failure rate | > 10% in 1 hour |
| Daily AI spend | > 90% of configured cap |
| Event table growth | > 100k events/day (needs more aggressive snapshotting) |
| Disk usage | > 80% |
| WebSocket connections | > 1000 concurrent (per instance) |

### Logging
- **Structured JSON logs** via `tracing` crate (Rust) and `pino` (SvelteKit server)
- Log levels: ERROR (always), WARN (always), INFO (default), DEBUG (opt-in), TRACE (opt-in)
- **Never log:** API keys, JWT tokens, user passwords, raw LLM responses (too large)
- **Always log:** request ID, user ID (if authed), duration, status code
- Logs ship to stdout (12-factor) — users can pipe to whatever aggregator they want

---

## Community & Contribution Recurring Processes

### Issue Triage (weekly)
- Label new issues: bug, feature, good-first-issue, agent-improvement
- Assign priority: P0 (blocks release), P1 (fix this milestone), P2 (backlog), P3 (nice to have)
- Close stale issues (no activity in 60 days, ping first)

### PR Review SLA
- First review within 48 hours
- No PR open for > 1 week without a decision (merge, request changes, or close)
- Bot auto-labels PRs by area: `area/canvas`, `area/agents`, `area/backend`, `area/temporal`

### Dependency Updates (automated + reviewed)
- Renovate or Dependabot opens PRs for outdated deps weekly
- Rust deps: `cargo update` for patch versions, manual review for minor/major
- Frontend deps: `pnpm update` for patch, manual for breaking
- Security advisories: same-day response for critical CVEs
