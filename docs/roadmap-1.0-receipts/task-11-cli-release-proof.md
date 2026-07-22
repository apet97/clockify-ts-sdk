# Task 11 Receipt — CLI release-proof adoption

Date: 2026-07-22
Task base: `00c53c9`
Closing commit: the commit that introduces this receipt (shared with Tasks
9–12).

## What was implemented

`@apet97/clockify-cli-115`'s `prepublishOnly` now ends with the shared
exact-artifact engine in single-package mode:

```text
npm run type-check && npm test && npm run build && node ../scripts/pack-consumer-smoke.mjs --package=cli
```

The exact command shape is pinned in `docs/package-contract.json` and
`docs/developer-environment-contract.json`. The cli mode packs the wrapper
and CLI tarballs (the CLI consumer installs both, matching its consumer
contract) and runs the installed binary from the packed layout.

## Closure command and observed output

```text
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm run prepublishOnly -w @apet97/clockify-cli-115
```

Run 2026-07-22; type-check, the CLI test suite, and the build passed, then
the exact-artifact proof:

- **Tarball name:** `apet97-clockify-cli-115-0.3.1.tgz` (wrapper dependency
  tarball: `clockify-sdk-ts-115-0.12.1.tgz`)
- **Tarball digest:**
  `sha512-9RGOnH38TiQmgwRvi3nBdu7yi0gXwWOFEBAJol/DffmOE1Ozz+ES913gVuBLLiPuiB1VhwfgIj5mdBRe9m5SXA==`
  (wrapper:
  `sha512-PcjPrwW5BJrjza4U+DEJjrHLHcvdkDQf+nIec0NfnD0h2PNKAU9VAmQzWhzu+B6uqhsVQWZDwSZFh+cgZZQ7KA==`)
- **Consumer installation:** `npm install <wrapper.tgz> <cli.tgz>` into a
  fresh `clockify-cli-consumer-*` temp project.
- **Binary smoke command:**
  `node node_modules/@apet97/clockify-cli-115/dist/index.js --version`
- **Binary smoke output:** `0.3.1`

Final engine lines:

```text
exact-artifact wrapper (clockify-sdk-ts-115): clockify-sdk-ts-115-0.12.1.tgz sha512-PcjPrwW5BJrjza4U+DEJjrHLHcvdkDQf+nIec0NfnD0h2PNKAU9VAmQzWhzu+B6uqhsVQWZDwSZFh+cgZZQ7KA==
exact-artifact cli (@apet97/clockify-cli-115): apet97-clockify-cli-115-0.3.1.tgz sha512-9RGOnH38TiQmgwRvi3nBdu7yi0gXwWOFEBAJol/DffmOE1Ozz+ES913gVuBLLiPuiB1VhwfgIj5mdBRe9m5SXA==
0.3.1
packed consumer smoke passed for cli
```

## Sanitization statement

Closure ran with blanked Clockify credentials; no secrets appear in the
output or this receipt. No publish was performed.

## Limitations

The digest changes only when packed bytes change — npm pack is deterministic
(see Task 9 receipt, Digest semantics). The binary smoke proves the packed
bin entry executes and reports its version; deeper command behavior is
covered by the CLI test suite that runs earlier in the same closure command.

## Closure status

**Complete.** Exact closure command passed end-to-end; receipt tracked at the
exact roadmap path; no publish, tag, release, or local mutation execution
occurred.

Two independent reviewers approved the shared implementation range
`00c53c9d3cda62f1898312171b3835273e8ebc5e..29fed6b50e03a23b7e8166ae53bcf8ba13a760c4`
and rechecked the provenance correction through
`6634f3ddf811efdda24ee63ab7adf1446d14669f`. No blocking findings remain;
Task 11 is complete at 2/2 approvals.
