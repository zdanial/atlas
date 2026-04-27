# Butterfly — Auth, Security & Threat Model

Security architecture for an open-source tool that handles API keys, GitHub tokens, and codebase access.

---

## Authentication by Deployment Mode

| Mode | Auth Method | Implementation |
|------|------------|----------------|
| **A: Browser-only** | None (single user, local data) | No auth needed. API keys stored encrypted in IndexedDB. |
| **B: Local server** | Optional local auth (passphrase or PAT) | Axum middleware, session token in HttpOnly cookie. No mandatory auth for single-user self-host. |
| **C: Supabase cloud** | Supabase Auth (GitHub OAuth, email/password, magic link) | Supabase JWT, verified in Axum middleware. RLS enforces per-user isolation. |

### Mode C: Supabase Auth Flow

```
User → "Sign in with GitHub" → Supabase Auth → GitHub OAuth
                                     ↓
                              JWT issued (access + refresh)
                                     ↓
                     Frontend stores in cookie (HttpOnly, Secure, SameSite=Lax)
                                     ↓
                     Every API request → Axum extracts JWT → verifies with Supabase JWKS
                                     ↓
                     user_id extracted → used in all DB queries + RLS policies
```

```rust
// backend/src/middleware/auth.rs

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Response {
    // Mode A/B with auth disabled: pass through
    if !state.config.auth_required {
        return next.run(req).await;
    }

    // Extract JWT from cookie or Authorization header
    let token = extract_token(&req);
    match verify_jwt(&state.supabase_jwks, &token).await {
        Ok(claims) => {
            req.extensions_mut().insert(AuthUser {
                id: claims.sub,
                email: claims.email,
            });
            next.run(req).await
        }
        Err(_) => StatusCode::UNAUTHORIZED.into_response(),
    }
}
```

---

## API Key Security

### Storage

```
Mode A (browser):
  IndexedDB → encrypted with AES-256-GCM
  Key derived from user passphrase via PBKDF2 (100k iterations)
  Passphrase never stored — user enters on first load per session
  If no passphrase set: keys stored in plaintext (user's choice, warned)

Mode B/C (server):
  provider_config.api_key_enc → encrypted with AES-256-GCM
  Encryption key from BUTTERFLY_ENCRYPTION_KEY env var (generated on first run)
  Keys decrypted only in-memory when making LLM calls
  Never logged, never returned in API responses (only masked: sk-ant-••••)
  Never sent to frontend — frontend only sees { providerId, status, capabilities }
```

### Key Handling Rules

1. API keys **never** appear in logs, error messages, or API responses
2. API keys **never** transit the frontend in Modes B/C (browser-only mode is the exception — keys go direct from browser to LLM provider)
3. API keys are **rotatable** — update in settings, old key purged immediately
4. API key validation on save — make a test call (e.g., list models) before storing
5. `provider_config` table has `last_validated_at` column — stale keys get a warning badge

### Rate Limiting & Cost Controls

```rust
// backend/src/ai/limiter.rs

pub struct RateLimiter {
    // Per-provider rate limits
    limits: HashMap<String, RateLimit>,
    // Per-project daily cost cap (user-configurable)
    daily_cost_cap: f64,
    // Current spend tracking
    daily_spend: AtomicF64,
}

// Enforced before every LLM call:
// 1. Check per-provider rate limit (e.g., max 60 req/min for Anthropic)
// 2. Check daily cost cap (estimate cost from token count, reject if over cap)
// 3. Log actual cost after call completes (agent_run table)
```

Settings UI: "Daily AI spend limit: $[___]" with a usage chart showing spend per agent per day.

---

## GitHub Token Security

### Token Storage
- GitHub App installation tokens stored in `repo.install_id` (short-lived, refreshed via GitHub API)
- **Never** store user's personal GitHub password or long-lived PATs in the database
- Installation tokens are scoped to specific repos the user authorized
- Token refresh handled transparently in the `octocrab` client wrapper

### Webhook Verification
```rust
// backend/src/github/webhooks.rs

pub async fn verify_webhook(
    headers: &HeaderMap,
    body: &[u8],
    secret: &str,
) -> Result<()> {
    let signature = headers
        .get("X-Hub-Signature-256")
        .ok_or(anyhow!("missing signature"))?;
    let expected = hmac_sha256(secret, body);
    // Constant-time comparison to prevent timing attacks
    if !constant_time_eq(signature.as_bytes(), expected.as_bytes()) {
        return Err(anyhow!("invalid webhook signature"));
    }
    Ok(())
}
```

### Scoped Permissions
The GitHub App requests **minimum** permissions:
- **Read:** Repository contents, pull requests, branches, commits
- **Write:** Pull request comments (for Reviewer agent), branch creation (optional)
- **No access to:** Issues, Actions, Packages, Pages, Secrets, Environments

---

## Threat Model

### Attack Surface & Mitigations

| Threat | Surface | Mitigation |
|--------|---------|------------|
| **Stolen API keys** | DB compromise, log leak | Encrypted at rest (AES-256-GCM), never logged, never in API responses |
| **XSS → key exfil** | Frontend input fields | CSP headers, no inline scripts, sanitize all rendered content (TipTap handles its own sanitization) |
| **CSRF** | State-changing API calls | SameSite=Lax cookies, CSRF token for non-GET requests |
| **SQL injection** | API parameters | SQLx compile-time checked queries (impossible to inject) |
| **Prompt injection** | Canvas notes fed to agents | Agent prompts use structured input (JSON), not string interpolation. User content is always in a delimited field, never treated as instructions. |
| **Webhook spoofing** | GitHub webhook endpoint | HMAC-SHA256 signature verification on every webhook |
| **Session hijacking** | JWT tokens | HttpOnly + Secure + SameSite cookies, short expiry (1h), refresh tokens |
| **Malicious agent output** | Exported prompts lead to harmful code | Reviewer agent checks PR diff against ticket spec. Human still merges. No auto-merge in v1. |
| **Data leakage via agents** | LLM providers see user data | Documented clearly: "Your canvas notes are sent to your configured LLM provider." BYO keys = user's own data processing agreement. |
| **Event log information leak** | Timeline scrubber shows deleted content | Temporal queries respect auth — only authenticated project members see events. Soft-delete events can be hard-purged on request. |
| **Denial of service** | Expensive temporal queries | Query timeout (5s), max events per reconstruction (10k), snapshot frequency ensures bounded replay |

### OWASP Top 10 Checklist

- [x] **Injection** — SQLx compile-time checks, no raw SQL string building
- [x] **Broken Auth** — Supabase Auth (proven), JWT verification, session management
- [x] **Sensitive Data Exposure** — API keys encrypted, TLS everywhere, no keys in logs
- [x] **XXE** — No XML parsing anywhere in the stack
- [x] **Broken Access Control** — RLS policies scoped to workspace membership, auth middleware in Axum, project-level isolation
- [x] **Security Misconfiguration** — Secure defaults, CORS whitelist, CSP headers
- [x] **XSS** — CSP, sanitized rendering, no `{@html}` without sanitization
- [x] **Insecure Deserialization** — Typed deserialization via serde (Rust) and Zod (TS)
- [x] **Known Vulnerabilities** — `cargo audit` and `pnpm audit` in CI
- [x] **Insufficient Logging** — All auth events, all agent runs, all API key changes logged

---

## Security Headers (Axum Middleware)

```rust
// Applied to all responses
pub fn security_headers() -> SetResponseHeaderLayer {
    // Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
    // Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'
    // X-Content-Type-Options: nosniff
    // X-Frame-Options: DENY
    // Referrer-Policy: strict-origin-when-cross-origin
    // Permissions-Policy: camera=(), microphone=(), geolocation=()
}
```

---

## Audit Logging

Every security-relevant action is logged to the `event` table (same event sourcing system):

| Event Type | What's Logged |
|---|---|
| `auth.login` | User ID, method (GitHub OAuth / email), IP, timestamp |
| `auth.logout` | User ID, timestamp |
| `auth.failed` | Method, IP, timestamp (rate-limited after 5 failures) |
| `apikey.created` | Provider, user, timestamp (NOT the key itself) |
| `apikey.rotated` | Provider, user, timestamp |
| `apikey.deleted` | Provider, user, timestamp |
| `repo.connected` | Repo name, user, permissions granted |
| `repo.disconnected` | Repo name, user |
| `ticket.exported` | Export format, ticket IDs, user who triggered |
| `export.data` | What was exported, by whom |

Audit events are **never deleted** by retention cleanup. They live forever (or until the project is deleted).

---

## Data Retention & Cleanup

### Automatic Cleanup (Rust background tasks via `tokio::spawn`)

| Resource | Retention | Cleanup Action | Frequency |
|----------|-----------|---------------|-----------|
| `agent_run` | 90 days | Delete old runs, keep summary stats | Daily |
| `export_log` | 1 year | Archive old export records | Monthly |
| `snapshot` | Keep 1/day after 30 days, 1/week after 90 days | Thin out old snapshots | Weekly |
| `event` (non-audit) | 1 year | Archive to cold storage or delete | Monthly |
| `event` (audit) | Forever | Never deleted | — |
| `node_version` | 100 versions per node max | Delete oldest versions beyond limit | On new version |
| Orphaned files (Supabase Storage) | 7 days unlinked | Delete attachments with no node reference | Daily |
| Expired JWTs / sessions | Immediate | Supabase handles this | Automatic |

### Manual Cleanup
- "Purge deleted nodes" — hard-delete soft-deleted nodes and their events (user action)
- "Export & archive project" — full JSON export, then option to delete from DB
- "Clear AI history" — delete all agent_run records for a project

### Cleanup Implementation

```rust
// backend/src/tasks/cleanup.rs

pub async fn run_cleanup_tasks(pool: &DbPool) {
    // Run on a tokio interval (configurable, default: daily at 3am)
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(86400));
        loop {
            interval.tick().await;
            cleanup_agent_runs(pool, Duration::from_secs(90 * 86400)).await;
            archive_old_exports(pool, Duration::from_secs(365 * 86400)).await;
            thin_snapshots(pool).await;
            cleanup_orphaned_files(pool).await;
            log::info!("cleanup tasks completed");
        }
    });
}
```
