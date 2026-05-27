# Security Policy

## Supported Versions

The public packages in this repo are `clockify-sdk-ts-115`,
`@clockify115/cli`, and `@clockify115/mcp-server`. Security fixes
land on the latest minor of the latest major; older majors receive
security fixes only when there's no migration path and the fix is
trivial.

| Version | Supported |
|---|---|
| `0.x` (pre-1.0) | Supported for the latest 0.x minor only |
| `>= 1.0` | Supported on the latest minor of the latest major |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Use one of the private disclosure channels below:

1. **GitHub Security Advisories (preferred)** — open a private
   advisory at
   [github.com/apet97/clockify-ts-sdk/security/advisories/new](https://github.com/apet97/clockify-ts-sdk/security/advisories/new).
   This gives us a private channel to discuss the issue + draft a
   CVE if needed.
2. **Direct email** — `petkovic.aleksandar037@gmail.com` with
   subject prefix `[security] clockify-sdk-ts-115:`. PGP key
   fingerprint not yet published; ping if you need one.

### What to include

- The package and version affected, for example
  `clockify-sdk-ts-115@0.9.0`, `@clockify115/cli@0.1.0`, or
  `@clockify115/mcp-server@0.3.0`.
- A minimal reproducer (TypeScript or JavaScript). Don't include
  real API keys or workspace IDs.
- The expected vs actual behavior.
- Severity assessment from your perspective.

### Response timeline

| Stage | Target |
|---|---|
| First acknowledgment | within **72 hours** of receipt |
| Triage + severity confirmation | within **7 days** |
| Fix shipped or patched (for critical) | within **14 days** |
| Fix shipped or patched (for high) | within **30 days** |
| CVE published (if applicable) | with the fix release |

Slower-cadence issues (moderate / low) move on the regular
release schedule but always get an acknowledgment and private
tracking. npm publication is not the default path for this repo;
if packages are not published, the fix ships as a tagged commit,
tarball, or maintainer-approved release artifact.

## Scope

In scope:
- The hand-written SDK wrapper surface in `wrapper/`
  (`create-client.ts`, `composed-fetch.ts`, `iter.ts`,
  `webhooks.ts`, `pagination.ts`, `index.ts`).
- The CLI surface in `cli/`, including JSON output and exit codes.
- The MCP surface in `mcp/`, including tool envelopes, output
  schemas, resources, prompts, and confirmation flow.
- The publish pipeline (`.github/workflows/release.yml`) if a
  maintainer explicitly chooses to publish.
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
