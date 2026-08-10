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
    for (const key of ["address", "email", "note"] as const) {
        const value = current[key];
        if (typeof value === "string") body[key] = value;
    }
    // The update is a replacing PUT, so every field omitted here is cleared.
    // `ccEmails` is the one that is easy to miss; the currency is the one
    // exception Clockify keeps under omission.
    if (current.ccEmails != null) body.ccEmails = current.ccEmails;
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

The money helpers (`toMinor`, `toMajor`, `invoiceItemUnitPriceToWire`,
`invoiceItemUnitPriceFromWire`) enforce one exact-integer envelope on every
minor-unit amount they scale: `Number.isSafeInteger`'s ±2^53−1 range. A value
outside it has already lost precision, so the helper throws `RangeError`
instead of returning a silently wrong amount.

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

## Envelope Flattening

`client.expenses.list` returns a doubly-nested wire shape,
`{ expenses: { expenses: [...], count } }`. Use `listExpensesFiltered` to
flatten it into a plain `items[]` array — it also drives Clockify's
`Last-Page` pagination header and applies the `start`/`end` date bounds
client-side, since the server ignores those query params for this endpoint
(see [Expense date filtering](../wrapper/README.md#expense-date-filtering)).

```ts sdk-include=sdk-helper-cookbook.ts
type Expense = { id: string; date?: string };
const expenseFetcher: ExpenseListFetcher<Expense> = () =>
    // The raw wire shape doubly-nests: { expenses: { expenses: [...], count } }.
    // listExpensesFiltered flattens it into a plain items[] array.
    Promise.resolve({
        expenses: {
            expenses: [{ id: "exp-1", date: "2026-06-05" }],
            count: 1,
        },
    });
const flattenedExpenses = await listExpensesFiltered(expenseFetcher, {
    workspaceId: "000000000000000000000001",
});
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

## Build Invoice Update Bodies

Clockify's invoice `PUT` is replace semantics — a field you omit is wiped, not
left unchanged — and the GET response reports tax/discount as ×100 integers
while the PUT body wants `*Percent` floats. `invoiceUpdateBodyFromExisting`
carries every editable field forward from the GET response and converts the
percent scale, so a small patch cannot silently zero out tax or discount:

```ts sdk-include=invoice-client.ts
import { invoiceUpdateBodyFromExisting } from "clockify-sdk-ts-115";

// Pretend this came from `client.invoices.get({ workspaceId, invoiceId })`.
const existingInvoice = {
    id: "invoice_123",
    number: "INV-2026-001",
    note: "Thanks for your business",
    tax: 2000, // ×100 integer on the GET → 20%
    tax2: 0, // ×100 integer on the GET → 0% (secondary tax, unused here)
    discount: 1000, // ×100 integer on the GET → 10%
    currency: "USD",
    issuedDate: "2026-08-01T00:00:00Z",
    dueDate: "2026-08-31T00:00:00Z",
};

// Carry everything forward, change only the note.
const body = invoiceUpdateBodyFromExisting(existingInvoice, {
    note: "Updated note — net 30",
});

console.log("PUT body preserves tax/discount:", body);
```

See [`examples/invoice-client.ts`](../wrapper/examples/invoice-client.ts) for
the runnable, self-checking version.
