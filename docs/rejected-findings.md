# Rejected findings

Findings that were investigated and **not** accepted, with the evidence that
settled them. This file exists so the same false positive is not re-raised by
the next audit, and so a reader can tell "nobody looked at this" from "somebody
looked at this and it was wrong".

## When to add an entry

Add one when a reported defect is closed **without** a code change, for any of
these reasons:

- **Refuted** — a probe or a source read shows the reported behavior is not the
  real behavior.
- **Not reproduced** — the report may have been true where it was observed, but
  it does not reproduce here, so it cannot be recorded as evidence.
- **Working as designed** — the behavior is real and intended, and the report
  mistook it for a defect.

Do **not** add an entry for a finding that was accepted and fixed. That belongs
in the changelog and, if it is about wire behavior, in
[`../spec/evidence/discrepancies.md`](../spec/evidence/discrepancies.md).

Each entry states: the claim as reported, who reported it, what was checked,
what the check showed, and the disposition. Keep the claim in the reporter's
terms — a rewritten claim is a claim nobody made, and the next auditor will not
recognize it as already settled.

---

## 2026-08-08 — consumer-report probe wave

Source: `addons-me/restoretime`, a blueprint-stage consumer of the published
2.0.0 SDK that live-probed Clockify and read the SDK source. Its accepted
findings became the `errors.body-code.is-numeric-not-string` fix and the
2026-08-08 wave in the evidence ledger. These four did not survive.

### `CustomFieldStatus` is missing an `"ACTIVE"` member — REFUTED

- **Claim:** the generated union
  `CustomFieldStatus = "INACTIVE" | "VISIBLE" | "INVISIBLE"` is incomplete, so
  the natural consumer check `status === "ACTIVE"` never matches and every
  custom field reads as gone. Rated high severity by the reporter.
- **Checked:** `GET /workspaces/{ws}/custom-fields?page-size=200` on the
  sacrificial workspace, 2026-08-08 — 35 fields.
- **Result:** the observed status set is exactly
  `{INACTIVE, INVISIBLE, VISIBLE}`. No field returned `"ACTIVE"`. The generated
  union matches the wire.
- **Disposition:** refuted as an SDK defect. The real hazard is that
  `"ACTIVE"` is a plausible-sounding value that does not exist, so a consumer
  can write a check that compiles against a widened type and silently matches
  nothing. That is a consumer trap, not a wrong union, and no spec change is
  warranted. `VISIBLE` is the value that means "in use".

### Windowed `listForUser` is eventually consistent — NOT REPRODUCED

- **Claim:** a freshly created time entry stays invisible to a `start`/`end`
  windowed `listForUser` for more than 45 seconds, while description-filtered
  and unfiltered lists show it immediately.
- **Checked:** created one entry, then polled all three filter shapes at
  roughly 0, 5, 15, 30 and 50 seconds, 2026-08-08.
- **Result:** the **windowed** query returned the entry at the first poll, at
  roughly 0 seconds, and at every poll after. The unfiltered query appeared to
  miss it, but that was sort order, not lag: the list is ordered by start time
  descending, the workspace holds entries dated 2027, and the probe entry sat
  at index 29 — outside the requested `page-size=5`. At `page-size=200` it was
  present immediately.
- **Disposition:** not reproduced. Recorded because the false conclusion is
  easy to reach: a small page size on a descending-ordered list looks exactly
  like replication lag.

### An archived tag on create returns 400 — NOT REPRODUCED

- **Claim:** passing an archived tag id when creating a time entry returns 400
  with `code: 501`, in contrast to an archived project, which returns 201.
- **Checked:** `POST .../user/{uid}/time-entries` with an archived tag id and
  an active project, 2026-08-08.
- **Result:** **201**. The entry was created and came back carrying the
  archived tag id in `tagIds`.
- **Disposition:** not reproduced. The archived-**project** half of the same
  report did reproduce and is recorded in the evidence ledger as
  `time-entries.create.archived-project-accepted`. The tag half may depend on a
  workspace setting that is not set here; it is not recorded as evidence
  because it did not reproduce. Re-probe before relying on either outcome.

### `mapAddonTokenRestriction`'s docstring over-warns — REFUTED

- **Claim:** the docstring names custom-field management and account-level
  `GET /workspaces` as walled off from add-on tokens, but probes showed
  `customFields.listForWorkspace` and `workspaces.get` both returning 200, so
  the docstring is steering consumers away from reachable routes.
- **Checked:** compared the two probes against the independent live probes in
  `addons-me/ai-assistant-addon`, which recorded the restricted set as
  "webhooks (ALL), custom-field CREATE, account-level `GET /workspaces`".
- **Result:** the two reports agree with each other and with the docstring. The
  reporter probed **different routes** than the docstring described: a
  custom-field **read** rather than custom-field management, and the
  workspace-scoped `workspaces.get` rather than the account-level
  `workspaces.list`.
- **Disposition:** refuted as a behavior claim. The wording was genuinely
  ambiguous, though — two readers took "custom-field management" and
  "account-level `GET /workspaces`" to mean different operations — so the
  docstring now names the exact operations and states that reads stay
  reachable. No behavior changed.

## 2026-08-08 — code-health gates proposed from a sibling repository

Source: `addons-me/ai-assistant-addon`, which runs `madge` and `jscpd` gates
this repository does not have. Both were measured here before being adopted,
because a threshold copied from another repository is a guess.

### Add a `madge --circular` gate — REJECTED

- **Claim:** assert zero circular dependencies, as the sibling repository does.
- **Checked:** `madge --circular` over `wrapper/index.ts`, 2026-08-08.
- **Result:** 228 cycles. All but a handful are the generated
  `src/api/index.ts → src/api/types/index.ts → <type>` barrel shape, which is
  how the generator emits every type; the rest are hand-written barrel
  re-exports such as `requests.ts → index.ts`.
- **Disposition:** rejected. Barrel re-export cycles are idiomatic TypeScript
  and are erased at build time. Landing this gate would require a 228-entry
  allowlist that regenerates whenever the spec does, which is more drift
  surface than the gate removes.

### Add a `jscpd` duplication gate — REJECTED

- **Claim:** cap copy-paste duplication, with the sibling repository's 1.5%
  limit.
- **Checked:** `jscpd --min-tokens 70 --min-lines 8` over `wrapper`,
  `cli/src`, and `mcp/src`, excluding generated output, 2026-08-08.
- **Result:** 2.48% across 42 clones — so the borrowed 1.5% limit would have
  been red on arrival. More decisive is *where* the clones are: 33 in
  `wrapper/docs` (generated API documentation), 8 in `wrapper/tests` (repeated
  fixture scaffolding), and 1 between `wrapper/tsconfig.esm.json` and
  `wrapper/tsconfig.cjs.json`, a pair that is meant to be nearly identical.
  Hand-written production source under `wrapper/*.ts`, `cli/src`, and
  `mcp/src` contributes **zero** clones.
- **Disposition:** rejected. There is no duplication problem in the code a
  duplication gate exists to protect. The gate would police generated
  documentation and test fixtures, and a no-regression threshold pinned at
  2.48% would encode that noise as a contract.

The third and fourth proposals from the same repository — `gitleaks`,
`actionlint`, and `dependency-review` — were accepted and are in the
`supply-chain` job of `.github/workflows/ci.yml`.

## 2026-08-08 — adversarial review of the discovery-mode wave

### `clockify_tools_search` is marked `readOnlyHint` while changing the tool list — ACCEPTED AS DESIGNED

- **Claim:** the tool is classified `read`, so `mcp/src/result.ts` derives
  `readOnlyHint: true`. Calling it enables previously-disabled tools, which is
  a server-state change. A client that auto-approves read-only tools would let
  a prompt-injected query widen the visible surface, delete tools included.
- **Checked:** what `readOnlyHint` governs, and what widening the surface can
  actually reach.
- **Result:** the hint describes effects on the tool's *environment* — the
  Clockify workspace — and the search touches no workspace data. Widening the
  advertised list grants no new authority: every loaded write tool keeps its
  own risk class, and the business, external-side-effect, privileged, and
  destructive classes still require a `dry_run` preview and a matching
  `confirm_token` before they mutate anything. The write-safety gate confirms
  the guarded and destructive totals are unchanged at 72 and 21.
- **Disposition:** accepted as designed, and recorded rather than left silent
  because the reasoning is not self-evident from the classification. The
  reachable worst case is a longer tool list, not an unguarded write. If
  `readOnlyHint` is ever tightened to mean "changes no server state at all",
  this tool needs a different class.

## 2026-08-08 — second sibling-repository pass

### `clockify_review_day` builds a UTC window, so it reports the wrong day — REFUTED

- **Claim:** raised by this session against itself. `dateRange` in
  `mcp/src/tools/workflows/resolve.ts` builds `[D T00:00Z, D+1 T00:00Z)`, while
  the Go MCP takes an explicit `timezone` argument and defaults to the
  configured zone. A UTC-midnight window therefore mis-attributes work logged
  near local midnight, and the TypeScript MCP should grow the same argument.
- **Checked:** a probe entry at `2026-08-07T22:15:00Z` — `2026-08-08T00:15`
  in the account's `Europe/Belgrade` — reviewed through both MCPs, then four
  raw windows against the core host and four against the reports host,
  2026-08-08.
- **Result:** the two MCPs returned identical totals, and both placed the entry
  in `2026-08-08`. The reason is recorded as
  `time-entries.list.window-evaluated-as-wall-clock-in-account-timezone`: the
  server re-reads the supplied bounds as wall clock in the account's timezone,
  so a UTC-midnight window arrives as the account's own local day. The UTC
  window is not a latent bug; it is what makes the tool correct.
- **Disposition:** refuted, and recorded because the obvious "fix" is harmful.
  Adding a `timezone` argument here could only be honoured by pre-shifting the
  bounds to cancel a shift the server then re-applies — client-side
  compensation depending on a fetched, DST-sensitive offset, which would break
  the behaviour it claims to fix. The core host exposes no `timeZone`
  parameter; only the reports host does.
- **What did survive:** the *default day*. An omitted `date` resolves to the
  UTC calendar day, which is not the account's day near local midnight outside
  UTC. That is a real, narrow limitation and is now stated in the tool
  description rather than compensated for in code.

### The two MCPs classify the same failing input differently — NOT REPRODUCED

- **Claim:** the Go MCP carries `Code any` while the TypeScript SDK only just
  learned to read Clockify's numeric error codes, so the pair were expected to
  disagree on error classification.
- **Checked:** `entries_get` on both servers with a deleted-but-well-formed id
  and with the plainly invalid `ZZ-CANARY-SECRET-abc123`, 2026-08-08.
- **Result:** both returned `error.code: "not_found"` for both inputs, from the
  same underlying `400 {"message":"Time entry doesn't belong to Workspace",
  "code":501}`. The classification agrees.
- **Disposition:** not reproduced. Two presentational differences remain and
  are deliberate, not defects: the Go message is a written sentence while the
  TypeScript one embeds the raw response body (already recorded as
  `errors.message-embeds-response-body`), and this repository returns the
  failure with `isError: true` where the Go server returns a normal result
  carrying `ok: false`.

---

## 2026-08-09 — external audit (Kimi K3), plan `docs/agent-plans/2026-08-09-external-audit.md`

The audit read the `9248da7` tree without running it and without a workspace.
Four of its five findings reproduced and were fixed. What follows is the part
that did not survive, plus a saturated mutant set that should not be re-derived.

### Resolve `itemType` against the workspace's existing invoice item types — DEFERRED, NO SUCH ROUTE

- **Claim:** `clockify_invoices_items_add` should "resolve the supplied type
  against the workspace's existing invoice item-type records before building the
  preview" (finding F3), because the API rejects an unknown name.
- **The rejection is real and was re-probed** live on the sacrificial workspace,
  2026-08-09: `itemType` of `Service`, `SERVICE`, `TRANSLATION` (the workspace's
  own `itemType` *label*) and a raw `itemTypeId` each returned
  `404 {"message":"Invoice item type with name X not found.","code":501}`.
  `NEW DEFAULT`, a name read off an existing invoice, succeeded.
- **The prescribed resolver has nothing to resolve against.** Probed the same
  day: `GET /workspaces/{id}/invoices/item-types` and `.../invoices/itemTypes`
  both `400 {"message":"Invoice doesn't belong to Workspace","code":501}` — the
  path segment is parsed as an invoice id, so no such collection exists;
  `GET /workspaces/{id}/invoice-item-types` is `404` code `3000` (no such
  route). `GET /workspaces/{id}/invoices/settings` returns only labels and
  opaque ids (`itemTypeId`, `defaultImportTimeItemTypeId`) — no names. Item
  types are created in the Clockify UI and the corrected spec carries no
  operation that lists them.
- **Rejected alternative:** harvesting `itemType` strings off existing invoices.
  That finds only types already used, so it would reject a legitimately unused
  type — a resolver that is wrong in the direction that silently blocks a valid
  write.
- **Disposition:** the resolver is deferred for want of an API route, not for
  cost. The shippable half landed: the schema now says the value must name an
  existing workspace item type, says where the names come from, and lets the
  API's own 404 (which quotes the rejected name) reach the caller. Revisit only
  if Clockify publishes a list route.

### The remaining `wrapper/errors.ts` mutants are equivalent — SATURATED

Classified against the run-31280149737 report (score 93.25, floor 93). Of 27
survivors, 26 cannot be killed by any input and one was:

- **14 × `Error.captureStackTrace` guard** (both the forced-`true` and
  forced-`false` variants at each of 7 subclass constructors). V8 already hides
  Error-subclass constructor frames from `.stack`, so neither variant changes an
  observable. See `clockify-capturestacktrace-mutants-v8-equivalent`.
- **4 × `generatedErrorOptions` conditional spreads** forced `true`
  (`statusCode`, `body`, `rawResponse`, `cause`). `ClockifyApiError`'s
  constructor destructures and assigns each field unconditionally, so
  `{statusCode: undefined}` present and absent produce the same instance.
  `cause` is additionally guarded by `if (cause != null)` in the base.
- **7 × header-parser and normalizer guards** forced past their null/finite
  checks (`parseRetryAfterMs` lines 528/536/538, `parseRateLimitResetAt` 549,
  `errorCodeForSdkStatus` 441, `getErrorCode` 608, `normalizeBodyCode` 634).
  Each mutant lets a `null`/`NaN` value fall into arithmetic or a property read
  that yields exactly the value the guard returned: `parseInt(null)` is `NaN`,
  `NaN * 1000 - Date.now() > 0` is `false`, `Number.isFinite` rejects every
  non-number, and `CLOCKIFY_ERROR_CODES.find(...includes(undefined))` misses.
- **Killed:** the `isAbortCause` null guard (`if (cause == null) return false`).
  `typeof null === "object"`, so the mutant reaches a property read on `null`
  and throws inside the classifier. `cause` is a public `unknown` field, so a JS
  caller can hand back `cause: null`; `wrapper/tests/errors.test.ts` now pins it.
- **Removed rather than killed:** the second operand of the `connection_error`
  arm in `stableCodeForClockifyError` was unreachable. That function is only
  called on the output of `promoteApiError`, which has already converted every
  statusCode-less error carrying a cause into `ClockifyConnectionError`. The
  abort arm's cause check is *not* dead — a pre-promoted
  `ClockifyConnectionError` passes promotion untouched, so an abort-shaped cause
  inside one is recognized only there.
- **Disposition:** the module is saturated. Do not add tests aimed at the
  equivalence classes above, and do not ratchet the floor to the measured score.

## 2026-08-09 — audit-remediation implementation wave (waves C–F)

Findings from the validated implementation plan
(`~/Downloads/clockify-ts-sdk-implementation-plan.md`) that were checked while
being fixed and did not reproduce as stated.

### TST-1 — `wrapper/internal/**` is outside the coverage denominator — NOT REPRODUCED

- **Claim:** `wrapper/vitest.config.ts` uses the non-recursive coverage include
  `["*.ts"]`, so the auth-boundary and routing modules under
  `wrapper/internal/` never enter the denominator and a regression there moves
  no number.
- **Checked:** ran `npm run test:coverage -w clockify-sdk-ts-115` twice on
  2026-08-09 — once with the committed `include: ["*.ts"]` and once with
  `internal/**/*.ts` added — and diffed `coverage/coverage-summary.json`.
- **Result:** identical in both runs. All four `wrapper/internal/*.ts` files
  appear in the per-file summary either way, and the totals do not move
  (lines 98.48, functions 97.52, branches 93.67, statements 97.21; 36 files).
  Under the Vitest 4 v8 provider, files loaded by the test run are measured
  even when the `coverage.include` glob does not match them, so the modules
  were already inside the denominator and the pinned floors.
- **Disposition:** not reproduced as a measurement gap. The include pattern was
  still misleading — it *reads* as if `internal/**` were excluded — so
  `internal/**/*.ts` was added as a clarification with no floor change. The
  before/after numbers above are the recorded proof that nothing moved.
