# Task 23 — workspace-user status administration

## Scope and head

Task 23 started from
`0b5d55b27e8ac3c9dbc0c5a44d59071f54392caf`. The receipt-bearing
implementation commit is `SELF`: this file is committed atomically with the
tool, tests, generated surfaces, and lifecycle projections.

The shipped surface is one privileged MCP domain tool,
`clockify_users_set_status`. It does not add a CLI mirror, alter workspace
roles, edit the generated SDK/OpenAPI, use custom HTTP, or perform a live
workspace mutation.

## Generated request and identity contract

- Operation: `updateUserStatus`
- SDK call: `client.workspaces.updateUserStatus(request)`
- Request: `ClockifyApi.UpdateUserStatusWorkspacesRequest`
- Exact flattened request:
  `{ workspaceId: string; userId: string; status: "ACTIVE" | "INACTIVE" }`
- Response: `ClockifyApi.Workspace`

The production request is constructed directly with `satisfies`; the consumer
cast gate remains at CLI 0 / MCP 0 with empty exception registries. Preview
resolution uses `resolveUserRef(... trustIds:false)`, so even a 24-hex id is
verified through the workspace-user list. The shared MCP list helper preserves
optional email, and this tool exposes an exact case-insensitive email match to
the existing resolver without changing the SDK resolver or weakening exact-name
matching.

## Confirmation and self-deactivation safety

The tool is governed as `privileged`. A dry run stores only the update action,
workspace-member entity/id, exact generated request, and human-safe status
intent. Confirmation consumes that stored preview; execution does not resolve
the member again.

Deterministic tests prove:

- `ACTIVE` and `INACTIVE` pass through unchanged;
- a bare call returns shared `invalid_request` confirmation recovery without
  resolving identity or writing;
- changed-status token tampering fails before the SDK write;
- central confirmation-store/guard tests retain changed-argument,
  wrong-workspace, expiry, one-use, and conflicting-control coverage;
- duplicate and unknown names return `ok:true` clarification receipts with
  `field:"userId"`, no token, and no write;
- exact names, exact emails, and 24-hex ids resolve to a verified canonical id;
- deactivating the current user is a hard `invalid_request` before token
  issuance, while another member and current-user activation can preview;
- simulated 403 and 404 failures map to `auth_or_permission` and `not_found`
  with non-retry recovery and exactly one SDK attempt.

Execution returns the generated Workspace as data plus `workspaceId`, `userId`,
and `status` metadata and a populated `workspace_member` update receipt. The
Workspace response is not represented as proof of an individual member's
status; callers can use `clockify_users_list` to re-check membership state.

## TDD and deterministic proof

The initial tracer test failed because `clockify_users_set_status` was not
registered. Separate red-green slices then pinned optional-email preservation,
exact-email resolution, and the hard self-deactivation block before their
minimal implementations.

```text
npm test -w @apet97/clockify-mcp-115 -- tests/users-status.test.ts tests/user-refs.test.ts tests/users.test.ts tests/server.test.ts tests/tool-risk.test.ts tests/tool-manifest.test.ts tests/confirmation-store.test.ts tests/confirm-guard-matrix.test.ts
exit 0: 8 files; 127 tests passed.

npm run lint -w @apet97/clockify-mcp-115
exit 0

npm run type-check -w @apet97/clockify-mcp-115
exit 0

make mcp-tool-manifest operation-parity product-surface readme-tables
exit 0: manifest, parity, product surface, and README tables regenerated.

make mcp-tool-manifest-drift operation-parity-drift mcp-contract mcp-agent-ux mcp-write-safety consumer-cast-budget docs-counts readme-tables-drift product-surface-drift
exit 0: 142-tool contracts; 142/57/18 write-safety summary; CLI 0/MCP 0 request casts and 0/0 exceptions; docs counts 142 = 22 + 120.

npm run build -w @apet97/clockify-mcp-115
exit 0

npm pack --dry-run -w @apet97/clockify-mcp-115
exit 0: apet97-clockify-mcp-115-0.6.2.tgz; 109 files; 112.2 kB packed, 581.1 kB unpacked.

CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' CLOCKIFY_LIVE_CONFIRM='' CLOCKIFY_LIVE_PREFIX='' npm test -w @apet97/clockify-mcp-115
exit 0: 65 files passed, 1 live file skipped; 738 tests passed, 12 live tests skipped. The intentional missing-annotation negative fixture printed its expected synthetic 143-tool failure diagnostics inside the passing test.
```

## Surface receipt

- Tools: 142 total = 22 workflow + 120 domain.
- Risk distribution: read 59, routine write 26, business write 30, external
  side effect 5, privileged 4, destructive 18.
- Guarded tools: 57.
- Users domain group: 8 tools.
- Operation parity: generated `updateUserStatus` maps to
  `clockify_users_set_status` under the workflow-first users group.
- Remaining lifecycle blocker: two independent approvals.

## Live-proof disposition

No live status mutation ran. A real activation/deactivation is a privileged
workspace mutation, and no explicit sacrificial-sandbox authorization was in
scope. The only full MCP run used explicitly blank credentials and confirmation
variables. No local mutation/Stryker command, push, tag, publish, or release-CI
change occurred.

## Independent approval closeout

Two independent reviewers returned **APPROVE** for specification compliance
and code quality over the frozen range
`0b5d55b27e8ac3c9dbc0c5a44d59071f54392caf..aa82bf2ee8932b625bce1650e165e63c5ba869f0`.
Task 23 is complete at `2/2` approvals with no remaining findings. This
closeout commit is evidence-only and is not part of the substantive reviewed
implementation range. Task 24 may start; Task 1 and the roadmap remain open.
