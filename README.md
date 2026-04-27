# Butterfly — Product Spec

*A spec-driven planning workspace for founders who think faster than they can ticket.*

**Working name:** Butterfly
**One-liner:** A spatial thinking canvas that compiles into a structured spec, then into tickets, then into code — with full traceability from manic-CEO brain dump to merged PR.
**Status:** v0.1 spec, opinionated draft

---

## 1. The problem, stated honestly

Three tools exist in your workflow today, and none of them are the right shape:

1. **Linear / Shortcut** are excellent ticket databases but assume the spec already exists. They're where ideas go to be *tracked*, not where they're *formed*. They have no opinion about how a feature gets thought through, and they have no concept of "this idea overlaps with that idea two weeks ago."
2. **Traycer** is excellent at spec-driven coding once you know what you want. It assumes a developer at an IDE who has a specific feature in mind. It doesn't help you decide *what* to build, only how to ship what you've already decided. Its workflow is task-shaped, not roadmap-shaped.
3. **Notion / Linear docs / Google Docs** are where the actual planning happens, badly. Thoughts go in but they don't compose. There's no synthesis. Two ideas in two different docs never find each other.

Nodepad solved a slice of this problem for research thinking — spatial canvas, AI quietly classifying and connecting notes in the background, synthesis on demand. But it stops at insight. It doesn't compile thinking into action.

**Butterfly is the missing layer between "I have a hunch" and "here's a PR."** It's where a founder dumps thought, an AI team helps shape it into a coherent product plan, and that plan stays linked all the way down to the diff that implemented it.

The user is *you* (and people like you): someone who is the product manager, the engineering lead, and the CEO of their own work, who generates more direction than any human team could absorb, and who needs a system that can keep up with the rate of re-planning without losing the trail of why anything was decided.

---

## 2. What Traycer gets right, and where it's wrong for this use case

**Right:**
- Spec-before-code is the correct loop. Drift happens when intent lives only in chat history.
- Phases as the unit of execution — bounded, verifiable, with context carrying forward — is a strong primitive.
- Mini-specs (PRD + tech plan + edge cases per epic) beat one giant document.
- Verification is part of the loop, not a final gate.
- Ticket decomposition with full upstream context is what makes handoff to coding agents work.

**Wrong for our use case:**
- Traycer is task-scoped. It starts when you already know "I want to add Stripe checkout." It has no opinion about the *portfolio* of work — what to build next, what's blocked, what overlaps.
- It's a VS Code extension. Planning shouldn't live inside the IDE — that's where execution lives. Planning needs its own surface.
- It treats specs as artifacts produced linearly from a prompt. There's no canvas, no spatial thinking, no "drop fifty thoughts in and let them organize themselves."
- Re-planning is awkward. You can re-arrange phases, but you can't easily say "the world changed, re-derive the next 3 weeks of work from scratch given these new constraints."
- No first-class concept of *milestone* or *strategic intent* above the epic level. You can fake it, but the tool doesn't help you reason about it.
- Verification happens against a plan you wrote yesterday. There's no continuous reconciliation of "is this still the right plan."

Butterfly keeps the spec-driven loop and the phase primitive. It replaces the task-shaped entry point with a canvas-shaped one and adds a roadmap-shaped layer above.

---

## 3. What Nodepad gets right, and where it stops short

**Right:**
- Spatial canvas as the input surface — you don't have to know the structure before you start typing.
- AI works in the background, classifying and connecting, not at the front asking "how can I help you today?"
- Synthesis on demand — emergent insight from the whole canvas, surfaced when there's enough material to bridge.
- Multiple views of the same data (tiling / kanban / graph). Same notes, different shapes for different thinking.
- Typed notes as a forcing function for clarity. A "claim" is not the same as a "question."
- Local-first, no account, no friction.

**Stops short:**
- Notes are terminal. They never become anything. There's no compilation step from canvas → spec → ticket → PR.
- No project model. Everything is one flat namespace of nodes.
- No collaboration with agents beyond classification and synthesis. No "design this with me," no "decompose this into tickets."
- No codebase awareness. The thinking happens in a vacuum from the actual repo.

Butterfly adopts the canvas, the background AI, the typed-notes idea, and the multi-view affordance — and adds a full compilation pipeline underneath.

---

## 4. Core mental model

Butterfly has **five layers**. Each is a view of the same underlying graph, and each compiles down into the next:

```
┌─────────────────────────────────────────────────────────────┐
│  L5  CANVAS         "Brain dump"                            │
│      Spatial notes, AI classification, synthesis            │
│      ↓ compile                                              │
│  L4  INTENT         "What we're trying to do"               │
│      Strategic objectives, milestones, bets                 │
│      ↓ compile                                              │
│  L3  EPIC           "How we'll get there"                   │
│      PRDs, tech specs, wireframes, edge cases               │
│      ↓ compile                                              │
│  L2  PHASE          "The next slice to ship"                │
│      Bounded work units with file-level plans               │
│      ↓ compile                                              │
│  L1  TICKET         "Actionable agent handoff"              │
│      Self-contained, file-scoped, verifiable                │
│      ↓ execute                                              │
│  L0  CODE           "The diff that landed"                  │
│      Linked PR, files changed, verification status          │
└─────────────────────────────────────────────────────────────┘
```

**The critical design principle:** these are not separate documents. They are *views at different zoom levels of the same graph*. You can stand at L0 and zoom out to see the L5 thought that started it. You can stand at L5 and drill down to see every PR that came from a synthesis you wrote three months ago.

This is the inversion of your stated requirement: "everything should be viewable at different levels of detail (direct implementation details being the highest level of detail)." In Butterfly, **detail is depth, not separate documents.** A milestone is just a node that, when expanded, reveals its child epics, then phases, then tickets, then PRs — all in one continuous tree.

---

## 5. The five layers in detail

### L5 — Canvas (the brain dump layer)

A spatial canvas, directly inspired by Nodepad but extended.

- You type a thought into a command bar. It becomes a note on the canvas.
- The note is automatically classified into one of ~12 types tuned for product planning rather than research:
  - **Goal** — something we want to be true
  - **Problem** — something currently wrong
  - **Hypothesis** — something we believe but haven't tested
  - **Idea** — a possible solution or feature
  - **Constraint** — something that limits us (budget, time, tech, legal)
  - **Decision** — a call we've made (with rationale)
  - **Question** — something we need to resolve
  - **Risk** — something that could go wrong
  - **Insight** — a learning, often from data or user feedback
  - **Reference** — a link, doc, or external artifact
  - **Bet** — a directional commitment with a measurable outcome
  - **Note** — fallback, unstructured
- A background agent ("the Connector") continuously infers relationships between notes — *supports*, *contradicts*, *blocks*, *implements*, *duplicates*, *refines*. These show as edges in the graph view.
- A second background agent ("the Synthesizer") periodically scans the canvas and proposes higher-level structures: "These five notes look like one epic — want to compile them?" or "This bet contradicts this constraint — worth resolving."
- Three views: **canvas** (free spatial), **kanban** (grouped by type), **graph** (force-directed, edges visible). Same data, your choice of shape.
- Notes can be tagged to a project or left in a global pool. Cross-project synthesis is allowed and encouraged — that's how overlap gets found.

The canvas is intentionally low-stakes. Nothing on it has to become anything. It's the place where manic-CEO mode is welcome.

### L4 — Intent (the strategic layer)

Above the canvas sits the Intent layer: a small number of long-lived nodes that represent what you're actually trying to do. Goals, milestones, bets.

- An Intent node has: a name, a target outcome (measurable when possible), a deadline or time horizon, and a status (active / paused / achieved / abandoned).
- Intent nodes are *parents* of canvas notes. Any canvas note can be linked to one or more Intents — the AI suggests these links automatically.
- The Intent view is roadmap-shaped: a Gantt-ish or swim-lane visualization showing milestones across time, with their child epics underneath.
- **Re-planning lives here.** When the world changes, you tell Butterfly: "Re-derive my next 4 weeks given these new constraints" or "What changes if I drop Milestone X?" The AI proposes a new arrangement of epics under intents, and you accept or edit.

This is the layer Linear and Traycer both lack. It's the answer to "what should I be working on?" rather than "how do I ship what I'm working on?"

### L3 — Epic (the spec layer)

This is where Traycer's mental model takes over, but cleaned up.

- An Epic is a mini-spec: PRD + tech plan + open questions + wireframes (optional) + decision log.
- Epics are compiled from canvas clusters or written directly. The "compile from canvas" flow is an AI-mediated dialogue: the Synthesizer drafts a PRD from the cluster, asks clarifying questions (in the Traycer Epic Mode style), and produces a structured doc.
- Each section of the spec is editable, versioned, and can be re-derived from the underlying canvas notes. If you change a canvas note that fed an epic, the epic gets a "stale" badge with a one-click "re-sync from sources."
- Epics live under Intents. An Epic without an Intent parent is allowed but flagged.
- Edge cases, constraints, and risks pulled in from the canvas show up as a sidebar — these are the "invisible rules" Traycer's blog talks about, made visible.

### L2 — Phase (the executable slice)

A Phase is a bounded chunk of an Epic that can be shipped and verified as a unit.

- Generated from the Epic by an AI planner agent. Default: propose 2–5 phases per epic, ordered by dependency.
- Each phase has: objective, file-level change list, architecture notes, verification criteria, estimated complexity, and a context bundle (the relevant slice of upstream Intent + Epic + canvas notes).
- Phases are draggable, mergeable, splittable. You can insert a phase between two existing ones, and the planner will re-derive context for downstream phases.
- A Phase has a clear hand-off state: ready for ticketing → in progress → in review → done.
- Verification is built in: when a phase is marked done, the Reviewer agent compares the actual diff against the phase plan and flags drift (Critical / Major / Minor / Outdated, in Traycer's vocabulary).

### L1 — Ticket (the agent handoff)

Tickets are the smallest unit and the thing you actually hand to a coding agent.

- One ticket = one self-contained, agent-executable change. Usually one or a few files. Always testable.
- Generated from a Phase by the Decomposer agent. A phase typically yields 3–10 tickets.
- Each ticket has: title, intent (one paragraph), file paths to touch, acceptance criteria, the relevant context bundle (compiled from upstream layers), and a recommended agent (Claude Code / Cursor / Codex / etc).
- Tickets carry a *prompt payload* — a structured handoff document that any compatible coding agent can consume. This is the AGENTS.md / Traycer-style spec rendered for a specific ticket.
- Tickets are linkable to GitHub Issues for teams that want issue-tracker continuity, but Butterfly tickets are first-class on their own.

### L0 — Code (the implementation reality)

The bottom layer is reality: the actual diff, on the actual branch, in the actual repo.

- Butterfly connects to GitHub. Each ticket can be linked to one or more PRs.
- When a PR opens with a reference to an Butterfly ticket ID in the branch name or PR body, Butterfly auto-links it.
- PR status (open / merged / closed), CI status, and review status flow back up to the ticket and bubble through phase → epic → milestone status.
- Once merged, the diff is captured (file paths + summary, not necessarily full content) and becomes the canonical "this is what shipped" record for that ticket. Forever after, you can stand on a milestone, drill down to a ticket, and see exactly which lines changed and why.
- The Verifier agent runs on PR open and again on merge: does this code match the ticket spec? It posts a comment on the PR with its findings — this is the Traycer verification loop, but pulling context from the full upstream stack rather than just the immediate plan.

---

## 6. The agent team

Butterfly has a small, named team of agents. Each has a single job. Naming them matters because the user should feel they're directing a team, not poking a monolithic chatbot.

| Agent | Layer | Job |
|---|---|---|
| **Connector** | L5 | Continuously classify canvas notes, infer edges between them, suggest links to Intents. |
| **Synthesizer** | L5 → L4/L3 | Watch the canvas. Propose: "these notes look like an epic," "this cluster contradicts itself," "this is a duplicate of last month's idea." |
| **Strategist** | L4 | Help reason about the Intent layer. Re-derive roadmaps under new constraints. Surface blocked, stale, or contradictory intents. |
| **Architect** | L3 → L2 | Compile epics into phased plans. Reads the codebase. Produces file-level change plans. The Traycer-equivalent agent. |
| **Decomposer** | L2 → L1 | Break phases into tickets. Compile context bundles. Choose recommended coding agent. |
| **Reviewer** | L0 → L1 | Verify shipped code against ticket spec. Post drift reports. Categorize by severity. |
| **Historian** | all | Maintain the audit trail. Answer "why did we decide this" by walking the graph backwards. |

The user can chat with any agent directly. Each chat is scoped to that agent's layer — talking to the Strategist gives you roadmap-level reasoning; talking to the Architect gives you file-level reasoning. Much better than one chatbot pretending to do everything.

A "Round Table" mode lets you address a question to all of them at once: *"I'm thinking about killing the SQFTP analytics module. What does each of you think?"* The Strategist talks about milestone impact, the Architect talks about what code unwinds, the Historian surfaces why you started it, the Reviewer notes which open PRs would be orphaned. Five perspectives in one view.

---

## 7. Documentation and traceability — the "viewable at every detail level" requirement

This is a first-class concern, not a feature bullet.

The unifying primitive is the **Lens**. A Lens is a saved zoom level + filter into the graph. Examples:

- **Roadmap lens** — only Intent and Epic nodes, time-axis layout
- **Sprint lens** — only Phase and Ticket nodes for the next 2 weeks
- **Implementation lens** — only Tickets in flight and their linked PRs
- **Origin lens** — given a ticket, walk backwards to every canvas note that contributed to it
- **Impact lens** — given a canvas note, walk forwards to every PR it eventually produced

Every node has a "rabbit hole" affordance: click it, get a vertical slice from that node up to the highest-level Intent and down to every PR underneath. This is the "viewable at different levels of detail" requirement made literal — you're never reading a separate document, you're always looking at the same graph from a different distance.

Documentation is generated, not written. The Historian agent maintains:

- A **decision log** per Intent, auto-generated from Decision-typed canvas notes plus any decisions captured during epic clarification dialogues.
- A **changelog** per Milestone, auto-generated from merged PRs linked through the chain.
- A **README.md** per Epic, exportable and committable to the repo if desired (this is the Traycer AGENTS.md analog).
- A **why.md** per file in the codebase — given a file path, walk every PR that touched it and surface the ticket → phase → epic → intent chain. Answers "why does this file look like this" with a real audit trail.

Nothing about documentation is manual. If a user is writing docs by hand in Butterfly, the tool has failed.

---

## 8. GitHub integration

Tighter than Linear's, in specific ways.

**What ships in v1:**

- **OAuth GitHub app**, installed per repo. Read: PRs, issues, branches, commits, file tree. Write: PR comments, branch creation, optional commit-on-behalf for approved diffs.
- **Branch convention:** `butterfly/<ticket-id>-<slug>`. When a branch matching this pattern is pushed, Butterfly auto-links it to the ticket.
- **PR templating:** when a coding agent opens a PR for an Butterfly ticket, the PR body is auto-populated with the ticket spec, the upstream phase context, and a checklist derived from acceptance criteria.
- **PR comment integration:** the Reviewer agent posts a structured verification comment on each PR. Findings are categorized and mapped back to ticket acceptance criteria.
- **Status sync:** PR open / review / merge state flows back into the ticket, phase, epic, and milestone status. Closing a PR without merging marks the ticket as needs-rework with a one-click "re-derive from current spec."
- **Codebase awareness:** the Architect agent has read access to the file tree and can fetch file contents on demand when planning. This is what lets it produce file-level plans rather than abstract ones.
- **File → ticket reverse lookup:** in any file in the repo, Butterfly can show "this file was touched by these tickets, under these epics, for these intents."

**Deliberately out of v1:**

- Bidirectional Linear/Jira sync. People who want Butterfly as a Linear replacement get full functionality; people who want Butterfly alongside Linear can wait for v2.
- Self-hosted Git providers. GitHub.com only at first.
- Auto-merge. The Reviewer can flag a PR as ready, but humans merge.

---

## 9. UX principles

Six rules that govern every design decision:

1. **The canvas is sacred.** L5 is where ideas are welcome in any form. No required fields, no validation, no friction. If a user has to think about structure before typing, we lost.
2. **Compilation is always reversible.** Every "compile to epic," "decompose to tickets," "re-derive plan" action is a draft until accepted, and accepted changes are versioned. You can always go back.
3. **AI suggestions are passive by default.** Background agents *propose*, they don't *act*. Suggestions appear in a side rail, not as modals. The Synthesizer never interrupts.
4. **Detail is depth, not separate pages.** Drilling into a node should never feel like navigating away. The graph stays visible; the detail expands inline or in a side panel.
5. **Every artifact has provenance.** No node is an orphan. If you can't answer "where did this come from," the tool has failed.
6. **The keyboard is the primary interface.** Power users live in the command palette. ⌘K opens it; everything is reachable.

Visual direction: Linear-grade restraint, Things-grade typography, Nodepad-grade spatial freedom on the canvas, Figma-grade fluidity on the graph view. Dark and light themes from day one. No emoji in chrome. The aesthetic should feel like an instrument, not a toy.

---

## 10. Technical architecture (opinionated v1)

Built to be readable, modular, and tested — not clever.

**Frontend**
- Next.js 15 (App Router), React 19, TypeScript strict.
- Tailwind v4 for styling, shadcn/ui as the component baseline.
- Tiptap or Lexical for the rich-text spec editor; React Flow for the graph view; custom canvas (HTML + CSS transforms, not raw `<canvas>`) for L5 because we want native text inputs.
- Zustand for client state, TanStack Query for server state. No Redux.
- Local-first with sync: every change writes to IndexedDB immediately, then to the server. CRDT-based conflict resolution for collab (Yjs or Automerge).

**Backend**
- Node + Hono on Cloudflare Workers, or Node + Fastify on Fly.io. Pick one and stick with it. Both are fine; I'd start on Fly to avoid Workers' stateful constraints.
- PostgreSQL (Neon or Supabase) as the source of truth.
- Drizzle for the ORM. Migrations versioned in the repo.
- Object storage (R2 or S3) for wireframes, attachments, exports.

**Data model — the core nodes**

```
Node                      // the universal primitive
  id, type, layer, project_id, parent_id (nullable),
  title, body (rich text), created_at, updated_at, created_by

NodeEdge                  // typed relationships
  source_id, target_id, relation_type, weight, source (ai|human)

NodeVersion               // every edit is versioned
  node_id, version, body, diff_summary, author, created_at

Project                   // top-level container
  id, name, repo_id (nullable), settings

Repo                      // GitHub repo binding
  id, github_repo, install_id, default_branch

PR                        // GitHub PR mirror
  id, repo_id, ticket_id, number, status, head_sha, ...

VerificationReport        // Reviewer agent output
  id, target_id (ticket or phase), severity, findings (jsonb), pr_id

AgentRun                  // every agent invocation, for replay/audit
  id, agent, layer, input, output, model, tokens, cost, created_at
```

The choice to make `Node` the universal primitive — rather than separate `CanvasNote`, `Intent`, `Epic`, `Phase`, `Ticket` tables — is intentional. It's what makes the multi-layer-as-views-of-one-graph model possible. Type-specific fields go in a `payload` jsonb column with per-type Zod schemas.

**AI layer**
- Provider-agnostic via a thin abstraction (`callModel({ profile, messages, tools })`).
- Model profiles per agent role: Connector and Synthesizer use a fast cheap model, Architect and Reviewer use a frontier model, Decomposer uses something in between. Configurable per project.
- Tool use: each agent has a scoped toolset. The Architect can read repo files. The Reviewer can fetch PR diffs. The Connector cannot do either.
- Every agent run is logged in `AgentRun` for replay, debugging, and cost accounting.

**Testing**
- Unit tests on every pure function (Vitest).
- Integration tests on the compile pipelines (canvas→epic, epic→phases, phase→tickets) with golden inputs and snapshot outputs.
- End-to-end tests on the GitHub integration with a fixture repo (Playwright + a sandbox GitHub org).
- No agent ships without an eval harness — a fixed set of inputs with graded outputs, run on every model upgrade.

**Realtime collaboration (v1.5, not v1)**
- Yjs over WebSocket for canvas + spec editing. Out of scope for first ship.

---

## 11. What v1 is, and what it isn't

**v1 ships with:**

- L5 canvas with Connector + Synthesizer agents
- L4 Intent layer with manual creation, AI-assisted re-planning
- L3 Epic compilation from canvas clusters or direct authoring
- L2 Phase generation from epics, with Architect agent
- L1 Ticket decomposition with Decomposer agent
- L0 GitHub integration: branch convention, PR linking, Reviewer comments
- All five Lenses, the rabbit-hole drilldown affordance
- Command palette as primary nav
- Single-user, local-first, with cloud sync to one machine
- Markdown/JSON export for everything
- One project, one repo, no orgs

**v1 explicitly does NOT ship with:**

- Realtime multiplayer
- Mobile app
- Self-hosted option
- Linear/Jira import
- Custom agent definitions (the agent team is fixed in v1)
- Auto-execution (YOLO mode equivalent) — every agent action requires human accept
- Metrics/analytics dashboards
- Slack/Discord integrations

The reason for this scope is that the *core loop* — brain dump → compile → ship → trace back — has to be undeniably good before any of those features matter. If the loop is good, the features are decoration. If the loop is bad, no amount of integrations rescue it.

---

## 12. The first three milestones (a worked example, in Butterfly's own format)

Because the spec should eat its own dog food, here's how I'd structure the actual build of Butterfly itself, in Butterfly's own model:

**Milestone M1 — Canvas + Connector (4 weeks)**
The brain-dump layer works end to end. You can dump notes, they get classified, edges appear, you can switch between canvas / kanban / graph views. No compilation downstream yet. Ship as a standalone "thinking tool" beta.

- Epic 1.1: Canvas primitive + note CRUD + local-first persistence
- Epic 1.2: Connector agent + classification pipeline + edge inference
- Epic 1.3: Three views (canvas / kanban / graph)
- Epic 1.4: Command palette + keyboard shortcuts

**Milestone M2 — Compilation pipeline (6 weeks)**
The middle of the stack. Canvas clusters compile into Epics, Epics into Phases, Phases into Tickets. No GitHub yet. You can plan an entire feature in Butterfly and export the tickets to clipboard for manual handoff.

- Epic 2.1: Synthesizer agent + cluster detection
- Epic 2.2: Epic mini-spec editor + clarification dialogue
- Epic 2.3: Architect agent (with mock codebase, no real repo yet)
- Epic 2.4: Decomposer agent + ticket prompt-payload format
- Epic 2.5: Re-derivation flows (re-sync stale epics, re-plan under new constraints)

**Milestone M3 — Code reality layer (4 weeks)**
GitHub integration, Reviewer agent, traceability all the way to merged PRs. This is the milestone that makes Butterfly actually replace Linear in your workflow.

- Epic 3.1: GitHub OAuth app + repo binding
- Epic 3.2: Branch convention + PR auto-linking
- Epic 3.3: Architect agent reads real repo
- Epic 3.4: Reviewer agent + PR comment integration
- Epic 3.5: Origin lens + Impact lens + why.md generation

After M3 the loop is closed. After M3 we earn the right to think about multiplayer, mobile, and enterprise.

---

## 13. Open questions for you

These are calls I'd want your input on before locking the spec:

1. **Single-tenant local-first vs cloud-first.** I drafted local-first because it matches Nodepad's ethos and it's how you seem to prefer to work, but cloud-first is much simpler to build and ships faster. How much do you care about local-first for v1?
2. **Agent provider strategy.** Do you want Butterfly to use Claude exclusively (simpler, tighter quality control), or be model-agnostic from day one (Nodepad-style, OpenRouter-backed)?
3. **The canvas-vs-doc tension.** Some users will want to skip the canvas entirely and write epics directly. I have it as a supported flow but de-emphasized. Should it be a first-class entry point or a hidden one?
4. **Pricing model.** This shapes architecture more than people think. SaaS subscription? Per-seat? BYO-keys like Nodepad? "Free if you bring your own infra"?
5. **Mobile.** Not v1, but for v2: read-only mobile companion (view roadmap, approve agent suggestions) or full mobile? The first is 10x cheaper and probably 80% of the value.
6. **Public vs private launch.** This is the kind of tool that benefits from a small, opinionated alpha cohort before a public release. Worth designing a closed alpha into the rollout?

---

## 14. Why this is worth building

Three reasons, in order of importance:

1. **You will use it every day.** That's reason enough. The best products are often built by founders solving their own daily pain.
2. **Spec-driven development is real, and the category is wide open.** Traycer is the strongest player, and Traycer has chosen to live inside the IDE. There is no canvas-first, planning-first, founder-first competitor. The shape of that product hasn't been claimed yet.
3. **The Linear-replacement angle is a Trojan horse.** Butterfly looks like a thinking tool, but it ships tickets. It looks like a planning tool, but it tracks PRs. It looks like a Notion competitor, but it talks to coding agents. Each framing opens a different market. The actual product is bigger than any of them.

---

*End of v0.1 spec. Next move: I'd build a 2-week prototype of L5 only — canvas + Connector — to validate the feel before committing to the full stack. If the canvas doesn't feel right, nothing downstream matters.*