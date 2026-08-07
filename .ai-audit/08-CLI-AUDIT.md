# 08 — CLI AUDIT

Slice C findings (C-*). CLI-relevant gate/workflow items (G-1, G-2, G-4,
W-1…W-4) are summarized here and detailed in `10-TEST-AND-GATE-MATRIX.md` /
`12-BLOAT-AND-SIMPLIFICATION.md` as appropriate. Severity/confidence and
full evidence in `13-FINDINGS-LEDGER.csv`.

## Command coverage

- 22 top-level groups; 66 documented commands (64 leaves + help + version);
  leaf risk 29 read / 25 write / 10 destructive — all mutually consistent
  and pinned by tests/contracts (verified).
- No per-operation mapping exists between CLI commands and the 168 OpenAPI
  operations (`docs/cli-commands.json` is command-level; G-4). The
  `clk115 api <method> <path>` raw command (`cli/src/commands/api.ts`) is
  the universal fallback and routes through the SDK client (auth, retries,
  timeouts applied).

## Argument and option mapping

- C-2 (verified by execution): `parseIntArg`/`parseFloatArg`
  (`cli/src/commands/helpers.ts:23-28,38-44`) accept trailing garbage:
  `--limit 1abc` → `1` (exit 0; sent to the wire). Tests cover only `abc`,
  `0`, negative. Remediation: full-string regex before parse.
- C-3 (verified by execution): `--region bogus` exits 1 (runtime error at
  client build) while `--output xml` exits 2 (parse-time
  `InvalidArgumentError`); client-less commands (`completion`, `--version`,
  `help`) silently ignore invalid `--region`/`--subdomain` (exit 0).
  Remediation: parse-time validators mirroring `parseOutputMode`.
- C-5 (verified): `cli/src/commands/webhooks.ts:169-172` passes the list
  `type` filter via an untyped `requestOptions` query seam with a stale
  comment ("generated request body does not own the filter"); the generated
  `ListWebhooksRequest.type` exists (`wrapper/src/api/resources/webhooks/
  client/requests/ListWebhooksRequest.ts:7-8`). The typed path works.
- Page-size clamps are documented and implemented per command (200 default
  clamp; expenses 10,000; audit-log 50; reports detailed 1,000).

## Validation, help text, output, exit codes

- Exit-code contract 0/1/2 enforced by `cli/tests/exit-contract.test.ts`;
  README table documents 1 = validation, 2 = commander argument error. The
  `--region` exit-1 outcome is arguably documented but inconsistent with the
  `--output` precedent (C-3).
- C-7 (verified): `printSuccess` (`cli/src/output.ts:66-74`) has no
  production callers; README's "success-only commands emit
  `{ok:true,message}`" describes output nothing emits (receipts carry
  `ok/action/entity/ids/…`).
- C-6 (verified): `cli/tests/sandbox.test.ts:469-472` audit-log shape
  assertion `json === null || Array.isArray(json) || typeof json ===
  "object"` is vacuously true for any parsed JSON.

## Configuration and authentication

- Precedence flags > env > rc verified and gated (`check-config-precedence
  .mjs`); rc `apiKey` rejected as legacy secret; `CLOCKIFY_HOME` honored.
- `--subdomain` requires `--region` (verified: exit 1 with a clear message).

## Scripting behavior

- C-4 (verified): `cli/examples/daily-timesheet.sh` is broken — calls
  nonexistent `clk115 review` and nonexistent `entries list --date`
  (entries list exposes `--from/--to`). No gate covers `cli/examples/*.sh`
  (`docs/examples-contract.json` names only `wrapper/examples/*`;
  `check-examples-matrix.mjs` checks the matrix doc only; created in
  `6cba7d9` and never touched). The other 5 scripts are plausible but also
  never executed; `mock-run.sh`'s port is hardcoded to the mock server's
  dynamic port.
- `--select` on missing path → `null` (deliberate, tested); scripts cannot
  distinguish empty from missing.
- `projects update --name ""` silently drops the name (deliberate per
  comment; no feedback).

## Divergence from SDK/OpenAPI contracts

- The only typed-seam violation found is C-5 (webhooks list `type`).
- CLI region lists are pinned to the SDK's `ClockifyRegion` union
  (`cli/tests/client.test.ts:149-166`), and routing validation delegates to
  the SDK — consistent.
- G-1 (verified): `docs/cli-contract.json` `globalFlags` lists 7 of the 9
  implemented flags — `--region`/`--subdomain` (added 1.0.1) are absent, so
  `check-cli-contract.mjs:214-216` cannot detect their removal; the
  exit-code evidence is a substring search for `toBe(2)` anywhere in the
  test file (`:218-220`).

## Workflow findings (summarized)

- W-1 (verified): `.github/workflows/docs.yml` tag trigger `v*.*.*` matches
  no tag the repo ever creates (only `wrapper-v*`/`cli-v*`/`mcp-v*`);
  docs deploy on main push only.
- W-2 (verified): `performance-budgets`, `governance-audit`, `verify.mjs`
  plans are executed by no CI workflow (only crons: CodeQL +
  sandbox-key-health).
- W-3 (verified): all 3 release workflows swallow `registry-smoke.mjs`
  failures (`if … then status passed else status failed; fi` — step always
  exits 0); failure lands only in the receipt.
- W-4 (verified): `release.yml` SBOM step `continue-on-error: true`;
  a release can complete without an SBOM.

## Verified sound (checked, no finding)

- Leaf risk classification + introspection gate
  (`check-cli-write-safety.mjs` vs built commander tree).
- Receipt-shaped write output; zero-cast request construction
  (consumer-cast-budget).
- `completions`, `doctor` (offline routing validation), config precedence,
  tag hygiene.
- The 40-file test suite genuinely asserts wire shapes, exit codes, and
  receipt envelopes (C-1 gap excepted).
