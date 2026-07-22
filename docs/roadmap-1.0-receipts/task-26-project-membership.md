# Task 26 — project membership administration

## Scope and head

Task 26 started from
`5f52f961aef0a7753bf3dc5594578e982aa30ede`. The receipt-bearing
implementation commit is `SELF`: this file is committed atomically with the
tools, tests, generated surfaces, and lifecycle projections.

The shipped surface is exactly two MCP project-domain tools:
`clockify_projects_memberships_list` and
`clockify_projects_memberships_update`. It does not add a CLI mirror, custom
HTTP, a `setMembers` call, generated/OpenAPI edits, or a live workspace
mutation.

## Generated request and response contracts

Membership read projection:

- Operation: `getProjectById`
- SDK call: `client.projects.get(request)`
- Request: `ClockifyApi.GetProjectsRequest`
- Exact flattened request: `{ workspaceId: string; projectId: string }`
- Response: `ClockifyApi.Project`

The read tool projects only `projectId`, `memberships` (defaulting to an empty
array), and `userGroups` when the hydrated project response contains it. Its
metadata carries `workspaceId`, `projectId`, and membership count; it does not
claim a change receipt.

Membership replacement:

- Operation: `updateProjectMemberships`
- SDK call: `client.projects.updateMemberships(request)`
- HTTP operation: `PATCH /workspaces/{workspaceId}/projects/{projectId}/memberships`
- Request: `ClockifyApi.UpdateMembershipsProjectsRequest`
- Exact flattened request:
  `{ workspaceId: string; projectId: string; memberships: UserIdWithRatesRequest[]; userGroups?: ProjectsUserGroupIdsSchema }`
- Response: `ClockifyApi.Project`

Both production requests are constructed directly with `satisfies`; there is
no request cast, body envelope, custom transport, or generated-tree edit. The
curated parity override maps only `updateProjectMemberships` to the
membership-first public update name. The read projection deliberately adds no
second mapping, and generated `assignOrRemoveProjectUsers` remains uncovered;
the implementation never calls its `setMembers` method.

## Resolution, confirmation, and receipt safety

The privileged update requires at least one strict membership. Each membership
has one user reference and optional strict hourly/cost rate objects; rate
amounts pass through as generated integer minor units. Optional strict group
filters preserve generated `contains`, `ids`, and `status` values.

Preview resolves every user by ID, exact name, or `me` through the shared user
resolver with `trustIds:false`, then resolves every supplied group ID or name
through the shared group resolver. Direct 24-hex references are therefore
verified rather than trusted. Unknown or ambiguous references return grounded
clarification without a token, and duplicate resolved user IDs fail before
token issuance. A scoped strict top-level schema rejects `workspaceId`, `body`,
and every other unknown business key before resolution while retaining the
guard-owned `dry_run` and `confirm_token` controls.

Only after all resolution succeeds does the guard store the exact flattened
request. Confirmation executes that stored request without re-resolving users
or groups. Update-specific tests cover bare and mixed controls, project,
membership, and group tampering, cross-workspace use, expiry, one-use replay,
and 403 permission recovery. Successful execution preserves the complete
returned Project as `data`, records the project as updated, reports resolved
membership/group counts, and recommends the membership read projection as an
honest read-back.

## TDD and deterministic proof

The focused test first failed because the list tool was absent. The minimal
read projection made it pass; the guarded update then went red-to-green, and a
final schema case exposed and closed reserved top-level control stripping. The
focused test file covers the required read projection and recovery, strict
top-level input, verified user/group resolution, the complete confirmation
matrix, exact-preview execution, minor-unit rate preservation, duplicate
rejection, clarification, response/receipt honesty, read-back guidance, and the
absence of `setMembers`.

```text
# Reviewer correction proof on the current tree
npm test -w @apet97/clockify-mcp-115 -- tests/project-memberships.test.ts
exit 0: 1 file; 23 tests passed.

npm test -w @apet97/clockify-mcp-115 -- tests/project-memberships.test.ts tests/tool-registration.test.ts tests/confirmation-store.test.ts
exit 0: 3 files; 61 tests passed.

npm run type-check -w @apet97/clockify-mcp-115
npm run lint -w @apet97/clockify-mcp-115
exit 0 for both commands.

make agent-tasks agent-handoff unique-claim-inventory
git diff --check
exit 0 for all four gates.

# Initial implementation proof at 71d6fd9, before independent review
npm run build -w @apet97/clockify-mcp-115
exit 0.

make mcp-tool-manifest mcp-write-safety mcp-contract mcp-agent-ux
exit 0: 146 tools; 60 guarded; 18 destructive; MCP contract and agent UX passed.

make operation-parity operation-parity-drift product-surface readme-tables docs-counts
exit 0: curated `updateProjectMemberships` parity; docs counts 146 = 22 + 124.

make consumer-cast-budget
exit 0: 1,463 analyzer tests passed; CLI 0/MCP 0 request casts and 0/0 exceptions;
the public breaking-type proof passed.

The same pre-review commit ran the one authorized full blank-environment MCP
suite: 68 files and 781 tests passed; 1 live file and 12 live tests skipped. The
reviewer correction intentionally used only the focused project-membership,
shared guard, type/lint, and lifecycle gates named in its task; it did not claim
a second full-suite run.
```

## Surface receipt

- Tools: 146 total = 22 workflow/orientation + 124 domain.
- Risk distribution: read 60, routine write 26, business write 32, external
  side effect 5, privileged 5, destructive 18.
- Guarded tools: 60.
- Projects domain group: 8 tools.
- Operation parity: generated `updateProjectMemberships` maps through one
  curated override to `clockify_projects_memberships_update`; the list
  projection adds no parity mapping and `assignOrRemoveProjectUsers` remains
  unmapped.
- Remaining lifecycle blocker: two independent approvals (0/2 recorded).

## Live-proof disposition

No live project membership read or mutation ran. The sole full MCP run used
explicitly blank credentials and live-confirm variables. No local
mutation/Stryker command, broad repository suite, push, tag, publish, release,
or CI/security setting change occurred.

Task 26 is `evidence_captured`, not complete. Task 27 remains pending until two
independent reviewers approve the frozen Task 26 range. Task 1 and the roadmap
remain open.
