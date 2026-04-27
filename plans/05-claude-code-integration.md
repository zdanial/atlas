# Butterfly — Agent Handoff & Export

Butterfly is the planning brain, not the execution runtime. It doesn't spawn or manage coding agents. Instead, it compiles tickets into **ready-to-run commands and prompt payloads** that you copy to Claude Code, paste into Conductor to kick off an agent swarm, or hand to any compatible tool.

---

## Core Principle

Butterfly's job ends at L1 (Tickets). The handoff to L0 (Code) is an **export**, not an execution. This keeps Butterfly simple, decoupled from any specific agent runtime, and compatible with whatever tool the user prefers.

```
Butterfly (planning)                          Agent Runtime (execution)
─────────────────                         ────────────────────────
L5 Canvas
L4 Intent
L3 Epic
L2 Phase
L1 Ticket ──── export ────────────────▶   Claude Code CLI
               copy command                Conductor workspace
               download CLAUDE.md          Cursor agent
               copy prompt payload         Codex CLI
               export swarm config         Any future agent
```

---

## Export Formats

### 1. Single Ticket → Claude Code Command

One click copies a ready-to-paste terminal command:

```bash
# Copied to clipboard from ticket T-42 "Add Stripe webhook handler"
cd ~/repos/butterfly-backend && claude --print "$(cat <<'PROMPT'
# Butterfly Ticket T-42: Add Stripe webhook handler

## Intent
Add a webhook endpoint that receives Stripe payment events, verifies the signature, and updates order status in the database.

## Repo
butterfly-backend (Rust + Axum)

## Files to touch
- src/routes/payments.rs (new route)
- src/webhooks/stripe.rs (new module)
- src/db/orders.rs (add update_status fn)
- backend/migrations/0015_add_webhook_log.sql

## Acceptance Criteria
- [ ] POST /api/webhooks/stripe receives events
- [ ] Webhook signature verified via HMAC-SHA256
- [ ] Order status updated on checkout.session.completed
- [ ] Invalid signatures return 401
- [ ] Duplicate events are idempotent (webhook_log table)
- [ ] Tests cover happy path + invalid signature + duplicate event

## Context
### Epic: Stripe Integration
We're adding Stripe as the payment provider. The checkout flow is handled by the frontend (T-43), this ticket handles the server-side webhook that confirms payment landed.

### Phase: Payment Backend (Phase 2 of 4)
This phase covers all backend payment logic. Phase 1 (DB schema) is already merged. Phase 3 (frontend) depends on this endpoint existing.

## Branch Convention
Create branch: butterfly/butterfly/T-42-stripe-webhook
PROMPT
)"
```

**What the user does:** copies this, pastes it in their terminal. Claude Code runs with full context.

### 2. Single Ticket → CLAUDE.md File

Downloads a `CLAUDE.md` that the user drops into their repo before starting Claude Code:

```markdown
# Butterfly Ticket T-42: Add Stripe webhook handler

## Intent
Add a webhook endpoint that receives Stripe payment events...

## Files to touch
- src/routes/payments.rs
- src/webhooks/stripe.rs
...

## Acceptance Criteria
...

## Upstream Context
### Epic: Stripe Integration
### Phase: Payment Backend
...

## Branch Convention
Create branch: butterfly/butterfly/T-42-stripe-webhook

## Related Tickets
- T-41 (DB schema) — merged, see PR #138
- T-43 (frontend checkout) — depends on this ticket
- T-44 (infra: webhook secret) — in progress
```

### 3. Phase → Ordered Ticket Batch

Export all tickets in a Phase as an ordered list with dependency annotations:

```markdown
# Phase: Payment Backend (4 tickets)

## Execution Order

### 1. T-41: Add payment tables (butterfly-backend)
[command: claude --print "..."]
Status: ✅ Done (PR #138 merged)

### 2. T-44: Provision Stripe webhook secret (butterfly-infra)
[command: claude --print "..."]
Status: ⏳ Can start now (no dependencies)

### 3. T-42: Add Stripe webhook handler (butterfly-backend)
[command: claude --print "..."]
Status: ⏳ Blocked by T-44 (needs STRIPE_WEBHOOK_SECRET)

### 4. T-43: Payment status UI (butterfly-frontend)
[command: claude --print "..."]
Status: ⏳ Blocked by T-42 (needs endpoint to exist)
```

### 4. Phase → Conductor Swarm Config

Export a configuration that Conductor can consume to kick off parallel agents:

```jsonc
{
  "name": "Payment Backend — Phase 2",
  "tickets": [
    {
      "id": "T-44",
      "title": "Provision Stripe webhook secret",
      "repo": "butterfly-infra",
      "prompt": "...(full prompt payload)...",
      "dependencies": [],
      "canParallelWith": ["T-42-prep"]
    },
    {
      "id": "T-42",
      "title": "Add Stripe webhook handler",
      "repo": "butterfly-backend",
      "prompt": "...(full prompt payload)...",
      "dependencies": ["T-44"],
      "canParallelWith": ["T-43-prep"]
    },
    {
      "id": "T-43",
      "title": "Payment status UI",
      "repo": "butterfly-frontend",
      "prompt": "...(full prompt payload)...",
      "dependencies": ["T-42"],
      "canParallelWith": []
    }
  ],
  "parallelization": {
    "wave1": ["T-44"],
    "wave2": ["T-42"],
    "wave3": ["T-43"]
  },
  "branchConvention": "butterfly/{project}/{ticketId}-{slug}"
}
```

The user opens Conductor, imports this config, and it spins up workspaces for each ticket in the correct dependency order.

### 5. Bulk Export → Clipboard / File / JSON

| Format | What | Use Case |
|--------|------|----------|
| **Clipboard (single command)** | One `claude --print "..."` command | Quick, one ticket at a time |
| **Clipboard (batch)** | Ordered list of commands | Run tickets sequentially in terminal |
| **CLAUDE.md download** | Markdown file per ticket | Drop into repo before starting Claude Code |
| **JSON export** | Structured ticket data with full context | Conductor import, custom tooling, scripting |
| **Markdown export** | Human-readable spec for entire phase | Share with team, review before execution |
| **Zip download** | CLAUDE.md per ticket + README with execution order | Offline handoff, archive |

---

## Export UI

### Ticket Card Actions

```
┌──────────────────────────────────────────┐
│  T-42: Add Stripe webhook handler         │
│  repo: butterfly-backend  •  status: ready    │
│                                           │
│  [📋 Copy Command]  [📄 CLAUDE.md]  [⋯]  │
│                                           │
│  ⋯ menu:                                  │
│  ├── Copy prompt payload (raw text)       │
│  ├── Copy as JSON                         │
│  ├── Download CLAUDE.md                   │
│  └── View full context (expand panel)     │
└──────────────────────────────────────────┘
```

### Phase Export Actions

```
┌──────────────────────────────────────────────────────┐
│  Phase: Payment Backend  •  4 tickets  •  2 repos     │
│                                                       │
│  [📋 Copy All Commands]  [📦 Export for Conductor]     │
│  [📄 Download All CLAUDE.md]  [📊 Export JSON]         │
│                                                       │
│  Execution Order:                                     │
│  1. T-44 (infra)    [📋]  ── can start now            │
│  2. T-42 (backend)  [📋]  ── after T-44               │
│  3. T-43 (frontend) [📋]  ── after T-42               │
└──────────────────────────────────────────────────────┘
```

### Keyboard Shortcuts
- `⌘⇧C` on selected ticket → copy command to clipboard
- `⌘⇧E` on selected phase → export all tickets

---

## Prompt Payload Compilation

The heart of the export system. Every ticket's prompt payload is **compiled** from the full upstream context chain:

```rust
// backend/src/export/prompt.rs

pub struct PromptCompiler {
    pool: DbPool,
}

impl PromptCompiler {
    /// Compile a complete prompt payload for a ticket
    pub async fn compile_ticket(&self, ticket_id: Uuid) -> Result<PromptPayload> {
        let ticket = self.get_node(ticket_id).await?;
        let phase = self.get_parent(ticket_id).await?;
        let epic = self.get_parent(phase.id).await?;
        let intent = self.get_parent(epic.id).await?;

        // Walk upstream canvas notes that fed into this epic
        let source_notes = self.get_source_notes(epic.id).await?;

        // Get the repo + file tree for context
        let repo = self.get_ticket_repo(&ticket).await?;

        // Get sibling tickets in the same phase (for awareness)
        let siblings = self.get_sibling_tickets(phase.id, ticket_id).await?;

        // Get cross-repo dependencies
        let deps = self.get_ticket_dependencies(ticket_id).await?;

        Ok(PromptPayload {
            ticket,
            phase_context: phase,
            epic_context: EpicSummary::from(epic),
            intent_context: IntentSummary::from(intent),
            source_notes: source_notes.into_iter().map(NoteSummary::from).collect(),
            repo,
            sibling_tickets: siblings,
            dependencies: deps,
            branch_convention: self.branch_name(&ticket, &repo),
        })
    }

    /// Render the payload as a markdown prompt
    pub fn render_markdown(&self, payload: &PromptPayload) -> String { ... }

    /// Render as a CLI command
    pub fn render_command(&self, payload: &PromptPayload) -> String { ... }

    /// Render as a Conductor-compatible JSON config
    pub fn render_conductor_config(&self, phase_id: Uuid) -> Result<ConductorConfig> { ... }
}
```

### Context Bundling Rules

The prompt payload includes enough context for the agent to work autonomously, but not so much that it overwhelms the context window:

| Section | Source | Included? |
|---------|--------|-----------|
| Ticket title + intent | L1 Ticket | Always |
| Files to touch | L1 Ticket payload | Always |
| Acceptance criteria | L1 Ticket payload | Always |
| Phase objective | L2 Phase | Always |
| Epic PRD summary | L3 Epic (first 500 words) | Always |
| Epic tech plan | L3 Epic | If ticket is complex (≥3 files) |
| Intent | L4 Intent (one line) | Always |
| Source canvas notes | L5 (decisions, constraints only) | If ≤10 notes |
| Sibling tickets | L1 (title + status only) | Always (for awareness) |
| Dependencies | Cross-ticket edges | If any exist |
| Branch convention | Derived | Always |
| Repo README excerpt | L0 | If exists (first 200 words) |

---

## Status Tracking (Post-Export)

Butterfly doesn't manage agent sessions, but it does track what happened after export:

### Manual Status Updates
User can mark tickets as: `ready` → `exported` → `in-progress` → `done` → `verified`

### GitHub-Based Tracking
When a PR opens with a branch matching `butterfly/<project>/<ticket-id>-*`:
- Ticket auto-moves to `in-progress`
- PR merge → ticket moves to `done`
- Reviewer agent runs on PR (if GitHub integration is connected) → ticket moves to `verified` or `verified-with-drift`

This is passive — Butterfly watches GitHub, it doesn't control the agent.

---

## Provider Registry (BYO API Keys)

API keys power Butterfly's **internal agents** (Connector, Synthesizer, Architect, Decomposer, Reviewer, Historian, Strategist) — not coding agents. The coding happens outside Butterfly.

### Capability Enum

```rust
// backend/src/ai/types.rs

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Capability {
    Classification,     // Connector: fast, cheap
    Synthesis,          // Synthesizer: medium
    Strategy,           // Strategist: frontier
    Architecture,       // Architect: frontier
    Decomposition,      // Decomposer: medium
    Review,             // Reviewer: frontier (reviews PRs, not code)
    Embedding,          // Edge inference: embedding model
}

#[async_trait]
pub trait ModelProvider: Send + Sync {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn capabilities(&self) -> &[Capability];
    fn models(&self) -> &[ModelDef];
    async fn call_model(&self, params: CallParams) -> Result<CallResult>;
    async fn embed_text(&self, text: &str) -> Result<Vec<f32>> {
        Err(anyhow!("embedding not supported"))
    }
}
```

### Registry

```rust
// backend/src/ai/registry.rs

pub struct ProviderRegistry {
    providers: HashMap<String, Arc<dyn ModelProvider>>,
    agent_overrides: HashMap<AgentRole, (String, String)>, // (provider_id, model_id)
}

impl ProviderRegistry {
    pub fn init(config: &ProviderConfig) -> Self { ... }
    pub fn get_provider(&self, capability: Capability) -> Result<&dyn ModelProvider> { ... }
    pub fn get_provider_for_agent(&self, agent: AgentRole) -> Result<&dyn ModelProvider> { ... }
    pub fn list_providers(&self, capability: Option<Capability>) -> Vec<ProviderInfo> { ... }
}
```

For **Mode A (browser-only)**, a TypeScript mirror of the registry exists in `frontend/src/lib/agents/providers.ts`. It calls provider APIs directly from the browser.

### Default Routing

| Agent | Capability | Default Provider | Default Model |
|-------|-----------|-----------------|---------------|
| Connector | CLASSIFICATION | anthropic | claude-haiku-4-5 |
| Synthesizer | SYNTHESIS | anthropic | claude-sonnet-4-6 |
| Strategist | STRATEGY | anthropic | claude-opus-4-6 |
| Architect | ARCHITECTURE | anthropic | claude-opus-4-6 |
| Decomposer | DECOMPOSITION | anthropic | claude-sonnet-4-6 |
| Reviewer | REVIEW | anthropic | claude-opus-4-6 |
| Embeddings | EMBEDDING | openai | text-embedding-3-small |

### API Key Management

```bash
# Environment variables (Rust backend reads these)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
DEEPSEEK_API_KEY=...
```

Encrypted storage in DB for Mode B/C. Browser-local encrypted storage for Mode A. Keys never logged, never in API responses. See `09-auth-security.md` for full details.

### Settings UI

```
┌─────────────────────────────────────────┐
│  Settings > AI Providers                 │
│                                          │
│  These power Butterfly's planning agents     │
│  (not coding — coding happens in your    │
│  terminal or Conductor)                  │
│                                          │
│  ┌─ Anthropic ──────────────────────┐   │
│  │  API Key: sk-ant-••••••••  [Edit] │   │
│  │  Status: ✓ Connected              │   │
│  └───────────────────────────────────┘   │
│  ┌─ OpenAI ─────────────────────────┐   │
│  │  API Key: (not set)       [Add]   │   │
│  │  Status: — Not configured         │   │
│  └───────────────────────────────────┘   │
│                                          │
│  Agent Model Assignments                 │
│  ┌───────────┬──────────────────────┐   │
│  │ Connector  │ [anthropic ▾] [haiku-4.5 ▾] │
│  │ Architect  │ [anthropic ▾] [opus-4.6 ▾]  │
│  │ Reviewer   │ [anthropic ▾] [opus-4.6 ▾]  │
│  └───────────┴──────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## Data Model

No `agent_session` or `hook_event` tables needed. The export model is stateless from Butterfly's perspective. Tracking comes from GitHub integration (PR auto-link) and manual status updates.

```sql
-- Provider configuration (encrypted keys) — powers Butterfly's internal agents
CREATE TABLE provider_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES project(id),
  provider_id   TEXT NOT NULL,          -- 'anthropic', 'openai', etc.
  api_key_enc   TEXT,                   -- encrypted API key
  enabled       BOOLEAN DEFAULT true,
  settings      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, provider_id)
);

-- Export history (optional, for tracking what was exported)
CREATE TABLE export_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES project(id),
  export_type   TEXT NOT NULL,          -- 'command', 'claude_md', 'conductor_json', 'batch_markdown'
  scope_type    TEXT NOT NULL,          -- 'ticket', 'phase', 'epic'
  scope_id      UUID NOT NULL,          -- ticket/phase/epic node ID
  ticket_ids    UUID[] NOT NULL,        -- all tickets included in this export
  exported_at   TIMESTAMPTZ DEFAULT now(),
  exported_by   UUID                    -- user ID
);
```

---

## Implementation Timeline

### M1 (Week 3-4): Provider Registry
- `ProviderRegistry` + `callModel()` abstraction in Rust backend
- TypeScript mirror for browser-only mode
- API key settings UI (env vars + encrypted DB storage)
- Provider health check endpoint

### M2 (Week 9-10): Export System
- **Week 9:** `PromptCompiler` — compile full context from ticket → phase → epic → intent → canvas notes
- **Week 9:** "Copy Command" button on ticket cards — generates `claude --print "..."` command
- **Week 9:** "Download CLAUDE.md" — renders prompt as markdown file
- **Week 10:** Phase batch export — ordered list of commands with dependency annotations
- **Week 10:** Conductor swarm config export (JSON)
- **Week 10:** Keyboard shortcuts: `⌘⇧C` (copy command), `⌘⇧E` (export phase)
- **Week 10:** Export log table for tracking

### M3 (Week 13-14): Polish + Reviewer
- **Week 13:** GitHub-based passive tracking: PR auto-link → ticket status update
- **Week 13:** Reviewer agent runs on linked PRs (via GitHub webhooks, not agent spawning)
- **Week 14:** Export format refinement based on real usage
- **Week 14:** Custom export templates (user-defined prompt structure)
