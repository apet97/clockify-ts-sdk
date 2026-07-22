# Task 8 Receipt — Authenticated-host equality

Date: 2026-07-22
Task base: `2b130318e8215b684805192a710672c85b314297`
Closing commit: the commit that introduces this receipt (single commit with the
implementation, tests, contract, and status updates).

## What was implemented

Authenticated-host equality is now an enforced, fail-closed invariant instead
of a coincidence of duplicated literals. The set of hosts trusted to receive
Clockify auth headers (`X-Api-Key` / `X-Addon-Token`) is proven equal across
every authenticated configuration and request path:

- the hand-written constructor/fetch-boundary allowlist
  (`CLOCKIFY_PROD_HOSTS` + `LOOPBACK_HOSTS` in
  `wrapper/internal/authenticated-boundary-fetch.ts`, now exported as
  `ReadonlySet`s from the package-private module),
- the generated request-time allowlist (`CLOCKIFY_API_HOSTS` +
  `LOOPBACK_HOSTS` in `wrapper/src/core/request.ts`),
- the emitter template that produces it
  (`scripts/sdk-codegen/emitter.mjs`),
- every emitted per-operation `baseUrl` host under `wrapper/src/api/**`
  (today `reports.api.clockify.me` and `auditlog-api.api.clockify.me`), and
- the prose host list in `docs/config-precedence-policy.md`.

`wrapper/tests/authenticated-host-equality.test.ts` (6 tests) proves:

1. **Set equality** — the generated and emitter-template host/loopback set
   literals equal the hand-written sets; a missing or empty literal fails the
   test rather than passing vacuously.
2. **Per-operation subset** — every emitted per-operation `baseUrl` host is a
   member of the shared allowlist and classifies `allowed`/`prod`; the scan
   fails closed if it finds no per-operation URLs or fewer than two distinct
   hosts.
3. **Boundary equality (accept)** — each per-operation base URL is accepted by
   both the constructor validator (`validateClockifyBaseUrl`) and the final
   authenticated fetch boundary (`authenticatedBoundaryFetch`).
4. **Boundary equality (reject)** — near-miss hosts
   (`auditlog.api.clockify.me` typo, `api.clockify.me.attacker.example`
   suffix trick, `evil.example`) are rejected by classification, the
   constructor validator, and the fetch boundary alike, with no underlying
   dispatch.
5. **Prose equality (two cases)** — both `docs/config-precedence-policy.md`
   and the `createClockifyClient` factory TSDoc in `wrapper/create-client.ts`
   name every allowlisted host, and every backticked `*.clockify.me` host they
   name is in the allowlist, so documentation cannot promise a host the
   runtime rejects. (The TSDoc case was added after independent review flagged
   it as an unpinned sixth prose copy.)

The static gate now anchors the invariant: `docs/config-precedence-policy.md`
gained an "Authenticated-host equality" section, and
`docs/config-precedence-contract.json` gained the policy markers, a fourth
surface (`authenticated-host-equality` over
`wrapper/internal/authenticated-boundary-fetch.ts`), and a supporting-evidence
entry pinning the test file's key test names — so `make config-precedence`
fails if the section, the module markers, or the test disappear.

## Files changed

- `wrapper/internal/authenticated-boundary-fetch.ts` — export the allowlist
  sets; document the equality invariant.
- `wrapper/tests/authenticated-host-equality.test.ts` — new (5 tests).
- `docs/config-precedence-policy.md` — new "Authenticated-host equality"
  section.
- `docs/config-precedence-contract.json` — policy markers + new surface +
  supporting evidence.
- `wrapper/CHANGELOG.md` — Unreleased "Added" entry.
- `docs/roadmap-1.0.md`, `docs/roadmap-1.0-status.json` — Task 8 status.
- `docs/roadmap-1.0-receipts/task-08-authenticated-host.md` — this receipt.

## Exact closure commands and results

```text
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm test -w clockify-sdk-ts-115
make config-precedence
```

Observed results (2026-07-22, working tree at task base plus the Task 8
changes above):

- Wrapper suite: **52 files passed, 1 skipped; 769 tests passed, 7 skipped**
  (previously 763 passing; the 6 new tests are the equality suite; skips are
  the credential-gated live sandbox suites, blanked by design).
- `make config-precedence`: **Configuration precedence contract passed
  (4 surfaces checked)** (previously 3 surfaces).

Supporting gates run with the same tree, all green:

```text
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm run type-check -w clockify-sdk-ts-115
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm run lint -w clockify-sdk-ts-115
make changelog-drift docs-quality docs-index-drift enterprise-audit
```

(`enterprise hardening audit passed (91 requirements)`; changelog coverage
current; docs index current; documentation quality contract passed.)

## Behavior notes (no runtime behavior changed)

The three allowlist copies were byte-identical before this task; every
per-operation host was already allowlisted; explicit `baseUrl`/`environment`
overrides already win over per-operation hosts
(`suppliedBaseUrl ?? suppliedEnvironment ?? operationBaseUrl ?? Default`) and
that behavior is unchanged. This task converts the equality from an unenforced
coincidence into a tested invariant plus a static contract anchor. The only
source change outside tests/docs is exporting two previously module-local
`const` sets from a package-private module (not a public subpath; the public
API surface is unchanged and `make sdk-public-api` is unaffected).

## Sanitization statement

No credentials, tokens, workspace ids, or customer data appear in the test,
contract, policy, or this receipt. All closure commands ran with
`CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID=''`; no network calls were made.

## Limitations

- The equality proof reads committed generated sources
  (`wrapper/src/core/request.ts`, `wrapper/src/api/**`). On a fresh clone the
  wrapper suite requires `make sdk-codegen` first (existing repo-wide
  precondition, unchanged by this task).
- The policy-equality test pins backtick-quoted `*.clockify.me` host mentions;
  hosts named in prose without backticks would not be scanned (none exist
  today).

## Independent review

An independent reviewer (no prior assumption of correctness) verified all ten
checklist areas — roadmap compliance, test adequacy, generated-source
ownership, hard stops, public API, contract shape, receipt truthfulness,
closure re-run, mutation hygiene, and status consistency — and adversarially
proved the fail-closed behavior with four hand-mutations (generated-set
divergence, per-op host repoint, bogus policy host, renamed generated
literal), each caught by the test before the mutation was reverted. Verdict:
APPROVE. The one actionable observation (the factory TSDoc host list was an
unpinned prose copy) was fixed by extending the prose-equality test to two
cases before closure.

## Pending approvals / unresolved blockers

None for this task. The two open readiness blockers
(`cross-package-release-proof-asymmetry`, `remote-mutation-proof-pending`)
are owned by Tasks 9–13 and 14–18 and are intentionally untouched here.

## Closure status

**Complete.** Exact closure command passed; receipt tracked at the exact
roadmap path; no tag, publish, release, main-branch integration, or local
mutation execution occurred.
