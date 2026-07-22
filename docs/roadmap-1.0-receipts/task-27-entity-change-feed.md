# Task 27 — experimental entity-change feed

## Scope and head

Task 27 started from
`30125060e09946827c78969781dfa696a4781de2`. The receipt-bearing
implementation commit is `SELF`: this file is committed atomically with the
tool, focused tests, generated surfaces, and lifecycle projections.

The shipped surface is exactly one read-only MCP domain tool,
`clockify_entity_changes_list`. A required `changeType` routes each call to one
generated experimental endpoint. It does not add three operation-shaped tools,
fan out across endpoints, parse string responses, synthesize a merged audit
timeline, call custom HTTP, or change OpenAPI/generated/wrapper source.

## Generated request and response contracts

The three exact generated routes are:

- `getCreatedEntityInfo` ->
  `client.entityChangesExperimental.listCreated(request)` using
  `ClockifyApi.ListCreatedEntityChangesExperimentalRequest`, returning
  `string`.
- `getUpdatedEntityInfo` ->
  `client.entityChangesExperimental.listUpdated(request)` using
  `ClockifyApi.ListUpdatedEntityChangesExperimentalRequest`, returning
  `string`.
- `getDeletedEntityInfo` ->
  `client.entityChangesExperimental.listDeleted(request)` using
  `ClockifyApi.ListDeletedEntityChangesExperimentalRequest`, returning
  `ClockifyApi.PageableCollectionLogBinDocumentDto`.

All requests have the exact flattened shape
`{ workspaceId, type, start?, end?, page?, limit? }`. Production request
construction uses `satisfies` against the selected generated request type and
includes only defined optional fields. There are no response or request casts.

The public schema requires one of `created`, `updated`, or `deleted` and a
non-empty array of the eight documented entity-type enum values. It keeps
generated `page` and `limit` values as strings and rejects workspace, body,
unknown-key, unsupported-type, and numeric pagination injection before any SDK
call. When dates are omitted, Clockify's documented 30-day/current-date default
behavior remains authoritative.

## Envelope and safety

Each successful branch returns the generated value untouched as `data`, with
`workspaceId`, selected `changeType`, requested `types`, and forwarded
`page`/`limit` metadata. Created and updated strings are not parsed. Deleted
responses include `count` only when their actual `response` field is an array.

Every success carries the stable `experimental_api` warning that response
shape and behavior may change. Upstream permission, not-found, and network
errors retain the shared error/recovery envelope with no fabricated empty feed.
The tool is registered as idempotent `read`, publishes no guard controls, and
requires no confirmation.

## TDD and deterministic proof

The focused suite went red on the absent tool, then added created, updated, and
deleted routing in separate red-to-green steps before freezing at 273 lines.
It covers exact one-method routing, optional-field omission, untouched string
and pageable envelopes, conditional deleted count, warning/meta fidelity,
shared recovery, strict schema rejection before the SDK, and tools/list risk
metadata.

```text
npm test -w @apet97/clockify-mcp-115 -- tests/entityChanges.test.ts
exit 0: 1 file; 16 tests passed.

npm run type-check -w @apet97/clockify-mcp-115
npm run lint -w @apet97/clockify-mcp-115
npm run build -w @apet97/clockify-mcp-115
exit 0 for all three commands.

make mcp-tool-manifest mcp-write-safety mcp-contract mcp-agent-ux
exit 0: 147 tools; 60 guarded; 18 destructive; MCP contract and agent UX passed.

make operation-parity operation-parity-drift operation-coverage
exit 0: 169 operations; 100 exact TS MCP mappings; 39 curated mappings.

make product-surface readme-tables docs-counts
exit 0: docs counts 147 = 22 workflow/orientation + 125 domain.

make consumer-cast-budget
exit 0: 1,463 analyzer tests passed; CLI 0/MCP 0 request casts and 0/0
exceptions; the public breaking-type proof passed.

make agent-tasks agent-handoff unique-claim-inventory decision-records
git diff --check
exit 0 for all five lifecycle/diff gates.

CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' CLOCKIFY_LIVE_CONFIRM='' \
  CLOCKIFY_LIVE_PREFIX='' npm test -w @apet97/clockify-mcp-115
exit 0: 69 files and 807 tests passed; 1 live file and 12 live tests skipped.
```

## Surface receipt

- Tools: 147 total = 22 workflow/orientation + 125 domain.
- Risk distribution: read 61, routine write 26, business write 32, external
  side effect 5, privileged 5, destructive 18.
- Guarded tools: 60.
- Entity-changes domain group: 1 tool.
- Operation parity: three curated overrides map `getCreatedEntityInfo`,
  `getUpdatedEntityInfo`, and `getDeletedEntityInfo` to the one routed public
  tool; each invocation still calls exactly one selected generated operation.
- Remaining lifecycle blocker: two independent approvals (0/2 recorded).

## Live-proof disposition

No live experimental endpoint call ran. The sole full MCP run used explicitly
blank credentials and live-confirm variables. No mutation/Stryker command,
broad repository suite, push, tag, publish, release, or CI/security setting
change occurred.

The tool is an experimental routed read surface, not a normalized audit log or
a stability guarantee.

## Independent-review closeout

Two independent reviewers approved specification compliance and code quality
for the frozen range
`30125060e09946827c78969781dfa696a4781de2..b0ec918885854f2b6f3ab6f1afcc3140488c48d0`.
Neither review reported a blocking finding. The approval-recording commit is
evidence-only and is outside the substantive reviewed implementation range.
Task 27 is complete at 2/2 approvals; its experimental-stability warning
remains part of the shipped contract. Historical approval closeouts and Task 1
remain open.
