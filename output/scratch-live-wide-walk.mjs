import { createClockifyClient } from "../wrapper/create-client.js";

const client = createClockifyClient();
const ws = "65b382b606de527a7ee2b60e";

let total = 0;
let sawEmpty = false;
for (let page = 1; page <= 20 && !sawEmpty; page++) {
    const { data, rawResponse } = await client.projects
        .list({ workspaceId: ws, page, "page-size": 200 })
        .withRawResponse();
    const items = Array.isArray(data) ? data.length : 0;
    const lp = rawResponse.headers.get("Last-Page");
    total += items;
    console.log(`page=${page} items=${items} Last-Page=${JSON.stringify(lp)}`);
    if (items < 200) sawEmpty = true;
}
console.log("total projects:", total);

// Time entries with a WIDE window to find their end
const me = await client.users.getCurrentUser();
const now = new Date();
const start = new Date(now.getTime() - 365 * 86400_000).toISOString();
total = 0;
sawEmpty = false;
for (let page = 1; page <= 30 && !sawEmpty; page++) {
    const { data, rawResponse } = await client.timeEntries
        .listForUser({ workspaceId: ws, userId: me.id, start, end: now.toISOString(), page, "page-size": 200 })
        .withRawResponse();
    const items = Array.isArray(data) ? data.length : 0;
    const lp = rawResponse.headers.get("Last-Page");
    total += items;
    console.log(`entries page=${page} items=${items} Last-Page=${JSON.stringify(lp)}`);
    if (items < 200) sawEmpty = true;
}
console.log("total entries:", total);
