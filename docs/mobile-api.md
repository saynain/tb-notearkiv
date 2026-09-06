# Native iPhone API v1

The SwiftUI app in the independent `tb-ios` repository uses the existing Worker,
Better Auth sessions, D1 database and gated R2 file routes. No schema migration,
new Worker, secret or binding is required. The browser's routes and cookie-based
login remain compatible.

## Feature boundary

Name: native member API. Purpose: support the iPhone member experience. Primary
user: an active member. Primary action: sign in and use existing member features.
Navigation: none added to the website. Permission: active membership plus each
existing operation's authorization. Namespace: `/api/mobile/v1/*` (server routes).

## Authentication

Use the existing `/api/auth/email-otp/send-verification-otp` and
`/api/auth/sign-in/email-otp` endpoints, or `/api/auth/sign-in/email` for password
login. The existing invitation checks, OTP hashing, attempt limits and auth rate
limits apply. No mobile-specific account creation route exists.

Better Auth's built-in bearer plugin requires a **signed** token. After successful
login, read `set-auth-token` and store its value in iOS Keychain, scoped to the
backend origin. Send `Authorization: Bearer <value>` on API/file requests. Never
log tokens, put them in URLs, or embed a backend secret in the app.

The native API rejects requests containing cookies and requires explicit bearer
authentication. Cross-origin browser requests are rejected; no CORS access is
granted. The web app's existing CSRF middleware is unchanged. JSON bodies are
bounded to 96 KB and validated, including rejection of extra privileged fields.

`POST /api/auth/sign-out` with the bearer header revokes the session. The app then
deletes the Keychain item and its in-memory member data. Inactive members are
denied by the existing `currentUser()` guard on every request. Missing, invalid,
expired and revoked sessions receive a JSON 401 on the native API.

## Endpoints

| Method | Path below `/api/mobile/v1/` | Behavior |
| --- | --- | --- |
| GET | `snapshot` | v1 member profile, calendar availability, upcoming events and own attendance, published visible posts, next project and permitted part/score PDF metadata |
| PUT | `events/{occurrenceKey}/attendance` | `{status: "attending" | "not_attending" | "unsure" | null}`; existing event identity, own member only |
| POST | `posts` | `{body}` creates an ordinary plain-text draft; returns `{id}` |
| POST | `posts/{id}/publish` | `{}` publishes the caller's draft using existing checks; no bulk announcement email |
| GET | `posts/{id}` | readable post and comments, with mentions resolved and markdown converted to plain text |
| POST | `posts/{id}/like` | `{}` toggles the caller's reaction; returns `{mine, count}`; do not retry automatically |
| POST | `posts/{id}/comments` | `{body}` adds a comment with existing visibility and mention validation |

Dates in this API are milliseconds since Unix epoch; event IDs are stable
`occurrenceKey` values, never titles or mutable start-time IDs. `version: 1` is
included in the snapshot. Preserve this contract for installed app versions;
breaking changes belong in a new API namespace.

Post creation and publishing are separate so the native composer can retry
publication using the same draft ID without creating another post. Existing
mention notifications still follow the server's normal rules.

Returned file/image paths use `/api/files/{id}` and `/api/post-images/{id}`.
These existing routes repeat authorization before streaming private R2 content.
The app never gets an R2 bucket URL or Cloudflare credentials. Audio and archive
browsing are not yet exposed in the native UI.

JSON responses use `Cache-Control: private, no-store`. Error bodies have
`{error: {code, message}}`; internal database errors and stack traces are omitted.
Calls to existing server operations happen inside a server-only route adapter,
not via deployment-specific RPC URLs exposed to Swift.

## Local verification

Use an isolated worktree and local database. Copy `.dev.vars.example`, set
`BETTER_AUTH_URL=http://localhost:3088`, and use a local development secret.

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler d1 migrations apply tb-notearkiv --local
PORT=3088 pnpm dev
```

The dev-login route seeds fixtures. For full PDF coverage, after the first local
dev login, move the published **local synthetic** projects into the future:

```sh
pnpm exec wrangler d1 execute tb-notearkiv --local \
  --command "UPDATE projects SET event_date='2099-12-01' WHERE is_published=1"
node scripts/mobile-api-smoke.mjs
```

The smoke script is hardcoded to localhost. It tests signed/invalid/revoked
sessions, cookie/origin guards, hidden board posts, allowed/forbidden PDFs,
attendance round trips, drafts, publication, reactions and comments. It writes
synthetic posts/comments only in the local fixture database.

Also run `pnpm exec tsc --noEmit`, `pnpm test`, and `pnpm run build`. Deployment
continues through the existing staging and production GitHub Actions workflows.
