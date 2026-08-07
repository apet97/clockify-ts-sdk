# 09 — TYPE-SAFETY AUDIT

Mechanical greps (orchestrator, 2026-08-06):

| Pattern | wrapper | cli | mcp |
|---|---|---|---|
| `as any` | 1 (comment false positive: "any of the specified roles" in `ListWorkspacesRequest.ts:4`) | 0 | 0 |
| `as unknown` | 98 (94 in generated `src/`; 4 hand-written) | 2 (both in template strings: "has unknown … status") | 16 |
| `@ts-expect-error` / `@ts-ignore` | 0 | 0 | 0 |
| `eslint-disable` | 6 (3 in `composed-fetch.test.ts`, 2 in `bulk.test.ts`, 1 in `composed-fetch.ts`) | 0 | 0 |
| `: any` / `<any` annotations | 4 (generated surface) | 0 | 0 |

Conclusion (observed): the consumer surfaces (cli/mcp) contain no `any`
annotations and no suppressed errors. The repo's zero-cast budget gate
(`make consumer-cast-budget`, contract in
`docs/consumer-cast-budget-contract.json`) enforces this with symbol
provenance + bounded dataflow; both canonical exception arrays are empty.
The residual unsafe-typing surface is concentrated in the SDK package and in
narrowing patterns that are documented but unsound by design.

## Candidate findings

### 1. Status-based type guards narrow to subclass types unsoundly (W-06)
- `wrapper/errors.ts:471-494`: `isRateLimitError` returns
  `err is RateLimitError` for ANY `ClockifyApiError` with `statusCode ===
  429` (also 409/500/503 for the sibling guards). After narrowing,
  `err.retryAfterMs` is `undefined` for base errors — the field the guard
  exists to expose. Documented in JSDoc; the axioms test
  (`axioms-checklist.test.ts:34-41`) exercises only the constructed-subclass
  direction, so the unsound direction is untested.
- Options: narrow to a structural type with optional `retryAfterMs`, or
  split `instanceof`-based promotion from status predicates.

### 2. Silent fallback on unknown error codes (W-07)
- `wrapper/error-codes.ts:276`: `?? CLOCKIFY_ERROR_CODES[0]` — an unknown
  code string yields the `invalid_request` row with wrong recovery/retryable
  advice and no error. Typed callers cannot hit it; plain-JS callers can.

### 3. Untyped query seam in CLI (C-5)
- `cli/src/commands/webhooks.ts:169-172` passes `type` via
  `requestOptions({ queryParams: { type } })` — an escape hatch the
  generated request type already covers (`ListWebhooksRequest.type`).
  Cosmetic on the wire, but it is exactly the seam class the
  consumer-cast-budget discipline exists to eliminate.

### 4. Substring-based error classification (M-15)
- `mcp/src/error-codes.ts` `errorCodeForMessage`: message token matching can
  mislabel status-less transport errors as `invalid_request` when the body
  text contains "invalid"/"missing". Only reachable when SDK classification
  and status mapping both miss; residual false-positive class.

### 5. Envelope-field reads typed via inline casts (M-01 root cause)
- `mcp/src/tools/workflows/time-tracking.ts:168` casts the envelope to
  `{ stopped?: boolean }` — a shape that matches neither the envelope
  (`{ok, action, data, …}`) nor the payload (`{stopped, reason}`). The
  compiler cannot catch this because the cast is asserted. The same
  "narrow via unchecked cast" pattern appears in several other tools
  (`webhooks.ts:27,33,193`, `customFields.ts:132,207,335`,
  `holidays.ts:61,100`, `doctor.ts:111`, `invoices/payments.ts:33`,
  `users.ts:65`, `expenses.ts:434`, `result.ts:153,243`,
  `confirmation.ts:134`). Most are list-response widening to `unknown[]`
  before validation (benign); a few are envelope/property casts that can
  silently read the wrong slot (M-01 is the proven instance).

### 6. Hand-written `as unknown` in the SDK (observed, low risk)
- `wrapper/otel-hooks.ts:22` (doc example), `paginated-list.ts:118`
  (fetcher adaptation), `scoped-client.ts:319` (dynamic property access on
  `Record<string, unknown>`). All three are localized adapter seams with
  focused tests; no finding beyond noting their existence.

### 7. Generated-code type surface (observed, no finding)
- `wrapper/src/core/runtime/index.ts` and `core/index.ts:17` read
  `process.versions.node` with no guard (W-04 — runtime type-unsafety for
  non-Node hosts, not a TS-level issue).
- The generated `any`-annotated surface is 4 symbols total; all inside
  `wrapper/src` (generated), none re-exported through the governed root
  barrel in a way the cast budget misses (dual-build smoke pins the names).

## Duplicated domain models (observed)

- Webhook payload models conflict (W-03): flat `event`-discriminated union
  (`webhook-events.ts:589`) vs envelope fixtures with no `event` field.
  Two models of the same wire event, both typed, neither cross-asserted.
- `ClockifyWebhookApprovalOwner` (object) vs fixture `ownerId` (string) —
  same family.
- CLI/MCP maintain their own small enums mirrored from generated unions:
  `WEBHOOK_LIST_TYPES` (cli), `WEBHOOK_EVENT_TYPES` + `APPROVAL_PERIODS`
  (mcp); the MCP webhook registries duplicate each other (M-05) and one
  approval enum is inlined a second time (M-12).

## Widening / unchecked indexed access / incomplete unions (observed)

- `mcp/src/result.ts:153,243`: `envelope as unknown as JsonRecord` — bounded
  to a tested shape; `envelopeSchema` output-schema tests cover it.
- `mcp/src/orchestration/confirmation.ts:134`: `JSON.parse(...) as unknown`
  after `requireCanonicalJson` — validated by the canonical-JSON check first.
- Incomplete-union risk: `WebhookEventType` has 51 members; the MCP
  `webhooks.ts` registry uses `as const satisfies` (not exhaustive) while
  `business.ts` uses an `Exclude`-based exhaustiveness guard (M-05).
- `TimeEntriesTimeEntry.userId` optional (generated); MCP `clockify_status`
  trusts its presence for running-timer detection (MCP unknown 3) — runtime
  data trusted without validation on a typed-optional field.

## Boundary parsing (observed)

- CLI numeric flags parse with `Number.parseInt`/`parseFloat` (C-2:
  trailing-garbage acceptance); MCP arg coercion uses `zNumberLike`
  (`mcp/src/arg-shapes.ts`) — not audited for the same class (slice B read
  it; no finding recorded).
- `resolve.ts` id-passthrough: `/^[0-9a-f]{24}$/i` treated as id — a
  24-hex name is indistinguishable from an id by design (documented).
