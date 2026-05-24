# Security Policy

## Supported Versions

`clockify-sdk-ts` follows semantic versioning. Security fixes land
on the latest minor of the latest major; older majors receive
security fixes only when there's no migration path and the fix is
trivial.

| Version | Supported |
|---|---|
| `0.x` (pre-1.0) | ✅ — only the latest 0.x minor receives fixes |
| `≥ 1.0` | ✅ — fixes land on the latest minor of the latest major |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Use one of the private disclosure channels below:

1. **GitHub Security Advisories (preferred)** — open a private
   advisory at
   [github.com/apet97/clockify-ts-sdk/security/advisories/new](https://github.com/apet97/clockify-ts-sdk/security/advisories/new).
   This gives us a private channel to discuss the issue + draft a
   CVE if needed.
2. **Direct email** — `petkovic.aleksandar037@gmail.com` with
   subject prefix `[security] clockify-sdk-ts:`. PGP key
   fingerprint not yet published; ping if you need one.

### What to include

- The npm version(s) affected (`npm ls clockify-sdk-ts`).
- A minimal reproducer (TypeScript or JavaScript). Don't include
  real API keys or workspace IDs.
- The expected vs actual behavior.
- Severity assessment from your perspective.

### Response timeline

| Stage | Target |
|---|---|
| First acknowledgment | within **72 hours** of receipt |
| Triage + severity confirmation | within **7 days** |
| Fix shipped to npm (for critical) | within **14 days** |
| Fix shipped to npm (for high) | within **30 days** |
| CVE published (if applicable) | with the fix release |

Slower-cadence issues (moderate / low) move on the regular
release schedule but always get an acknowledgment + tracking
issue.

## Scope

In scope:
- The hand-written wrapper surface in `wrapper/`
  (`create-client.ts`, `composed-fetch.ts`, `iter.ts`,
  `webhooks.ts`, `pagination.ts`, `index.ts`).
- The publish pipeline (`.github/workflows/release.yml`).
- The dual ESM + CJS build chain (`tsconfig.{esm,cjs}.json`,
  `scripts/finalize-cjs.sh`, `scripts/verify-dual-build.sh`).
- Webhook signature verification (`webhooks.ts`).

Out of scope (report upstream):
- The synced Fern-generated SDK under `wrapper/src/**`. Any
  finding here belongs in the
  [Fern](https://github.com/fern-api/fern) tracker or in the
  spec-generator at
  [apet97/go-clockify](https://github.com/apet97/go-clockify).
- The Clockify API itself. Report to Clockify directly.
- Third-party dependencies. Dependabot tracks devDep updates;
  for runtime CVEs in a transitive, file a bug against the
  upstream library.

## Disclosure policy

We follow a coordinated-disclosure model. After a fix ships,
we'll publish:
- A GitHub Security Advisory referencing the CVE (if any).
- A `CHANGELOG.md` entry under the patched version.
- A credit line for the reporter (with permission).

We won't publish technical details before the fix has been
available on npm for at least 14 days, unless the vulnerability
is already public.
