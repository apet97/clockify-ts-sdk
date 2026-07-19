# SDK Helper Cookbook

These examples cover the hand-written SDK helper layer: small utilities that
turn common Clockify footguns into repeatable calls. The snippets below are
copied from `wrapper/examples/sdk-helper-cookbook.ts`, which is included in the
wrapper type-check.

## Ensure Or Reuse

Use `ensureTag`, `ensureProject`, or `ensureClient` when re-running a script
should reuse an exact name instead of creating duplicates.

```ts sdk-include=sdk-helper-cookbook.ts
const TAG_ID = "000000000000000000000101";
const PROJECT_ID = "000000000000000000000201";
const tags = [{ id: TAG_ID, name: "Billable" }];

const billableTag = await ensureTag({
    name: "billable",
    list: async () => tags,
    create: async (name) => {
        const tag = { id: "000000000000000000000102", name };
        tags.push(tag);
        return tag;
    },
});
```

## Archive Then Delete

Use a typed adapter to translate the generic current-state → archive → delete
workflow into the exact request shapes of the resource you are calling. The
adapter keeps current state typed through the archive callback and makes the
ordering explicit.

```ts sdk-include=sdk-helper-cookbook.ts
const projectState = { id: PROJECT_ID, name: "Website refresh", archived: false };
const archiveOrder: string[] = [];
const deleteResult = await archiveThenDeleteProject({
    workspaceId: "000000000000000000000001",
    id: PROJECT_ID,
    adapter: {
        getCurrent: async () => {
            archiveOrder.push("getCurrent");
            return projectState;
        },
        archive: async ({ current }) => {
            archiveOrder.push("archive");
            projectState.name = current.name;
            projectState.archived = true;
        },
        delete: async () => {
            archiveOrder.push("delete");
        },
    },
});
```

Clients use a replacement-body envelope. Preserve every editable value from
`getCurrent`—including empty strings—while changing only `archived`; omitting
those values can erase client state:

```ts sdk-include=archive-then-delete-client-adapter.ts
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

## Resolve Names

Use `resolveEntityRef` when user input can be either an id or an exact name.
A miss or ambiguous match returns a grounded clarification instead of guessing.

```ts sdk-include=sdk-helper-cookbook.ts
const resolvedProject = await resolveEntityRef(
    { name: "Website refresh" },
    {
        noun: "project",
        verb: "log work against",
        list: async () => [{ id: PROJECT_ID, name: "Website refresh" }],
    },
);
if (!resolvedProject.ok) throw new Error(resolvedProject.clarify.clarify);
```

## Build Values

Use the helper subpaths for wire-safe values before calling generated resource
methods: money scaling, report filters, date ranges, and bounded bulk work.

```ts sdk-include=sdk-helper-cookbook.ts
const cents = toMinor(129.5, "major");
const invoiceUnitPrice = invoiceItemUnitPriceToWire(cents);
const lastWeek = resolvePeriod(new Date("2026-06-19T12:00:00.000Z"), "last_week");

const reportFilter = detailedFilter({ page: 1, pageSize: 50 });
const archivedProjects = await mapBounded(
    [PROJECT_ID],
    async (projectId) => ({ projectId, archived: true }),
    { concurrency: 2 },
);
```

## Compose Writes

Use `runComposition` for multi-step writes where a required later step should
roll back earlier creates, while optional steps can warn and continue.

```ts sdk-include=sdk-helper-cookbook.ts
const createdIds: string[] = [];
const composition = await runComposition([
    {
        label: "project",
        required: true,
        run: async () => {
            createdIds.push(PROJECT_ID);
            return {
                kind: "done",
                created: [{ type: "project", id: PROJECT_ID, name: "Website refresh" }],
                undo: async () => {
                    createdIds.pop();
                },
            };
        },
    },
]);
```
