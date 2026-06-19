/**
 * Small, compile-checked cookbook for the hand-written SDK helpers. Pure and
 * mock-safe: no API calls, no credentials, no workspace writes.
 *
 * Run: `npx tsx examples/sdk-helper-cookbook.ts`
 */
import { mapBounded } from "clockify-sdk-ts-115/bulk";
import { runComposition } from "clockify-sdk-ts-115/compose";
import { resolvePeriod } from "clockify-sdk-ts-115/dates";
import { ensureTag } from "clockify-sdk-ts-115/ensure";
import { toMinor, invoiceItemUnitPriceToWire } from "clockify-sdk-ts-115/money";
import { detailedFilter } from "clockify-sdk-ts-115/reports";
import { resolveEntityRef } from "clockify-sdk-ts-115/resolve";

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

const resolvedProject = await resolveEntityRef(
    { name: "Website refresh" },
    {
        noun: "project",
        verb: "log work against",
        list: async () => [{ id: PROJECT_ID, name: "Website refresh" }],
    },
);
if (!resolvedProject.ok) throw new Error(resolvedProject.clarify.clarify);

const cents = toMinor(129.5, "major");
const invoiceUnitPrice = invoiceItemUnitPriceToWire(cents);
const lastWeek = resolvePeriod(new Date("2026-06-19T12:00:00.000Z"), "last_week");

const reportFilter = detailedFilter({ page: 1, pageSize: 50 });
const archivedProjects = await mapBounded(
    [PROJECT_ID],
    async (projectId) => ({ projectId, archived: true }),
    { concurrency: 2 },
);

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

console.log({
    tagId: billableTag.id,
    projectId: resolvedProject.id,
    invoiceUnitPrice,
    lastWeek,
    reportPage: reportFilter.page,
    archivedCount: archivedProjects.ok.length,
    compositionStatus: composition.status.kind,
    createdIds,
});
