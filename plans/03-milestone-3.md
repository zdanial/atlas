# M3 — Code Reality Layer (4 weeks)

GitHub integration, Reviewer agent, full traceability from canvas note to merged PR.

**Prerequisite:** M2 complete (compilation pipeline, all middle agents)

---

## Parallel Work Streams

```
Week 11         Week 12         Week 13         Week 14
─────────────── ─────────────── ─────────────── ───────────────

Stream L: GitHub OAuth + Repo Binding
[L1 GitHub      [L2 Repo file
 OAuth app,      tree reader,
 install flow,   Architect gets
 repo binding    real codebase
 to project]     access]

Stream M: Branch + PR Linking
                [M1 Branch      [M2 PR template  [M3 Status
                 convention:     auto-populate:    sync: PR
                 atlas/<id>-     ticket spec +     state flows
                 <slug>, auto-   phase context +   up to ticket
                 link on push]   acceptance list]  → phase → epic]

Stream N: Reviewer Agent
                [N1 Reviewer:   [N2 PR comment   [N3 Merge-time
                 compare diff    integration:      re-verify +
                 vs ticket       structured        diff capture
                 spec, classify  findings on PR,   for permanent
                 drift severity] mapped to AC]     record]

Stream O: Lenses + Traceability
[O1 Lens        [O2 Origin      [O3 Impact       [O4 why.md
 framework:      lens: ticket     lens: canvas      generation
 saved zoom +    → walk up to     note → walk       per file,
 filter into     every source     down to every     changelog
 the graph]      canvas note]     PR it produced]   per milestone]

Stream P: Final Integration + Polish
                                [P1 Rabbit-hole  [P2 Full e2e
                                 drilldown:       test: brain
                                 click any node,  dump → compile
                                 see vertical     → ship → trace
                                 slice L0-L5]     back, fixture repo]

Stream Q: Export System (see 05-claude-code-integration.md)
                [Q1 Prompt       [Q2 Phase batch  [Q3 Custom
                 compiler, copy   export, Conduc-  templates,
                 command + down-  tor swarm JSON,  export log,
                 load CLAUDE.md]  dep ordering]    polish]

Stream S: External Tool Imports (see 12-project-onboarding.md)
[S1 Linear       [S2 Jira        [S3 Notion       [S4 Cross-source
 import +         import +         import +          deduplication,
 OAuth            OAuth            OAuth             multi-source
 connector]       connector]       connector]        merge UI]
```

---

## Stream L: GitHub OAuth + Repo Binding

### L1 — GitHub OAuth App (Week 11)
- GitHub App registration (dev + prod)
- OAuth flow: install app → grant repo access → store install_id
- Repo binding: link a Project to a GitHub repo
- Store in `repo` table: github_repo, install_id, default_branch
- Rust GitHub client via `octocrab` crate with token refresh

### L2 — Codebase Reader (Week 12)
- Fetch file tree via GitHub API (GET /repos/:owner/:repo/git/trees/:sha?recursive=1)
- Fetch file contents on demand (GET /repos/:owner/:repo/contents/:path)
- Cache file tree in memory, invalidate on webhook push events
- Architect agent now reads real repo files instead of mock codebase
- File-level plans reference actual paths that exist in the repo

**Depends on:** I1 (Architect agent from M2)

---

## Stream M: Branch Convention + PR Linking

### M1 — Branch Convention (Week 12)
- Convention: `atlas/<ticket-id>-<slug>` (multi-repo: `atlas/<project-slug>/<ticket-id>-<slug>`)
- When a branch matching this pattern is pushed in ANY project repo → auto-link to ticket
- GitHub webhook: listen for `create` events on branches across all connected repos
- Parse ticket ID from branch name, update ticket status to "in progress"

### M2 — PR Template (Week 13)
- When a PR opens for an Atlas-linked branch → auto-populate PR body
- Template: ticket spec, upstream phase context, acceptance criteria checklist
- GitHub webhook: listen for `pull_request.opened` events
- Update PR body via GitHub API (PATCH /repos/:owner/:repo/pulls/:number)

### M3 — Status Sync (Week 14)
- PR status (open/review/merged/closed) flows into ticket status
- Ticket status bubbles up: phase progress bar, epic completion %, milestone status
- Closed-without-merge → ticket marked "needs-rework" with re-derive option
- Webhook: `pull_request.closed`, `pull_request.review_submitted`

**Depends on:** L1 (GitHub OAuth), J2 (ticket UI from M2)

---

## Stream N: Reviewer Agent

### N1 — Drift Detection (Week 12)
- Given: PR diff + ticket spec (acceptance criteria, file paths, intent)
- Compare actual changes against expected changes
- Classify drift: Critical (wrong files, missing AC), Major (significant deviation), Minor (style/approach), Outdated (spec changed since ticket created)
- AgentRun logging + eval harness
- Test with fixture PRs against fixture tickets

### N2 — PR Comment Integration (Week 13)
- Post structured comment on PR with findings
- Format: summary, per-AC pass/fail, drift items with severity
- Map findings back to ticket acceptance criteria
- Store in `verification_report` table
- Re-run on force-push (updated PR)

### N3 — Merge Verification (Week 14)
- On PR merge: run final verification
- Capture diff summary (file paths + change summary) in ticket record
- Mark ticket as "verified" or "verified with drift"
- Diff becomes the canonical "what shipped" record
- Verification status bubbles up through phase → epic → milestone

**Depends on:** L1 (GitHub OAuth), J1 (ticket prompt payload from M2)

---

## Stream O: Lenses + Traceability

### O1 — Lens Framework (Week 11)
- Lens = saved query: zoom level (which layers visible) + filter (status, type, project) + layout mode
- Built-in lenses: Roadmap, Sprint, Implementation, Origin, Impact
- Custom lens creation: pick layers, filters, layout
- Lens switcher in top nav

### O2 — Origin Lens (Week 12)
- Given any node → walk all parent/source edges upward
- Render as a vertical tree: PR → ticket → phase → epic → intent → canvas notes
- Highlight path in the graph view
- Works from any layer: "show me where this epic came from"

### O3 — Impact Lens (Week 13)
- Given any node → walk all child/target edges downward
- Render as a tree: canvas note → intent → epic → phase → ticket → PRs
- Aggregate stats: N tickets created, M PRs merged, K lines changed
- "This one canvas note led to 47 PRs"

### O4 — Documentation Generation (Week 14)
- **why.md** per file: given a file path, find all PRs that touched it, walk up the chain
- **Changelog** per milestone: auto-generated from merged PRs
- **Decision log** per Intent: from Decision-typed canvas notes + clarification dialogues
- Export as markdown, committable to repo

**Depends on:** B1 (node store), data model (edges for traversal)

---

## Stream P: Final Integration + Polish

### P1 — Rabbit-Hole Drilldown (Week 13)
- Click any node → side panel shows full vertical slice (L0 through L5)
- Each layer is expandable/collapsible
- Links between layers are clickable (navigate to that node)
- Works in all views (canvas, kanban, graph, roadmap)

### P2 — End-to-End Test (Week 14)
- Fixture: a set of canvas notes that compile through all layers
- Playwright test: create notes → verify classification → compile to epic → generate phases → generate tickets → mock PR → verify traceability
- Fixture GitHub org/repo for PR integration testing
- Performance benchmark: 500 notes, 50 epics, 200 tickets — all views render <1s

**Depends on:** all other M3 streams

---

## Stream Q: Export System

Full details in `05-claude-code-integration.md`. Atlas compiles tickets into ready-to-run commands and prompt payloads that you take to Claude Code, Conductor, or any agent tool.

### Q1 — Prompt Compiler + Single Ticket Export (Week 12)
- `PromptCompiler` in Rust: walks ticket → phase → epic → intent → canvas notes, bundles context
- "Copy Command" button on ticket cards → copies `claude --print "..."` to clipboard
- "Download CLAUDE.md" → renders prompt as markdown file for the ticket
- Context bundling rules: always include AC + phase + epic summary, conditionally include tech plan + source notes
- Multi-repo aware: command includes `cd <repo-dir>` for the ticket's target repo

### Q2 — Phase Batch Export + Conductor Config (Week 13)
- Phase-level export: ordered list of all ticket commands with dependency annotations
- "Copy All Commands" → sequential commands respecting dependency order
- "Export for Conductor" → JSON config with tickets, repos, prompts, dependency graph, parallelization waves
- "Download All CLAUDE.md" → zip of one CLAUDE.md per ticket + README with execution order
- Keyboard shortcuts: `⌘⇧C` (copy command), `⌘⇧E` (export phase)

### Q3 — Custom Templates + Polish (Week 14)
- Custom export templates: user-defined prompt structure (for teams with specific agent conventions)
- Export log: track what was exported, when, by whom (`export_log` table)
- Export format refinement based on real usage
- Bulk export: all tickets in an epic, or all ready tickets across phases

**Depends on:** J1 (ticket generation from M2), GitHub integration (for repo context)

---

## Stream R: API Key Management UI (Week 12-13)

### R1 — Provider Settings Page (Week 12)
- Settings > AI Providers page
- Add/edit/remove API keys per provider (encrypted storage in `provider_config` table)
- Provider health check: validate key on save
- Show which capabilities each provider unlocks

### R2 — Agent Model Assignment (Week 13)
- Per-agent model selector (Forge's ModelSelector pattern)
- Dropdown: provider + model for each Atlas agent role
- Cost estimates shown inline
- Persist in `project.settings.agentProviders`

**Depends on:** C1 (ProviderRegistry from M1)

---

## Stream S: External Tool Imports

Full details in `12-project-onboarding.md`.

### S1 — Linear Import (Week 11)
- Linear OAuth connection
- GraphQL query: projects, cycles, issues, documents, comments
- Map: Project→Intent, Issue(done)→Ticket, Issue(backlog)→Canvas note, Document→Epic or Canvas notes
- Preserve labels as tags, comments as Decision/Question notes

### S2 — Jira Import (Week 12)
- Jira OAuth 2.0 or API token connection
- REST API v3: epics, stories, tasks, sprints, comments
- Map: Epic→Epic, Story(done)→Ticket, Sprint→Phase, Comment→Canvas notes
- Handle Jira custom fields (best-effort mapping)

### S3 — Notion Import (Week 13)
- Notion OAuth integration
- API: databases, pages, blocks
- Map: Database row→Canvas note, Structured page→Epic, Unstructured page→multiple Canvas notes
- Parse Notion block types: headings, bullets, toggles, callouts

### S4 — Cross-Source Deduplication (Week 13-14)
- Embedding similarity across all imported nodes (cosine > 0.85 = candidate)
- Cross-reference detection (Linear issue mentions PR number, Notion links to Jira)
- Merge UI: side-by-side comparison, one-click merge or dismiss
- Confidence scores on all dedup candidates

**Depends on:** F.6 (GitHub import from M2), Connector (embeddings)

---

## M3 Recurring Work (continuous)

### Testing (every week)
- Week 11: Reviewer agent eval suite (20 PR diff + ticket spec pairs)
- Week 12: GitHub integration tests (fixture repo, webhook replay, PR auto-link)
- Week 12: Export system tests (prompt compilation, context bundling, Conductor JSON format)
- Week 13: Lens traversal tests (origin lens, impact lens — verify correct graph walks)
- Week 14: Full e2e: brain dump → compile → execute → PR → verify → trace back
- Week 14: Performance benchmarks: 500 notes, 50 epics, 200 tickets — all views < 1s

### Security (Week 11 + Week 14)
- Week 11: GitHub webhook HMAC verification, token scoping audit
- Week 11: Auth middleware for all new API routes (temporal, GitHub, export)
- Week 12: RLS policies for Supabase mode — test that user A can't see user B's data
- Week 14: Full security audit: penetration test checklist, OWASP review, `cargo audit` clean

### Documentation (every week)
- Validation docs for all M3 features (GitHub integration, Reviewer, lenses, export system)
- Supabase deploy guide (Mode C)
- Self-hosting guide: architecture, configuration, backup/restore, upgrading
- Security hardening guide for self-hosters
- Complete API reference (OpenAPI spec finalized)
- Keyboard shortcut reference
- ADRs: export-only handoff model, GitHub permission scoping, prompt compilation strategy

### Code Cleanup (Week 14, 1 full week)
- Full dead code sweep: `cargo udeps`, frontend tree-shaking analysis
- Performance profiling and optimization pass
- All `#[allow(...)]` suppressions reviewed and removed or justified
- All `// HACK` and `// TODO` comments resolved or converted to tracked issues
- Dependency audit: remove unused, update outdated, check licenses
- Tech debt registry: close resolved items, carry forward remaining
- README finalized with badges, screenshots, setup instructions for all 3 modes
- CHANGELOG for v0.1.0

---

## M3 Exit Criteria

- [ ] GitHub OAuth flow works, repo binds to project
- [ ] Architect agent reads real repo file tree and contents
- [ ] `atlas/<id>-<slug>` branches auto-link to tickets
- [ ] PR bodies auto-populate with ticket spec and context
- [ ] Reviewer agent posts structured findings on PRs
- [ ] PR merge/close status flows up through all layers
- [ ] Origin lens: any node traces back to source canvas notes
- [ ] Impact lens: any canvas note traces forward to all PRs
- [ ] why.md generates correct provenance for any file
- [ ] Rabbit-hole drilldown shows full L0-L5 vertical slice
- [ ] Full e2e test passes: brain dump → compile → ship → trace back
- [ ] The core loop is closed: idea → spec → ticket → PR → verification → traceability
- [ ] "Copy Command" generates a working `claude --print` command with full upstream context
- [ ] "Download CLAUDE.md" renders complete ticket context as markdown
- [ ] Phase batch export produces ordered commands with dependency annotations
- [ ] Conductor swarm config exports valid JSON with parallelization waves
- [ ] PR auto-link passively detects branches matching `atlas/<project>/<ticket-id>-*`
- [ ] API keys configurable per provider in settings UI
- [ ] Per-agent model assignment works (e.g. Connector on Haiku, Architect on Opus)
- [ ] PR events (open/merge/close) and export events recorded in event log
- [ ] Playback polished: smooth animations for node/edge/PR lifecycle
- [ ] "Project history" page: full searchable timeline of all events
- [ ] All agent eval suites pass their thresholds
- [ ] Security audit complete: OWASP checklist, webhook verification, RLS tested
- [ ] Feature validation dashboard: all M1-M3 features show "validated" status
- [ ] API docs (OpenAPI) published and accurate
- [ ] Self-hosting + Supabase deploy guides complete
- [ ] Code cleanup complete: no dead code, no unresolved TODOs, deps audited
- [ ] Data retention/cleanup tasks running correctly
- [ ] Performance benchmarks meet targets (500 notes < 500ms, scrub < 200ms)
- [ ] Linear, Jira, Notion imports produce correct Atlas graphs
- [ ] Cross-source deduplication catches overlapping entities
- [ ] Imported nodes carry source provenance (clickable back to original tool)
- [ ] Incremental re-sync works for all connected sources
- [ ] Export commands include correct `cd <repo-dir>` per ticket's target repo
- [ ] Conductor swarm JSON respects cross-repo ticket dependencies with parallelization waves
- [ ] Branch convention works across all repos in a project
- [ ] PR auto-link scans all project repos
- [ ] Cross-repo why.md references related changes in other repos
- [ ] Cross-project Synthesizer detects overlap between projects
