# Task 25 — scheduling assignment copy

## Scope and head

Task 25 started from
`8a7776122114c7af2aea4eb1b796cc610551dbf0`. The receipt-bearing
implementation commit is `SELF`: this file is committed atomically with the
tool, tests, generated surfaces, and lifecycle projections.

The shipped surface is exactly one business-write MCP domain tool,
`clockify_scheduling_copy`. It does not add a general scheduling workflow, a
CLI mirror, custom HTTP, source-assignment reads, generated/OpenAPI edits, or a
live workspace mutation.

## Generated request and response contract

- Operation: `copyScheduledAssignment`
- SDK call: `client.scheduling.copy(request)`
- HTTP operation: `POST /workspaces/{workspaceId}/scheduling/assignments/{assignmentId}/copy`
- Request: `ClockifyApi.CopySchedulingRequest`
- Exact flattened request:
  `{ workspaceId: string; assignmentId: string; userId: string; seriesUpdateOption: "THIS_ONE" | "THIS_AND_FOLLOWING" | "ALL" }`
- Response: `ClockifyApi.SchedulingAssignment[]`

The production request is constructed directly with `satisfies`; there is no
request cast, body envelope, source fetch, or custom transport. Generated
operation parity recognizes the canonical tool name directly, so no parity
override was added.

## Resolution, confirmation, and receipt safety

Preview resolves the target user by ID, exact name, or `me` through the shared
scheduling user resolver with `trustIds:false`. A supplied 24-hex ID is therefore
verified against the workspace-user list. Ambiguous and unknown names return a
grounded `userId` clarification without a token or copy request.

The `business_write` guard stores the exact resolved preview. Confirmation
executes only that stored `ClockifyApi.CopySchedulingRequest`; deterministic
tests prove no second resolver call, bare and mixed-control rejection, all three
business-argument tamper paths, one-use replay, and exactly one copy call after
valid confirmation. Shared guard coverage retains expiration enforcement.
Simulated 403 and 404 responses produce stable non-retry recovery without a
success receipt.

Successful execution preserves the complete scheduling-assignment array as
`data`, reports the first returned ID in a created
`scheduling_assignment` receipt, and includes the exact workspace, source
assignment, resolved target user, and series scope in metadata. An empty array
stays empty, has no invented ID, and carries an explicit verification warning.
No date-range follow-up is fabricated because the request contains no copied
date range.

## TDD and deterministic proof

The initial tracer failed because the tool was absent. The minimal guarded
registration and direct SDK call made it pass; focused cases then pinned
resolution, response preservation, empty-result honesty, recovery, tamper
rejection, and replay behavior.

```text
npm test -w @apet97/clockify-mcp-115 -- scheduling
exit 0: 4 files; 44 tests passed.

npm run type-check -w @apet97/clockify-mcp-115
npm run lint -w @apet97/clockify-mcp-115
npm run build -w @apet97/clockify-mcp-115
exit 0 for all three commands.

make mcp-tool-manifest mcp-write-safety mcp-contract mcp-agent-ux
exit 0: 144 tools; 59 guarded; 18 destructive; MCP contract and agent UX passed.

make operation-parity operation-parity-drift product-surface readme-tables docs-counts
exit 0: direct `copyScheduledAssignment` parity; docs counts 144 = 22 + 122.

make consumer-cast-budget
exit 0: CLI 0/MCP 0 request casts and 0/0 exceptions.

CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' CLOCKIFY_LIVE_CONFIRM='' CLOCKIFY_LIVE_PREFIX='' npm test -w @apet97/clockify-mcp-115
exit 0: 67 files passed, 1 live file skipped; 768 tests passed, 12 live tests skipped. The intentional missing-annotation negative fixture printed its expected synthetic 145-tool failure diagnostics inside the passing test.
```

## Surface receipt

- Tools: 144 total = 22 workflow/orientation + 122 domain.
- Risk distribution: read 59, routine write 26, business write 32, external
  side effect 5, privileged 4, destructive 18.
- Guarded tools: 59.
- Scheduling domain group: 8 tools.
- Operation parity: generated `copyScheduledAssignment` maps directly to
  `clockify_scheduling_copy`.
- Remaining lifecycle blocker: two independent approvals (0/2 recorded).

## Live-proof disposition

No live scheduling assignment copy ran. The sole full MCP run used explicitly
blank credentials and live-confirm variables. No local mutation/Stryker
command, push, tag, publish, release, or CI/security setting change occurred.

Task 25 is `evidence_captured`, not complete. Task 26 remains pending until two
independent reviewers approve the frozen Task 25 range. Task 1 and the roadmap
remain open.
