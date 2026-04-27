# Butterfly — Claude Code Context

Butterfly is a spatial thinking canvas that compiles brain dumps into structured specs, tickets, and exportable commands — with full traceability from idea to merged PR.

## Project Structure

- `frontend/` — SvelteKit 2 + Svelte 5 (runes) + TypeScript strict + Tailwind v4 + Bits UI
- `backend/` — Rust + Axum + tokio + SQLx (PostgreSQL)
- `backend/migrations/` — 16 SQLx migrations defining the full data model
- `plans/` — Design docs (data model, deployment modes, milestones, etc.)

## Key Commands

```bash
# Frontend
cd frontend && pnpm dev          # Dev server on :5173
cd frontend && pnpm test         # Vitest
cd frontend && pnpm check        # svelte-check (typecheck)
cd frontend && pnpm lint         # ESLint

# Backend
cd backend && cargo run           # Axum server on :3001 (needs DATABASE_URL)
cd backend && cargo test          # Tests
cd backend && cargo fmt --check   # Format check
cd backend && cargo clippy        # Lints
```

## Architecture

### Data Model

Universal `node` table stores all entity types (goal, problem, hypothesis, idea, constraint, decision, question, risk, insight, reference, bet, note, intent, epic, phase, ticket) across 6 layers (L0-L5). Type-specific fields go in `payload` JSONB column.

### Storage Adapter Pattern

Frontend uses `StorageAdapter` interface (`frontend/src/lib/storage/adapter.ts`):
- **Mode A (browser-only):** `IndexedDBAdapter` using Dexie.js — no server needed
- **Mode B (local server):** `ApiAdapter` calling Rust backend (TODO)
- **Mode C (cloud):** `SupabaseAdapter` extending ApiAdapter (TODO)

### Backend

Rust Axum server with SQLx (compile-time unchecked queries for now). Migrations run on startup. Auto-seeds a default workspace and project on first run.

## Conventions

- Svelte 5 runes: use `$state`, `$derived`, `$props()` — not legacy reactive syntax
- SQLx: use `sqlx::query()` with string SQL, not `sqlx::query!()` macro
- All UUIDs generated via `gen_random_uuid()` in PostgreSQL, `uuid.v4()` in TypeScript
- License: AGPLv3
