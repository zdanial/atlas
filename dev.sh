#!/usr/bin/env bash
set -euo pipefail

# Atlas dev environment launcher
# Usage: ./dev.sh [frontend|backend|full|db]

ROOT="$(cd "$(dirname "$0")" && pwd)"

start_db() {
  echo "▸ Starting PostgreSQL on :6432..."
  docker compose -f "$ROOT/docker-compose.yml" up -d postgres
  echo "  Waiting for healthy..."
  until docker compose -f "$ROOT/docker-compose.yml" exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
    sleep 1
  done
  echo "  ✓ PostgreSQL ready"
}

start_frontend() {
  echo "▸ Starting frontend dev server on http://localhost:5173..."
  cd "$ROOT/frontend"
  [ -d node_modules ] || pnpm install
  exec pnpm dev
}

start_backend() {
  start_db
  echo "▸ Starting backend on http://localhost:3001 (with cargo-watch)..."
  cd "$ROOT/backend"
  export DATABASE_URL="postgres://postgres:postgres@localhost:6432/atlas"
  export RUST_LOG="${RUST_LOG:-info}"

  if command -v cargo-watch >/dev/null 2>&1; then
    exec cargo watch -x run -w src -w migrations
  else
    echo "  cargo-watch not found, installing..."
    cargo install cargo-watch
    exec cargo watch -x run -w src -w migrations
  fi
}

start_full() {
  start_db

  echo "▸ Starting backend (background)..."
  cd "$ROOT/backend"
  export DATABASE_URL="postgres://postgres:postgres@localhost:6432/atlas"
  export RUST_LOG="${RUST_LOG:-info}"

  if ! command -v cargo-watch >/dev/null 2>&1; then
    echo "  Installing cargo-watch..."
    cargo install cargo-watch
  fi
  cargo watch -x run -w src -w migrations &
  BACKEND_PID=$!

  echo "▸ Starting frontend..."
  cd "$ROOT/frontend"
  [ -d node_modules ] || pnpm install
  pnpm dev &
  FRONTEND_PID=$!

  trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
  echo ""
  echo "════════════════════════════════════════"
  echo "  Frontend:  http://localhost:5173"
  echo "  Backend:   http://localhost:3001"
  echo "  Postgres:  localhost:6432"
  echo "  Press Ctrl+C to stop all"
  echo "════════════════════════════════════════"
  wait
}

case "${1:-frontend}" in
  frontend) start_frontend ;;
  backend)  start_backend ;;
  full)     start_full ;;
  db)       start_db ;;
  *)
    echo "Usage: ./dev.sh [frontend|backend|full|db]"
    echo ""
    echo "  frontend  — SvelteKit dev server only (default, no DB needed)"
    echo "  backend   — Postgres + Rust backend with cargo-watch"
    echo "  full      — All three: Postgres + backend + frontend"
    echo "  db        — Just start PostgreSQL"
    exit 1
    ;;
esac
