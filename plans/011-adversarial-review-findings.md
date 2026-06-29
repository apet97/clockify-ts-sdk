# Adversarial Repo Review — Implementation Plan

`clockify-ts-sdk` — proven, actionable findings for a non-thinking implementer

> Generated 2026-06-29 by a 31-finder / opus-max-refuter adversarial workflow (159 agents, 11.8M tokens).
> Every task below survived an independent opus `effort:max` refutation pass (read-only live-API probe allowed).
> Each finding the verifier could not prove was dropped; 32 candidate findings were refuted as false positives (Appendix B).

## How to use this plan

1. Do the tasks **in order** (HIGH first). Each task is self-contained: exact file, exact before/after, the test to add, and the verify command.
2. Do **not** edit generated files: `wrapper/src/**`, `output/ts-sdk/**`, `spec/corrected/**`. Generator bugs are fixed in `scripts/sdk-codegen/**`, then re-run `make sdk-codegen`.
3. Run gates **solo** with blank creds: `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast` (it is load-flaky; run nothing else concurrently).
4. After each fix, run the task's `Verify` command before moving on. Commit per task.

## Summary

| Severity | Count |
|---|---|
| HIGH | 3 |
| MEDIUM | 12 |
| LOW | 32 |
| **Total confirmed** | **47** |

### Consolidation note (same-file clusters — review together, may be one edit)

- wrapper/errors.ts — 402 classification
- wrapper/errors.ts — parseRateLimitResetAt Retry-After:0
- scripts/check-mcp-write-safety.mjs — destructiveHint trust
- scripts/sdk-codegen/schema.mjs — union handling
- scripts/sdk-codegen/emitter.mjs — dead requestRuntimeSource
- wrapper/webhook-url.ts — SSRF residual bypasses
- mcp/src/tools/workflows/demo.ts — cleanup
- wrapper/otel-hooks.ts — semconv

## Task index

1. **[HIGH]** `mcp/src/tools/workflows/time-tracking.ts` — clockify_fix_entry: preserve all existing fields on PUT-replace instead of wiping end/project/task/tags/billable/description
2. **[HIGH]** `.github/workflows/ci.yml` — Restore committed .packsnapshot baselines from git before each CI pack-snapshot verification (make sdk-codegen overwrites them in write mode, defeating the drift guard)
3. **[HIGH]** `scripts/sdk-codegen/schema.mjs` — Parenthesize array-of-union item types in the SDK generator so `(A | B)[]` no longer ships as the mis-parsed `A | B[]`
4. **[MEDIUM]** `docs/error-codes.json` — Make plan-gated 402 errors classify as feature_unavailable across the SDK classifier (and therefore the MCP surface)
5. **[MEDIUM]** `wrapper/scoped-client.ts` — Make scoped ensureTag/ensureProject/ensureClient walk every page before matching, so they stop creating duplicates of entities past the first page
6. **[MEDIUM]** `cli/src/commands/expenses.ts` — expenses list --start/--end are silent no-ops: apply them as a client-side date-range filter
7. **[MEDIUM]** `cli/src/commands/status.ts` — Fix `clk115 status` so a running timer's `elapsed` reflects wall-clock instead of always "0s"
8. **[MEDIUM]** `scripts/check-mcp-write-safety.mjs` — Add a name-based delete/remove completeness backstop to the MCP write-safety gate so an under-declared delete tool cannot ship false-green
9. **[MEDIUM]** `mcp/src/tools/workflows/review.ts` — Review tools (clockify_review_day / clockify_review_week) advertise gap/overlap detection and accept min_gap_minutes/workday_start/workday_end, but summarizeEntries computes none of it — remove the inert fields and the false capability claims so the contract matches behavior
10. **[MEDIUM]** `mcp/src/tools/workflows/demo.ts` — Gate clockify_demo_cleanup behind the shared dry_run -> confirm_token guard and restrict it to the reserved DEMO-/sdk-demo- prefix
11. **[MEDIUM]** `mcp/src/tools/timeOff.ts` — Fix clockify_time_off_policies_archive to send the required {status} wire field instead of {archived}
12. **[MEDIUM]** `scripts/check-release-readiness.mjs` — Replace whole-file substring wiring check with per-target-line scan in check-release-readiness.mjs
13. **[MEDIUM]** `scripts/check-mcp-write-safety.mjs` — Close the missing-annotation blind spot in the MCP write-safety gate: a delete/remove-named tool that forgets destructiveHint:true silently escapes the unguarded-delete enforcement
14. **[MEDIUM]** `scripts/check-no-generated-edits.mjs` — Make the generated-edit guard actually detect hand-edits to the two gitignored trees (wrapper/src, output/ts-sdk)
15. **[MEDIUM]** `mcp/src/result.ts` — MCP envelope classifies a real 402 ClockifyApiError as catch-all "error" instead of feature_unavailable
16. **[LOW]** `wrapper/composed-fetch.ts` — composedFetch: stop firing onRetry + retry.count for cancelled/timed-out (AbortError) requests
17. **[LOW]** `wrapper/errors.ts` — Fix parseRateLimitResetAt returning a year-2000 Date for Retry-After: 0
18. **[LOW]** `wrapper/iter.ts` — Terminate iterPages on an empty page when Last-Page: false (close the unbounded-loop hole; the default maxPages is Infinity)
19. **[LOW]** `wrapper/webhook-url.ts` — Block RFC 2765 IPv4-translated IPv6 prefix (::ffff:0:0:0/96) in the webhook SSRF guard
20. **[LOW]** `wrapper/webhooks.ts` — Fail closed when an empty configured webhook token matches an empty Clockify-Signature-Token header
21. **[LOW]** `wrapper/otel-hooks.ts` — Rename reserved OTel metric name used as a span attribute in otel-hooks.ts to a namespaced, unit-explicit key
22. **[LOW]** `wrapper/otel-hooks.ts` — otel-hooks: only emit http.request.resend_count on retried attempts (OTel semconv)
23. **[LOW]** `cli/src/output.ts` — Fix --select missing-path emitting literal `undefined` (invalid JSON) in printJson/printNdjson
24. **[LOW]** `scripts/generate-error-docs.mjs` — Classify the "workspace ID not set" CLI setup error as auth_or_permission (fix in the error-docs generator, regenerate the three emitted modules)
25. **[LOW]** `cli/src/commands/projects.ts` — Fix inverted --archived flag help on projects/clients/tags list commands
26. **[LOW]** `cli/src/commands/log.ts` — Canonicalize `log --end` to full RFC3339 before the wire (eliminate start-canonical/end-raw asymmetry)
27. **[LOW]** `cli/src/commands/sharedReports.ts` — Sync shared-reports --type allowlist (CLI + MCP) to the 19-member generated wire union
28. **[LOW]** `mcp/src/client.ts` — Normalize blank/whitespace CLOCKIFY_BASE_URL to unset in loadContext so the MCP server falls back to the default Clockify host instead of crashing at startup
29. **[LOW]** `mcp/src/tools/workflows/demo.ts` — demoCleanup task delete must mark the task DONE before deleting (active-task DELETE 400s), so cleanup stops emitting spurious cleanup_failed warnings and the receipt count is correct
30. **[LOW]** `mcp/src/tools/audit.ts` — Clamp clockify_audit_log_search pageSize to the audit-log host's documented max of 50 (was 200)
31. **[LOW]** `scripts/sdk-codegen/emitter.mjs` — Delete dead, divergent requestRuntimeSource() template from the SDK emitter
32. **[LOW]** `.github/workflows/ci-cli-release.yml` — Gate npm publish on event_name == 'push' in addition to ref_type == 'tag' in both CLI and MCP release workflows
33. **[LOW]** `.github/workflows/release.yml` — SHA-pin first-party GitHub Actions in the three token-bearing npm release workflows
34. **[LOW]** `.github/workflows/codeql.yml` — Broaden CodeQL `paths` allowlist to cover the hand-written security-critical surface (wrapper root, cli/src, mcp/src)
35. **[LOW]** `scripts/check-data-handling.mjs` — Replace the global-substring data-handling wiring check with a per-aggregate-target check in check-data-handling.mjs
36. **[LOW]** `scripts/generate-product-surface.mjs` — Make product-surface --check warn loudly (instead of passing silently) when ../GOCLMCP/docs/tool-catalog.json is absent and the goMcp counts are echoed from the file being checked
37. **[LOW]** `scripts/check-changelog-entry.mjs` — Make changelog-drift diff committed changes against the base ref so it enforces in CI (currently vacuously green on a clean tree)
38. **[LOW]** `scripts/check-support-bundle.mjs` — Scope the perfect-fast/perfect-full aggregate-wiring self-checks to the recipe lines (14 CI self-check scripts)
39. **[LOW]** `scripts/check-version-consistency.mjs` — Harden check-version-consistency.mjs so it cannot silently skip the release-please manifest comparison when manifestKeyForReleasePlease is not a configured package id
40. **[LOW]** `scripts/check-mock-clockify-contract.mjs` — Make the mock Clockify route contract gate boot-and-probe each route instead of loose substring matching
41. **[LOW]** `scripts/check-mutation-ci-workflow.mjs` — Make the "perfect-full must not run local mutation" guard tokenize prerequisites instead of using a space-delimited substring
42. **[LOW]** `wrapper/webhook-url.ts` — Normalize all trailing dots before host classification so loopback/metadata IPv4 literals with 2+ trailing dots cannot bypass the webhook SSRF guard
43. **[LOW]** `scripts/check-mcp-write-safety.mjs` — Add a name-keyed destructive-tool scan to the MCP write-safety gate so a _delete/_remove tool that forgets destructiveHint:true cannot pass green
44. **[LOW]** `wrapper/errors.ts` — Fix parseRateLimitResetAt turning `Retry-After: 0` into a year-2000 reset Date
45. **[LOW]** `wrapper/paginated-list.ts` — Short-circuit non-positive limit in PaginatedList.toArray so { limit: 0 } returns [] with zero fetches
46. **[LOW]** `scripts/sdk-codegen/schema.mjs` — Make codegen `unionTypes` bracket-depth aware so structured union members with internal unions are not corrupted
47. **[LOW]** `scripts/sdk-codegen/emitter.mjs` — Delete orphaned requestRuntimeSource() emitter in scripts/sdk-codegen/emitter.mjs

---

## Task 1 — [HIGH] clockify_fix_entry: preserve all existing fields on PUT-replace instead of wiping end/project/task/tags/billable/description

- **Severity:** HIGH  •  **Category:** correctness / data-loss  •  **Task id:** `mcp-wf-1`
- **Files:** `mcp/src/tools/workflows/time-tracking.ts`, `mcp/tests/workflows.test.ts`

### Problem

`fixEntry` in mcp/src/tools/workflows/time-tracking.ts builds the time-entry update body preserving ONLY `start` from the already-fetched entry; every other field (`end`, `projectId`, `taskId`, `tagIds`, `billable`, `description`) is set solely when the CALLER supplies it. `timeEntries.update` is a PUT-replace (output/ts-sdk/.../timeEntries/client/Client.ts method "PUT"; generated UpdateTimeEntriesRequest documents `end?` as "Omit to start a running timer" and marks `start` as the only required field). So `clockify_fix_entry({entry_id, new_description})` on a FINISHED entry omits `end` and converts it into a running timer, and drops projectId/taskId/tagIds/billable. The tool advertises partial-patch semantics ("update selected fields"). Tests miss this because the fake `timeEntries.update` does `Object.assign(entry, body.body ?? body)` (a MERGE) — the opposite of the real replace-PUT wire — so dropped fields silently survive.

### Proof (independent opus-max verifier)

```
Independently traced. fixEntry (time-tracking.ts:189-227) builds the update body preserving ONLY start: `start: str(args.start) || str(entry.start) || str(entry.timeInterval?.start)`. Every other field is set only when the caller supplies it: `if (str(args.end)) body.end=...; if (projectId) body.projectId=...; if (taskId) body.taskId=...; if (tagIds.length) body.tagIds=...; if (args.billable!==undefined) body.billable=...; if (nextDescription) body.description=...`. Crucially, `end` is read solely from `str(args.end)` and does NOT fall back to `entry.timeInterval?.end`, even though `start` falls back to `entry.timeInterval?.start`. The fetched entry (findEntryForFix -> timeEntries.get) carries all fields, so preservation is trivially available but unused.\n\ntimeEntries.update is a PUT-replace: output/ts-sdk/.../timeEntries/client/Client.ts:71 `method: \"PUT\"`, body via `bodyFromRequest(request, [billable,customFields,description,end,projectId,start,tagIds,taskId,type])` — no fetch/merge. The generated UpdateTimeEntriesRequest.ts:13 documents `end?` as `/** Omit to start a running timer */` and marks `start` as the only required field — a GOCLMCP live-override comment (API-truth). So calling clockify_fix_entry({entry_id, new_description}) on a FINISHED entry omits `end` and converts it into a running timer; per the same replace-PUT class (discrepancies.md documents invoices/holidays/time-off-policies PUTs as replace, each compensated via GET-then-PUT), projectId/taskId/tagIds/billable/description are likewise dropped on omit.\n\nTests do not catch this: the fake timeEntries.update (mcp/tests/workflows.test.ts:152) does `Object.assign(entry, body.body ?? body)` — a MERGE that preserves unsent fields, the OPPOSITE of the real wire. The fix_entry tests (lines 744-816) only assert the changed field; none pin end/project/billable preservation, and the merge fake would hide a drop anyway. The tool advertises partial-patch semantics: description (index.ts:214) and docs/mcp-tools.json both say \"update selected fields\".
```

### Implementation steps

STEP 1 — Fix the body-build in the SDK source.

File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/src/tools/workflows/time-tracking.ts

Locate this EXACT block inside `export async function fixEntry` (currently lines 204-219):

```ts
    const body: AnyRecord = {
        workspaceId: ctx.workspaceId,
        timeEntryId: entryId,
        start:
            str(args.start) ||
            str(entry.start) ||
            str(entry.timeInterval && (entry.timeInterval as AnyRecord).start),
    };
    const nextDescription = str(args.new_description) || str(args.description);
    if (nextDescription) body.description = nextDescription;
    if (str(args.end)) body.end = str(args.end);
    if (projectId) body.projectId = projectId;
    if (taskId) body.taskId = taskId;
    if (tagIds.length) body.tagIds = tagIds;
    if (args.billable !== undefined) body.billable = args.billable;
    if (!body.start) throw new Error("entry start is required to update this time entry");
```

Replace it with EXACTLY:

```ts
    const ivl = (entry.timeInterval ?? {}) as AnyRecord;
    const body: AnyRecord = {
        workspaceId: ctx.workspaceId,
        timeEntryId: entryId,
        start: str(args.start) || str(entry.start) || str(ivl.start),
    };
    const nextDescription = str(args.new_description) || str(args.description);
    // timeEntries.update is a PUT-replace: every omitted field is wiped on the
    // live wire. Preserve each existing field from the already-fetched entry,
    // overriding only when args supply a value (mirrors how `start` is handled).
    body.description = nextDescription || str(entry.description);
    const nextEnd = str(args.end) || str(entry.end) || str(ivl.end);
    if (nextEnd) body.end = nextEnd; // omit only for a genuine running timer (no existing end)
    const nextProjectId = projectId || str(entry.projectId);
    if (nextProjectId) body.projectId = nextProjectId;
    const nextTaskId = taskId || str(entry.taskId);
    if (nextTaskId) body.taskId = nextTaskId;
    const nextTagIds = tagIds.length ? tagIds : arrayOfStrings(entry.tagIds);
    if (nextTagIds.length) body.tagIds = nextTagIds;
    body.billable = args.billable !== undefined ? args.billable : entry.billable === true;
    if (!body.start) throw new Error("entry start is required to update this time entry");
```

No new imports are needed: `str` and `arrayOfStrings` are already imported from "./resolve.js" (lines 9 and 18), and `AnyRecord` is already imported from "./types.js" (line 20). Leave `nextDescription` defined (it is consumed later at the `ref("entry", updated, nextDescription)` call). Note: customFields round-trip is intentionally NOT handled here (read shape `customFieldValues` vs write shape `customFields` need a mapping); that is an out-of-scope follow-up and does not block this fix.

STEP 2 — Pin the regression with a replace-semantics test.

File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/workflows.test.ts

Locate this EXACT existing test block (currently ending at line 816) — it is the "resolves task & tag names" test:

```ts
    it("fix_entry resolves task & tag names into the update body (was a silent no-op)", async () => {
        const ctx = fakeContext({
            entries: [{ id: "e1", description: "Work", start: "2026-06-15T09:00:00.000Z", projectId: "p9" }],
            projects: [{ id: "p9", name: "Launch" }],
            tasks: [{ id: "ta9", name: "Build", projectId: "p9" }],
            tags: [{ id: "tg9", name: "Deep Work" }],
        });
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_fix_entry",
            arguments: { entry_id: "e1", task: "Build", tag: "Deep Work" },
        });
        expect(res.isError).toBeFalsy();
        const entry = ctx.state.entries[0]!;
        expect(entry.taskId).toBe("ta9");
        expect(entry.tagIds).toEqual(["tg9"]);
    });
```

Insert the following NEW test immediately AFTER that block's closing `});` (i.e. between the line `    });` that ends the test above and the next line `    it("review rejects an explicit start+end range...`). Add it verbatim:

```ts
    it("fix_entry preserves end/projectId/taskId/tagIds/billable on a description-only fix (replace-PUT semantics)", async () => {
        const ctx = fakeContext({
            entries: [
                {
                    id: "e1",
                    userId: "u1",
                    description: "Original",
                    billable: true,
                    projectId: "p9",
                    taskId: "ta9",
                    tagIds: ["tg9"],
                    timeInterval: {
                        start: "2026-06-15T09:00:00.000Z",
                        end: "2026-06-15T10:00:00.000Z",
                    },
                },
            ],
        });
        // The live wire is a PUT-replace: model update as DROPPING every key the
        // caller omits (the opposite of the default merge fake), so any field
        // fix_entry forgets to forward is provably wiped.
        (ctx.client.timeEntries as { update: unknown }).update = async (
            payload: Record<string, unknown>,
        ) => {
            const idx = ctx.state.entries.findIndex((e) => e.id === payload.timeEntryId);
            if (idx === -1) throw Object.assign(new Error("entry not found"), { statusCode: 404 });
            const sent = (payload.body ?? payload) as Record<string, unknown>;
            const replaced = {
                id: ctx.state.entries[idx]!.id,
                userId: ctx.state.entries[idx]!.userId,
                ...sent,
            };
            ctx.state.entries[idx] = replaced;
            return replaced;
        };
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_fix_entry",
            arguments: { entry_id: "e1", new_description: "Updated" },
        });
        expect(res.isError).toBeFalsy();
        const entry = ctx.state.entries[0]!;
        expect(entry.description).toBe("Updated");
        expect(entry.end).toBe("2026-06-15T10:00:00.000Z");
        expect(entry.start).toBe("2026-06-15T09:00:00.000Z");
        expect(entry.projectId).toBe("p9");
        expect(entry.taskId).toBe("ta9");
        expect(entry.tagIds).toEqual(["tg9"]);
        expect(entry.billable).toBe(true);
    });
```

### Test to add

A new test in /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/workflows.test.ts named "fix_entry preserves end/projectId/taskId/tagIds/billable on a description-only fix (replace-PUT semantics)" (full code given in STEP 2). It overrides the fake `timeEntries.update` to REPLACE (drop unsent keys) instead of the default merge, calls clockify_fix_entry with only {entry_id, new_description}, and asserts end/start/projectId/taskId/tagIds/billable all survive. Run ONLY this test from the mcp package dir:

  npx vitest run tests/workflows.test.ts -t "preserves end/projectId" --dir /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp

If the --dir form is awkward in the runner, equivalently run it from the mcp workspace: `npm test -w @apet97/clockify-mcp-115 -- tests/workflows.test.ts -t "preserves end/projectId"`. Expected: 1 passed. (Confirm it FAILS against the unpatched source by temporarily reverting STEP 1.)

### Verify

```bash
Run all three from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

  npm run type-check -w @apet97/clockify-mcp-115
  npm test -w @apet97/clockify-mcp-115
  npm run lint -w @apet97/clockify-mcp-115

All must exit 0. (type-check covers mcp/src; test runs the full vitest suite incl. the new case; lint catches style the per-package gates don't.) No tool-count, doc-count, or contract gate is affected — this changes only the update body content of an existing tool, so the focused mcp gates above are sufficient; a final solo `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast` (run alone, no other heavy processes) is the optional full proof.
```

### Rollback

git checkout -- mcp/src/tools/workflows/time-tracking.ts mcp/tests/workflows.test.ts

---

## Task 2 — [HIGH] Restore committed .packsnapshot baselines from git before each CI pack-snapshot verification (make sdk-codegen overwrites them in write mode, defeating the drift guard)

- **Severity:** HIGH  •  **Category:** false-green  •  **Task id:** `ci-build-1`
- **Files:** `.github/workflows/ci.yml`, `.github/workflows/ci-cli.yml`, `.github/workflows/ci-mcp.yml`, `scripts/test-pack-snapshot-ci-guard.mjs`

### Problem

Every CI workflow runs `make sdk-codegen` before its "Pack snapshot verification" step. `make sdk-codegen` (Makefile target `sdk-codegen: sdk-codegen-sync` then `$(MAKE) pack-snapshot`) runs `node scripts/pack-snapshot.mjs --pkg=wrapper|cli|mcp` with NO `--check` flag. In that mode the script executes `writeFileSync(snapshotPath, content)` (scripts/pack-snapshot.mjs line 61), overwriting the git-committed `<pkg>/.packsnapshot` baseline with the freshly-built tarball's file list. The later verification step then diffs the built tarball against that just-overwritten working-tree file, so it ALWAYS passes — it compares the tarball to itself, never to the committed source-of-truth. A drifted or tampered committed baseline (e.g. a leaked stray file added to a baseline) is silently masked across all three published packages. Empirically reproduced: corrupting cli/.packsnapshot then running `--pkg=cli` (write) then `--pkg=cli --check` passes with exit 0, while running `--check` on the corruption directly fails with exit 1. Fix: restore the committed baseline from git (`git checkout -- .packsnapshot`, a local op that works with `persist-credentials: false`) immediately before each verification step so the diff is real.

### Proof (independent opus-max verifier)

```
Code-trace (every link verified by reading the file):
- scripts/pack-snapshot.mjs L60-62: in non-`--check` mode it runs `writeFileSync(snapshotPath, content)` where content = the current `npm pack --dry-run --json` file list. This OVERWRITES the committed `<pkg>/.packsnapshot`.
- Makefile L181-187 `pack-snapshot:` builds wrapper+cli+mcp, then runs `node scripts/pack-snapshot.mjs --pkg=wrapper|cli|mcp` with NO `--check` -> write mode for all three.
- Makefile L243-244: `sdk-codegen: sdk-codegen-sync` and recipe `$(MAKE) pack-snapshot`. So `make sdk-codegen` write-regenerates all three snapshots.
- ci.yml L45-46 runs `make sdk-codegen`; L84-98 then diffs the freshly-built tarball against the working-tree `.packsnapshot` (which L46 just overwrote). ci-cli.yml L59-62 `make sdk-codegen` then L86 `--pkg=cli --check`; ci-mcp.yml L54-57 then L81 `--pkg=mcp --check`. Same defeat.
- All three `.packsnapshot` files ARE git-tracked baselines (git ls-files: cli/.packsnapshot, mcp/.packsnapshot, wrapper/.packsnapshot).
- grep across .github/ + scripts/: NO `git checkout`/`restore`/`git diff`/`git show HEAD` ever restores or validates the committed `.packsnapshot`. No other gate compares the materialized tarball file list to a committed baseline (check-package-contract.mjs L239 and check-supply-chain.mjs L208 validate only the DECLARED `files` globs, not the packed file set).

Empirical proof mirroring the exact CI order on the cli package (restored clean after):
1. Corrupt cli/.packsnapshot (drop a real entry, add `dist/STRAY-LEAKED-SECRET.js`) to simulate a drifted/committed baseline.
2. `node scripts/pack-snapshot.mjs --pkg=cli --check` -> FAILS, exit 1 ("tarball drifted ... +1 added ... -1 removed"). So `--check` alone DOES catch drift.
3. `node scripts/pack-snapshot.mjs --pkg=cli` (write mode = exactly what `make sdk-codegen`->`make pack-snapshot` runs) -> "wrote cli/.packsnapshot (35 entries)", overwriting the corruption.
4. `node scripts/pack-snapshot.mjs --pkg=cli --check` (= the real CI verify step, run AFTER sdk-codegen) -> PASSES, exit 0 ("pack snapshot matches baseline").
The drift caught in step 2 was fully masked by step 3, exactly as the CI sequence (sdk-codegen -> verify) does for all three packages. The committed baseline is never compared.
```

### Implementation steps

STEP 1 — Edit `.github/workflows/ci.yml`, "Pack snapshot verification" step (the `run: |` block at lines 90-98). Prepend a `git checkout -- .packsnapshot` line as the first command in the block.

EXACT current text to locate (verbatim):
```
        run: |
          npm pack --dry-run --json \
            | node -e "let s=''; process.stdin.on('data',c=>s+=c); process.stdin.on('end',()=>{console.log(JSON.parse(s)[0].files.map(f=>f.path).sort().join('\n'));})" \
            > .packsnapshot.actual
          if ! diff -u .packsnapshot .packsnapshot.actual; then
            echo "::error::Tarball contents drifted from .packsnapshot baseline. If intentional, regenerate the baseline locally and commit."
            exit 1
          fi
          echo "Pack snapshot matches baseline ($(wc -l < .packsnapshot | tr -d ' ') entries)."
```

EXACT replacement text:
```
        run: |
          # `make sdk-codegen` ran pack-snapshot in WRITE mode and overwrote the
          # committed wrapper/.packsnapshot; restore the blessed baseline so the
          # diff compares the built tarball against the committed source-of-truth.
          git checkout -- .packsnapshot
          npm pack --dry-run --json \
            | node -e "let s=''; process.stdin.on('data',c=>s+=c); process.stdin.on('end',()=>{console.log(JSON.parse(s)[0].files.map(f=>f.path).sort().join('\n'));})" \
            > .packsnapshot.actual
          if ! diff -u .packsnapshot .packsnapshot.actual; then
            echo "::error::Tarball contents drifted from .packsnapshot baseline. If intentional, regenerate the baseline locally and commit."
            exit 1
          fi
          echo "Pack snapshot matches baseline ($(wc -l < .packsnapshot | tr -d ' ') entries)."
```

STEP 2 — Edit `.github/workflows/ci-cli.yml`, "Pack snapshot verification" step (lines 85-86).

EXACT current text to locate (verbatim):
```
        working-directory: cli
        run: node ../scripts/pack-snapshot.mjs --pkg=cli --check
```

EXACT replacement text:
```
        working-directory: cli
        run: |
          # `make sdk-codegen` ran pack-snapshot in WRITE mode and overwrote the
          # committed cli/.packsnapshot; restore the blessed baseline so --check
          # diffs the built tarball against the committed source-of-truth.
          git checkout -- .packsnapshot
          node ../scripts/pack-snapshot.mjs --pkg=cli --check
```

STEP 3 — Edit `.github/workflows/ci-mcp.yml`, "Pack snapshot verification" step (lines 80-81).

EXACT current text to locate (verbatim):
```
        working-directory: mcp
        run: node ../scripts/pack-snapshot.mjs --pkg=mcp --check
```

EXACT replacement text:
```
        working-directory: mcp
        run: |
          # `make sdk-codegen` ran pack-snapshot in WRITE mode and overwrote the
          # committed mcp/.packsnapshot; restore the blessed baseline so --check
          # diffs the built tarball against the committed source-of-truth.
          git checkout -- .packsnapshot
          node ../scripts/pack-snapshot.mjs --pkg=mcp --check
```

### Test to add

Create a new file at the EXACT path `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/test-pack-snapshot-ci-guard.mjs` with EXACTLY this content (an offline guard that asserts every pack-snapshot verification step restores the committed baseline from git before verifying):

```js
#!/usr/bin/env node
// Guards against the "pack-snapshot CI verification defeated" regression: every
// CI workflow runs `make sdk-codegen`, which rewrites <pkg>/.packsnapshot in
// WRITE mode, so each "Pack snapshot verification" step MUST restore the
// committed baseline (`git checkout -- .packsnapshot`) before diffing/--check.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const cases = [
  {
    file: ".github/workflows/ci.yml",
    verifyMarker: "> .packsnapshot.actual",
  },
  {
    file: ".github/workflows/ci-cli.yml",
    verifyMarker: "--pkg=cli --check",
  },
  {
    file: ".github/workflows/ci-mcp.yml",
    verifyMarker: "--pkg=mcp --check",
  },
];

const restoreMarker = "git checkout -- .packsnapshot";
const failures = [];

for (const { file, verifyMarker } of cases) {
  const text = readFileSync(path.join(root, file), "utf8");
  const verifyIdx = text.indexOf(verifyMarker);
  const restoreIdx = text.indexOf(restoreMarker);
  if (verifyIdx === -1) {
    failures.push(`${file}: expected verification marker not found: ${verifyMarker}`);
    continue;
  }
  if (restoreIdx === -1) {
    failures.push(`${file}: missing baseline restore (\`${restoreMarker}\`) before pack-snapshot verification`);
    continue;
  }
  if (restoreIdx > verifyIdx) {
    failures.push(`${file}: baseline restore must precede the pack-snapshot verification step`);
  }
}

if (failures.length > 0) {
  console.error("pack-snapshot CI guard FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("pack-snapshot CI guard OK: all 3 workflows restore the committed baseline before verifying.");
```

Run just this test with:
```
node /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/test-pack-snapshot-ci-guard.mjs
```
Expected output: `pack-snapshot CI guard OK: all 3 workflows restore the committed baseline before verifying.` and exit code 0.

### Verify

```bash
Run all from the repo root `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk`:

1. New guard test passes (proves all three edits are in place and correctly ordered):
```
node scripts/test-pack-snapshot-ci-guard.mjs
```
Expected: prints `pack-snapshot CI guard OK: ...`, exit 0.

2. YAML still parses (no install needed — uses node's built-in checks via the workflows' own structure; this confirms the indentation of the new multi-line `run:` blocks is valid):
```
python3 -c "import sys,glob; import yaml" 2>/dev/null && python3 -c "import yaml,glob; [yaml.safe_load(open(f)) for f in ['.github/workflows/ci.yml','.github/workflows/ci-cli.yml','.github/workflows/ci-mcp.yml']]; print('workflow YAML valid')" || echo "pyyaml unavailable; skip"
```
Expected: `workflow YAML valid` (or the skip message if pyyaml is absent).

3. The local pack-snapshot proof gate still passes (confirms the script and baselines themselves are unchanged/consistent):
```
make sdk-codegen && make pack-snapshot-check
```
Expected: three lines `pack snapshot matches baseline (N entries) [wrapper|cli|mcp].`, exit 0.
```

### Rollback

git checkout -- .github/workflows/ci.yml .github/workflows/ci-cli.yml .github/workflows/ci-mcp.yml && rm -f scripts/test-pack-snapshot-ci-guard.mjs

---

## Task 3 — [HIGH] Parenthesize array-of-union item types in the SDK generator so `(A | B)[]` no longer ships as the mis-parsed `A | B[]`

- **Severity:** HIGH  •  **Category:** codegen-correctness / type-safety  •  **Task id:** `deep-codegen-1`
- **Files:** `scripts/sdk-codegen/schema.mjs`, `scripts/sdk-codegen/__fixtures__/golden.openapi.yaml`, `scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs`

### Problem

The hand-written SDK generator `scripts/sdk-codegen/schema.mjs` emits array types without wrapping a union item type in parentheses. Line 90 is `else if (resolved.type === "array") type = `${typeFromSchema(resolved.items, model)}[]`;`. When the array items are an inline `enum` (line 87 routes through `unionTypes`) or an inline `oneOf`/`anyOf` (line 88), `typeFromSchema(resolved.items, model)` returns a `|`-joined string such as `"USER" | "DATE" | "FILE"`, so the emitted text becomes `"USER" | "DATE" | "FILE"[]`. In TypeScript `[]` binds tighter than `|`, so the compiler parses this as `"USER" | "DATE" | ("FILE"[])` — NOT the intended `("USER" | "DATE" | "FILE")[]`. The broken type both REJECTS the correct array value (e.g. `["USER","DATE"]`) and ACCEPTS a wrong bare scalar (e.g. `"USER"`). Running the real generator over `spec/corrected/clockify.corrected.openapi.yaml` reproduces this in ~16-19 distinct fields, several REQUIRED, including `UpdateExpensesRequest.changeFields`, `OpenapiSummaryFilter.groups`, `MemberProfileDtoV1.workingDays`, and `UserFilterRequest.roles`. The 203 single-type arrays (`string[]`, `Ref[]`) are unaffected, isolating the defect to the union subset. The broken types flow into the published wrapper (`wrapper/src` -> `dist` `.d.ts`). The existing golden codegen test only covers `string[]`, which is why this shipped undetected.

### Implementation steps

STEP 1 — Fix the generator. Open `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/sdk-codegen/schema.mjs`. Find this EXACT single line (line 90), inside `typeFromSchema`:

    else if (resolved.type === "array") type = `${typeFromSchema(resolved.items, model)}[]`;

Replace that one line with these exact lines (match the file's 4-space indentation; this branch sits between the `allOf` branch on line 89 and the `integer/number` branch on line 91):

    else if (resolved.type === "array") {
        const item = typeFromSchema(resolved.items, model);
        type = item.includes(" | ") ? `(${item})[]` : `${item}[]`;
    }

No new imports are required. Do not change any other line.

STEP 2 — Add an inline-enum-array field to the golden fixture so the regression is covered. Open `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/sdk-codegen/__fixtures__/golden.openapi.yaml`. Find this EXACT block (the `Tag` schema, lines 137-144):

    Tag:
      type: object
      required: [id, name]
      properties:
        id:
          type: string
        name:
          type: string

Replace it with this exact block (adds a `colors` inline-enum array property; YAML indentation is 4 spaces for `Tag:`, 6 for `type/required/properties`, 8 for each property name, 10 for that property's keys):

    Tag:
      type: object
      required: [id, name]
      properties:
        id:
          type: string
        name:
          type: string
        colors:
          type: array
          items:
            type: string
            enum: [RED, GREEN]

STEP 3 — Add the regression assertions to the existing golden test. Open `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs`. Find this EXACT block (lines 46-49) inside the first test (`fixture generation preserves schema fidelity and runtime compatibility`):

        const tagClient = await readGenerated(out, "api/resources/tags/client/Client.ts");
        assert.match(tagClient, /public list\(/);
        assert.match(tagClient, /"page-size": request\["page-size"\]/);
        assert.match(tagClient, /core\.bodyFromRequest/);

Replace it with this exact block (appends the new `Tag` type read plus two assertions — one proving the union array is parenthesized, one proving single-type arrays stay bare):

        const tagClient = await readGenerated(out, "api/resources/tags/client/Client.ts");
        assert.match(tagClient, /public list\(/);
        assert.match(tagClient, /"page-size": request\["page-size"\]/);
        assert.match(tagClient, /core\.bodyFromRequest/);

        const tagType = await readGenerated(out, "api/types/Tag.ts");
        assert.match(tagType, /colors\?: \("RED" \| "GREEN"\)\[\];/);

        const customFieldValueArray = await readGenerated(out, "api/types/CustomFieldValue.ts");
        assert.match(customFieldValueArray, /string\[\]/);

STEP 4 — Regenerate the SDK so the corrected types land in `output/ts-sdk/**` and `wrapper/src/**`. From the repo root `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk` run exactly:

    CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make sdk-codegen

STEP 5 — Run the verification commands in the order given under verify_commands and confirm each exits 0.

### Test to add

Test file (edit, not create): /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs — add the two assertions shown in STEP 3 plus the matching `colors` property in the golden fixture (STEP 2). The exact added test assertions are:

        const tagType = await readGenerated(out, "api/types/Tag.ts");
        assert.match(tagType, /colors\?: \("RED" \| "GREEN"\)\[\];/);

        const customFieldValueArray = await readGenerated(out, "api/types/CustomFieldValue.ts");
        assert.match(customFieldValueArray, /string\[\]/);

The first assertion FAILS before the STEP 1 fix (the generator emits `colors?: "RED" | "GREEN"[];`, which does not match the parenthesized pattern) and PASSES after. The second assertion guards that single-type arrays remain bare `string[]`. Run only this test from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk with:

    npm run test:codegen

(equivalently: node --test scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs ; or the make target: make sdk-codegen-test)

### Verify

```bash
Run all of the following from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk, in this order; each must exit 0:

1. npm run test:codegen
   (focused golden generator test — both new assertions green)

2. CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make sdk-codegen
   (regenerate output/ts-sdk/** and wrapper/src/** from the corrected snapshot)

3. npm run type-check -w clockify-sdk-ts-115
   (proves the regenerated union-array types compile)

4. npm run build -w clockify-sdk-ts-115
   (rebuilds wrapper/dist so consumers see the corrected .d.ts)

Optional confirmation that the broken shape is gone from regenerated output (must print nothing):
   grep -rnE '" \| "[A-Z_]+"\[\];' output/ts-sdk/api || echo "clean"
```

### Rollback

git checkout -- scripts/sdk-codegen/schema.mjs scripts/sdk-codegen/__fixtures__/golden.openapi.yaml scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs && CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make sdk-codegen

---

## Task 4 — [MEDIUM] Make plan-gated 402 errors classify as feature_unavailable across the SDK classifier (and therefore the MCP surface)

- **Severity:** MEDIUM  •  **Category:** error-handling  •  **Task id:** `wrapper-errors-1`
- **Files:** `docs/error-codes.json`, `wrapper/error-codes.ts`, `cli/src/error-codes.ts`, `mcp/src/error-codes.ts`, `docs/error-codes.md`, `wrapper/tests/errors.test.ts`

### Problem

A real HTTP 402 (plan-gated endpoints: audit-log, scheduled/expense reports) is thrown by the generated client as a base `ClockifyApiError` (wrapper/src/core/request.ts default branch). The SDK classifier `classifyClockifyError` -> `stableCodeForClockifyError` (wrapper/errors.ts) resolves its status code through `errorCodeForSdkStatus(402)` (wrapper/errors.ts L429-436), which only considers registry entries whose `surfaces` array includes `"sdk"`. The only registry entry with httpStatus 402 is `feature_unavailable`, whose surfaces are `["cli","mcp"]` — `"sdk"` is excluded — so `errorCodeForSdkStatus(402)` returns undefined and the code falls through to `errorCodeForMessage`, which structurally cannot return `feature_unavailable`. A real 402 therefore classifies as `"error"` (or `"invalid_request"`), never `feature_unavailable`. Because `classifyClockifyError` always returns a truthy code for any ClockifyApiError, it preempts the MCP fallback in `mcp/src/result.ts` `errorCodeForError` (`classifyClockifyError(err)?.code ?? errorCodeForStatus(status) ?? ...`) — the non-filtered `errorCodeForStatus(402)` (which DOES map 402 -> feature_unavailable) is unreachable. The two existing tests (mcp/tests/audit.test.ts:119, mcp/tests/diagnose.test.ts:14) throw plain `Error` fixtures (`Object.assign(new Error(), {statusCode:402})`), which are NOT ClockifyApiError, so they exercise the working fallback and mask the bug. The error registry (docs/error-registry-contract.json) marks feature_unavailable reachable and diagnose.ts ships a feature_unavailable hint for HTTP 402, so the surface intends this classification. Root cause: feature_unavailable is excluded from the "sdk" surface. Fix: add "sdk" to its surfaces (the source-of-truth is docs/error-codes.json; the three error-codes.ts copies and docs/error-codes.md are generated by `make error-docs` and must NOT be hand-edited).

### Implementation steps

STEP 1 — Edit the source-of-truth registry. File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/docs/error-codes.json

Locate this EXACT block (it is the `feature_unavailable` entry, lines 36-49):

    {
      "code": "feature_unavailable",
      "httpStatus": [
        402
      ],
      "retry": false,
      "surfaces": [
        "cli",
        "mcp"
      ],

Replace it with (add "sdk" as the first surface):

    {
      "code": "feature_unavailable",
      "httpStatus": [
        402
      ],
      "retry": false,
      "surfaces": [
        "sdk",
        "cli",
        "mcp"
      ],

Do NOT change any other field of this entry, and do NOT touch any other entry.

STEP 2 — Regenerate the generated copies. Run this EXACT command from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

    make error-docs

This rewrites (do NOT hand-edit these): wrapper/error-codes.ts, cli/src/error-codes.ts, mcp/src/error-codes.ts, and docs/error-codes.md. Expected console output: `wrote docs/error-codes.md and package error-code modules`. After running it, the `errorCodeForSdkStatus(402)` lookup in wrapper/errors.ts will find feature_unavailable (because its regenerated registry entry now includes "sdk").

STEP 3 — Add the decisive regression test at the SDK classifier layer. File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/errors.test.ts

This file ALREADY imports `ClockifyApiError`, `classifyClockifyError`, and `getStableErrorCode` (lines 3-26) — add no new imports. Locate this EXACT text (end of the first test inside `describe("stable SDK error classification", ...)`, lines 513-517):

        expect(classification?.recovery).toContain("returned IDs");
        expect(getStableErrorCode(err)).toBe("not_found");
    });

    it("keeps retry guidance for rate limits and upstream errors", () => {

Replace it with (inserts a new `it` block between the two existing tests):

        expect(classification?.recovery).toContain("returned IDs");
        expect(getStableErrorCode(err)).toBe("not_found");
    });

    it("classifies a plan-gated 402 ClockifyApiError as feature_unavailable", () => {
        const err = new ClockifyApiError({
            statusCode: 402,
            message: "This feature is not available on your plan",
        });

        expect(classifyClockifyError(err)).toMatchObject({
            code: "feature_unavailable",
            retryable: false,
            statusCode: 402,
        });
        expect(getStableErrorCode(err)).toBe("feature_unavailable");
    });

    it("keeps retry guidance for rate limits and upstream errors", () => {

This test FAILS before Step 1+2 (real 402 -> "error") and PASSES after. Note: the MCP-surface tests (mcp/tests/audit.test.ts:119, mcp/tests/diagnose.test.ts:14) are intentionally left unchanged — they continue to pass, and the base `ClockifyApiError` class is not re-exported on the wrapper's public `./errors` subpath (only subclasses + `isClockifyApiError` are), so a faithful MCP-layer 402 fixture would require a public-surface export change that triggers the package-contract / sdk-public-api cascade and is out of scope. The wrapper test above pins the exact `classifyClockifyError` behavior that `mcp/src/result.ts` `errorCodeForError` delegates to first, so the MCP path is guarded.

### Test to add

Add to /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/errors.test.ts inside the existing `describe("stable SDK error classification", ...)` block (full block shown in STEP 3):

    it("classifies a plan-gated 402 ClockifyApiError as feature_unavailable", () => {
        const err = new ClockifyApiError({
            statusCode: 402,
            message: "This feature is not available on your plan",
        });

        expect(classifyClockifyError(err)).toMatchObject({
            code: "feature_unavailable",
            retryable: false,
            statusCode: 402,
        });
        expect(getStableErrorCode(err)).toBe("feature_unavailable");
    });

Run ONLY this test (from the wrapper package dir):

    cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper && npx vitest run tests/errors.test.ts -t "plan-gated 402"

Expected: 1 passed.

### Verify

```bash
Run all from repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk. (If wrapper/src is not yet generated in a fresh clone, run `make sdk-codegen` first; it is already present here.)

1. Regenerate + prove no drift, registry integrity, troubleshooting + count gates:
   make error-docs
   make error-docs-drift
   make error-registry
   make troubleshooting-drift
   make docs-counts

2. Wrapper type-check + full wrapper test suite (includes the new test):
   npm run type-check -w clockify-sdk-ts-115
   npm test -w clockify-sdk-ts-115

3. Focused new test only:
   cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper && npx vitest run tests/errors.test.ts -t "plan-gated 402"

4. Confirm MCP + CLI error tests still pass (registry copies regenerated):
   npm test -w @apet97/clockify-mcp-115
   npm test -w @apet97/clockify-cli-115

5. Final deterministic full proof (run SOLO, blank creds, no other heavy commands concurrently):
   CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast

All must exit 0. `make error-docs-drift` exiting 0 confirms the three error-codes.ts files and docs/error-codes.md were regenerated consistently from docs/error-codes.json.
```

### Rollback

git checkout -- docs/error-codes.json wrapper/error-codes.ts cli/src/error-codes.ts mcp/src/error-codes.ts docs/error-codes.md docs/troubleshooting.md wrapper/tests/errors.test.ts

---

## Task 5 — [MEDIUM] Make scoped ensureTag/ensureProject/ensureClient walk every page before matching, so they stop creating duplicates of entities past the first page

- **Severity:** MEDIUM  •  **Category:** correctness  •  **Task id:** `wh-1`
- **Files:** `wrapper/scoped-client.ts`, `wrapper/tests/scoped-client.test.ts`

### Problem

In /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/scoped-client.ts, the three find-or-create helpers (ensureTag, ensureProject, ensureClient) pass a single, non-paginated list call to the underlying findOrCreate helper:

- line 199: `list: async () => await this.client.tags.list({ workspaceId }),`
- line 209: `list: async () => await this.client.projects.list({ workspaceId }),`
- line 219: `list: async () => await this.client.clients.list({ workspaceId }),`

None pass `page` / `page-size`. The generated list methods only send `page-size` when present (it is undefined here), and wrapper/src/core/url/index.ts drops undefined query params, so the request reaches the wire with no pagination params. Clockify then applies its bounded server default of 50 records per page for these three PAGINATED endpoints (tags/projects/clients are explicitly in wrapper/iter.ts KNOWN_PAGINATED_METHODS; live evidence in spec/evidence/discrepancies.md shows "50 of 966, last-page:false").

wrapper/ensure.ts findOrCreate calls `matchByName(await opts.list(), ...)` exactly once. On a workspace with more than 50 tags/projects/clients, an existing entity whose name lives on page 2+ is never seen, so matchByName returns kind:"none", and a DUPLICATE is POSTed. This violates the helpers' documented idempotency contract (ensure.ts top docstring; scoped-client.ts line 190 "Idempotent; reuses a single case-insensitive match"). The class already ships auto-paginating iterators (iterProjects/iterTags/iterClients) that walk every page, but the ensure* helpers do not use them. Existing tests only mock 0-1 records, so they never cross a page boundary and never catch this.

### Proof (independent opus-max verifier)

```
Independently traced; every link verified by reading the code.

1) wrapper/scoped-client.ts lines 195-222 — the three find-or-create helpers wire a single, non-paginated list call:
   199: `list: async () => await this.client.tags.list({ workspaceId }),`
   209: `list: async () => await this.client.projects.list({ workspaceId }),`
   219: `list: async () => await this.client.clients.list({ workspaceId }),`
   None pass `page` / `page-size`.

2) Generated list methods send page-size only when present. wrapper/src/api/resources/tags/client/Client.ts:37 `"page-size": request["page-size"]` (projects/Client.ts:47, clients/Client.ts:39 identical). With `{ workspaceId }`, `request["page-size"]` is undefined.

3) Undefined query params are DROPPED, not defaulted large. wrapper/src/core/url/index.ts:12-13 `add(key,value){ if (value == null) return this; ... }`. So no `page-size` reaches the wire → Clockify applies its server default.

4) Clockify's default for these endpoints is a bounded 50, and the three ARE paginated:
   - wrapper/iter.ts KNOWN_PAGINATED_METHODS explicitly lists `clients`/`projects`/`tags` `list` (lines 81,83,85,102,104,106).
   - wrapper/iter.ts:41-42 doc: "Default 50 (matches Clockify's default; max 200)".
   - spec/evidence/discrepancies.md:1057,1134 carry live evidence Clockify paginates at 50/page ("50 of 966, last-page:false").
   - The class even ships auto-paginating iterProjects/iterTags/iterClients (scoped-client.ts 233-257) precisely because a single list call returns one bounded page — yet ensure* does not use them.

5) wrapper/ensure.ts findOrCreate (lines 53-69) calls `matchByName(await opts.list(), opts.name, ...)` exactly once; on `kind:"none"` it calls `opts.create(opts.name)`. So an existing entity on page 2+ yields kind:"none" → a DUPLICATE is created, defeating the documented idempotency (ensure.ts top docstring: helpers list+match BEFORE creating so a re-run reuses the existing record; scoped-client.ts:190 "Idempotent; reuses a single case-insensitive match").

6) Tests do not catch it: wrapper/tests/scoped-client.test.ts ensure cases (159-182) use 0-1 record mocks, so the >50-entity path is never exercised.

Net: on any workspace with >50 tags/projects/clients, ws.ensureProject("Existing") for a name beyond the first page silently POSTs a second "Existing". Real correctness bug.
```

### Implementation steps

STEP 1 — Fix wrapper/scoped-client.ts: replace each ensure* helper's single-page `list` callback with one that drains the matching scoped auto-paginating iterator (which already walks every page via the Last-Page header and preserves the active-only default).

File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/scoped-client.ts

1a. ensureTag — locate this EXACT current code (lines 194-202):

    /** Find a tag by name (case-insensitive) or create it. Idempotent. */
    ensureTag(name: string): Promise<EnsureResult<NamedRecord>> {
        const workspaceId = this.workspaceId;
        return ensureTagHelper<NamedRecord>({
            name,
            list: async () => await this.client.tags.list({ workspaceId }),
            create: async (n) => await this.client.tags.create({ workspaceId, name: n }),
        });
    }

Replace it with EXACTLY:

    /** Find a tag by name (case-insensitive) or create it. Idempotent. */
    ensureTag(name: string): Promise<EnsureResult<NamedRecord>> {
        const workspaceId = this.workspaceId;
        return ensureTagHelper<NamedRecord>({
            name,
            list: async () => {
                const out: NamedRecord[] = [];
                for await (const t of this.iterTags()) out.push(t as unknown as NamedRecord);
                return out;
            },
            create: async (n) => await this.client.tags.create({ workspaceId, name: n }),
        });
    }

1b. ensureProject — locate this EXACT current code (lines 204-212):

    /** Find a project by name (case-insensitive) or create it. Idempotent. */
    ensureProject(name: string): Promise<EnsureResult<NamedRecord>> {
        const workspaceId = this.workspaceId;
        return ensureProjectHelper<NamedRecord>({
            name,
            list: async () => await this.client.projects.list({ workspaceId }),
            create: async (n) => await this.client.projects.create({ workspaceId, name: n }),
        });
    }

Replace it with EXACTLY:

    /** Find a project by name (case-insensitive) or create it. Idempotent. */
    ensureProject(name: string): Promise<EnsureResult<NamedRecord>> {
        const workspaceId = this.workspaceId;
        return ensureProjectHelper<NamedRecord>({
            name,
            list: async () => {
                const out: NamedRecord[] = [];
                for await (const p of this.iterProjects()) out.push(p as unknown as NamedRecord);
                return out;
            },
            create: async (n) => await this.client.projects.create({ workspaceId, name: n }),
        });
    }

1c. ensureClient — locate this EXACT current code (lines 214-222):

    /** Find a client by name (case-insensitive) or create it. Idempotent. */
    ensureClient(name: string): Promise<EnsureResult<NamedRecord>> {
        const workspaceId = this.workspaceId;
        return ensureClientHelper<NamedRecord>({
            name,
            list: async () => await this.client.clients.list({ workspaceId }),
            create: async (n) => await this.client.clients.create({ workspaceId, body: { name: n } }),
        });
    }

Replace it with EXACTLY:

    /** Find a client by name (case-insensitive) or create it. Idempotent. */
    ensureClient(name: string): Promise<EnsureResult<NamedRecord>> {
        const workspaceId = this.workspaceId;
        return ensureClientHelper<NamedRecord>({
            name,
            list: async () => {
                const out: NamedRecord[] = [];
                for await (const c of this.iterClients()) out.push(c as unknown as NamedRecord);
                return out;
            },
            create: async (n) => await this.client.clients.create({ workspaceId, body: { name: n } }),
        });
    }

No import changes are needed: iterTags/iterProjects/iterClients are existing methods on the same class, and NamedRecord is already imported on line 28. The `workspaceId` const stays because each `create` callback still uses it.

STEP 2 — Add the regression test (see test_to_add for the exact code and where to insert it).

### Test to add

Add ONE new test to the existing `describe("Workspace ensure helpers", ...)` block in /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/scoped-client.test.ts.

Locate this EXACT current code (lines 176-183, the last test inside that describe plus its closing brace):

    it("ensureClient creates via the body envelope when missing", async () => {
        const fetchMock = ensureFetch([], { id: "c_new", name: "New Co" });
        const ws = createClockifyClient({ apiKey: "test", fetch: fetchMock as typeof fetch }).workspace("ws-e");
        const result = await ws.ensureClient("New Co");
        expect(result.created).toBe(true);
        expect(result.id).toBe("c_new");
    });
});

Replace it with EXACTLY (adds the new test before the closing `});`):

    it("ensureClient creates via the body envelope when missing", async () => {
        const fetchMock = ensureFetch([], { id: "c_new", name: "New Co" });
        const ws = createClockifyClient({ apiKey: "test", fetch: fetchMock as typeof fetch }).workspace("ws-e");
        const result = await ws.ensureClient("New Co");
        expect(result.created).toBe(true);
        expect(result.id).toBe("c_new");
    });

    it("ensureProject reuses a match on page 2 (>50 records) without creating a duplicate", async () => {
        const page1 = Array.from({ length: 50 }, (_, i) => ({ id: `p_${i}`, name: `Project ${i}` }));
        const page2 = [{ id: "p_target", name: "Existing" }];
        let getCall = 0;
        let postCalled = false;
        const fetchMock = vi.fn(async (_input: unknown, init?: { method?: string }) => {
            const method = (init?.method ?? "GET").toUpperCase();
            if (method !== "GET") {
                postCalled = true;
                return new Response(JSON.stringify({ id: "p_new", name: "Existing" }), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                });
            }
            const body = getCall === 0 ? page1 : page2;
            const last = getCall >= 1;
            getCall += 1;
            return new Response(JSON.stringify(body), {
                status: 200,
                headers: { "content-type": "application/json", "Last-Page": last ? "true" : "false" },
            });
        });
        const ws = createClockifyClient({ apiKey: "test", fetch: fetchMock as typeof fetch }).workspace("ws-pg");
        const result = await ws.ensureProject("Existing");
        expect(result.created).toBe(false);
        expect(result.id).toBe("p_target");
        expect(postCalled).toBe(false);
        expect(getCall).toBe(2);
    });
});

This mocks two GET pages (50 records on page 1 with `Last-Page: false`, then the target "Existing" on page 2 with `Last-Page: true`) and asserts the helper reuses the page-2 match (created:false, id:"p_target") and never POSTs (postCalled:false). Run JUST this test file from the repo root with:

    npx vitest run tests/scoped-client.test.ts --root wrapper

(Before the STEP 1 fix this new test FAILS — created would be true and postCalled true; after the fix it PASSES.)

### Verify

```bash
Run all of the following from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk (the SDK source must already be generated; if a fresh clone, run `make sdk-codegen` first):

1. npm run type-check -w clockify-sdk-ts-115
2. npm test -w clockify-sdk-ts-115
3. npm run build -w clockify-sdk-ts-115
4. npm run lint -w clockify-sdk-ts-115

All four must exit 0. Step 2 (the full wrapper vitest suite) must include the new "ensureProject reuses a match on page 2" test passing.
```

### Rollback

git checkout -- wrapper/scoped-client.ts wrapper/tests/scoped-client.test.ts

---

## Task 6 — [MEDIUM] expenses list --start/--end are silent no-ops: apply them as a client-side date-range filter

- **Severity:** MEDIUM  •  **Category:** wire-shape / cli-correctness  •  **Task id:** `cli-crud-1`
- **Files:** `cli/src/commands/expenses.ts`, `cli/tests/read-commands-expenses.test.ts`

### Problem

`clk115 expenses list --start 2026-01-01 --end 2026-01-31` advertises `--start`/`--end` date filters but silently drops them: the generated `ListExpensesRequest` only carries page/page-size/user-id, the generated `ExpensesClient.list` builds a fixed queryParams literal that never reads `request.start`/`request.end`, and `wireBody<T>()` is a pure type cast (no runtime filtering). The CLI also does NO client-side date filter on the returned rows. Net effect: the flags are accepted, the date range never reaches the HTTP GET, and the unfiltered (page-limited) expense set is returned as if filtered — wrong data presented as correct. The fix keeps the flags working by filtering the fetched page client-side on the ISO-8601 expense `date` (lexicographic compare vs YYYY-MM-DD bounds). The `wireBody` forwarding of start/end is left in place (harmless, ignored upstream) so the consumer-cast-budget contract and discrepancies ledger remain accurate; only a comment is corrected and a real filter is added.

### Proof (independent opus-max verifier)

```
Independent end-to-end code trace (all files read directly):

(1) cli/src/commands/expenses.ts:63-64 register `.option("--start <date>" ...)` / `.option("--end <date>" ...)`. Lines 70-76 build `const req: ClockifyApi.ListExpensesRequest & { start?; end? } = { workspaceId, page, "page-size" }; if (opts.start) req.start = opts.start; if (opts.end) req.end = opts.end;`. Lines 77-78 call `client.expenses.list(wireBody<ClockifyApi.ListExpensesRequest>(req))`.

(2) wireBody (wrapper/requests.ts:32-37) is a PURE type cast: `return value as T;` — no runtime mutation/filtering. The object still carries start/end at runtime, but nothing downstream reads them.

(3) Generated ExpensesClient.list builds a FIXED queryParams object literal — output/ts-sdk/api/resources/expenses/client/Client.ts:31-35 (and the byte-identical wrapper/src copy the CLI actually imports via clockify-sdk-ts-115): `queryParams: { "page": request.page, "page-size": request["page-size"], "user-id": request["user-id"] }`. It never references request.start / request.end.

(4) core.request (output/ts-sdk/core/request.ts:41) serializes the URL query ONLY from `{ ...operation.queryParams, ...requestOptions?.queryParams }`. There is NO catch-all spread of the request object, so start/end have no path onto the query string. ListExpensesRequest.ts declares only workspaceId/page/page-size/user-id (no start/end).

(5) The CLI action does NO compensating client-side date filter: grep shows opts.start/opts.end used ONLY at lines 75-76 (the dropped req); the items->rows mapping (84-120) feeds printRecords(rows) (121) unfiltered by date. promoteDateBoundary is used only for create/update, not list.

(6) Maintainers' own ledger corroborates: spec/evidence/discrepancies.md:2664 — "the CLI list filters expenses.list (generated ListExpensesRequest drops start/end on the wire while --start/--end are advertised)."

Net effect: `clk115 expenses list --start 2026-01-01 --end 2026-01-31` accepts the flags, silently drops them before the HTTP GET, and returns the unfiltered (page-limited) expense set with no error — wrong data for a date-range report, presented as if filtered.
```

### Implementation steps

All paths are absolute. Make all 4 edits exactly.

=================================================================
EDIT 1 of 4 — file: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/src/commands/expenses.ts
Correct the misleading comment inside the `list` action (currently around lines 67-69).

BEFORE (locate this exact text):
            const { client, workspaceId, output } = await resolveContext(this, services);
            // Generated `ListExpensesRequest` carries only page/page-size; the CLI
            // still surfaces --start/--end as date filters, so wireBody bridges the
            // narrower request type with a sanctioned typed escape.
            const req: ClockifyApi.ListExpensesRequest & { start?: string; end?: string } = {

AFTER (replace with exactly):
            const { client, workspaceId, output } = await resolveContext(this, services);
            // Generated `ListExpensesRequest` carries only page/page-size, so the live
            // wire DROPS --start/--end. We still forward them via the sanctioned
            // wireBody escape (harmless; ignored upstream) and apply the date range as
            // a client-side filter on the fetched page below.
            const req: ClockifyApi.ListExpensesRequest & { start?: string; end?: string } = {

=================================================================
EDIT 2 of 4 — file: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/src/commands/expenses.ts
Replace the unfiltered print at the end of the `list` action (currently line 121).

BEFORE (locate this exact text — it is the line immediately after the `const rows = items.map(...)` block closes with `});`):
            printRecords(rows, output);
        });

AFTER (replace with exactly):
            // The wire ignores --start/--end (see comment above), so apply the date
            // range here. Clockify expense `date` is ISO-8601, so a lexicographic
            // compare against the YYYY-MM-DD bounds is correct. This filters only the
            // rows on the fetched page (default 25, max 200 via --limit); a range
            // spanning multiple pages needs a larger --limit.
            const startDay = opts.start as string | undefined;
            const endDay = opts.end as string | undefined;
            const visible =
                startDay || endDay
                    ? rows.filter((r) => {
                          const day = (r.date ?? "").slice(0, 10);
                          if (!day) return false;
                          if (startDay && day < startDay) return false;
                          if (endDay && day > endDay) return false;
                          return true;
                      })
                    : rows;
            printRecords(visible, output);
        });

Note: there are two `printRecords(...)` calls in this file (`list` uses `printRecords`, others use `printReceipt`/`printObject`), but only ONE line reads exactly `            printRecords(rows, output);` — that is the correct anchor. Do not touch any `printReceipt` or `printObject` call.

=================================================================
EDIT 3 of 4 — file: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/tests/read-commands-expenses.test.ts
The first existing test passes `--start`/`--end` and expects no-date rows to survive; with the new client-side filter those rows would be dropped, so remove the date flags from THAT test's invocation and from its wire-shape assertion. (A dedicated date-filter test is added in EDIT 4.)

EDIT 3a — remove the date flags from the args array.
BEFORE (locate this exact text):
            "expenses",
            "list",
            "--limit",
            "999",
            "--start",
            "2026-06-01",
            "--end",
            "2026-06-30",
        ]);
        expect(calls[0]).toMatchObject({
            "page-size": 200,
            start: "2026-06-01",
            end: "2026-06-30",
        });

AFTER (replace with exactly):
            "expenses",
            "list",
            "--limit",
            "999",
        ]);
        expect(calls[0]).toMatchObject({
            "page-size": 200,
        });

=================================================================
EDIT 4 of 4 — file: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/tests/read-commands-expenses.test.ts
Add a dedicated test proving the date-range filter works. Insert it immediately BEFORE the existing "list handles a direct expenses array envelope" test.

BEFORE (locate this exact text):
    it("list handles a direct expenses array envelope", async () => {

AFTER (replace with exactly):
    it("list applies --start/--end as a client-side date-range filter on the fetched page", async () => {
        const client = {
            expenses: {
                list: async () => ({
                    expenses: {
                        expenses: [
                            { id: "in-1", date: "2026-06-15T00:00:00Z", category: "A" },
                            { id: "lo-1", date: "2026-05-31T00:00:00Z", category: "B" },
                            { id: "hi-1", date: "2026-07-01T00:00:00Z", category: "C" },
                            { id: "no-date", category: "D" },
                        ],
                    },
                }),
            },
        };
        await makeProgram(registerExpensesCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "expenses",
            "list",
            "--start",
            "2026-06-01",
            "--end",
            "2026-06-30",
        ]);
        const rows = lastJson() as Array<Record<string, unknown>>;
        // Only the in-range dated row survives; out-of-range and undated rows drop.
        expect(rows.map((r) => r.id)).toEqual(["in-1"]);
    });

    it("list handles a direct expenses array envelope", async () => {

### Test to add

A new test added to /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/tests/read-commands-expenses.test.ts (see EDIT 4 above), full code:

    it("list applies --start/--end as a client-side date-range filter on the fetched page", async () => {
        const client = {
            expenses: {
                list: async () => ({
                    expenses: {
                        expenses: [
                            { id: "in-1", date: "2026-06-15T00:00:00Z", category: "A" },
                            { id: "lo-1", date: "2026-05-31T00:00:00Z", category: "B" },
                            { id: "hi-1", date: "2026-07-01T00:00:00Z", category: "C" },
                            { id: "no-date", category: "D" },
                        ],
                    },
                }),
            },
        };
        await makeProgram(registerExpensesCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "expenses",
            "list",
            "--start",
            "2026-06-01",
            "--end",
            "2026-06-30",
        ]);
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows.map((r) => r.id)).toEqual(["in-1"]);
    });

Run just this test file (from the cli package directory):
    cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli && npx vitest run tests/read-commands-expenses.test.ts

### Verify

```bash
Run from repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk in order. Prerequisite (only if a fresh clone — cli type-check resolves wrapper types from wrapper/dist): `npm ci && make sdk-codegen && npm run build -w clockify-sdk-ts-115`.

1. Focused single-file test (fastest inner loop):
   cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli && npx vitest run tests/read-commands-expenses.test.ts
2. Type-check the CLI package (scopes src/ only):
   npm run type-check -w @apet97/clockify-cli-115
3. Full CLI test suite:
   npm test -w @apet97/clockify-cli-115
4. CLI lint:
   npm run lint -w @apet97/clockify-cli-115
5. Cast-budget gate (must stay green; this change keeps wireBody and adds no `as never`):
   make consumer-cast-budget

All five must pass. Do NOT edit docs/cli-commands.json, docs/consumer-cast-budget-contract.json, or spec/evidence/discrepancies.md — the flags remain advertised and the wire still drops start/end (now compensated client-side), so those documents stay accurate and no docs-drift gate is triggered.
```

### Rollback

git checkout -- cli/src/commands/expenses.ts cli/tests/read-commands-expenses.test.ts

---

## Task 7 — [MEDIUM] Fix `clk115 status` so a running timer's `elapsed` reflects wall-clock instead of always "0s"

- **Severity:** MEDIUM  •  **Category:** correctness  •  **Task id:** `cli-time-1`
- **Files:** `cli/src/commands/status.ts`, `cli/tests/status.test.ts`

### Problem

In `cli/src/commands/status.ts`, the `runningEntry.elapsed` field is computed as `formatIsoDuration(extractIsoDuration(running))`. For a genuinely running Clockify timer, the in-progress entry has `timeInterval.duration === null` (Clockify computes `duration` only when the timer is stopped; `DateTimeInterval.duration` is `nullable: true` in spec/corrected/clockify.corrected.openapi.yaml). `extractIsoDuration` therefore returns `null`, and `formatIsoDuration(null)` hard-returns "0s" (cli/src/duration.ts line 74). Result: `elapsed` is always "0s" for a real running timer and never tracks wall-clock. The fix derives elapsed from `timeInterval.start` against `Date.now()` when no ISO duration is present, while preserving `formatIsoDuration` for the duration-present (already-stopped) path. This is hand-written CLI code (CLAUDE.md "Where To Change Things": CLI command -> cli/src/commands/*.ts), not generated.

### Proof (independent opus-max verifier, live-probed)

```
Code trace is definitive. cli/src/commands/status.ts:60 sets `elapsed: formatIsoDuration(extractIsoDuration(running))`. extractIsoDuration (lines 89-92) returns `interval?.duration ?? null`. cli/src/duration.ts:73-75 starts formatIsoDuration with `if (!iso) { return "0s"; }`, so a null/absent duration hard-maps to "0s".

The empirical link (running entries have no duration) is established by the repo's OWN evidence, not just the wire:
1. cli/tests/status.test.ts:113-138, named "normalizes a data envelope and falls back when duration is absent", builds an in-progress entry as `timeInterval: { start: "2026-06-18T10:00:00Z" }` (no duration, no end) and asserts `running.elapsed === "0s"`. This is the maintainers' own model of a running entry, and they encode the "0s" result.
2. spec/corrected/clockify.corrected.openapi.yaml:16262-16265: DateTimeInterval.duration is `nullable: true` (comment "ISO 8601 duration, e.g. PT1H30M"); end is nullable in both interval DTOs — the running-entry case. Clockify computes duration only on stop; a running interval is `{ start, end: null, duration: null }`. Even if the wire carried "PT0S", formatIsoDuration("PT0S") also yields "0s" (no H/M/S parts). So under every realistic shape, elapsed is "0s" and never tracks wall-clock.

The sibling test status.test.ts:66-96 injects `duration: "PT1H30M"` into an in-progress entry to assert elapsed="1h30m" — a shape the live API does not produce for a running timer; it only exercises the formatting path, not production reality.

Scope: cli/src/commands/status.ts is hand-written CLI code (CLAUDE.md "Where To Change Things": CLI command -> cli/src/commands/*.ts), not generated. startedAt (line 59) is still shown, partially mitigating, but the elapsed field is actively misleading.
```

### Implementation steps

STEP 1 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/src/commands/status.ts

1a. Change the `elapsed` line inside the `runningEntry` object literal.

BEFORE (exact, currently line 60):
```
                              elapsed: formatIsoDuration(extractIsoDuration(running)),
```

AFTER:
```
                              elapsed: formatRunningElapsed(running),
```

1b. Add two new helper functions. Locate the EXACT existing block at the end of the file:

BEFORE (exact, currently lines 89-92):
```
function extractIsoDuration(entry: unknown): string | null {
    const interval = (entry as { timeInterval?: { duration?: string | null } }).timeInterval;
    return interval?.duration ?? null;
}
```

AFTER (replace that block with the same block PLUS the two helpers appended):
```
function extractIsoDuration(entry: unknown): string | null {
    const interval = (entry as { timeInterval?: { duration?: string | null } }).timeInterval;
    return interval?.duration ?? null;
}

function humanizeSeconds(total: number): string {
    if (total <= 0) return "0s";
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const parts: string[] = [];
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds) parts.push(`${seconds}s`);
    return parts.length > 0 ? parts.join("") : "0s";
}

function formatRunningElapsed(entry: unknown): string {
    const iso = extractIsoDuration(entry);
    if (iso) return formatIsoDuration(iso);
    const startMs = Date.parse(extractStart(entry));
    if (!Number.isFinite(startMs)) return "0s";
    return humanizeSeconds(Math.max(0, Math.round((Date.now() - startMs) / 1000)));
}
```

Note: the existing `import { formatIsoDuration } from "../duration.js";` (line 10) stays — `formatRunningElapsed` still uses it. No new imports are needed; `extractStart` and `extractIsoDuration` already exist in this file.

STEP 2 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/tests/status.test.ts

The existing no-duration test asserts `"0s"`, which encodes the bug. Replace it with a test that pins `Date.now()` and asserts a computed elapsed. Also keep an explicit "0s" assertion for the genuinely-unparseable-start case.

BEFORE (exact, currently lines 113-138):
```
    it("normalizes a data envelope and falls back when duration is absent", async () => {
        const client = {
            users: { getCurrentUser: async () => ({ id: "u-1" }) },
            workspaces: { list: async () => [] },
            timeEntries: {
                listInProgress: async () => ({
                    data: [
                        {
                            id: "te-2",
                            userId: "u-1",
                            description: "open",
                            timeInterval: { start: "2026-06-18T10:00:00Z" },
                        },
                    ],
                }),
            },
        };
        await makeProgram(client as unknown as ClockifyClient, {
            apiKey: "k",
            workspaceId: "ws-1",
        }).parseAsync(["node", "clk115", "--json", "status"]);
        const running = lastJson().runningEntry as Record<string, unknown>;
        expect(running.id).toBe("te-2");
        expect(running.elapsed).toBe("0s");
        expect(lastJson().email).toBe("");
    });
```

AFTER:
```
    it("normalizes a data envelope and computes elapsed from start when duration is absent", async () => {
        const startIso = "2026-06-18T10:00:00Z";
        const nowMs = Date.parse(startIso) + 90 * 60 * 1000; // 1h30m after start
        const nowSpy = vi.spyOn(Date, "now").mockReturnValue(nowMs);
        try {
            const client = {
                users: { getCurrentUser: async () => ({ id: "u-1" }) },
                workspaces: { list: async () => [] },
                timeEntries: {
                    listInProgress: async () => ({
                        data: [
                            {
                                id: "te-2",
                                userId: "u-1",
                                description: "open",
                                timeInterval: { start: startIso },
                            },
                        ],
                    }),
                },
            };
            await makeProgram(client as unknown as ClockifyClient, {
                apiKey: "k",
                workspaceId: "ws-1",
            }).parseAsync(["node", "clk115", "--json", "status"]);
            const running = lastJson().runningEntry as Record<string, unknown>;
            expect(running.id).toBe("te-2");
            expect(running.elapsed).toBe("1h30m");
            expect(lastJson().email).toBe("");
        } finally {
            nowSpy.mockRestore();
        }
    });

    it("falls back to 0s for a running entry with no duration and no parseable start", async () => {
        const client = {
            users: { getCurrentUser: async () => ({ id: "u-1" }) },
            workspaces: { list: async () => [] },
            timeEntries: {
                listInProgress: async () => ({
                    data: [
                        {
                            id: "te-3",
                            userId: "u-1",
                            description: "open",
                            timeInterval: {},
                        },
                    ],
                }),
            },
        };
        await makeProgram(client as unknown as ClockifyClient, {
            apiKey: "k",
            workspaceId: "ws-1",
        }).parseAsync(["node", "clk115", "--json", "status"]);
        const running = lastJson().runningEntry as Record<string, unknown>;
        expect(running.id).toBe("te-3");
        expect(running.elapsed).toBe("0s");
    });
```

`vi` is already imported at the top of the file (line 2: `import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";`) — no import change is needed.

### Test to add

Two tests in /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/tests/status.test.ts (full bodies given verbatim in STEP 2 above): (1) "normalizes a data envelope and computes elapsed from start when duration is absent" — mocks `Date.now()` to start+90min and asserts `running.elapsed === "1h30m"`; (2) "falls back to 0s for a running entry with no duration and no parseable start" — empty `timeInterval` asserts `running.elapsed === "0s"`. Run just this file: `npm test -w @apet97/clockify-cli-115 -- tests/status.test.ts` (run from repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk).

### Verify

```bash
Run all from repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:
1. npm run type-check -w @apet97/clockify-cli-115
2. npm test -w @apet97/clockify-cli-115
3. npm run build -w @apet97/clockify-cli-115
4. npm run lint -w @apet97/clockify-cli-115
Focused single-file run during iteration: npm test -w @apet97/clockify-cli-115 -- tests/status.test.ts
```

### Rollback

git checkout -- cli/src/commands/status.ts cli/tests/status.test.ts

---

## Task 8 — [MEDIUM] Add a name-based delete/remove completeness backstop to the MCP write-safety gate so an under-declared delete tool cannot ship false-green

- **Severity:** MEDIUM  •  **Category:** test-gap / write-safety-guard  •  **Task id:** `mws-1`
- **Files:** `scripts/check-mcp-write-safety.mjs`

### Problem

The `make mcp-write-safety` gate (scripts/check-mcp-write-safety.mjs) discovers its destructive tool set EXCLUSIVELY from `destructiveHint === true` (discoverDestructiveTools, lines 505-508). Both completeness loops (the forward loop at lines 412-419 and the converse loop at lines 425-432) iterate only that already-destructive set or the curated `confirmationGuardedDomainTools` list. The name pattern `destructiveNamePattern` (/_(delete|remove)(?![a-z])/, line 376) is only ever applied as a SECONDARY filter INSIDE the already-destructive set (line 414), never as a discovery pass over the full registered tool list. Consequence: a new tool named e.g. `clockify_foo_delete` registered with `annotations: {}` (destructiveHint omitted/false) and no `requireConfirmation` call, and not added to the guarded/exempt lists, ships with NO dry_run->confirm handshake while the gate stays GREEN. The minimum-count floor does not catch it (23 present vs floor 20). No adjacent gate enforces it (check-mcp-agent-ux.mjs and check-mcp-contract.mjs have zero delete/remove name enforcement; mcp/tests/tool-manifest.test.ts only floors the destructive COUNT at 23). This contradicts the gate's own inline guarantees at lines 365-366 and 421-423 that "a new unguarded delete cannot ship silently". The current surface is correct (all 17 delete/remove-named tools have destructiveHint:true and are in confirmationGuardedDomainTools), so the gap is latent/future — exactly the regression class this gate exists to block. Confirmed: the gate currently prints "MCP write-safety contract passed (23 destructive tools checked)."

### Implementation steps

There is ONE file to change: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-mcp-write-safety.mjs

This change needs NO new imports. Every binding it uses (`toolManifest`, `destructiveNamePattern`, `workflowSet`, `guardedSet`, `exemptSet`, `failures`) is already defined and in scope above the insertion point.

STEP 1 — Locate the EXACT current text below in the file. It is the converse loop (which closes at line 432) immediately followed by a blank line and the `confirmGuard` check at line 434. This block appears exactly once:

const destructiveNameSet = new Set(destructiveTools.map((tool) => tool.name));
for (const guardedName of contract.confirmationGuardedDomainTools) {
    if (!destructiveNameSet.has(guardedName)) {
        failures.push(
            `confirmationGuardedDomainTools entry ${guardedName} is not in the manifest destructive set ` +
                "(missing destructiveHint:true) — confirm-guarded tools MUST be destructive",
        );
    }
}

if (!confirmGuard.includes("confirm_token: issued.confirmToken")) {

STEP 2 — Replace that EXACT text with the following text (it keeps the original converse loop and the original `confirmGuard` line unchanged, and inserts the new backstop function, its real invocation, and a self-check in between):

const destructiveNameSet = new Set(destructiveTools.map((tool) => tool.name));
for (const guardedName of contract.confirmationGuardedDomainTools) {
    if (!destructiveNameSet.has(guardedName)) {
        failures.push(
            `confirmationGuardedDomainTools entry ${guardedName} is not in the manifest destructive set ` +
                "(missing destructiveHint:true) — confirm-guarded tools MUST be destructive",
        );
    }
}

// Name-based completeness backstop over the FULL manifest (not just the
// destructiveHint:true set): any tool whose NAME ends in _delete/_remove must
// (a) declare annotations.destructiveHint:true so it surfaces in the structural
// destructive set, and (b) be confirmation-guarded or explicitly exempt (or be a
// workflow write that guards via maybeConfirm). Without this, a delete-named tool
// that under-declares destructiveHint is never tested by the reverse loop above,
// so it could ship with no dry_run->confirm handshake while this gate stays green.
function nameBasedDeleteCoverageFailures(tools) {
    const out = [];
    for (const tool of tools ?? []) {
        if (typeof tool?.name !== "string") continue;
        if (!destructiveNamePattern.test(tool.name)) continue;
        if (workflowSet.has(tool.name)) continue; // workflow writes guard via maybeConfirm
        if (tool.destructiveHint !== true) {
            out.push(
                `delete/remove-named tool ${tool.name} must set annotations.destructiveHint:true ` +
                    "so the write-safety set can see it",
            );
        }
        if (!guardedSet.has(tool.name) && !exemptSet.has(tool.name)) {
            out.push(
                `delete/remove-named tool ${tool.name} is neither in confirmationGuardedDomainTools nor confirmationExemptDestructiveTools`,
            );
        }
    }
    return out;
}
failures.push(...nameBasedDeleteCoverageFailures(toolManifest.tools));

// Regression self-check (mirrors the regex/registration self-checks above): a
// synthetic delete-named tool that under-declares destructiveHint AND is absent
// from every guarded/exempt/workflow set MUST produce exactly two failures. If a
// future edit weakens nameBasedDeleteCoverageFailures, this fails loudly instead
// of silently letting an unguarded delete ship.
const nameCoverageSelfCheck = nameBasedDeleteCoverageFailures([
    { name: "clockify_selfcheck_delete", destructiveHint: false },
]);
if (nameCoverageSelfCheck.length !== 2) {
    failures.push(
        "name-based delete coverage self-check regressed: an unguarded, hint-false `_delete` tool must produce exactly two failures",
    );
}

if (!confirmGuard.includes("confirm_token: issued.confirmToken")) {

STEP 3 — Save the file. No other edits anywhere. Do not touch any other file.

### Test to add

The test is the inline regression self-check added in STEP 2 above (the `nameCoverageSelfCheck` block). This matches this repo's established self-test idiom for this gate — see the existing regex self-check at lines 381-389 and the registration-matcher self-check at lines 394-405, which both push to `failures` from synthetic literals. The new self-check exercises the REAL `nameBasedDeleteCoverageFailures` function against a synthetic under-declared delete tool (`clockify_selfcheck_delete`, destructiveHint:false, absent from every set) and asserts it returns exactly 2 failures. It lives in the same file (/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-mcp-write-safety.mjs) and runs every time the gate runs. There is no separate Vitest/node:test harness for these `.mjs` gate scripts in this repo, so do NOT create a new test file. Run just this test/gate with:

node scripts/check-mcp-write-safety.mjs

Expected output on success (self-check passes, real manifest is clean): "MCP write-safety contract passed (23 destructive tools checked)." Exit code 0.

To manually prove the new backstop actually fires (optional sanity check, REVERT after): temporarily add a poisoned entry to docs/mcp-tool-manifest.json with `{"name":"clockify_poison_delete","destructiveHint":false}` in its `tools` array, run `node scripts/check-mcp-write-safety.mjs`, and confirm it now exits 1 with two failures naming `clockify_poison_delete`; then `git checkout docs/mcp-tool-manifest.json`.

### Verify

```bash
Run from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

1. Focused gate (fastest, manifest already committed):
   node scripts/check-mcp-write-safety.mjs
   Expect: "MCP write-safety contract passed (23 destructive tools checked)." and exit code 0.

2. Full make target (regenerates the manifest first, then runs the checker):
   make mcp-write-safety
   Expect: same "passed (23 destructive tools checked)." line, exit code 0.

3. Lint (perfect-fast runs eslint over scripts; confirm no lint regression):
   npm run lint

All three must pass. No type-check/test workspace command is needed because this file is a standalone Node ESM gate script, not part of the wrapper/cli/mcp TypeScript packages.
```

### Rollback

git checkout scripts/check-mcp-write-safety.mjs

---

## Task 9 — [MEDIUM] Review tools (clockify_review_day / clockify_review_week) advertise gap/overlap detection and accept min_gap_minutes/workday_start/workday_end, but summarizeEntries computes none of it — remove the inert fields and the false capability claims so the contract matches behavior

- **Severity:** MEDIUM  •  **Category:** correctness  •  **Task id:** `mcp-wf-2`
- **Files:** `mcp/src/tools/workflows/review.ts`, `mcp/src/tools/workflows/index.ts`, `mcp/src/tools/workflows/plan.ts`, `mcp/src/resources.ts`, `docs/mcp-tools.json`, `mcp/README.md`, `mcp/tests/workflows.test.ts`

### Problem

summarizeEntries (mcp/src/tools/workflows/resolve.ts:428-462) emits only three issue codes — "missing_description", "missing_project", "running_entry" — and reads only args.max_rows and args.include_entries. It performs NO gap or overlap computation. Yet:

1. reviewInputSchema (mcp/src/tools/workflows/review.ts:16-18) declares three fields — workday_start, workday_end, min_gap_minutes — that NO code ever reads. reviewPeriod (review.ts:24-54) passes args only to dateRange (reads start/end/date/week_start) and summarizeEntries (reads max_rows/include_entries), and builds the SDK request as an explicit object {workspaceId, userId, start, end}. The three fields are accepted by the model-visible JSON Schema and silently dropped. A repo-wide grep confirms the strings min_gap_minutes/workday_start/workday_end appear ONLY at review.ts:16-18.

2. The non-existent gap/overlap capability is advertised in six places: index.ts:190 and index.ts:202 (review tool descriptions say "gaps"), index.ts:51 (tools_guide useFor lists "gaps","overlaps"), plan.ts:90 (plan why-text says "gaps, overlaps"), resources.ts:87 (routing hint "any gaps"), and docs/mcp-tools.json:21 (feeds the generated mcp/README.md:115 table).

Realistic harm: an agent asked "any gaps/overlaps in my day?" selects clockify_review_day because its description and tools_guide promise exactly that, receives only totals + missing-field issues, and can emit a false "no gaps found" on a timekeeping-audit tool; meanwhile min_gap_minutes/workday_start/workday_end are accepted so the agent believes it tuned thresholds that do nothing. Read-only, no mutation/security/crash, hence medium.

Fix direction: make the contract match the actual behavior — delete the three inert schema fields and remove every gap/overlap capability claim. The tool COUNT is unchanged (still 140), so docs-counts is unaffected; only per-tool schema/description text changes. Keep plan.ts:87's intent-routing regex (which contains "gaps") unchanged — it routes a user goal to the review intent and is not a capability claim.

### Implementation steps

Apply all five source edits, add the test, then regenerate the README table. Each edit is an exact verbatim before/after.

=== EDIT 1 — delete the three inert schema fields ===
File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/src/tools/workflows/review.ts
Function: reviewInputSchema (the returned object literal).
Find EXACTLY (4 lines, including the lines immediately above and below for uniqueness):
        end: z.string().optional(),
        workday_start: z.string().optional(),
        workday_end: z.string().optional(),
        min_gap_minutes: z.number().int().min(0).optional(),
        include_entries: z.boolean().optional(),
Replace with EXACTLY:
        end: z.string().optional(),
        include_entries: z.boolean().optional(),

=== EDIT 2 — clockify_review_day description ===
File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/src/tools/workflows/index.ts
Line 190, inside the defineTool(server, "clockify_review_day", ...) config.
Find EXACTLY:
            description: "Review one day of entries for totals, gaps, running timers, and missing details.",
Replace with EXACTLY:
            description: "Review one day of entries for totals, running timers, and missing details.",

=== EDIT 3 — clockify_review_week description ===
File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/src/tools/workflows/index.ts
Line 202, inside the defineTool(server, "clockify_review_week", ...) config.
Find EXACTLY:
            description: "Review a week of entries for totals, gaps, running timers, and missing details.",
Replace with EXACTLY:
            description: "Review a week of entries for totals, running timers, and missing details.",

=== EDIT 4 — tools_guide useFor list ===
File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/src/tools/workflows/index.ts
Line 51, inside the "review" group object of the clockify_tools_guide handler.
Find EXACTLY:
                            useFor: ["daily totals", "weekly totals", "gaps", "overlaps", "missing details"],
Replace with EXACTLY:
                            useFor: ["daily totals", "weekly totals", "running timers", "missing details"],

=== EDIT 5 — plan_change why-text ===
File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/src/tools/workflows/plan.ts
Line 90, inside the "review time" plan steps array. (Do NOT touch line 87's `match: /review|report|summary|audit|totals|gaps/i` — leave it exactly as-is.)
Find EXACTLY:
            { tool: "clockify_review_week", mutates: false, requiresConfirmation: false, why: "Read-only totals, gaps, overlaps, and missing details." },
Replace with EXACTLY:
            { tool: "clockify_review_week", mutates: false, requiresConfirmation: false, why: "Read-only totals, running timers, and missing details." },

=== EDIT 6 — resources.ts routing hint ===
File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/src/resources.ts
Line 87, inside the "Time tracking" section of the tool-routing resource text template literal.
Find EXACTLY:
- "what did I do today / this week", "any gaps" -> clockify_review_day / clockify_review_week
Replace with EXACTLY:
- "what did I do today / this week" -> clockify_review_day / clockify_review_week

=== EDIT 7 — docs/mcp-tools.json review_day purpose ===
File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/docs/mcp-tools.json
Line 21.
Find EXACTLY:
    { "tool": "clockify_review_day", "purpose": "Review daily totals, gaps, running timers, and missing fields." },
Replace with EXACTLY:
    { "tool": "clockify_review_day", "purpose": "Review daily totals, running timers, and missing fields." },

=== EDIT 8 — regenerate the generated README table (do NOT hand-edit mcp/README.md) ===
After Edit 7, run from the repo root:
    make readme-tables
This rewrites mcp/README.md line 115 from
    | `clockify_review_day` | Review daily totals, gaps, running timers, and missing fields. |
to
    | `clockify_review_day` | Review daily totals, running timers, and missing fields. |
Do not edit mcp/README.md by hand; it is generated from docs/mcp-tools.json.

### Test to add

Add ONE test to the existing file /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/workflows.test.ts. It uses the file's existing connect() and fakeContext() helpers, so no new imports are needed.

Insert the new `it(...)` block immediately BEFORE this existing line (currently line 251):
    it("create_work_package creates missing objects and reports change sets plus next actions", async () => {

The exact block to insert (a complete `it`, followed by one blank line):

    it("review tools do not advertise gap/overlap detection or accept inert threshold fields", async () => {
        const client = await connect(fakeContext());
        const tools = (await client.listTools()).tools;
        for (const name of ["clockify_review_day", "clockify_review_week"]) {
            const tool = tools.find((t) => t.name === name);
            expect(tool, `${name} should be registered`).toBeDefined();
            expect(tool?.description ?? "").not.toMatch(/gap|overlap/i);
            const props =
                ((tool?.inputSchema as { properties?: Record<string, unknown> }).properties) ?? {};
            expect(Object.keys(props)).not.toContain("workday_start");
            expect(Object.keys(props)).not.toContain("workday_end");
            expect(Object.keys(props)).not.toContain("min_gap_minutes");
        }
    });

Run just this test file (from repo root):
    npm test -w @apet97/clockify-mcp-115 -- workflows.test.ts
Or equivalently:
    cd mcp && npx vitest run tests/workflows.test.ts

### Verify

```bash
Run from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk, in order, each must exit 0:
1. npm run type-check -w @apet97/clockify-mcp-115
2. npm test -w @apet97/clockify-mcp-115 -- workflows.test.ts
3. make readme-tables           # regenerates mcp/README.md from docs/mcp-tools.json (Edit 8)
4. make readme-tables-drift      # confirms README table is in sync
5. make mcp-agent-ux            # MCP tool UX / description contract gate
6. make docs-drift             # docs consistency gate
Note: tool count is unchanged (140), so make docs-counts is unaffected and need not be re-pinned. If type-check reports stale "clockify-sdk-ts-115/..." member errors, first run `npm run build -w clockify-sdk-ts-115` then re-run step 1 (transient workspace-relink diagnostics, per CLAUDE.md).
```

### Rollback

git checkout -- mcp/src/tools/workflows/review.ts mcp/src/tools/workflows/index.ts mcp/src/tools/workflows/plan.ts mcp/src/resources.ts docs/mcp-tools.json mcp/README.md mcp/tests/workflows.test.ts

---

## Task 10 — [MEDIUM] Gate clockify_demo_cleanup behind the shared dry_run -> confirm_token guard and restrict it to the reserved DEMO-/sdk-demo- prefix

- **Severity:** MEDIUM  •  **Category:** security  •  **Task id:** `mcp-wf-3`
- **Files:** `mcp/src/tools/workflows/demo.ts`, `mcp/src/tools/workflows/index.ts`, `docs/mcp-write-safety-contract.json`, `scripts/check-mcp-write-safety.mjs`, `mcp/tests/workflows.test.ts`

### Problem

The MCP tool `clockify_demo_cleanup` (registered in mcp/src/tools/workflows/index.ts, implemented by `demoCleanup` in mcp/src/tools/workflows/demo.ts) performs an irreversible bulk delete keyed on a caller-supplied `prefix`: it deletes every time entry whose description starts with the prefix, every prefix-matching task and tag, then archive-then-deletes every prefix-matching project and client. Its input schema is `{run_id, prefix, start, end}` with NO `dry_run`/`confirm_token`, and `demoCleanup` calls neither `maybeConfirm` nor `requireConfirmation`, so execution is immediate and unconfirmed (annotations are `destructiveHint:true, idempotentHint:true`). Every other destructive workflow in the same file (the 5 high-risk business writes) and the destructive domain `*_delete` tools for these SAME entity types are confirmation-guarded. Worse, mcp/src/tools/workflows/plan.ts:67 advertises `requiresConfirmation:true` and the official transcript mcp/examples/workflow-transcripts/clean-demo-data.md documents a `dry_run:true` -> `confirm_token` flow that does not exist: the MCP SDK builds `z.object(shape)` which strips unknown keys, so an agent following the documented "dry_run preview" call has `dry_run`/`confirm_token` silently dropped and triggers the irreversible bulk archive+delete immediately. Fix: route `demoCleanup` through the existing shared `maybeConfirm` guard (mirroring the 5 business writes), add `dry_run`/`confirm_token` to its schema, restrict the prefix to the reserved `DEMO-`/`sdk-demo-` namespace as defense-in-depth, and realign the write-safety contract + checker so the gate asserts the guard instead of exempting the tool.

### Implementation steps

Make these five edits exactly. Each gives the verbatim BEFORE text to locate and the exact AFTER replacement.

=== STEP 1 — mcp/src/tools/workflows/demo.ts: add imports ===
The file currently begins (lines 1-9):

BEFORE (locate exactly):
import { wireBody, type ClockifyApi } from "clockify-sdk-ts-115/requests";

import { successResult } from "../../result.js";

import { createWorkPackage, idOf, mergeChanged, ref, str } from "./resolve.js";

AFTER (replace exactly those lines, leaving the rest of the import block untouched):
import { wireBody, type ClockifyApi } from "clockify-sdk-ts-115/requests";

import { errorResult, successResult } from "../../result.js";

import { createWorkPackage, idOf, maybeConfirm, mergeChanged, ref, str } from "./resolve.js";

=== STEP 2 — mcp/src/tools/workflows/demo.ts: replace the whole demoCleanup function ===
Replace the entire current `demoCleanup` function (the block that starts with `export async function demoCleanup(ctx: Context, args: AnyRecord) {` and ends at its closing `}` immediately before `export async function cleanupEntity(`).

BEFORE (the exact current function — locate from this opening line through its final closing brace):
export async function demoCleanup(ctx: Context, args: AnyRecord) {
    const prefix = str(args.prefix) || `DEMO-${str(args.run_id) || "phase1"}`;
    const deleted: EntityRef[] = [];
    const warnings: Warning[] = [];
    // Use the per-server single-flight memo (fetched at most once) when present;
    // fall back to a direct call for hand-built contexts.
    const userId = ctx.currentUserId
        ? await ctx.currentUserId()
        : idOf(await ctx.client.users.getCurrentUser());
    const entries: AnyRecord[] = (await ctx.client.timeEntries.listForUser({
        workspaceId: ctx.workspaceId,
        userId,
        start: str(args.start) || "2026-01-01T00:00:00.000Z",
        end: str(args.end) || "2026-12-31T23:59:59.999Z",
        page: 1,
        "page-size": 200,
    })).map((entry) => ({ ...entry }));
    for (const entry of entries.filter((item) => str(item.description).startsWith(prefix))) {
        await cleanupEntity("entry", entry, deleted, warnings, () =>
            ctx.client.timeEntries.delete({
                workspaceId: ctx.workspaceId,
                timeEntryId: idOf(entry),
            }),
        );
    }

    const projects = prefixMatches(
        await ctx.client.projects.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
        }),
        prefix,
    );
    for (const project of projects) {
        const tasks = prefixMatches(
            await ctx.client.tasks.list({
                workspaceId: ctx.workspaceId,
                projectId: idOf(project),
                page: 1,
                "page-size": 200,
            }),
            prefix,
        );
        for (const task of tasks) {
            await cleanupEntity("task", task, deleted, warnings, () =>
                ctx.client.tasks.delete({
                    workspaceId: ctx.workspaceId,
                    projectId: idOf(project),
                    taskId: idOf(task),
                }),
            );
        }
    }

    const tags = prefixMatches(
        await ctx.client.tags.list({ workspaceId: ctx.workspaceId, page: 1, "page-size": 200 }),
        prefix,
    );
    for (const tag of tags) {
        await cleanupEntity("tag", tag, deleted, warnings, () =>
            ctx.client.tags.delete({ workspaceId: ctx.workspaceId, tagId: idOf(tag) }),
        );
    }

    for (const project of projects) {
        await cleanupEntity("project", project, deleted, warnings, async () => {
            await ctx.client.projects.update({
                workspaceId: ctx.workspaceId,
                projectId: idOf(project),
                name: str(project.name),
                archived: true,
            });
            await ctx.client.projects.delete({
                workspaceId: ctx.workspaceId,
                projectId: idOf(project),
            });
        });
    }

    const clients = prefixMatches(
        await ctx.client.clients.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
        }),
        prefix,
    );
    for (const client of clients) {
        await cleanupEntity("client", client, deleted, warnings, async () => {
            await ctx.client.clients.update(
                wireBody<ClockifyApi.UpdateClientsRequest>({
                    workspaceId: ctx.workspaceId,
                    clientId: idOf(client),
                    body: { name: str(client.name), archived: true },
                }),
            );
            await ctx.client.clients.delete({
                workspaceId: ctx.workspaceId,
                clientId: idOf(client),
            });
        });
    }
    return successResult(
        "clockify_demo_cleanup",
        { prefix, deleted: deleted.length },
        { workspaceId: ctx.workspaceId },
        {
            entity: "demo",
            ids: { workspaceId: ctx.workspaceId },
            changed: { deleted },
            warnings,
        },
    );
}

AFTER (replace the whole BEFORE block with exactly this):
export async function demoCleanup(ctx: Context, args: AnyRecord) {
    const prefix = str(args.prefix) || `DEMO-${str(args.run_id) || "phase1"}`;
    // Defense in depth: this bulk archive+delete is irreversible, so it may only
    // ever touch objects under the reserved demo namespace. An arbitrary prefix
    // cannot mass-delete production data even with a valid confirm_token.
    if (!/^(DEMO-|sdk-demo-)/.test(prefix)) {
        return errorResult(
            "clockify_demo_cleanup",
            new Error("demo cleanup only deletes objects under the reserved DEMO-/sdk-demo- prefix"),
            {
                hint: "Use a DEMO- or sdk-demo- prefix, or delete production objects via the confirm-guarded clockify_*_delete tools.",
            },
        );
    }
    const deleted: EntityRef[] = [];
    const warnings: Warning[] = [];
    // Use the per-server single-flight memo (fetched at most once) when present;
    // fall back to a direct call for hand-built contexts.
    const userId = ctx.currentUserId
        ? await ctx.currentUserId()
        : idOf(await ctx.client.users.getCurrentUser());

    // Phase 1: read-only discovery of everything the cleanup would touch. No
    // mutation happens before the dry_run -> confirm_token handshake below.
    const matchedEntries: AnyRecord[] = (await ctx.client.timeEntries.listForUser({
        workspaceId: ctx.workspaceId,
        userId,
        start: str(args.start) || "2026-01-01T00:00:00.000Z",
        end: str(args.end) || "2026-12-31T23:59:59.999Z",
        page: 1,
        "page-size": 200,
    }))
        .map((entry) => ({ ...entry }))
        .filter((item) => str(item.description).startsWith(prefix));

    const projects = prefixMatches(
        await ctx.client.projects.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
        }),
        prefix,
    );
    const tasksByProject = new Map<string, AnyRecord[]>();
    for (const project of projects) {
        const tasks = prefixMatches(
            await ctx.client.tasks.list({
                workspaceId: ctx.workspaceId,
                projectId: idOf(project),
                page: 1,
                "page-size": 200,
            }),
            prefix,
        );
        tasksByProject.set(idOf(project), tasks);
    }
    const matchedTasks = [...tasksByProject.values()].flat();

    const tags = prefixMatches(
        await ctx.client.tags.list({ workspaceId: ctx.workspaceId, page: 1, "page-size": 200 }),
        prefix,
    );
    const clients = prefixMatches(
        await ctx.client.clients.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
        }),
        prefix,
    );

    // Phase 2: confirmation handshake. dry_run:true returns a preview receipt with
    // a confirm_token and performs NO deletion; a valid confirm_token returns null
    // and we proceed; neither returns an error receipt instructing dry_run first.
    const preview = {
        prefix,
        entries: matchedEntries.length,
        projects: projects.length,
        tasks: matchedTasks.length,
        tags: tags.length,
        clients: clients.length,
    };
    const confirmation = maybeConfirm(ctx, "clockify_demo_cleanup", "demo_cleanup", args, preview);
    if (confirmation) return confirmation;

    // Phase 3: execute the irreversible deletes, continuing through partial failures.
    for (const entry of matchedEntries) {
        await cleanupEntity("entry", entry, deleted, warnings, () =>
            ctx.client.timeEntries.delete({
                workspaceId: ctx.workspaceId,
                timeEntryId: idOf(entry),
            }),
        );
    }

    for (const project of projects) {
        for (const task of tasksByProject.get(idOf(project)) ?? []) {
            await cleanupEntity("task", task, deleted, warnings, () =>
                ctx.client.tasks.delete({
                    workspaceId: ctx.workspaceId,
                    projectId: idOf(project),
                    taskId: idOf(task),
                }),
            );
        }
    }

    for (const tag of tags) {
        await cleanupEntity("tag", tag, deleted, warnings, () =>
            ctx.client.tags.delete({ workspaceId: ctx.workspaceId, tagId: idOf(tag) }),
        );
    }

    for (const project of projects) {
        await cleanupEntity("project", project, deleted, warnings, async () => {
            await ctx.client.projects.update({
                workspaceId: ctx.workspaceId,
                projectId: idOf(project),
                name: str(project.name),
                archived: true,
            });
            await ctx.client.projects.delete({
                workspaceId: ctx.workspaceId,
                projectId: idOf(project),
            });
        });
    }

    for (const client of clients) {
        await cleanupEntity("client", client, deleted, warnings, async () => {
            await ctx.client.clients.update(
                wireBody<ClockifyApi.UpdateClientsRequest>({
                    workspaceId: ctx.workspaceId,
                    clientId: idOf(client),
                    body: { name: str(client.name), archived: true },
                }),
            );
            await ctx.client.clients.delete({
                workspaceId: ctx.workspaceId,
                clientId: idOf(client),
            });
        });
    }
    return successResult(
        "clockify_demo_cleanup",
        { prefix, deleted: deleted.length },
        { workspaceId: ctx.workspaceId },
        {
            entity: "demo",
            ids: { workspaceId: ctx.workspaceId },
            changed: { deleted },
            warnings,
        },
    );
}

=== STEP 3 — mcp/src/tools/workflows/index.ts: add dry_run/confirm_token to the schema ===
In the `clockify_demo_cleanup` registration (the `defineTool(server, "clockify_demo_cleanup", ...)` block):

BEFORE (locate exactly):
            inputSchema: {
                run_id: z.string().optional(),
                prefix: z.string().optional(),
                start: z.string().optional(),
                end: z.string().optional(),
            },
            annotations: { destructiveHint: true, idempotentHint: true },

AFTER:
            inputSchema: {
                run_id: z.string().optional(),
                prefix: z.string().optional(),
                start: z.string().optional(),
                end: z.string().optional(),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true, idempotentHint: true },

(Note: this is the schema that appears immediately after `description: "Delete deterministic demo objects by prefix, continuing through partial failures.",`. The `clockify_demo_seed` schema directly above it has NO `start`/`end` field — do not edit that one.)

=== STEP 4 — docs/mcp-write-safety-contract.json: move the tool into the guarded set and add demo.ts to scanned workflow files ===
Edit 4a — highRiskWorkflowTools:
BEFORE:
  "highRiskWorkflowTools": [
    "clockify_invoice_client_work",
    "clockify_record_expense",
    "clockify_request_time_off",
    "clockify_schedule_work",
    "clockify_setup_webhook"
  ],
AFTER:
  "highRiskWorkflowTools": [
    "clockify_invoice_client_work",
    "clockify_record_expense",
    "clockify_request_time_off",
    "clockify_schedule_work",
    "clockify_setup_webhook",
    "clockify_demo_cleanup"
  ],

Edit 4b — idempotentWorkflowTools:
BEFORE:
  "idempotentWorkflowTools": [
    "clockify_demo_seed",
    "clockify_demo_cleanup"
  ],
AFTER:
  "idempotentWorkflowTools": [
    "clockify_demo_seed"
  ],

Edit 4c — _destructiveSupersetNote (replace the whole string value verbatim):
BEFORE:
  "_destructiveSupersetNote": "The manifest (docs/mcp-tool-manifest.json) reports 23 destructiveHint:true tools; this contract guards 17 (confirmationGuardedDomainTools). The 23 is a superset: 17 confirmation-guarded domain delete/remove tools + 5 highRiskWorkflowTools (clockify_invoice_client_work, clockify_record_expense, clockify_request_time_off, clockify_schedule_work, clockify_setup_webhook), which use the same shared guard via maybeConfirm rather than the domain confirmationGuardedDomainTools list + 1 idempotentWorkflowTool (clockify_demo_cleanup). scripts/check-mcp-write-safety.mjs enforces both directions: every destructive _delete/_remove domain tool is guarded-or-exempt, and every confirmationGuardedDomainTools entry is in the manifest destructive set. Update this note if the counts change.",
AFTER:
  "_destructiveSupersetNote": "The manifest (docs/mcp-tool-manifest.json) reports 23 destructiveHint:true tools; this contract guards 17 (confirmationGuardedDomainTools). The 23 is a superset: 17 confirmation-guarded domain delete/remove tools + 6 highRiskWorkflowTools (clockify_invoice_client_work, clockify_record_expense, clockify_request_time_off, clockify_schedule_work, clockify_setup_webhook, clockify_demo_cleanup), which use the same shared guard via maybeConfirm rather than the domain confirmationGuardedDomainTools list. scripts/check-mcp-write-safety.mjs enforces both directions: every destructive _delete/_remove domain tool is guarded-or-exempt, and every confirmationGuardedDomainTools entry is in the manifest destructive set. Update this note if the counts change.",

Edit 4d — wiring.workflowFiles (the checker scans this list for the maybeConfirm call; demo.ts must be added or the highRiskWorkflowTools loop will not find clockify_demo_cleanup's maybeConfirm):
BEFORE:
    "workflowFiles": [
      "mcp/src/tools/workflows/index.ts",
      "mcp/src/tools/workflows/business.ts",
      "mcp/src/tools/workflows/resolve.ts"
    ],
AFTER:
    "workflowFiles": [
      "mcp/src/tools/workflows/index.ts",
      "mcp/src/tools/workflows/business.ts",
      "mcp/src/tools/workflows/resolve.ts",
      "mcp/src/tools/workflows/demo.ts"
    ],

=== STEP 5 — scripts/check-mcp-write-safety.mjs: drop the now-dead demo-cleanup special-case ===
BEFORE (locate exactly):
    if (contract.idempotentWorkflowTools.includes(tool.name)) {
        if (!tool.registration.includes("idempotentHint: true")) {
            failures.push(`${tool.name} is idempotent workflow but lacks idempotentHint: true`);
        }
        if (!tool.body.includes("clockify_demo_cleanup")) {
            failures.push(`${tool.name} does not point to demo cleanup`);
        }
        continue;
    }
AFTER:
    if (contract.idempotentWorkflowTools.includes(tool.name)) {
        if (!tool.registration.includes("idempotentHint: true")) {
            failures.push(`${tool.name} is idempotent workflow but lacks idempotentHint: true`);
        }
        continue;
    }

### Test to add

Replace the existing demo_cleanup test in mcp/tests/workflows.test.ts (the single `it(...)` block titled "demo_cleanup deletes deterministic entries and objects after archiving active parents", currently lines 643-716, beginning `it("demo_cleanup deletes deterministic entries and objects after archiving active parents", async () => {` and ending at its closing `});`) with the two tests below verbatim. This file already defines `fakeContext`, `connect`, and `parse` (used by the surrounding tests) — do not add imports.

    it("demo_cleanup requires dry_run confirmation, then deletes after archiving active parents", async () => {
        const ctx = fakeContext({
            clients: [
                { id: "c-demo", name: "DEMO-clean-client" },
                { id: "c-other", name: "Other" },
            ],
            projects: [
                { id: "p-demo", name: "DEMO-clean-project", clientId: "c-demo" },
                { id: "p-other", name: "Other", clientId: "c-other" },
            ],
            tasks: [
                { id: "ta-demo", name: "DEMO-clean-task", projectId: "p-demo" },
                { id: "ta-other", name: "Other", projectId: "p-other" },
            ],
            tags: [
                { id: "tg-demo", name: "DEMO-clean-tag" },
                { id: "tg-other", name: "Other" },
            ],
            entries: [
                { id: "e-demo", description: "DEMO-clean-entry" },
                { id: "e-other", description: "Other" },
            ],
        });
        const client = await connect(ctx);

        // dry_run:true issues a preview + confirm_token and performs NO deletion.
        const previewRes = await client.callTool({
            name: "clockify_demo_cleanup",
            arguments: { prefix: "DEMO-clean", dry_run: true },
        });
        expect(previewRes.isError).toBeFalsy();
        const preview = parse(previewRes);
        expect(preview.ok).toBe(true);
        expect((preview.data as { preview: Record<string, unknown> }).preview).toEqual({
            prefix: "DEMO-clean",
            entries: 1,
            projects: 1,
            tasks: 1,
            tags: 1,
            clients: 1,
        });
        const confirmToken = (preview.data as { confirm_token: string }).confirm_token;
        expect(typeof confirmToken).toBe("string");
        expect(ctx.state.cleanupRequests).toEqual([]);
        expect(ctx.state.clients).toHaveLength(2);
        expect(ctx.state.entries).toHaveLength(2);

        // A bare call (neither dry_run nor confirm_token) is refused with no deletion.
        const refused = await client.callTool({
            name: "clockify_demo_cleanup",
            arguments: { prefix: "DEMO-clean" },
        });
        expect(refused.isError).toBe(true);
        expect(parse(refused).ok).toBe(false);
        expect(ctx.state.cleanupRequests).toEqual([]);

        // The confirm_token executes the archive-then-delete cleanup.
        const res = await client.callTool({
            name: "clockify_demo_cleanup",
            arguments: { prefix: "DEMO-clean", confirm_token: confirmToken },
        });
        expect(res.isError).toBeFalsy();
        expect(parse(res)).toMatchObject({
            ok: true,
            data: { prefix: "DEMO-clean", deleted: 5 },
            changed: {
                deleted: expect.arrayContaining([
                    { type: "entry", id: "e-demo", name: "DEMO-clean-entry" },
                    { type: "task", id: "ta-demo", name: "DEMO-clean-task" },
                    { type: "tag", id: "tg-demo", name: "DEMO-clean-tag" },
                    { type: "project", id: "p-demo", name: "DEMO-clean-project" },
                    { type: "client", id: "c-demo", name: "DEMO-clean-client" },
                ]),
            },
        });
        expect(ctx.state.cleanupRequests).toEqual(
            expect.arrayContaining([
                { type: "entry.delete", body: expect.objectContaining({ timeEntryId: "e-demo" }) },
                { type: "task.delete", body: expect.objectContaining({ taskId: "ta-demo" }) },
                { type: "tag.delete", body: expect.objectContaining({ tagId: "tg-demo" }) },
                {
                    type: "project.update",
                    body: expect.objectContaining({
                        projectId: "p-demo",
                        name: "DEMO-clean-project",
                        archived: true,
                    }),
                },
                { type: "project.delete", body: expect.objectContaining({ projectId: "p-demo" }) },
                {
                    type: "client.update",
                    body: expect.objectContaining({
                        clientId: "c-demo",
                        body: { name: "DEMO-clean-client", archived: true },
                    }),
                },
                { type: "client.delete", body: expect.objectContaining({ clientId: "c-demo" }) },
            ]),
        );
        expect(ctx.state.clients).toEqual([{ id: "c-other", name: "Other" }]);
        expect(ctx.state.projects).toEqual([{ id: "p-other", name: "Other", clientId: "c-other" }]);
        expect(ctx.state.tasks).toEqual([{ id: "ta-other", name: "Other", projectId: "p-other" }]);
        expect(ctx.state.tags).toEqual([{ id: "tg-other", name: "Other" }]);
        expect(ctx.state.entries).toEqual([{ id: "e-other", description: "Other" }]);
    });

    it("demo_cleanup refuses a non-demo prefix before any delete", async () => {
        const ctx = fakeContext({
            clients: [{ id: "c-prod", name: "Acme-client" }],
        });
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_demo_cleanup",
            arguments: { prefix: "Acme", dry_run: true },
        });
        expect(res.isError).toBe(true);
        expect((parse(res).error as { message: string }).message).toMatch(/reserved DEMO-/);
        expect(ctx.state.cleanupRequests).toEqual([]);
        expect(ctx.state.clients).toEqual([{ id: "c-prod", name: "Acme-client" }]);
    });

Run just these tests (from the repo root):
  npm test -w @apet97/clockify-mcp-115 -- tests/workflows.test.ts -t "demo_cleanup"

### Verify

```bash
Run from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk, in this order (the wrapper must be built first so the MCP type-check resolves wrapper types):

npm run build -w clockify-sdk-ts-115
npm run type-check -w @apet97/clockify-mcp-115
npm test -w @apet97/clockify-mcp-115 -- tests/workflows.test.ts -t "demo_cleanup"
npm test -w @apet97/clockify-mcp-115
npm run lint -w @apet97/clockify-mcp-115
make mcp-write-safety

Then one solo full deterministic proof (run alone, no other heavy processes):
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast

Expected: type-check clean; the two new demo_cleanup tests pass; full mcp suite green; eslint clean; `make mcp-write-safety` prints "MCP write-safety contract passed (... destructive tools checked)."; perfect-fast green. Total tool count stays 140, so docs-counts/mcp-agent-ux are unaffected; docs/mcp-tool-manifest.json is unchanged because annotations are untouched.
```

### Rollback

git checkout -- mcp/src/tools/workflows/demo.ts mcp/src/tools/workflows/index.ts docs/mcp-write-safety-contract.json scripts/check-mcp-write-safety.mjs mcp/tests/workflows.test.ts

---

## Task 11 — [MEDIUM] Fix clockify_time_off_policies_archive to send the required {status} wire field instead of {archived}

- **Severity:** MEDIUM  •  **Category:** correctness / wire-contract bug  •  **Task id:** `mcp-write2-1`
- **Files:** `mcp/src/tools/timeOff.ts`, `mcp/tests/time-off-policies.test.ts`, `spec/evidence/discrepancies.md`

### Problem

The MCP tool `clockify_time_off_policies_archive` (mcp/src/tools/timeOff.ts) calls `timeOffPolicies.updateStatus({ ..., body: { archived: args.archived } } as never)`. The generated `updateStatus` method is PATCH `/workspaces/{workspaceId}/time-off/policies/{policyId}` with `core.bodyFromRequest(request, ["status"])`, which forwards `source.body` verbatim — so the literal wire body becomes `{ archived: <bool> }`. The canonical Clockify contract (`changeTimeOffPolicyStatus` in spec/corrected/clockify.corrected.openapi.yaml, schema `PolicyStatusChangeRequest`, `required: [status]`) requires a single `status: "ACTIVE"|"ARCHIVED"|"ALL"` field. `archived` is only a 200 RESPONSE field on the Policy object, never a request field. The tool therefore omits the REQUIRED `status` field, so the archive/reactivate never takes effect on the wire, yet the tool still returns a `writeReceipt("updated", ...)` success. The `as never` cast exists solely to defeat the generated request type, which correctly types the body envelope arm as `body: { status: "ACTIVE"|"ARCHIVED"|"ALL" }`.

### Proof (independent opus-max verifier)

```
Mechanical path verified end-to-end against the actual files:

1. mcp/src/tools/timeOff.ts:598-604 — `clockify_time_off_policies_archive` calls `ctx.client.timeOffPolicies.updateStatus({ workspaceId, policyId, body: { archived: args.archived } } as never)`. The `inputSchema` is `{ policyId, archived: z.boolean() }`; `args.archived` is passed straight into `body.archived` with no mapping to `status`.

2. Generated method wrapper/src/api/resources/timeOffPolicies/client/Client.ts:110-126 — `updateStatus` is PATCH `/workspaces/{workspaceId}/time-off/policies/{policyId}` with `body: core.bodyFromRequest(request, ["status"])`.

3. wrapper/src/core/request.ts:224-227 — `bodyFromRequest(source, keys)`: since `keys` (`["status"]`) does not include "body" and the source HAS a `body` key, it returns `source.body` VERBATIM. So the literal wire body is `{ archived: <bool> }` with NO `status` field. The finding's mechanical claim is exactly right.

4. The generated request type (wrapper/src/api/resources/timeOffPolicies/client/requests/UpdateStatusTimeOffPoliciesRequest.ts) has ONLY `status: "ACTIVE"|"ARCHIVED"|"ALL"` in both the flattened and body-envelope arms — no `archived` field. The `as never` exists solely to defeat that type.

5. Canonical contract = `{status}`, required. spec/corrected/clockify.corrected.openapi.yaml: op `changeTimeOffPolicyStatus` (10337) requestBody example `{status: ACTIVE}` (10358), schema PolicyStatusChangeRequest (19447) has property `status` only with `required: [status]` (19457-19458). `archived` appears ONLY as a 200 RESPONSE field on the Policy object (response example line 10375) — the likely source of the confusion. The sibling canonical source GOCLMCP/docs/openapi/sources/clockify-api-probe-lab/POLICIESDOC.md:768-775 captures the official doc: "Change a policy status … Request Body schema: status required … Provide the status you would like to use," and lists `archived` only under the 200 Response Schema (815-818).

6. No probe evidence for the `{archived}` divergence anywhere: the SDK repo's spec/evidence/probes/ dir contains only a README; GOCLMCP/docs/openapi/sources/clockify-api-probe-lab/findings/time-off.md records the PATCH 200 ("live probe 2026-06-22, Leftovers:0") but does NOT record a request body and never mentions `archived` as a request field — the successful live probe that earned `live-success` would have used GOCLMCP
…[truncated]
```

### Implementation steps

STEP 1 — Fix the tool body and drop the `as never` cast.

File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/src/tools/timeOff.ts
Anchor: the handler of `defineTool(server, "clockify_time_off_policies_archive", ...)` (around lines 598-604).

EXACT current code to locate (verbatim):

            const updated = await ctx.client.timeOffPolicies.updateStatus({
                workspaceId: ctx.workspaceId,
                policyId: args.policyId,
                body: { archived: args.archived },
                // KEEP as never: policy archive uses live archived body despite generated status naming.
            } as never);

EXACT replacement code:

            const updated = await ctx.client.timeOffPolicies.updateStatus({
                workspaceId: ctx.workspaceId,
                policyId: args.policyId,
                body: { status: args.archived ? "ARCHIVED" : "ACTIVE" },
            });

(Do NOT change the surrounding `defineTool`, `inputSchema`, or the `successResult(...)`/`writeReceipt(...)` call. No new imports are needed.)

STEP 2 — Add an `updateStatus` mock to the shared test fixture so the new test can capture the wire body.

File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/time-off-policies.test.ts
Anchor: the `timeOffPolicies` object inside `policiesContext`, specifically its `create` mock (around lines 46-50).

EXACT current code to locate (verbatim):

                create: async (req: unknown) => {
                    captured.create = req;
                    return { id: "pol-9" };
                },
            },

EXACT replacement code:

                create: async (req: unknown) => {
                    captured.create = req;
                    return { id: "pol-9" };
                },
                updateStatus: async (req: unknown) => {
                    captured.updateStatus = req;
                    return { id: "pol-1", archived: true };
                },
            },

STEP 3 — Append the new test block at the end of the same test file (after the closing `});` of the `clockify_time_off_policies_create` describe block, which is the last block in the file).

File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/time-off-policies.test.ts
Anchor: the final lines of the file (verbatim):

    it("sends status ACTIVE on create scope, not ALL", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(policiesContext(captured));
        await client.callTool({
            name: "clockify_time_off_policies_create",
            arguments: { name: "Sick", userIds: ["u1"], userGroupIds: ["g1"] },
        });
        const create = captured.create as Record<string, unknown>;
        expect((create.users as { status: string }).status).toBe("ACTIVE");
        expect((create.userGroups as { status: string }).status).toBe("ACTIVE");
    });
});

EXACT replacement code (re-states the located block unchanged, then appends the new describe block):

    it("sends status ACTIVE on create scope, not ALL", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(policiesContext(captured));
        await client.callTool({
            name: "clockify_time_off_policies_create",
            arguments: { name: "Sick", userIds: ["u1"], userGroupIds: ["g1"] },
        });
        const create = captured.create as Record<string, unknown>;
        expect((create.users as { status: string }).status).toBe("ACTIVE");
        expect((create.userGroups as { status: string }).status).toBe("ACTIVE");
    });
});

describe("clockify_time_off_policies_archive — maps the boolean to the wire {status} field", () => {
    it("sends status ARCHIVED (not archived) when archived is true", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(policiesContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_policies_archive",
            arguments: { policyId: "pol-1", archived: true },
        });
        expect(res.isError).toBeFalsy();
        const sent = captured.updateStatus as {
            workspaceId: string;
            policyId: string;
            body: Record<string, unknown>;
        };
        expect(sent.workspaceId).toBe("ws-1");
        expect(sent.policyId).toBe("pol-1");
        expect(sent.body).toEqual({ status: "ARCHIVED" });
        expect(sent.body.archived).toBeUndefined();
    });

    it("sends status ACTIVE when archived is false", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(policiesContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_policies_archive",
            arguments: { policyId: "pol-1", archived: false },
        });
        expect(res.isError).toBeFalsy();
        const sent = captured.updateStatus as { body: Record<string, unknown> };
        expect(sent.body).toEqual({ status: "ACTIVE" });
    });
});

STEP 4 — Remove the now-inaccurate passing mention in the discrepancies log.

File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/evidence/discrepancies.md
Anchor: the "Still KEEP as never" bullet (around lines 2676-2680).

EXACT current code to locate (verbatim):

    status PATCH body (`invoices.ts`), the `changeTimeOffRequestStatus` status/note
    mismatch and the policy-archive `archived` body vs generated status naming
    (`timeOff.ts`), and the `timeEntries.listForUser` list/search/view

EXACT replacement code:

    status PATCH body (`invoices.ts`), the `changeTimeOffRequestStatus` status/note
    mismatch (`timeOff.ts`), and the `timeEntries.listForUser` list/search/view

### Test to add

Two new `it` cases inside a new describe block `clockify_time_off_policies_archive — maps the boolean to the wire {status} field`, appended to /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/time-off-policies.test.ts (full code given verbatim in STEP 3), plus the `updateStatus` mock added to the shared `policiesContext` fixture (STEP 2). The tests assert: (1) `archived: true` produces wire body exactly `{ status: "ARCHIVED" }` with no `archived` key; (2) `archived: false` produces wire body exactly `{ status: "ACTIVE" }`; and that `workspaceId`/`policyId` are forwarded. Run just this test file from the repo root: npm test -w @apet97/clockify-mcp-115 -- tests/time-off-policies.test.ts

### Verify

```bash
From the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk run, in order:
1. npm run type-check -w @apet97/clockify-mcp-115   (must pass; confirms removing `as never` still type-checks against the generated body-envelope arm)
2. npm test -w @apet97/clockify-mcp-115 -- tests/time-off-policies.test.ts   (the focused new test)
3. npm test -w @apet97/clockify-mcp-115   (full MCP suite, no regressions)
4. npm run lint -w @apet97/clockify-mcp-115   (eslint; the focused gates do not run lint)
5. npm run build -w @apet97/clockify-mcp-115   (tsc build)
Note: wrapper/src/** is generated and gitignored; if type-check cannot resolve clockify-sdk-ts-115 types on a fresh clone, first run `make sdk-codegen` and `npm run build -w clockify-sdk-ts-115` from the repo root, then re-run step 1.
```

### Rollback

git checkout -- mcp/src/tools/timeOff.ts mcp/tests/time-off-policies.test.ts spec/evidence/discrepancies.md

---

## Task 12 — [MEDIUM] Replace whole-file substring wiring check with per-target-line scan in check-release-readiness.mjs

- **Severity:** MEDIUM  •  **Category:** false-green  •  **Task id:** `release-readiness-wiring-false-green`
- **Files:** `scripts/check-release-readiness.mjs`, `scripts/check-release-readiness.wiring.test.mjs`

### Problem

The `make release-readiness` gate's check that the `release-readiness` prerequisite is wired into the `perfect-fast` and `perfect-full` aggregate proof targets is a whole-file substring test. In `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-release-readiness.mjs` lines 306-308:

```js
if (!makefile.includes("perfect-fast:") || !makefile.includes("release-readiness")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing release-readiness");
}
```

`makefile.includes("release-readiness")` is satisfied by the string appearing ANYWHERE in the Makefile. `grep -n "release-readiness" Makefile` shows it occurs at line 1 (`.PHONY`), line 74 (help text), line 457 (the `release-readiness:` target definition), and line 458 (its recipe `node scripts/check-release-readiness.mjs`) — all independent of the aggregate prerequisite lists. So if `release-readiness` were dropped from the `perfect-fast` prerequisites (Makefile line 134) and the `perfect-full` prerequisites (Makefile line 146), this guard STILL passes via lines 1/74/457/458, and the aggregate proofs could silently stop running the gate with no failure. The guard also only checks for a `perfect-fast:` line and never confirms a `perfect-full:` line exists, despite the failure message naming both. Same-directory sibling gates guard their own wiring correctly with a per-prerequisite-line scan this one lacks (`scripts/check-env-contract.mjs` lines 171-177; `scripts/check-agent-handoff.mjs` lines 171-173). `contract.wiring.makeTarget` is already validated to equal `"release-readiness"` (same file, lines 175-177) and is in scope at line 306. This is a non-shipped self-verification harness file (not generated; not under spec/corrected/output/wrapper-src), so editing it is in scope.

### Proof (independent opus-max verifier)

```
check-release-readiness.mjs:306-308 is a whole-file substring test: if (!makefile.includes("perfect-fast:") || !makefile.includes("release-readiness")) { fail("Makefile", "perfect-fast/perfect-full wiring missing release-readiness"); }. grep -n "release-readiness" Makefile shows the substring occurs independently of the aggregate prerequisite lists: line 1 (.PHONY), line 74 (help text), line 457 (the release-readiness: target definition itself), and line 458 (node scripts/check-release-readiness.mjs). So if release-readiness were dropped from the perfect-fast prereqs (Makefile:134) and perfect-full prereqs (Makefile:146), makefile.includes("release-readiness") is STILL true via lines 1/74/457/458 and the gate passes — the proof aggregates could silently stop running release-readiness with no failure. The guard also only tests perfect-fast: and never confirms a perfect-full: line exists, despite the failure message naming both aggregates. Same-directory sibling gates guard their own wiring correctly with a per-prerequisite-line scan this one lacks: check-env-contract.mjs:172-177 and check-agent-handoff.mjs:171-173 find the line starting with the aggregate target name and assert contract.wiring.makeTarget appears within that line, for both perfect-fast and perfect-full.
```

### Implementation steps

STEP 1 — Fix the guard in /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-release-readiness.mjs

Locate this EXACT current code (lines 306-308):

```js
if (!makefile.includes("perfect-fast:") || !makefile.includes("release-readiness")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing release-readiness");
}
```

Replace it with EXACTLY this code:

```js
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.includes(contract.wiring.makeTarget)) {
        fail("Makefile", `${aggregateTarget} wiring missing ${contract.wiring.makeTarget}`);
    }
}
```

No import changes are required: `makefile` is already assigned (line 239), `contract` is in module scope (line 10), and `contract.wiring.makeTarget` is already validated to equal "release-readiness" (lines 175-177). This change (a) requires both a `perfect-fast:` and a `perfect-full:` prerequisite line to exist — the `?? ""` empty-string fallback makes `.includes(...)` return false and fail when a line is absent — and (b) requires `release-readiness` to appear WITHIN each aggregate prerequisite line, not anywhere in the file. Makefile lines 134 and 146 carry all prerequisites on one physical line each, so `line.startsWith("perfect-fast:")` / `line.startsWith("perfect-full:")` match those lines and `.includes("release-readiness")` finds the wired prerequisite.

STEP 2 — Add the regression test file at /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-release-readiness.wiring.test.mjs with EXACTLY this content:

```js
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Reproduces the per-target-line wiring scan used by check-release-readiness.mjs.
function aggregateLineMissing(makefile, aggregateTarget, makeTarget) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    return !targetLine.includes(makeTarget);
}

test("perfect-fast and perfect-full prerequisite lines wire release-readiness", () => {
    const makefile = readFileSync(path.join(root, "Makefile"), "utf8");
    for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
        assert.equal(
            aggregateLineMissing(makefile, aggregateTarget, "release-readiness"),
            false,
            `${aggregateTarget} prerequisite line must include release-readiness`,
        );
    }
});

test("dropping release-readiness from an aggregate prerequisite line is detected", () => {
    const synthetic = [
        "perfect-fast: foo bar",
        "perfect-full: foo release-readiness baz",
        "release-readiness:",
        "\tnode scripts/check-release-readiness.mjs",
    ].join("\n");
    assert.equal(aggregateLineMissing(synthetic, "perfect-fast", "release-readiness"), true);
    assert.equal(aggregateLineMissing(synthetic, "perfect-full", "release-readiness"), false);
});

test("check-release-readiness.mjs uses the per-target-line wiring scan, not a whole-file substring", () => {
    const source = readFileSync(path.join(root, "scripts", "check-release-readiness.mjs"), "utf8");
    assert.match(source, /for \(const aggregateTarget of \["perfect-fast", "perfect-full"\]\)/);
    assert.ok(
        !source.includes('!makefile.includes("perfect-fast:") || !makefile.includes("release-readiness")'),
        "the weak whole-file substring guard must be removed",
    );
});
```

### Test to add

Add /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-release-readiness.wiring.test.mjs with the exact content given in STEP 2. It contains three node:test cases: (1) the real Makefile's `perfect-fast:` and `perfect-full:` prerequisite lines each include `release-readiness`; (2) a synthetic Makefile that drops `release-readiness` from the `perfect-fast` line (but keeps the `release-readiness:` target definition) is correctly detected as missing on `perfect-fast` and present on `perfect-full` — this locks the exact regression the weak substring guard let through; (3) the source of check-release-readiness.mjs contains the per-target-line scan loop and no longer contains the old weak substring guard. Run it with: node --test scripts/check-release-readiness.wiring.test.mjs (run from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk). Expected: all three tests pass (exit code 0).

### Verify

```bash
Run all three from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:
1. node --test scripts/check-release-readiness.wiring.test.mjs   # the new regression test, expect exit 0 / "pass 3"
2. node scripts/check-release-readiness.mjs                       # the gate itself, expect exit 0 and no output to stderr
3. make release-readiness                                         # the make gate wrapping the checker, expect exit 0
Negative control (optional, proves the fix bites — DO NOT commit the temporary edit): temporarily delete the `release-readiness` token from Makefile line 134 (the `perfect-fast:` prerequisite line) and rerun `node scripts/check-release-readiness.mjs`; it must now exit 1 with "Makefile: perfect-fast wiring missing release-readiness". Restore the Makefile with `git checkout Makefile` afterward.
```

### Rollback

git checkout scripts/check-release-readiness.mjs && rm -f scripts/check-release-readiness.wiring.test.mjs

---

## Task 13 — [MEDIUM] Close the missing-annotation blind spot in the MCP write-safety gate: a delete/remove-named tool that forgets destructiveHint:true silently escapes the unguarded-delete enforcement

- **Severity:** MEDIUM  •  **Category:** security-gate-hardening  •  **Task id:** `mcp-write-safety-manifest-gated-discovery`
- **Files:** `scripts/check-mcp-write-safety.mjs`, `mcp/tests/write-safety-missing-annotation.test.ts`

### Problem

In scripts/check-mcp-write-safety.mjs, discoverDestructiveTools() (lines 505-528) builds the destructive tool set ONLY from manifest tools with `destructiveHint === true`. Every downstream safety check — the count floor (line 329), the per-tool semantics loop (lines 335-363), and the unguarded-delete enforcement loop (lines 412-419) — iterates that hint-gated set. A NEW MCP tool whose name ends in `_delete`/`_remove` but which is registered WITHOUT the `destructiveHint: true` annotation lands in the manifest with `destructiveHint: false`, never enters the destructive set, and is therefore never forced into the guarded-or-exempt decision. The comment on lines 365-366 ("a new unguarded delete cannot ship silently") is defeated. Reproduced directly: injecting a synthetic `{name:"clockify_demo_delete", destructiveHint:false}` into docs/mcp-tool-manifest.json and running the real checker still exits 0 ("23 destructive tools checked"). The single annotation gates BOTH the client-facing advertisement AND the server-side confirm-guard requirement, so forgetting it once removes both layers with all gates green. Latent today (all 17 delete/remove-named tools are correctly annotated) but a genuine blind spot in the repo's most safety-critical gate. Fix: add a name-vs-annotation coverage assertion that reads the structural manifest (which already lists EVERY registered tool with its real annotation) and fails if any delete/remove-named, non-workflow domain tool is not marked destructiveHint:true.

### Implementation steps

STEP 1 — Add an env-overridable manifest path so the test can point the checker at a doctored copy without mutating the shared on-disk manifest (race-safe under vitest's parallel workers). The override stays repo-relative so it still passes the script's safeRelativePath() guard; when the env var is unset, production behavior is byte-identical.

File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-mcp-write-safety.mjs

BEFORE (lines 12-15, verbatim):
```js
const toolManifest = await readJson(
    contract.wiring?.toolManifest ?? "docs/mcp-tool-manifest.json",
    "toolManifest",
);
```

AFTER:
```js
const toolManifest = await readJson(
    process.env.MCP_WRITE_SAFETY_MANIFEST ?? contract.wiring?.toolManifest ?? "docs/mcp-tool-manifest.json",
    "toolManifest",
);
```

STEP 2 — Add the name-vs-annotation coverage loop immediately AFTER the existing unguarded-delete enforcement loop (after line 419) and BEFORE the blank line + "Converse of the loop above" comment block (line 421). At this point `toolManifest`, `destructiveNamePattern`, and `workflowSet` are all in scope.

File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-mcp-write-safety.mjs

BEFORE (lines 412-423, verbatim — anchor on the closing brace of the existing loop and the comment that follows):
```js
for (const tool of destructiveTools) {
    if (workflowSet.has(tool.name)) continue; // workflow writes use maybeConfirm separately
    if (!destructiveNamePattern.test(tool.name)) continue; // only delete/remove domain tools
    if (guardedSet.has(tool.name) || exemptSet.has(tool.name)) continue;
    failures.push(
        `destructive domain tool ${tool.name} is neither in confirmationGuardedDomainTools nor confirmationExemptDestructiveTools`,
    );
}

// Converse of the loop above: each confirm-guarded domain tool must still be
// present in the structural destructive set. This catches a guarded tool losing
// destructiveHint:true, while the reverse check catches new unguarded deletes.
```

AFTER:
```js
for (const tool of destructiveTools) {
    if (workflowSet.has(tool.name)) continue; // workflow writes use maybeConfirm separately
    if (!destructiveNamePattern.test(tool.name)) continue; // only delete/remove domain tools
    if (guardedSet.has(tool.name) || exemptSet.has(tool.name)) continue;
    failures.push(
        `destructive domain tool ${tool.name} is neither in confirmationGuardedDomainTools nor confirmationExemptDestructiveTools`,
    );
}

// Close the missing-annotation gap: discovery above keys off destructiveHint:true,
// but a NEW _delete/_remove tool that simply forgot that annotation never enters
// `destructiveTools` and silently escapes the loop above. The structural manifest
// lists EVERY registered tool with its real annotation, so assert here that every
// delete/remove-NAMED domain tool is actually marked destructive (which then forces
// it through the guarded-or-exempt enforcement above).
for (const tool of toolManifest.tools ?? []) {
    if (!tool || typeof tool.name !== "string") continue;
    if (!destructiveNamePattern.test(tool.name)) continue;
    if (workflowSet.has(tool.name)) continue; // workflow writes guard via maybeConfirm
    if (tool.destructiveHint !== true) {
        failures.push(
            `tool ${tool.name} advertises delete/remove semantics in its name but is not annotated ` +
                "destructiveHint:true, so it never enters the destructive set and escapes the " +
                "unguarded-delete guard — add the annotation and list it in confirmationGuardedDomainTools " +
                "or confirmationExemptDestructiveTools",
        );
    }
}

// Converse of the loop above: each confirm-guarded domain tool must still be
// present in the structural destructive set. This catches a guarded tool losing
// destructiveHint:true, while the reverse check catches new unguarded deletes.
```

STEP 3 — Create the regression test. It writes a doctored COPY of the real manifest (the real tools plus one synthetic delete-named tool with destructiveHint:false) to a repo-relative temp file, runs the REAL checker against it via the new env override, asserts a non-zero exit naming the synthetic tool, then proves a clean copy still passes. The temp file is removed in finally.

Create new file: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/write-safety-missing-annotation.test.ts

Full file content (verbatim):
```ts
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const realManifestPath = path.resolve(repoRoot, "docs", "mcp-tool-manifest.json");

// Repo-relative so the checker's safeRelativePath() guard accepts it; unique name
// so it never collides with a parallel vitest worker.
const tmpRel = path.join("mcp", "tests", ".tmp-write-safety-manifest.json");
const tmpAbs = path.resolve(repoRoot, tmpRel);

function runChecker(): { code: number; stderr: string; stdout: string } {
    try {
        const stdout = execFileSync("node", ["scripts/check-mcp-write-safety.mjs"], {
            cwd: repoRoot,
            encoding: "utf8",
            env: { ...process.env, MCP_WRITE_SAFETY_MANIFEST: tmpRel },
        });
        return { code: 0, stdout, stderr: "" };
    } catch (error) {
        const e = error as { status?: number; stdout?: string; stderr?: string };
        return { code: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
    }
}

describe("mcp write-safety: missing destructiveHint on a delete-named tool", () => {
    const manifest = JSON.parse(readFileSync(realManifestPath, "utf8")) as {
        tools: Array<Record<string, unknown>>;
        [key: string]: unknown;
    };

    it("fails when a _delete-named tool is not annotated destructiveHint:true", () => {
        const doctored = {
            ...manifest,
            tools: [
                ...manifest.tools,
                {
                    name: "clockify_synthetic_delete",
                    title: "Synthetic unguarded delete",
                    group: "domain",
                    annotations: {
                        readOnlyHint: false,
                        destructiveHint: false,
                        idempotentHint: false,
                    },
                    destructiveHint: false,
                },
            ],
        };
        writeFileSync(tmpAbs, JSON.stringify(doctored, null, 2));
        try {
            const result = runChecker();
            expect(result.code).not.toBe(0);
            expect(result.stderr).toContain("clockify_synthetic_delete");
            expect(result.stderr).toContain("destructiveHint:true");
        } finally {
            rmSync(tmpAbs, { force: true });
        }
    });

    it("passes for an unmodified manifest copy (no false positive)", () => {
        writeFileSync(tmpAbs, JSON.stringify(manifest, null, 2));
        try {
            const result = runChecker();
            expect(result.code).toBe(0);
            expect(result.stdout).toContain("destructive tools checked");
        } finally {
            rmSync(tmpAbs, { force: true });
        }
    });
});
```

### Test to add

New test file /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/write-safety-missing-annotation.test.ts (full content in STEP 3). It reproduces the finding's executed proof: doctoring the manifest with a delete-named tool that has destructiveHint:false now reds the real checker (was previously a false green), while a clean copy still passes. Run just this test from the repo root: npm test -w @apet97/clockify-mcp-115 -- tests/write-safety-missing-annotation.test.ts

### Verify

```bash
Run all from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk :
1. node scripts/check-mcp-write-safety.mjs    # must exit 0 and print "MCP write-safety contract passed (23 destructive tools checked)." — proves no false positive on the real surface
2. npm test -w @apet97/clockify-mcp-115 -- tests/write-safety-missing-annotation.test.ts    # both new tests pass
3. make mcp-write-safety    # regenerates the manifest then runs the checker; must be green
```

### Rollback

git checkout -- scripts/check-mcp-write-safety.mjs && rm -f mcp/tests/write-safety-missing-annotation.test.ts mcp/tests/.tmp-write-safety-manifest.json

---

## Task 14 — [MEDIUM] Make the generated-edit guard actually detect hand-edits to the two gitignored trees (wrapper/src, output/ts-sdk)

- **Severity:** MEDIUM  •  **Category:** false-green  •  **Task id:** `sb4-1`
- **Files:** `scripts/check-no-generated-edits.mjs`, `scripts/check-no-generated-edits.test.mjs`

### Problem

scripts/check-no-generated-edits.mjs is the gate wired as `make generated-edit-check` and advertised (docs/generated-edit-contract.json, contract-inventory, agent-handoff, enterprise-hardening audit) as enforcing that three prefixes only change through the GOCLMCP -> codegen -> wrapper-sync chain: spec/corrected/ (tracked), output/ts-sdk/ (gitignored), wrapper/src/ (gitignored). It detects edits ONLY via `git diff --name-only` (+ `--cached`). Both output/ts-sdk/ and wrapper/src/ are gitignored with zero tracked files (`git check-ignore output/ts-sdk` -> output/ts-sdk; `git ls-files output/ts-sdk` -> 0; same for wrapper/src), so `git diff` can never list a file under them. The guard is therefore a no-op for two of its three guarded prefixes. Decisive repro: append a line to the existing generated file output/ts-sdk/BaseClient.ts, run `node scripts/check-no-generated-edits.mjs` -> it prints "no guarded generated/snapshot edits detected" and exits 0. No other gate backstops the gap: perfect-fast has no sdk-codegen/sdk-codegen-drift (a wrapper/src hand-edit survives into wrapper/dist and the run goes green); perfect-full lists `sdk-codegen` BEFORE `sdk-codegen-drift`, so codegen overwrites the tree first and the drift check then sees a clean tree (a hand-edit is silently clobbered, never flagged). Secondary defect: `gitNames` returns [] when `git` fails (`result.status !== 0`), so any git error yields zero blocked and the guard exits 0 (catch-and-pass false green).

### Proof (independent opus-max verifier)

```
Independently reproduced. (1) Both prefixes are gitignored with zero tracked files: `git check-ignore wrapper/src` -> `wrapper/src`; `git check-ignore output/ts-sdk` -> `output/ts-sdk`; `git ls-files wrapper/src`=0, `output/ts-sdk`=0, `spec/corrected`=1. .gitignore carries `/output/ts-sdk/` explicitly. (2) git diff provably cannot see them: a throwaway `output/ts-sdk/__verifier_probe__.ts` was absent from `git diff --name-only`, `git status --porcelain <file>` was empty, and `git add` (no -f) refused it as ignored. (3) DECISIVE: I appended a line to the EXISTING generated file output/ts-sdk/BaseClient.ts and ran `node scripts/check-no-generated-edits.mjs` -> it printed `no guarded generated/snapshot edits detected` and exited 0 (then restored byte-identical). The script reads: `const changed = new Set([...gitNames(["diff","--name-only"]), ...gitNames(["diff","--name-only","--cached"])])` (lines 148-151) and `const blocked = [...changed].filter((file) => guardedPrefixes.some((prefix) => file.startsWith(prefix)))` (line 153). Since neither ignored prefix is ever emitted by git diff, `blocked` can only ever contain spec/corrected/ paths (the one tracked prefix). (4) No backstop covers the gap: perfect-fast (Makefile:134) has NO sdk-codegen/sdk-codegen-drift, so a wrapper/src hand-edit survives, is built into wrapper/dist by wrapper-gates, and the run goes green; perfect-full (Makefile:146) lists `sdk-codegen` BEFORE `sdk-codegen-drift`, so sdk-codegen regenerates/overwrites both trees first and the drift check then sees a clean tree -> a hand-edit is silently clobbered, never flagged. grep found NO wrapper/src sync-drift check anywhere (only skip-if-absent guards in check-schema-quality.mjs and check-doc-correctness-anchor.mjs). (5) docs/generated-edit-contract.json guardedPrefixes = [spec/corrected/, output/ts-sdk/, wrapper/src/] and lines 97-101 of the script REQUIRE all three be present; the guard is wired as `make generated-edit-check` and cited in contract-inventory.json, agent-handoff-contract.json, enterprise-hardening-audit.json — i.e. advertised as enforcing all three. (6) Secondary catch-and-pass confirmed by read: gitNames returns [] when `result.status !== 0` (lines 142-145), so any git failure yields zero blocked and the guard exits 0. All cited line numbers match the file verbatim.
```

### Implementation steps

STEP 1 — Open /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-no-generated-edits.mjs and replace the ENTIRE tail of the file (the `gitNames` function through the final `console.log`, currently lines 142-164).

EXACT CURRENT CODE TO LOCATE (verbatim, replace all of it):
```js
function gitNames(args) {
    const result = spawnSync("git", args, { encoding: "utf8" });
    if (result.status !== 0) return [];
    return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

const changed = new Set([
    ...gitNames(["diff", "--name-only"]),
    ...gitNames(["diff", "--name-only", "--cached"]),
]);

const blocked = [...changed].filter((file) => guardedPrefixes.some((prefix) => file.startsWith(prefix)));

if (blocked.length > 0) {
    console.error("Generated or snapshot surfaces changed:");
    for (const file of blocked.sort()) console.error(`  - ${file}`);
    console.error("");
    console.error(contract.regenerationGuidance);
    console.error(`If this is a deliberate generated-chain diff, rerun via make perfect-full and set ${contract.bypassEnv}=1 only for this guard.`);
    process.exit(1);
}

console.log("no guarded generated/snapshot edits detected");
```

EXACT REPLACEMENT CODE (paste verbatim; uses only the already-imported fs, path, spawnSync, and the already-defined `root`, `guardedPrefixes`, `contract`):
```js
function gitNames(args) {
    const result = spawnSync("git", args, { encoding: "utf8", cwd: root });
    if (result.error || result.status !== 0) {
        console.error(`generated edit guard: \`git ${args.join(" ")}\` failed (status ${result.status ?? "n/a"})`);
        if (result.stderr) console.error(String(result.stderr).trim());
        process.exit(1);
    }
    return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

function isIgnoredPrefix(prefix) {
    const result = spawnSync("git", ["check-ignore", "-q", prefix.replace(/\/+$/, "")], { cwd: root });
    return result.status === 0;
}

const WRAPPER_SYNC_EXCLUDES = new Set([
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "tsconfig.json",
    "codegen-receipt.json",
    ".npmignore",
    ".gitignore",
]);

function isSyncExcluded(relativeFile) {
    const base = relativeFile.split("/").pop();
    return WRAPPER_SYNC_EXCLUDES.has(base) || /^tsconfig\..*\.json$/.test(base);
}

function listTreeFiles(dir) {
    const files = [];
    const walk = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory()) walk(absolute);
            else if (entry.isFile()) files.push(path.relative(dir, absolute).split(path.sep).join("/"));
        }
    };
    walk(dir);
    return files;
}

function compareSyncTree(sourceDir, syncedDir) {
    const drift = [];
    const expected = listTreeFiles(sourceDir).filter((file) => !isSyncExcluded(file)).sort();
    const actual = new Set(listTreeFiles(syncedDir));
    const expectedSet = new Set(expected);
    for (const file of expected) {
        if (!actual.has(file)) {
            drift.push(`missing ${file}`);
            continue;
        }
        const sourceText = fs.readFileSync(path.join(sourceDir, file), "utf8");
        const syncedText = fs.readFileSync(path.join(syncedDir, file), "utf8");
        if (sourceText !== syncedText) drift.push(`changed ${file}`);
    }
    for (const file of actual) {
        if (!expectedSet.has(file)) drift.push(`extra ${file}`);
    }
    return drift;
}

const trackedPrefixes = guardedPrefixes.filter((prefix) => !isIgnoredPrefix(prefix));
const ignoredPrefixes = new Set(guardedPrefixes.filter((prefix) => isIgnoredPrefix(prefix)));

const changed = new Set([
    ...gitNames(["diff", "--name-only"]),
    ...gitNames(["diff", "--name-only", "--cached"]),
]);

const blocked = [...changed].filter((file) => trackedPrefixes.some((prefix) => file.startsWith(prefix)));

const tamperEdits = [];

// output/ts-sdk/ is gitignored, so `git diff` can never list it. Detect a
// hand-edit by regenerating into a temp dir and diffing against the working
// tree (same machinery as `make sdk-codegen-drift`). Skip-if-absent so a fresh
// clone before `make sdk-codegen` still passes.
if (ignoredPrefixes.has("output/ts-sdk/") && fs.existsSync(path.join(root, "output", "ts-sdk"))) {
    const check = spawnSync("node", ["scripts/generate-sdk-from-openapi.mjs", "--check"], {
        cwd: root,
        encoding: "utf8",
    });
    if (check.status !== 0) {
        tamperEdits.push("output/ts-sdk/ diverges from a fresh codegen (hand-edit or stale snapshot):");
        const detail = `${check.stdout ?? ""}${check.stderr ?? ""}`.trim();
        if (detail) tamperEdits.push(detail);
    }
}

// wrapper/src/ is gitignored too. It must be a verbatim copy of output/ts-sdk/
// (minus package metadata). Detect a hand-edit by comparing the two trees.
if (ignoredPrefixes.has("wrapper/src/")
    && fs.existsSync(path.join(root, "wrapper", "src"))
    && fs.existsSync(path.join(root, "output", "ts-sdk"))) {
    const drift = compareSyncTree(path.join(root, "output", "ts-sdk"), path.join(root, "wrapper", "src"));
    if (drift.length > 0) {
        tamperEdits.push("wrapper/src/ diverges from output/ts-sdk/ (hand-edit — re-run `cd wrapper && npm run sync`):");
        for (const entry of drift.slice(0, 50)) tamperEdits.push(`  - ${entry}`);
    }
}

if (blocked.length > 0 || tamperEdits.length > 0) {
    console.error("Generated or snapshot surfaces changed:");
    for (const file of blocked.sort()) console.error(`  - ${file}`);
    for (const line of tamperEdits) console.error(line);
    console.error("");
    console.error(contract.regenerationGuidance);
    console.error(`If this is a deliberate generated-chain diff, rerun via make perfect-full and set ${contract.bypassEnv}=1 only for this guard.`);
    process.exit(1);
}

console.log("no guarded generated/snapshot edits detected");
```

STEP 2 — Do NOT touch the Makefile. The guard is already wired as `make generated-edit-check` and is already the FIRST prerequisite in both `perfect-fast` (Makefile line 134) and `perfect-full` (Makefile line 146), and in `perfect-full` it already runs before `sdk-codegen` (offset 15 vs 179 on that line). GNU make runs prerequisites serially left-to-right, so the new ignored-tree checks already run before `sdk-codegen` can clobber a hand-edit. No wiring change is required.

STEP 3 — Do NOT touch docs/generated-edit-contract.json. Its `guardedPrefixes` already lists all three prefixes and the script still reads them from there; the script-shape assertions (lines 74-133) are unchanged by this edit.

### Test to add

Create a NEW file at /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-no-generated-edits.test.mjs with EXACTLY this content (node:test harness, matching the existing scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs pattern):
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guard = path.join(root, "scripts", "check-no-generated-edits.mjs");
const PROBE = "\n// __generated_edit_guard_probe__\n";

function runGuard() {
    return spawnSync("node", [guard], { cwd: root, encoding: "utf8" });
}

function pickTsFile(dir) {
    const stack = [dir];
    while (stack.length > 0) {
        const current = stack.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory()) stack.push(absolute);
            else if (entry.isFile() && absolute.endsWith(".ts")) return absolute;
        }
    }
    return undefined;
}

test("clean generated trees pass the guard", () => {
    if (!fs.existsSync(path.join(root, "output", "ts-sdk"))) return; // skip-if-absent (fresh clone before `make sdk-codegen`)
    const result = runGuard();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /no guarded generated\/snapshot edits detected/);
});

test("a hand-edit to gitignored output/ts-sdk is flagged", () => {
    const outDir = path.join(root, "output", "ts-sdk");
    if (!fs.existsSync(outDir)) return; // skip-if-absent
    const target = pickTsFile(outDir);
    assert.ok(target, "expected at least one generated .ts file");
    const original = fs.readFileSync(target);
    try {
        fs.appendFileSync(target, PROBE);
        const result = runGuard();
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stderr, /Generated or snapshot surfaces changed:/);
    } finally {
        fs.writeFileSync(target, original);
    }
});

test("a hand-edit to gitignored wrapper/src is flagged", () => {
    const srcDir = path.join(root, "wrapper", "src");
    if (!fs.existsSync(srcDir) || !fs.existsSync(path.join(root, "output", "ts-sdk"))) return; // skip-if-absent
    const target = pickTsFile(srcDir);
    assert.ok(target, "expected at least one synced .ts file");
    const original = fs.readFileSync(target);
    try {
        fs.appendFileSync(target, PROBE);
        const result = runGuard();
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stderr, /Generated or snapshot surfaces changed:/);
    } finally {
        fs.writeFileSync(target, original);
    }
});
```
Run ONLY this test with (from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk):
```
make sdk-codegen && node --test scripts/check-no-generated-edits.test.mjs
```
`make sdk-codegen` is required first so output/ts-sdk/ and wrapper/src/ exist; otherwise all three subtests no-op (skip-if-absent) and prove nothing. Expected: 3 passing tests.

### Verify

```bash
Run all of these from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk, in order, each must exit 0:
1. `make sdk-codegen`  (populates output/ts-sdk/ and wrapper/src/ — precondition for the guard to have anything to check)
2. `node --test scripts/check-no-generated-edits.test.mjs`  (the new test; expect 3 pass, 0 fail)
3. `make generated-edit-check`  (the gate itself on a clean tree; expect stdout "no guarded generated/snapshot edits detected" and exit 0)
4. Manual decisive confirmation that the guard now catches the previously-missed case (expect a NON-zero exit and "Generated or snapshot surfaces changed:" on stderr, then it self-restores): `f=$(find output/ts-sdk -name '*.ts' | head -1); cp "$f" "$f.bak"; printf '\n// probe\n' >> "$f"; node scripts/check-no-generated-edits.mjs; echo "exit=$?"; mv "$f.bak" "$f"`  (expect `exit=1`)
```

### Rollback

git checkout -- scripts/check-no-generated-edits.mjs && rm -f scripts/check-no-generated-edits.test.mjs

---

## Task 15 — [MEDIUM] MCP envelope classifies a real 402 ClockifyApiError as catch-all "error" instead of feature_unavailable

- **Severity:** MEDIUM  •  **Category:** correctness / error-classification  •  **Task id:** `deep-errors-1`
- **Files:** `mcp/src/result.ts`, `mcp/tests/audit.test.ts`, `mcp/tests/diagnose.test.ts`

### Problem

In production the generated Clockify client throws a real `ClockifyApiError` (statusCode 402) for a feature-gated endpoint. The MCP error envelope derives its stable code via `errorCodeForError` in `mcp/src/result.ts`, which calls `classifyClockifyError(err)?.code` FIRST. For a real `ClockifyApiError(402)` the SDK classifier returns its catch-all `"error"` (because `feature_unavailable`/402 is the only status-bearing error-code entry without the `sdk` surface, so the SDK-surface status map returns undefined and the classifier falls through to its message matcher = `"error"`). Because `"error"` is non-undefined, the `?? errorCodeForStatus(402)` arm — the only thing that yields `feature_unavailable` — is dead. So the MCP returns `code:"error"` for a real 402, while the CLI (`cli/src/output.ts`, which uses `errorCodeForStatus` first) correctly returns `feature_unavailable`. The dedicated 402 hint in `mcp/src/diagnose.ts` is unreachable for real errors. Two tests are false-greens: `mcp/tests/audit.test.ts` (the "feature-gated 402" case) and `mcp/tests/diagnose.test.ts` both throw a PLAIN `Error`+`statusCode` (via `Object.assign(new Error(m),{statusCode})`), which is NOT a `ClockifyApiError`, so `classifyClockifyError` returns undefined and the test takes the `errorCodeForStatus` fallback — the OPPOSITE path from production — and passes regardless of the bug. Empirically confirmed: for `new ConflictError({statusCode:402,...})` (a real ClockifyApiError; 402 is not in the subclass-promotion table so it classifies identically to the base error) `errorCodeForError()` returns `"error"` today; `errorCodeForStatus(402)` returns `"feature_unavailable"`. The base `ClockifyApiError` class is NOT publicly exported (verified: `clockify-sdk-ts-115/errors` exposes `ConflictError` but `ClockifyApiError` is undefined), so the test must use a public subclass instance to reproduce the production shape.

### Implementation steps

STEP 1 — Fix the classifier precedence in mcp/src/result.ts.

File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/src/result.ts

Find this EXACT current function body (lines ~169-177):

    export function errorCodeForError(err: unknown): ClockifyErrorCode {
        const message = err instanceof Error ? err.message : String(err);
        const status = (err as { statusCode?: number }).statusCode;
        return (
            classifyClockifyError(err)?.code ??
            errorCodeForStatus(status) ??
            errorCodeForMessage(message)
        );
    }

Replace it with EXACTLY:

    export function errorCodeForError(err: unknown): ClockifyErrorCode {
        const message = err instanceof Error ? err.message : String(err);
        const status = (err as { statusCode?: number }).statusCode;
        // The SDK classifier's catch-all "error" is a non-answer here: it means the
        // classifier recognized a ClockifyApiError but had no specific code for it.
        // The clearest case is a real 402, whose feature_unavailable code is
        // cli/mcp-only and therefore invisible to the SDK-surface status map the
        // classifier consults — so the classifier falls through to "error". Treat
        // that "error" as undefined so the unfiltered HTTP-status map can supply the
        // cross-surface code (402 -> feature_unavailable) before the message matcher.
        // Cause-aware codes (connection_error/aborted) are non-"error", so they still
        // win first. Blast radius is exactly 402: it is the only status-bearing
        // error-code entry lacking the "sdk" surface, so for every other "error"-
        // classified ClockifyApiError errorCodeForStatus(status) stays undefined and
        // the message matcher reproduces the prior "error" result unchanged.
        const classified = classifyClockifyError(err)?.code;
        return (
            (classified !== undefined && classified !== "error" ? classified : undefined) ??
            errorCodeForStatus(status) ??
            errorCodeForMessage(message)
        );
    }

STEP 2 — De-mask the audit 402 test so it exercises the production path.

File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/audit.test.ts

2a. Find this EXACT current import block (lines 1-6):

    import { Client } from "@modelcontextprotocol/sdk/client/index.js";
    import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
    import { afterEach, describe, expect, it } from "vitest";

    import type { Context } from "../src/client.js";
    import { buildServer } from "../src/server.js";

Replace it with EXACTLY (adds the `ConflictError` import in correct alphabetical import-order position):

    import { Client } from "@modelcontextprotocol/sdk/client/index.js";
    import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
    import { ConflictError } from "clockify-sdk-ts-115/errors";
    import { afterEach, describe, expect, it } from "vitest";

    import type { Context } from "../src/client.js";
    import { buildServer } from "../src/server.js";

2b. Find this EXACT current block inside the "surfaces a feature-gated 402 ..." test (lines ~122-129):

            const client = await connect(
                auditContext(captured, async () => {
                    calls += 1;
                    throw Object.assign(new Error("This feature is not available on your plan"), {
                        statusCode: 402,
                    });
                }),
            );

Replace it with EXACTLY:

            const client = await connect(
                auditContext(captured, async () => {
                    calls += 1;
                    // Reproduce the PRODUCTION error shape: the generated client throws a
                    // real ClockifyApiError (not a plain Error) for a 402. A plain
                    // Error+statusCode would skip the SDK classifier and take the
                    // HTTP-status fallback in errorCodeForError -- the OPPOSITE path from
                    // production, masking the bug. 402 is not in the subclass-promotion
                    // table, so a ConflictError carrying statusCode 402 classifies
                    // identically to the base ClockifyApiError(402) the runtime throws.
                    throw new ConflictError({
                        statusCode: 402,
                        body: { message: "This feature is not available on your plan" },
                    });
                }),
            );

2c. Find this EXACT current assertion line (line ~143):

            expect(error.message).toBe("This feature is not available on your plan");

Replace it with EXACTLY (a real ClockifyApiError message is the multi-line "Status code: 402\nBody: {...}" form, which contains the plan text in its Body line):

            expect(error.message).toContain("This feature is not available on your plan");

STEP 3 — De-mask the diagnose tests so every status case drives a real ClockifyApiError.

File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/diagnose.test.ts

3a. Find this EXACT current import line (line 1):

    import { ClockifyConnectionError } from "clockify-sdk-ts-115/errors";

Replace it with EXACTLY:

    import { ClockifyConnectionError, ConflictError } from "clockify-sdk-ts-115/errors";

3b. Find this EXACT current helper line (line 6):

    const http = (status: number, message = "x") => Object.assign(new Error(message), { statusCode: status });

Replace it with EXACTLY:

    // Build a REAL ClockifyApiError (the production shape) rather than a plain
    // Error+statusCode. A plain Error skips the SDK classifier and takes the
    // HTTP-status fallback in errorCodeForError -- the opposite path from production,
    // which masks the 402 -> feature_unavailable regression. 402 is not in the
    // subclass-promotion table, so a ConflictError carrying an arbitrary statusCode
    // classifies exactly as the base ClockifyApiError(status) the runtime throws.
    const http = (status: number, message = "x") => new ConflictError({ statusCode: status, message });

No other lines in diagnose.test.ts change; the existing `failureCode(http(402))` and `failureHint(http(...))` assertions now run against real ClockifyApiError instances and remain correct for every status because 402 is the only status-bearing code lacking the `sdk` surface (verified: 400/401/403/404/409/429/500/502/503/504 all resolve via the classifier's status map).

### Test to add

No new test file is created; two existing false-green tests are converted to exercise the production path (a real `ClockifyApiError`), which now genuinely depends on the Step 1 fix.

PRIMARY behavioral test (mcp/tests/audit.test.ts, "surfaces a feature-gated 402 verbatim as feature_unavailable" — after Step 2 edits the relevant body reads):

    it("surfaces a feature-gated 402 verbatim as feature_unavailable, without calling through twice", async () => {
        const captured: Record<string, unknown> = {};
        let calls = 0;
        const client = await connect(
            auditContext(captured, async () => {
                calls += 1;
                throw new ConflictError({
                    statusCode: 402,
                    body: { message: "This feature is not available on your plan" },
                });
            }),
        );
        const res = await client.callTool({
            name: "clockify_audit_log_search",
            arguments: {
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                actions: ["CREATE_PROJECT"],
            },
        });
        expect(res.isError).toBe(true);
        expect(calls).toBe(1);
        const json = envelope(res);
        const error = json.error as { code: string; message: string };
        expect(error.code).toBe("feature_unavailable");
        expect(error.message).toContain("This feature is not available on your plan");
        expect((json.recovery as { retryable?: boolean }).retryable).toBe(false);
    });

This `error.code === "feature_unavailable"` assertion FAILS without the Step 1 fix (today it would be "error") and PASSES with it.

Run just these two test files:

    npm test -w @apet97/clockify-mcp-115 -- audit.test.ts diagnose.test.ts

(run from repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk).

### Verify

```bash
Run all from repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

1. npm run type-check -w @apet97/clockify-mcp-115
2. npm test -w @apet97/clockify-mcp-115 -- audit.test.ts diagnose.test.ts
3. npm test -w @apet97/clockify-mcp-115
4. npm run lint -w @apet97/clockify-mcp-115
5. npm run build -w @apet97/clockify-mcp-115

Final deterministic full proof (run SOLO, no other heavy commands concurrently — the perf-budget sub-gate is load-flaky):

6. CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast

All must exit 0. Tests 1-5 are the focused inner loop; test 4 (lint) is required because the focused type-check/test/build do NOT run eslint.
```

### Rollback

git checkout -- mcp/src/result.ts mcp/tests/audit.test.ts mcp/tests/diagnose.test.ts

---

## Task 16 — [LOW] composedFetch: stop firing onRetry + retry.count for cancelled/timed-out (AbortError) requests

- **Severity:** LOW  •  **Category:** error-handling  •  **Task id:** `wt-1`
- **Files:** `wrapper/composed-fetch.ts`, `wrapper/tests/composed-fetch.test.ts`

### Problem

In `wrapper/composed-fetch.ts`, the `runWithRetries` error branch has only ONE terminal short-circuit — `if (error instanceof RedirectNotAllowedError) throw error;` (line 486). There is no guard for an aborted/cancelled request. When the in-flight `fetch` rejects with an `AbortError` (a caller `controller.abort()` or a per-request timeout signal) on a retryable method while `attempt < policy.maxRetries`, the loop unconditionally fires the `onRetry` hook (lines 491-496) and emits the `retry.count` metric (line 497), THEN calls `await sleep(delayMs, init.signal)`. Because `sleep()` immediately rejects when `signal.aborted` (line 583), the announced retry NEVER happens — the next attempt is never issued. Result: a phantom `onRetry` callback and a spurious `retry.count` metric sample on every cancellation/timeout. This contradicts the same package's generated layer (`wrapper/src/core/request.ts:179`), which treats raw `AbortError` as non-retryable. `onError`/error metrics firing first is correct and must stay; only `onRetry`/`retry.count` must be suppressed.

### Proof (independent opus-max verifier)

```
Verified against real source + live unit-test repro (no curl needed; this is offline transport behavior).

CODE READ — wrapper/composed-fetch.ts runWithRetries error branch (lines 479-500): the only terminal short-circuit is `if (error instanceof RedirectNotAllowedError) throw error;` (486). There is NO AbortError/aborted guard before the retryable check (487-489). On a retryable method with attempt<maxRetries it unconditionally fires `onRetry` (491-496) and `emitRetryMetric(...,"network_error")` -> retry.count (497), THEN `await sleep(delayMs, init.signal)` (498). sleep() (581-583) does `if (signal.aborted) return Promise.reject(abortReason(signal));`, so when the in-flight fetch was aborted, sleep rejects immediately and the loop never re-issues — the "retry" announced by onRetry/retry.count provably never happens.

LIVE REPRO (vitest, real exported composedFetch): retryPolicy {maxRetries:2, initialDelayMs:0, jitter:0}; fetch impl rejects with DOMException AbortError when the signal aborts; GET; controller.abort() at 5ms (mid-flight). Measured: onError calls = 1 (appropriate), onRetry calls = 1 (SPURIOUS), retry.count metric samples = 1 (SPURIOUS); the onRetry cause was {error: AbortError}. All assertions passed -> bug reproduces deterministically.

SENSITIVITY CHECK: temporarily inserting the proposed guard flipped the abort assertion to fail (`expected +0 to be 1` — onRetry dropped to 0) while a control test (normal 503 on the same policy) still retried once -> the spurious firing is specific to the abort path and the fix does not regress normal retries.

CROSS-LAYER INCONSISTENCY (wrapper/src/core/request.ts): line 179 `if (cause instanceof DOMException && cause.name === "AbortError") return false;` and line 178 treats its own ClockifyApiTimeoutError as retryable — the generated layer deliberately excludes raw aborts from retries, a convention composedFetch violates. fetchWithTimeout (line 155) passes the timeout-combined `controller.signal` into the wrapped fetch, so a per-request timeout surfaces as a thrown abort inside composedFetch's loop (the shared-signal claim). Existing coverage (wrapper/tests/composed-fetch.test.ts:453-478) only aborts during backoff, never an abort thrown by the fetch itself — gap confirmed.
```

### Implementation steps

STEP 1 — Edit `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/composed-fetch.ts`.

Locate this EXACT block inside the `if (error != null) {` branch of `runWithRetries` (the RedirectNotAllowedError line immediately followed by the maxRetries check):

```ts
            if (error instanceof RedirectNotAllowedError) throw error;
            if (attempt >= policy.maxRetries || !policy.retryableMethods.includes(base.method)) {
```

Replace it with EXACTLY (insert the new abort guard between the two existing lines; leave everything else unchanged):

```ts
            if (error instanceof RedirectNotAllowedError) throw error;
            // A cancelled/timed-out request is terminal, not a transient
            // transport error: never fire onRetry / retry.count for it (onError
            // already fired). Mirrors the generated layer's shouldRetryError,
            // which returns false for AbortError. The init.signal?.aborted clause
            // is the workhorse — it also catches custom abort reasons that
            // surface as a non-DOMException Error (e.g. controller.abort(new Error())).
            if (
                (typeof DOMException !== "undefined" &&
                    error instanceof DOMException &&
                    error.name === "AbortError") ||
                init.signal?.aborted
            ) {
                throw toError(error);
            }
            if (attempt >= policy.maxRetries || !policy.retryableMethods.includes(base.method)) {
```

No new imports are required: `toError` is defined in the same file (line 531) and `DOMException`/`init` are already in scope.

STEP 2 — Edit `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/composed-fetch.test.ts`.

Locate this EXACT closing block (the end of the existing "abort during retry backoff" describe, lines 478-479):

```ts
    });
});

describe("composedFetch — default retry policy (no override of the internals)", () => {
```

Replace it with EXACTLY (this inserts a new describe block between the two existing describes):

```ts
    });
});

describe("composedFetch — abort thrown by fetch itself (not during backoff)", () => {
    it("does not fire onRetry or retry.count when the in-flight fetch rejects with AbortError", async () => {
        const controller = new AbortController();
        const onError = vi.fn();
        const onRetry = vi.fn();
        const metricNames: string[] = [];
        const f = composedFetch({
            // The wrapped fetch rejects with a DOMException AbortError as soon as
            // the request is issued, simulating a cancellation/timeout mid-flight.
            fetch: (async () => {
                controller.abort();
                throw new DOMException("aborted", "AbortError");
            }) as typeof fetch,
            retryPolicy: { maxRetries: 2, initialDelayMs: 0, jitter: 0 },
            hooks: {
                onError,
                onRetry,
                onMetric: (metric) => {
                    metricNames.push(metric.name);
                },
            },
        });

        await expect(
            f("https://example.test/x", { method: "GET", signal: controller.signal }),
        ).rejects.toThrow(/abort/i);

        // onError is appropriate (the request failed); onRetry / retry.count are not
        // (the request was cancelled, no further attempt was ever issued).
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onRetry).not.toHaveBeenCalled();
        expect(metricNames).not.toContain("retry.count");
    });
});

describe("composedFetch — default retry policy (no override of the internals)", () => {
```

### Test to add

New describe block `composedFetch — abort thrown by fetch itself (not during backoff)` added to `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/composed-fetch.test.ts` (full code in STEP 2 above). It builds a `composedFetch` whose wrapped `fetch` calls `controller.abort()` and throws a `DOMException("aborted", "AbortError")` under a retryable GET with `retryPolicy: { maxRetries: 2, initialDelayMs: 0, jitter: 0 }`, and asserts: the returned promise rejects with an abort error, `onError` was called exactly once, `onRetry` was NOT called, and the collected `onMetric` names do NOT contain `retry.count`. Run just this test from the repo root with:

  npm test -w clockify-sdk-ts-115 -- tests/composed-fetch.test.ts -t "abort thrown by fetch itself"

### Verify

```bash
Run all from the repo root `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk`:

1. Type-check the wrapper:
   npm run type-check -w clockify-sdk-ts-115

2. Run the focused new test (must pass):
   npm test -w clockify-sdk-ts-115 -- tests/composed-fetch.test.ts -t "abort thrown by fetch itself"

3. Run the whole composed-fetch suite to confirm no regression (the existing "abort during retry backoff" and "default retry policy" tests must still pass):
   npm test -w clockify-sdk-ts-115 -- tests/composed-fetch.test.ts

4. Build the wrapper (consumers resolve types from dist):
   npm run build -w clockify-sdk-ts-115

All four must exit 0.
```

### Rollback

git checkout -- wrapper/composed-fetch.ts wrapper/tests/composed-fetch.test.ts

---

## Task 17 — [LOW] Fix parseRateLimitResetAt returning a year-2000 Date for Retry-After: 0

- **Severity:** LOW  •  **Category:** bug  •  **Task id:** `wrapper-errors-2`
- **Files:** `wrapper/errors.ts`, `wrapper/tests/errors.test.ts`

### Problem

In wrapper/errors.ts, the function parseRateLimitResetAt (lines 530-549) mishandles the HTTP header `Retry-After: 0`. For headers `{Retry-After: "0"}` with no `X-RateLimit-Reset` header present:
- Line 541: `const seconds = Number.parseInt("0", 10)` evaluates to 0.
- Line 542: the guard `Number.isFinite(seconds) && seconds > 0` evaluates to `true && (0 > 0)` = `true && false` = false, so the correct `new Date(Date.now() + 0)` (now) branch at line 543 is skipped.
- Line 545: `const date = new Date("0")` parses to a year-2000-era Date (`new Date("0").toISOString()` === "1999-12-31T23:00:00.000Z", getTime() === 946681200000).
- Line 546: `Number.isFinite(date.getTime())` is true, so this bogus past Date is returned.

This violates the `rateLimitResetAt` docstring promise ("now + N seconds for the seconds form") and is inconsistent with the sibling parser parseRetryAfterMs (line 515), which uses `>= 0` and correctly yields 0ms for the same input. `rateLimitResetAt` is a public field on RateLimitError (re-exported from index.ts, surfaced in examples/typed-errors.ts), so an external caller computing `setTimeout(retry, resetAt.getTime() - Date.now())` on an immediate-retry 429 gets a delay of about -836,000,000,000 ms (~26.5 years in the past). The existing test at errors.test.ts:62-68 only asserts `retryAfterMs` and makes no assertion on `rateLimitResetAt`, so the bug is currently green.

### Implementation steps

STEP 1 — Fix the guard in wrapper/errors.ts.

File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/errors.ts

Locate this EXACT block (the body of parseRateLimitResetAt, lines 539-547):

    const retryAfter = headers.get("Retry-After") ?? headers.get("retry-after");
    if (retryAfter != null) {
        const seconds = Number.parseInt(retryAfter, 10);
        if (Number.isFinite(seconds) && seconds > 0) {
            return new Date(Date.now() + seconds * 1000);
        }
        const date = new Date(retryAfter);
        if (Number.isFinite(date.getTime())) return date;
    }

Replace it with this EXACT block:

    const retryAfter = headers.get("Retry-After") ?? headers.get("retry-after");
    if (retryAfter != null) {
        const seconds = Number.parseInt(retryAfter, 10);
        if (Number.isFinite(seconds)) {
            // Retry-After: 0 (RFC 9110 delay-seconds=0) means retry immediately → now.
            // Negative delay-seconds are invalid; fall through to undefined (matches parseRetryAfterMs).
            if (seconds >= 0) return new Date(Date.now() + seconds * 1000);
        } else {
            const date = new Date(retryAfter);
            if (Number.isFinite(date.getTime())) return date;
        }
    }

Rationale: gating the HTTP-date fallback on `seconds` being NaN (the `else` branch) means a parsed-but-negative delay-seconds value no longer falls into `new Date(retryAfter)` (which would otherwise produce a finite year-2001 Date for "-5"). `Retry-After: 0` now correctly returns ~now. HTTP-date strings still parse because `Number.parseInt` returns NaN for them, routing into the `else` branch. This matches the boundary semantics of parseRetryAfterMs at line 515.

STEP 2 — Close the test gap in wrapper/tests/errors.test.ts.

File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/errors.test.ts

Locate this EXACT test (lines 62-68):

    it("treats Retry-After: 0 as 0ms (retry immediately), not undefined", () => {
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: H({ "Retry-After": "0" }) as never,
        });
        expect(err.retryAfterMs).toBe(0);
    });

Replace it with this EXACT test:

    it("treats Retry-After: 0 as 0ms (retry immediately), not undefined", () => {
        const before = Date.now();
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: H({ "Retry-After": "0" }) as never,
        });
        const after = Date.now();
        expect(err.retryAfterMs).toBe(0);
        // rateLimitResetAt for a 0-second delay is ~now, NOT a bogus 1999/2000 date
        // (regression: new Date("0") parses to 1999-12-31, ~26.5 years in the past).
        expect(err.rateLimitResetAt).toBeInstanceOf(Date);
        expect(err.rateLimitResetAt!.getTime()).toBeGreaterThanOrEqual(before);
        expect(err.rateLimitResetAt!.getTime()).toBeLessThanOrEqual(after);
    });

### Test to add

The test in STEP 2 above is the test to add (an in-place expansion of the existing "treats Retry-After: 0 as 0ms" test at wrapper/tests/errors.test.ts:62-68). It adds three assertions proving `rateLimitResetAt` for `Retry-After: 0` is a Date whose getTime() lands within the [before, after] window around construction (i.e. ~now), which fails against the buggy year-2000 Date and passes after the STEP 1 fix.

Run just this test file from the repo root:
npm test -w clockify-sdk-ts-115 -- errors.test.ts

(Or scope to the single case: npm test -w clockify-sdk-ts-115 -- errors.test.ts -t "treats Retry-After: 0")

### Verify

```bash
Run all three from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

1. npm run type-check -w clockify-sdk-ts-115
2. npm test -w clockify-sdk-ts-115 -- errors.test.ts
3. npm run lint -w clockify-sdk-ts-115

All three must exit 0. The errors.test.ts run must show the "RateLimitError > treats Retry-After: 0 as 0ms" case passing along with the existing HTTP-date / X-RateLimit-Reset / malformed-string cases (no regressions).
```

### Rollback

git checkout -- wrapper/errors.ts wrapper/tests/errors.test.ts

---

## Task 18 — [LOW] Terminate iterPages on an empty page when Last-Page: false (close the unbounded-loop hole; the default maxPages is Infinity)

- **Severity:** LOW  •  **Category:** edge-case  •  **Task id:** `wrapper-pagination-1`
- **Files:** `wrapper/iter.ts`, `wrapper/tests/iter.test.ts`

### Problem

In wrapper/iter.ts, iterPages defaults maxPages to Number.POSITIVE_INFINITY (line 229), which makes endPage = startPage + maxPages - 1 = Infinity (line 242), so the `for (let page = startPage; page <= endPage; page++)` loop (line 243) is bounded only by the `if (!hasNextPage) return;` at line 287. On the `Last-Page: false` branch, hasNextPage is set unconditionally to `true` (line 283) with no items.length check, so a server (or custom fetcher) that emits `Last-Page: false` on every page — including an empty, non-advancing page — loops forever issuing unbounded API calls. The inline comment at lines 279-280 claims the endPage/maxPages bound caps this, but that is false in the default config because the bound is Infinity. The public entry points (scoped iterProjects/iterTags/iterClients in scoped-client.ts and iterAll in iter.ts) forward options verbatim and never inject a finite maxPages, and the existing regression test only exercises the cap by passing an explicit maxPages:3, so the unbounded default is never tested. Fix: on the `Last-Page: false` branch, continue only when the page is non-empty (`items.length > 0`); an empty page (0 items) then terminates on every branch. This preserves the intended "trust Last-Page:false on a short/partial page to avoid under-fetching" behavior (a 1-of-50 page still continues) while closing the infinite-loop hole.

### Proof (independent opus-max verifier)

```
Read wrapper/iter.ts directly and traced the loop. Line 229: `const maxPages = options.maxPages ?? Number.POSITIVE_INFINITY;` (default infinite). Line 242: `const endPage = startPage + maxPages - 1;` -> with the default startPage=1, maxPages=Infinity this is `1 + Infinity - 1 = Infinity`. Line 243: `for (let page = startPage; page <= endPage; page++)` -> `page <= Infinity` is always true, so the only way out is the `return` at line 287. Lines 281-284: `const hasNextPage = lastPageFromHeader === true ? false : lastPageFromHeader === false ? true : items.length === pageSize;` -> on the `Last-Page: false` arm hasNextPage is unconditionally `true` with NO `items.length` check, so line 287 `if (!hasNextPage) return;` never fires. A server (or custom fetcher) that emits `Last-Page: false` on every page — including an empty/non-advancing one — loops forever, issuing unbounded API calls. The inline comment at lines 279-280 ("The endPage/maxPages bound above still caps the walk if a buggy server keeps returning Last-Page: false forever") is FALSE in the default configuration because the bound is Infinity. Confirmed the public entry points never inject a default: wrapper/scoped-client.ts:233-257 (iterProjects/iterTags/iterClients) and iterAll (iter.ts:159) forward `options` verbatim with no maxPages. The regression test (wrapper/tests/iter.test.ts:217-234) only demonstrates the cap by passing an explicit `maxPages: 3` (line 227); the unbounded default is never exercised, so a green suite masks the gap. This is a genuine code-vs-comment mismatch plus a reachable unbounded-loop path.
```

### Implementation steps

STEP 1 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/iter.ts

Locate this EXACT block (lines 273-284, inside the `iterPages` generator):

BEFORE:
```ts
        // The server is authoritative on BOTH ends: `Last-Page: true`
        // stops, `Last-Page: false` continues (the server expects more,
        // even if this page came back short — filtered/partial pages are
        // legitimate, so trusting `false` avoids silently under-fetching).
        // We only fall back to the legacy `items.length === pageSize`
        // heuristic when the header is absent (`undefined`). The
        // `endPage`/`maxPages` bound above still caps the walk if a buggy
        // server keeps returning `Last-Page: false` forever.
        const hasNextPage =
            lastPageFromHeader === true ? false
            : lastPageFromHeader === false ? true
            : items.length === pageSize;
```

AFTER:
```ts
        // The server is authoritative on BOTH ends: `Last-Page: true`
        // stops, `Last-Page: false` continues (the server expects more,
        // even if this page came back short — filtered/partial pages are
        // legitimate, so trusting `false` avoids silently under-fetching).
        // We only fall back to the legacy `items.length === pageSize`
        // heuristic when the header is absent (`undefined`). An empty page
        // (zero items) terminates the walk on EVERY branch, because the
        // default `maxPages` is unbounded (`Number.POSITIVE_INFINITY`) and
        // does NOT cap the walk — so a misbehaving server stuck on
        // `Last-Page: false` cannot loop forever.
        const hasNextPage =
            lastPageFromHeader === true ? false
            : lastPageFromHeader === false ? items.length > 0
            : items.length === pageSize;
```

The only logic change is `lastPageFromHeader === false ? true` becoming `lastPageFromHeader === false ? items.length > 0`; the comment is rewritten to state the true safety net. Do not change any other line.

STEP 2 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/iter.test.ts

Add a new regression test inside the existing `describe("iterPages — Last-Page header consumption", ...)` block, immediately AFTER the `it("maxPages still bounds the walk when Last-Page: false never flips to true", ...)` test and BEFORE the `it("ignores Last-Page when fetcher returns a plain Promise ...")` test. The `fakeHttpResponsePromise` helper used below is already defined at the top of this describe block (line 115), and `collect`, `iterPages`, `PaginatedRequest`, `expect`, and `it` are already imported/in scope.

Locate this EXACT anchor (the end of the maxPages-bound test and the start of the next test, lines 233-236):

BEFORE:
```ts
        expect(seen).toEqual([1, 2, 3]);
    });

    it("ignores Last-Page when fetcher returns a plain Promise (no .withRawResponse)", async () => {
```

AFTER:
```ts
        expect(seen).toEqual([1, 2, 3]);
    });

    it("stops on an empty page even when Last-Page: false and no maxPages is set", async () => {
        // Regression guard for wrapper-pagination-1: the default maxPages is
        // unbounded (Number.POSITIVE_INFINITY), so a server stuck on
        // Last-Page: false must still terminate. An empty page (zero items)
        // ends the walk on the header-trust branch with NO maxPages passed.
        const seen: number[] = [];
        const fetcher = (req: PaginatedRequest) => {
            seen.push(req.page!);
            return fakeHttpResponsePromise([] as number[], "false");
        };
        const pages = await collect(iterPages(fetcher, {}, { pageSize: 2 }));
        expect(pages).toEqual([{ items: [], page: 1, pageSize: 2, hasNextPage: false }]);
        expect(seen).toEqual([1]);
    });

    it("ignores Last-Page when fetcher returns a plain Promise (no .withRawResponse)", async () => {
```

### Test to add

Add to /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/iter.test.ts (inside the `describe("iterPages — Last-Page header consumption", ...)` block, after the maxPages-bound test):

```ts
    it("stops on an empty page even when Last-Page: false and no maxPages is set", async () => {
        // Regression guard for wrapper-pagination-1: the default maxPages is
        // unbounded (Number.POSITIVE_INFINITY), so a server stuck on
        // Last-Page: false must still terminate. An empty page (zero items)
        // ends the walk on the header-trust branch with NO maxPages passed.
        const seen: number[] = [];
        const fetcher = (req: PaginatedRequest) => {
            seen.push(req.page!);
            return fakeHttpResponsePromise([] as number[], "false");
        };
        const pages = await collect(iterPages(fetcher, {}, { pageSize: 2 }));
        expect(pages).toEqual([{ items: [], page: 1, pageSize: 2, hasNextPage: false }]);
        expect(seen).toEqual([1]);
    });
```

Run just this test file:
```bash
cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper && npx vitest run tests/iter.test.ts
```
The new test fails before the STEP 1 edit (it loops up to the implicit collect/time bound — without maxPages the old code never returns on the empty Last-Page:false page) and passes after.

### Verify

```bash
Run all three from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk and confirm each exits 0:

```bash
npm run type-check -w clockify-sdk-ts-115
npm test -w clockify-sdk-ts-115
npm run lint -w clockify-sdk-ts-115
```

Focused single-file test run (fastest red/green proof):
```bash
cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper && npx vitest run tests/iter.test.ts
```
```

### Rollback

git checkout -- wrapper/iter.ts wrapper/tests/iter.test.ts

---

## Task 19 — [LOW] Block RFC 2765 IPv4-translated IPv6 prefix (::ffff:0:0:0/96) in the webhook SSRF guard

- **Severity:** LOW  •  **Category:** security  •  **Task id:** `wrapper-webhook-security-1`
- **Files:** `wrapper/webhook-url.ts`, `wrapper/tests/webhook-url.test.ts`

### Problem

The offline SSRF guard `validateWebhookUrl` in `wrapper/webhook-url.ts` (re-exported, unchanged, by `mcp/src/orchestration/webhook-url.ts`, so SDK + CLI + MCP all share it) decodes several IPv4-in-IPv6 translation prefixes and re-checks the embedded v4 against the private/loopback/metadata ranges: IPv4-mapped (`::ffff:0:0/96`, line 176), NAT64 (`64:ff9b::/96`, line 195), 6to4 (`2002::/16`, line 210), and IPv4-compatible (`::/96`, line 225). It MISSES the sibling RFC 2765 IPv4-translated prefix `::ffff:0:0:0/96`. For that prefix the literal expands to groups `[0,0,0,0,0xffff,0,hi,lo]`: the `0xffff` sits in `groups[4]` with `groups[5] === 0`, so `isMapped` (which requires `groups[5] === 0xffff`) is false; NAT64/6to4/compat all miss; and the fallthrough at lines 233-241 sees `groups[0] === 0` and returns `null` => ALLOWED. Node's WHATWG `URL` serializes the literal in hex (and folds the dotted `::ffff:0:169.254.169.254` form to the same hex literal), so `classifyIpv6`'s dotted-tail branch (lines 120-127) never sees a `.` and never fires. Verified against the actually-compiled `wrapper/dist/cjs/webhook-url.js`: `https://[::ffff:0:a9fe:a9fe]/` (= 169.254.169.254 metadata), `https://[::ffff:0:7f00:1]/` (= 127.0.0.1 loopback), `https://[::ffff:0:a00:1]/` (= 10.0.0.1 private), and the dotted form `https://[::ffff:0:169.254.169.254]/` are all ALLOWED, while the IPv4-mapped and NAT64 controls are correctly blocked. The fix adds an `isTranslated` decode branch mirroring the existing `isMapped` block so a translated literal embedding a private/loopback/metadata v4 is blocked, while one embedding a public v4 (e.g. 8.8.8.8) stays allowed.

### Implementation steps

STEP 1 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/webhook-url.ts

Locate this EXACT block (the closing of the `isMapped` branch immediately followed by the NAT64 comment; currently lines 186-190):

```ts
        if (embedded) return `IPv4-mapped IPv6 of a ${embedded}`;
        return null;
    }

    // NAT64 well-known prefix (64:ff9b::/96, RFC 6052): the low 32 bits embed an
```

Replace it with this EXACT block (inserts the new `isTranslated` branch between the `isMapped` block and the NAT64 comment):

```ts
        if (embedded) return `IPv4-mapped IPv6 of a ${embedded}`;
        return null;
    }

    // IPv4-translated IPv6 address (::ffff:0:0:0/96, RFC 2765 SIIT): sibling of
    // the ::ffff:0:0/96 mapped prefix, but with 0xffff in group[4] and
    // group[5] == 0, so the low 32 bits embed an IPv4 reachable through a
    // stateless (SIIT) translator on the egress path (e.g. ::ffff:0:a9fe:a9fe
    // -> 169.254.169.254). Node serializes the literal in hex (and folds the
    // dotted ::ffff:0:a.b.c.d form to hex too), so classifyIpv6's dotted-tail
    // branch never sees it. Decode and re-check like the mapped branch; a
    // translated address embedding a public v4 stays allowed.
    const isTranslated =
        groups.slice(0, 4).every((g) => g === 0) && groups[4] === 0xffff && groups[5] === 0;
    if (isTranslated) {
        const hi = groups[6]!;
        const lo = groups[7]!;
        const embedded = ipv4Reason([(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff]);
        if (embedded) return `IPv4-translated IPv6 of a ${embedded}`;
        return null;
    }

    // NAT64 well-known prefix (64:ff9b::/96, RFC 6052): the low 32 bits embed an
```

No new imports are required (`ipv4Reason` is already defined in this file).

STEP 2 — Add tests (see test_to_add for the exact edits to wrapper/tests/webhook-url.test.ts).

STEP 3 — Rebuild the wrapper so dist reflects the source (the MCP/CLI consume `wrapper/dist`):
Run, from the repo root: `npm run build -w clockify-sdk-ts-115`

### Test to add

Make TWO edits to /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/webhook-url.test.ts.

EDIT A — Add four reject cases to the `privateIpv6` array. Locate this EXACT block (currently lines 91-94):

```ts
        // IPv4-compatible IPv6 (::/96) embedding a private/metadata v4.
        // ::a9fe:a9fe -> 169.254.169.254; ::7f00:1 -> 127.0.0.1.
        "https://[::a9fe:a9fe]/hook",
        "https://[::7f00:1]/hook",
```

Replace it with:

```ts
        // IPv4-compatible IPv6 (::/96) embedding a private/metadata v4.
        // ::a9fe:a9fe -> 169.254.169.254; ::7f00:1 -> 127.0.0.1.
        "https://[::a9fe:a9fe]/hook",
        "https://[::7f00:1]/hook",
        // IPv4-translated IPv6 (::ffff:0:0:0/96, RFC 2765) embedding a private/metadata v4.
        // ::ffff:0:a9fe:a9fe -> 169.254.169.254; ::ffff:0:7f00:1 -> 127.0.0.1.
        // The dotted ::ffff:0:169.254.169.254 form folds to the same hex literal.
        "https://[::ffff:0:a9fe:a9fe]/hook",
        "https://[::ffff:0:7f00:1]/hook",
        "https://[::ffff:0:169.254.169.254]/hook",
```

EDIT B — Add a public-v4 allow case and a reason assertion. Locate this EXACT block (the `accepts a 6to4 / IPv4-compatible literal embedding a PUBLIC v4` test, currently lines 119-126):

```ts
    it("accepts a 6to4 / IPv4-compatible literal embedding a PUBLIC v4", () => {
        // 6to4 and IPv4-compatible decode like NAT64: only a private/metadata
        // embedded v4 is blocked. 2002:0808:0808:: and ::0808:0808 both embed
        // 8.8.8.8 (public), so they must stay allowed — kills the
        // ConditionalExpression->true mutants on the two new decode branches.
        expect(validateWebhookUrl("https://[2002:808:808::]/hook").ok).toBe(true);
        expect(validateWebhookUrl("https://[::808:808]/hook").ok).toBe(true);
    });
```

Replace it with:

```ts
    it("accepts a 6to4 / IPv4-compatible literal embedding a PUBLIC v4", () => {
        // 6to4 and IPv4-compatible decode like NAT64: only a private/metadata
        // embedded v4 is blocked. 2002:0808:0808:: and ::0808:0808 both embed
        // 8.8.8.8 (public), so they must stay allowed — kills the
        // ConditionalExpression->true mutants on the two new decode branches.
        expect(validateWebhookUrl("https://[2002:808:808::]/hook").ok).toBe(true);
        expect(validateWebhookUrl("https://[::808:808]/hook").ok).toBe(true);
    });

    it("accepts an IPv4-translated IPv6 literal embedding a PUBLIC v4", () => {
        // ::ffff:0:0:0/96 (RFC 2765) decodes like the mapped branch: only a
        // private/metadata embedded v4 is blocked. ::ffff:0:0808:0808 embeds
        // 8.8.8.8 (public), so it must stay allowed — kills the
        // ConditionalExpression->true mutant on the new isTranslated branch.
        expect(validateWebhookUrl("https://[::ffff:0:808:808]/hook").ok).toBe(true);
    });
```

EDIT C — Add a reason assertion to the discrimination test. Locate this EXACT line (currently line 156):

```ts
        expect(reasonFor("::a9fe:a9fe")).toMatch(/IPv4-compatible/);
```

Replace it with:

```ts
        expect(reasonFor("::a9fe:a9fe")).toMatch(/IPv4-compatible/);
        expect(reasonFor("::ffff:0:a9fe:a9fe")).toMatch(/IPv4-translated/);
```

Run just this test file from the repo root:
`npm test -w clockify-sdk-ts-115 -- tests/webhook-url.test.ts`

### Verify

```bash
Run all from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk, in order:

1. Type-check the wrapper:
   `npm run type-check -w clockify-sdk-ts-115`

2. Run the focused test file (must pass, including the new translated cases):
   `npm test -w clockify-sdk-ts-115 -- tests/webhook-url.test.ts`

3. Rebuild so consumers (CLI/MCP) get the patched dist:
   `npm run build -w clockify-sdk-ts-115`

4. Lint the wrapper (perfect-fast-only gate that per-package test/build skip):
   `npm run lint -w clockify-sdk-ts-115`

All four must exit 0.
```

### Rollback

git checkout -- wrapper/webhook-url.ts wrapper/tests/webhook-url.test.ts && npm run build -w clockify-sdk-ts-115

---

## Task 20 — [LOW] Fail closed when an empty configured webhook token matches an empty Clockify-Signature-Token header

- **Severity:** LOW  •  **Category:** security  •  **Task id:** `wrapper-webhook-security-2`
- **Files:** `wrapper/webhooks.ts`, `wrapper/tests/webhooks.test.ts`

### Problem

In /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/webhooks.ts, `verifyClockifyWebhook` returns `true` and `constructEvent` returns the attacker-controlled payload when `expectedToken === ""` AND the request carries a present-but-empty `Clockify-Signature-Token: ` header. Trace: `getClockifySignatureToken` returns `""` (not `undefined`) for an empty header, so the `received == null` presence guards (lines 138 and 188) do NOT bail. The compare helper `constantTimeStringEqual("", "")` returns `true` because both buffers have length 0 (`0 !== 0` is false) and `timingSafeEqual(<empty>, <empty>) === true` on Node. The empty string is the one secret an attacker can always guess; an empty `expectedToken` is a realistic misconfig (a blank `.env` line `CLOCKIFY_WEBHOOK_TOKEN=` or a `?? ""` fallback). Both functions are public SDK exports with no upstream non-empty guard. Confirmed by direct execution against the compiled module. Fix: fail closed on empty inputs at the single chokepoint both functions route through (`constantTimeStringEqual`), plus add explicit entry-point guards so a truly-unset (`undefined`/`null`) token becomes a clean fail-closed result instead of a raw TypeError.

### Proof (independent opus-max verifier)

```
Confirmed by direct execution against the compiled module (dist/cjs/webhooks.js, Node v26), tracing the hand-written source wrapper/webhooks.ts.

1) getClockifySignatureToken returns "" (not undefined) for a present-but-empty header. Verified: getClockifySignatureToken({ "Clockify-Signature-Token": "" }) === "" and new Headers({"Clockify-Signature-Token":""}) === "". (Line 96: `if (typeof value === "string") return value;` returns ""; the Headers branch line 76 `headers.get(...) ?? undefined` keeps "" because ?? only fires on null/undefined.)

2) The presence guards use `== null`, which is false for "". verifyClockifyWebhook line 138 (`if (received == null) return false`) and constructEvent line 188 therefore do NOT bail on an empty header.

3) constantTimeStringEqual("", "") returns true (lines 210-215): both buffers are length 0, so `aBuf.length !== bBuf.length` is `0 !== 0` → false, and timingSafeEqual(<empty>,<empty>) === true. Verified by execution: timingSafeEqual(Buffer.from(""),Buffer.from("")) === true; constantTimeStringEqual("","") === true; constantTimeStringEqual("","abc") === false.

4) End-to-end bypass verified:
   verifyClockifyWebhook({ headers: { "Clockify-Signature-Token": "" }, expectedToken: "" }) === true
   constructEvent({ headers: { "Clockify-Signature-Token": "" }, payload: JSON.stringify({attacker:"payload",webhookEvent:"NEW_TAG"}), expectedToken: "" }) returned {"attacker":"payload","webhookEvent":"NEW_TAG"} (accepted attacker-controlled payload).
   Controls confirm narrowness: no header + empty token → false (received==null); non-empty header + empty token → false (length mismatch); truly-unset expectedToken=undefined → throws TypeError (fail-closed-ish, becomes a 500, not a bypass).

Scope: wrapper/webhooks.ts is git-tracked and hand-written (root wrapper/ file, NOT the gitignored generated wrapper/src/**). Both functions are public SDK exports (wrapper/index.ts lines 97,99) that take expectedToken directly; grep found no upstream guard validating it is non-empty. The bypass precondition expectedToken==="" is a realistic misconfig: a blank dotenv assignment `CLOCKIFY_WEBHOOK_TOKEN=` yields "", as does a `?? ""`/`|| ""` fallback. The helper's own JSDoc example uses `process.env.CLOCKIFY_WEBHOOK_TOKEN!`, encouraging the assume-set pattern that produces this.
```

### Implementation steps

FILE 1 of 2 — /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/webhooks.ts

--- EDIT 1a: guard the chokepoint `constantTimeStringEqual` (lines 205-215) ---

BEFORE (locate this exact block verbatim, including the JSDoc comment):

/**
 * Constant-time string equality. Pads to equal length to avoid
 * `timingSafeEqual` throwing on length mismatch; the early-out on
 * length is fine since the token length (32) is fixed.
 */
function constantTimeStringEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a, "utf8");
    const bBuf = Buffer.from(b, "utf8");
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
}

AFTER (replace the entire block above with this exact block):

/**
 * Constant-time string equality. Pads to equal length to avoid
 * `timingSafeEqual` throwing on length mismatch; the early-out on
 * length is fine since the token length (32) is fixed.
 */
function constantTimeStringEqual(a: string, b: string): boolean {
    // Fail closed: an empty string can never be a valid 32-char token, and
    // timingSafeEqual(<empty>, <empty>) returns true — reject before compare so
    // an empty configured token + empty signature header cannot pass.
    if (a.length === 0 || b.length === 0) return false;
    const aBuf = Buffer.from(a, "utf8");
    const bBuf = Buffer.from(b, "utf8");
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
}

--- EDIT 1b: add an entry-point guard in `verifyClockifyWebhook` (lines 136-140) ---

BEFORE (locate this exact block verbatim):

export function verifyClockifyWebhook(input: VerifyClockifyWebhookInput): boolean {
    const received = getClockifySignatureToken(input.headers);
    if (received == null) return false;
    return constantTimeStringEqual(received, input.expectedToken);
}

AFTER (replace the entire block above with this exact block):

export function verifyClockifyWebhook(input: VerifyClockifyWebhookInput): boolean {
    if (!input.expectedToken) return false;
    const received = getClockifySignatureToken(input.headers);
    if (received == null) return false;
    return constantTimeStringEqual(received, input.expectedToken);
}

--- EDIT 1c: add an entry-point guard in `constructEvent` (lines 184-203) ---

BEFORE (locate this exact block verbatim):

export function constructEvent<TPayload = ClockifyWebhookEvent>(
    input: ConstructEventInput,
): TPayload {
    const received = getClockifySignatureToken(input.headers);
    if (received == null) {
        throw new WebhookSignatureMismatchError(
            `Missing ${CLOCKIFY_SIGNATURE_HEADER} header on Clockify webhook delivery.`,
        );
    }

AFTER (replace the block above with this exact block — this inserts a new guard immediately after the function signature, leaving the rest of the function body unchanged):

export function constructEvent<TPayload = ClockifyWebhookEvent>(
    input: ConstructEventInput,
): TPayload {
    if (!input.expectedToken) {
        throw new WebhookSignatureMismatchError(
            "Refusing to verify a Clockify webhook against an empty expectedToken.",
        );
    }
    const received = getClockifySignatureToken(input.headers);
    if (received == null) {
        throw new WebhookSignatureMismatchError(
            `Missing ${CLOCKIFY_SIGNATURE_HEADER} header on Clockify webhook delivery.`,
        );
    }

(Leave lines 193 onward — the `if (!constantTimeStringEqual(...))` mismatch check, the `text` derivation, and the `JSON.parse` return — exactly as they are. Do not touch them.)

FILE 2 of 2 — /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/webhooks.test.ts

--- EDIT 2: append a new describe block at the END of the file ---

BEFORE (locate this exact block at the end of the file — it is the final describe block):

describe("CLOCKIFY_SIGNATURE_HEADER", () => {
    it("is the documented header name", () => {
        expect(CLOCKIFY_SIGNATURE_HEADER).toBe("Clockify-Signature-Token");
    });
});

AFTER (replace that final block with this — it re-states the existing block unchanged, then appends the new regression block):

describe("CLOCKIFY_SIGNATURE_HEADER", () => {
    it("is the documented header name", () => {
        expect(CLOCKIFY_SIGNATURE_HEADER).toBe("Clockify-Signature-Token");
    });
});

describe("empty-token fail-closed (wrapper-webhook-security-2)", () => {
    it("verifyClockifyWebhook returns false when expectedToken and the signature header are both empty", () => {
        expect(
            verifyClockifyWebhook({
                headers: { "Clockify-Signature-Token": "" },
                expectedToken: "",
            }),
        ).toBe(false);
    });

    it("constructEvent throws WebhookSignatureMismatchError when expectedToken and the signature header are both empty", () => {
        expect(() =>
            constructEvent({
                headers: { "Clockify-Signature-Token": "" },
                payload: JSON.stringify({ attacker: "payload", webhookEvent: "NEW_TAG" }),
                expectedToken: "",
            }),
        ).toThrow(WebhookSignatureMismatchError);
    });

    it("verifyClockifyWebhook still returns false for a non-empty header against an empty expectedToken", () => {
        expect(
            verifyClockifyWebhook({
                headers: { "Clockify-Signature-Token": TOKEN },
                expectedToken: "",
            }),
        ).toBe(false);
    });
});

No new imports are needed: `verifyClockifyWebhook`, `constructEvent`, `WebhookSignatureMismatchError`, `CLOCKIFY_SIGNATURE_HEADER`, and the `TOKEN` const are all already imported/defined at the top of wrapper/tests/webhooks.test.ts.

### Test to add

Append the `describe("empty-token fail-closed (wrapper-webhook-security-2)", ...)` block shown in EDIT 2 to /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/webhooks.test.ts (three `it` cases: both-empty verify → false, both-empty constructEvent → throws WebhookSignatureMismatchError, non-empty-header + empty-token verify → false). Run only this test file with:

  npm test -w clockify-sdk-ts-115 -- webhooks

(equivalently: cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper && npx vitest run tests/webhooks.test.ts)

### Verify

```bash
Run all three from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

1. npm run type-check -w clockify-sdk-ts-115
2. npm test -w clockify-sdk-ts-115
3. npm run build -w clockify-sdk-ts-115

All three must exit 0. (Optional focused run of just the changed suite: npm test -w clockify-sdk-ts-115 -- webhooks.) Note: `wrapper/src/**` and `output/ts-sdk/**` are gitignored and generated; if `npm run type-check` fails on missing generated SDK paths in a fresh clone, run `make sdk-codegen` once from the repo root first, then re-run the three commands. webhooks.ts is a hand-written root wrapper file and is NOT regenerated by sdk-codegen.
```

### Rollback

git checkout -- wrapper/webhooks.ts wrapper/tests/webhooks.test.ts

---

## Task 21 — [LOW] Rename reserved OTel metric name used as a span attribute in otel-hooks.ts to a namespaced, unit-explicit key

- **Severity:** LOW  •  **Category:** observability / semconv-conformance  •  **Task id:** `wd-otel-duration-attr`
- **Files:** `wrapper/otel-hooks.ts`, `wrapper/tests/otel-hooks.test.ts`, `docs/observability-contract.json`

### Problem

wrapper/otel-hooks.ts advertises OpenTelemetry semantic-conventions v1.27 conformance, but it sets a span attribute named "http.client.request.duration" carrying a millisecond value (ctx.durationMs, computed as Date.now() - start in wrapper/composed-fetch.ts). In OTel semconv, "http.client.request.duration" is a reserved Histogram METRIC name with unit seconds (s), not a span attribute. So the module reuses a reserved metric identifier as a span attribute, with the wrong unit (ms vs s) and the wrong signal type (attribute vs metric), contradicting its own conformance claim. The buggy name is pinned in two other places that act as gates: the test at wrapper/tests/otel-hooks.test.ts line 78, and the mustContain list in docs/observability-contract.json line 53. The fix renames the attribute key to the namespaced, unit-explicit "clockify.http.client.request.duration_ms" (vendor-namespaced attributes are allowed under semconv), preserving the useful per-attempt duration on the span while removing the reserved-name and unit hazards. All three pinned locations must change together so the observability-contract gate stays green.

### Implementation steps

STEP 1 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/otel-hooks.ts

Locate this exact line (line 67):

```ts
const ATTR_DURATION_MS = "http.client.request.duration" as const;
```

Replace it with:

```ts
const ATTR_DURATION_MS = "clockify.http.client.request.duration_ms" as const;
```

Do NOT change any other line in this file. The usage site at line 123 (`span.setAttribute(ATTR_DURATION_MS, ctx.durationMs);`) references the constant and needs no edit.

STEP 2 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/otel-hooks.test.ts

Locate this exact line (line 78), including its leading indentation of 8 spaces:

```ts
        expect(span.attrs["http.client.request.duration"]).toBe(142);
```

Replace it with:

```ts
        expect(span.attrs["clockify.http.client.request.duration_ms"]).toBe(142);
```

Do NOT change any other line in this file.

STEP 3 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/docs/observability-contract.json

Locate this exact line (line 53), inside the mustContain array of the object whose "path" is "wrapper/otel-hooks.ts", including its leading indentation of 8 spaces and trailing comma:

```json
        "http.client.request.duration",
```

Replace it with:

```json
        "clockify.http.client.request.duration_ms",
```

Do NOT change any other line in this file. Preserve the trailing comma exactly.

### Test to add

No new test file is created. The existing test at /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/otel-hooks.test.ts already covers the duration attribute; STEP 2 updates its assertion to expect the renamed key. After STEP 2 the assertion reads exactly:

        expect(span.attrs["clockify.http.client.request.duration_ms"]).toBe(142);

Run only this test file with:

  npm test -w clockify-sdk-ts-115 -- otel-hooks

Expected result: the "afterResponse sets status_code + duration and ends span" test (and the rest of the otel-hooks suite) passes; the assertion confirms the span attribute "clockify.http.client.request.duration_ms" equals 142 for a 142ms response.

### Verify

```bash
Run all three from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk (each must exit 0):

1. npm run type-check -w clockify-sdk-ts-115
2. npm test -w clockify-sdk-ts-115 -- otel-hooks
3. make observability-contract

If `make observability-contract` is not a defined target, run instead: node scripts/check-observability-contract.mjs (the script that enforces docs/observability-contract.json). Confirm it reports the wrapper/otel-hooks.ts mustContain entries as satisfied with the new key "clockify.http.client.request.duration_ms".
```

### Rollback

git checkout -- wrapper/otel-hooks.ts wrapper/tests/otel-hooks.test.ts docs/observability-contract.json

---

## Task 22 — [LOW] otel-hooks: only emit http.request.resend_count on retried attempts (OTel semconv)

- **Severity:** LOW  •  **Category:** observability-semconv  •  **Task id:** `wd-otel-resend-count-initial`
- **Files:** `wrapper/otel-hooks.ts`, `wrapper/tests/otel-hooks.test.ts`

### Problem

wrapper/otel-hooks.ts unconditionally sets the OTel attribute `http.request.resend_count` (= ctx.attempt) on EVERY request span, including the initial, never-retried attempt where ctx.attempt === 0. The OpenTelemetry HTTP semantic conventions v1.27 — which the module's own docstring (lines 5-7) and comment (line 60, https://opentelemetry.io/docs/specs/semconv/http/http-spans/) explicitly claim conformance with — define this attribute's requirement level as "Recommended: if and only if request was retried" and note "it's not needed for initial requests". The requirement governs PRESENCE, so emitting a truthful 0 on the overwhelmingly common single-attempt path is still a deviation: backends that filter/aggregate on resend_count presence see spurious attributes. The attribute object built at lines 99-104 is read by both the startSpan(name, initialAttrs) call (line 110) and the Object.entries(initialAttrs) setAttribute loop (lines 113-115), so dropping the key from the literal removes it from both emission paths. Impact is low (value is truthful), but it contradicts the module's explicit semconv claim. The only repo references to resend_count are this source and its test — no cli/mcp/wrapper runtime consumer depends on it.

### Implementation steps

STEP 1 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/otel-hooks.ts

Locate this EXACT block inside the `beforeRequest(ctx)` handler (lines 99-104):

```ts
            const initialAttrs: Record<string, string | number | boolean> = {
                [ATTR_HTTP_METHOD]: ctx.method,
                [ATTR_HTTP_URL]: ctx.url,
                [ATTR_PEER_SERVICE]: "clockify",
                [ATTR_RETRY_ATTEMPT]: ctx.attempt,
            };
```

Replace it with EXACTLY:

```ts
            const initialAttrs: Record<string, string | number | boolean> = {
                [ATTR_HTTP_METHOD]: ctx.method,
                [ATTR_HTTP_URL]: ctx.url,
                [ATTR_PEER_SERVICE]: "clockify",
            };
            // `http.request.resend_count` is "Recommended: if and only if request
            // was retried" (OTel HTTP semconv v1.27) — emit only on resends, never
            // on the initial request.
            if (ctx.attempt > 0) {
                initialAttrs[ATTR_RETRY_ATTEMPT] = ctx.attempt;
            }
```

Do NOT change the `try { initialAttrs[ATTR_SERVER_ADDRESS] = new URL(ctx.url).host; } catch {}` block, the `options.startSpan(...)` call, or the `for (const [k, v] of Object.entries(initialAttrs))` loop that follow — they stay exactly as-is. No import changes are needed; `ATTR_RETRY_ATTEMPT` is already declared at line 66.

STEP 2 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/otel-hooks.test.ts

2a. Locate this EXACT line (line 53):

```ts
        expect(span.attrs["http.request.resend_count"]).toBe(0);
```

Replace it with EXACTLY:

```ts
        expect(span.attrs["http.request.resend_count"]).toBeUndefined();
```

2b. Locate this EXACT line (line 219):

```ts
        expect(spans[0]?.attrs["http.request.resend_count"]).toBe(0);
```

Replace it with EXACTLY:

```ts
        expect(spans[0]?.attrs["http.request.resend_count"]).toBeUndefined();
```

Leave line 220 (`expect(spans[1]?.attrs["http.request.resend_count"]).toBe(1);`) unchanged — the second, retried attempt must still emit resend_count = 1.

### Test to add

No new test file is created; the two existing assertions in /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/otel-hooks.test.ts are corrected (Step 2). These assertions, plus the unchanged line-220 assertion, now codify the fix: the initial attempt-0 span omits `http.request.resend_count` (toBeUndefined) and the retried attempt-1 span emits it as 1. Additionally append a dedicated regression test immediately AFTER line 221 (the closing `});` of the "tracks one span per attempt" test) and BEFORE line 222 (the final `});` that closes the top-level `describe`). Insert EXACTLY:

```ts
    it("omits resend_count on the initial attempt but emits it on retries", async () => {
        const spans: ReturnType<typeof mockSpan>[] = [];
        const startSpan = () => {
            const s = mockSpan();
            spans.push(s);
            return s;
        };
        const hooks = otelHooks({ startSpan });

        const baseCtx = {
            url: "https://api.clockify.me/api/v1/workspaces",
            method: "GET" as const,
            headers: new Headers(),
            requestId: "req-resend",
        };

        await hooks.beforeRequest?.({ ...baseCtx, attempt: 0 });
        await hooks.beforeRequest?.({ ...baseCtx, attempt: 1 });
        await hooks.beforeRequest?.({ ...baseCtx, attempt: 2 });

        expect("http.request.resend_count" in spans[0]!.attrs).toBe(false);
        expect(spans[1]?.attrs["http.request.resend_count"]).toBe(1);
        expect(spans[2]?.attrs["http.request.resend_count"]).toBe(2);
    });
```

This uses the existing `mockSpan()` helper already defined in the file (no new import). Run just this test file from the wrapper package directory:

```bash
npm test -w clockify-sdk-ts-115 -- otel-hooks
```

### Verify

```bash
From the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk run, in order:

1. (fresh clone only) make sdk-codegen
2. npm run type-check -w clockify-sdk-ts-115
3. npm test -w clockify-sdk-ts-115 -- otel-hooks
4. npm test -w clockify-sdk-ts-115

All must exit 0. otel-hooks.ts is mutated by Stryker (make mutation); this change adds a guard branch rather than removing coverage, and the new/updated assertions cover both the attempt===0 (absent) and attempt>0 (present) arms, so the mutation floors in docs/mutation-score-contract.json remain satisfied. Do NOT run make perfect-fast concurrently with other load (its startup-time budgets flake under CPU contention) — focused type-check + test above are sufficient proof for this change.
```

### Rollback

git checkout -- wrapper/otel-hooks.ts wrapper/tests/otel-hooks.test.ts

---

## Task 23 — [LOW] Fix --select missing-path emitting literal `undefined` (invalid JSON) in printJson/printNdjson

- **Severity:** LOW  •  **Category:** bug  •  **Task id:** `cli-core-1`
- **Files:** `cli/src/output.ts`, `cli/tests/output.test.ts`

### Problem

In cli/src/output.ts, `selectValue(value, selector)` returns `undefined` when the dot-path does not exist (array out-of-bounds at line 143, missing object key at line 152). Both `printJson` (line 162-163) and `printNdjson` non-array branch (line 168, 175) serialize that result directly with `JSON.stringify(...)`. Because `JSON.stringify(undefined) === undefined` (the JS value, not a string), `console.log(JSON.stringify(undefined, null, 2))` prints the bare word `undefined` to stdout. So `clk115 <cmd> --output json --select bad.path` (any path absent from the payload) emits non-JSON `undefined`, the process exits 0 (silent corruption), and downstream `| jq` or `JSON.parse` fails with "Unexpected token 'u'". --select is a real global option (cli/src/index.ts:59) copied verbatim into OutputOptions with no validation and reaches these serializers via receipt.ts, api.ts, and printRecords/printObject. output.ts is hand-written CLI code, in scope.

### Proof (independent opus-max verifier)

```
Independently reproduced and traced. selectValue returns undefined for a non-existent path (output.ts:152; guarded twice — array OOB at :143, missing object key at :152; test output.test.ts:131-132 asserts toBeUndefined). printJson (output.ts:162-163) does `const selected = selectValue(value, options.select); console.log(JSON.stringify(selected, null, options.compact ? 0 : 2));` and printNdjson's non-array branch (output.ts:175) does `console.log(JSON.stringify(selected))` — neither guards undefined.

JS behavior verified locally: `JSON.stringify(undefined)` returns the JS value undefined (typeof === "undefined", === undefined true), so `console.log(JSON.stringify(undefined, null, 2))` prints the bare word `undefined`. End-to-end repro of the exact source functions with select:"data.missing" emitted `undefined` to stdout; piping that to a JSON parser failed: "Unexpected token 'u', \"undefined\\n\" is not valid JSON", while the producer exited 0 (silent corruption).

Reachability confirmed: --select <path> is a real global option (index.ts:59), copied verbatim into resolved output options with no validation (resolveFlags index.ts:110/118), and the resulting OutputOptions (carrying select) is passed straight into printJson/printNdjson in real handlers — receipt.ts:51/55, api.ts:231/234, and via printRecords/printObject (output.ts:29/33/57/61). So `clk115 <cmd> --output json --select bad.path` (or any path absent from the payload) writes non-JSON `undefined` and breaks downstream `| jq`/JSON.parse. cli/src/output.ts is hand-written CLI code, not a generated/out-of-scope path.
```

### Implementation steps

Make exactly two edits in /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/src/output.ts. Use `?? null` (NOT `|| null`) so legitimate falsy selections 0/false/"" pass through unchanged.

EDIT 1 — printJson. Locate this EXACT current code (lines 161-164):

    const selected = selectValue(value, options.select);
    console.log(JSON.stringify(selected, null, options.compact ? 0 : 2));
}

Replace it with:

    const selected = selectValue(value, options.select) ?? null;
    console.log(JSON.stringify(selected, null, options.compact ? 0 : 2));
}

EDIT 2 — printNdjson. Locate this EXACT current code (lines 167-176):

export function printNdjson(value: unknown, options: Pick<OutputOptions, "select"> = {}): void {
    const selected = selectValue(value, options.select);
    if (Array.isArray(selected)) {
        for (const item of selected) {
            console.log(JSON.stringify(item));
        }
        return;
    }
    console.log(JSON.stringify(selected));
}

Replace it with:

export function printNdjson(value: unknown, options: Pick<OutputOptions, "select"> = {}): void {
    const selected = selectValue(value, options.select) ?? null;
    if (Array.isArray(selected)) {
        for (const item of selected) {
            console.log(JSON.stringify(item));
        }
        return;
    }
    console.log(JSON.stringify(selected));
}

No new imports are required. The only change in each function is appending ` ?? null` to the `selectValue(...)` call.

### Test to add

In /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/tests/output.test.ts, locate this EXACT current block (lines 152-156):

    it("prints a non-array ndjson value as a single line", () => {
        printNdjson({ id: "x" });
        expect(logged).toEqual(['{"id":"x"}']);
    });
});

Replace it with:

    it("prints a non-array ndjson value as a single line", () => {
        printNdjson({ id: "x" });
        expect(logged).toEqual(['{"id":"x"}']);
    });

    it("emits valid JSON null (not bare undefined) for a missing --select path in json mode", () => {
        printJson({ data: {} }, { select: "data.missing" });
        expect(logged).toEqual(["null"]);
        expect(() => JSON.parse(logged[0] ?? "")).not.toThrow();
    });

    it("emits valid JSON null (not bare undefined) for a missing --select path in ndjson mode", () => {
        printNdjson({ data: {} }, { select: "data.missing" });
        expect(logged).toEqual(["null"]);
        expect(() => JSON.parse(logged[0] ?? "")).not.toThrow();
    });

    it("passes legitimate falsy selected values through unchanged (does not coerce to null)", () => {
        printJson({ data: 0 }, { compact: true, select: "data" });
        expect(logged[0]).toBe("0");
    });
});

The existing imports already include `printJson` and `printNdjson` (cli/tests/output.test.ts lines 4-6), so no import changes are needed.

Run just this test file (from the repo root):

npm test -w @apet97/clockify-cli-115 -- output.test.ts

### Verify

```bash
Run from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

npm run type-check -w @apet97/clockify-cli-115
npm test -w @apet97/clockify-cli-115
npm run build -w @apet97/clockify-cli-115
npm run lint -w @apet97/clockify-cli-115

All four must pass. The focused test command `npm test -w @apet97/clockify-cli-115 -- output.test.ts` must show the three new assertions green and all pre-existing output.test.ts cases unchanged.
```

### Rollback

git checkout -- cli/src/output.ts cli/tests/output.test.ts

---

## Task 24 — [LOW] Classify the "workspace ID not set" CLI setup error as auth_or_permission (fix in the error-docs generator, regenerate the three emitted modules)

- **Severity:** LOW  •  **Category:** error-handling  •  **Task id:** `cli-core-3`
- **Files:** `scripts/generate-error-docs.mjs`, `cli/src/error-codes.ts`, `wrapper/error-codes.ts`, `mcp/src/error-codes.ts`, `cli/tests/output.test.ts`

### Problem

When the CLI is run with an API key set but no workspace ID, `requireWorkspaceId` (cli/src/config.ts:61-68) throws the message:

  "Clockify workspace ID not set. Provide --workspace, set CLOCKIFY_WORKSPACE_ID, or add `workspaceId` to ~/.clockifyrc.json."

`printError` (cli/src/output.ts) classifies this via `errorCodeForMessage`. That message contains no auth token recognized by the auth matcher (the literal "CLOCKIFY_WORKSPACE_ID" is NOT in the auth alternation), so it falls through to the `provide` alternative in the next matcher and is classified `invalid_request`. The emitted recovery hint then reads "Fix the request fields, IDs, dates, pagination values, or enum values, then retry." — wording about a request payload, which is wrong for a credential-setup failure. The sibling `requireApiKey` message DOES match the auth matcher (`CLOCKIFY_API_KEY`) and correctly classifies `auth_or_permission`, whose recovery names "workspace ID" and is the strictly more helpful hint here.

The classifier logic is HAND-AUTHORED inside the generator's template literal at scripts/generate-error-docs.mjs:78 and is propagated by `make error-docs` into three generated files: cli/src/error-codes.ts, wrapper/error-codes.ts, mcp/src/error-codes.ts. Those three files are generated (header line 1) and guarded by a `--check` drift gate; editing them by hand is reverted/fails CI. The fix must be made in the generator and regenerated.

The phrase added must be `workspace id not set` (case-insensitive), NOT the bare `CLOCKIFY_WORKSPACE_ID`: the latter would also match the legitimate request-construction error in cli/src/commands/api.ts ("Path uses {workspaceId}; provide --workspace or CLOCKIFY_WORKSPACE_ID."), which must stay `invalid_request`. The phrase `workspace id not set` matches only the `requireWorkspaceId` message ("workspace ID not set").

### Implementation steps

STEP 1 — Edit the generator. File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/generate-error-docs.mjs

Locate this EXACT line (line 78, inside the `typescriptFor` template literal):

    if (/(unauthorized|forbidden|permission|api[\\s_-]?key|addon[\\s_-]?token|CLOCKIFY_API_KEY|CLOCKIFY_ADDON_TOKEN)/i.test(message)) return "auth_or_permission";

Replace it with (adds `|workspace id not set` before the closing paren of the alternation; nothing else changes):

    if (/(unauthorized|forbidden|permission|api[\\s_-]?key|addon[\\s_-]?token|CLOCKIFY_API_KEY|CLOCKIFY_ADDON_TOKEN|workspace id not set)/i.test(message)) return "auth_or_permission";

STEP 2 — Regenerate the emitted modules. Run from the repo root:

    make error-docs

This rewrites cli/src/error-codes.ts, wrapper/error-codes.ts, and mcp/src/error-codes.ts. After it runs, line 263 of cli/src/error-codes.ts (and the equivalent line in the wrapper/mcp copies) MUST read exactly:

    if (/(unauthorized|forbidden|permission|api[\s_-]?key|addon[\s_-]?token|CLOCKIFY_API_KEY|CLOCKIFY_ADDON_TOKEN|workspace id not set)/i.test(message)) return "auth_or_permission";

(In the generated file the escape is a single backslash `\s` because the generator's `\\s` template-literal escape collapses to `\s` on emit.) Do NOT hand-edit any of the three generated files — only run `make error-docs`.

STEP 3 — Add the pinning test. File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/tests/output.test.ts

Locate this EXACT block (the last `it(...)` inside the `describe("printSuccess / printError", ...)` group, lines 119-124):

    it("classifies a 400 'doesn't belong to' body as not_found (the id is wrong)", () => {
        // A wrong id 400s with "X doesn't belong to Workspace"; the not_found
        // message overrides the generic 400 -> invalid_request status mapping.
        printError("Project doesn't belong to Workspace", json, 400);
        expect(JSON.parse(errored[0] ?? "").code).toBe("not_found");
    });

Replace it with (same block, plus one new `it(...)` appended immediately after it):

    it("classifies a 400 'doesn't belong to' body as not_found (the id is wrong)", () => {
        // A wrong id 400s with "X doesn't belong to Workspace"; the not_found
        // message overrides the generic 400 -> invalid_request status mapping.
        printError("Project doesn't belong to Workspace", json, 400);
        expect(JSON.parse(errored[0] ?? "").code).toBe("not_found");
    });

    it("classifies the workspace-not-set setup error as auth_or_permission, not invalid_request", () => {
        // requireWorkspaceId throws "Clockify workspace ID not set. ..."; that is a
        // credential-setup failure with no HTTP status, so it must classify as
        // auth_or_permission (whose recovery names the workspace ID) instead of the
        // request-payload bucket invalid_request.
        printError(
            "Clockify workspace ID not set. Provide --workspace, set CLOCKIFY_WORKSPACE_ID, or add `workspaceId` to ~/.clockifyrc.json.",
            json,
        );
        expect(JSON.parse(errored[0] ?? "").code).toBe("auth_or_permission");
    });

### Test to add

A new test case added to the existing describe("printSuccess / printError") block in /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/tests/output.test.ts (full code given in STEP 3). It calls `printError(<requireWorkspaceId message>, json)` with no HTTP status and asserts the emitted JSON `code` is `"auth_or_permission"`. Run just this test from the repo root with:

    npm test -w @apet97/clockify-cli-115 -- tests/output.test.ts

(Or, scoped to the new case: npm test -w @apet97/clockify-cli-115 -- tests/output.test.ts -t "workspace-not-set")

### Verify

```bash
Run all from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

1. node scripts/generate-error-docs.mjs --check
   (must print "error code docs are current" and exit 0 — proves the three generated modules match the generator after `make error-docs`)

2. npm run type-check -w @apet97/clockify-cli-115
   (must exit 0)

3. npm test -w @apet97/clockify-cli-115 -- tests/output.test.ts
   (the new "auth_or_permission" case must pass)

4. npm test -w @apet97/clockify-cli-115
   (full CLI suite must stay green)

5. make docs-drift
   (docs/error-codes generation drift gate must pass)
```

### Rollback

git checkout -- scripts/generate-error-docs.mjs cli/src/error-codes.ts wrapper/error-codes.ts mcp/src/error-codes.ts cli/tests/output.test.ts

---

## Task 25 — [LOW] Fix inverted --archived flag help on projects/clients/tags list commands

- **Severity:** LOW  •  **Category:** correctness / docs-accuracy (CLI help text)  •  **Task id:** `cli-crud-2`
- **Files:** `cli/src/commands/projects.ts`, `cli/src/commands/clients.ts`, `cli/src/commands/tags.ts`, `cli/tests/archived-flag-help.test.ts`

### Problem

The `--archived` flag on the `list` subcommands of `clk115 projects`, `clk115 clients`, and `clk115 tags` is documented as "Include archived projects/clients/tags." This is inverted relative to the actual Clockify wire behavior. The corrected OpenAPI spec (spec/corrected/clockify.corrected.openapi.yaml:4736-4737) states verbatim: "If true, returns only archived projects. If omitted, returns both archived and non-archived projects." A read-only live wire probe confirmed the same restrictive single-value filter on all three endpoints (e.g. tags: omit => 1 archived + 117 active = both; archived=true => only the 1 archived item, the 117 active vanish). So the default already lists archived items, and passing `--archived` HIDES active items rather than adding archived ones. The help text claims the opposite. The code mapping (`if (opts.archived) req.archived = true;`) is correct; only the help string is wrong. This is the minimal, behavior-preserving fix — it changes no request mapping and does not add or remove any CLI option, so the generated docs/cli-commands.json signature `[--archived]` is unchanged and no readme-tables/docs-counts gate is tripped.

### Proof (independent opus-max verifier, live-probed)

```
All three layers agree.

CODE (line numbers in finding are exact):
- projects.ts:23 `.option("--archived", "Include archived projects.", false)`; :33 `if (opts.archived) req.archived = true;`
- clients.ts:28 `.option("--archived", "Include archived clients.", false)`; :37 `if (opts.archived) req.archived = true;`
- tags.ts:26 `.option("--archived", "Include archived tags.", false)`; :35 `if (opts.archived) req.archived = true;`
So: no flag => param omitted; `--archived` => `archived=true`. None of the three `list` subcommands expose `--no-archived` (that exists only on the `update` subcommands), so there is no active-only filter.

CORRECTED SPEC (repo's canonical API truth), clockify.corrected.openapi.yaml:4736-4737, verbatim: "If true, returns only archived projects. If omitted, returns both archived and non-archived projects."

LIVE WIRE PROBE (read-only GET, X-Api-Key, sandbox ws), decisive — same restrictive single-value filter on all three endpoints:
- projects: omit => 119 archived + 81 active (both); archived=true => 200 archived / 0 active (only archived); archived=false => 0 / 113 (only active)
- clients: omit => 12 + 188; archived=true => 15 / 0; archived=false => 0 / 200
- tags (clearest, under page cap): omit => 1 archived + 117 active = 118 (both); archived=true => only 1 (the 117 active vanish); archived=false => 117 active

Therefore the default already lists archived items, and passing `--archived` HIDES active items rather than adding archived ones — exactly inverting the help text. Finding's impact and proposed direction are accurate.
```

### Implementation steps

STEP 1 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/src/commands/projects.ts

Locate this exact line (line 23, inside `registerProjectsCommand`, the `projects.command("list")` chain):

BEFORE:
```ts
        .option("--archived", "Include archived projects.", false)
```

AFTER:
```ts
        .option("--archived", "Show only archived projects (default lists both archived and active).", false)
```


STEP 2 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/src/commands/clients.ts

Locate this exact line (line 28, inside `registerClientsCommand`, the `clients.command("list")` chain):

BEFORE:
```ts
        .option("--archived", "Include archived clients.", false)
```

AFTER:
```ts
        .option("--archived", "Show only archived clients (default lists both archived and active).", false)
```


STEP 3 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/src/commands/tags.ts

Locate this exact line (line 26, inside `registerTagsCommand`, the `tags.command("list")` chain):

BEFORE:
```ts
        .option("--archived", "Include archived tags.", false)
```

AFTER:
```ts
        .option("--archived", "Show only archived tags (default lists both archived and active).", false)
```

Do NOT change the `if (opts.archived) req.archived = true;` lines, the option's default value `false`, or anything else. Only the three description strings change.

### Test to add

Create a NEW file at exactly /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/tests/archived-flag-help.test.ts with EXACTLY this content:

```ts
import { describe, expect, it } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerClientsCommand } from "../src/commands/clients.js";
import { registerProjectsCommand } from "../src/commands/projects.js";
import { registerTagsCommand } from "../src/commands/tags.js";
import type { Registrar } from "../src/commands/types.js";

import { makeProgram } from "./read-commands.helpers.js";

function listArchivedHelp(register: Registrar, group: string): string {
    const program = makeProgram(register, {} as unknown as ClockifyClient);
    const groupCmd = program.commands.find((c) => c.name() === group);
    if (!groupCmd) throw new Error(`missing ${group} command`);
    const listCmd = groupCmd.commands.find((c) => c.name() === "list");
    if (!listCmd) throw new Error(`missing ${group} list command`);
    const option = listCmd.options.find((o) => o.long === "--archived");
    if (!option) throw new Error(`missing --archived on ${group} list`);
    return option.description;
}

describe("--archived list flag help reflects the restrictive wire filter", () => {
    it("projects list --archived help says it shows only archived", () => {
        expect(listArchivedHelp(registerProjectsCommand, "projects")).toBe(
            "Show only archived projects (default lists both archived and active).",
        );
    });

    it("clients list --archived help says it shows only archived", () => {
        expect(listArchivedHelp(registerClientsCommand, "clients")).toBe(
            "Show only archived clients (default lists both archived and active).",
        );
    });

    it("tags list --archived help says it shows only archived", () => {
        expect(listArchivedHelp(registerTagsCommand, "tags")).toBe(
            "Show only archived tags (default lists both archived and active).",
        );
    });
});
```

This test imports the shared `makeProgram` helper (which also installs the console.log spy beforeEach/afterEach hooks used by the existing read-command suites), builds each command group, walks down to the `list` subcommand, and asserts the new `--archived` option description verbatim. It exercises only metadata (no action is invoked), so the empty `{}` client cast is never used at runtime.

Run ONLY this test from the repo root (/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk):
```bash
npm test -w @apet97/clockify-cli-115 -- archived-flag-help
```

### Verify

```bash
Run all three from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk and confirm each exits 0:
```bash
npm run type-check -w @apet97/clockify-cli-115
npm test -w @apet97/clockify-cli-115
npm run lint -w @apet97/clockify-cli-115
```
type-check confirms the source edits compile; `npm test` runs the full CLI vitest suite including the new tests/archived-flag-help.test.ts and the existing crud/read-command suites that assert the unchanged `--archived` -> `archived:true` request mapping (those must still pass, proving behavior is preserved); lint confirms style. No make target, docs regeneration, or perfect-fast run is required for this change because no CLI option signature changed.
```

### Rollback

git checkout -- cli/src/commands/projects.ts cli/src/commands/clients.ts cli/src/commands/tags.ts && rm -f cli/tests/archived-flag-help.test.ts

---

## Task 26 — [LOW] Canonicalize `log --end` to full RFC3339 before the wire (eliminate start-canonical/end-raw asymmetry)

- **Severity:** LOW  •  **Category:** wire-shape  •  **Task id:** `cli-time-2`
- **Files:** `cli/src/commands/log.ts`, `cli/tests/log.test.ts`

### Problem

In `cli/src/commands/log.ts`, when the user passes `--end`, the raw string is placed verbatim into `body.end` (the POST body) and into the receipt, while `body.start` is always derived as a canonical RFC3339 UTC instant from the same parsed millisecond value. The only guard (`Number.isNaN(Date.parse(endIso))`) rejects unparseable input but does NOT canonicalize parseable-but-non-RFC3339 values. So inputs like `2026-06-01`, `2026/06/01`, `June 1, 2026`, or zoneless `2026-06-01T14:30` pass the guard and reach the wire raw as `body.end`, while `body.start` is the canonical UTC derived from the same instant. For zoneless/slash forms the parsed instant used for `start` differs from the literal string sent as `end`, producing a timezone-inconsistent start/end pair. This contradicts the repo's own convention (entries.ts:38-44 / helpers.ts:77-96 promoteDateBoundary, wrapper/dates.ts:241-248) of never sending an un-normalized datetime to the wire. Fix: derive `endIso` from the parsed `endMs` exactly as `startIso` is derived, so both bounds are canonical RFC3339 from the same `endMs`.

### Proof (independent opus-max verifier)

```
Code-trace of cli/src/commands/log.ts (line numbers in the finding are exact):
- L59 `const endIso = opts.end ?? new Date().toISOString();` — when `--end` is supplied, `endIso` holds the RAW user string.
- L60-65 — the only guard is `Number.isNaN(Date.parse(endIso))`, which rejects ONLY unparseable input; it neither promotes nor canonicalizes.
- L66 `const startIso = new Date(endMs - seconds * 1000).toISOString();` — start is always canonical RFC3339.
- L70 `end: endIso` (and the receipt L90) place the raw string into `body.end` verbatim, which is POSTed by `client.timeEntries.create` (L78-79).

Local node check (not a network probe) of the values that pass the NaN guard yet are not full RFC3339:
  "2026-06-01"     -> valid, 2026-06-01T00:00:00.000Z (UTC midnight)
  "2026/06/01"     -> valid, 2026-05-31T22:00:00.000Z (LOCAL midnight, machine is UTC+2)
  "June 1, 2026"   -> valid, 2026-05-31T22:00:00.000Z (LOCAL)
  "2026-06-01T14:30" -> valid, 2026-06-01T12:30:00.000Z (LOCAL; zoneless)
  "2026-06-01T14:30:00Z" -> 2026-06-01T14:30:00.000Z (fine)
All pass the guard and go to the wire raw as `body.end`, while `body.start` is the canonical UTC derived from the same parsed instant. For zoneless/slash forms the JS-parsed instant used for `start` differs from the literal string sent as `end`, so the pair is timezone-inconsistent (worse than the finding's framing).

The repo documents this exact hazard and handles it EVERYWHERE ELSE, confirming it is real and out-of-convention:
- entries.ts:38-44 promotes bare dates via promoteDateBoundary "because Clockify's time-entry range filter needs a full RFC3339 instant" and "CLI users naturally type --from 2026-06-01"; the comment even says this "mirrors log.ts's --end guard".
- helpers.ts:77-96 promoteDateBoundary canonicalizes/validates bare dates before the wire.
- wrapper/dates.ts:241-248 normalizes zoneless instants (appends `Z`, re-serializes via toISOString, returns undefined for unparseable; comment: "never send" raw).
log.ts's `--end` bypasses both. Asymmetry (start canonical, end raw) is decisively proven.
```

### Implementation steps

STEP 1 — Edit `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/src/commands/log.ts`.

Locate this EXACT block (lines 59-66):

    const endIso = opts.end ?? new Date().toISOString();
    const endMs = Date.parse(endIso);
    if (Number.isNaN(endMs)) {
        throw new Error(
            `--end ${JSON.stringify(opts.end)} is not a valid ISO 8601 timestamp`,
        );
    }
    const startIso = new Date(endMs - seconds * 1000).toISOString();

Replace it with EXACTLY:

    const endInput = opts.end ?? new Date().toISOString();
    const endMs = Date.parse(endInput);
    if (Number.isNaN(endMs)) {
        throw new Error(
            `--end ${JSON.stringify(opts.end)} is not a valid ISO 8601 timestamp`,
        );
    }
    const endIso = new Date(endMs).toISOString();
    const startIso = new Date(endMs - seconds * 1000).toISOString();

No other edits to this file. `body.end` (line 70) and the receipt `end` (line 90) already reference `endIso`, which is now canonical. No new imports are needed.

STEP 2 — Add the test described in `test_to_add` to the existing CLI test file.

### Test to add

In `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/tests/log.test.ts`, add the following test INSIDE the existing `describe("log command", () => { ... })` block, immediately after the closing `});` of the `it("rejects an invalid --end timestamp", ...)` test (i.e. after line 82, before the `it("errors when --task ...")` test):

    it("canonicalizes a parseable-but-non-RFC3339 --end to full RFC3339 on the wire", async () => {
        const { client, created } = makeClient();
        await run(client, ["30m", "work", "--end", "2026-06-01"]);
        const body = (created[0] as { body?: { end?: string; start?: string } })?.body;
        // Bare date is promoted to a full UTC instant, not sent raw.
        expect(body?.end).toBe("2026-06-01T00:00:00.000Z");
        // start derives from the same instant: end - 30m.
        expect(body?.start).toBe("2026-05-31T23:30:00.000Z");
    });

Run just this test file with:

    npm test -w @apet97/clockify-cli-115 -- tests/log.test.ts

### Verify

```bash
cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk && npm run type-check -w @apet97/clockify-cli-115 && npm test -w @apet97/clockify-cli-115 -- tests/log.test.ts && npm run lint -w @apet97/clockify-cli-115
```

### Rollback

git checkout -- cli/src/commands/log.ts cli/tests/log.test.ts

---

## Task 27 — [LOW] Sync shared-reports --type allowlist (CLI + MCP) to the 19-member generated wire union

- **Severity:** LOW  •  **Category:** correctness / API-contract drift  •  **Task id:** `cli-rest-1`
- **Files:** `cli/src/commands/sharedReports.ts`, `mcp/src/tools/sharedReports.ts`, `cli/tests/read-commands-users-tags-shared-reports.test.ts`

### Problem

Two hand-maintained `SHARED_REPORT_TYPES` allowlists each carry only 14 of the 19 report-type literals declared by the generated wire union `ClockifyRequestBody<ClockifyApi.SharedReportCreate>["type"]` (wrapper/src/api/resources/sharedReports/client/requests/SharedReportCreate.ts and UpdateSharedReportsRequest.ts). The 5 missing literals are exactly KIOSK_PIN_LIST, INVOICE_AMOUNT_LIST, INVOICE_DETAILED, TIMEOFF_HOLIDAY, TIMEOFF_BALANCE. As a result `clk115 shared-reports create|update --type KIOSK_PIN_LIST` (and the 4 others) throws a misleading `Unknown --type` error in cli/src/commands/sharedReports.ts requireType() (called from create + update), even though the value is a declared-valid wire type and is present in the corrected spec, the official spec, and the generated wrapper docs. The MCP twin mcp/src/tools/sharedReports.ts duplicates the identical 14-item list via `z.enum`, rejecting the same 5. Both copies are independent and must be fixed together or they will re-diverge.

### Proof (independent opus-max verifier)

```
I read all relevant files directly. CLI SHARED_REPORT_TYPES (cli/src/commands/sharedReports.ts:39-54) is a 14-literal array; requireType() (lines 70-76) does `if (!SHARED_REPORT_TYPES.includes(type)) throw "Unknown --type ..."` and is invoked in create (line 126) and update (line 169). The generated wire union in wrapper/src/api/resources/sharedReports/client/requests/SharedReportCreate.ts:12,24 and UpdateSharedReportsRequest.ts:13,26 is the 19-member literal union `"SUMMARY"|"DETAILED"|"WEEKLY"|"EXPENSE_DETAILED"|"INVOICE_TIME"|"KIOSK_PIN_LIST"|"ATTENDANCE_DETAILED"|"ATTENDANCE_SUMMARY"|"ASSIGNMENT_LIST"|"ASSIGNMENT_SCHEDULE"|"APPROVAL_DETAILED"|"APPROVAL_SUMMARY"|"BALANCE_LIST"|"INVOICE_AMOUNT_LIST"|"INVOICE_DETAILED"|"TIMEOFF_DETAILED"|"TIMEOFF_HOLIDAY"|"TIMEOFF_BALANCE"|"EXPENSE_SUMMARY"`. A computed comm(1) diff shows the CLI list is a strict subset whose missing 5 are exactly KIOSK_PIN_LIST, INVOICE_AMOUNT_LIST, INVOICE_DETAILED, TIMEOFF_HOLIDAY, TIMEOFF_BALANCE (nothing extra in the CLI). Those 5 are also present in the repo's live-gated corrected spec under the SharedReportCreate schema's own type enum (spec/corrected/clockify.corrected.openapi.yaml:19980-19996), the official spec, and the generated wrapper docs (wrapper/docs/resources/sharedReports.md). So clk115 shared-reports create/update --type KIOSK_PIN_LIST (etc.) fails locally with a misleading 'Unknown --type' although the value is a declared-valid wire type. requireType even casts its return to ClockifyRequestBody<SharedReportCreate>["type"] (the 19-member union), so the CLI is over-restrictive relative to its own return type. The MCP twin mcp/src/tools/sharedReports.ts:15-30 carries the identical 14-item list via z.enum and rejects the same 5.
```

### Implementation steps

Make THREE edits. Each has an exact verbatim before/after block. Apply them exactly; do not reorder list entries beyond what is shown.

=== EDIT 1 of 3: CLI allowlist (add the 5 missing literals in wire order) ===
File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/src/commands/sharedReports.ts

FIND (exact, verbatim — lines 39-54):
```
const SHARED_REPORT_TYPES = [
    "SUMMARY",
    "DETAILED",
    "WEEKLY",
    "EXPENSE_DETAILED",
    "INVOICE_TIME",
    "ATTENDANCE_DETAILED",
    "ATTENDANCE_SUMMARY",
    "ASSIGNMENT_LIST",
    "ASSIGNMENT_SCHEDULE",
    "APPROVAL_DETAILED",
    "APPROVAL_SUMMARY",
    "BALANCE_LIST",
    "TIMEOFF_DETAILED",
    "EXPENSE_SUMMARY",
];
```

REPLACE WITH (exact):
```
const SHARED_REPORT_TYPES = [
    "SUMMARY",
    "DETAILED",
    "WEEKLY",
    "EXPENSE_DETAILED",
    "INVOICE_TIME",
    "KIOSK_PIN_LIST",
    "ATTENDANCE_DETAILED",
    "ATTENDANCE_SUMMARY",
    "ASSIGNMENT_LIST",
    "ASSIGNMENT_SCHEDULE",
    "APPROVAL_DETAILED",
    "APPROVAL_SUMMARY",
    "BALANCE_LIST",
    "INVOICE_AMOUNT_LIST",
    "INVOICE_DETAILED",
    "TIMEOFF_DETAILED",
    "TIMEOFF_HOLIDAY",
    "TIMEOFF_BALANCE",
    "EXPENSE_SUMMARY",
];
```
Note: do NOT add a type annotation or `as const` to this CLI array. requireType() calls `SHARED_REPORT_TYPES.includes(type)` where `type` is a `string`; narrowing the element type would break that `.includes(...)` call. Leave it as a plain `string[]`.

=== EDIT 2 of 3: MCP allowlist (add the same 5, keep `as const`) ===
File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/src/tools/sharedReports.ts

FIND (exact, verbatim — lines 15-30):
```
const SHARED_REPORT_TYPES = [
    "SUMMARY",
    "DETAILED",
    "WEEKLY",
    "EXPENSE_DETAILED",
    "INVOICE_TIME",
    "ATTENDANCE_DETAILED",
    "ATTENDANCE_SUMMARY",
    "ASSIGNMENT_LIST",
    "ASSIGNMENT_SCHEDULE",
    "APPROVAL_DETAILED",
    "APPROVAL_SUMMARY",
    "BALANCE_LIST",
    "TIMEOFF_DETAILED",
    "EXPENSE_SUMMARY",
] as const;
```

REPLACE WITH (exact):
```
const SHARED_REPORT_TYPES = [
    "SUMMARY",
    "DETAILED",
    "WEEKLY",
    "EXPENSE_DETAILED",
    "INVOICE_TIME",
    "KIOSK_PIN_LIST",
    "ATTENDANCE_DETAILED",
    "ATTENDANCE_SUMMARY",
    "ASSIGNMENT_LIST",
    "ASSIGNMENT_SCHEDULE",
    "APPROVAL_DETAILED",
    "APPROVAL_SUMMARY",
    "BALANCE_LIST",
    "INVOICE_AMOUNT_LIST",
    "INVOICE_DETAILED",
    "TIMEOFF_DETAILED",
    "TIMEOFF_HOLIDAY",
    "TIMEOFF_BALANCE",
    "EXPENSE_SUMMARY",
] as const;
```
Keep the trailing `] as const;` exactly so `z.enum(SHARED_REPORT_TYPES)` (used at lines 83 and 122) stays valid.

=== EDIT 3 of 3: add a positive CLI test for a newly-allowed type ===
File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/tests/read-commands-users-tags-shared-reports.test.ts

FIND (exact, verbatim — the close of the existing create test, lines 264-278):
```
        await expect(
            makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "shared-reports",
                "create",
                "--name",
                "Bad",
                "--type",
                "not-real",
                "--filter",
                "{}",
            ]),
        ).rejects.toThrow(/Unknown --type/);
    });
});
```

REPLACE WITH (exact):
```
        await expect(
            makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "shared-reports",
                "create",
                "--name",
                "Bad",
                "--type",
                "not-real",
                "--filter",
                "{}",
            ]),
        ).rejects.toThrow(/Unknown --type/);
    });

    it("shared-reports create accepts the wire-union type KIOSK_PIN_LIST", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            sharedReports: {
                create: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return { id: "sr-4", name: (req.body as { name?: string }).name };
                },
            },
        };
        await makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "shared-reports",
            "create",
            "--name",
            "Kiosk",
            "--type",
            "kiosk_pin_list",
            "--filter",
            "{\"dateRangeStart\":\"2026-06-01\"}",
        ]);
        expect(calls[0].body).toMatchObject({ name: "Kiosk", type: "KIOSK_PIN_LIST" });
    });
});
```

### Test to add

A new positive-path test in /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/cli/tests/read-commands-users-tags-shared-reports.test.ts named `shared-reports create accepts the wire-union type KIOSK_PIN_LIST` (full code given in EDIT 3 above). It invokes `clk115 shared-reports create --type kiosk_pin_list` against a stub client and asserts the forwarded body is `{ name: "Kiosk", type: "KIOSK_PIN_LIST" }`, proving the lowercase input is upper-cased and accepted (it would throw `Unknown --type` before the fix). Run just this test:

npm test -w @apet97/clockify-cli-115 -- read-commands-users-tags-shared-reports

### Verify

```bash
Run from repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk. If output/ts-sdk and wrapper/src are not yet generated in this clone, first run `make sdk-codegen` (needed so `ClockifyApi.SharedReportCreate` resolves during type-check). Then:

npm run type-check -w @apet97/clockify-cli-115
npm test -w @apet97/clockify-cli-115 -- read-commands-users-tags-shared-reports
npm run type-check -w @apet97/clockify-mcp-115
npm test -w @apet97/clockify-mcp-115

All four must pass (the focused CLI test and both type-checks confirm the 19-literal arrays compile and the new type is accepted).
```

### Rollback

git checkout -- cli/src/commands/sharedReports.ts mcp/src/tools/sharedReports.ts cli/tests/read-commands-users-tags-shared-reports.test.ts

---

## Task 28 — [LOW] Normalize blank/whitespace CLOCKIFY_BASE_URL to unset in loadContext so the MCP server falls back to the default Clockify host instead of crashing at startup

- **Severity:** LOW  •  **Category:** error-handling  •  **Task id:** `mcp-core-1`
- **Files:** `mcp/src/client.ts`, `mcp/tests/client.test.ts`

### Problem

When valid CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID are set but CLOCKIFY_BASE_URL is the empty string "" (or whitespace-only), the MCP server crashes at startup instead of degrading gracefully. In /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/src/client.ts line 111, `const environment = env.CLOCKIFY_BASE_URL;` reads the raw env value with no blank-normalization, so `environment === ""`. The `if (!apiKey || !workspaceId)` guard at line 113 does not short-circuit (creds are valid), and at line 127 `environment !== undefined` is true for "", so `{ environment: "" }` is forwarded into createClockifyClient. The wrapper validator (wrapper/create-client.ts validateClockifyBaseUrl) runs `new URL("")`, which throws `TypeError: Invalid URL`, classifies the result as "unparseable", and throws `TypeError("createClockifyClient: base URL \"\" is not a valid absolute URL.")` unconditionally. There is no try/catch around the createClockifyClient call in loadContext, so the TypeError propagates up through mcp/src/index.ts main() -> main().catch() -> process.exit(1). The server dies before connecting stdio; no tool is reachable. This contradicts the module's deliberate deferred-setup design (blank creds are treated as unset and yield a graceful setup_required context; the wrapper's own readEnv/isSupplied treat blank/whitespace as not-supplied; the MCP doctor tool reads the same var with `if (!rawBaseUrl)` plus try/catch). loadContext's startup path is the only one that crashes on a blank base URL.

### Proof (independent opus-max verifier)

```
Trace independently verified by reading the actual files (line numbers confirmed) plus one empirical JS check.

LINCHPIN (empirical): `node -e 'new URL("")'` throws `TypeError: Invalid URL`. Confirmed locally.

PATH:
1. mcp/src/client.ts:111 `const environment = env.CLOCKIFY_BASE_URL;` reads the raw process-env value with NO blank-normalization. For a blank var, environment === "".
2. client.ts:113 `if (!apiKey || !workspaceId)` — with valid creds this is false, so execution continues (the finding's scenario = valid creds + blank base URL is reachable).
3. client.ts:125-129 `createClockifyClient({ apiKey, ...(environment !== undefined ? { environment } : {}), ...options })` — since "" !== undefined is TRUE, `{ environment: "" }` is forwarded. There is NO try/catch around this call (the only try/catch in client.ts is at line 83 inside createCurrentUserIdMemo, unrelated).
4. wrapper/create-client.ts:414 `validateClockifyBaseUrl(rawEnvironment="", allowInsecureBaseUrl=undefined→false)`.
5. create-client.ts:282-292 validateClockifyBaseUrl: `typeof "" === "string"` is true so it proceeds → classifyClockifyBaseUrl("") (line 224) does `new URL("")` (line 227) which throws → catch (228) returns `{ allowed:false, category:"unparseable" }` → back in validate, `result.category === "unparseable"` (line 291) throws `TypeError("createClockifyClient: base URL \"\" is not a valid absolute URL.")` UNCONDITIONALLY — before the allowInsecure check, so even allowInsecureBaseUrl:true cannot suppress it.
6. mcp/src/index.ts:13-19 main() calls loadContext() with no surrounding catch → the TypeError becomes a rejected promise → index.ts:28-32 `main().catch(...)` writes `fatal: ...` to stderr and calls `process.exit(1)`. The server process dies before connecting stdio; no tool is ever reachable.

This contradicts the module's deliberate deferred-setup design (client.ts:14-18, 59-64: 'the server stays up and every tool explains the fix instead of the process crashing at startup'). The inconsistency is confirmed at four independent points reading the SAME env var or sibling vars:
- Blank CLOCKIFY_API_KEY / CLOCKIFY_WORKSPACE_ID are treated as missing → graceful makeSetupRequiredContext (server stays up), because `!""` is true at client.ts:113.
- wrapper readEnv (create-client.ts:177-180) returns undefined for "" (`value != null && value !== ""`).
- wrapper isSupplied (diagnostics.ts:3
…[truncated]
```

### Implementation steps

STEP 1 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/src/client.ts

Locate this exact line inside the `loadContext` function (line 111):

    const environment = env.CLOCKIFY_BASE_URL;

Replace it with exactly this (normalizes blank AND whitespace-only values to unset, matching the wrapper's isSupplied `.trim()` convention):

    const environment = env.CLOCKIFY_BASE_URL?.trim() || undefined;

No other lines in client.ts change. The surrounding context after the edit is:

    const apiKey = env.CLOCKIFY_API_KEY;
    const workspaceId = env.CLOCKIFY_WORKSPACE_ID;
    const environment = env.CLOCKIFY_BASE_URL?.trim() || undefined;

    if (!apiKey || !workspaceId) {

With this change, line 127's `environment !== undefined ? { environment } : {}` evaluates to `{}` for blank/whitespace input, nothing is forwarded, and createClockifyClient uses the default api.clockify.me host. Non-empty strings are still passed through verbatim and validated exactly as before (the existing malicious-host / http / loopback / proxy / proxy-opt-in cases are unaffected because their values are non-empty after trim).

STEP 2 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/client.test.ts

See the test_to_add field for the exact regression test and where to insert it.

### Test to add

In /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/client.test.ts, inside the existing `describe("MCP base URL allowlist (H1)", () => { ... })` block, add the two test cases below immediately after the existing test that ends at line 96 (the `it("accepts an unset CLOCKIFY_BASE_URL (default Clockify host)", ...)` test). 

Locate this exact existing block:

    it("accepts an unset CLOCKIFY_BASE_URL (default Clockify host)", () => {
        const ctx = loadContext({ ...goodEnv });
        expect(ctx.workspaceId).toBe("ws");
    });

Replace it with (the original test, unchanged, followed by the two new tests):

    it("accepts an unset CLOCKIFY_BASE_URL (default Clockify host)", () => {
        const ctx = loadContext({ ...goodEnv });
        expect(ctx.workspaceId).toBe("ws");
    });

    it("treats a blank CLOCKIFY_BASE_URL as unset (default Clockify host, no crash)", () => {
        const ctx = loadContext({ ...goodEnv, CLOCKIFY_BASE_URL: "" });
        expect(ctx.workspaceId).toBe("ws");
    });

    it("treats a whitespace-only CLOCKIFY_BASE_URL as unset (default Clockify host, no crash)", () => {
        const ctx = loadContext({ ...goodEnv, CLOCKIFY_BASE_URL: "   " });
        expect(ctx.workspaceId).toBe("ws");
    });

Run just this test file from the repo root:

    npm test -w @apet97/clockify-mcp-115 -- client.test.ts

### Verify

```bash
From the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk run, in order:

1. npm run type-check -w @apet97/clockify-mcp-115
2. npm test -w @apet97/clockify-mcp-115 -- client.test.ts
3. npm test -w @apet97/clockify-mcp-115

All three must exit 0. The new "blank" and "whitespace-only" tests must pass, and all six pre-existing base-URL tests (unset / malicious / http / loopback / proxy-reject / proxy-opt-in) must remain green.
```

### Rollback

git checkout -- mcp/src/client.ts mcp/tests/client.test.ts

---

## Task 29 — [LOW] demoCleanup task delete must mark the task DONE before deleting (active-task DELETE 400s), so cleanup stops emitting spurious cleanup_failed warnings and the receipt count is correct

- **Severity:** LOW  •  **Category:** error-handling  •  **Task id:** `mcp-wf-4`
- **Files:** `mcp/src/tools/workflows/demo.ts`, `mcp/tests/workflows.test.ts`

### Problem

In `mcp/src/tools/workflows/demo.ts`, the `demoCleanup` task-deletion loop (lines 99-107) issues a BARE `tasks.delete` with no DONE-first step. Clockify 400s on DELETE of an ACTIVE task ("Cannot delete an active task", live-verified in spec/evidence/discrepancies.md:2416-2418). Demo tasks are seeded ACTIVE by `createWorkPackage` (resolve.ts:170-174 creates them with no status), and `demoSeed` never marks them DONE. So at cleanup the bare delete 400s; `cleanupEntity` (demo.ts:182-187) swallows the error into a `cleanup_failed` warning and does NOT push the task into `deleted[]`, so the receipt's `deleted` count undercounts. (The later project archive+delete cascade removes the orphaned task in the happy path, but the spurious warning and undercount remain, and the task leaks if the project delete fails.) The two other delete sites in this repo already compensate: `clockify_tasks_delete` (tasks.ts) and the `createWorkPackage` undo (resolve.ts:184-199) both PUT `status:"DONE"` before delete. The fix mirrors that live-verified pattern. All needed imports (`wireBody`, `ClockifyApi`, `str`, `idOf`) are already present in demo.ts (lines 1 and 5).

### Implementation steps

STEP 1 — Fix the source. File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/src/tools/workflows/demo.ts

Locate this EXACT block (lines 99-107):

```
        for (const task of tasks) {
            await cleanupEntity("task", task, deleted, warnings, () =>
                ctx.client.tasks.delete({
                    workspaceId: ctx.workspaceId,
                    projectId: idOf(project),
                    taskId: idOf(task),
                }),
            );
        }
```

Replace it with EXACTLY:

```
        for (const task of tasks) {
            await cleanupEntity("task", task, deleted, warnings, async () => {
                // Clockify 400s on DELETE of an ACTIVE task ("Cannot delete an
                // active task", live-verified) - mark DONE first, like
                // clockify_tasks_delete and the createWorkPackage undo. The list
                // row already carries the name the replace-PUT requires.
                await ctx.client.tasks.update(
                    wireBody<ClockifyApi.UpdateTasksRequest>({
                        workspaceId: ctx.workspaceId,
                        projectId: idOf(project),
                        taskId: idOf(task),
                        name: str(task.name),
                        status: "DONE",
                    }),
                );
                await ctx.client.tasks.delete({
                    workspaceId: ctx.workspaceId,
                    projectId: idOf(project),
                    taskId: idOf(task),
                });
            });
        }
```

Do NOT add any new imports — `wireBody` and `ClockifyApi` are imported on line 1 (`import { wireBody, type ClockifyApi } from "clockify-sdk-ts-115/requests";`) and `idOf`, `str` are imported on line 5.

STEP 2 — Add the missing `tasks.update` mock so the test fixture models the new call. File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/workflows.test.ts

Locate this EXACT block (the `tasks.delete` mock, lines 108-112):

```
                delete: async (body: { taskId: string }) => {
                    state.cleanupRequests.push({ type: "task.delete", body });
                    state.tasks = state.tasks.filter((task) => task.id !== body.taskId);
                    return {};
                },
```

Replace it with EXACTLY (this prepends an `update` handler before the existing `delete` handler):

```
                update: async (body: { projectId: string; taskId: string; name?: string; status?: string }) => {
                    state.cleanupRequests.push({ type: "task.update", body });
                    const task = state.tasks.find((item) => item.id === body.taskId);
                    if (!task) throw Object.assign(new Error("task not found"), { statusCode: 404 });
                    Object.assign(task, body);
                    return task;
                },
                delete: async (body: { taskId: string }) => {
                    state.cleanupRequests.push({ type: "task.delete", body });
                    state.tasks = state.tasks.filter((task) => task.id !== body.taskId);
                    return {};
                },
```

STEP 3 — Extend the demo_cleanup assertion to require the DONE-first update. SAME file: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/workflows.test.ts

Locate this EXACT block (lines 690-691):

```
                { type: "tag.delete", body: expect.objectContaining({ tagId: "tg-demo" }) },
                {
                    type: "project.update",
```

Replace it with EXACTLY (this inserts a `task.update` expectation between the tag.delete and project.update expectations):

```
                { type: "tag.delete", body: expect.objectContaining({ tagId: "tg-demo" }) },
                {
                    type: "task.update",
                    body: expect.objectContaining({
                        projectId: "p-demo",
                        taskId: "ta-demo",
                        name: "DEMO-clean-task",
                        status: "DONE",
                    }),
                },
                {
                    type: "project.update",
```

Leave every other line in the test (including `deleted: 5` and the `task.delete` expectation) unchanged.

### Test to add

No new test file. The fix is covered by EXTENDING the existing test `demo_cleanup deletes deterministic entries and objects after archiving active parents` in /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/workflows.test.ts via STEP 2 (adds the `tasks.update` mock that records `{ type: "task.update", body }` into `state.cleanupRequests`) and STEP 3 (asserts the recorded sequence now contains a `task.update` with `{ projectId: "p-demo", taskId: "ta-demo", name: "DEMO-clean-task", status: "DONE" }` before the `task.delete`). Without STEP 1 the new assertion fails (no task.update is recorded). Without STEP 2 the source's new `tasks.update` call throws, the task is not deleted, and the `deleted: 5` assertion drops to 4. Run just this test from the repo root:

cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp && npx vitest run tests/workflows.test.ts -t "demo_cleanup deletes deterministic entries"

### Verify

```bash
Run all from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk, in order:

1. Focused test (must pass):
   cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp && npx vitest run tests/workflows.test.ts -t "demo_cleanup deletes deterministic entries"

2. Type-check the MCP package (must pass):
   npm run type-check -w @apet97/clockify-mcp-115

3. Full MCP test suite (must pass):
   npm test -w @apet97/clockify-mcp-115

4. MCP lint (must pass — not covered by type-check/test):
   npm run lint -w @apet97/clockify-mcp-115

5. MCP build (must pass):
   npm run build -w @apet97/clockify-mcp-115
```

### Rollback

git checkout -- mcp/src/tools/workflows/demo.ts mcp/tests/workflows.test.ts

---

## Task 30 — [LOW] Clamp clockify_audit_log_search pageSize to the audit-log host's documented max of 50 (was 200)

- **Severity:** LOW  •  **Category:** wire-shape  •  **Task id:** `mcp-read-1`
- **Files:** `mcp/src/tools/audit.ts`, `mcp/tests/audit.test.ts`

### Problem

The MCP tool `clockify_audit_log_search` advertises and forwards a `pageSize` up to 200, but the audit-log service (served from the dedicated host `https://auditlog-api.api.clockify.me/v1`) caps `page-size` at 50. The repo's authoritative corrected spec `spec/corrected/clockify.corrected.openapi.yaml` defines the `AuditLogRequest` body's `page-size` with `minimum: 1`, `maximum: 50`, `default: 20` — distinct from the ubiquitous main-host 50/200 list shape. Nothing downstream clamps the value: the generated wrapper request type leaves `page-size` unbounded and the generated client forwards it raw via `core.bodyFromRequest`. So a model that picks `pageSize` in 51..200 sends an out-of-spec value to the audit host (risk: 400 error or silent under-fetch). The fix tightens the Zod bound from `.max(200)` to `.max(50)` so the model-visible JSON Schema matches the documented wire contract.

### Proof (independent opus-max verifier)

```
Independently verified spec-diff (the finding's declared proof method), all in-repo and decisive:

1) MCP over-advertises and forwards verbatim. mcp/src/tools/audit.ts:36 `pageSize: z.number().int().min(1).max(200).default(50).optional(),` and audit.ts:51 `"page-size": args.pageSize ?? 50,`. No clamp anywhere downstream: the generated wrapper/src/api/resources/auditLogReport/client/requests/SearchAuditLogReportRequest.ts types `"page-size"?: number` (no bound) and the generated client forwards via `core.bodyFromRequest(request, ["actions","authors","end","page","page-size","start"])` with no min/max enforcement. So a model-supplied pageSize in 51..200 reaches the audit-log host unchanged.

2) The repo's authoritative corrected spec documents a tighter cap for this host. spec/corrected/clockify.corrected.openapi.yaml `AuditLogRequest` (lines 14894-14899): `page-size:` `default: 20`, `maximum: 50`, `minimum: 1`. The operation is served from the dedicated host `https://auditlog-api.api.clockify.me/v1` (spec line 1104), distinct from api.clockify.me/api/v1.

3) The MCP `max(200).default(50)` convention is the MAIN-host shape, not the audit-log shape. Main-host list endpoints in the same spec carry `page-size: default:50, maximum:200` (lines 1607-1613, 2877-2883, 5764-5770, 9560-9566, 9830-9836). The audit-log body schema is a deliberate outlier (20/50). audit.ts applied the standard convention without honoring the audit host's documented tighter bound, so the model-visible JSON Schema offers an impossible (per spec) page size of up to 200.
```

### Implementation steps

CHANGE 1 — Source file: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/src/tools/audit.ts

Locate this EXACT line (line 36, inside the `inputSchema` object of the `clockify_audit_log_search` tool):

                pageSize: z.number().int().min(1).max(200).default(50).optional(),

Replace it with EXACTLY:

                pageSize: z.number().int().min(1).max(50).default(50).optional(),

Do NOT touch line 51 (`"page-size": args.pageSize ?? 50,`) — the default 50 is within the new max and remains wire-valid, so the handler needs no change. No new imports are required.

CHANGE 2 — Test file: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/audit.test.ts

(2a) In the test titled "forwards explicit authorIds, DOES_NOT_CONTAIN mode, and pagination overrides", locate this EXACT block (lines 96-105):

            arguments: {
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                actions: ["DELETE_TASK"],
                authorIds: ["user-1", "SYSTEM"],
                authorsMode: "DOES_NOT_CONTAIN",
                page: 3,
                pageSize: 200,
            },

Replace it with EXACTLY:

            arguments: {
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                actions: ["DELETE_TASK"],
                authorIds: ["user-1", "SYSTEM"],
                authorsMode: "DOES_NOT_CONTAIN",
                page: 3,
                pageSize: 50,
            },

(2b) In the same test, locate this EXACT block (lines 107-115) — the `expect(captured.search).toEqual(...)` assertion:

        expect(captured.search).toEqual({
            workspaceId: "ws-1",
            start: "2026-06-01T00:00:00Z",
            end: "2026-06-07T00:00:00Z",
            actions: ["DELETE_TASK"],
            authors: { authorIds: ["user-1", "SYSTEM"], contains: "DOES_NOT_CONTAIN" },
            page: 3,
            "page-size": 200,
        });

Replace it with EXACTLY:

        expect(captured.search).toEqual({
            workspaceId: "ws-1",
            start: "2026-06-01T00:00:00Z",
            end: "2026-06-07T00:00:00Z",
            actions: ["DELETE_TASK"],
            authors: { authorIds: ["user-1", "SYSTEM"], contains: "DOES_NOT_CONTAIN" },
            page: 3,
            "page-size": 50,
        });

(2c) Locate the entire test titled with the ">200" boundary (lines 203-217). Find this EXACT block:

    it("rejects an out-of-range pageSize (>200) before reaching the SDK", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(auditContext(captured));
        const res = await client.callTool({
            name: "clockify_audit_log_search",
            arguments: {
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                actions: ["CREATE_PROJECT"],
                pageSize: 201,
            },
        });
        expect(res.isError).toBe(true);
        expect(captured.search).toBeUndefined();
    });

Replace it with EXACTLY:

    it("rejects an out-of-range pageSize (>50) before reaching the SDK", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(auditContext(captured));
        const res = await client.callTool({
            name: "clockify_audit_log_search",
            arguments: {
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                actions: ["CREATE_PROJECT"],
                pageSize: 51,
            },
        });
        expect(res.isError).toBe(true);
        expect(captured.search).toBeUndefined();
    });

### Test to add

No NEW test file is created. The existing test suite /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/mcp/tests/audit.test.ts is updated in lockstep (CHANGE 2 above) so it covers the new bound: (a) test "forwards explicit authorIds, DOES_NOT_CONTAIN mode, and pagination overrides" now round-trips the in-range value `pageSize: 50` to `"page-size": 50`, proving valid values still forward; (b) test "rejects an out-of-range pageSize (>50) before reaching the SDK" now sends `pageSize: 51` and asserts `res.isError === true` with `captured.search === undefined`, proving the new `.max(50)` Zod bound rejects 51 before the handler runs.

Run ONLY this test file with:

npm test -w @apet97/clockify-mcp-115 -- audit.test.ts

### Verify

```bash
cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk

# 1. Run just the affected test file (must pass):
npm test -w @apet97/clockify-mcp-115 -- audit.test.ts

# 2. Type-check the MCP package (must pass):
npm run type-check -w @apet97/clockify-mcp-115

# 3. Lint the MCP package (must pass):
npm run lint -w @apet97/clockify-mcp-115

# 4. Full MCP test suite (must pass):
npm test -w @apet97/clockify-mcp-115
```

### Rollback

git checkout -- mcp/src/tools/audit.ts mcp/tests/audit.test.ts

---

## Task 31 — [LOW] Delete dead, divergent requestRuntimeSource() template from the SDK emitter

- **Severity:** LOW  •  **Category:** maintainability / dead-code  •  **Task id:** `codegen-3`
- **Files:** `scripts/sdk-codegen/emitter.mjs`, `scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs`

### Problem

scripts/sdk-codegen/emitter.mjs defines two request-runtime template functions. The active generator (scripts/generate-sdk-from-openapi.mjs imports generate -> writeCore) writes core/request.ts at emitter.mjs line 39 using requestRuntimeSourceWithTimeoutAndRetry() (defined line 53). The OTHER function, requestRuntimeSource() (lines 49-51), is never exported and has zero callers: grep -rEn "requestRuntimeSource\b" scripts/ matches only its own definition at line 49. It is also divergent and unsafe if ever wired: its OperationSpec interface omits the baseUrl?: string field, its baseUrl precedence omits the `?? operation.baseUrl` arm (so per-operation host routing for reports.api.clockify.me / auditlog-api.api.clockify.me would silently break the precedence documented in spec/evidence/discrepancies.md:1949-1955), and its request path has a single fetch call with no retry loop and no fetchWithTimeout (drops all retry/timeout). It is a near-duplicate footgun under the shorter, more tempting name. Delete it. Codegen output is unchanged because nothing emits this template.

### Implementation steps

STEP 1 — Delete the dead function (lines 49-51 plus its trailing blank line 52) in /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/sdk-codegen/emitter.mjs.

The body of this function (line 50) is a single very long template-literal line, so do NOT hand-retype it. Run this exact, deterministic command (BSD/macOS sed; note the empty `''` after -i):

  sed -i '' '/^function requestRuntimeSource() {$/,/^$/d' /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/sdk-codegen/emitter.mjs

This removes the contiguous block starting at the line that is exactly `function requestRuntimeSource() {` through the first following empty line (inclusive), which spans the signature (49), the one-line `return \`...\`;` body (50), the closing `}` (51), and the blank separator (52). The start anchor `^function requestRuntimeSource() {$` matches ONLY line 49 (verified by grep). The function `requestRuntimeSourceWithTimeoutAndRetry()` is untouched.

BEFORE (lines 47-53, with line 50 abbreviated as `<<long template literal>>`):

    }

    function requestRuntimeSource() {
        return `${GENERATED_BANNER}<<long template literal>>`;
    }

    function requestRuntimeSourceWithTimeoutAndRetry() {

AFTER (lines 47-49):

    }

    function requestRuntimeSourceWithTimeoutAndRetry() {

STEP 2 — Confirm the deletion left exactly one blank line between writeCore's closing `}` and `function requestRuntimeSourceWithTimeoutAndRetry()`, and that the dead name is gone, with this exact command:

  grep -nE "requestRuntimeSource\b" /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/sdk-codegen/emitter.mjs

Expected output: exactly two lines, the call site (`await write(outDir, "core/request.ts", requestRuntimeSourceWithTimeoutAndRetry());`) and the definition (`function requestRuntimeSourceWithTimeoutAndRetry() {`). There must be NO line reading `function requestRuntimeSource() {`.

STEP 3 — Add a regression test that fails if a future edit swaps line 39 back to a template lacking per-operation baseUrl routing or retry/timeout. In /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs, insert a new test immediately before the existing second test.

Locate this exact line (the start of the second test):

    test("unsupported schema features fail with JSON-pointer diagnostics and a receipt", async () => {

Replace that single line with the following block (the new test, a blank line, then the original line unchanged):

    test("emitted request runtime keeps per-operation baseUrl routing and retry/timeout", async () => {
        const temp = await mkdtemp(path.join(os.tmpdir(), "clockify-codegen-runtime-"));
        try {
            const out = path.join(temp, "out");
            await runGenerator([
                "--write",
                "--input",
                path.join(fixtures, "golden.openapi.yaml"),
                "--out",
                out,
                "--receipt",
                path.join(temp, "receipt.json"),
            ]);

            const requestRuntime = await readGenerated(out, "core/request.ts");
            assert.match(requestRuntime, /baseUrl\?: string;/);
            assert.match(requestRuntime, /\?\? operation\.baseUrl \?\? ClockifyApiEnvironment\.Default/);
            assert.match(requestRuntime, /fetchWithTimeout\(/);
            assert.match(requestRuntime, /for \(let attempt = 0; ; attempt\+\+\)/);
        } finally {
            await rm(temp, { recursive: true, force: true });
        }
    });

    test("unsupported schema features fail with JSON-pointer diagnostics and a receipt", async () => {

This reuses the file's existing imports (assert, mkdtemp, rm, os, path, fixtures, test) and the existing `runGenerator` and `readGenerated` helpers; no new imports are required.

### Test to add

Full test added to /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs (inserted before the "unsupported schema features..." test):

    test("emitted request runtime keeps per-operation baseUrl routing and retry/timeout", async () => {
        const temp = await mkdtemp(path.join(os.tmpdir(), "clockify-codegen-runtime-"));
        try {
            const out = path.join(temp, "out");
            await runGenerator([
                "--write",
                "--input",
                path.join(fixtures, "golden.openapi.yaml"),
                "--out",
                out,
                "--receipt",
                path.join(temp, "receipt.json"),
            ]);

            const requestRuntime = await readGenerated(out, "core/request.ts");
            assert.match(requestRuntime, /baseUrl\?: string;/);
            assert.match(requestRuntime, /\?\? operation\.baseUrl \?\? ClockifyApiEnvironment\.Default/);
            assert.match(requestRuntime, /fetchWithTimeout\(/);
            assert.match(requestRuntime, /for \(let attempt = 0; ; attempt\+\+\)/);
        } finally {
            await rm(temp, { recursive: true, force: true });
        }
    });

Run just this test file from the repo root (/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk):

  npm run test:codegen

(That script is `node --test scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs`.) Expected: all tests pass, including the new "emitted request runtime keeps per-operation baseUrl routing and retry/timeout".

### Verify

```bash
Run all from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

1. Confirm dead name is gone and only the live variant remains:
   grep -nE "requestRuntimeSource\b" scripts/sdk-codegen/emitter.mjs
   (must print exactly two lines, neither being `function requestRuntimeSource() {`)

2. Run the codegen test suite (includes the new regression test):
   npm run test:codegen
   (must report all tests passing, 0 failures)

3. Confirm real codegen output is unchanged and still type-checks:
   make sdk-codegen
   npm run type-check -w clockify-sdk-ts-115
   (both must exit 0)
```

### Rollback

git checkout -- scripts/sdk-codegen/emitter.mjs scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs

---

## Task 32 — [LOW] Gate npm publish on event_name == 'push' in addition to ref_type == 'tag' in both CLI and MCP release workflows

- **Severity:** LOW  •  **Category:** correctness  •  **Task id:** `ci-rel-1`
- **Files:** `.github/workflows/ci-cli-release.yml`, `.github/workflows/ci-mcp-release.yml`

### Problem

Both release workflows gate the "Verify tag matches package version" step and the "Publish to npm" step solely on `if: github.ref_type == 'tag'`. `github.ref_type` is derived from the git ref, NOT from the triggering event. The workflows also allow `workflow_dispatch` (whose documented contract is "smoke-only": type-check, test, build, dry-run pack — never publish). A maintainer can dispatch `workflow_dispatch` against a TAG ref (possible via the GitHub UI ref selector, API, or `gh` CLI). On such a dispatch, `github.ref_type == 'tag'` is true, so the publish step runs and actually publishes to npm — violating the documented "manual dispatch only smoke-tests" contract in the header comment. There is no `environment:` protection, no actor/branch restriction, and the token is an unconditional `secrets.NPM_TOKEN`, so nothing else blocks it. Fix: also require `github.event_name == 'push'`. After the fix, a tag PUSH (event_name=push, ref_type=tag) still publishes; any `workflow_dispatch` (against a branch OR a tag) never publishes.

### Proof (independent opus-max verifier)

```
duplicate-required-field
```

### Implementation steps

Make four exact edits total: two in `.github/workflows/ci-cli-release.yml` and two identical edits in `.github/workflows/ci-mcp-release.yml`. The current text at the two anchors is byte-identical between the two files, so the SAME before/after applies to each file. Do NOT use replace_all blindly across the file — there are exactly two occurrences of the target line per file (line 66 and line 78); edit each occurrence by including its surrounding step name line to make the match unique.

--- EDIT 1 of 4: ci-cli-release.yml, "Verify tag matches package version" step (line 65-66) ---

BEFORE (exact):
      - name: Verify tag matches package version
        if: github.ref_type == 'tag'

AFTER (exact):
      - name: Verify tag matches package version
        if: github.event_name == 'push' && github.ref_type == 'tag'

--- EDIT 2 of 4: ci-cli-release.yml, "Publish to npm" step (line 77-78) ---

BEFORE (exact):
      - name: Publish to npm (with provenance from publishConfig)
        if: github.ref_type == 'tag'

AFTER (exact):
      - name: Publish to npm (with provenance from publishConfig)
        if: github.event_name == 'push' && github.ref_type == 'tag'

--- EDIT 3 of 4: ci-mcp-release.yml, "Verify tag matches package version" step (line 65-66) ---

BEFORE (exact):
      - name: Verify tag matches package version
        if: github.ref_type == 'tag'

AFTER (exact):
      - name: Verify tag matches package version
        if: github.event_name == 'push' && github.ref_type == 'tag'

--- EDIT 4 of 4: ci-mcp-release.yml, "Publish to npm" step (line 77-78) ---

BEFORE (exact):
      - name: Publish to npm (with provenance from publishConfig)
        if: github.ref_type == 'tag'

AFTER (exact):
      - name: Publish to npm (with provenance from publishConfig)
        if: github.event_name == 'push' && github.ref_type == 'tag'

Do NOT change any other line. Do NOT change the header comments (the existing "gated to tag pushes" wording now matches the implementation). Do NOT touch `.github/workflows/release.yml` or any wrapper release workflow — this finding is scoped to the CLI and MCP release workflows only. Leave the `on: workflow_dispatch: {}` block unchanged; the dispatch path must still run the smoke steps (checkout, setup-node, install, sdk-codegen, type-check/test/build, dry-run pack), which carry no `if:` and therefore still execute on dispatch.

### Test to add

This repo has no test harness for GitHub Actions workflow YAML, and the project's hard-stop rules forbid CI/CD/auth/release-workflow changes beyond what is explicitly requested. Adding a new test framework or fixture is out of scope and would itself be an unrequested CI change. Instead, add a deterministic, dependency-free assertion script that greps the two workflow files and fails if either publish/verify gate is missing the `github.event_name == 'push'` clause.

Create the file `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-release-dispatch-guard.mjs` with EXACTLY this content:

#!/usr/bin/env node
// Asserts that the CLI and MCP release workflows never publish (or run the
// version-verify gate) on a workflow_dispatch event: both `if:` conditions
// must require `github.event_name == 'push'` in addition to the tag ref check.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  ".github/workflows/ci-cli-release.yml",
  ".github/workflows/ci-mcp-release.yml",
];

const wanted = "if: github.event_name == 'push' && github.ref_type == 'tag'";
const forbidden = "if: github.ref_type == 'tag'";

const failures = [];
for (const rel of files) {
  const text = readFileSync(join(repoRoot, rel), "utf8");
  // Every `if:` that gates on ref_type must be the full push+tag form.
  const refTypeGuards = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("if:") && line.includes("github.ref_type == 'tag'"));
  if (refTypeGuards.length !== 2) {
    failures.push(`${rel}: expected exactly 2 ref_type gates, found ${refTypeGuards.length}`);
  }
  for (const guard of refTypeGuards) {
    if (guard !== wanted) {
      failures.push(`${rel}: gate "${guard}" is missing the github.event_name == 'push' clause`);
    }
  }
  if (text.includes(`\n        ${forbidden}\n`)) {
    failures.push(`${rel}: still contains a bare "${forbidden}" gate`);
  }
}

if (failures.length > 0) {
  console.error("Release dispatch-guard check FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("Release dispatch-guard check passed: CLI + MCP publish gates require event_name == 'push'.");

Run just this check with:
node /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-release-dispatch-guard.mjs

Expected output on success (exit code 0):
Release dispatch-guard check passed: CLI + MCP publish gates require event_name == 'push'.

### Verify

```bash
Run all three from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

1. node scripts/check-release-dispatch-guard.mjs
   (must print the success line and exit 0)

2. python3 -c "import sys,yaml; yaml.safe_load(open('.github/workflows/ci-cli-release.yml')); yaml.safe_load(open('.github/workflows/ci-mcp-release.yml')); print('yaml ok')"
   (confirms both edited workflow files are still valid YAML; must print "yaml ok")

3. git diff --stat
   (must show exactly 2 files changed under .github/workflows/ with 2 insertions and 2 deletions each — i.e. 4 lines changed total — plus the new scripts/check-release-dispatch-guard.mjs as untracked)

No package-level gate (type-check/test/build) exercises workflow YAML, so they are not required for this change; do not run perfect-fast for a CI-YAML-only edit.
```

### Rollback

git checkout -- .github/workflows/ci-cli-release.yml .github/workflows/ci-mcp-release.yml && rm -f scripts/check-release-dispatch-guard.mjs

---

## Task 33 — [LOW] SHA-pin first-party GitHub Actions in the three token-bearing npm release workflows

- **Severity:** LOW  •  **Category:** security  •  **Task id:** `ci-rel-3`
- **Files:** `.github/workflows/release.yml`, `.github/workflows/ci-cli-release.yml`, `.github/workflows/ci-mcp-release.yml`, `scripts/test-release-workflow-sha-pins.mjs`

### Problem

The three workflows that hold the repo's highest-value credentials (npm publish token via NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}, OIDC provenance via id-token: write, and in release.yml contents: write) pin their GitHub Actions to mutable major tags (actions/checkout@v5, actions/setup-node@v5) instead of immutable commit SHAs. A maintainer/org-level retag or compromise of one of those tags (the exact mechanism of the tj-actions/changed-files compromise, CVE-2025-30066) would run attacker code in a job that can read the npm token and the OIDC identity. GitHub's "Security hardening for GitHub Actions" guide and OpenSSF Scorecard's Pinned-Dependencies check both require full-SHA pinning, most strongly for secret-bearing release workflows. `grep -rnE 'uses:.*@[0-9a-f]{40}' .github/workflows/` returns nothing today: zero actions are SHA-pinned. The github-actions Dependabot ecosystem is ALREADY enabled (.github/dependabot.yml lines 60-72), so the trailing `# v5.x` comments will be kept bumped automatically — no Dependabot edit is needed.

### Proof (independent opus-max verifier)

```
I read all eleven workflow files and confirmed every factual claim and cited line number is EXACT.

release.yml: `permissions: contents: write` (line 21) + `id-token: write` (line 22); `uses: actions/checkout@v5` (line 28); `uses: actions/setup-node@v5` (line 33); `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` (line 67) on the `npm publish` step (line 68); `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` (line 85). So the checkout/setup-node steps run with full read of an OIDC-write + npm-publish-token + contents-write job.

ci-cli-release.yml: `id-token: write` (line 30); `actions/checkout@v5` (line 36); `actions/setup-node@v5` (line 41); `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` (line 80) on `npm publish` (line 81). ci-mcp-release.yml is byte-identical at the same lines (30/36/41/80/81). sandbox-key-health.yml: `@v5` at lines 18/23 (only `contents: read` + Clockify creds, no npm token — lower risk, but the finding flags it as a lesser example, which is fair).

`grep -rnE 'uses:.*@[0-9a-f]{40}' .github/workflows/` returns NOTHING — there is zero SHA pinning anywhere; every `uses:` across all workflows is on a mutable major tag (@v5/@v4/@v6/@v2). So the claim is not already mitigated.

These are repo-owned CI files (not generated, not in spec/corrected/output/wrapper/src boundaries), so they are in scope and a maintainer can edit them.

The risk is real and documented, not theoretical: mutable major-tag retag/compromise of an action used in a job holding the npm publish token + provenance OIDC identity = credential/identity exfiltration. This is the exact mechanism of the tj-actions/changed-files compromise (CVE-2025-30066, March 2025). GitHub's own 'Security hardening for GitHub Actions' guide and OpenSSF Scorecard's Pinned-Dependencies check both recommend full-SHA pinning, with strongest emphasis on secret-bearing release/publish workflows — which is precisely how the finding scopes it.

Severity stays LOW (not higher): all referenced actions are first-party (actions/* owned by GitHub); an exploit requires GitHub-org-level compromise/retag, the lowest-probability tier. But not 'none' — the workflows hold the repo's highest-value credentials and the attack class is demonstrated.
```

### Implementation steps

All four steps are mechanical. The two SHAs used below are the current tips of the v5 lightweight tags:
- actions/checkout v5.0.1 -> 93cb6efe18208431cddfb8368fd83d5badbf9bfd
- actions/setup-node v5.0.0 -> a0853c24544627f65ddf259abe73b1d18a591444

STEP 1 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/.github/workflows/release.yml

1a) Line 28. Find this EXACT line (8 spaces of indent):
        uses: actions/checkout@v5
Replace it with:
        uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd # v5.0.1

1b) Line 33. Find this EXACT line (8 spaces of indent):
        uses: actions/setup-node@v5
Replace it with:
        uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5.0.0

STEP 2 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/.github/workflows/ci-cli-release.yml

2a) Line 36. Find this EXACT line (8 spaces of indent):
        uses: actions/checkout@v5
Replace it with:
        uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd # v5.0.1

2b) Line 41. Find this EXACT line (8 spaces of indent):
        uses: actions/setup-node@v5
Replace it with:
        uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5.0.0

STEP 3 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/.github/workflows/ci-mcp-release.yml

3a) Line 36. Find this EXACT line (8 spaces of indent):
        uses: actions/checkout@v5
Replace it with:
        uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd # v5.0.1

3b) Line 41. Find this EXACT line (8 spaces of indent):
        uses: actions/setup-node@v5
Replace it with:
        uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5.0.0

Do NOT touch any other workflow file, and do NOT edit .github/dependabot.yml — the github-actions updater is already enabled there (lines 60-72).

### Test to add

Create a new file at /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/test-release-workflow-sha-pins.mjs with EXACTLY this content:

#!/usr/bin/env node
// Guards that the three token-bearing release workflows pin actions/checkout and
// actions/setup-node to immutable 40-hex commit SHAs (not mutable major tags).
// See finding ci-rel-3 / CVE-2025-30066.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflows = [
  ".github/workflows/release.yml",
  ".github/workflows/ci-cli-release.yml",
  ".github/workflows/ci-mcp-release.yml",
];
const pinnedActions = ["actions/checkout", "actions/setup-node"];

const failures = [];
for (const rel of workflows) {
  const text = readFileSync(join(repoRoot, rel), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/uses:\s*(actions\/[\w-]+)@(\S+)/);
    if (!m) continue;
    const [, action, ref] = m;
    if (!pinnedActions.includes(action)) continue;
    if (!/^[0-9a-f]{40}$/.test(ref)) {
      failures.push(`${rel}: ${action} is pinned to '${ref}', expected a 40-hex commit SHA`);
    }
  }
}

if (failures.length > 0) {
  console.error("Unpinned actions found:\n" + failures.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
console.log("OK: all token-bearing release workflows pin actions/checkout and actions/setup-node to commit SHAs");

Run ONLY this test with:
node /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/test-release-workflow-sha-pins.mjs

Expected output:
OK: all token-bearing release workflows pin actions/checkout and actions/setup-node to commit SHAs

### Verify

```bash
Run these three commands from /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk and confirm each passes:

1) The new guard script exits 0:
node /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/test-release-workflow-sha-pins.mjs

2) No mutable @v5 tags remain on these actions in the three files (must print NOTHING and exit 1, which is the grep "no match" success here):
grep -nE 'uses:[[:space:]]*actions/(checkout|setup-node)@v[0-9]+([[:space:]]|$)' .github/workflows/release.yml .github/workflows/ci-cli-release.yml .github/workflows/ci-mcp-release.yml

3) The two expected SHA pins are present exactly twice each (one per checkout/setup-node across the publish workflows is fine; confirm both SHAs appear):
grep -REc 'actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd|actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444' .github/workflows/release.yml .github/workflows/ci-cli-release.yml .github/workflows/ci-mcp-release.yml

These are CI-YAML-only changes plus one standalone Node script; no package build/type-check/test gate covers them, so the guard script above is the authoritative proof. Do not run make perfect-fast for this change.
```

### Rollback

git checkout -- .github/workflows/release.yml .github/workflows/ci-cli-release.yml .github/workflows/ci-mcp-release.yml && rm -f scripts/test-release-workflow-sha-pins.mjs

---

## Task 34 — [LOW] Broaden CodeQL `paths` allowlist to cover the hand-written security-critical surface (wrapper root, cli/src, mcp/src)

- **Severity:** LOW  •  **Category:** ci-build  •  **Task id:** `ci-build-2`
- **Files:** `.github/workflows/codeql.yml`, `docs/ci-contract.json`

### Problem

The CodeQL workflow's inline `config.paths` is an 11-entry allowlist of 7 individual `wrapper/*.ts` files plus `wrapper/tests`, `wrapper/scripts`, `wrapper/examples`, and `.github/workflows`. For interpreted languages (javascript-typescript), CodeQL `paths` restricts extraction to ONLY those paths; everything else is unscanned. This excludes the real SSRF/IP-normalization guard `wrapper/webhook-url.ts` (the in-scope `wrapper/webhooks.ts` only re-exports it), 23 of 30 hand-written `wrapper/*.ts` files (incl. `errors.ts`, `scoped-client.ts`, `resolve.ts`), the entire `mcp/src/**` (confirm-guard.ts, confirmation.ts, scope-filter.ts), and the entire `cli/src/**` (23 command files). CodeQL is the sole security scanner (no semgrep/snyk/sonar/eslint-security/njsscan/trivy in any workflow). The scope contradicts the config comment's own stated goal of scanning "the hand-written wrapper surface". Confirmed real; severity low because the guards are independently unit- and Stryker-mutation-tested, so this is a defense-in-depth static-analysis coverage gap, not an active vulnerability.

### Proof (independent opus-max verifier)

```
Read codeql.yml directly: L47-59 sets `config.paths` to an 11-entry ALLOWLIST (wrapper/index.ts, create-client.ts, composed-fetch.ts, iter.ts, webhooks.ts, pagination.ts, with-response.ts + wrapper/tests, wrapper/scripts, wrapper/examples + .github/workflows). For JavaScript/TypeScript (interpreted), CodeQL `paths` restricts extraction/analysis to ONLY those paths; everything else is unscanned.

Filesystem confirms the excluded files exist and are hand-written security-critical code:
- `wrapper/webhook-url.ts` = 246 lines, the REAL SSRF/IP-normalization guard (NAT64 64:ff9b, IPv4-mapped, private/loopback/link-local). NOT in scope. Only its re-export barrel `wrapper/webhooks.ts` is in scope, and that file just does `export { assertSafeWebhookUrl, validateWebhookUrl } from "./webhook-url.js"` (L34-37) — a re-export does not bring the 246-line implementation into the DB.
- 23 of 30 hand-written `wrapper/*.ts` excluded (incl. errors.ts auth/error handling, scoped-client.ts, resolve.ts).
- Entire `mcp/src/**` excluded: orchestration/confirm-guard.ts, orchestration/confirmation.ts, scope-filter.ts all present, none in scope.
- Entire `cli/src/**` excluded (23 command files present).

No compensating analysis: grep of all 11 workflows for semgrep|njsscan|snyk|sonar|eslint-plugin-security|trivy returns only the single CodeQL job; one CodeQL config, no .github/codeql override.

The config comment claims it scopes to "the hand-written wrapper surface" and only justifies excluding generated wrapper/src/**, but the allowlist covers 7/30 wrapper files and 0 of mcp/cli — it does not meet its own stated goal. Every checkable claim in the finding is accurate.
```

### Implementation steps

STEP 1 — Replace the scoping comment and `config:` block in the CodeQL workflow.

File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/.github/workflows/codeql.yml

FIND (exact, verbatim — currently lines 43-59, inside the `Initialize CodeQL` step's `with:` block):

          # Scope the analysis to the hand-written wrapper surface
          # + workflow files. wrapper/src/** is locally generated
          # output (regenerated); any finding there belongs
          # upstream in GOCLMCP, not in this repo's security tab.
          config: |
            paths:
              - wrapper/index.ts
              - wrapper/create-client.ts
              - wrapper/composed-fetch.ts
              - wrapper/iter.ts
              - wrapper/webhooks.ts
              - wrapper/pagination.ts
              - wrapper/with-response.ts
              - wrapper/tests
              - wrapper/scripts
              - wrapper/examples
              - .github/workflows

REPLACE WITH (exact, verbatim — preserve the 10-space indentation of the comment/`config:` lines and 14-space indentation of the list items, exactly as below):

          # Scope the analysis to the hand-written surface across all
          # three packages (wrapper root, cli/src, mcp/src) plus the
          # repo automation scripts and workflow files. wrapper/src/**
          # is locally generated output (regenerated); any finding
          # there belongs upstream in GOCLMCP, not in this repo's
          # security tab, so it is excluded via paths-ignore. Built
          # output (**/dist) is excluded as a belt-and-suspenders.
          config: |
            paths:
              - wrapper
              - cli/src
              - mcp/src
              - scripts
              - .github/workflows
            paths-ignore:
              - wrapper/src
              - "**/dist"

(Listing the `wrapper` directory scans every hand-written wrapper root .ts plus the wrapper/tests, wrapper/scripts, wrapper/examples that were already covered; `cli/src` and `mcp/src` bring the CLI commands and the SSRF/scope-filter/confirm-guard code into scope; `paths-ignore: wrapper/src` keeps the gitignored GOCLMCP-regenerated output out. The repo-root generated `output/ts-sdk/**` is simply not in the allowlist, so it stays unscanned without an explicit ignore.)

STEP 2 — Update the matching marker in the CI-contract data file so the `make ci-contract` gate (which is part of `make perfect-fast`) keeps passing AND asserts the new scope. The current markers include `"wrapper/composed-fetch.ts"`, which Step 1 deletes; the checker uses `text.includes(marker)`, so leaving it would red the gate.

File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/docs/ci-contract.json

FIND (exact, verbatim — the codeql.yml workflow entry, currently lines 72-79):

      "path": ".github/workflows/codeql.yml",
      "mustContain": [
        "name: CodeQL",
        "security-and-quality",
        "security-events: write",
        "wrapper/composed-fetch.ts",
        ".github/workflows"
      ]

REPLACE WITH (exact, verbatim):

      "path": ".github/workflows/codeql.yml",
      "mustContain": [
        "name: CodeQL",
        "security-and-quality",
        "security-events: write",
        "- cli/src",
        "- mcp/src",
        "paths-ignore:",
        "- wrapper/src",
        ".github/workflows"
      ]

Make no other edits. Do not touch any other file. The other repo references to `wrapper/composed-fetch.ts` (in docs/sdk-runtime-contract.json, docs/observability-contract.json, docs/mutation-safety-contract.json, etc.) are unrelated contracts and MUST NOT be changed.

### Test to add

The regression assertion is the updated `mustContain` marker array added in STEP 2 of docs/ci-contract.json. It is enforced by the existing checker scripts/check-ci-contract.mjs (function `checkEntry`, line 132-140), which fails if any marker string is not a substring of .github/workflows/codeql.yml. The new markers `"- cli/src"`, `"- mcp/src"`, `"paths-ignore:"`, and `"- wrapper/src"` will fail the gate if a future edit removes mcp/src or cli/src from the CodeQL scope or drops the wrapper/src exclusion, locking in the broadened security-scan coverage.

Run ONLY this assertion:

  cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk && node scripts/check-ci-contract.mjs

Expected final line of output:

  CI contract passed

### Verify

```bash
Run all three from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

1. CI-contract gate (also part of perfect-fast) — proves the marker update matches the workflow and the gate is green:
   make ci-contract
   (expected: prints "CI contract passed")

2. YAML validity of the edited workflow — proves the new config block parses:
   node --input-type=module -e "import fs from 'node:fs'; import {parse} from 'yaml'; const d=parse(fs.readFileSync('.github/workflows/codeql.yml','utf8')); const c=parse(d.jobs.analyze.steps[1].with.config); console.log('codeql paths:', c.paths.join(','), '| ignore:', c['paths-ignore'].join(',')); process.exit((c.paths.includes('mcp/src')&&c.paths.includes('cli/src')&&c.paths.includes('wrapper')&&c['paths-ignore'].includes('wrapper/src'))?0:1)"
   (expected: prints "codeql paths: wrapper,cli/src,mcp/src,scripts,.github/workflows | ignore: wrapper/src,**/dist" and exits 0)

3. JSON validity of the edited data file:
   node -e "JSON.parse(require('node:fs').readFileSync('docs/ci-contract.json','utf8')); console.log('ci-contract.json valid JSON')"
   (expected: prints "ci-contract.json valid JSON")

All three must succeed.
```

### Rollback

git checkout -- .github/workflows/codeql.yml docs/ci-contract.json

---

## Task 35 — [LOW] Replace the global-substring data-handling wiring check with a per-aggregate-target check in check-data-handling.mjs

- **Severity:** LOW  •  **Category:** gate-correctness / false-green  •  **Task id:** `data-handling-wiring-false-green`
- **Files:** `scripts/check-data-handling.mjs`, `scripts/check-data-handling.test.mjs`

### Problem

The data-handling gate is supposed to assert that the `data-handling` target is wired as a prerequisite of BOTH the `perfect-fast:` and `perfect-full:` aggregate targets in the Makefile. The current check at scripts/check-data-handling.mjs lines 206-208 is a global-substring test: `if (!makefile.includes("perfect-fast:") || !makefile.includes("data-handling"))`. Because the string `data-handling` appears in the Makefile at the `.PHONY` list (line 1), the help text (line 62), the `contract-gates` prereqs (line 144), and the `data-handling:` target definition (lines 421-422), the substring `data-handling` is satisfied even if it is removed from both the `perfect-fast:` (line 134) and `perfect-full:` (line 146) prerequisite lists. An in-memory simulation confirmed: stripping `data-handling` from both aggregate prereq lines leaves the check GREEN. Additionally, `perfect-full` is never referenced by name in this check at all (only the literal `"perfect-fast:"` and a bare `"data-handling"`). The `requiredTargets` loop (lines 202-204) does NOT cover the wiring either — `isLiveTarget` (scripts/lib/gate-targets.mjs) only verifies the target recipe is DEFINED, not that it is a prerequisite of any aggregate. The sibling checker scripts/check-env-contract.mjs (lines 172-177) already does this correctly per-line; this fix ports that exact pattern. `contract.wiring.makeTarget` is validated to equal "data-handling" by validateContractShape() at lines 87-89, so reusing it is safe.

### Proof (independent opus-max verifier)

```
scripts/check-data-handling.mjs lines 206-208 read exactly:
  if (!makefile.includes("perfect-fast:") || !makefile.includes("data-handling")) {
      fail("Makefile", "perfect-fast/perfect-full wiring missing data-handling");
  }
This is a global substring test. grep of the Makefile shows "data-handling" at line 1 (.PHONY list), line 62 (help text), line 144 (contract-gates prereqs), and line 421 (the `data-handling:` target definition) — all independent of the perfect-fast: (line 134) and perfect-full: (line 146) prerequisite lists.

Empirical simulation (node, in-memory, no file mutated): after stripping `data-handling` from BOTH the perfect-fast: and perfect-full: prerequisite lines, the weak check's fail condition `(!mk2.includes("perfect-fast:") || !mk2.includes("data-handling"))` evaluates to FALSE -> no failure -> gate stays GREEN. Four occurrences (lines 1, 62, 144, 421-422) keep the substring alive. The correct per-line check (env-contract style) WOULD fail: perfect-fast includes data-handling? false; perfect-full includes data-handling? false.

perfect-full is never referenced by the check (only the literal "perfect-fast:" and a bare "data-handling"). The requiredTargets loop at lines 202-204 does not cover the wiring either: isLiveTarget (scripts/lib/gate-targets.mjs:28) only tests `makefile.includes(`${target}:`)` i.e. that the target recipe is DEFINED, not that it is a prerequisite of any aggregate. So the wiring invariant is enforced nowhere but the broken line 206-208.

The sibling checker scripts/check-env-contract.mjs lines 172-177 already does it correctly per-line:
  for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
      const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
      if (!targetLine.includes(contract.wiring.makeTarget)) fail("Makefile", `${aggregateTarget} must include ${contract.wiring.makeTarget}`);
  }
contract.wiring.makeTarget is validated to be "data-handling" at check-data-handling.mjs lines 87-89, so reusing it is safe.
```

### Implementation steps

STEP 1 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-data-handling.mjs

Locate this EXACT block (lines 206-208; top-level statements, the `if` at column 0, body indented 4 spaces):

    if (!makefile.includes("perfect-fast:") || !makefile.includes("data-handling")) {
        fail("Makefile", "perfect-fast/perfect-full wiring missing data-handling");
    }

Replace it with this EXACT block (per-aggregate-target check, identical style to scripts/check-env-contract.mjs:172-177; top-level, body indented 4 spaces):

    for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
        const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
        if (!targetLine.includes(contract.wiring.makeTarget)) {
            fail("Makefile", `${aggregateTarget} must include ${contract.wiring.makeTarget}`);
        }
    }

Do NOT change any other lines. The surrounding lines (line 204 blank-ish loop above, and line 209 `if (!qualityGates.includes("make data-handling")) {`) stay exactly as they are. `contract`, `makefile`, and `fail` are all already in scope at this point in the file (contract defined line 8, makefile line 173, fail line 27).

STEP 2 — Create the new test file at /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-data-handling.test.mjs with this EXACT content:

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-data-handling.mjs");
const source = readFileSync(scriptPath, "utf8");

test("perfect-fast/perfect-full wiring is checked per aggregate target line", () => {
    assert.ok(
        source.includes('for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {'),
        "expected per-aggregate-target wiring loop over perfect-fast and perfect-full",
    );
    assert.ok(
        source.includes("if (!targetLine.includes(contract.wiring.makeTarget)) {"),
        "expected per-line targetLine.includes(contract.wiring.makeTarget) check",
    );
});

test("weak global-substring wiring check is removed", () => {
    assert.ok(
        !source.includes('!makefile.includes("perfect-fast:") || !makefile.includes("data-handling")'),
        "weak global-substring wiring check must be removed",
    );
});

### Test to add

New file /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-data-handling.test.mjs (full content given in STEP 2). It is a source-guard test: it reads the checker source as text (it does NOT import it, because check-data-handling.mjs runs side effects and calls process.exit on load) and asserts (a) the new per-aggregate-target loop and per-line `targetLine.includes` check are present, and (b) the old weak global-substring condition string is absent. Run just this test from the repo root with:

    node --test scripts/check-data-handling.test.mjs

Expected: 2 passing tests, exit code 0.

### Verify

```bash
Run all of these from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

1. node --test scripts/check-data-handling.test.mjs
   (the new test — expect 2 pass, exit 0)

2. make data-handling
   (runs `node scripts/check-data-handling.mjs`; the wiring is currently present in both perfect-fast: and perfect-full:, so the corrected per-line check still passes — expect no "must include data-handling" failures, exit 0)

3. node scripts/check-data-handling.mjs
   (direct invocation of the checker — expect no error output and exit 0)
```

### Rollback

git checkout -- scripts/check-data-handling.mjs && rm -f scripts/check-data-handling.test.mjs

---

## Task 36 — [LOW] Make product-surface --check warn loudly (instead of passing silently) when ../GOCLMCP/docs/tool-catalog.json is absent and the goMcp counts are echoed from the file being checked

- **Severity:** LOW  •  **Category:** false-green  •  **Task id:** `ps-gomcp-selfref`
- **Files:** `scripts/generate-product-surface.mjs`, `scripts/generate-product-surface.test.mjs`

### Problem

In scripts/generate-product-surface.mjs, goMcpMetadata() (lines 37-58) reads ../GOCLMCP/docs/tool-catalog.json to derive packages.goMcp.detectedToolCount/detectedCategoryCounts. When that sibling catalog is absent (the real CI path — no .github/workflows/*.yml checks out GOCLMCP, yet `make product-surface-drift` runs in ci.yml and is a perfect-fast member), the function falls back (lines 52-57) to reading those same fields back out of docs/product-surface.json. Those echoed values then flow into `surface.packages.goMcp` (lines 244-245) and into `expectedJson = jsonFor(surface)` (line 330), which the `--check` branch compares (lines 341,344) against `currentJson` read from the SAME docs/product-surface.json. The goMcp counts are therefore compared against themselves: tampering docs/product-surface.json goMcp.detectedToolCount (156 -> 999) is NOT detected, yet --check still prints "product surface is current" and exits 0. This is a silent false-green for the Go-MCP tool-count metadata field on the CI path. The repo convention (e.g. spec-sync-drift) is to skip LOUDLY when ../GOCLMCP is absent; this gate passes silently. Fix: keep the surface byte-shape unchanged (do NOT add a serialized field — that would itself drift between local-with-GOCLMCP and CI-without-GOCLMCP), but track a module-scope flag and emit a WARNING during --check when the goMcp portion was not verified.

### Proof (independent opus-max verifier)

```
Code trace (read the file directly): goMcpMetadata() lines 37-58 reads ../GOCLMCP/docs/tool-catalog.json; when it is absent/empty (goTools.length 0) it falls back to `const current = maybeReadJson("docs/product-surface.json"); const currentGoMcp = current?.packages?.goMcp ?? {}; return { detectedToolCount: currentGoMcp.detectedToolCount ?? null, detectedCategoryCounts: currentGoMcp.detectedCategoryCounts ?? {} }` (lines 52-57). That value flows into surface.packages.goMcp.detectedToolCount/detectedCategoryCounts (lines 244-245), then expectedJson = jsonFor(surface) (line 330), which --check compares against currentJson read from the SAME docs/product-surface.json (lines 341,344). So when GOCLMCP is absent, the goMcp counts in `expectedJson` are read from the very file `currentJson` is read from -> they always match.

Environment is real and exercised: NO CI workflow checks out GOCLMCP (grep over all 11 .github/workflows/*.yml finds only a codeql.yml comment), yet ci.yml runs `make product-surface-drift` at line 344 (and `make contract-gates` at line 129; product-surface-drift is a perfect-fast member, Makefile line 134). The ci.yml comment (lines 122-127) confirms this is the standalone "No hosted generator or live API" path. So in CI the fallback branch fires. No other perfect-fast gate pins the Go-MCP tool count of 156 (operation-coverage/parity check name parity and are perfect-FULL only).

Empirical reproduction (unmodified copy of the real script in a fakeroot with no sibling ../GOCLMCP, fixtures copied from the repo): BASELINE --check -> "product surface is current", exit 0. TEST 1: tampered docs/product-surface.json goMcp.detectedToolCount 156->999 and detectedCategoryCounts->{bogus:42} -> --check prints "product surface is current", exit 0 (drift NOT detected). TEST 2 (control): tampered packages.sdk.version->"9.9.9-tampered" (a re-derived field) -> --check prints "Product surface drift", exit 1 (gate works normally). This proves the goMcp counts specifically are self-referential and undetectable when GOCLMCP is absent, while the rest of the surface is genuinely verified. Current committed goMcp = 156 (workflow17/domain137/raw2) which matches the live 1.6MB catalog, so there is no current drift -- the gap is in detection, not a current mismatch.
```

### Implementation steps

EDIT 1 of 3 — add a module-scope verification flag above goMcpMetadata().
File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/generate-product-surface.mjs
Locate this exact text (lines 36-37):

```
const mcpTools = readJson("docs/mcp-tools.json");
function goMcpMetadata() {
```

Replace it with exactly:

```
const mcpTools = readJson("docs/mcp-tools.json");
let goMcpVerified = true;
function goMcpMetadata() {
```

EDIT 2 of 3 — flip the flag to false inside the absent-catalog fallback.
File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/generate-product-surface.mjs
Locate this exact text (lines 52-53):

```
    const current = maybeReadJson("docs/product-surface.json");
    const currentGoMcp = current?.packages?.goMcp ?? {};
```

Replace it with exactly:

```
    goMcpVerified = false;
    const current = maybeReadJson("docs/product-surface.json");
    const currentGoMcp = current?.packages?.goMcp ?? {};
```

EDIT 3 of 3 — emit the loud WARNING in the --check branch before the success line.
File: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/generate-product-surface.mjs
Locate this exact text (lines 346-351):

```
    if (stale.length > 0) {
        console.error(`Product surface drift: ${stale.join(", ")}. Run make product-surface.`);
        process.exit(1);
    }
    console.log("product surface is current");
    process.exit(0);
```

Replace it with exactly:

```
    if (stale.length > 0) {
        console.error(`Product surface drift: ${stale.join(", ")}. Run make product-surface.`);
        process.exit(1);
    }
    if (!goMcpVerified) {
        console.warn(
            "WARNING: ../GOCLMCP/docs/tool-catalog.json absent; packages.goMcp.detectedToolCount/detectedCategoryCounts were echoed from docs/product-surface.json and NOT verified. Re-run with the GOCLMCP sibling checked out (perfect-full) to verify the Go MCP tool counts.",
        );
    }
    console.log("product surface is current");
    process.exit(0);
```

Do NOT change any other line. Do NOT add any field to the object returned by goMcpMetadata() and do NOT add a field to `surface.packages.goMcp` — the serialized surface shape must stay byte-identical so the committed docs/product-surface.json does not drift between a local run (GOCLMCP present) and a CI run (GOCLMCP absent).

### Test to add

Create a NEW file at exactly /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/generate-product-surface.test.mjs with exactly this content:

```
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const script = path.join(root, "scripts/generate-product-surface.mjs");
const catalogPath = path.join(root, "../GOCLMCP/docs/tool-catalog.json");
const warningNeedle =
    "absent; packages.goMcp.detectedToolCount/detectedCategoryCounts were echoed from docs/product-surface.json and NOT verified";

function runCheck() {
    return new Promise((resolve) => {
        execFile("node", [script, "--check"], { cwd: root }, (error, stdout, stderr) => {
            resolve({ code: error?.code ?? 0, stdout, stderr });
        });
    });
}

test("product-surface --check warns loudly only when the GOCLMCP catalog is absent", async () => {
    const catalogPresent = fs.existsSync(catalogPath);
    const { code, stdout, stderr } = await runCheck();
    assert.equal(code, 0, `expected --check to exit 0 (no drift), got code ${code}: ${stderr}`);
    assert.match(stdout, /product surface is current/);
    if (catalogPresent) {
        assert.ok(
            !stderr.includes(warningNeedle),
            `GOCLMCP catalog is present, so no goMcp-unverified WARNING must be emitted, but stderr was: ${stderr}`,
        );
    } else {
        assert.ok(
            stderr.includes(warningNeedle),
            `GOCLMCP catalog is absent, so the goMcp-unverified WARNING must be emitted, but stderr was: ${stderr}`,
        );
    }
});
```

This test is environment-adaptive and deterministic: it reads whether ../GOCLMCP/docs/tool-catalog.json exists, then asserts the WARNING appears when (and only when) the catalog is absent. In this repo's local checkout the catalog IS present, so the no-warning branch is exercised; on the CI path (catalog absent) the warning branch is exercised.

Run just this test with exactly:

cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk && node --test scripts/generate-product-surface.test.mjs

### Verify

```bash
Run all three from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

1. The new focused test (must print "pass 1" / "fail 0"):
   node --test scripts/generate-product-surface.test.mjs

2. The repo's existing drift gate must still pass (exits 0, prints "product surface is current"; locally it will NOT print the warning because the GOCLMCP catalog is present):
   make product-surface-drift

3. Confirm the committed surface is byte-unchanged by the edits (regenerate and check git is clean for these two files — must produce NO diff):
   node scripts/generate-product-surface.mjs --write && git status --porcelain docs/product-surface.json docs/product-surface.md
   (Expected output: empty — no lines. If either file shows as modified, EDIT 1/2/3 wrongly altered the serialized surface; revert and re-apply without adding any object field.)
```

### Rollback

git checkout -- scripts/generate-product-surface.mjs && rm -f scripts/generate-product-surface.test.mjs

---

## Task 37 — [LOW] Make changelog-drift diff committed changes against the base ref so it enforces in CI (currently vacuously green on a clean tree)

- **Severity:** LOW  •  **Category:** ci-gate-correctness  •  **Task id:** `changelog-drift-empty-worktree-false-green`
- **Files:** `scripts/check-changelog-entry.mjs`, `.github/workflows/ci.yml`, `scripts/check-changelog-entry.test.mjs`

### Problem

scripts/check-changelog-entry.mjs computes its `changed` file set ONLY from the working tree (`git diff --name-only`, `--cached`, and `git ls-files --others --exclude-standard`). It never diffs committed changes against a base ref. The `make changelog-drift` gate runs inside the `contract-gates` job in .github/workflows/ci.yml (triggered on push to main and pull_request to main), which does only `actions/checkout` + `npm ci` + `make contract-gates`. A fresh checkout is a clean working tree, so all three git calls return empty, `changed` is empty, and the "touched-but-changelog-not-updated" assertion never fires. Only the static `[Unreleased]` heading-presence check runs. Result: a committed PR that changes wrapper/cli/mcp source WITHOUT adding a CHANGELOG entry passes the full CI proof. Confirmed by live experiment: on a clean tree the script exits 0; after creating one untracked file under cli/ it exits 1; after removing it, 0 again. No pre-commit hook and no other gate independently enforces changelog coverage against committed diffs. Fix: also diff committed changes against the integration base (PR target branch via GITHUB_BASE_REF, or pre-push tip via GITHUB_EVENT_BEFORE, or CHANGELOG_BASE_REF override), unioned with the existing working-tree set so the local pre-commit run still works; and supply the base ref plus full git history (fetch-depth: 0) in the CI job.

### Proof (independent opus-max verifier)

```
Independently confirmed by reading the script + tracing CI wiring + a live local experiment.

CODE (lines 172-176): `changed` is the union of working-tree state ONLY: git diff --name-only (unstaged), git diff --name-only --cached (staged), git ls-files --others --exclude-standard (untracked). No base-ref/merge-base diff anywhere in the file (grep for merge-base|origin/main|...HEAD|HEAD~ returned nothing). The "touched-but-changelog-not-updated" failure (lines 183-185) only fires when a watched path appears in `changed`; on a clean tree the only remaining assertion is the static `[Unreleased]` heading presence (lines 187-189). Watched paths (docs/changelog-coverage-contract.json) are the dir prefixes wrapper/, cli/, mcp/; requiredHeading is "[Unreleased]".

CI WIRING: .github/workflows/ci.yml `contract-gates` job (triggers: push to main + pull_request to main) runs `make contract-gates`, whose prereq list includes `changelog-drift` (Makefile:144). The job does only actions/checkout + `npm ci` + `make contract-gates`; checkout yields a clean tree, npm ci only writes gitignored node_modules, and that job runs no sdk-codegen (generated wrapper/src + /output/ts-sdk are gitignored anyway). So all three git invocations return empty in CI -> `changed` is empty -> the coverage invariant is never evaluated.

LIVE EXPERIMENT (decisive): On the current clean tree, `node scripts/check-changelog-entry.mjs` -> exit 0, prints "changelog coverage is current for touched package scopes". After `echo > cli/src/__verifier_probe__.ts` (untracked, picked up by ls-files --others; simulates a dirty/pre-commit tree), the same command -> exit 1, "cli: user-visible package files changed but cli/CHANGELOG.md did not". Then removed the probe; tree clean again. This proves the gate only ever does real work against working-tree state and passes trivially once changes are committed.

NO ALTERNATE ENFORCEMENT: no pre-commit hook (no .husky, no core.hooksPath, no package.json prepare/husky/lint-staged, only sample hooks in .git/hooks); scripts/check-change-impact.mjs (the only other changelog reference) is a static contract validator with no git diff — it merely asserts a changelogRequired scope lists changelog-drift as a target. So a committed PR that changes wrapper/cli/mcp source without a CHANGELOG entry passes the full CI proof.
```

### Implementation steps

STEP 1 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-changelog-entry.mjs

Locate this EXACT block (lines 172-176):

```
const changed = new Set([
    ...git(["diff", "--name-only"]),
    ...git(["diff", "--name-only", "--cached"]),
    ...git(["ls-files", "--others", "--exclude-standard"]),
]);
```

Replace it with EXACTLY:

```
// Working-tree changes — covers a local pre-commit run (dirty tree).
const worktree = [
    ...git(["diff", "--name-only"]),
    ...git(["diff", "--name-only", "--cached"]),
    ...git(["ls-files", "--others", "--exclude-standard"]),
];
// Committed changes vs the integration base — covers post-commit CI (clean tree).
// PR builds: GITHUB_BASE_REF (target branch). Push builds: GITHUB_EVENT_BEFORE
// (pre-push tip). CHANGELOG_BASE_REF overrides. All-zero SHA (new branch) ignored.
const ZERO_SHA = "0000000000000000000000000000000000000000";
const baseRef =
    process.env.CHANGELOG_BASE_REF ||
    (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "") ||
    (process.env.GITHUB_EVENT_BEFORE && process.env.GITHUB_EVENT_BEFORE !== ZERO_SHA
        ? process.env.GITHUB_EVENT_BEFORE
        : "");
const committed = baseRef ? git(["diff", "--name-only", `${baseRef}...HEAD`]) : [];
const changed = new Set([...worktree, ...committed]);
```

STEP 2 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/.github/workflows/ci.yml

This file has several identical `Checkout` blocks; the block below is unique because it ends at `run: make contract-gates`. Locate this EXACT block (lines 107-129, inside the `contract-gates` job):

```
      - name: Checkout
        uses: actions/checkout@v5
        with:
          persist-credentials: false

      - name: Setup Node.js 22
        uses: actions/setup-node@v5
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: package-lock.json

      - name: Install workspaces (root)
        run: npm ci

      # Runs the deterministic, network-free contract/doc/drift suite
      # (`make contract-gates`) that previously only ran locally via
      # `make perfect-fast`. No hosted generator or live API. Most src-dependent
      # checks skip when wrapper/src is absent; the MCP tool-manifest check
      # prepares the local wrapper build it imports. Package test gates stay
      # in build-and-test / ci-cli / ci-mcp.
      - name: Run contract + doc drift gates
        run: make contract-gates
```

Replace it with EXACTLY:

```
      - name: Checkout
        uses: actions/checkout@v5
        with:
          persist-credentials: false
          fetch-depth: 0

      - name: Setup Node.js 22
        uses: actions/setup-node@v5
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: package-lock.json

      - name: Install workspaces (root)
        run: npm ci

      # Runs the deterministic, network-free contract/doc/drift suite
      # (`make contract-gates`) that previously only ran locally via
      # `make perfect-fast`. No hosted generator or live API. Most src-dependent
      # checks skip when wrapper/src is absent; the MCP tool-manifest check
      # prepares the local wrapper build it imports. Package test gates stay
      # in build-and-test / ci-cli / ci-mcp.
      - name: Run contract + doc drift gates
        run: make contract-gates
        env:
          GITHUB_BASE_REF: ${{ github.base_ref }}        # pull_request events
          GITHUB_EVENT_BEFORE: ${{ github.event.before }} # push events
```

`fetch-depth: 0` is required because the default shallow checkout omits `origin/main`, so `${baseRef}...HEAD` would not resolve. No other job in this file needs changing.

### Test to add

Create a NEW file at /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-changelog-entry.test.mjs with EXACTLY this content (node:test runner, matching the existing scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs convention):

```
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checker = path.join(root, "scripts", "check-changelog-entry.mjs");

function git(cwd, args) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
    return result.stdout.trim();
}

function runChecker(cwd, baseRef) {
    return spawnSync(process.execPath, [checker], {
        cwd,
        encoding: "utf8",
        env: { ...process.env, CHANGELOG_BASE_REF: baseRef },
    });
}

async function makeRepo() {
    const dir = await mkdtemp(path.join(os.tmpdir(), "clockify-changelog-test-"));
    git(dir, ["init", "-q", "-b", "main"]);
    git(dir, ["config", "user.email", "test@example.com"]);
    git(dir, ["config", "user.name", "Test"]);
    await mkdir(path.join(dir, "cli", "src"), { recursive: true });
    await writeFile(path.join(dir, "README.md"), "base\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "base"]);
    const base = git(dir, ["rev-parse", "HEAD"]);
    return { dir, base };
}

test("committed source change without a changelog entry fails against the base ref", async () => {
    const { dir, base } = await makeRepo();
    try {
        await writeFile(path.join(dir, "cli", "src", "probe.ts"), "export const x = 1;\n");
        git(dir, ["add", "-A"]);
        git(dir, ["commit", "-q", "-m", "touch cli"]);
        const result = runChecker(dir, base);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(
            result.stderr,
            /cli: user-visible package files changed but cli\/CHANGELOG\.md did not/,
        );
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("committed source change with a changelog entry passes against the base ref", async () => {
    const { dir, base } = await makeRepo();
    try {
        await writeFile(path.join(dir, "cli", "src", "probe.ts"), "export const x = 1;\n");
        await writeFile(path.join(dir, "cli", "CHANGELOG.md"), "## [Unreleased]\n");
        git(dir, ["add", "-A"]);
        git(dir, ["commit", "-q", "-m", "touch cli + changelog"]);
        const result = runChecker(dir, base);
        assert.equal(result.status, 0, result.stdout + result.stderr);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("clean tree with no base ref stays green (local pre-commit behaviour preserved)", () => {
    const result = spawnSync(process.execPath, [checker], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, CHANGELOG_BASE_REF: "", GITHUB_BASE_REF: "", GITHUB_EVENT_BEFORE: "" },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
});
```

Note: the checker always reads the package CHANGELOG.md files and the contract from the REAL repo root (resolved relative to the script), so the temp repos only need the touched source/changelog paths in their git diff. The third test asserts the working-tree-only fallback still exits 0 on the real clean tree.

### Verify

```bash
Run from /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

1. Run just the new test (must print "pass 3" / exit 0):
   node --test scripts/check-changelog-entry.test.mjs

2. Confirm the gate still passes on the current clean tree (must print "changelog coverage is current for touched package scopes", exit 0):
   node scripts/check-changelog-entry.mjs

3. Run the focused make gate (must exit 0):
   make changelog-drift

4. Validate the workflow YAML still parses:
   node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/ci.yml','utf8');if(!/fetch-depth: 0/.test(s)||!/GITHUB_EVENT_BEFORE: \$\{\{ github.event.before \}\}/.test(s)){process.exit(1)}console.log('ci.yml edits present')"
```

### Rollback

git checkout -- scripts/check-changelog-entry.mjs .github/workflows/ci.yml && rm -f scripts/check-changelog-entry.test.mjs

---

## Task 38 — [LOW] Scope the perfect-fast/perfect-full aggregate-wiring self-checks to the recipe lines (14 CI self-check scripts)

- **Severity:** LOW  •  **Category:** false-green  •  **Task id:** `sb4-2`
- **Files:** `scripts/check-support-bundle.mjs`, `scripts/check-docs-drift.mjs`, `scripts/check-examples-matrix.mjs`, `scripts/check-maintenance-playbook.mjs`, `scripts/check-security-threat-model.mjs`, `scripts/check-decision-records.mjs`, `scripts/check-snippet-safety.mjs`, `scripts/check-config-precedence.mjs`, `scripts/check-data-handling.mjs`, `scripts/check-operation-coverage.mjs`, `scripts/check-naming-taxonomy.mjs`, `scripts/check-generator-portability.mjs`, `scripts/check-doc-index.mjs`, `scripts/check-release-readiness.mjs`, `scripts/check-aggregate-wiring.test.mjs`

### Problem

Each of these 14 CI self-check scripts asserts that its gate is wired into the `perfect-fast`/`perfect-full` aggregate targets using a GLOBAL substring test, e.g. `if (!makefile.includes("perfect-fast:") || !makefile.includes("support-bundle"))`. `makefile` is the ENTIRE Makefile (e.g. scripts/check-support-bundle.mjs:213 `const makefile = await readRel("Makefile")`). The first operand is permanently true because the `perfect-fast:` target is defined at Makefile:134, and the second is permanently true because the gate's own target is defined later in the file (e.g. `support-bundle:` at Makefile:448). So the condition can never fire: removing a gate from the `perfect-fast`/`perfect-full` prerequisite lists leaves the self-check GREEN. The code does not even reference `perfect-full`. The correctly-scoped idiom already exists in this repo at scripts/check-ci-contract.mjs:157-162 (`makefile.split("\n").find(line => line.startsWith(`${aggregateTarget}:`))` then assert the token is on THAT line, looped over both `perfect-fast` and `perfect-full`). The defect is latent today (all 14 gates are currently present in both aggregate prerequisite lines, Makefile:134 and Makefile:146), so there is no active false-green; it only fires if a future edit drops a gate from an aggregate list.

### Proof (independent opus-max verifier)

```
Confirmed by direct code reading, not the finding's wording. (1) `makefile` is the WHOLE Makefile: check-support-bundle.mjs:213 `const makefile = await readRel("Makefile")`. (2) The assertion is exactly as claimed, check-support-bundle.mjs:270-272: `if (!makefile.includes("perfect-fast:") || !makefile.includes("support-bundle")) { fail("Makefile", "perfect-fast/perfect-full wiring missing support-bundle"); }`. Both operands are GLOBAL substring tests, not scoped to the recipe lines. (3) `grep -nE '^(perfect-fast|support-bundle):' Makefile` -> `134:perfect-fast:` and `448:support-bundle:`. Because the `support-bundle:` target is DEFINED at line 448, `makefile.includes("support-bundle")` is unconditionally true; `makefile.includes("perfect-fast:")` is likewise unconditionally true (target at 134). So the condition can never fire as long as both targets exist -> removing `support-bundle` from the perfect-fast (line 134) and perfect-full (line 146) prerequisite lists leaves the self-check GREEN. The recipe message says "perfect-fast/perfect-full" but the code never even references `perfect-full:`. (4) The correctly-scoped idiom exists in the same repo: check-ci-contract.mjs:157-162 and check-dependency-license.mjs:237-239 both do `makefile.split("\n").find(line => line.startsWith(`${aggregateTarget}:`))` then assert the gate token is on THAT line, for both `perfect-fast` and `perfect-full`. (5) The two sibling instances are verbatim confirmed: check-docs-drift.mjs:244 `!makefile.includes("perfect-fast:") || !makefile.includes("docs-drift")` (target at Makefile:589) and check-examples-matrix.mjs:357 `!makefile.includes("perfect-fast:") || !makefile.includes("examples-matrix")` (target at Makefile:349). The vacuous form actually appears in 14 scripts total (also maintenance-playbook, security-threat-model, decision-records, snippet-safety, config-precedence, data-handling, operation-coverage, naming-taxonomy, generator-portability, doc-index, release-readiness).
```

### Implementation steps

Apply 14 verbatim source edits, then create 1 new test file. Every `before` block below is at column 0 (no leading indentation); the replacement bodies are indented with 4 spaces exactly as shown. Each before/after block is unique within its file.

--- STEP 1: scripts/check-support-bundle.mjs (lines 270-272) ---
BEFORE:
if (!makefile.includes("perfect-fast:") || !makefile.includes("support-bundle")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing support-bundle");
}
AFTER:
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.split(/\s+/).includes("support-bundle")) {
        fail("Makefile", `${aggregateTarget} wiring missing support-bundle`);
    }
}

--- STEP 2: scripts/check-docs-drift.mjs (lines 244-246) ---
BEFORE:
if (!makefile.includes("perfect-fast:") || !makefile.includes("docs-drift")) {
    failures.push("Makefile perfect-fast/perfect-full wiring missing docs-drift");
}
AFTER:
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.split(/\s+/).includes("docs-drift")) {
        failures.push(`Makefile ${aggregateTarget} wiring missing docs-drift`);
    }
}

--- STEP 3: scripts/check-examples-matrix.mjs (lines 357-359) ---
BEFORE:
if (!makefile.includes("perfect-fast:") || !makefile.includes("examples-matrix")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing examples-matrix");
}
AFTER:
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.split(/\s+/).includes("examples-matrix")) {
        fail("Makefile", `${aggregateTarget} wiring missing examples-matrix`);
    }
}

--- STEP 4: scripts/check-maintenance-playbook.mjs (lines 324-326) ---
BEFORE:
if (!makefile.includes("perfect-fast:") || !makefile.includes("maintenance-playbook")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing maintenance-playbook");
}
AFTER:
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.split(/\s+/).includes("maintenance-playbook")) {
        fail("Makefile", `${aggregateTarget} wiring missing maintenance-playbook`);
    }
}

--- STEP 5: scripts/check-security-threat-model.mjs (lines 271-273) ---
BEFORE:
if (!makefile.includes("perfect-fast:") || !makefile.includes("security-threat-model")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing security-threat-model");
}
AFTER:
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.split(/\s+/).includes("security-threat-model")) {
        fail("Makefile", `${aggregateTarget} wiring missing security-threat-model`);
    }
}

--- STEP 6: scripts/check-decision-records.mjs (lines 209-211) ---
BEFORE:
if (!makefile.includes("perfect-fast:") || !makefile.includes("decision-records")) {
    failures.push("Makefile perfect-fast/perfect-full wiring missing decision-records");
}
AFTER:
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.split(/\s+/).includes("decision-records")) {
        failures.push(`Makefile ${aggregateTarget} wiring missing decision-records`);
    }
}

--- STEP 7: scripts/check-snippet-safety.mjs (lines 267-269) ---
BEFORE:
if (!makefile.includes("perfect-fast:") || !makefile.includes("snippet-safety")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing snippet-safety");
}
AFTER:
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.split(/\s+/).includes("snippet-safety")) {
        fail("Makefile", `${aggregateTarget} wiring missing snippet-safety`);
    }
}

--- STEP 8: scripts/check-config-precedence.mjs (lines 234-236) ---
BEFORE:
if (!makefile.includes("perfect-fast:") || !makefile.includes("config-precedence")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing config-precedence");
}
AFTER:
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.split(/\s+/).includes("config-precedence")) {
        fail("Makefile", `${aggregateTarget} wiring missing config-precedence`);
    }
}

--- STEP 9: scripts/check-data-handling.mjs (lines 206-208) ---
BEFORE:
if (!makefile.includes("perfect-fast:") || !makefile.includes("data-handling")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing data-handling");
}
AFTER:
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.split(/\s+/).includes("data-handling")) {
        fail("Makefile", `${aggregateTarget} wiring missing data-handling`);
    }
}

--- STEP 10: scripts/check-operation-coverage.mjs (lines 246-248) ---
BEFORE:
if (!makefile.includes("perfect-fast:") || !makefile.includes("operation-coverage")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing operation-coverage");
}
AFTER:
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.split(/\s+/).includes("operation-coverage")) {
        fail("Makefile", `${aggregateTarget} wiring missing operation-coverage`);
    }
}

--- STEP 11: scripts/check-naming-taxonomy.mjs (lines 266-268) ---
BEFORE:
if (!makefile.includes("perfect-fast:") || !makefile.includes("naming-taxonomy")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing naming-taxonomy");
}
AFTER:
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.split(/\s+/).includes("naming-taxonomy")) {
        fail("Makefile", `${aggregateTarget} wiring missing naming-taxonomy`);
    }
}

--- STEP 12: scripts/check-generator-portability.mjs (lines 260-262) ---
BEFORE:
if (!makefile.includes("perfect-fast:") || !makefile.includes("generator-portability")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing generator-portability");
}
AFTER:
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.split(/\s+/).includes("generator-portability")) {
        fail("Makefile", `${aggregateTarget} wiring missing generator-portability`);
    }
}

--- STEP 13: scripts/check-doc-index.mjs (lines 160-162) ---
NOTE: the gate TOKEN here is `docs-index-drift` (the Makefile target name), NOT the script name. Keep it exactly as `docs-index-drift`.
BEFORE:
if (!makefile.includes("perfect-fast:") || !makefile.includes("docs-index-drift")) {
    failures.push("Makefile perfect-fast/perfect-full wiring missing docs-index-drift");
}
AFTER:
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.split(/\s+/).includes("docs-index-drift")) {
        failures.push(`Makefile ${aggregateTarget} wiring missing docs-index-drift`);
    }
}

--- STEP 14: scripts/check-release-readiness.mjs (lines 306-308) ---
BEFORE:
if (!makefile.includes("perfect-fast:") || !makefile.includes("release-readiness")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing release-readiness");
}
AFTER:
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.split(/\s+/).includes("release-readiness")) {
        fail("Makefile", `${aggregateTarget} wiring missing release-readiness`);
    }
}

Notes that hold for all 14 edits: in every one of these scripts the `makefile` variable is already in scope and already holds the FULL Makefile text (verified: check-doc-index.mjs reads it via `fs.readFileSync`, the other 13 via `await readRel("Makefile")`), and the surrounding code already uses either `fail("Makefile", ...)` (steps 1,3,4,5,7,8,9,10,11,12,14) or `failures.push(...)` (steps 2,6,13). The replacement keeps each file's existing reporting mechanism, so no new imports or variables are required.

### Test to add

Create a NEW file scripts/check-aggregate-wiring.test.mjs with EXACTLY this content (it is a self-contained Node assertion script — no test runner needed; it exercises the REAL check-support-bundle.mjs as a representative of the identical pattern, and always restores the Makefile in a finally block):

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const makefilePath = path.join(root, "Makefile");
const script = path.join(root, "scripts", "check-support-bundle.mjs");

function runScript() {
    try {
        execFileSync("node", [script], { cwd: root, stdio: "pipe" });
        return 0;
    } catch (err) {
        return err.status ?? 1;
    }
}

const original = readFileSync(makefilePath, "utf8");
try {
    // 1. With the gate wired (current repo state) the self-check passes.
    assert.equal(runScript(), 0, "check-support-bundle.mjs must pass on the unmodified Makefile");

    // 2. Remove `support-bundle` ONLY from the perfect-fast aggregate prerequisite line.
    const mutated = original
        .split("\n")
        .map((line) =>
            line.startsWith("perfect-fast:")
                ? line.replace(/\s+support-bundle(?=\s|$)/, "")
                : line,
        )
        .join("\n");
    assert.notEqual(mutated, original, "test setup: perfect-fast line must contain support-bundle");
    writeFileSync(makefilePath, mutated);

    // 3. The scoped self-check now catches the missing wiring (non-zero exit).
    assert.notEqual(
        runScript(),
        0,
        "check-support-bundle.mjs must fail when perfect-fast drops support-bundle",
    );
} finally {
    writeFileSync(makefilePath, original);
}

console.log("ok - aggregate wiring self-check is scoped to the recipe lines");

Run ONLY this test with:
node scripts/check-aggregate-wiring.test.mjs

Expected output on success: a single line `ok - aggregate wiring self-check is scoped to the recipe lines` and exit code 0.

### Verify

```bash
Run all of the following from the repo root (/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk); each must exit 0:

# 1. Syntax-check every edited script and the new test (no output, exit 0 each):
node --check scripts/check-support-bundle.mjs && node --check scripts/check-docs-drift.mjs && node --check scripts/check-examples-matrix.mjs && node --check scripts/check-maintenance-playbook.mjs && node --check scripts/check-security-threat-model.mjs && node --check scripts/check-decision-records.mjs && node --check scripts/check-snippet-safety.mjs && node --check scripts/check-config-precedence.mjs && node --check scripts/check-data-handling.mjs && node --check scripts/check-operation-coverage.mjs && node --check scripts/check-naming-taxonomy.mjs && node --check scripts/check-generator-portability.mjs && node --check scripts/check-doc-index.mjs && node --check scripts/check-release-readiness.mjs && node --check scripts/check-aggregate-wiring.test.mjs

# 2. The new regression test (prints the ok line, exit 0):
node scripts/check-aggregate-wiring.test.mjs

# 3. Each affected gate still passes against the current (correctly-wired) Makefile:
make support-bundle docs-drift examples-matrix maintenance-playbook security-threat-model decision-records snippet-safety config-precedence data-handling operation-coverage naming-taxonomy generator-portability docs-index-drift release-readiness
```

### Rollback

git checkout -- scripts/ && rm -f scripts/check-aggregate-wiring.test.mjs

---

## Task 39 — [LOW] Harden check-version-consistency.mjs so it cannot silently skip the release-please manifest comparison when manifestKeyForReleasePlease is not a configured package id

- **Severity:** LOW  •  **Category:** false-green  •  **Task id:** `sb4-4`
- **Files:** `scripts/check-version-consistency.mjs`, `scripts/check-version-consistency.test.mjs`

### Problem

In scripts/check-version-consistency.mjs the release-please manifest reconciliation (lines 62-75) reads `key = policy.manifestKeyForReleasePlease`, `tracked = releaseManifest[key]`, and `expected = versions[key]` where `versions` is keyed by package id. When `key` is a manifest entry that is NOT a configured package id, `expected === undefined`, so the `else if (expected !== undefined && tracked !== expected)` branch (line 68) is skipped; and because `tracked` is a string, the `typeof tracked !== "string"` guard (line 66) also passes. The version comparison is silently skipped and the gate prints "release-please manifest in sync" and exits 0 even when the manifest tracks a stale version. The only config-shape check (line 39-41) asserts `manifestKeyForReleasePlease` is a string, never that it is a known package id, and the sibling validator scripts/check-version-policy.mjs never inspects the versionConsistency block. Empirically reproduced: with manifestKeyForReleasePlease="." and .release-please-manifest.json={".":"9.9.9"}, the gate declared the manifest "in sync" (exit 0) while it tracked 9.9.9 vs the real wrapper 0.9.0 — a false green. With the currently committed config (key="wrapper") the gate behaves correctly, so this is a latent robustness/false-green gap, not an active mis-result today.

### Proof (independent opus-max verifier)

```
Code trace (read directly, lines 63-74):
  const key = policy.manifestKeyForReleasePlease;   // 63
  const tracked = releaseManifest[key];             // 64
  const expected = versions[key];                   // 65  (versions is keyed by pkg.id)
  if (typeof tracked !== "string") { fail(...) }     // 66-67
  else if (expected !== undefined && tracked !== expected) { fail(...) }  // 68-74
When key is a release-manifest key that is NOT a configured package id, expected===undefined, so the `else if` is skipped; if key IS present in the manifest, `tracked` is a string so line 66 also passes -> the version comparison is silently skipped and the gate passes. Config shape validation (lines 39-41) only asserts manifestKeyForReleasePlease is a string, never that it is a known package id.

Empirical reproduction (ran the REAL script with only the `root` line redirected to a fixture; diff confirmed lines 62-74 byte-identical). Fixture: manifestKeyForReleasePlease="." with .release-please-manifest.json={".":"9.9.9"} and packages wrapper=0.9.0/cli=0.1.0/mcp=0.4.0. Result:
  "version-consistency passed (wrapper=0.9.0, cli=0.1.0, mcp=0.4.0; release-please manifest in sync)"  EXITCODE=0
i.e. the gate declared the manifest "in sync" while it tracked 9.9.9 vs the real 0.9.0 — a false green.

Controls: (A) key="wrapper" (a real id) with manifest wrapper=9.9.9 vs package 0.9.0 -> correctly FAILS ("tracks wrapper=9.9.9 but wrapper/package.json is 0.9.0", exit 1), proving the gate works when key is a package id. (B) key="." absent from manifest -> FAILS "missing tracked key" (exit 1), proving line 66 only catches the key-absent drift, not key-present-but-not-an-id.

Not handled elsewhere: grep shows manifestKeyForReleasePlease is referenced ONLY in check-version-consistency.mjs; the sibling validator scripts/check-version-policy.mjs (wiring.checker) never inspects the versionConsistency block in its assertPolicyShape, so there is no upstream guard.
```

### Implementation steps

STEP 1 — Add the configured-package-id guard to scripts/check-version-consistency.mjs.

Open /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-version-consistency.mjs.

Find this EXACT text (the end of the `versions` loop immediately followed by the release-manifest read):

    versions[pkg.id] = manifest.version;
}

const releaseManifest = readJson(

Replace it with this EXACT text (the new guard block is inserted between the closing `}` of the loop and the `const releaseManifest` declaration):

    versions[pkg.id] = manifest.version;
}

const declaredIds = new Set(
    (policy.packages ?? [])
        .map((pkg) => pkg?.id)
        .filter((id) => typeof id === "string"),
);
if (
    typeof policy.manifestKeyForReleasePlease === "string" &&
    !declaredIds.has(policy.manifestKeyForReleasePlease)
) {
    fail(
        "version-policy",
        `versionConsistency.manifestKeyForReleasePlease ${JSON.stringify(policy.manifestKeyForReleasePlease)} ` +
            `is not one of the configured package ids`,
    );
}

const releaseManifest = readJson(

Do not change any other line. No new imports are required (`fail` and `policy` are already in scope).

STEP 2 — Add the test file.

Create a NEW file at /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-version-consistency.test.mjs with this EXACT content:

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/check-version-consistency.mjs");

function runStagedScript(stagedRoot) {
    return new Promise((resolve) => {
        execFile(
            process.execPath,
            [path.join(stagedRoot, "scripts/check-version-consistency.mjs")],
            (error, stdout, stderr) => {
                resolve({
                    code: error && typeof error.code === "number" ? error.code : 0,
                    stdout,
                    stderr,
                });
            },
        );
    });
}

async function stageRoot(versionPolicy, releaseManifest) {
    const stagedRoot = await mkdtemp(path.join(os.tmpdir(), "clockify-vc-test-"));
    await mkdir(path.join(stagedRoot, "scripts"), { recursive: true });
    await mkdir(path.join(stagedRoot, "docs"), { recursive: true });
    await copyFile(script, path.join(stagedRoot, "scripts/check-version-consistency.mjs"));
    await writeFile(
        path.join(stagedRoot, "docs/version-policy.json"),
        JSON.stringify(versionPolicy),
    );
    await writeFile(
        path.join(stagedRoot, ".release-please-manifest.json"),
        JSON.stringify(releaseManifest),
    );
    for (const id of ["wrapper", "cli", "mcp"]) {
        await mkdir(path.join(stagedRoot, id), { recursive: true });
        await writeFile(
            path.join(stagedRoot, id, "package.json"),
            JSON.stringify({ version: "0.9.0" }),
        );
    }
    return stagedRoot;
}

const packages = [
    { id: "wrapper", manifest: "wrapper/package.json" },
    { id: "cli", manifest: "cli/package.json" },
    { id: "mcp", manifest: "mcp/package.json" },
];

test("fails when manifestKeyForReleasePlease is not a configured package id", async () => {
    const stagedRoot = await stageRoot(
        {
            versionConsistency: {
                releasePleaseManifest: ".release-please-manifest.json",
                manifestKeyForReleasePlease: ".",
                packages,
            },
        },
        { ".": "9.9.9" },
    );
    try {
        const result = await runStagedScript(stagedRoot);
        assert.equal(result.code, 1);
        assert.match(
            result.stderr,
            /manifestKeyForReleasePlease "\." is not one of the configured package ids/,
        );
    } finally {
        await rm(stagedRoot, { recursive: true, force: true });
    }
});

test("passes when manifestKeyForReleasePlease is a configured package id and tracks it", async () => {
    const stagedRoot = await stageRoot(
        {
            versionConsistency: {
                releasePleaseManifest: ".release-please-manifest.json",
                manifestKeyForReleasePlease: "wrapper",
                packages,
            },
        },
        { wrapper: "0.9.0" },
    );
    try {
        const result = await runStagedScript(stagedRoot);
        assert.equal(result.code, 0);
        assert.match(result.stdout, /release-please manifest in sync/);
    } finally {
        await rm(stagedRoot, { recursive: true, force: true });
    }
});

### Test to add

New file /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-version-consistency.test.mjs (full content given in STEP 2). It stages a temp repo root, copies the real scripts/check-version-consistency.mjs into it, and runs it as a child process against two fixtures: (1) manifestKeyForReleasePlease="." with .release-please-manifest.json={".":"9.9.9"} -> asserts exit code 1 and stderr matching the new "is not one of the configured package ids" message (this is the regression guard for the false green); (2) manifestKeyForReleasePlease="wrapper" with {"wrapper":"0.9.0"} -> asserts exit code 0 and stdout matching "release-please manifest in sync" (control proving the fix stays green on correct config). Run just this test with:
node --test scripts/check-version-consistency.test.mjs
(run from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk). Both fixtures were executed manually against the patched script and produced exactly these results (exit 1 with the new message; exit 0 with the in-sync line).

### Verify

```bash
Run all from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:
1. node --test scripts/check-version-consistency.test.mjs   # the new test, expect 2 passing, 0 failing
2. node scripts/check-version-consistency.mjs               # the real gate against the committed config, expect "version-consistency passed (wrapper=0.9.0, cli=0.1.0, mcp=0.4.0; release-please manifest in sync)" and exit 0
3. make version-consistency                                 # the make target wrapping the gate, expect exit 0
Confirmed before writing this task: the unmodified real gate already exits 0 (so the fix does not break it), and the patched script fails the drifted-key fixture (exit 1) and passes the correct-config fixture (exit 0).
```

### Rollback

git checkout scripts/check-version-consistency.mjs && rm -f scripts/check-version-consistency.test.mjs

---

## Task 40 — [LOW] Make the mock Clockify route contract gate boot-and-probe each route instead of loose substring matching

- **Severity:** LOW  •  **Category:** false-green  •  **Task id:** `sb5-1`
- **Files:** `scripts/check-mock-clockify-contract.mjs`, `wrapper/tests/mock-clockify-routes.test.ts`

### Problem

The gate `scripts/check-mock-clockify-contract.mjs` verifies the mock server's `requiredRoutes` (12 routes in `docs/mock-clockify-contract.json`) using loose, independent substring checks against the server SOURCE TEXT. For each route it asserts the HTTP method token (`req.method === "GET"`) appears ANYWHERE in the file and that each non-brace path segment (e.g. `clients`, `tags`) appears ANYWHERE in the file; method and path are never associated. Proven false-green: deleting the entire `GET /workspaces/{workspaceId}/clients` handler still leaves the gate printing "mock Clockify contract passed (12 routes, 4 test surfaces)" and exiting 0, because the bare word `clients` survives in the seeded `state.clients` array and `req.method === "GET"`/`workspaces` appear in other handlers. No other test or gate drives `GET /clients`, `POST /tags`, or `DELETE /tags/{tagId}` against the mock, so those 3 of 12 routes can be dropped or mis-wired with nothing catching it. The fix replaces the source-token route loop with an actual boot-and-probe (mirroring the proven pattern in `scripts/check-fixture-mock-parity.mjs`), and adds a wrapper test that probes every contract route behaviorally.

### Proof (independent opus-max verifier)

```
Mechanism verified by reading scripts/check-mock-clockify-contract.mjs lines 172-185 directly. The route loop (178-185) does `const [method, routePath] = route.split(" ")`, then asserts `server.includes('req.method === "${method}"')` (method token anywhere, 180) and, per non-brace path segment, `server.includes(segment)` (segment anywhere, 183), with `{...}` segments skipped (182). Method and path are never associated; `defaultWorkspaceId` (172) and each `requiredHeaders` entry (176) are equally bare `server.includes(...)` checks. The finding's quoted shape and its mock-server line refs are accurate (current scripts/mock-clockify-server.mjs:154 is the GET tags handler; "clients" appears at :14 in state.clients).

DECISIVE LIVE RUN of the real gate (not just a trace):
- Clean repo: `node scripts/check-mock-clockify-contract.mjs` -> "mock Clockify contract passed (12 routes, 4 test surfaces)", exit 0.
- I deleted the ENTIRE `GET /workspaces/{workspaceId}/clients` handler block (mock-clockify-server.mjs:174-177) so the route is genuinely unserved (would 404). Re-ran the gate -> still "mock Clockify contract passed (12 routes, 4 test surfaces)", exit 0. It stays green because the bare token `clients` survives in the seeded `state.clients` array (:14) and `req.method === "GET"`/`workspaces` appear in other handlers. Restored via `git checkout`; tree verified clean.

No compensating coverage for the affected routes. I enumerated every consumer that boots `createMockClockifyServer` and drives it over HTTP: wrapper/cli/mcp mock-clockify.test.ts (GET /user, GET /workspaces, GET tags, status), wire-shape-http.test.ts (GET/POST/PUT invoices/{id}), wire-shape-list-http.test.ts (GET projects, GET invoices list, GET time-entries in-progress), error-decode-http.test.ts (GET /user error injection), and check-fixture-mock-parity.mjs (boots+probes only GET invoices/{id} and GET projects per docs/fixture-mock-parity-map.json). NONE exercise `GET /clients`, `POST /tags`, or `DELETE /tags/{tagId}` against the mock. The mcp clients/tags tool tests and the wrapper/mcp sandbox tests do NOT import createMockClockifyServer (verified) — they mock a different layer or hit real Clockify. So those 3 of 12 required routes are vouched for ONLY by this loose static gate: GET clients can be entirely removed (proven) and POST/DELETE tags can be mis-wired (e.g. rebinding `resource === "tags"` 
…[truncated]
```

### Implementation steps

STEP 1 — Edit `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-mock-clockify-contract.mjs`.

Locate this EXACT block (currently lines 178-185, inside the `if (server) {` block):

```js
    for (const route of contract.requiredRoutes ?? []) {
        const [method, routePath] = route.split(" ");
        if (!server.includes(`req.method === "${method}"`)) fail(`mock server missing method ${method} for ${route}`);
        for (const segment of routePath.split("/").filter(Boolean)) {
            if (segment.startsWith("{")) continue;
            if (!server.includes(segment)) fail(`mock server missing route segment ${segment} for ${route}`);
        }
    }
```

Replace it with EXACTLY this block (same 4-space base indentation, still inside the `if (server) {` block):

```js
    // Boot the mock on loopback and probe each required route so a dropped or
    // mis-wired handler cannot pass on loose source tokens. (Method + path
    // segments used to be checked independently against the file text, so a
    // missing GET /clients stayed green because the bare word "clients"
    // survives in the seeded state object.)
    const { createMockClockifyServer } = await import("./mock-clockify-server.mjs");
    const probe = createMockClockifyServer();
    const probeBase = await probe.listen(); // returns http://host:port/api/v1
    const seededTagId = probe.state.tags[0]?.id ?? "000000000000000000000101";
    const seededInvoiceId = probe.state.invoices[0]?.id ?? "000000000000000000000401";
    try {
        for (const route of contract.requiredRoutes ?? []) {
            const [method, routePath] = route.split(" ");
            const concretePath = routePath
                .replaceAll("{workspaceId}", probe.workspaceId)
                .replaceAll("{tagId}", seededTagId)
                .replaceAll("{invoiceId}", seededInvoiceId);
            try {
                const response = await fetch(`${probeBase}${concretePath}`, {
                    method,
                    headers: { "X-Api-Key": "mock" },
                });
                await response.text().catch(() => {});
                if (response.status === 404) fail(`mock server does not serve ${route} (404)`);
            } catch (error) {
                fail(`mock server route ${route} probe failed: ${error.message}`);
            }
        }
    } finally {
        await probe.close();
    }
```

Do NOT change any other line in the file. The static `export function` check (line 170), `defaultWorkspaceId` check (lines 172-174), and `requiredHeaders` check (lines 175-177) stay exactly as-is. Top-level `await` is already valid in this ESM `.mjs` module (the sibling gate `scripts/check-fixture-mock-parity.mjs` uses `await run()` at module top level), and the replacement sits inside the existing `if (server) { ... }` block at module scope, so the `await import(...)` / `await probe.listen()` / `await probe.close()` calls are legal there.

STEP 2 — Create the new file `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/mock-clockify-routes.test.ts` with EXACTLY this content (full file):

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, expect, it } from "vitest";

import { createMockClockifyServer, type MockClockifyServer } from "../../scripts/mock-clockify-server.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contract = JSON.parse(
    readFileSync(path.join(repoRoot, "docs/mock-clockify-contract.json"), "utf8"),
) as { requiredRoutes: string[] };

let mock: MockClockifyServer;
let baseUrl: string;

beforeEach(async () => {
    mock = createMockClockifyServer();
    baseUrl = await mock.listen();
});

afterEach(async () => {
    await mock.close();
});

it("serves every contract requiredRoute against the live mock (no 404)", async () => {
    const tagId = mock.state.tags[0]?.id ?? "000000000000000000000101";
    const invoiceId = mock.state.invoices[0]?.id ?? "000000000000000000000401";
    for (const route of contract.requiredRoutes) {
        const [method, routePath] = route.split(" ");
        const concretePath = routePath
            .replaceAll("{workspaceId}", mock.workspaceId)
            .replaceAll("{tagId}", tagId)
            .replaceAll("{invoiceId}", invoiceId);
        const response = await fetch(`${baseUrl}${concretePath}`, {
            method,
            headers: { "X-Api-Key": "mock" },
        });
        await response.text().catch(() => {});
        expect(response.status, `${route} should be served by the mock`).not.toBe(404);
    }
});
```

This test imports `createMockClockifyServer` from the same relative path (`../../scripts/mock-clockify-server.mjs`) used by the existing `wrapper/tests/mock-clockify.test.ts`, and reads the route list from `docs/mock-clockify-contract.json` so it stays in lockstep with the gate's source of truth. It behaviorally exercises the three previously-uncovered routes (`GET /clients`, `POST /tags`, `DELETE /tags/{tagId}`) plus the other nine.

### Test to add

New file `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/mock-clockify-routes.test.ts` (full content given in STEP 2). Run ONLY this test with:

```
npm test -w clockify-sdk-ts-115 -- tests/mock-clockify-routes.test.ts
```

Expected: 1 passing test ("serves every contract requiredRoute against the live mock (no 404)").

### Verify

```bash
Run all three, all from the repo root `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk`:

1. The fixed gate (must print the passed line and exit 0):
```
node scripts/check-mock-clockify-contract.mjs
```
Expected stdout: `mock Clockify contract passed (12 routes, 4 test surfaces)` and exit code 0.

2. The make target wiring the same gate:
```
make mock-contract
```
Expected: same passed line, exit 0.

3. The new behavioral test:
```
npm test -w clockify-sdk-ts-115 -- tests/mock-clockify-routes.test.ts
```
Expected: 1 passed.

Optional regression confirmation that the false-green is now closed (do NOT commit this mutation; restore immediately after): temporarily delete the `GET /workspaces/{workspaceId}/clients` handler block (lines 174-177 of `scripts/mock-clockify-server.mjs`), rerun `node scripts/check-mock-clockify-contract.mjs` — it must now FAIL with `mock server does not serve GET /workspaces/{workspaceId}/clients (404)` and exit 1 — then run `git checkout -- scripts/mock-clockify-server.mjs` to restore.
```

### Rollback

`git checkout -- scripts/check-mock-clockify-contract.mjs && rm -f wrapper/tests/mock-clockify-routes.test.ts`

---

## Task 41 — [LOW] Make the "perfect-full must not run local mutation" guard tokenize prerequisites instead of using a space-delimited substring

- **Severity:** LOW  •  **Category:** false-green  •  **Task id:** `scripts-batch-6-3`
- **Files:** `scripts/check-mutation-ci-workflow.mjs`, `scripts/lib/perfect-full-prereqs.mjs`, `scripts/lib/test-perfect-full-prereqs.mjs`

### Problem

scripts/check-mutation-ci-workflow.mjs enforces "perfect-full must not run local mutation" (the heavy local Stryker `mutation` target must NOT be a prerequisite of the `perfect-full` make target; only the lightweight `mutation-ci` wiring check belongs there). Line 51 implements this with a space-delimited substring test: `if (perfectFullLine.includes(" mutation ")) fail(...)`. That pattern only matches a `mutation` token that has a space on BOTH sides. If someone appends `mutation` as the LAST prerequisite of `perfect-full` (no trailing space — and .editorconfig trims trailing whitespace on the Makefile, guaranteeing none), the token is preceded by a space but followed by end-of-line, so `" mutation "` does NOT match and the guard silently passes. This is the ONLY guard in the repo enforcing this invariant (verified: no other guard in scripts/, Makefile, or docs/ covers it), so the trailing-position blind spot is uncovered. Result: a false-green — `perfect-full` could be wired to run the slow local mutation run and the contract check would not catch it. The current real Makefile `perfect-full:` line contains only the tokens `mutation-safety` and `mutation-ci` (verified), so this fix does not change the guard's current pass/fail result; it closes the blind spot for future edits.

### Proof (independent opus-max verifier)

```
See proof field.
```

### Implementation steps

STEP 1 — Create the new pure helper module.

Create a NEW file at exactly:
/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/lib/perfect-full-prereqs.mjs

with this EXACT content:

```js
/**
 * Pure helpers for inspecting the `perfect-full` make target's prerequisite list.
 *
 * The mutation-CI contract checker must reject a local Stryker `mutation`
 * prerequisite on `perfect-full` (only the lightweight `mutation-ci` wiring
 * check belongs there) while still allowing the multi-segment tokens
 * `mutation-ci` and `mutation-safety`. A space-delimited substring test misses a
 * trailing-position `mutation` token (no trailing space — .editorconfig trims it
 * on the Makefile), so these helpers tokenize on whitespace and compare exact
 * tokens instead.
 */

/**
 * Split a `target: a b c` make rule line into its prerequisite tokens.
 * Returns an empty array when the target has no prerequisites.
 * @param {string} perfectFullLine
 * @returns {string[]}
 */
export function parsePerfectFullPrereqs(perfectFullLine) {
    const afterColon = perfectFullLine.slice(perfectFullLine.indexOf(":") + 1).trim();
    return afterColon.length === 0 ? [] : afterColon.split(/\s+/);
}

/**
 * True when the local Stryker `mutation` target is an exact prerequisite token.
 * The multi-segment tokens `mutation-ci` and `mutation-safety` never match.
 * @param {string} perfectFullLine
 * @returns {boolean}
 */
export function perfectFullRunsLocalMutation(perfectFullLine) {
    return parsePerfectFullPrereqs(perfectFullLine).includes("mutation");
}
```

STEP 2 — Import the helper in the guard.

In /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-mutation-ci-workflow.mjs, locate this EXACT line (line 4):

```js
import { fileURLToPath } from "node:url";
```

Replace it with EXACTLY (the original line, then the new import line):

```js
import { fileURLToPath } from "node:url";
import { perfectFullRunsLocalMutation } from "./lib/perfect-full-prereqs.mjs";
```

STEP 3 — Replace the substring check with the tokenized check.

In the same file /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-mutation-ci-workflow.mjs, locate this EXACT line (line 51):

```js
if (perfectFullLine.includes(" mutation ")) fail("perfect-full must not run local mutation");
```

Replace it with EXACTLY:

```js
if (perfectFullRunsLocalMutation(perfectFullLine)) fail("perfect-full must not run local mutation");
```

Do NOT change lines 49 and 50 (the `perfectFullLine` definition and the `mutation-ci` inclusion check) — they stay exactly as they are.

### Test to add

Create a NEW test file at exactly:
/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/lib/test-perfect-full-prereqs.mjs

with this EXACT content:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
    parsePerfectFullPrereqs,
    perfectFullRunsLocalMutation,
} from "./perfect-full-prereqs.mjs";

test("perfectFullRunsLocalMutation matches only the exact `mutation` prerequisite token", () => {
    // Current real shape: mutation-safety + mutation-ci present, bare `mutation` absent.
    assert.equal(
        perfectFullRunsLocalMutation(
            "perfect-full: mutation-safety mutation-ci size performance-budgets",
        ),
        false,
    );

    // Trailing-position bare `mutation` — the blind spot the old substring check missed.
    assert.equal(
        perfectFullRunsLocalMutation(
            "perfect-full: mutation-safety mutation-ci performance-budgets mutation",
        ),
        true,
    );

    // Mid-position bare `mutation`.
    assert.equal(
        perfectFullRunsLocalMutation(
            "perfect-full: mutation-safety mutation size mutation-ci",
        ),
        true,
    );

    // Multi-segment tokens must never be mistaken for the bare token.
    assert.equal(
        perfectFullRunsLocalMutation("perfect-full: mutation-ci mutation-safety"),
        false,
    );
});

test("parsePerfectFullPrereqs returns an empty array for a target with no prerequisites", () => {
    assert.deepEqual(parsePerfectFullPrereqs("perfect-full:"), []);
});
```

Run ONLY this test with:

cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk && node --test scripts/lib/test-perfect-full-prereqs.mjs

Expected: all tests pass (exit code 0, "# pass 2", "# fail 0").

### Verify

```bash
Run all three from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

1. node --test scripts/lib/test-perfect-full-prereqs.mjs
   Expected: "# pass 2", "# fail 0", exit code 0.

2. node scripts/check-mutation-ci-workflow.mjs
   Expected: prints "mutation CI workflow contract passed", exit code 0 (the guard still passes against the real Makefile, whose perfect-full prerequisites contain only `mutation-safety` and `mutation-ci`).

3. make mutation-ci
   Expected: exit code 0 (this is the make target that invokes scripts/check-mutation-ci-workflow.mjs).
```

### Rollback

git checkout -- scripts/check-mutation-ci-workflow.mjs && rm -f scripts/lib/perfect-full-prereqs.mjs scripts/lib/test-perfect-full-prereqs.mjs

---

## Task 42 — [LOW] Normalize all trailing dots before host classification so loopback/metadata IPv4 literals with 2+ trailing dots cannot bypass the webhook SSRF guard

- **Severity:** LOW  •  **Category:** security  •  **Task id:** `deep-ssrf-1`
- **Files:** `wrapper/webhook-url.ts`, `wrapper/tests/webhook-url.test.ts`

### Problem

The offline SSRF guard `validateWebhookUrl` / `assertSafeWebhookUrl` in `wrapper/webhook-url.ts` ALLOWS internal IPv4 literals that carry two or more trailing dots, e.g. `https://127.0.0.1../`, `https://169.254.169.254../` (cloud metadata), `https://10.0.0.1../`, plus the encodings `https://127.0.0.1。。/` (ideographic dots) and `https://10.0.0.1%2e%2e/` (percent-encoded dots) which Node's WHATWG URL parser folds to the same `..` host. Node folds exactly ONE trailing dot into the IPv4 form (`127.0.0.1.` -> `127.0.0.1`, correctly blocked) but preserves 2+ verbatim (`127.0.0.1..` stays `127.0.0.1..`). In `classifyHost`, `parseIpv4("127.0.0.1..")` splits on "." into 6 parts (length != 4) -> "not-ipv4"; `classifyIpv6` finds no ":" -> "not-ipv6"; `classifyHostname` strips only ONE trailing dot (line 69 `host.slice(0, -1)`), leaving `127.0.0.1.` which matches no denylist entry, so the guard returns `null` (ALLOWED). This violates the guard's own documented invariant (lines 10-12: it must reject loopback/link-local/metadata IP literals). This is the sole offline SSRF pre-flight and is the first content check in the MCP webhooks-create handler (mcp/src/tools/webhooks.ts), the update handler, the setup_webhook workflow (mcp/src/tools/workflows/business.ts), and the CLI (cli/src/commands/webhooks.ts); mcp/src/orchestration/webhook-url.ts merely re-exports this wrapper guard, so this is the single source of truth.

### Implementation steps

STEP 1 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/webhook-url.ts

Locate this EXACT function (lines 56-66):

```
function classifyHost(host: string): string | null {
    if (host.length === 0) return "empty host";

    const ipv4Reason = classifyIpv4(host);
    if (ipv4Reason !== "not-ipv4") return ipv4Reason;

    const ipv6Reason = classifyIpv6(host);
    if (ipv6Reason !== "not-ipv6") return ipv6Reason;

    return classifyHostname(host);
}
```

Replace it with EXACTLY:

```
function classifyHost(host: string): string | null {
    if (host.length === 0) return "empty host";

    // Node's WHATWG URL parser folds only a SINGLE trailing dot into the IPv4
    // form (127.0.0.1. -> 127.0.0.1); two or more are preserved verbatim
    // (127.0.0.1.. stays 127.0.0.1..). Such a host slips past parseIpv4
    // (split('.') yields length != 4) and past classifyHostname's single-dot
    // strip, leaking a loopback/metadata IPv4 literal. Collapse all trailing
    // dots once before classification. (Leading/internal empty labels make
    // `new URL()` itself throw, so trailing dots are the only live vector.)
    const normalized = host.replace(/\.+$/, "");
    if (normalized.length === 0) return "empty host";

    const ipv4Reason = classifyIpv4(normalized);
    if (ipv4Reason !== "not-ipv4") return ipv4Reason;

    const ipv6Reason = classifyIpv6(normalized);
    if (ipv6Reason !== "not-ipv6") return ipv6Reason;

    return classifyHostname(normalized);
}
```

Do NOT change any other function. Leave `classifyHostname`'s existing single-dot strip (line 69) untouched — it is now redundant for trailing dots but harmless.

STEP 2 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/webhook-url.test.ts

Locate this EXACT span (the closing brace of the `privateIpv4` loop followed by the next `it`):

```
    }

    it("accepts routable public IPv4 literals", () => {
```

Replace it with EXACTLY (inserts a new regression block in between):

```
    }

    // Regression for deep-ssrf-1: Node's URL parser folds ONE trailing dot into
    // the IPv4 form but preserves 2+ verbatim (127.0.0.1.. stays 127.0.0.1..),
    // and ideographic / percent-encoded dots fold to the same "..". All of these
    // must be rejected as the internal literal they normalize to.
    const trailingDotIpv4 = [
        "https://127.0.0.1../",
        "https://169.254.169.254../",
        "https://10.0.0.1../",
        "https://127.0.0.1。。/",
        "https://10.0.0.1%2e%2e/",
    ];
    for (const candidate of trailingDotIpv4) {
        it(`rejects trailing-dot internal IPv4: ${candidate}`, () => {
            const result = validateWebhookUrl(candidate);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.reason).toMatch(/private|loopback|metadata|reserved|nat|multicast|broadcast/i);
            }
        });
    }

    it("accepts routable public IPv4 literals", () => {
```

### Test to add

Add the `trailingDotIpv4` array + for-loop block shown in STEP 2 to /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/webhook-url.test.ts (inserted between the existing `privateIpv4` loop and the `it("accepts routable public IPv4 literals", ...)` block). It registers 5 cases asserting `validateWebhookUrl(...).ok === false` with a private/loopback/metadata reason for: "https://127.0.0.1../", "https://169.254.169.254../", "https://10.0.0.1../", "https://127.0.0.1。。/" (ideographic dots), and "https://10.0.0.1%2e%2e/" (percent-encoded dots). Run just this file with: npm test -w clockify-sdk-ts-115 -- tests/webhook-url.test.ts

### Verify

```bash
From the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk run all three, each must exit 0:
1. npm run type-check -w clockify-sdk-ts-115
2. npm test -w clockify-sdk-ts-115 -- tests/webhook-url.test.ts
3. npm test -w clockify-sdk-ts-115
Expected: type-check clean; the webhook-url suite reports 58 passing tests (53 prior + 5 new); full wrapper suite green.
```

### Rollback

git checkout -- wrapper/webhook-url.ts wrapper/tests/webhook-url.test.ts

---

## Task 43 — [LOW] Add a name-keyed destructive-tool scan to the MCP write-safety gate so a _delete/_remove tool that forgets destructiveHint:true cannot pass green

- **Severity:** LOW  •  **Category:** false-green  •  **Task id:** `dws-1`
- **Files:** `scripts/check-mcp-write-safety.mjs`, `scripts/check-mcp-write-safety.test.mjs`

### Problem

The write-safety gate `scripts/check-mcp-write-safety.mjs` builds its "destructive tools" set ONLY from tools that self-declare `destructiveHint === true` in the generated manifest (discoverDestructiveTools, lines 505-508). Every enforcement loop (the guarded/exempt check at lines 412-419 and the destructiveNamePattern test at line 414) iterates that already-filtered set. So a domain tool named e.g. `clockify_widgets_delete` that wires `ctx.client.widgets.delete(...)` but OMITS both `destructiveHint: true` and `requireConfirmation` is absent from the destructive set, escapes the 412-419 loop and the converse check at 425-432, and the gate passes green — directly contradicting the headline comment at 365-366 ("a new unguarded delete cannot ship silently"). `annotations` is `annotations?: JsonRecord` (mcp/src/result.ts), fully optional, so the scenario compiles. No other gate (check-mcp-contract.mjs, check-mcp-agent-ux.mjs) and no test enforces a delete-name => destructiveHint invariant. Fix: add a loop over the FULL `toolManifest.tools` list (which enumerates every registered tool by name, not just destructive ones) keyed on the tool NAME, independent of the self-declared hint. Verified: baseline gate currently passes (exit 0, "23 destructive tools checked"), and the new loop passes against the current manifest (all 17 current _delete/_remove names are marked and guarded/exempt).

### Implementation steps

STEP 1 — Insert the name-keyed scan into scripts/check-mcp-write-safety.mjs.

This step inserts a new loop BETWEEN the `workflowSet` declaration and the existing `for (const tool of destructiveTools)` loop. `destructiveNamePattern`, `toolManifest`, `guardedSet`, `exemptSet`, `workflowSet`, and `failures` are all already in scope at this point — no new imports.

Locate this EXACT block (lines 406-412), which appears exactly once:

```
const guardedSet = new Set(contract.confirmationGuardedDomainTools);
const exemptSet = new Set(contract.confirmationExemptDestructiveTools ?? []);
const workflowSet = new Set([
    ...contract.highRiskWorkflowTools,
    ...contract.idempotentWorkflowTools,
]);
for (const tool of destructiveTools) {
```

Replace it with EXACTLY:

```
const guardedSet = new Set(contract.confirmationGuardedDomainTools);
const exemptSet = new Set(contract.confirmationExemptDestructiveTools ?? []);
const workflowSet = new Set([
    ...contract.highRiskWorkflowTools,
    ...contract.idempotentWorkflowTools,
]);
// Independent of self-declared destructiveHint: any tool whose NAME ends in
// _delete/_remove must (a) be marked destructiveHint:true and (b) be guarded
// or explicitly exempt. Closes the gap where a forgotten annotation hides a
// destructive tool from the manifest-derived destructive set entirely.
for (const tool of toolManifest.tools ?? []) {
    if (typeof tool?.name !== "string") continue;
    if (!destructiveNamePattern.test(tool.name)) continue;
    if (workflowSet.has(tool.name)) continue; // workflow writes guard via maybeConfirm
    if (tool.destructiveHint !== true) {
        failures.push(
            `tool ${tool.name} has a destructive _delete/_remove name but is not marked ` +
                "destructiveHint:true (it would be invisible to the destructive-tool guard check)",
        );
    }
    if (!guardedSet.has(tool.name) && !exemptSet.has(tool.name)) {
        failures.push(
            `destructive domain tool ${tool.name} is neither in confirmationGuardedDomainTools ` +
                "nor confirmationExemptDestructiveTools",
        );
    }
}
for (const tool of destructiveTools) {
```

STEP 2 — Update the headline comment in the SAME file to reflect the now-enforced name-based guarantee.

Locate this EXACT block (lines 365-366), which appears exactly once:

```
// Every destructive DELETE/REMOVE domain tool must be guarded (dry_run->confirm)
// or explicitly exempted, so a new unguarded delete cannot ship silently.
```

Replace it with EXACTLY:

```
// Every destructive DELETE/REMOVE domain tool must be guarded (dry_run->confirm)
// or explicitly exempted, so a new unguarded delete cannot ship silently. The
// name-keyed loop below (over the full toolManifest.tools list) enforces this
// even for a tool that forgot its destructiveHint:true annotation, so it cannot
// hide from the manifest-derived destructive set.
```

No other edits to this file.

### Test to add

Create a NEW file at this EXACT path: /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/check-mcp-write-safety.test.mjs

Write this EXACT content (full file):

```
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(root, "scripts/check-mcp-write-safety.mjs");
const manifestPath = path.join(root, "docs/mcp-tool-manifest.json");
const originalManifest = readFileSync(manifestPath, "utf8");

function runGate() {
    return spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: "utf8" });
}

after(() => {
    // Safety net: always restore the committed manifest bytes.
    writeFileSync(manifestPath, originalManifest);
});

test("gate passes on the unmodified repo manifest", () => {
    const result = runGate();
    assert.equal(
        result.status,
        0,
        `expected exit 0, got ${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
});

test("gate fails a _delete tool that forgot destructiveHint:true", () => {
    const manifest = JSON.parse(originalManifest);
    manifest.tools.push({
        name: "clockify_zzz_delete",
        title: "Forgotten destructive tool",
        group: "domain",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
        destructiveHint: false,
    });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    try {
        const result = runGate();
        assert.notEqual(
            result.status,
            0,
            "expected the gate to FAIL on a forgotten destructiveHint annotation",
        );
        assert.match(
            result.stderr,
            /clockify_zzz_delete has a destructive _delete\/_remove name but is not marked/,
        );
    } finally {
        writeFileSync(manifestPath, originalManifest);
    }
});
```

This test temporarily injects an unmarked `clockify_zzz_delete` tool into the manifest, runs the real gate as a subprocess, asserts it now exits non-zero with the new failure message, and restores the original manifest bytes in a `finally` block plus an `after()` safety net. The first test asserts the gate still passes on the unmodified repo (regression guard). Note: the gate collects ALL failures and prints them to stderr before exiting 1, so the injected-tool message reliably appears even if other failures are present.

Command to run JUST this test (from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk):

node --test scripts/check-mcp-write-safety.test.mjs

### Verify

```bash
Run all from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk :

1. node scripts/check-mcp-write-safety.mjs
   Expect exit 0 and the final line: "MCP write-safety contract passed (23 destructive tools checked)."

2. node --test scripts/check-mcp-write-safety.test.mjs
   Expect "# pass 2" and "# fail 0".

3. make mcp-write-safety
   Expect it to regenerate the manifest prerequisite and the checker to pass (exit 0).

4. git status --short docs/mcp-tool-manifest.json
   Expect no output (the test restores the manifest, so the working tree stays clean).
```

### Rollback

git checkout scripts/check-mcp-write-safety.mjs && rm scripts/check-mcp-write-safety.test.mjs

---

## Task 44 — [LOW] Fix parseRateLimitResetAt turning `Retry-After: 0` into a year-2000 reset Date

- **Severity:** LOW  •  **Category:** edge-case  •  **Task id:** `deep-errors-2`
- **Files:** `wrapper/errors.ts`, `wrapper/tests/errors.test.ts`

### Problem

In wrapper/errors.ts, the `parseRateLimitResetAt(headers)` helper guards the Retry-After seconds branch with `seconds > 0` (line 542), while the sibling `parseRetryAfterMs` uses `seconds >= 0` (line 515). When a 429 response carries `Retry-After: 0` as the ONLY rate-limit header (no `X-RateLimit-Reset`), the `> 0` guard is false, so execution falls through to `const date = new Date(retryAfter)` i.e. `new Date("0")`. In V8 (node) `new Date("0")` is NOT an Invalid Date: it parses to Sat Jan 01 2000 00:00:00 local time (`getTime() === 946681200000`, ISO `1999-12-31T23:00:00.000Z`), a FINITE value, so line 546 returns it. The public, documented `RateLimitError.rateLimitResetAt` field therefore reports an instant ~27 years in the past instead of ~now. This contradicts the field's documented "now + N seconds" contract (for N=0 that is ~now) and the sibling parser, which already yields `retryAfterMs === 0`. Fix: change the seconds guard from `> 0` to `>= 0` so `Retry-After: 0` produces `new Date(Date.now() + 0)` (~now), matching parseRetryAfterMs. wrapper/errors.ts is a tracked, hand-written root wrapper helper (in scope; not generated, not gitignored) and is mutated by Stryker.

### Implementation steps

STEP 1 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/errors.ts

Locate this EXACT block inside the `parseRateLimitResetAt` function (lines 539-547):

```ts
    const retryAfter = headers.get("Retry-After") ?? headers.get("retry-after");
    if (retryAfter != null) {
        const seconds = Number.parseInt(retryAfter, 10);
        if (Number.isFinite(seconds) && seconds > 0) {
            return new Date(Date.now() + seconds * 1000);
        }
        const date = new Date(retryAfter);
        if (Number.isFinite(date.getTime())) return date;
    }
```

Replace it with EXACTLY:

```ts
    const retryAfter = headers.get("Retry-After") ?? headers.get("retry-after");
    if (retryAfter != null) {
        const seconds = Number.parseInt(retryAfter, 10);
        // Retry-After: 0 (RFC 9110 delay-seconds=0) means retry immediately → reset ≈ now.
        // Match parseRetryAfterMs's `>= 0` guard so the seconds form never falls through to
        // `new Date("0")` (V8 parses that as year 2000 / a past instant).
        if (Number.isFinite(seconds) && seconds >= 0) {
            return new Date(Date.now() + seconds * 1000);
        }
        const date = new Date(retryAfter);
        if (Number.isFinite(date.getTime())) return date;
    }
```

The only behavioral change is `seconds > 0` → `seconds >= 0`; the three comment lines are added above the `if`. Do not change any other line in the function or file.

### Test to add

In /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/errors.test.ts, locate this EXACT existing test (lines 62-68):

```ts
    it("treats Retry-After: 0 as 0ms (retry immediately), not undefined", () => {
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: H({ "Retry-After": "0" }) as never,
        });
        expect(err.retryAfterMs).toBe(0);
    });
```

Replace it with EXACTLY:

```ts
    it("treats Retry-After: 0 as 0ms (retry immediately), not undefined", () => {
        const before = Date.now();
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: H({ "Retry-After": "0" }) as never,
        });
        const after = Date.now();
        expect(err.retryAfterMs).toBe(0);
        // Retry-After: 0 must yield a reset instant ≈ now (within the call window),
        // never the year-2000 past instant from a `new Date("0")` fall-through.
        expect(err.rateLimitResetAt).toBeInstanceOf(Date);
        const resetMs = err.rateLimitResetAt!.getTime();
        expect(resetMs).toBeGreaterThanOrEqual(before);
        expect(resetMs).toBeLessThanOrEqual(after);
    });
```

This uses the already-imported `RateLimitError` and the already-defined `H` helper; no new imports are needed. The bounded `before`/`after` assertion would fail against the buggy `1999-12-31T23:00:00.000Z` value (resetMs far below `before`), so it is a true regression guard (relevant since Stryker mutates wrapper/errors.ts).

Run just this test file:

```bash
npm test -w clockify-sdk-ts-115 -- tests/errors.test.ts
```

### Verify

```bash
From the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk run, in order:

1. Type-check the wrapper package:
```bash
npm run type-check -w clockify-sdk-ts-115
```
Expect: exit 0, no errors.

2. Run the focused error test file:
```bash
npm test -w clockify-sdk-ts-115 -- tests/errors.test.ts
```
Expect: all tests pass, including "treats Retry-After: 0 as 0ms (retry immediately), not undefined".

3. Run the full wrapper test suite:
```bash
npm test -w clockify-sdk-ts-115
```
Expect: all tests pass.

4. Lint the wrapper (perfect-fast runs lint; the per-package test/type-check do not):
```bash
npm run lint -w clockify-sdk-ts-115
```
Expect: exit 0.

(If a clean clone, run `npm ci` and `make sdk-codegen` first to populate wrapper/src/ and dist/.)
```

### Rollback

git checkout -- wrapper/errors.ts wrapper/tests/errors.test.ts

---

## Task 45 — [LOW] Short-circuit non-positive limit in PaginatedList.toArray so { limit: 0 } returns [] with zero fetches

- **Severity:** LOW  •  **Category:** correctness / off-by-one  •  **Task id:** `deep-pagination-3`
- **Files:** `wrapper/paginated-list.ts`, `wrapper/tests/paginated-list.test.ts`

### Problem

In wrapper/paginated-list.ts, the `toArray` method checks the limit AFTER pushing each item (line 70: `if (limit !== undefined && out.length >= limit) break;`). For `limit: 0` on a non-empty source, the loop's first iteration pushes item0 (out.length becomes 1), then evaluates `0 !== undefined && 1 >= 0` => true => break, returning a 1-element array `["a"]` and having performed 1 page fetch. This violates the documented "Stop after collecting at most this many items" contract (lines 27-30) and the inline "stops as soon as items.length === limit" doc (lines 62-64): at-most-0 must yield 0 items with no fetch. Negative limits today also wrongly return 1 item. Verified by executing the real module against a mock fetcher.

### Proof (independent opus-max verifier)

```
I read the real source and then executed it. The toArray body (paginated-list.ts:65-73) checks the bound AFTER the push:

  const limit = options.limit;
  const out: TItem[] = [];
  for await (const item of this) {
      out.push(item);
      if (limit !== undefined && out.length >= limit) break;   // line 70
  }
  return out;

For limit=0 on a non-empty source: the loop's first iteration pushes item0 (out.length=1), then evaluates `0 !== undefined && 1 >= 0` => true => break => returns [item0]. The for-await also drives the first iterAll/iterPages page fetch before the break.

I ran the actual module via `node --import tsx` against a mock fetcher (pages [["a","b","c"],["d","e","f"],["g"]], pageSize 3). Observed output:
  {"limit":0,"result":["a"],"length":1,"fetches":1}
  {"limit":1,"result":["a"],"length":1,"fetches":1}
  {"limit":2,"result":["a","b"],"length":2,"fetches":1}
  {"result":[...7 items...],"length":7,"fetches":3}      (no limit)
  {"limit":0,"result":[],"length":0,"fetches":1,"note":"empty-source"}

So limit:0 returns exactly 1 item and does 1 fetch (length 0 only when the source itself is empty — and even then 1 fetch occurs). This violates the documented contract: the option doc (lines 27-30) says "Stop after collecting at most this many items" and the inline doc (62-64) says the walk "stops as soon as items.length === limit" — at-most-0 / items.length===0 must be 0 with no fetch. Confirmed off-by-one, exactly as the finding describes (its quoted lines 68-71 are accurate).
```

### Implementation steps

STEP 1 — Edit /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/paginated-list.ts

Locate this EXACT current method (lines 65-73):

    async toArray(options: PaginatedListToArrayOptions = {}): Promise<TItem[]> {
        const limit = options.limit;
        const out: TItem[] = [];
        for await (const item of this) {
            out.push(item);
            if (limit !== undefined && out.length >= limit) break;
        }
        return out;
    }

Replace it with EXACTLY:

    async toArray(options: PaginatedListToArrayOptions = {}): Promise<TItem[]> {
        const limit = options.limit;
        if (limit !== undefined && limit <= 0) return [];
        const out: TItem[] = [];
        for await (const item of this) {
            out.push(item);
            if (limit !== undefined && out.length >= limit) break;
        }
        return out;
    }

The only change is the inserted guard line `if (limit !== undefined && limit <= 0) return [];` immediately after `const limit = options.limit;`. Do NOT remove the inner `limit !== undefined` check on the break line — `limit` is still possibly undefined on the unbounded path. No new imports are needed.

STEP 2 — Add the regression test described in `test_to_add` to /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/paginated-list.test.ts (see that field for the exact code and placement).

### Test to add

In /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/paginated-list.test.ts, locate this EXACT existing test block (lines 21-32):

    it("toArray({ limit }) stops early and avoids extra fetches", async () => {
        const pages = [["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i"], ["j"]];
        const fetcher = vi.fn(async (req: { page?: number; "page-size"?: number }) => {
            const i = (req.page ?? 1) - 1;
            return pages[i] ?? [];
        });
        const list = paginatedList(fetcher, {}, { pageSize: 3 });
        const first4 = await list.toArray({ limit: 4 });
        expect(first4).toEqual(["a", "b", "c", "d"]);
        // limit hit during page 2 — page 3 must NOT have been fetched.
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

Insert the following new test block IMMEDIATELY AFTER that block's closing `});` (i.e. as a new `it(...)` between the "stops early" test and the "toArray() with no limit" test):

    it("toArray({ limit: 0 }) returns [] and performs no fetch", async () => {
        const pages = [["a", "b", "c"], ["d", "e", "f"], ["g"]];
        const fetcher = vi.fn(async (req: { page?: number; "page-size"?: number }) => {
            const i = (req.page ?? 1) - 1;
            return pages[i] ?? [];
        });
        const list = paginatedList(fetcher, {}, { pageSize: 3 });
        expect(await list.toArray({ limit: 0 })).toEqual([]);
        // at-most-0 must short-circuit before any page fetch.
        expect(fetcher).toHaveBeenCalledTimes(0);
    });

Run just this test file with (from the repo root):

npm test -w clockify-sdk-ts-115 -- paginated-list

### Verify

```bash
From the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

1. npm run type-check -w clockify-sdk-ts-115
2. npm test -w clockify-sdk-ts-115 -- paginated-list
3. npm test -w clockify-sdk-ts-115
4. npm run lint -w clockify-sdk-ts-115

All four must exit 0. (The wrapper package is clockify-sdk-ts-115.)
```

### Rollback

git checkout -- wrapper/paginated-list.ts wrapper/tests/paginated-list.test.ts

---

## Task 46 — [LOW] Make codegen `unionTypes` bracket-depth aware so structured union members with internal unions are not corrupted

- **Severity:** LOW  •  **Category:** codegen-correctness  •  **Task id:** `deep-codegen-3`
- **Files:** `scripts/sdk-codegen/schema.mjs`, `scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs`

### Problem

In the hand-written SDK generator, `unionTypes(types)` in `scripts/sdk-codegen/schema.mjs` flattens each union member by doing `String(type).split(" | ")` and de-duplicating the resulting fragments. The split is NOT bracket-depth aware, so a member whose type string contains an internal ` | ` (e.g. `Record<string, string | number>`) is torn apart at that internal separator and its fragments are deduped against other members. For a `oneOf` of two objects whose `additionalProperties` are themselves `oneOf[string,number]` and `oneOf[string,boolean]`, `typeFromSchema` produces the malformed, unbalanced TypeScript string `Record<string, string | number> | boolean>` (verified by executing the real `typeFromSchema`). This is latent and fail-loud: the corrected spec's 4 `oneOf` sites all have flat members so nothing triggers it today, and the wrapper `tsc` build would reject the unbalanced type — but a future spec carrying a structured member with an internal union would generate corrupt output. The file is git-tracked hand-written generator code (only `output/ts-sdk/**`, `wrapper/src/**`, and `spec/corrected/**` are hard-stops), so it is in-scope to edit.

### Implementation steps

FILE 1 — /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/sdk-codegen/schema.mjs

Locate this EXACT current function (lines 119-130):

```
function unionTypes(types) {
    const flattened = [];
    for (const type of types) {
        for (const part of String(type)
            .split(" | ")
            .map((entry) => entry.trim())
            .filter(Boolean)) {
            if (!flattened.includes(part)) flattened.push(part);
        }
    }
    return flattened.join(" | ") || "unknown";
}
```

Replace it with EXACTLY (the rewritten `unionTypes` plus a new `splitTopLevelUnion` helper directly below it):

```
function unionTypes(types) {
    const flattened = [];
    for (const type of types) {
        for (const part of splitTopLevelUnion(String(type))
            .map((entry) => entry.trim())
            .filter(Boolean)) {
            if (!flattened.includes(part)) flattened.push(part);
        }
    }
    return flattened.join(" | ") || "unknown";
}

function splitTopLevelUnion(type) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < type.length; i++) {
        const ch = type[i];
        if (ch === "<" || ch === "(" || ch === "[" || ch === "{") depth++;
        else if (ch === ">" || ch === ")" || ch === "]" || ch === "}") depth--;
        else if (depth === 0 && ch === "|" && type[i - 1] === " " && type[i + 1] === " ") {
            parts.push(type.slice(start, i - 1));
            start = i + 2;
        }
    }
    parts.push(type.slice(start));
    return parts;
}
```

No import changes are needed in this file; `splitTopLevelUnion` is a local helper and `typeFromSchema` is already exported.

FILE 2 — /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs

Step 2a. Add an import for `typeFromSchema`. Locate this EXACT current line (line 7):

```
import test from "node:test";
```

Replace it with EXACTLY:

```
import test from "node:test";

import { typeFromSchema } from "./schema.mjs";
```

Step 2b. Add a new unit test. Locate this EXACT current block (the end of the "unsupported schema features" test followed by the `readGenerated` helper, lines 116-120):

```
    } finally {
        await rm(temp, { recursive: true, force: true });
    }
});

async function readGenerated(out, relativePath) {
```

Replace it with EXACTLY:

```
    } finally {
        await rm(temp, { recursive: true, force: true });
    }
});

test("union members keep balanced brackets when a structured member has an internal union", () => {
    const schema = {
        oneOf: [
            { type: "object", additionalProperties: { oneOf: [{ type: "string" }, { type: "number" }] } },
            { type: "object", additionalProperties: { oneOf: [{ type: "string" }, { type: "boolean" }] } },
        ],
    };
    assert.equal(
        typeFromSchema(schema, { doc: {} }),
        "Record<string, string | number> | Record<string, string | boolean>",
    );

    const flat = { oneOf: [{ type: "string" }, { type: "string" }, { type: "number" }] };
    assert.equal(typeFromSchema(flat, { doc: {} }), "string | number");
});

async function readGenerated(out, relativePath) {
```

### Test to add

Test added inside the existing /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs (see Step 2b for the full verbatim test block). It imports the real `typeFromSchema` from ./schema.mjs and asserts:
1. The trigger schema (oneOf of two objects whose additionalProperties are oneOf[string,number] and oneOf[string,boolean]) yields the balanced `Record<string, string | number> | Record<string, string | boolean>` (before the fix this returned the corrupt `Record<string, string | number> | boolean>`).
2. A flat overlapping union oneOf[string,string,number] still dedups to `string | number` (regression guard for the existing flatten/dedup behavior).

Run just this test from the repo root:
node --test scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs

(equivalently: npm run test:codegen)

### Verify

```bash
From repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk:

1. Run the codegen unit/integration tests (must pass, includes the new test):
   node --test scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs

2. Regenerate the SDK and confirm the generator still runs clean:
   make sdk-codegen

3. Confirm the regenerated wrapper still type-checks (this is the fail-loud guard the fix protects):
   npm run type-check -w clockify-sdk-ts-115
```

### Rollback

git checkout -- scripts/sdk-codegen/schema.mjs scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs

---

## Task 47 — [LOW] Delete orphaned requestRuntimeSource() emitter in scripts/sdk-codegen/emitter.mjs

- **Severity:** LOW  •  **Category:** maintainability / dead-code removal  •  **Task id:** `deep-codegen-4`
- **Files:** `scripts/sdk-codegen/emitter.mjs`, `wrapper/tests/generated-baseurl-routing.test.ts`

### Problem

scripts/sdk-codegen/emitter.mjs defines two emitters for the generated request runtime: the DEAD `requestRuntimeSource()` (line 49) and the ACTIVE `requestRuntimeSourceWithTimeoutAndRetry()` (line 53). Only the active one is ever called (line 39: `await write(outDir, "core/request.ts", requestRuntimeSourceWithTimeoutAndRetry());`). A whole-repo grep finds exactly 3 references to `requestRuntimeSource` — the call on line 39 (to the active variant) and the two function definitions on lines 49 and 53 — and the dead function is module-private (no `export`), so it cannot be imported elsewhere. It is never invoked: confirmed dead. The dead variant is a stale, superseded copy that lacks two correctness behaviors the active one has: (1) it omits per-operation `operation.baseUrl` from its `OperationSpec` interface and from its base-URL resolution, so a runtime built from it would ignore the per-op host override the generator emits (line 382) and break reports.api.clockify.me / auditlog-api host routing; (2) it has no retry loop and no request timeout. There is no runtime impact today because the dead function is unreferenced, but it is a maintenance landmine: a future maintainer who rewires line 39 to the wrong name silently reintroduces both regressions. Deleting it makes the active emitter the single source of truth. emitter.mjs is the hand-written generator, NOT one of the hard-stop generated paths (spec/corrected/**, output/ts-sdk/**, wrapper/src/**), so it is editable.

### Implementation steps

STEP 1 — Delete the dead function in /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/sdk-codegen/emitter.mjs.

The dead function occupies exactly three physical lines (the body is one long single-line template literal):
- Line 49: `function requestRuntimeSource() {`
- Line 50: a single physical line beginning `    return `${GENERATED_BANNER}import { ClockifyApiError, ClockifyApiTimeoutError } from "../errors/index.js";...` (one ~4 KB line — do NOT try to retype it)
- Line 51: `}`
- Line 52: a blank line

It sits between the close of `writeCore()` (line 47 `}`, line 48 blank) and the active function (line 53 `function requestRuntimeSourceWithTimeoutAndRetry() {`).

Because line 50 is a single multi-kilobyte physical line, do NOT use the Edit tool (you cannot reliably reproduce that line verbatim). Instead run this EXACT command from the repo root, which deletes the function block (lines 49-51) plus the leading blank-line newline so the result keeps exactly one blank line between `writeCore` and the active emitter:

```
perl -0777 -i -pe 's/\nfunction requestRuntimeSource\(\) \{\n.*?\n\}\n//s' /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/sdk-codegen/emitter.mjs
```

Regex explanation (informational — run it verbatim): `\nfunction requestRuntimeSource\(\) \{\n` matches the start of the dead function (the `\(\)` and `\{` escape the literal `()` and `{`); `.*?` under the `/s` flag non-greedily consumes the one-line body (line 50); `\n\}\n` matches the closing `}` line. The leading `\n` consumed is the blank line before the function, so the collapse leaves a single blank separator.

EXPECTED RESULT around former line 47-53 after the edit (verify by reading the file):
```
    await write(outDir, "core/runtime/index.ts", `${GENERATED_BANNER}export { RUNTIME } from "../index.js";\n`);
}

function requestRuntimeSourceWithTimeoutAndRetry() {
```

STEP 2 — Confirm only the active definition remains. Run this EXACT command from the repo root:

```
grep -rn "requestRuntimeSource" --include="*.mjs" --include="*.ts" --include="*.js" /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk | grep -v node_modules | grep -v "/dist/"
```

It MUST print exactly two lines (the call to the active variant and the active definition):
```
.../scripts/sdk-codegen/emitter.mjs:39:    await write(outDir, "core/request.ts", requestRuntimeSourceWithTimeoutAndRetry());
.../scripts/sdk-codegen/emitter.mjs:..:function requestRuntimeSourceWithTimeoutAndRetry() {
```
If a line containing `function requestRuntimeSource() {` (the dead one, no `WithTimeoutAndRetry`) still appears, the deletion failed — re-run STEP 1.

STEP 3 — Add the regression test from `test_to_add` (full file content below). This locks in both the deletion and the host-routing guarantee the deletion preserves.

STEP 4 — Run the verification commands listed in `verify_commands`, in order.

### Test to add

Create a NEW file at exactly /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/generated-baseurl-routing.test.ts with this EXACT content:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const generatorTemplatePath = path.join(repoRoot, "scripts", "sdk-codegen", "emitter.mjs");
const generatedRequestPath = path.join(repoRoot, "wrapper", "src", "core", "request.ts");

describe("generated request runtime base-url routing", () => {
    it("keeps a single request-runtime emitter (no orphaned dead variant)", () => {
        const generator = readFileSync(generatorTemplatePath, "utf8");
        expect(generator).toContain("function requestRuntimeSourceWithTimeoutAndRetry() {");
        expect(generator).not.toContain("function requestRuntimeSource() {");
        expect(generator).toContain("requestRuntimeSourceWithTimeoutAndRetry()");
    });

    it("resolves per-operation baseUrl in both the emitter template and the generated runtime", () => {
        const generator = readFileSync(generatorTemplatePath, "utf8");
        const generatedRequest = readFileSync(generatedRequestPath, "utf8");

        for (const source of [generator, generatedRequest]) {
            expect(source).toContain("baseUrl?: string;");
            expect(source).toContain("operation.baseUrl");
            expect(source).toContain("?? operation.baseUrl ?? ClockifyApiEnvironment.Default;");
        }
    });
});
```

Run JUST this test from the repo root with:

```
make sdk-codegen && npx vitest run wrapper/tests/generated-baseurl-routing.test.ts --config wrapper/vitest.config.ts
```

(`make sdk-codegen` must run first to populate the gitignored wrapper/src/core/request.ts that the second test reads; the existing wrapper/tests/generated-retry-delay.test.ts already depends on that same generated file the same way.)

### Verify

```bash
Run these from the repo root /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk, in order:

1. Regenerate the SDK so the generated runtime reflects the (unchanged) active emitter:
```
make sdk-codegen
```

2. Build and test the wrapper package (covers the new test plus the existing generated-retry-delay.test.ts that reads the same emitter):
```
npm run build -w clockify-sdk-ts-115
npm test -w clockify-sdk-ts-115
```

3. Type-check the wrapper to confirm generated sources are well-formed:
```
npm run type-check -w clockify-sdk-ts-115
```

ALL must exit 0. The new test in wrapper/tests/generated-baseurl-routing.test.ts and the existing wrapper/tests/generated-retry-delay.test.ts must both pass.
```

### Rollback

git checkout -- scripts/sdk-codegen/emitter.mjs && rm -f wrapper/tests/generated-baseurl-routing.test.ts

---

## Appendix A — Methodology

- 31 line-by-line adversarial finders (16 runtime units + generator + test-integrity + 2 CI + 6 gate-script batches + 5 deep-dive passes), opus, xhigh on crown-jewel security/codegen surfaces.
- 81 raw findings → 81 unique → each verified by an independent opus `effort:max` refuter instructed to default-refute. 47 confirmed, 32 refuted.
- "Do not trust anything": finders ignored comments/docs/green tests; verifiers re-read source and used read-only live GETs against a sandbox workspace to prove wire shapes.
- Two verifier calls errored (StructuredOutput cap) and their findings were dropped unproven (not in this plan).

## Appendix B — Refuted (false positives, correctly cleared)

These were filed by finders but an opus-max verifier refuted them. Listed so a future reviewer does not re-litigate them.

- `wrapper/compose.ts` — leftBehindNote can claim 'Nothing partial was left behind' while entities created without a registered undo remain orphaned
  - _Why cleared:_ The code trace is accurate but the finding does not describe a reachable defect — it describes a contract-deviating (GIGO-adjacent) usage that no code in the repo performs. runComposition/leftBehindNote are correct under their documented contract, which pairs every created entity with a compensating undo (StepResult.undo doc L39 "undo this step's creates"; module doc L11-12; the JSDoc example; all
- `wrapper/diagnostics.ts` — baseUrlCheck echoes the raw base-URL override into a diagnostics result designed to be safe-to-log
  - _Why cleared:_ The finding's central premise — that ClockifyDiagnosticsResult is "designed to be safe-to-log" and therefore the base URL should be redacted like the API key and workspace ID — is explicitly contradicted by the project's own documented policy. docs/diagnostics-policy.md rule 2 deliberately carves base URLs out of redaction: "Base URL overrides can be shown because they are operational context, not
- `wrapper/iter.ts` — Heuristic `items.length === pageSize` on the generic public helpers can infinite-loop with duplicates on page-size-ignoring endpoints
  - _Why cleared:_ The finding describes a known, documented, intentional design tradeoff that is not reachable from any shipped consumer — i.e. "already handled," not a live bug. The maintainers explicitly identified this exact hazard (discrepancies.md `pagination.iter-known-set.envelope-and-unpaginated`, holidays.list/customFields.list* + items.length===pageSize unbounded duplicates), chose to handle it by narrowi
- `wrapper/rate-limit.ts` — Rate-limit backoff helper ignores `Retry-After`, the primary 429 signal the SDK's own retry path reads first
  - _Why cleared:_ The finding mischaracterizes a narrowly-scoped quota-visibility helper as "the SDK's documented backoff recipe," then faults it for not duplicating Retry-After handling that the actual backoff path already provides. (1) The real, documented 429 catch-site recipe is `RateLimitError.retryAfterMs` (errors.ts docstring 13-22; README 357/382), and `parseRetryAfterMs` (errors.ts:511) reads `Retry-After`
- `wrapper/bulk.ts` — mapBounded returns successes in completion order, not input order, with no documented contract — index correlation is silently wrong
  - _Why cleared:_ The finding states a true low-level fact (ok fills in completion order) but builds a non-existent bug on top of it. Three independent reasons it is refuted: (1) Its premise is false — `ok` is a compacted success-only array partitioned away from `failures`, so `ok[i]` cannot correspond to `items[i]` whenever any item fails, INDEPENDENT of ordering; positional correlation was never available under t
- `wrapper/ensure.ts` — archive-then-delete sends a sparse replace-PUT carrying only `name`; if the DELETE fails the entity is left archived with all other fields blanked
  - _Why cleared:_ The finding stacks two unverified live-wire assumptions and treats them as fact: (1) that the project/client update PUT blanks omitted optional fields, and (2) that DELETE realistically fails after a successful archive. Both are required for the alleged harm; neither is established. The repo's own live-probe evidence — which DID find and compensate the identical full-replace-blanking behavior for 
- `cli/src/receipt.ts` — Receipt warnings (and next-action hints) are dropped in the default table mode
  - _Why cleared:_ The table branch omitting the receipt envelope is real but intentional: it is codified by a deliberately-named test ("prints only the legacy data object in table mode") that asserts the warning text is absent, and was introduced in a focused receipt-shape feature commit. The envelope (ids/changed/warnings/next) is by design the additive machine-readable layer for json/ndjson. The finding's headlin
- `cli/src/commands/timeoff.ts` — timeoff submit sets only halfDayPeriod, never timeOffHalfDayPeriod, so --half-day-period may be a silent no-op
  - _Why cleared:_ The finding is a conditional speculation ("IF the wire reads timeOffHalfDayPeriod") whose premise is directly refuted by the repo's own committed live evidence. A 195/195-record live audit (discrepancies.md:140-174) found halfDayPeriod populated on 100% of records and never timeOffHalfDayPeriod; the official spec request example, the response DTO/example, the MCP submit path, and both CLI+MCP pinn
- `mcp/src/client.ts` — createCurrentUserIdMemo permanently caches the empty-string "could-not-determine" sentinel, turning a transient empty getCurrentUser response into permanent server-wide breakage
  - _Why cleared:_ The code trace is literally accurate, but the finding is refuted as a defensible bug because its triggering precondition does not occur in real operation and the worst case degrades gracefully. (1) Unreachable trigger: caching "" requires getCurrentUser() to *resolve* (not throw) to a valid object lacking both id and _id; the live Clockify /user endpoint (corrected spec UserDtoV1, tagged live-succ
- `mcp/src/result.ts` — errorResult drops the retryable / retryAfterSeconds metadata whenever a custom string recovery is supplied
  - _Why cleared:_ The finding accurately describes the code asymmetry but is self-admittedly latent ("impact today is latent rather than active") and, on investigation, is an intentional, test-locked design rather than a defect. (1) No active bug: the only two literal-string-recovery sites (entries.ts:95, agent-docs.ts:96) pair the string with locally-thrown errors that always classify to invalid_request (retry:fal
- `mcp/src/orchestration/confirmation.ts` — preview_hash receipt field carries the whole-payload hash, not the preview's hash
  - _Why cleared:_ The literal observation (surfaced preview_hash = hashCanonical(payload), not hashCanonical(preview)) is true, but it is not a correctness defect a maintainer must fix. (1) The finding's central impact claim is technically wrong: hashCanonical(payload) embeds previewHash=hashCanonical(preview) as a field, so it IS sensitive to preview changes -- preview tampering flips the surfaced hash and is ther
- `mcp/src/tools/entries.ts` — clockify_entries_update replace-PUT silently clears a finished entry's end (un-finishes it into a running timer)
  - _Why cleared:_ The finding fabricates the asymmetry that is its entire basis. It claims clockify_fix_entry preserves the existing end via entryEnd() while clockify_entries_update does not — but entryEnd() (resolve.ts:712-714) is used ONLY in summarizeEntries (resolve.ts:436), a read/reporting function for totals and running-entry flags; it appears nowhere in any update path (verified by grepping all of mcp/src/:
- `mcp/src/tools/groups.ts` — groups_remove_member skips the name->id resolution that add_member performs
  - _Why cleared:_ The code observation is factually correct, but the characterization as a defect-to-fix is wrong. The add_member/remove_member resolution asymmetry is an explicitly documented, intentional design decision: AGENTS.md rule 10 (the canonical contract) and CLAUDE.md both enumerate the resolve-before-write tool set with granular precision and both list `groups add_member` while deliberately omitting `re
- `scripts/sdk-codegen/schema.mjs` — mergeComposedSchema flattens only one level of allOf/anyOf composition (drops inherited fields on nested composition)
  - _Why cleared:_ The code claim is technically correct (mergeComposedSchema does not recurse; deref is one-hop), but the verdict bar — a real, present, must-fix defect — is not met. I independently verified the current spec is unaffected: all 5 allOf sites resolve to flat schemas (ExpenseDtoV1, TimeEntryCreate are flat property objects; ExpensesGroupBy/ExpensesGroupType/HalfDayPeriod are flat enums reached via typ
- `scripts/sdk-codegen/emitter.mjs` — Runtime default host is a hardcoded literal, decoupled from doc.servers[0] used for the per-operation baseUrl decision
  - _Why cleared:_ The finding is mechanically accurate (literal at emitter.mjs:10 vs dynamic doc.servers[0].url at model.mjs:6 are independent) but does not meet the bar of "a real defect a maintainer would have to fix." It is a self-described latent/hypothetical fragility ("it is correct now," severity low): there is no bug today (spec default === literal, verified identical), the trigger (Clockify changing its fo
- `wrapper/tests/wire-shape.test.ts` — Ledger-coverage gate only checks that a mapped test file EXISTS, not that it enforces the finding
  - _Why cleared:_ The finding's literal code observation (existence-only check) is true, but its conclusion — that the docstring overstates and that this is a false-green defect — is a mischaracterization. The docstring is precise: it claims only file-existence/mapping enforcement ("maps to a test file that exists on disk") and delivers exactly that, including a reverse stale-mapping check (L189-193). "Un-enforced 
- `.github/workflows/release.yml` — Post-publish smoke expands tag-derived VERSION inside an in-container shell command (injection surface)
  - _Why cleared:_ The finding rests on the classic shell misconception that the value of an expanded variable is textually substituted into the command line and re-parsed (so `||id||` would become a new command). It is not. POSIX parameter expansion results are not re-scanned for command operators/substitution, and within double quotes word-splitting and pathname expansion are also suppressed; the value becomes a s
- `.github/workflows/ci-cli.yml` — ci-cli/ci-mcp path filters omit `spec/**` and `scripts/**`, so a spec or generator change that breaks the CLI/MCP type surface skips their type-check/test
  - _Why cleared:_ The finding correctly observes that ci-cli.yml/ci-mcp.yml path filters omit spec/** and scripts/**, but its conclusion — that a spec/generator change breaking the CLI/MCP type-check or tests can merge with all checks green — is wrong. The author's analysis (per their own evidence) only inspected ci.yml's `build-and-test` and `cross-gate` jobs and overlooked the `coverage` (L346) and `performance-b
- `scripts/check-snippet-method-parity.mjs` — Snippet method-parity validation is silently skipped when the SDK is not generated, with no strict escalation
  - _Why cleared:_ The finding's code-level description (skip branch bypasses method validation, then prints "passed") is correct, but its core premise and impact are wrong. It asserts "perfect-fast does not run sdk-codegen, so wrapper/src is routinely absent there [and] the parity invariant is never enforced." In reality wrapper/src is NOT routinely absent in a passing perfect-fast: the same gate list (Makefile lin
- `scripts/check-schema-quality.mjs` — generatedSdkEvidence marker checks are silently skipped when wrapper/src is absent, with no strict escalation
  - _Why cleared:_ The finding ignores Makefile gate ordering. Its core claim ("In perfect-fast ... wrapper/src is typically absent ... this generated-evidence check is routinely bypassed") is false: perfect-fast runs wrapper-gates (type-check/build/test the SDK from wrapper/src) at prereq index 83, BEFORE schema-quality at index 86. The 8 hand-written wrapper root files import from ./src, so tsc fails without wrapp
- `scripts/check-mutation-score.mjs` — Monotonic floor ratchet is silently skipped whenever the `git show HEAD:` read fails
  - _Why cleared:_ The code-trace mechanics are correct, but the security/integrity conclusion is overstated and not a defensible must-fix. (1) The byte-identical `try{git show HEAD:...}catch{return null}` is the documented reference convention in scripts/check-coverage-floor.mjs (CLAUDE.md cites it as the canonical ratchet), so this is an accepted idiom, not a bug unique to the mutation gate. (2) The ratchet is by-
- `scripts/check-mcp-write-safety.mjs` — requireConfirmation / maybeConfirm checks prove the call exists, not that it runs before the delete/execution
  - _Why cleared:_ The finding correctly describes the regex as presence-only, but it misstates the impact. The scenario it warns about — a destructive tool whose guard is dead, misordered (after the write), or in a non-taken branch, so the delete runs without a confirmed token — cannot pass CI. mcp/tests/confirm-guard-matrix.test.ts is data-driven over all 17 confirmationGuardedDomainTools AND all 5 workflow tools,
- `scripts/check-supply-chain.mjs` — forbiddenFiles check tests literal membership in package.json `files`, missing forbidden paths nested under an included directory/glob
  - _Why cleared:_ The finding correctly describes the code (literal membership) but mischaracterizes it as a publishable-artifact gap. The contract's forbiddenFiles are exclusively top-level directory names (src/node_modules/examples/docs/tests), which literal membership catches correctly; the cited nested-path hypothetical (dist/secrets.js) exists in no contract. This gate is a declarative `package.json` files-all
- `scripts/build-replay-fixtures.mjs` — Fixture redaction misses IDs/PII embedded in composite strings; committed golden claims full redaction
  - _Why cleared:_ The finding mischaracterizes a best-effort redaction HELPER (build-replay-fixtures.mjs) as the security boundary and overlooks the actual enforcement gate. Its mechanical claim about the helper's anchored/key-name regexes is accurate, but its security IMPACT — "real Clockify workspace/user IDs ... can be committed to the public repo as 'redacted'" — is false. The committed fixtures dir (NOT git-ig
- `scripts/check-cli-contract.mjs` — Exit-code and completion contract proven only by unanchored substrings in the test file
  - _Why cleared:_ The finding correctly describes the checker's mechanics (unanchored substrings; contract exitCode values validated for shape but not compared to the literals), but the stated impact is wrong. This checker is not the proof of the CLI exit-code contract — cli/tests/exit-contract.test.ts is, and it makes real assertions against the CLI's actual exit code (code = await main([...]) at lines 33/51/64/10
- `scripts/lint-openapi-contract.mjs` — Operation count validated against a magic constant, never against the actual operations array length
  - _Why cleared:_ False positive (over-stated impact). The claim that the lint "verifies the headline against a self-declared field that can drift from the array" ignores that the field is not author-declared — it is generated as `operations.length` (generate-openapi-operations.mjs:57), so it cannot drift in a generated file. The only way to produce the mismatch is a hand-edit of a generated artifact, which is inde
- `scripts/check-generator-comparison.mjs` — generator-comparison silently skips the entire SDK-vs-spec comparison (and its minimum thresholds) when the generated root is absent
  - _Why cleared:_ The finding correctly traces that generator-comparison exits 0 with only a console.warn when the generated root is absent, but escalates this into a false-green claim about perfect-fast that does not hold. perfect-fast (Makefile line 134) also runs wrapper-gates, whose type-check/build (`tsc --noEmit`, `tsc`) hard-depend on the generated, gitignored wrapper/src (9 wrapper root files import from ./
- `scripts/check-coverage-floor.mjs` — Coverage ratchet (monotonic-up) check is silently disabled whenever `git show HEAD:` fails for any reason
  - _Why cleared:_ The finding's code trace is correct, but its impact ("anti-regression ratchet defeated; floors lowered undetected; make coverage still passes") is overstated and mis-attributed. The ratchet's authority is CI/local git repos, where `git show HEAD:docs/coverage-contract.json` always succeeds (the file is tracked), so the git-failure null path is not reached there. More importantly, the script is a w
- `wrapper/errors.ts` — classifyClockifyError stamps addon_token_restricted on ANY 401 carrying the marker, ignoring auth scheme, unlike the scheme-gated mapAddonTokenRestriction
  - _Why cleared:_ The finding accurately describes a code asymmetry but mislabels an intentional, documented, and unit-tested design choice as a defect. classifyClockifyError and mapAddonTokenRestriction are different tools with different available information: the mapper is scheme-aware because its caller passes the scheme it used (and deliberately keeps API-key 401s raw); the classifier is scheme-blind because th
- `mcp/src/tools/paging.ts` — collectPagedList silently under-fetches expense categories: envelope-unwrap discards the authoritative Last-Page header, leaving a pageSize=200 heuristic that breaks on the server's capped first page
  - _Why cleared:_ The finding's correctness impact rests entirely on the premise "the live expense-categories endpoint caps a single page below 200," which is false. A read-only live probe shows the endpoint honors page-size (page-size=2 -> 2 items; page-size=200 -> all 148) and honors page (page=2 -> empty), and emits a correct Last-Page header. Because the server returns exactly min(page-size, remaining) per page
- `wrapper/iter.ts` — iterPages trusts Last-Page:false on a zero-item page and defaults maxPages to Infinity, so the public SDK iterators have no termination cap
  - _Why cleared:_ The finding accurately reads the code (unbounded default + no empty-page guard) but mischaracterizes it as a bug. Its impact is explicitly conditional ("if the server ever emits a stale/buggy Last-Page:false on an empty trailing page"), and the repo's own committed live audit (spec/evidence/discrepancies.md:1571-1573, 2026-05-25) shows Clockify does the opposite: the exhausted/empty page returns L
- `scripts/sdk-codegen/schema.mjs` — `mergeComposedSchema` flattens only one allOf level — a two-level allOf chain silently drops inherited fields
  - _Why cleared:_ The code analysis is accurate (I reproduced the single-level flattening), but the finding is not an actual defect — it is a latent robustness gap with zero current impact. Every allOf in the corrected spec is single-level: the two top-level allOf-composition schemas (ExpenseHydratedDtoV1, TimeEntryUpdate) reference plain-object targets (ExpenseDtoV1, TimeEntryCreate, both verified as non-allOf), a

