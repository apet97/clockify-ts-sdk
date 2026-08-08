# External audit — 2026-08-09

## Triage outcome — 2026-08-09

Every finding was checked against `docs/rejected-findings.md` and
`spec/evidence/discrepancies.md`, then reproduced (F1/F2/F3 live on the
sacrificial workspace, F4/F5 by execution) before any line changed. Four
findings were real and are fixed; one is half-fixed and half-deferred because
the API offers no route for the prescribed remedy.

| Finding | Verdict |
|---|---|
| F1 — item `unitPrice` sent at the wrong scale | **FIXED** — live-confirmed 100x undercharge |
| F2 — payment receipt names the invoice id | **FIXED** — live-confirmed; list-diff recovery added |
| F3 — `itemType` treated as free text | **PARTLY FIXED / DEFERRED-WITH-REASON** — see below |
| F4 — `tag_ids: []` cannot clear tags | **FIXED** |
| F5 — replay-fixture tripwire is false-green | **FIXED**, and the real cause was different |

Live probes, sacrificial workspace `65b382b6…`, 2026-08-09 (all residue
deleted — one invoice, two items, one payment):

- item `quantity:1, unitPrice:100000` billed `amount:1000`; `unitPrice:10000000`
  billed `amount:100000`. F1's 100x undercharge is real on the wire.
- `POST /invoices/{id}/payments` answered `201` with the invoice document whose
  `id` equalled the invoice's, while the payments list gained `6a77b1de…`. F2 is
  real.
- `itemType` of `Service`, `SERVICE`, `TRANSLATION` and a raw `itemTypeId` each
  `404`ed; `NEW DEFAULT` succeeded. F3's failure is real.

**F5's stated cause was only half right, and the other half mattered more.** The
case-sensitivity gap (`payments.create` never matching `invoicePayments.create`)
is real. But `items.ts` *did* match the trigger `invoiceItems.create`, and the
gate passed anyway: `source.includes("invoiceItemUnitPriceToWire")` was
satisfied by the words "Use invoiceItemUnitPriceToWire" in the tool's own
description, while the code sent an unscaled price. A prose mention greened the
guard. The replacement requires the identifier in **call position** and was
proven red against the unfixed `9248da7` tools *before* the F1 fix landed, so the
mechanism was verified rather than assumed. It now carries a second rule
requiring a payment-create site to call `recoverCreatedPaymentId`.

**F3 — what shipped and what did not.** The rejection is live-proven, so the
schema now states that `itemType` must name an existing workspace item type,
says where to read the names, and lets the API's own 404 (which quotes the
rejected name) reach the caller. The prescribed resolver is deferred: no route
lists invoice item types. `…/invoices/item-types` and `…/invoices/itemTypes`
`400` with "Invoice doesn't belong to Workspace" (the segment parses as an
invoice id), `…/invoice-item-types` `404`s code 3000, and `…/invoices/settings`
carries labels and opaque ids only. Harvesting names off existing invoices was
rejected: it would reject a legitimately unused type. Recorded in
`docs/rejected-findings.md` under `invoice-item-type-resolver`.

Two of the audit's prescriptions were also corrected in implementation:

- F2's list-diff had to page through **both** reads. A page-1-only diff would
  miss the new id on an invoice with more payments than a page holds, and then
  report a successful write as inconclusive — worse than the original bug.
- F4 needed two edits, not one. Computing `nextTagIds` correctly is not enough,
  because the body spread `...(nextTagIds.length ? {tagIds} : {})` drops an empty
  array regardless. Suppliedness is now tracked and the spread is unconditional
  when `tag_ids` was given.

Nothing was spec-shaped, so no re-snapshot, live-evidence campaign, or human
approval receipt was required.

## Summary

Four actionable findings remain in the `origin/main` tree audited at `9248da7`.
Two are billing-write defects in the new invoice item/payment tools. One is an
MCP update semantics defect. One is a false-green replay-fixture tripwire.
The most important finding is that invoice item prices are sent at the wrong
wire scale, which can undercharge by 100x. Confirmation tokens, argument
coercion, scope filters, the main client/task/holiday/policy replacement paths,
and the wrapper security boundaries examined were clean.

## Findings

### F1 — Invoice item add sends minor units instead of the required minor×100 wire value — BUG — HIGH — **FIXED**

- **Where:** `mcp/src/tools/invoices/items.ts:56-74`
- **What happens:** An agent supplies `unitPrice: 100000` for a 1,000.00
  workspace-currency item. The preview sends `body.unitPrice: 100000` even
  though the wire value must be `10000000`; Clockify computes the resulting
  amount as `unitPrice * quantity / 100`, so the item can be billed as 10.00.
  The tool description tells the caller to use
  `invoiceItemUnitPriceToWire`, but the implementation never calls it.
- **Why it is wrong:** The live evidence ledger states that invoice-item
  `unitPrice` is minor×100 and that sending plain minor units billed a 1,000.00
  item as 10.00 (`spec/evidence/discrepancies.md:2353-2368`). The SDK helper
  exists specifically for this boundary in `wrapper/money.ts:101-113`.
- **Evidence:** The current body assignment is direct at
  `mcp/src/tools/invoices/items.ts:67-73`. The current test asserts the same
  incorrect direct value at `mcp/tests/backlog-tools.test.ts:88-110`, so the
  test seam cannot detect the defect.
- **Fix:** Import `invoiceItemUnitPriceToWire` from the SDK money subpath and
  assign `unitPrice: invoiceItemUnitPriceToWire(args.unitPrice)` in the
  preview. Keep the user-facing input in minor units. Update the description
  so it states that the conversion is performed by the tool. Add a boundary
  test with a non-trivial value such as `15000 -> 1500000` and retain the
  existing safe-integer checks from the helper.
- **Blast radius:** Update `mcp/tests/backlog-tools.test.ts` and any invoice
  tool fixtures. Run the MCP type-check, lint, test, build, and pack gates.
  `make replay-fixtures` must pass after the fix. Update `mcp/CHANGELOG.md`,
  `mcp/README.md` if its generated tool description changes, and the stale
  invoice ledger entry, which currently says no item-add tool exists at
  `spec/evidence/discrepancies.md:2374-2399`. Dispatch the GitHub-only
  Mutation workflow after the substantive fix; do not run Stryker locally.
- **Confidence:** high. The scale is already live-proven and the wrong value
  is visible in the current request builder. No new live probe is needed to
  establish this finding.

### F2 — Invoice payment create reports the invoice as a created payment and uses the invoice ID as the payment ID — BUG — HIGH — **FIXED**

- **Where:** `mcp/src/tools/invoices/payments.ts:77-91`
- **What happens:** `clockify_invoices_payments_create` sends the payment POST
  and returns its response as `data`, then emits
  `writeReceipt("created", "invoice_payment", request.invoiceId)`. The API
  response is the updated invoice, not the created payment, and the receipt's
  `changed.created[0].id` is therefore the invoice ID rather than the new
  payment ID. A caller following the receipt can try to delete or reconcile
  the wrong record.
- **Why it is wrong:** The live ledger records that the payment POST returns
  an updated invoice and that the new payment ID must be recovered by listing
  payments before and after the POST (`spec/evidence/discrepancies.md:2357-2359`
  and `:2401-2405`). The receipt contract requires the changed entity ID to
  identify the entity that changed.
- **Evidence:** The current implementation stores the POST result in
  `created` at line 78, passes it through unchanged at line 81, and uses
  `request.invoiceId` as the invoice-payment reference at line 83. The current
  test only checks the request body and never supplies or asserts payment-list
  snapshots (`mcp/tests/backlog-tools.test.ts:117-139`).
- **Fix:** In the guarded execution path, list the invoice payments immediately
  before the POST, execute the POST, then list them again. Diff payment IDs and
  use the single new ID for `writeReceipt("created", "invoice_payment", id)`.
  Return the updated invoice together with the recovered payment reference, or
  return a structured warning when the diff is zero or ambiguous; never claim
  the invoice ID is the payment ID. Keep the exact stored confirmation preview
  unchanged: the before/after reads are execution-time observation, not a new
  name or ID resolution.
- **Blast radius:** Extend the invoice payment mock context in
  `mcp/tests/backlog-tools.test.ts` with `list`, and cover one new payment,
  zero-diff, and ambiguous-diff outcomes. Update `mcp/README.md`, the payment
  tool receipt example, `mcp/CHANGELOG.md`, and the ledger entry. Run MCP
  type-check, lint, tests, build, pack, and the write-safety tests. Run the
  GitHub-only Mutation workflow after the wave.
- **Confidence:** high. The response shape and required list-diff behavior are
  already recorded live in the repository evidence ledger.

### F3 — Invoice item add treats `itemType` as arbitrary free text instead of resolving an existing workspace item type — BUG — MEDIUM — **PARTLY FIXED; RESOLVER DEFERRED-WITH-REASON**

- **Where:** `mcp/src/tools/invoices/items.ts:54` and `:70`
- **What happens:** An agent supplies a plausible value such as `Service` or
  `SERVICE`. The schema accepts it as free text and the preview sends it
  unchanged. Clockify rejects a name that is not an existing workspace
  invoice item type with a 404, so the tool presents a write surface that
  fails for values it claims to accept.
- **Why it is wrong:** The ledger records that `AddInvoiceItemRequest.itemType`
  must name an existing workspace item type and that `itemType: "Service"`
  returned “Invoice item type with name Service not found”
  (`spec/evidence/discrepancies.md:2360-2363`). The current description says
  “Free-text line-item type” and the code forwards the raw string.
- **Evidence:** The current input schema and request assignment are at the
  cited lines. The current test uses `SERVICE` without any resolver or
  existing-item-type fixture (`mcp/tests/backlog-tools.test.ts:88-110`), so it
  proves only that the local mock accepts the wrong contract.
- **Fix:** Resolve the supplied type against the workspace's existing invoice
  item-type records before building the preview. Stop with a grounded
  clarification or structured not-found error when the name is missing or
  ambiguous. If the canonical lookup operation is absent from this repository's
  generated client, start the contract change in `../GOCLMCP/` and regenerate;
  do not edit generated output. Send the resolved wire value, and update the
  schema description to say “existing workspace item type,” not “free text.”
- **Blast radius:** Add resolver success, missing, and ambiguous tests to the
  invoice MCP tests; update the test context to expose the lookup. Refresh the
  tool description/readme and ledger entry. Run the MCP package gates and the
  operation/parity and generated-surface gates if an upstream operation is
  needed. A new MCP tool is not required, so no tool-count cascade should move.
- **Confidence:** high for the current failure; medium for the exact lookup
  route until its generated operation is confirmed. The wire rejection itself
  is live-proven in the ledger.

### F4 — `clockify_fix_entry` cannot clear all tags with the accepted empty-list input — BUG — MEDIUM — **FIXED**

- **Where:** `mcp/src/tools/workflows/time-tracking.ts:221-242`; input shape at
  `mcp/src/tools/workflows/index.ts:277-281`
- **What happens:** A caller supplies `tag_ids: []` to remove every tag from an
  entry. The schema accepts the empty array. `fixEntry` builds an empty local
  list, then `nextTagIds` falls back to the entry's existing `tagIds`, so the
  PUT sends the old tags instead of `tagIds: []`. The requested clear becomes a
  silent no-op.
- **Why it is wrong:** The workflow is a PUT-replace path and its own comment
  says omitted fields are wiped. An explicitly supplied empty array is distinct
  from an omitted field and is the normal representation of “keep no tags.”
  The lower-level `clockify_entries_update` already accepts `tagIds: []` and
  sends it, so the workflow and domain surfaces disagree.
- **Evidence:** `zStringList(z.array(z.string()))` accepts an empty array at
  `mcp/src/tools/workflows/index.ts:278`. The fallback from the empty request
  to existing tags is explicit at `time-tracking.ts:221-242`. This is local
  request-building behavior; it does not require a new live probe.
- **Fix:** Preserve whether `args.tag_ids` was supplied. When supplied, use its
  normalized array even when it is empty; when omitted, carry the existing tags.
  Define and test the interaction with the separate `tag` name argument, for
  example by treating `tag` as an additional resolved tag only when supplied.
  Ensure the body includes `tagIds: []` for the clear case.
- **Blast radius:** Add a focused workflow unit test that seeds an entry with
  tags and asserts the captured PUT body for `tag_ids: []`; add the mixed
  `tag_ids` plus `tag` case. Run MCP type-check, lint, tests, build, pack,
  workflow receipt tests, and the GitHub-only Mutation workflow. Update the
  MCP changelog if the user-visible clearing behavior is documented.
- **Confidence:** high. The incorrect fallback is deterministic and visible
  without network access.

### F5 — The replay-fixture source tripwire does not match the current payment-create spelling — IMPROVEMENT — MEDIUM — **FIXED (cause partly misdiagnosed)**

- **Where:** `scripts/check-replay-fixtures.mjs:172-185`
- **What happens:** The tripwire searches case-sensitively for the literal
  `payments.create`, but the current client call is
  `invoicePayments.create` at `mcp/src/tools/invoices/payments.ts:78`. A future
  payment-create implementation can remove the required before/after payment
  list-diff behavior and still pass this source scan. The scan also couples
  payment creation to the invoice-item price converter, although payment
  `amount` uses plain minor units.
- **Why it is wrong:** The ledger requires two different invariants: invoice
  item `unitPrice` must use `invoiceItemUnitPriceToWire`, while payment creation
  must list-diff around the POST to recover the new payment ID
  (`spec/evidence/discrepancies.md:2382-2389`). The current trigger list and
  one required source token cannot enforce both.
- **Evidence:** The trigger is `"payments.create"` at line 174 and the match is
  a case-sensitive `RegExp` at line 177. The current spelling is
  `invoicePayments.create`, so it is not matched. The current payment tool's
  incorrect receipt path is shown at `mcp/src/tools/invoices/payments.ts:77-91`.
- **Fix:** Replace the single broad tripwire with explicit, behavior-oriented
  checks: require `invoiceItemUnitPriceToWire` in invoice-item add builders,
  and require a payment-create implementation to perform a before/POST/after
  list diff and emit the recovered payment ID. Prefer a small test fixture or
  AST/source contract that fails for the current bad payment implementation,
  rather than a case-insensitive token check that would only prove a word is
  present. Update `docs/replay-fixtures-contract.json` and the gate tests with
  the new invariant.
- **Blast radius:** `scripts/check-replay-fixtures.mjs`, its test/contract,
  `mcp/tests/backlog-tools.test.ts`, and the invoice ledger. Run
  `make replay-fixtures`, `make contract-gates`, and the MCP package gates.
  Do not run local mutation testing.
- **Confidence:** high that the current trigger misses `invoicePayments.create`;
  medium on the final gate design because the implementation should be chosen
  together with the payment receipt fix in F2.

## Examined and clean

- `mcp/src/orchestration/confirmation.ts`: token scope includes tool,
  workspace, risk, and canonical business arguments; previews are cloned,
  integrity-checked, single-use, and expiry-pruned.
- `mcp/src/arg-shapes.ts` and `mcp/src/scope-filter.ts`: string-list and numeric
  coercion preserves empty-string rejection, and the policy/holiday status
  split is explicit.
- Existing client, task, project, holiday, time-off-policy, invoice, and entry
  replacement builders: the known GET-then-replace protections were present;
  the known client `ccEmails`, project `billable`/`public`, holiday scope, and
  invoice tax/address issues were not re-raised.
- Wrapper retry safety, redirect handling, pagination termination, routing
  allowlists, webhook URL checks, money helpers, and error-body
  classification: no additional high-confidence defect was promoted from the
  static review.
- CLI configuration precedence, output selection, duration parsing, name-to-ID
  resolution, and the inspected update commands: no additional high-confidence
  defect was promoted.

## Not examined

- No live probes or credentialed tests were run.
- Generated `output/ts-sdk/**`, `wrapper/src/**`, and the full corrected OpenAPI
  snapshot were not used for defect hunting.
- The full `scripts/lib/**` gate set was not completed; only the replay-fixture
  gate relevant to the invoice findings was traced.
- Project `hourlyRate`/`costRate` omission semantics and tag PUT omission
  semantics remain live-proof questions in the ledger and are not reported as
  confirmed defects here.
- The complete CLI/MCP surface, all wrapper modules, and all workflow edge cases
  were not exhaustively reviewed within this audit budget.
