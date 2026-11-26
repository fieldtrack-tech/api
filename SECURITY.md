# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (`master` branch) | ✅ |
| Older tags | ❌ |

Only the current `master` branch receives security fixes.

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security issues privately by emailing:

> **fieldtrack-tech [at] gmail.com**

Include in your report:

1. A description of the vulnerability
2. The file(s) or component(s) affected
3. Steps to reproduce (if applicable)
4. Potential impact assessment
5. Any suggested fix (optional but appreciated)

You will receive an acknowledgement within **48 hours** and a resolution timeline within **7 days** for confirmed vulnerabilities.

---

## Known Security Decisions

### JWT Algorithm Enforcement (Production Hardening)

**Vulnerability:** CVE-2023-48223 (fast-jwt algorithm confusion)

**Context:**
- This project uses ES256 (ECDSA, asymmetric) JWTs issued by Supabase
- `@fastify/jwt` package has a transitive dependency on `fast-jwt@^6.0.2`, which is vulnerable
- However, **@fastify/jwt is ONLY used in tests** (moved to devDependencies)
- **Production code NEVER loads @fastify/jwt or fast-jwt**

**Mitigation:**
- **Production:** Uses `jsonwebtoken` + `jwks-rsa` for verification (completely separate library, not vulnerable)
- **Tests:** Uses `@fastify/jwt` (HS256, test-only, matches test secret in CI environment)
- **Enforcement:** `algorithms: ["ES256"]` is explicitly set in jwtVerifier.ts
- **Defense-in-depth:** Header algorithm is validated before signature verification (3 layers total)
- **Dependency boundary:** CI verifies `@fastify/jwt` is NOT in production bundle

**Risk statement:** this dependency boundary reduces one specific risk. It does
not establish that the current runtime dependency graph is vulnerability-free.

**Why this is safe:**
1. Asymmetric keys (JWKS endpoint): CVE-2023-48223 exploits symmetric key confusion, which cannot happen with asymmetric keys
2. Explicit algorithm restriction to ES256 prevents fallback to HS256
3. Token audience is validated (blocks service_role tokens)
4. Test environment is isolated; @fastify/jwt only used in test server
5. Production dependencies do NOT include @fastify/jwt or fast-jwt (verified by CI)
6. No fast-jwt code can execute in production (dependency not present)

**Monitoring:**
- CI checks: `npm ls @fastify/jwt --prod` (verifies not in production)
- Audit level: `--audit-level=critical` (only critical runtime vulnerabilities fail)
- Package.json: @fastify/jwt moved to devDependencies
- Waiting for upstream fast-jwt fix anyway

---

## Scope

### In scope

- Authentication and authorization bypasses
- Tenant isolation failures (cross-organization data access)
- JWT validation weaknesses
- SQL injection or data exfiltration via Supabase queries
- Rate limiting bypasses that could enable denial-of-service
- Sensitive data exposure (logs, error responses, API responses)
- Remote code execution vulnerabilities
- Dependency vulnerabilities with known CVEs affecting production functionality

### Out of scope

- Issues in the example/test environment configuration (`tests/setup/env-setup.ts` uses intentionally fake credentials)
- Vulnerabilities that require physical access to the VPS
- Issues in third-party services (Supabase, GitHub, GHCR)
- Theoretical vulnerabilities without a working proof of concept

---

## Security Design Notes

These design decisions are intentional and not vulnerabilities:

- `sequence_number` in `gps_locations` is **nullable by design** during mobile stabilization — ordering falls back to `recorded_at`
- `GET /debug/redis` is disabled when `APP_ENV=production`; do not infer this from
  `NODE_ENV` alone.
- JWT application claims are schema-validated on every request. Authorization
  uses top-level `role`, `org_id` and `employee_id`, not user-editable metadata.
  A still-valid token is not automatically revoked when an employee is disabled;
  the camera check-in RPC separately checks current employee activity.
- Rate-limit counters are stored in Redis with a **separate connection** from the job queue to prevent counter manipulation via queue exhaustion

---

## Dependency Security

Dependencies are managed via `npm ci` (deterministic installs from `package-lock.json`). To audit for known vulnerabilities:

```bash
cd api
npm audit
```

The PR and production workflows fail on high or critical runtime npm advisories.
Image vulnerability scanning remains a separate release check.

## Field attendance and data protection

The supported clients take camera selfies and add a visible GPS, accuracy and
timestamp footer plus GPS EXIF. The API decodes the JPEG under size and pixel
limits and matches the embedded coordinates to the submitted check-in. Selfies
use private storage, short-lived view URLs and one-use upload challenges.

Backend service-role access bypasses RLS. Review grants and authorization inside
each SQL RPC. The permission migration restricts backend-owned functions to the
service role and preserves the dedicated Supabase Auth hook. Webhook delivery pins
the validated outbound address. Fastify trusts the immediate nginx forwarding hop
in staging and production.

Detailed local audit findings must remain private; do not post exploitation
details, credentials or employee GPS/selfies to public issues or repository docs.

## Service-only RPC permission policy (FT-001)

`supabase/migrations/20261124000200_rpc_permissions_hardening.sql` is a forward,
permission-only repair for the known backend RPCs. It revokes inherited PUBLIC
and explicit anon/authenticated execution from every installed overload and
grants the backend `service_role`. Users call the authenticated API, not these
RPCs directly, even for their own organization. The JWT hook remains callable by
`supabase_auth_admin`, not by client/service roles. Existing unrelated utilities
and extension routines are deliberately not blanket-revoked.

Future defaults are hardened for the migration's executing DDL owner (normally
postgres). PostgreSQL's global PUBLIC function default must be revoked globally;
a per-schema REVOKE alone is insufficient. The repair also removes additive
public-schema client grants and explicitly grants service-role execution for new
public functions. Intentionally client-callable functions need reviewed explicit
grants and caller/tenant checks; new auth hooks must explicitly grant Auth admin
and exclude other roles. Review other DDL owners/manually granted roles separately.

Verification is in `tests/integration/rpc-permissions.test.ts` using dev-only
PGlite, without a live database or network. Applying/validating the repair in
staging/production still requires explicit authorization and grant review.
