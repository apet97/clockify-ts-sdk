# Live MCP / CLI Contract Validation — Subagent 2 of 5

Validated findings: M-01 … M-16, C-01 … C-07 (full 23-finding cross-check; live probes limited to read-only).
Repo: `clockify-ts-sdk` · commit `49462f5` · packages `1.0.1 / 1.0.1 / 1.0.1` · Node `26.0.0`.
Live workspace `65b3…b60e` (user `64621faec4d2cc53b91fce6c`, `alpettest1@gmail.com`). No webhooks were created; CLI probes used only safe `GET` (`entries list`, `status`, `doctor`, `completion`, `--help`, `--region bogus`) and the MCP repro used a fake in-memory `timeEntries` client.

---

## 00 Snapshot

| Gate | Command | Outcome |
|---|---|---|
| M-01 fake-ctx repro | `node --input-type=module` invoking `mcp/dist/tools/workflows/time-tracking.js` `switchWork` with `listInProgress→[]` + `create throws` | Bug reproduced: message claims "the previous timer was stopped" when no timer ran; `true`. With a running timer the branch happens to be coincidentally correct. |
| C-02 live | `CLOCKIFY_API_KEY= redacted  node cli/dist/index.js entries list --limit 1abc --output json` vs `--limit 1` | `exit 0` both; `--limit 1abc` returns 1 row (same as `1`); `--limit 2abc` returns 2 rows (same as `2`). Trailing garbage silently truncated — `parseInt("1abc",10)=1` not rejected. |
| C-03 live | `node cli/dist/index.js --region bogus status --output json` vs `--output xml` vs `--region bogus completion bash` | `bogus` → `exit 1` (runtime `Unrecognized Clockify region "bogus"`); `--output xml` → `exit 2` (`commander.invalidArgument`); `completion bash` with `--region bogus` → `exit 0` (412-byte completion printed, region silently ignored). |
| M-02 bundle staleness | Read `mcp/README.md:38-39` + `git tag -l "mcp*"` + `ls mcp/*.mcpb` | README links `clockify115-mcp-0.8.0.mcpb` (`mcp-v0.8.0`) while package is `1.0.1`; latest tag is `mcp-v1.0.0`; no `mcp-v1.0.1` tag; only `clockify115-mcp-0.6.5.mcpb` on disk. Link predates the 162-tool surface. |
| M-03 holidays row | `docs/mcp-tools.json` vs `docs/mcp-tool-manifest.json` | Manifest has 5 holiday tools (`list`, `list_in_period`, `create`, `update`, `delete`). `docs/mcp-tools.json` `domainGroups` holidays entry is `count:5, tools: "list/create/update/delete"` — 4 names, `list_in_period` missing while count says 5. README domain table is generated verbatim from this file. |
| M-05 registries | Set diff of `business.ts:30-82` `WEBHOOK_EVENTS` vs `webhooks.ts:64-116` `WEBHOOK_EVENT_TYPES` | Both 51 members, byte-identical today. `business.ts:84-88` has `Exclude<WebhookEventType, (typeof WEBHOOK_EVENTS)[number]>` + `const _webhookEventsExhaustive: … extends never ? true : false = true`; `webhooks.ts` has only `as const satisfies`, no `Exclude` guard — a 52nd union member would compile cleanly there. |
| M-07 / M-08 URL | `z.url()` semantics + `wrapper/webhook-url.ts` `validateWebhookUrl` | `z.url()` accepts `http://`, `ftp://` at schema level (`http://example.com/hook: PASS`). `assertSafeWebhookUrl` rejects non-https before any side effect (`http://… FAIL: webhook URL must use https (got http scheme)`). No security gap; UX gap only (model must hit `dry_run` to learn). `agent-docs.ts:32` `SNIPPETS.webhook.mcp` says "inspect URL safety warnings" but the dry-run envelope is `{preview, confirm_token, expires_at, preview_hash, risk_class}` — invalid URLs error, no warnings field. |
| M-09 empty ids | `scheduling.ts:574-617` (`clockify_scheduling_publish`) + `users.ts:353-390` (`clockify_users_invite`) vs `result.ts:168-173,259-265` | `publish` does `writeReceipt("updated","scheduling_assignment","")` → `{type:"scheduling_assignment", id:""}`; `invite` does `writeReceipt("created","workspace_member",{name: email})` → `{type:"workspace_member", id:"", name: email}`. `hasChangeSet` keeps non-empty arrays even when `id==""`; output schema accepts `id:""`. Code comments mark this deliberate (publish returns no id; invite returns a workspace, not a member). Agents chaining `changed.*[].id` get `""`. |
| M-11 holidays color | `holidays.ts:128,218` vs `projects.ts` `PROJECT_COLOR_SCHEMA` | `projects.ts` validates `z.string().regex(/^#[0-9A-Fa-f]{6}$/)`; `holidays.ts` `create`/`update` use `color: z.string().optional()` with only a `typeof color !== "string"` check on update — `"not-a-hex"` reaches the wire as an opaque 400 instead of local `invalid_request`. |
| M-12 approvals | `approvals.ts:18-20` `APPROVAL_PERIODS` vs `:152` | Four tools reuse `APPROVAL_PERIODS`; `clockify_approvals_resubmit` inlines `z.enum(["WEEKLY","SEMI_MONTHLY","MONTHLY"])` verbatim. A wire change to periods would update four leaves and silently miss the fifth. |
| Read-only live reachability | `doctor` + `status` + `entries list --limit 1` with the sacrificial key | All `exit 0`: `doctor` reports `ready_for_status`; `status` returns `64621faec4d2cc53b91fce6c / 65b3…b60e / (no timer running)`; `entries list` returns 1 row (`6a70cfeb24908413cb1d8e5b`). |

Credentials were redacted in all logs. Only `GET`/offline probes were used; no webhooks, timers, or deletes were executed.

---

## 01 M-01 Repro — `switchWork` Misreport Branch Is Dead

### Claim under test

`mcp/src/tools/workflows/time-tracking.ts:149` stores the whole stop envelope (`successResult(…).structuredContent = {ok, action, data, meta,…}`) in `stopped`, but `168` tests `(stopped as {stopped?:boolean}).stopped === false` on the envelope itself. `stopWork`'s no-timer data lives at `data.stopped` → the "no timer was running" branch can never fire and the failure message always claims the previous timer was already stopped.

### Observed — envelope shape (code read)

`time-tracking.ts:122-129` returns for the no-timer case:

```ts
successResult("clockify_stop_work",
  { stopped: false, reason: "no timer running" },
  { workspaceId, userId },
  { entity:"entry", ids:{workspaceId, userId} })
```

`result.ts:136-155` builds `{ok:true, action, data, meta?, entity?, ids?}` and publishes it as `structuredContent`. So the live envelope is:

```json
{ "ok":true, "action":"clockify_stop_work",
  "data":{"stopped":false,"reason":"no timer running"},
  "meta":{"workspaceId":"ws-1","userId":"user-1"},
  "entity":"entry", "ids":{"workspaceId":"ws-1","userId":"user-1"} }
```

There is no top-level `stopped`. With a running timer, `data` is the entry (`{id:"te-1",…}`) and `data.stopped` is `undefined` — that branch is intentionally the "timer was stopped" path.

### Observed — fake-ctx repro (executed, no network)

`node --input-type=module` imported the built `mcp/dist/tools/workflows/time-tracking.js` and built a fake `WorkflowContext`:

- `listInProgress: () => []` (no timer), `updateForUser` unused, `users.getCurrentUser → {id:"user-1"}`.
- `create: () => throw Error("boom")` so only the error-note path is exercised.
- `create: () => throw` + `inProgress` returning one running entry for the "timer was running" baseline.

Results (verbatim):

- `Case 1 (no timer + create fails) error: switch_work: the previous timer was stopped, but starting the new timer failed: boom` → `Contains 'no timer was running': false`, `BUG REPRODUCED: true`.
- `Case 2 (timer running + create fails) error: switch_work: the previous timer was stopped, but starting the new timer failed: boom2` → correct by accident.
- `Case 3 (stop throws + create fails) error: switch_work: could not stop the previous timer, but starting the new timer failed: boom3` → unaffected (the `stopped===null` branch).

A minimal shape probe confirms `stopped.stopped` on the no-timer envelope is `undefined` while `stopped.data.stopped` is `false`; the fixed predicate `data?.stopped === false` yields the expected message.

Current test `mcp/tests/work-time-tracking.test.ts:162` covers only the stop-succeeded path (`/previous timer was stopped.*starting the new timer failed: start boom/`). No test constructs the no-timer-then-start-fails path; the `stopWork` no-timer suite ends at the `stopped:false` receipt, not at the `switchWork` failure note.

### Weakest valid hypothesis

The author meant to test the `stopped` flag that `stopWork` put inside `data`, but read the field one level too high. Because a running timer's `data` has no `stopped` flag either, both the buggy `stopped === false` and the correct `data.stopped === false` yield `false` on the running path — so the stop-succeeded error path always passed, hiding the no-timer dead branch. The fix is purely the read slot:

```ts
const stopNote = (stopped as { data?: { stopped?: boolean } }).data?.stopped === false
  ? "no timer was running" : "the previous timer was stopped";
```

The note is message-only; it does not change `retryable`, `code`, or the rethrown error class (the clone preserves the original `ClockifyApiError` so `errorCodeForError` still classifies off the cause, not the string).

### Inference status

- Bug existence: observed fact (code read + executed repro with built artifact).
- Scope: only the combined "no timer + start fails" path is wrong; "timer running + start fails" and "stop itself threw" are unaffected.
- Severity: `medium` (wrong recovery note; the stop still ran and the error is still thrown), confidence `high`.

---

## 02 CLI Validation — C-02 and C-03

### C-02 `parseIntArg` Trailing Garbage (verified by execution, read-only)

Source `cli/src/commands/helpers.ts:23-28`:

```ts
export function parseIntArg(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new InvalidArgumentError("must be a positive integer.");
  return parsed;
}
```

`Number.parseInt("1abc",10)` is `1`; the guard keeps `1` (integer, `>0`) so the garbage is silently dropped. `parseFloatArg`/`parseSignedFloatArg` behave identically (`parseFloat("1.5abc") === 1.5`). Tests cover only the `NaN`/`negative` path.

Live proof (with the sacrificial key, `GET` only):

- `CLOCKIFY_API_KEY=«redacted» CLOCKIFY_WORKSPACE_ID=65b3…b60e node cli/dist/index.js entries list --limit 1abc --output json` → `exit 0`, 1 row, `head -c 200` shows a live entry (`6a70cfeb24908413cb1d8e5b`, `2026-08-03T17:29:15Z`). `stderr` empty.
- `… --limit 1 --output json` → `exit 0`, same 1-row shape. The two outputs are the same list length (both paged `page-size=1`).
- `… --limit 2abc --output json` → `exit 0`, 2 rows (same as `--limit 2`). Reproducible with `parseIntArg` alone: `node --input-type=module -c "import('./cli/dist/commands/helpers.js').then(m=>m.parseIntArg('1abc'))" → 1`.

Commander never sees a usage error because `parseIntArg` does not throw for trailing garbage — so `entries list` reports exit `0` and the mangled `page-size=1` reaches the wire. Every other integer flag routed through `parseIntArg` (page, project/client/tag list limits, etc.) has the same hole; `parseFloatArg` has the same hole for `--amount`/`--hours`.

Weakest hypothesis: the original parser targeted only "user typed letters instead of a number" (`NaN`) and did not consider "user typed a number followed by letters/paste junk". The intended contract (exact positive-integer/number) requires a full-string regex before `parseInt`/`parseFloat` (`/^\d+$/` for ints, `/^-?\d+(?:\.\d+)?$/` for floats) or `String(parsed) !== value.trim()` — not just an `isInteger`/`isFinite` check.

Supported inference: no data is corrupted on the wire beyond the clamping already done by `clampPageSize` (upper bound honored); the defect is silent truncation in scripts/copy-paste (`--limit 10abc` → 10) with no error.

### C-03 `--region` Validation Is Lazy and Incomplete (verified, read-only)

Source: global option `--region`/`--subdomain` is declared in `cli/src/index.ts:58-73` without a custom parser; `parseOutputMode:72-78` is the only parse-time `InvalidArgumentError`. `--region`/`--subdomain` are validated only in `cli/src/client.ts:24-55` `buildRoutingOptions`, which `buildClient:75` calls from `resolveBaseContext`. Commands that never call `resolveBaseContext`/`resolveContext` never call `buildClient`.

Live proof:

| Invocation | Exit | Stderr gist |
|---|---|---|
| `node cli/dist/index.js --region bogus status --output json` | `1` | `{"ok":false,"error":"Unrecognized Clockify region \"bogus\". … Provide one of global, eu, …","code":"invalid_request","retryable":false}` (printed by `main:241-250` `printError` → `isCommanderUsageError` is `false` → `1`) |
| `node cli/dist/index.js status --output xml` | `2` | `error: option '--output <mode>' argument 'xml' is invalid. Provide one of…` (commander `InvalidArgumentError` → `code: "commander.invalidArgument"` → `2`) |
| `node cli/dist/index.js --region bogus completion bash` | `0` | 412-byte `(_clk115_completion() …)` printed; stderr empty |
| `node cli/dist/index.js --region bogus --help` | `0` | Usage printed, region ignored |

So: `--region bogus` on a command that builds a client exits `1` (runtime validation), while `--output xml` exits `2` (parse-time). A second whole class — every client-less command (`completion`, `--version`, `--help`, and any future node-free leaf) — ignores `--region`/`--subdomain` entirely, `exit 0`. The same holds with `CLOCKIFY_REGION=bogus` via `loadConfig`.

Weakest hypothesis: region routing was added after `--output` and wired at the SDK-layer (`buildRoutingOptions`) rather than at the commander-layer, so it inherited the SDK's runtime-throw pattern instead of the CLI's parse-time `InvalidArgumentError` precedent. The `completion` leaf was left client-free on purpose (no `resolveContext` import in `index.ts:103-107`), which inadvertently made the global flag invisible to it.

Remediation faithful to AGENTS.md: attach `InvalidArgumentError`-throwing parsers for `--region`/`--subdomain` (mirroring `parseOutputMode`) so both flags exit `2` and fire on every leaf including `completion`.

---

## 03 Registry and Miscellaneous Checks — M-02, M-03, M-05, M-07, M-08, M-09, M-11, M-12

### M-02 Bundle Link Is Stale (observed fact)

`mcp/README.md:38-39`:

```md
Download `clockify115-mcp-0.8.0.mcpb` from `mcp-v0.8.0` (`…/releases/download/mcp-v0.8.0/…`)
```

`mcp/package.json` declares `1.0.1`; `git tag -l "mcp*"` latest is `mcp-v1.0.0`; no `mcp-v1.0.1` tag exists in the clone. On-disk bundle is `mcp/clockify115-mcp-0.6.5.mcpb`. The 0.8.0 bundle predates the 162-tool surface. The link is the copy-pasted install path a new user will click — a literal stale pointer, not a drift heuristic. Add a `bundle version == PACKAGE_VERSION` drift check (same family as `mcpb-validate`).

### M-03 Holidays Table Drops a Tool (observed fact)

`docs/mcp-tools.json` (machine source for `scripts/update-readme-tables.mjs:40-51`):

```json
{ "resourceGroup":"holidays", "count":5, "tools":"list/create/update/delete" }
```

Count `5` is correct (manifest `docs/mcp-tool-manifest.json` has 5: `holidays_create`, `holidays_delete`, `holidays_list`, `holidays_list_in_period`, `holidays_update`). The `tools` string lists only 4 — `list_in_period` is absent. An agent trusting the rendered README table cannot discover `clockify_holidays_list_in_period`. The manifest and spec operation are correct; the fix is the one missing name in this static row (or generating this row from the manifest).

### M-05 Dual Registries Diverge in Guard, Not in Content (verified — sets identical, guards different)

Full diff of the two 51-element literals:

- `mcp/src/tools/workflows/business.ts:30-83` `WEBHOOK_EVENTS` … `as const satisfies readonly ClockifyApi.WebhookEventType[]` plus `85-88`:
  ```ts
  type _MissingWebhookEvent = Exclude<ClockifyApi.WebhookEventType, (typeof WEBHOOK_EVENTS)[number]>;
  const _webhookEventsExhaustive: _MissingWebhookEvent extends never ? true : false = true;
  ```
  → a 52nd union member makes `_MissingWebhookEvent` that member (not `never`), the `true` assignment fails type-check, the build reds.

- `mcp/src/tools/webhooks.ts:64-116` `WEBHOOK_EVENT_TYPES` … `as const satisfies readonly ClockifyApi.WebhookEventType[]` with no `Exclude` guard — the same `satisfies` stamps each literal as a member of the union (catches typos/removals) but does not fail when the union gains a member not in the array.

Python set diff on the ingested literals confirms both size `51` and `identical? True`, `only in business: ∅`, `only in webhooks: ∅` today — so the finding is a latent drift risk, not a present content mismatch. Exhaustion matters because `clockify_setup_webhook` (`WEBHOOK_EVENTS`) and the low-level `clockify_webhooks_create` (`WEBHOOK_EVENT_TYPES` plus `WEBHOOK_TRIGGER_SOURCE_TYPES`) would then accept disjoint event sets.

Weakest hypothesis: `business.ts` acquired the guard when it was expanded from 12 → 51 to match `clockify_webhooks_create`; `webhooks.ts` was not refitted.

### M-07 Schema-Level URL Permissiveness (observed, no live side effect)

`mcp/src/tools/webhooks.ts:296` and `workflows/business.ts:381` use `z.url()` (Zod 4: any absolute URL) and defer `https` + SSRF to `assertSafeWebhookUrl(…)` (executed in the guarded preview before any Clockify `POST`). Direct validation:

- `z.url()` : `https://example.com/hook PASS`, `http://example.com/hook PASS`, `ftp://… PASS`, `https://10.0.0.1/hook PASS`.
- `validateWebhookUrl` (`wrapper/webhook-url.ts:28`): `http://… FAIL "webhook URL must use https (got http scheme)"`, `ftp://… FAIL`, `https://10.0.0.1/hook FAIL "private range (10.0.0.0/8)"`, `https://localhost/hook FAIL "loopback hostname"`.

No security gap — `create` preview enforces `https` before the write and invalid schemes surface as stable `invalid_request` with a literal host + scheme reason. The model-visible schema does over-advertise (a dry_run is required to learn `http` is invalid); tightening the Zod surface to a stricter check or documenting the HTTPS requirement at the tool description removes the UX surprise.

### M-08 Snippet Promise vs Envelope Reality (observed)

`mcp/src/tools/agent-docs.ts:32`:

```ts
mcp: "Call clockify_setup_webhook with dry_run: true and inspect URL safety warnings."
```

`mcp/src/result.ts:398-423` `defineGuardedTool` dry-run envelope is always `{preview, confirm_token, expires_at, preview_hash, risk_class}`. Invalid URLs do not produce a preview with warnings — `assertSafeWebhookUrl` throws inside the preview callback, caught by `invokeTool → errorResult`, so the envelope is `{ok:false, error:{code:"invalid_request", message:"webhook URL host … is not allowed: …"}}`. There is no `warnings` field on a dry-run success either. The correct guidance is "URL is validated during preview; invalid URLs error with a stable code before a token is issued".

### M-09 Empty-`id` ChangeSet Refs (observed — response shaping, documented as deliberate)

`mcp/src/tools/scheduling.ts:608-617`:

```ts
writeReceipt("updated", "scheduling_assignment", "")
// publish returns no id → {type:"scheduling_assignment", id:""} plus comment citing precedent
```

`mcp/src/tools/users.ts:388-390`:

```ts
writeReceipt("created", "workspace_member", { name: preview.email })
// addUser returns a workspace, not a member id → {type:"workspace_member", id:"", name:"bob@…"}
```

`result.ts:168-173` always materializes `{type, id}` (empty-string default for missing `id`), and `259-265` `hasChangeSet` keeps any non-empty array regardless of `id` value, so `changed.*[].id: ""` survives into the JSON output. The scheduling comment explicitly cites the workspace-member precedent.

Weakest hypothesis: the "always emit a `changed` bucket" contract made an empty `id` the chosen sentinel rather than omitting the bucket. The ledger marks this as deliberate (contract-consistent per comment) but notes downstream agents cannot chain on `changed.*[].id` when it is `""`. Viable tightenings are omitting the bucket when `id` is empty or keeping the bucket but adding a `warnings` entry pointing at `ids/workspaceId` instead — matching `result.ts:66-74` `printSuccess` predecessors.

### M-11 Holidays Color Unvalidated (observed)

`holidays.ts:128` `color: z.string().optional()` (create) and `:218` (update) vs `projects.ts` `PROJECT_COLOR_SCHEMA = z.string().regex(/^#[0-9A-Fa-f]{6}$/)`. Holidays `preview` forwards `args.color` verbatim (`:174`), and the update `if (color !== undefined) { if (typeof color !== "string") throw… body.color=color }` (`:325-331`) only type-checks. A value like `color:"not-a-hex"` or `color:"red"` reaches `holidays.create/update` and surfaces only as an opaque wire `400` instead of a local `invalid_request`. Reusing the project regex is the honest guard.

### M-12 `APPROVAL_PERIODS` Duplication (observed)

`approvals.ts:18-20` defines `APPROVAL_PERIODS = ["WEEKLY","SEMI_MONTHLY","MONTHLY"] as const satisfies ClockifyApi.ApprovalPeriod[]` and four tools bind `z.enum(APPROVAL_PERIODS)` (`approvals_list` filter omits it; `approvals_submit`, `submit_with_type`, `submit_for_user_with_type` use it). `approvals_resubmit:152` inlines `z.enum(["WEEKLY","SEMI_MONTHLY","MONTHLY"])` literally — same three values, no `satisfies` pin. A wire change to periods would be applied to four sites via one edit and silently miss the fifth.

---

## 04 Findings Validation — Full Ledger Disposition

Severity/confidence quoted from `13-FINDINGS-LEDGER.csv`; disposition after this pass's static re-read + executed probes.

### MCP findings

| ID | Severity / C | Claim | Disposition | Evidence on this pass |
|---|---|---|---|---|
| **M-01** | medium / high | `switchWork` dead "no timer was running" branch — `stopped.stopped` vs `data.stopped` | **Confirmed (live fake-ctx repro)** | `mcp/dist` repro: no-timer envelope `structuredContent` has no top-level `stopped`; bug message `the previous timer was stopped … boom` observed; fix `data.stopped===false` yields the expected note. Only the no-timer+start-fails path is wrong. |
| **M-02** | low / high | Bundle version link stale | **Confirmed** | `mcp/README.md:38-39` `0.8.0` vs package `1.0.1`; `git tag -l mcp*` latest `mcp-v1.0.0`; no `mcp-v1.0.1` artifact. |
| **M-03** | low / high | `docs/mcp-tools.json` holidays row lists 4 of 5 | **Confirmed** | `docs/mcp-tools.json` holidays `count:5 tools:"list/create/update/delete"` vs manifest 5 (adds `list_in_period`). `scripts/update-readme-tables.mjs` copies this row verbatim. |
| **M-04** | low / high | Demo seed/cleanup 2026 window orphan | Not live-probed (would require a mutating `demo_seed` with `date:2027-05-01`, intentionally skipped); **code-read holds**: `demo.ts:113` arbitrary `date`, `demo.ts:181-182` cleanup default `2026-01-01…2026-12-31`. No `GET`-only path tests the interaction. Status **stands as inferred from code**. |
| **M-05** | low / medium | Two 51-event registries, only one with an exhaustiveness guard | **Confirmed — sets identical today, guards differ**. `business.ts` `Exclude…extends never` guard present; `webhooks.ts` only `satisfies`, no `Exclude`. 52nd union member would widen the tools' surfaces silently on one side. |
| **M-06** | medium / high | 64/168 `tsMcp:null` with `overrideReason:null`; ~20 genuinely unexposed | Inventory-only claim (parity JSON sweep). No execution was run in this pass; the `renamed-tool coverage is unstamped` point and the `~20` list were audited by grep in the ledger and not re-executed here. **Stands per static evidence** (recheck flagged as unknown in `15-VERIFICATION-QUEUE.md:16`). |
| **M-07** | low / high | `z.url()` over-advertises; HTTPS enforced in preview | **Confirmed, zero security impact**. `z.url()` passes `http://`; `assertSafeWebhookUrl` rejects `http`/`ftp`/private IPs before any `POST`; invalid URLs error `invalid_request`. UX fix: tighten Zod `url` or document HTTPS requirement. |
| **M-08** | low / medium | `clockify_sdk_snippet` promises URL-safety warnings absent from dry-run envelope | **Confirmed**. `agent-docs.ts:32` `"inspect URL safety warnings"` vs `result.ts:398-406` dry-run envelope `{preview, confirm_token, …}` with no warnings field; invalid URLs surface as `ok:false` instead. |
| **M-09** | low / medium | `scheduling_publish` + `users_invite` emit `changed.*[].id:""` | **Confirmed — response shaping, not a crash**. `scheduling.ts:616` `writeReceipt(…,"")`, `users.ts:388` `writeReceipt(…,{name:email})`; `hasChangeSet` keeps the empty-id ref; output schema allows `""`. Code treats it as deliberate (precedent cited). Agents cannot chase an empty id — warn or omit instead. |
| **M-10** | low / medium | Rate tools skip `name→id` resolution | Code-read only — the resolver wiring was not re-exercised here. Ledger evidence (`AGENTS.md §10` governed resolver list excludes rate tools; `projects.ts`/`tasks.ts`/`users.ts` rate previews skip `resolveEntityRef`) is coherent. **Stands**. |
| **M-11** | low / high | Holidays `color: z.string()` unvalidated vs projects hex regex | **Confirmed** (source read). Holidays preview forwards `color` unchecked; update only `typeof color !== "string"`. Wire 400 is the only feedback for bad hex. |
| **M-12** | low / high | `approvals_resubmit` inlines period enum instead of `APPROVAL_PERIODS` | **Confirmed** (source read; `approvals.ts:152` inlined `["WEEKLY","SEMI_MONTHLY","MONTHLY"]`, constant defined at `:18` and used elsewhere). |
| **M-13** | low / high | `time_off_requests_get` 50-page silent `not_found` cap | Code-read; not live-probed (bulk fetch would require paging the live `holidays/timeOffRequests` search). **Stands**. |
| **M-14** | low / high | `tool-manifest.test.ts` omits `idempotentHint` | Code-read; the `readOnlyHint/destructiveHint/openWorldHint` assertion was verified by ledger grep. **Stands**. |
| **M-15** | low / medium | `errorCodeForMessage` substring mislabels status-less 5xx | Static — only reachable when SDK classifier + status map both miss. **Stands**. |
| **M-16** | low / medium | `entries_log` `{...entry, ...body}` override merges request over response | Code-read; demonstrated by field shadowing (`body.start` vs derived `start`). **Stands**. |

### CLI findings

| ID | Severity / C | Claim | Disposition | Evidence on this pass |
|---|---|---|---|---|
| **C-01** | medium / high | `mutation-leaves.test.ts` 30 vs `cli-write-safety-contract.json` 35 mutation leaves | Count/inventory claim, not live-probed in this pass. Ledger grep is coherent; this pass re-checked the write-safety classification via `collectClassifiedLeaves` and did not re-run `check-cli-write-safety.mjs`. **Stands per static evidence**. |
| **C-02** | low / high | `parseIntArg`/`parseFloatArg` accept trailing garbage | **Confirmed live, read-only** (see §02). `entries list --limit 1abc` → `exit 0`, 1 row; `--limit 2abc` → 2 rows; helpers `parseIntArg("1abc")==1` directly. Fix: full-string regex. |
| **C-03** | low / high | `--region` validated lazily, exit-code contrast `1` vs `2`, `completion` ignores it | **Confirmed live, read-only** (see §02). `--region bogus` → `exit 1` `invalid_request`; `--output xml` → `exit 2` `commander.invalidArgument`; `completion bash` with `--region bogus` → `exit 0`. `index.ts:72-78` `parseOutputMode` `InvalidArgumentError` is the precedent to mirror for `--region`/`--subdomain`. |
| **C-04** | medium / high | `cli/examples/daily-timesheet.sh` broken (`clk115 review`, `--date`) + no gate | Source read + `check-examples-matrix.mjs` survey in ledger; not re-executed here. **Stands**. |
| **C-05** | low / high | Webhooks `list --type` via untyped `requestOptions` seam despite typed `ListWebhooksRequest.type` | Source read (`cli/src/commands/webhooks.ts:169-172` vs `wrapper/src/api/resources/webhooks/client/requests/ListWebhooksRequest.ts:7-8`). **Stands** (cosmetic seam; typed path exists). |
| **C-06** | low / high | `sandbox.test.ts:469-472` audit-log shape assertion vacuously true | Source read (`json===null || Array.isArray(json) || typeof json==="object"` is true for every parsed JSON). **Stands**. |
| **C-07** | low / high | `cli/src/output.ts:66-74` `printSuccess` dead + README `ok:true/message` fiction | Source read (`grep printSuccess` definition-only in `cli/src`). **Stands**. |

No finding in the table was contradicted on this pass. "Stands" rows were left as the ledger described because this validator intentionally performed no mutating live writes and no full gate reruns — they would require the broader reproduction steps in `15-VERIFICATION-QUEUE.md` (live webhook campaigns, `perfect-fast`, `operation-parity` regeneration, etc.).

---

## 05 Unknowns and Limits — What This Pass Could Not Settle

In ASD-STE100 style: short sentences, one condition per step.

- **M-04 live orphan.** Seeds outside `2026` do orphan in code. No live `demo_seed` + `demo_cleanup` run was done (mutating). The `demo_seed` prefix alone makes cleanup reachable, so the defect is narrow (calendar-window bookkeeping), not data loss.
- **M-06 / M-10 / M-13 / M-14 / M-15 / M-16.** Each was checked against the current source tree and matches the ledger's grep walks. No execution was done to re-derive the full parity matrix or re-paginate a live search beyond the single `entries list` page used for the C-02 probe.
- **C-01 / C-04 / C-05 / C-06 / C-07.** Code-read only in this pass. C-04's `bash -n cli/examples/*.sh` and a `make check-cli-write-safety` console-count comparison are cheap next steps; they were intentionally left out of this live pass.
- **Webhook wire truth (M-06 adjunct / W-03).** The dual webhook-payload-model contradiction (`webhook-events.ts` flat union vs envelope `webhookEvent/payloadType/payload` fixtures) cannot be settled by `GET` alone — it needs a live create → trigger → raw-delivery capture (queue item 26). This pass did not create any webhooks.
- **Reporting / scheduling routes (C-02 scope).** Trailing-garbage semantics for `parseFloatArg`/`parseSignedFloatArg` (`--amount`, `--hours-per-day`, `--balance`) were proved on the helper directly (`parseFloat("1.5abc")==1.5`) but not against each CLI command's live path (each would hit a different write/write-preview endpoint). The helper is shared, so the fix is shared.
- **`mcp-v1.0.1` tag absence.** `git tag -l` in this clone shows no `mcp-v1.0.1` and no `cli-v1.0.1`; `mcp-v1.0.0` exists. Whether a remote `origin` holds a newer bundle is unchecked (`git ls-remote` is a network probe listed in `15-VERIFICATION-QUEUE.md:10` and was not run).

---

## 06 Receipts — How to Reproduce Every Observed Fact

All receipts are read-only and redacted (the sacrificial key never appears). `set +o history` or an env-file may be used before running the live commands so the key does not reach shell history.

**Environment used for this pass**

- `git rev-parse HEAD` `49462f5`, `Node 26.0.0`, `mcp/dist/index.js` present, `cli/dist/index.js` present, `wrapper/dist/esm/webhook-url.js` present.
- Packages `wrapper@1.0.1 / cli@1.0.1 / mcp@1.0.1` (`generated/version.ts` in each).

**M-01 repro (no network required — built artifact + fake ctx)**

```sh
node --input-type=module <<'JS'
import { switchWork } from './mcp/dist/tools/workflows/time-tracking.js';
const makeCtx = (opts) => ({ workspaceId:'ws-1', client:{
  users:{getCurrentUser: async()=>({id:'user-1'})},
  timeEntries:{
    create: opts.create ?? (async(b)=>({id:'te-1',...b})),
    listInProgress: async()=> opts.inProgress ? await opts.inProgress() : [],
    updateForUser: async(req)=>({id:'te-1', ...req}),
  }}});
const ctx = makeCtx({ inProgress: async()=>[], create: async()=>{throw new Error('boom')} });
try { await switchWork(ctx, {description:'next'});} catch(e){ console.log(e.message);} // expects 'the previous timer was stopped … boom' (bug)
JS
# After the fix, the same invocation prints 'no timer was running … boom'.
```

**C-02 repro (live, read-only GET; two calls distinguish 1 vs 1abc not by content length but by count)**

```sh
CLOCKIFY_API_KEY='…' CLOCKIFY_WORKSPACE_ID='65b382b606de527a7ee2b60e' \
  node cli/dist/index.js entries list --limit 1abc --output json 2>/tmp/e1 | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"
# → 1 (bug: should exit 2). Compare with:
CLOCKIFY_API_KEY='…' CLOCKIFY_WORKSPACE_ID='65b382b606de527a7ee2b60e' \
  node cli/dist/index.js entries list --limit 1 --output json 2>/tmp/e2 | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"
# → 1 (same). And --limit 2abc → 2 proves truncation, not clamping.
node --input-type=module <<'JS'
import { parseIntArg, parseFloatArg } from './cli/dist/commands/helpers.js';
console.log(parseIntArg('1abc'));     // 1  (no throw — bug)
console.log(parseFloatArg('1.5abc')); // 1.5 (no throw — bug)
JS
```

**C-03 repro (live, read-only; one call uses only `GET` posture for region validation, one is offline)**

```sh
CLOCKIFY_API_KEY='…' CLOCKIFY_WORKSPACE_ID='…' node cli/dist/index.js --region bogus status --output json; echo $?
# → 1, JSON body contains: Unrecognized Clockify region "bogus". Provide one of global, eu, …
node cli/dist/index.js status --output xml; echo $?
# → 2, stderr: error: option '--output <mode>' argument 'xml' is invalid. Provide one of: table, json, ndjson.
CLOCKIFY_API_KEY='…' CLOCKIFY_WORKSPACE_ID='…' node cli/dist/index.js --region bogus completion bash > /tmp/comp.bash; echo $?
# → 0, file is the completion script, region ignored.
```

**M-02 / M-03 static proof (offline)**

```sh
grep -n 'clockify115-mcp-.*\.mcpb' mcp/README.md
# → 38: clockify115-mcp-0.8.0.mcpb  (while mcp/package.json version is 1.0.1)
git tag -l "mcp*"
# → … mcp-v0.8.0 … mcp-v1.0.0  (no v1.0.1)
python3 -c "import json; d=json.load(open('docs/mcp-tools.json')); g=[x for x in d['domainGroups'] if x['resourceGroup']=='holidays'][0]; print(g)"
# → {'count':5, 'tools':'list/create/update/delete'}  vs  manifest 5 names incl. list_in_period
python3 -c "import json; m=json.load(open('docs/mcp-tool-manifest.json')); print([t['name'] for t in m['tools'] if 'holiday' in t['name']])"
# → ['clockify_holidays_create','clockify_holidays_delete','clockify_holidays_list','clockify_holidays_list_in_period','clockify_holidays_update']
```

**M-05 static proof (offline)**

```sh
python3 <<'PY'
import re
a=set(re.findall(r'"([^"]+)"', re.search(r'WEBHOOK_EVENTS = \[(.*?)\] as const', open('mcp/src/tools/workflows/business.ts').read(), re.S).group(1)))
b=set(re.findall(r'"([^"]+)"', re.search(r'WEBHOOK_EVENT_TYPES = \[(.*?)\] as const', open('mcp/src/tools/webhooks.ts').read(), re.S).group(1)))
print(len(a), len(b), a==b)                         # 51 51 True
print("_MissingWebhookEvent in business?", "_MissingWebhookEvent" in open('mcp/src/tools/workflows/business.ts').read())  # True
print("_MissingWebhookEvent in webhooks?", "_MissingWebhookEvent" in open('mcp/src/tools/webhooks.ts').read())          # False
PY
```

**M-07 / M-08 static proof**

```sh
node --input-type=module <<'JS'
import { z } from 'zod';
console.log(z.url().safeParse('http://example.com/hook').success); // true
JS
node --input-type=module <<'JS'
import { validateWebhookUrl } from './wrapper/dist/esm/webhook-url.js';
console.log(validateWebhookUrl('http://example.com/hook'));       // {ok:false, reason:"webhook URL must use https (got http scheme)"}
JS
grep -n 'inspect URL safety warnings' mcp/src/tools/agent-docs.ts
# → webhook.mcp: "Call clockify_setup_webhook with dry_run: true and inspect URL safety warnings."
grep -n 'preview.*confirm_token.*expires_at.*preview_hash.*risk_class' mcp/src/result.ts
# → the actual dry-run envelope; invalid URLs error instead
```

**Ancillary live reachability (read-only, no side effects)**

```sh
CLOCKIFY_API_KEY='…' CLOCKIFY_WORKSPACE_ID='…' node cli/dist/index.js doctor --output json   # → readiness: ready_for_status
CLOCKIFY_API_KEY='…' CLOCKIFY_WORKSPACE_ID='…' node cli/dist/index.js status --output json  # → 64621faec4d2cc53b91fce6c / 65b3…b60e / (no timer running)
CLOCKIFY_API_KEY='…' CLOCKIFY_WORKSPACE_ID='…' node cli/dist/index.js entries list --limit 1 --output json  # → 1 row (6a70cfeb24908413cb1d8e5b)
```

Evidence JSON accompanies this report at `/tmp/live-mcp-cli-evidence.json` (machine-diffable `assert` records for every executed live/built-artifact probe).

