# Task 12 Receipt — MCP release-proof adoption

Date: 2026-07-22
Task base: `00c53c9`
Closing commit: the commit that introduces this receipt (shared with Tasks
9–12).

## What was implemented

`@apet97/clockify-mcp-115`'s `prepublishOnly` now ends with the shared
exact-artifact engine in single-package mode:

```text
npm run type-check && npm test && npm run build && node ../scripts/pack-consumer-smoke.mjs --package=mcp
```

The exact command shape is pinned in `docs/package-contract.json` and
`docs/developer-environment-contract.json`. The mcp mode packs the wrapper
and MCP tarballs, import-smokes the packed `server`/`client` subpaths, and —
new with the shared engine — completes a real MCP stdio exchange against the
packed server binary.

## Closure command and observed output

```text
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm run prepublishOnly -w @apet97/clockify-mcp-115
```

Run 2026-07-22; type-check, the MCP test suite, and the clean build passed,
then the exact-artifact proof:

- **Tarball name:** `apet97-clockify-mcp-115-0.6.2.tgz` (wrapper dependency
  tarball: `clockify-sdk-ts-115-0.12.1.tgz`)
- **Tarball digest:**
  `sha512-RO3w73stvLLrNAm2WV37NODQSOIV0oJ6N7q/f2hN9nkF2rerLS//8TtDnfu7uU5SNYAXZFSJZgendTs9w9AA4Q==`
  (wrapper:
  `sha512-PcjPrwW5BJrjza4U+DEJjrHLHcvdkDQf+nIec0NfnD0h2PNKAU9VAmQzWhzu+B6uqhsVQWZDwSZFh+cgZZQ7KA==`)
- **Consumer installation:** `npm install <wrapper.tgz> <mcp.tgz>` into a
  fresh `clockify-mcp-consumer-*` temp project, then `node mcp-imports.mjs`
  (dynamic imports of `@apet97/clockify-mcp-115/server` and `/client`,
  asserting `buildServer` and `loadContext` are functions).
- **Stdio smoke command:** `node mcp-stdio.mjs`, which spawns
  `node node_modules/@apet97/clockify-mcp-115/dist/index.js` with blanked
  Clockify env vars and performs `initialize` →
  `notifications/initialized` → `tools/list` over stdio, asserting a
  non-empty tool list containing `clockify_projects_list`.
- **Stdio smoke output:** `mcp stdio smoke ok: 140 tools listed over stdio`

Final engine lines:

```text
exact-artifact wrapper (clockify-sdk-ts-115): clockify-sdk-ts-115-0.12.1.tgz sha512-PcjPrwW5BJrjza4U+DEJjrHLHcvdkDQf+nIec0NfnD0h2PNKAU9VAmQzWhzu+B6uqhsVQWZDwSZFh+cgZZQ7KA==
exact-artifact mcp (@apet97/clockify-mcp-115): apet97-clockify-mcp-115-0.6.2.tgz sha512-RO3w73stvLLrNAm2WV37NODQSOIV0oJ6N7q/f2hN9nkF2rerLS//8TtDnfu7uU5SNYAXZFSJZgendTs9w9AA4Q==
mcp stdio smoke ok: 140 tools listed over stdio
packed consumer smoke passed for mcp
```

## Sanitization statement

Closure ran with blanked Clockify credentials, and the stdio smoke explicitly
blanks `CLOCKIFY_API_KEY`/`CLOCKIFY_WORKSPACE_ID`/`CLOCKIFY_BASE_URL` for the
spawned server (exercising the graceful no-credential startup path). No
secrets appear in the output or this receipt. No publish was performed.

## Limitations

The digest changes only when packed bytes change — npm pack is deterministic
(see Task 9 receipt, Digest semantics). The stdio smoke
proves protocol startup, initialize handshake, and tool listing from the
packed artifact; per-tool behavior is covered by the MCP test suite that runs
earlier in the same closure command.

## Closure status

**Complete.** Exact closure command passed end-to-end; receipt tracked at the
exact roadmap path; no publish, tag, release, or local mutation execution
occurred.

Two independent reviewers approved the shared implementation range
`00c53c9d3cda62f1898312171b3835273e8ebc5e..29fed6b50e03a23b7e8166ae53bcf8ba13a760c4`
and rechecked the provenance correction through
`6634f3ddf811efdda24ee63ab7adf1446d14669f`. No blocking findings remain;
Task 12 is complete at 2/2 approvals.
