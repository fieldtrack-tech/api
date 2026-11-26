## Summary

<!-- One or two sentences describing what this PR does and why. -->

---

## Type of Change

<!-- Check all that apply. -->

- [ ] `feat` — New feature
- [ ] `fix` — Bug fix
- [ ] `refactor` — Code change that is neither a fix nor a feature
- [ ] `ci` — CI/CD changes
- [ ] `infra` — Infrastructure / deployment changes
- [ ] `docs` — Documentation only
- [ ] `test` — Adding or updating tests
- [ ] `chore` — Dependency bumps, tooling, maintenance

---

## Context

<!-- What problem does this solve? Link any related issues or discussions. -->

<!-- Link an existing issue if appropriate. Keep private security findings and
     workspace-local audit records out of public PR descriptions. -->

---

## Changes

<!-- List the key changes made. Be specific enough that a reviewer can follow along. -->

- 
- 
- 
---

## Testing

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] Integration tests pass locally
- [ ] Manually tested the changed flows end-to-end
- [ ] No special deployment steps required
- [ ] Requires new environment variable: `___`
- [ ] Requires Supabase migration: `supabase/migrations/___`
- [ ] Requires manual action on VPS: `___`
- [ ] SQL/RPC changes tested against a disposable schema, including tenant grants
- [ ] Real BullMQ IDs/options checked if queue code changed (not only mocked `.add()`)
- [ ] Camera/GPS/background tracking checked on a physical device if applicable
- [ ] Coordinated client/API migration and rollback compatibility reviewed

---

## Final Checklist

- [ ] PR title follows conventional commit format (`type(scope): description`)
- [ ] Branch name follows convention (`feat/*`, `fix/*`, `docs/*`, etc.)
- [ ] No credentials, selfie data or raw tokens in logs/examples; limitations are documented
- [ ] No secrets or credentials committed
- [ ] Relevant documentation updated (if applicable)
- [ ] CHANGELOG updated (if applicable)

<!-- Template reviewed 2026-11-24. Test/build success is not evidence that a
     live migration, device flow, security scan or deployment was exercised. -->
