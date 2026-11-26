# Contributing to FieldTrack API

---

## Setup

**Prerequisites:** Node.js ≥ 24, npm, Redis

```bash
git clone https://github.com/fieldtrack-tech/api.git
cd api

npm install
cp .env.example .env
# Edit .env — fill in Supabase URL, keys, Redis URL, CORS_ORIGIN
```

---

## Branch Naming

| Purpose | Pattern | Example |
|---------|---------|---------|
| New feature | `feature/<description>` | `feature/expense-attachments` |
| Bug fix | `fix/<description>` | `fix/session-double-close` |
| Documentation | `docs/<description>` | `docs/update-api-reference` |
| Tests | `test/<description>` | `test/analytics-edge-cases` |
| Chores / deps | `chore/<description>` | `chore/bump-fastify-5` |

All PRs target `master`. `master` is protected — CI must pass before merge.

Documentation source audit: 2026-11-24. Branch protection is an operator setting;
the repository's workflow files alone do not establish its live configuration.

---

## Commit Format

```
type(scope): short imperative description
```

**Allowed types:**

| Type | When to use |
|------|-------------|
| `feat` | New user-facing functionality |
| `fix` | Bug fix |
| `refactor` | Internal code change — no behaviour change |
| `ci` | CI/CD workflow changes |
| `infra` | Infrastructure, Docker, nginx, monitoring |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `chore` | Dependency bumps, tooling, housekeeping |

**Scope** should be the module or layer affected (e.g. `auth`, `expenses`, `analytics`, `deploy`, `worker`, `rls`).

**Examples:**

```
feat(expenses): add bulk-approve endpoint for admins
fix(auth): handle missing organization_id claim in JWT
refactor(analytics): replace read-then-upsert with atomic RPC calls
ci(deploy): add image validation before push
infra(nginx): block /docs and /openapi.json in production
docs(deployment): document blue-green rollback procedure
test(attendance): cover double-checkout edge case
chore(deps): bump @fastify/jwt to 9.1.0
```

---

## Development Workflow

### Making Changes

1. Branch off `master`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following the existing code conventions (TypeScript strict mode, ESM imports, Fastify patterns).

3. Run the test suite and type-checker before committing:
   ```bash
   npm run typecheck
   npm test
   ```

4. Commit with a conventional commit message (see format above).

5. Push your branch and open a pull request against `master`.

---

## Code Conventions

### Module Pattern

Most domain modules use the following layers. Compact modules such as field
operations register handlers directly in the route file; follow the neighboring
code rather than inventing empty controller/service layers.

```
src/modules/<domain>/
├── <domain>.schema.ts      — Zod schemas and TypeScript types
├── <domain>.repository.ts  — Supabase queries, always scoped by organization_id
├── <domain>.service.ts     — Business logic, throws domain errors
├── <domain>.controller.ts  — HTTP parsing, calls service, sends response via handleError
└── <domain>.routes.ts      — Route registration, middleware, rate-limit config
```

### Key Rules

- **Never skip tenant scoping.** Use `orgTable` for reads/updates/deletes; explicitly
  set organization on inserts and pass trusted tenant context to RPCs. Audit
  function grants and SQL tenant checks as well as HTTP middleware.
- **All errors must flow through `handleError()`.** Do not call `reply.status().send()` directly in service or repository code.
- **Domain errors belong in `src/utils/errors.ts`.** Use specific error classes (`NotFoundError`, `ForbiddenError`, etc.) rather than generic ones.
- **Use `TenantContext`** when writing service-layer code that runs outside an HTTP request (e.g. workers).
- **All new endpoints need a rate limit.** Check existing routes for examples of per-user (JWT `sub`) rate limiting.

### Testing

- Unit tests go in `tests/unit/`
- Integration tests go in `tests/integration/`
- Use `vi.mock()` at the top of integration test files to mock repository dependencies
- Use `crypto.randomUUID()` or the valid RFC-4122 fixtures exported by
  `tests/setup/test-server.ts`. The old `tests/helpers/uuid.ts` path no longer exists.
- Keep default tests independent of live Supabase. Add isolated SQL tests when
  behavior lives in a function/trigger; mocked repositories do not validate DDL,
  PostgREST argument names, grants or real BullMQ job-option acceptance.
- `tests/integration/rpc-permissions.test.ts` uses pinned dev-only PGlite and the
  checked-in SQL function/repair definitions to verify FT-001 without mocks of
  PostgreSQL permission behavior. Run it with
  `npm test -- tests/integration/rpc-permissions.test.ts`.

---

## Pull Request Process

1. Ensure `npx tsc --noEmit` exits `0`
2. Ensure `npm test` passes (552 at audit baseline; 562 after the FT-001 permission fix)
3. Write tests for new behaviour — PRs without tests for new endpoints will not be merged
4. Update [docs/API_REFERENCE.md](docs/API_REFERENCE.md) if you add or change any endpoint
5. Update [CHANGELOG.md](CHANGELOG.md) with a short entry under the appropriate section

Also run `npm run lint`. For camera, field-visit or payout changes, review
`docs/FIELD_OPERATIONS.md`, the API/client contracts and the SQL verification
script. Validate migrations in a disposable/staging database: never run a linked
database reset as a routine development or deployment command. The current
migration directory contains a destructive rollback artifact and duplicate version.
Do not assume a green mocked test run certifies financial or production behavior.

---

## Reporting Issues

Use GitHub Issues. Include:

- Node.js version (`node --version`)
- What you expected to happen
- What actually happened
- Minimal reproduction steps

For security vulnerabilities, see [SECURITY.md](SECURITY.md) instead.
