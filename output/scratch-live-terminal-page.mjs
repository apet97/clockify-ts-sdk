import { createClockifyClient } from "../wrapper/create-client.js";

const client = createClockifyClient();
const ws = "65b382b606de527a7ee2b60e";

let total = 0;
for (let page = 1; page <= 40; page++) {
    const { data, rawResponse } = await client.projects
        .list({ workspaceId: ws, page, "page-size": 3 })
        .withRawResponse();
    const items = Array.isArray(data) ? data.length : 0;
    const lp = rawResponse.headers.get("Last-Page");
    total += items;
    console.log(`page=${page} items=${items} Last-Page=${JSON.stringify(lp)}`);
    if (items === 0) break;
}
console.log("total projects (size 3 walk):", total);

// Time entries walk with page-size 2 (listForUser may be different)
const me = await client.users.getCurrentUser();
const now = new Date();
const start = new Date(now.getTime() - 30 * 86400_000).toISOString();
for (let page = 1; page <= 30; page++) {
    const { data, rawResponse } = await client.timeEntries
        .listForUser({ workspaceId: ws, userId: me.id, start, end: now.toISOString(), page, "page-size": 2 })
        .withRawResponse();
    const items = Array.isArray(data) ? data.length : 0;
    const lp = rawResponse.headers.get("Last-Page");
    console.log(`entries page=${page} items=${items} Last-Page=${JSON.stringify(lp)}`);
    if (items === 0) break;
}
