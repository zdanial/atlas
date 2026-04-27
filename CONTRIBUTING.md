# Contributing to Butterfly

Thanks for your interest in contributing to Butterfly! This guide will help you get started.

## Development Setup

### Prerequisites

- **Rust** (stable, latest) — [rustup.rs](https://rustup.rs)
- **Node.js** 22+ and **pnpm** 10+
- **PostgreSQL** 16+ (or Docker)

### Backend (Rust + Axum)

```bash
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL

# Start PostgreSQL (if using Docker)
docker run -d --name butterfly-pg -p 5432:5432 \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=butterfly \
  postgres:16

# Run the server (runs migrations automatically)
cargo run

# Run tests
cargo test

# Check formatting and lints
cargo fmt --check
cargo clippy -- -D warnings
```

### Frontend (SvelteKit)

```bash
cd frontend
pnpm install
pnpm dev        # Start dev server on :5173
pnpm test       # Run vitest
pnpm check      # Type check with svelte-check
pnpm lint       # ESLint
pnpm build      # Production build
```

## Architecture

- **`frontend/`** — SvelteKit 2 + Svelte 5 (runes) + TypeScript strict + Tailwind v4
- **`backend/`** — Rust + Axum + SQLx with PostgreSQL
- **`backend/migrations/`** — SQL migrations (run automatically on server start)

### Storage Adapter Pattern

The frontend uses a `StorageAdapter` interface (`frontend/src/lib/storage/adapter.ts`) that abstracts data access. In browser-only mode (Mode A), it uses IndexedDB via Dexie.js. In server modes (B/C), it calls the Rust API.

## Pull Request Process

1. Fork the repo and create a branch from `main`
2. Make your changes with tests
3. Ensure CI passes: `cargo fmt --check`, `cargo clippy`, `cargo test`, `pnpm lint`, `pnpm check`, `pnpm test`
4. Open a PR with a clear description of what and why

## Code Style

- **Rust**: Follow `rustfmt` defaults. Use `clippy` with `-D warnings`.
- **TypeScript**: Follow the existing ESLint config. Use strict mode.
- **Commits**: Short, descriptive messages. Focus on the "why."

## License

By contributing, you agree that your contributions will be licensed under the AGPLv3.
