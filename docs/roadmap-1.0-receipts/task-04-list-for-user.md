# Task 4 Receipt — Typed `listForUser` Workflows

Date: 2026-07-19

## Generated truth

The current local SDK already exposes
`ClockifyApi.ListForUserTimeEntriesRequest` with exact `workspaceId`, `userId`,
`start`, `end`, `page`, and hyphenated `page-size` fields. Its
`timeEntries.listForUser` method returns `ClockifyApi.TimeEntry[]`. No GOCLMCP,
OpenAPI snapshot, generator, generated output, or synced wrapper tree changed.

Both MCP review/fix paths now use those generated types directly. Their two
request/response cast pairs, `KEEP as never` annotations, and combined
cast-budget exception are gone. Each generated response-side
`customFieldValues` item is projected into a fresh update-side `customFields`
object containing only a validated non-empty `customFieldId`, JSON-compatible
`value`, and an allowed grounded `sourceType` (`WORKSPACE` or `PROJECT`).
Read-only `timeEntryId`, `name`, and `type` fields are stripped. Malformed,
unsupported, or duplicate values fail before the replace-style update so state
cannot be silently lost.

## Pagination and bound proof

`mcp/tests/workflows.test.ts` proves:

- exact generated request query names, including `page-size` and no `pageSize`;
- a unique fix target on a later page;
- ambiguity discovered across two different pages with no update;
- an empty page terminates the walk under the existing pagination contract;
- the fix scan inspects at most 10,000 entries and rejects before reading the
  sentry at position 10,001; and
- generated `TimeEntry.timeInterval` and `customFieldValues` fields are consumed
  without response casts; realistic hydrated custom fields are projected to the
  exact writable wire shape, while malformed IDs/values and duplicate IDs issue
  an error without an update.

`mcp/tests/iter-maxpages.test.ts` retains the review walk's 1,000-page guard
using generated `TimeEntry` fixtures. Existing confirmation and stored-preview
behavior remains unchanged.

## Closure proof

```text
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm test -w @apet97/clockify-mcp-115
npm run type-check -w @apet97/clockify-mcp-115
npm run lint -w @apet97/clockify-mcp-115
npm run build -w @apet97/clockify-mcp-115
make consumer-cast-budget
make risk-register contract-gates
make pack-snapshot-check
npm pack --dry-run -w @apet97/clockify-mcp-115
git diff --check
```

The broader `consumer-request-casts` risk and Task 7 remain open; this receipt
closes only the two `listForUser` workflow escape hatches assigned to Task 4.
No local mutation/Stryker run, live Clockify mutation, tag, publication,
release, push, main integration, or Task 5 work was performed.
