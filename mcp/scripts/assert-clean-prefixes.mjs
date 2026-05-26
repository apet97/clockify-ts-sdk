#!/usr/bin/env node
import { loadContext } from "../dist/client.js";

const DEFAULT_PREFIXES = ["sdk-test-", "mcp-sandbox-", "mcp-workflow-", "mcp-log-", "mcp-fix-", "DEMO-"];
const prefixes = process.argv.slice(2);
if (prefixes.length === 0) prefixes.push(...DEFAULT_PREFIXES);

const ctx = loadContext();
const workspaceId = ctx.workspaceId;
const pageSize = 200;

const leftovers = {
    clients: [],
    projects: [],
    tags: [],
    entries: [],
    invoices: [],
    webhooks: [],
};

const hasPrefix = (value) => typeof value === "string" && prefixes.some((prefix) => value.startsWith(prefix));
const labelOf = (item) => item?.name ?? item?.description ?? item?.number ?? item?.clientName ?? "";
const summarize = (item) => ({
    id: item?.id,
    label: labelOf(item),
    archived: item?.archived,
    status: item?.status,
});

async function collectPages(fn, base = {}) {
    const items = [];
    for (let page = 1; page <= 50; page += 1) {
        const response = await fn({ ...base, page, "page-size": pageSize });
        const pageItems = Array.isArray(response) ? response : [];
        items.push(...pageItems);
        if (pageItems.length < pageSize) break;
    }
    return items;
}

async function collectOptional(label, fn) {
    try {
        return await fn();
    } catch (error) {
        return { error: `${label}: ${error?.message ?? String(error)}` };
    }
}

function keepMatches(items) {
    return Array.isArray(items) ? items.filter((item) => hasPrefix(labelOf(item))).map(summarize) : items;
}

for (const archived of [false, true]) {
    leftovers.clients.push(
        ...keepMatches(await collectPages((req) => ctx.client.clients.list({ workspaceId, ...req }), { archived })),
    );
    leftovers.projects.push(
        ...keepMatches(await collectPages((req) => ctx.client.projects.list({ workspaceId, ...req }), { archived })),
    );
}

leftovers.tags.push(...keepMatches(await collectPages((req) => ctx.client.tags.list({ workspaceId, ...req }))));

const user = await ctx.client.users.getCurrentUser();
const userId = user?.id;
if (!userId) {
    throw new Error("could not determine current user ID");
}
leftovers.entries.push(
    ...keepMatches(
        await collectPages((req) =>
            ctx.client.timeEntries.listForUser({
                workspaceId,
                userId,
                start: process.env.CLOCKIFY_CLEANUP_START ?? "2020-01-01T00:00:00.000Z",
                end: process.env.CLOCKIFY_CLEANUP_END ?? "2030-01-01T00:00:00.000Z",
                ...req,
            }),
        ),
    ),
);

const invoices = await collectOptional("invoices", async () => {
    const response = await ctx.client.invoices.list({ workspaceId });
    return Array.isArray(response) ? response : response?.invoices ?? [];
});
leftovers.invoices = keepMatches(invoices);

const webhooks = await collectOptional("webhooks", async () => {
    const response = await ctx.client.webhooks.list({ workspaceId });
    return Array.isArray(response) ? response : response?.webhooks ?? [];
});
leftovers.webhooks = keepMatches(webhooks);

const total = Object.values(leftovers).reduce(
    (sum, items) => sum + (Array.isArray(items) ? items.length : items?.error ? 1 : 0),
    0,
);

console.log(JSON.stringify({ prefixes, total, leftovers }, null, 2));
process.exitCode = total === 0 ? 0 : 1;
