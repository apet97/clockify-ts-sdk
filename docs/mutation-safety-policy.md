# Mutation and Idempotency Safety Policy

Clockify writes are useful only when users and agents can tell whether a call is
safe to retry, whether it changed state, and how to recover after a partial or
ambiguous failure. This policy connects the SDK retry layer, CLI write behavior,
MCP confirmation flow, receipts, live proof, and support runbooks.

## Mutation classes

| Class | Examples | Default retry rule | Required receipt |
|---|---|---|---|
| Read-only | list, get, status, health, reports | Retryable with backoff when the transport says it is safe. | Include status, request ID when available, and pagination/rate-limit hints. |
| Idempotent update | PUT-style full updates, archive toggles, deterministic replacement by ID | Retry only when the caller accepts duplicate-safe semantics. | Include target ID, changed fields, warnings, and recovery. |
| Non-idempotent create | time entries, invoices, expenses, webhooks, scheduling assignments | Do not auto-retry by default. Caller or workflow must de-duplicate by returned IDs or a prior lookup. | Include created IDs, changed receipt, next cleanup/review action, and recovery. |
| Destructive delete/remove | tag delete, task delete, webhook delete, cleanup flows | Do not infer targets from names; require explicit ID or preview-confirm flow. | Include deleted/removed IDs and what was not found. |
| External side effect | webhook delivery setup, billing/invoice actions, demo seed/cleanup | Prefer dry run plus confirmation token. | Include confirm token preview, risk class, changed records, warnings, and recovery. |

## SDK rules

- `composedFetch` is single-shot by default; wrapper-side retries happen only when a caller passes `retryPolicy`.
- The default wrapper retry methods are `GET`, `HEAD`, `OPTIONS`, `PUT`, and `DELETE`; POST and PATCH are excluded by default because Clockify does not provide universal idempotency keys.
- SDK retry hooks must expose attempt, request ID, delay, and cause so operators can correlate ambiguous failures.
- SDK callers performing creates should use explicit preflight lookups or application-level idempotency keys outside this SDK when duplicate prevention is business-critical.

## CLI rules

- CLI writes stay non-interactive and scriptable.
- Destructive commands require explicit IDs; no delete/remove command may select a target only by name search.
- JSON mode must return stable error codes, retryability, recovery, and created or deleted IDs where available.
- High-risk commands must remain documented so users can review side effects before scripting them.

## MCP rules

- Agent-facing high-risk business/admin workflows use `dry_run` and `confirm_token` before executing the write.
- Confirmation tokens are scoped to tool name, workspace ID, risk class, stable args, and preview body; mismatches fail closed.
- Low-level destructive tools must advertise `destructiveHint: true`; safe reads should advertise read-only and idempotent hints.
- MCP success envelopes must carry `changed`, `warnings`, and `next` when state changed; failures must carry stable `recovery`.

## Ambiguous failure recovery

If a write fails after the request left the process, do not blindly retry the same mutation:

1. Preserve the request ID, action, target workspace, stable error code, and retryability in the receipt or support bundle.
2. Re-list or fetch the target resource by explicit ID, unique name, timestamped prefix, or known cleanup slug.
3. If the intended object exists, return a reuse/recovery receipt instead of creating another one.
4. If the state is unknown and the operation is non-idempotent, stop and ask the operator or agent caller to choose retry, reuse, or cleanup.

## Readiness-context handoff

Ambiguous mutation failures are not local SDK, CLI, or MCP events once they can
affect release readiness, support handoff, or final proof. Any report or bundle
summarizing those failures must preserve `readinessContext`,
`finalBlockingSignalIds`, `blockingSignalIds`, `riskRoutingSummary`, and
`orderedProofChainCoverage`.

When a write might have reached Clockify but the local process cannot prove the
final state, emit or carry an `ambiguousMutationSignalIds` list so support can
connect the event to retry, reuse, or cleanup without re-running a
non-idempotent mutation.

## Contract-shape rule

Mutation-safety contract shape is part of write-safety. `make mutation-safety` must fail before trusting retry, write, confirmation, receipt, live-safety, or support evidence when `docs/mutation-safety-contract.json` has an invalid schema version, missing purpose, missing explicit invariants, unsafe repo-relative evidence paths, malformed policy markers, malformed required target/doc lists, malformed mutation class markers, malformed supporting-evidence markers, malformed readiness-context markers, or malformed Make/docs/inventory/audit wiring.

## Proof gates

- `make mutation-safety` checks this policy and the SDK/CLI/MCP supporting contracts.
- `make sdk-runtime-contract` checks SDK retry and recovery seams.
- `make cli-write-safety` checks deterministic CLI writes and destructive ID scope.
- `make mcp-write-safety` checks MCP confirmation tokens, destructive hints, and receipts.
- `make receipts-contract` checks the shared receipt and recovery shape.
