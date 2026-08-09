# Migration Guide

This project intentionally uses package names with `115` suffixes for trademark distance from Clockify.

## Package names

| Old or generic expectation | Current package |
|---|---|
| `clockify-sdk-ts` | `clockify-sdk-ts-115` |
| `clockify` CLI | `@apet97/clockify-cli-115`, binaries `clockify115` and `clk115` |
| Clockify MCP server | `@apet97/clockify-mcp-115`, binary `clockify115-mcp` |

## Version alignment

The coordinated package set is SDK `5.0.0`, CLI `5.0.0`, and TypeScript MCP
`5.0.0`. All three require Node.js `>=22.13.0`; the CLI and TypeScript MCP declare
`clockify-sdk-ts-115 ^5` as their SDK peer range. Upgrade the SDK before
or alongside either consumer package so npm does not resolve an older SDK surface.

### Upgrading to SDK 5.0.0

Two type-level breaking changes. Runtime behaviour is unchanged, but existing
consumer code can fail to compile.

**`StartTimerTimeEntriesRequest` now requires `body`.** The old flattened arm
declared no `body` at all, so the union type-checked a bulk edit that sent
nothing. The type is now an alias of `StartTimerTimeEntriesRequestBodyEnvelope`.
Code that compiled without `body` was the silent no-op this release fixes —
add the `body` the request always needed.

**29 generated interfaces gained `[key: string]: unknown`.** These are the
schemas that declare `additionalProperties: true` alongside their properties.
The index signature widens `keyof`, disables excess-property checking on
object literals annotated with those types, and makes them assignable to
`Record<string, unknown>`. If you relied on `keyof` narrowing or on the
compiler rejecting extra keys for those types, add your own explicit checks.

### Upgrading to SDK 4.0.0

Two changes. Both remove a promise the API never kept.

**`currencyCode` is gone from the client request bodies.** Clockify ignores it
on create and on update; only `currencyId` sets a client's currency, and only on
update. Delete the field — there is nothing to replace it with, because the
currency survives a replacing `PUT` that omits it. It is unchanged on the
response types, which do return it.

```typescript
// Before: accepted, type-checked, and silently ignored by Clockify.
await client.clients.update({
    workspaceId,
    clientId,
    body: { name: "Acme", currencyCode: "USD" },
});

// After: drop it. The currency is unchanged either way.
await client.clients.update({ workspaceId, clientId, body: { name: "Acme" } });
```

The same schema fix adds `ccEmails` and `currencyId` to the update body. If you
build client replacement bodies yourself, carry `ccEmails` across — the update
is a replacing `PUT`, so omitting it clears the stored list. This is a fix, not
a break: before 4.0.0 the field could not be sent at all, so every client update
destroyed it.

```typescript
const current = await client.clients.get({ workspaceId, clientId });
await client.clients.update({
    workspaceId,
    clientId,
    body: {
        name: current.name,
        ...(current.ccEmails != null ? { ccEmails: current.ccEmails } : {}),
        note: "updated",
    },
});
```

**`ClockifyApiError.message` no longer embeds the response body.** It is now
`"<ErrorName>\nStatus code: <n>"`. Clockify echoes submitted values back in its
error text, so `log(err.message)` could put request data in your logs. The body
was always on `err.body`; the new `clockifyErrorDetail` combines the message with
Clockify's upstream explanation when you want it.

```typescript
import { clockifyErrorDetail, getErrorCode } from "clockify-sdk-ts-115/errors";

catch (err) {
    // Shown to the caller that submitted the values — full detail.
    console.error(clockifyErrorDetail(err));
    // Written to shared logs — body-free.
    logger.warn({ code: getErrorCode(err), message: (err as Error).message });
}
```

If you classify errors by matching text, read `clockifyErrorDetail(err)` rather
than `err.message`: the tokens worth matching ("required", "invalid", "not
found") only ever came from the body. `classifyClockifyError` and `getErrorCode`
already read the body directly and are unaffected.

### Upgrading to SDK 3.0.0

Two changes, both corrections to contracts that were wrong.

**`getErrorCode` now returns Clockify's codes.** Clockify sends the error
body's `code` field as a JSON number — `{"message":"...","code":501}` — and the
accessor required a string, so it returned `undefined` for every real Clockify
error. It now converts a finite number to its string form; the return type is
unchanged (`string | undefined`).

This changes behavior for any caller that treated `undefined` as "no code":

```typescript
// Before 3.0.0 this branch was unreachable. It works now.
if (getErrorCode(err) === "501") return existing;

// If you relied on the old always-undefined result, this is the break:
if (getErrorCode(err) === undefined) fallback(); // no longer always true
```

The codes you will see are `501` validation, `1000` missing or duplicated auth
header, `4003` unknown API key, `4017` invalid add-on token, and `3000`
immutable resource. `classifyClockifyError().serverCode` reads through the same
accessor and is populated again for the same reason.

**The entity-change reads return arrays.** `entityChangesExperimental`'s
`listCreated`, `listUpdated`, and `listDeleted` were typed `string`, `string`,
and a paged object wrapper. Live probing on 2026-08-08 showed all three answer
with a bare JSON array, so all three now return `EntityChangeDocument[]`. No
response ever matched the declared types, so no working caller can break —
but a caller written against the old types will not compile.

```typescript
const created = await client.entityChangesExperimental.listCreated({
    workspaceId,
    type: ["TIME_ENTRY"],
});
for (const change of created) console.log(change.documentCode, change.id);
```

Note `documentCode`. Clockify's own published sample calls the same field
`documentType`; the wire says `documentCode`.

### Upgrading to SDK 2.0.0

Four breaking changes. Three are corrections to contracts that were wrong on
the wire, each proven against a live workspace on 2026-08-07; the fourth drops
a long-deprecated alias.

**`deleteInvoiceItem` takes a number.** `DeleteInvoiceItemsRequest.order` was
typed `string`; the path segment binds to an integer with a minimum of 1.

```ts
- await client.invoiceItems.delete({ workspaceId, invoiceId, order: "2" });
+ await client.invoiceItems.delete({ workspaceId, invoiceId, order: 2 });
```

**`createTimeOffPolicy` requires `approve`.** Omitting the object returns 400
"must not be null" whatever the assignee shape, so the field was never really
optional.

```ts
  await client.timeOffPolicies.create({
      workspaceId,
      name: "Sick leave",
+     approve: { requiresApproval: false },
  });
```

**`Policy` no longer declares `hasExpiration`.** The field is accepted on write
and never echoed back, so reading it off a response was always `undefined`.

**`CLOCKIFY_AMOUNT_UNITS.expense` is gone.** Use `expenseAmount` for
create/update writes (major units) or `expenseTotal` for reads (minor units).

```ts
- toMinor(amount, CLOCKIFY_AMOUNT_UNITS.expense);
+ toMinor(amount, CLOCKIFY_AMOUNT_UNITS.expenseTotal);
```

Three additions need no action: `deleteClient` and `deleteTag` are now typed as
returning the deleted entity, the bare `GET /shared-reports/{id}` returns the
new `SharedReportData` rendered report instead of the list-item shape, and
several operations regained query parameters the API honours — `strict-name-search`
and `excluded-ids` on `listTags`, `archive-projects` and `mark-tasks-as-done`
on `updateClient`, `sharedReportsFilter` on the shared-report list, `types` on
`listApprovalRequests`, `from-entry` and `hydrated` on the user time-entry
write paths.

If you consume the CLI or the TypeScript MCP, their SDK peer range moves to the
matching major. Install the SDK first.

### Upgrading to SDK 1.0.0

Nothing to change. 1.0.0 is the 0.15.1 surface placed under semantic
versioning: the same 99 exported symbols across the same 28 subpaths, all
classified `stable`. No symbol, subpath, export or type was added, removed or
renamed.

If you consume the CLI or the TypeScript MCP, note only that their SDK peer
range moved from `>=0.15.1 <1` to the 1.x major line.

### Upgrading to SDK 0.15.1

Three behavior fixes, no API changes. Nothing to change at a call site, but two
of them change results you may have been compensating for.

**`resolveInstant` now honours the RFC 3339 §5.6 space separator.** A value like
`"2026-06-01 10:30:00"` previously failed the `[Tt]` datetime test and fell
through to the day-edge path, which **discarded the time entirely** — and on the
`end` edge widened the bound to `23:59:59.999`. It is now normalized to `T` and
parsed as a datetime. If you were passing space-separated timestamps and
compensating for the widened window, remove the compensation. Bare dates
(`"2026-06-01"`) are unaffected and still resolve to day edges.

**Composition rollback no longer claims a clean workspace when it isn't.** A
step that returns `created` without an `undo` compensator can never be rolled
back; `runComposition` now records those and emits a `no_undo` rollback warning
on failure, where `leftBehindNote` previously reported nothing left behind.
Callers reading `status.rollbackWarnings` will see entries they did not see
before — that is the point.

**A non-`Error` rejection from a custom `fetch` keeps its payload.**
`composed-fetch` attaches the original value as `cause` instead of flattening it
to `"[object Object]"` on the retry path.

### Upgrading to SDK 0.14.0

Additive for response types; nothing to change at a call site.

**Listing expenses no longer needs a second request.** The rows returned by
`expenses.list` (`getWorkspaceExpenses`) always carried expanded `category` and
`project` objects, a `task`, and a `fileName` — the generated type just could
not express them, so 16 field paths were invisible to typed callers. They are
declared now, and code that worked around the gap by re-fetching
`getExpenseCategories` or `getProjectById` per row can drop that call.

Two things to know when you start reading the new fields:

- `category`, `project`, `task`, `fileId`, `fileName` and `notes` are all
  nullable on the wire but are **not** declared `nullable` (this spec never
  combines `nullable` with `$ref`). Null-check them.
- `task` was `null` on all 2845 rows of the sandbox used to verify this, so its
  `TaskInfoDto` shape comes from the upstream source rather than from an
  observed payload. Treat it as the least certain of the four.

**A single expense is a different shape and did not change.**
`expenses.get` (`getExpenseById`), `createExpense`, and `updateExpense` return
the flat `categoryId` / `projectId` / `taskId` and no expanded objects. Do not
expect `expense.category` from those.

**Time-off balances gained `negativeBalanceUsed`** (`number`), so you can tell
whether a negative balance has actually been drawn down rather than only seeing
the configured limit.

## Import paths

Use the package root for common SDK work:

```typescript
import { createClockifyClient, iterAll, RateLimitError } from "clockify-sdk-ts-115";
```

Use subpaths for narrow imports:

```typescript
import { createClockifyClient } from "clockify-sdk-ts-115/create-client";
import { iterAll } from "clockify-sdk-ts-115/iter";
import { verifyClockifyWebhook } from "clockify-sdk-ts-115/webhooks";
```

## Auth

Prefer `createClockifyClient()` over constructing the generated `ClockifyApiClient` directly. The factory enforces Clockify's exactly-one-token behavior and adds env fallback, request IDs, user-agent headers, hooks, and retry configuration.

```typescript
const client = createClockifyClient({ apiKey: process.env.CLOCKIFY_API_KEY! });
```

## Generated surfaces

Do not edit these by hand:

- `spec/corrected/**`
- `output/ts-sdk/**`
- `wrapper/src/**`

Change API shape in GOCLMCP first, regenerate the snapshot, then run `make sdk-codegen` to refresh local generated output and sync the wrapper.

## From Fern-generated core to local generated core

Older repo guidance described `spec/fern/**`, `fern check`, `fern generate`,
Docker, and a Fern TypeScript generator image as the required SDK generation
path. That is now historical context only.

Use the repo-owned local generator instead:

```bash
npm ci
make sdk-codegen
make sdk-codegen-drift
make sdk-codegen-test
```

The public package surface is intended to stay stable across the migration:
`ClockifyApiClient`, `createClockifyClient`, `withRawResponse()`, typed status
errors, pagination helpers, webhooks, scoped clients, diagnostics, health, rate
limit helpers, OTel hooks, and the documented subpaths remain the supported
entry points. Code that imported from `wrapper/src/**`, `output/ts-sdk/**`, or
Fern-generated internals should migrate to `clockify-sdk-ts-115` package exports.

## Typed request bodies

Build requests against the generated operation type. For replace-style writes,
construct the body-envelope arm explicitly so required fields stay visible to
TypeScript and untouched values can be carried forward safely:

```typescript
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";

const current = await client.clients.get({ workspaceId, clientId });
const body: ClockifyRequestBody<ClockifyApi.UpdateClientsRequest> = {
    name: current.name,
    ...(current.address != null ? { address: current.address } : {}),
    ...(current.currencyCode !== undefined ? { currencyCode: current.currencyCode } : {}),
    ...(current.email != null ? { email: current.email } : {}),
    ...(current.note != null ? { note: current.note } : {}),
    archived: true,
};
const request: ClockifyApi.UpdateClientsRequest = { workspaceId, clientId, body };
await client.clients.update(request);
```

For operations whose flattened form already matches the wire contract, bind it
directly instead:

```typescript
const request: ClockifyApi.TaskCreateRequest = {
    workspaceId,
    projectId,
    name: "Review",
    billable: false,
};
await client.tasks.create(request);
```

Validate open JSON input with an operation-specific strict schema before
building either form. Assign protected workspace, entity, date, pagination, and
filter fields after validated extras so callers cannot override scope.

## CLI behavior

CLI exit codes: 0 means success; 1 means runtime/config/API failure; 2 means command-line usage error.

- `0` means success.
- `1` means runtime/config/API failure.
- `2` means command-line usage error.
- `--json` errors include `ok:false`, `error`, `code`, `recovery`, and `retryable`.

## MCP behavior

Every MCP tool returns the shared envelope in `content[0].text` and `structuredContent`. Every advertised tool has an output schema for that envelope.

## Breaking change review

Replacement first: add the new SDK export, CLI command, MCP tool, package path, or OpenAPI-generated method before removing the old one. Changelog and migration notes must land in the same change as public breakage, and `make breaking-change-review` is the narrow gate before broader package and final proof gates.

### 1.0 SDK closure

| Removed pre-1.0 name | Replacement | Migration |
|---|---|---|
| `allowInsecureBaseUrl` | `allowNonClockifyHttpsHost` | Rename the SDK factory option or MCP `LoadContextOptions` field. The replacement permits only non-Clockify **HTTPS** hosts; non-loopback cleartext remains rejected. |
| `findOrCreateClient` | `ensureClient` | Rename the import and call; inputs, result, matching, ambiguity, and single-flight behavior are unchanged. |
| `ArchiveThenDeleteResource` | `ArchiveThenDeleteAdapter<TCurrent>` | Replace the loose SDK-resource object with typed `getCurrent`, `archive`, and `delete` callbacks. Pass the adapter under `adapter`, not `resource`. |

```typescript
import {
    archiveThenDeleteProject,
    type ArchiveThenDeleteAdapter,
} from "clockify-sdk-ts-115/ensure";
import type { ClockifyApi } from "clockify-sdk-ts-115/requests";

const adapter: ArchiveThenDeleteAdapter<ClockifyApi.Project> = {
    getCurrent: ({ workspaceId, id }) =>
        client.projects.get({ workspaceId, projectId: id }),
    archive: async ({ workspaceId, id, current }) => {
        await client.projects.update({
            workspaceId,
            projectId: id,
            name: current.name,
            archived: true,
        });
    },
    delete: async ({ workspaceId, id }) => {
        await client.projects.delete({ workspaceId, projectId: id });
    },
};

await archiveThenDeleteProject({ workspaceId, id: projectId, adapter });
```

For clients, use the generated replacement-body envelope and carry all current
editable fields through the archive write. The compile-checked example preserves
empty strings and omits only nullable fields that the update body cannot accept:

```typescript sdk-include=archive-then-delete-client-adapter.ts
import type { createClockifyClient } from "clockify-sdk-ts-115";
import {
    archiveThenDeleteClient,
    type ArchiveThenDeleteAdapter,
} from "clockify-sdk-ts-115/ensure";
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";

type ClockifyClient = ReturnType<typeof createClockifyClient>;

export function clientArchiveReplacementBody(
    current: ClockifyApi.Client,
): ClockifyRequestBody<ClockifyApi.UpdateClientsRequest> {
    const body: ClockifyRequestBody<ClockifyApi.UpdateClientsRequest> = {
        name: current.name,
        archived: true,
    };
    for (const key of ["address", "currencyCode", "email", "note"] as const) {
        const value = current[key];
        if (typeof value === "string") body[key] = value;
    }
    return body;
}

export function clientArchiveThenDeleteAdapter(
    client: ClockifyClient,
): ArchiveThenDeleteAdapter<ClockifyApi.Client> {
    return {
        getCurrent: ({ workspaceId, id }) =>
            client.clients.get({ workspaceId, clientId: id }),
        archive: async ({ workspaceId, id, current }) => {
            await client.clients.update({
                workspaceId,
                clientId: id,
                body: clientArchiveReplacementBody(current),
            });
        },
        delete: async ({ workspaceId, id }) => {
            await client.clients.delete({ workspaceId, clientId: id });
        },
    };
}
```

The adapter callback results are deliberate: `getCurrent` returns
`Promise<TCurrent>`, while `archive` and `delete` return `Promise<void>` because
the workflow consumes only ordering and completion. The archive callback sees
`TCurrent & { name: string }` after the runtime name guard.

## Additive in this version (no breakage)

These are new public names, not replacements — existing imports are unchanged, so no code migration is required to keep working:

- SDK `clockify-sdk-ts-115/resolve` gained list/filter name→id resolvers `resolveUserRefs`, `resolveGroupRefs`, `resolveTagRefs`, and `resolveUserFilter`, alongside the existing `resolveEntityRef` / `resolveUserRef` / `matchByName`.
- SDK `clockify-sdk-ts-115/errors` gained `mapAddonTokenRestriction` and `AddonTokenRestrictionError` (a pure catch-site helper that names an add-on-token 401 hitting an out-of-reach endpoint; API-key 401s stay raw).
- This grew the SDK root public surface from 75 to 81 names at that release; use `docs/sdk-public-api.json` for the generated current surface.
- MCP behavior (this wiring added no tools): the holidays, time-off (policy/request/balance), scheduling, `groups add_member`, and `users` grant/revoke-role tools now resolve a name passed where a user/group/project id is expected to a real id before any write, returning a grounded `clarification` receipt with no API call on an ambiguous or unknown name. 24-hex ids pass through unchanged, and read-filter slots stay list-free. List fields also accept a bare string and number fields a numeric string; the model-visible JSON Schema is unchanged.
