# 15 — VERIFICATION QUEUE

Ordered for a single stronger model. Phase 1 = static re-verification
(cheap). Phase 2 = local execution (no network, no credentials). Phase 3 =
network. Phase 4 = live Clockify (sandbox only, credentials required).
Each item names the finding(s) it verifies or falsifies.

## Phase 1 — static re-verification (read-only; ~30 min)

1. Re-read `wrapper/ensure.ts:40-80` and `scoped-client.ts:170-215`; confirm
   the W-01 keying analysis and the Workspace key construction. (W-01)
2. Re-read `mcp/src/tools/workflows/time-tracking.ts:120-185`; confirm the
   envelope vs `data` read and that `:169` is dead. (M-01)
3. Re-check the two webhook model files and all 4 fixtures; decide which
   model the live probe must target. (W-03)
4. `grep -rn "balanceAssignment" wrapper/scoped-client.ts wrapper/tests/
   cli/src mcp/src` — confirm the scoped-client gap and that CLI/MCP bypass
   it. (W-02)
5. `git log --oneline --all -- wrapper/scoped-client.ts | head` + search
   CHANGELOG for "balanceAssignment" — intent check. (W-02, unknown 8)
6. `python3` re-run of the S-01 shasum + lock/manifest comparison; then read
   `scripts/check-live-evidence-manifest.mjs:270-295` to confirm the
   manifest↔lock-only comparison. (S-01)
7. Re-run the manifest-vs-spec status Counter probe. (S-02)
8. `grep -rn "135/163\|92 names\|124 domain\|0.15.1\|1.0.0" docs AGENTS.md
   CLAUDE.md` — sweep for every stale-string instance of the D-* family.
9. `grep -rn "printSuccess" cli/` and `grep -rn "EXPECTED_ROOT_SURFACE_COUNT"
   wrapper/` — re-confirm C-7/W-10 after any change.
10. `git ls-remote --tags origin | grep -E "mcp-v|^v"` — resolves the
    `mcp-v1.0.1` tag question and the WF-1 dead-trigger question. (M-02,
    unknown 19)

## Phase 2 — local execution (no network; solo machine)

11. `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast`
    (solo, creds blanked, machine idle) — establishes the current gate
    health baseline; expect performance-budgets flake risk noted in
    AGENTS.md §4. (baseline)
12. `npm run test:types` in wrapper — the typecheck.only suite incl.
    `breaking-changes.test-d.ts`. (unknown 22)
13. `node scripts/check-docs-counts.mjs` — confirm D-02's stale string
    survives (exit 0); then, in a scratch copy of the contract, add
    `"135/163"` to `forbiddenStrings` and confirm it reds (proves the
    mechanism, not the coverage). (D-02, D-12)
14. `make cli-write-safety` — observe the console "behaviorally proved"
    count vs the 30-case suite. (C-1)
15. `bash -n cli/examples/*.sh` — syntax check; then run the mock server
    (`make mock-clockify`) and try `mock-run.sh`. (C-4)
16. `make operation-parity` — regenerate and diff; confirm the 64 null
    stamps are stable and see whether `overrideReason` appears. (M-06, G-4)
17. `make sdk-codegen-drift && make sdk-codegen-test && make generator-comparison`
    — the generated-tree reproducibility chain. (baseline)
18. `npm run build -w <pkg>` + `npm pack --dry-run` ×3 — confirm
    `.packsnapshot` matches and W-09's dead modules are still packed.
19. `make mutation-ci` — offline wiring check only (never run Stryker
    locally; GitHub-only). (baseline)
20. `make contract-gates` and `make governance-audit` — establish whether
    S-01/S-02 red anything today. (S-01, S-02, WF-2)
21. Bundle the wrapper root barrel for a browser target (esbuild) — confirm
    the `process`/`node:*` failure. (W-04)
22. `node scripts/plan.mjs release-decision` — check the plan module against
    D-05's stale posture claims.

## Phase 3 — network (no credentials)

23. `make openapi-source-lock` — the networked verifier; confirm it passes
    despite S-01 (lock self-consistency). (S-01)
24. `make official-openapi-fetch` — live official OpenAPI comparison
    (fails closed). (baseline)
25. `npm audit` (part of perfect-fast) — dependency health. (baseline)

## Phase 4 — live Clockify (sandbox only; credentials required)

26. Webhook delivery probe: create a webhook on the sandbox, trigger an
    event, capture the raw delivery — resolves envelope vs flat, inner field
    names, `owner` vs `ownerId`, header names (X-Addon-Token vs
    X-Addon-Key vs x-addon-token). (W-03, S-03)
27. `tags.list({page-size: 500})` — server clamp vs 400. (W-08)
28. `clockify_demo_seed` with `date: "2027-05-01"` then default
    `clockify_demo_cleanup` — confirm the entry survives. (M-04)
29. `clockify_status` with another user's timer running — confirm
    `userId` presence and the running-timer null path. (MCP unknown 3)
30. `expenses create --date 2026-08-01` — wire format acceptance. (CLI
    unknown)
31. `expenses_categories_delete` on an already-archived category. (MCP
    unknown 4)
32. `approvals_submit_with_type` round trip. (MCP unknown 9)
33. `make perfect-live` — the full credentialed proof (wrapper+cli+mcp+
    GOCLMCP) with cleanup receipts; and the 168-op evidence campaign only
    per the governed launcher (`make live-evidence-campaign`), never
    self-approved. (baseline; S-02 family)

## Ordered by risk

The audit's highest-value verifications are 6 (S-01), 7 (S-02), 3 (W-03),
1 (W-01), 26 (live webhook), 11 (gate baseline), and 14 (C-1). Items 1-10
need no execution and can be done while reading.
