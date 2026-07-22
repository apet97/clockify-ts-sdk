# Task 10 Receipt — Wrapper release-proof adoption

Date: 2026-07-22
Task base: `00c53c9`
Closing commit: the commit that introduces this receipt (shared with Tasks
9–12).

## What was implemented

`clockify-sdk-ts-115`'s `prepublishOnly` now ends with the shared
exact-artifact engine in single-package mode:

```text
npm run sync && npm run type-check && npm test && npm run clean && npm run build && npm run build:smoke && node ../scripts/pack-consumer-smoke.mjs --package=wrapper
```

The exact command shape is pinned in `docs/package-contract.json` and
`docs/developer-environment-contract.json` (both updated in lockstep), so a
drifted or removed release proof fails `make package-contract` /
`make developer-environment`.

## Closure command and observed output

```text
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm run prepublishOnly -w clockify-sdk-ts-115
```

Run 2026-07-22; every stage passed: sync (codegen re-sync), type-check, the
wrapper test suite (52 files passed / 1 skipped, 769 tests passed / 7
skipped), clean, dual ESM/CJS build, dual-build smoke (92 curated + 34
generated-core = 126 exact root names on both ESM and CJS; all 28 CJS
subpaths resolve), breaking-change type gates, and the exact-artifact proof:

- **Tarball name:** `clockify-sdk-ts-115-0.12.1.tgz`
- **Tarball digest:**
  `sha512-PcjPrwW5BJrjza4U+DEJjrHLHcvdkDQf+nIec0NfnD0h2PNKAU9VAmQzWhzu+B6uqhsVQWZDwSZFh+cgZZQ7KA==`
- **Consumer-install command:** `npm install <tmp>/clockify-sdk-ts-115-0.12.1.tgz`
  into a fresh `clockify-sdk-consumer-*` temp project, then
  `node sdk-esm.mjs` and `node sdk-cjs.cjs`.
- **Consumer-install output:** both import smokes exited 0 (ESM root +
  `/iter` + `/webhooks` expose `createClockifyClient`/`iterAll`/
  `verifyClockifyWebhook`; CJS root + `/errors` expose
  `createClockifyClient`/`promoteApiError`); final engine lines:

```text
exact-artifact wrapper (clockify-sdk-ts-115): clockify-sdk-ts-115-0.12.1.tgz sha512-PcjPrwW5BJrjza4U+DEJjrHLHcvdkDQf+nIec0NfnD0h2PNKAU9VAmQzWhzu+B6uqhsVQWZDwSZFh+cgZZQ7KA==
packed consumer smoke passed for wrapper
```

Digest determinism at this tree state was verified by re-running
`node scripts/pack-consumer-smoke.mjs --package=wrapper` without a rebuild:
the identical digest was reproduced.

## Sanitization statement

Closure ran with blanked Clockify credentials; no secrets appear in the
output or this receipt. This proof performs no publish — `prepublishOnly`
ran standalone via `npm run`, not as part of any `npm publish`.

## Limitations

The digest identifies the exact packed bytes; npm pack is deterministic, so
the digest changes only when packed content (including `package.json`)
changes (see Task 9 receipt, Digest semantics).

## Closure status

**Complete.** Exact closure command passed end-to-end; receipt tracked at the
exact roadmap path; no publish, tag, release, or local mutation execution
occurred.

Two independent reviewers approved the shared implementation range
`00c53c9d3cda62f1898312171b3835273e8ebc5e..29fed6b50e03a23b7e8166ae53bcf8ba13a760c4`
and rechecked the provenance correction through
`6634f3ddf811efdda24ee63ab7adf1446d14669f`. No blocking findings remain;
Task 10 is complete at 2/2 approvals.
