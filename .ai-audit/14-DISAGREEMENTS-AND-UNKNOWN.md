# 14 — DISAGREEMENTS AND UNKNOWN

Unresolved questions, conflicting evidence, uncertain intent, and
specification ambiguity. Each item is labeled with what would resolve it.

## Conflicting evidence (in-repo contradictions)

1. **Webhook wire model (W-03)** — flat `event`-union (typed, documented,
   tested in `webhook-events.test.ts`) vs envelope
   `{webhookEvent, payloadType, payload}` (fixtures, tested in
   `webhook-fixtures.test.ts`). Inner conflict: `owner` object vs
   `ownerId` string. Both suites green. Resolution: live probe of a real
   Clockify webhook delivery. The ledger has an open entry
   (`webhook.signature-scheme.shared-secret-not-hmac-doc-only`) — the whole
   webhook delivery contract is doc-only evidence.

2. **Live-success authority (S-02/S-10)** — three numbers: spec stamps 161/168,
   campaign manifest 134/168, ledger prose "156/168". The manifest schema
   claims to "replace" stamp-derived counts; nothing reconciles the 27-op
   delta. Resolution: read GOCLMCP `findings/*.md` promotion rows for the 27
   ops; decide whether the manifest or the stamps are the headline authority.

3. **Provenance lock (S-01)** — lock + manifest attest GOCLMCP `1dc0392`
   (sha `aa59a076…`); shipped bytes are `abebc826…` from `ea7eb23`+`d15ce1e`.
   All currentness gates pass. Either the lock must be re-approved at the new
   commit, or the gates must compare against shipped bytes, or the snapshot
   must be rolled back to the locked bytes. The ledger itself requires the
   H01-LOCK procedure for spec changes — it was not run.

4. **Resource counts (W-02/W-11)** — README 29, docs 30, generated client 30,
   scoped client 29. The `balanceAssignment` scoping omission is either
   oversight or intent; no record exists.

5. **ADR 0006 addenda (D-04)** — "162 tools" after +2, then "147", then "162"
   after −1: arithmetically impossible within the sequence; mcp-backlog has
   the consistent story (144→146→147→153→162).

6. **CLI exit-code class for `--region` (C-3)** — README says 1 = validation;
   the `--output` precedent says bad flag values are exit 2. Both claims
   documented; the code does one thing, the docs describe two conventions.

7. **`AGENTS.md` vs CI (slice C contradiction 1)** — AGENTS.md calls
   `perfect-fast` "the CI-enforced readiness/docs-drift suite"; CI never runs
   `perfect-fast` (it runs a hand-decomposed subset).

## Uncertain intent

8. **`balanceAssignment` in `Workspace` (W-02)** — deliberate exclusion or
   oversight? CLI/MCP bypass the scoped client, so no internal consumer
   depends on it. Check git history for a mention before deciding.

9. **`page-size > 200` (W-08)** — server clamp vs 400 error; one live call
   (`tags.list({page-size: 500})`) resolves.

10. **`registry-smoke` soft-fail (WF-3)** — receipt-based design documented in
    `docs/ci-policy.md` markers; whether the policy documents the *swallow*
    is unverified.

11. **SBOM optionality (WF-4)** — deliberate `continue-on-error`; whether
    "prove and release" requires SBOM is a policy question.

12. **Mutation governance scope** — 14 behavior-heavy SDK modules and ~50 MCP
    tool modules are outside Stryker scope; AGENTS.md treats the
    source/floor mapping as deliberate. Whether the excluded modules should
    gain floors is a maintained-choice question (GitHub-only measurement).

## Specification ambiguity

13. **`x-clockify-security-aliases` (S-03)** — the annotation disagrees with
    the scheme definition AND the official spec. The live header name for
    addon-token auth is unprobed; the ledger's Fern-era entry covers only
    exclusivity semantics.

14. **`x-clockify-mcp-tools` (S-09)** — present on all 168 ops, empty on all.
    Populate or drop.

15. **`createApprrovalRequest_1` (S-08)** — upstream typo + `_1` suffix;
    benign because the SDK method is curated (`submitWithType`).

16. **`TimeEntriesTimeEntry.userId` optional (MCP unknown 3)** —
    `clockify_status` running-timer detection silently reports "no running
    timer" if the live wire omits `userId` on the in-progress entry. Needs a
    live two-user workspace to resolve.

17. **`approvals_submit_with_type` (MCP unknown 9)** — request *type* goes in
    the `approvalRequestId` path slot; matches the generated client, live
    behavior unverified.

18. **Expenses `date` wire format (CLI unknown)** — CLI promotes bare dates
    to `YYYY-MM-DDT00:00:00Z`; the API field may be date-only. Live probe
    required.

## Execution-gated unknowns

19. **`mcp-v1.0.1` tag absence** — README says 1.0.1 and links a 0.8.0
    bundle; the clone has `mcp-v1.0.0` but no `mcp-v1.0.1` tag. `git fetch
    --tags` or `git ls-remote --tags origin` resolves.

20. **Current gate health** — whether `make contract-gates`,
    `make docs-counts`, `make check-live-evidence-currentness`, and the
    networked `make openapi-source-lock` pass on this tree was NOT run
    (parallel-audit policy). S-01 may already red nothing — the gates are
    structurally blind to it (verified by reading the checker).

21. **`make operation-parity` regeneration** — would the 64 null stamps
    change if regenerated? Requires running the generator.

22. **`npm run test:types`** (typecheck.only incl. `breaking-changes.test-d.ts`)
    — not run in this audit; no finding depends on it.

23. **Synced TS file count** (~687 per generator-comparison.md) — needs
    `npm run sync` to recount.

24. **`z.never().optional()` JSON-schema output** for `clockify_review_week`
    — unverified against the MCP SDK (cosmetic).

## Cross-slice notes

25. **WF- prefix mapping** — the slice-C workflow findings were written as
    `W-1…W-4` in `slice-c-cli-gates.md`; the ledger renames them `WF-1…WF-4`
    to avoid collision with the wrapper `W-01…W-14` family. All other IDs
    are stable across raw reports and ledger.
