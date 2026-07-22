# Task 9 Receipt — Shared exact-artifact engine

Date: 2026-07-22
Task base: `00c53c9` (Task 8 closure)
Closing commit: the commit that introduces this receipt (one coherent commit
for Tasks 9–12: engine, three adoptions, contracts, changelogs, receipts).

## What was implemented

`scripts/pack-consumer-smoke.mjs` is now the shared exact-artifact engine used
by both the aggregate proof (`make pack-smoke`) and each package's
release-proof gate (Tasks 10–12):

- **Exact-artifact digests.** Every packed tarball's name and
  `sha512-<base64>` integrity digest (the same format npm records as
  `dist.integrity`) is printed as an `exact-artifact <id> (<npmName>):
  <filename> <digest>` line.
- **Single-package release-proof modes.** `--package=wrapper|cli|mcp` packs
  exactly the tarball set that package's consumer contract installs
  (wrapper → wrapper; cli → wrapper+cli; mcp → wrapper+mcp) and runs only that
  consumer. Unknown arguments and unknown package ids exit `2` fail-closed
  before any packing.
- **MCP stdio smoke.** The mcp consumer now starts the packed server binary
  (`node_modules/@apet97/clockify-mcp-115/dist/index.js`) over stdio with
  blank credentials and completes a real MCP `initialize` →
  `notifications/initialized` → `tools/list` JSON-RPC exchange, asserting a
  non-empty tool list containing `clockify_projects_list`, before killing the
  child. Previously the mcp consumer only import-smoked the subpaths.
- **Retainable artifacts.** `KEEP_CLOCKIFY_PACK_SMOKE_TEMP=1` now retains the
  packed tarballs as well as the temp consumer roots (previously tarballs were
  always deleted).
- **Fail-closed gate tests.** New `scripts/pack-consumer-smoke.test.mjs`
  (3 `node:test` cases: unknown-argument rejection, unknown-package-id
  rejection, script/contract mode agreement) now runs first in
  `make pack-smoke`.
- **Contract.** `docs/pack-consumer-smoke-contract.json` purpose updated and
  `requiredScriptMarkers` extended (digest, `--package=`, stdio-exchange, and
  fail-closed markers), so the engine's own self-check pins the new behavior.

## Package tarballs and consumer commands (from the closure run)

`make pack-smoke` (2026-07-22, blank credentials, at the delivered tree
state) printed:

```text
exact-artifact wrapper (clockify-sdk-ts-115): clockify-sdk-ts-115-0.12.1.tgz sha512-PcjPrwW5BJrjza4U+DEJjrHLHcvdkDQf+nIec0NfnD0h2PNKAU9VAmQzWhzu+B6uqhsVQWZDwSZFh+cgZZQ7KA==
exact-artifact cli (@apet97/clockify-cli-115): apet97-clockify-cli-115-0.3.1.tgz sha512-9RGOnH38TiQmgwRvi3nBdu7yi0gXwWOFEBAJol/DffmOE1Ozz+ES913gVuBLLiPuiB1VhwfgIj5mdBRe9m5SXA==
exact-artifact mcp (@apet97/clockify-mcp-115): apet97-clockify-mcp-115-0.6.2.tgz sha512-RO3w73stvLLrNAm2WV37NODQSOIV0oJ6N7q/f2hN9nkF2rerLS//8TtDnfu7uU5SNYAXZFSJZgendTs9w9AA4Q==
0.3.1
mcp stdio smoke ok: 140 tools listed over stdio
packed consumer smoke passed for SDK, CLI, and MCP
```

(An earlier `make pack-smoke` run during development printed different cli
and mcp digests because the Tasks 10–12 `prepublishOnly` manifest edits —
which are packed into each tarball's `package.json` — landed between the
runs; see Digest semantics below.)

Consumer commands run by the engine, per package:

- **sdk consumer** (installs `clockify-sdk-ts-115-0.12.1.tgz`):
  `npm install <wrapper.tgz>`; `node sdk-esm.mjs` (imports root, `/iter`,
  `/webhooks`; asserts `createClockifyClient`, `iterAll`,
  `verifyClockifyWebhook`); `node sdk-cjs.cjs` (requires root, `/errors`;
  asserts `createClockifyClient`, `promoteApiError`).
- **cli consumer** (installs wrapper + `apet97-clockify-cli-115-0.3.1.tgz`):
  `node node_modules/@apet97/clockify-cli-115/dist/index.js --version` →
  printed `0.3.1`.
- **mcp consumer** (installs wrapper + `apet97-clockify-mcp-115-0.6.2.tgz`):
  `node mcp-imports.mjs` (dynamic imports of
  `@apet97/clockify-mcp-115/server` + `/client`; asserts `buildServer`,
  `loadContext`); `node mcp-stdio.mjs` (stdio `initialize` → `tools/list`) →
  printed `mcp stdio smoke ok: 140 tools listed over stdio`.

The fail-closed gate tests passed first (`3 pass, 0 fail`).

## Digest semantics

The sha512 digest identifies the exact tarball bytes produced and proven in a
given run, and `npm pack` is byte-deterministic: tar entry mtimes are
normalized, so packing unchanged content — even after a full rebuild —
reproduces the identical digest. This determinism is the property the release
workflows' `dist.integrity` comparison depends on. A digest changes only when
packed bytes change; the packed `package.json` is part of the tarball, so the
Tasks 10–12 `prepublishOnly` script edits changed the cli and mcp digests
relative to an earlier development run. Independent review verified
determinism empirically (touch + re-pack and full rebuild + re-pack both
reproduce the digest, and packing with the pre-edit manifest reproduces the
earlier digest exactly). Receipts always quote the digest printed by their
own closure run; the block above is from the delivered tree state and matches
the Task 10–12 receipts.

## Sanitization statement

No credentials or tokens appear in the engine, contract, tests, or this
receipt; the closure ran with `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID=''`
in the environment and the stdio smoke explicitly blanks all Clockify env
vars for the spawned server.

## Limitations

- The engine proves local pack/install/import/bin/stdio behavior; it does not
  talk to npm or verify a published artifact (that comparison lives in the
  release workflows via `dist.integrity`).
- Digests change only when packed bytes change (npm pack is deterministic;
  see Digest semantics above).

## Closure status

**Complete.** `make pack-smoke` passed with the output quoted above; receipt
tracked at the exact roadmap path; no publish, tag, release, or local
mutation execution occurred.

Two independent reviewers approved the implementation range
`00c53c9d3cda62f1898312171b3835273e8ebc5e..29fed6b50e03a23b7e8166ae53bcf8ba13a760c4`
and rechecked the provenance correction through
`6634f3ddf811efdda24ee63ab7adf1446d14669f`. No blocking findings remain;
Task 9 is complete at 2/2 approvals.
