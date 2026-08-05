import { createClockifyClient } from "../wrapper/create-client.js";

const client = createClockifyClient();
const ws = "65b382b606de527a7ee2b60e";

let total = 0;
let sawEmpty = false;
for (let page = 1; page <= 60 && !sawEmpty; page++) {
    const { data, rawResponse } = await client.projects
        .list({ workspaceId: ws, page, "page-size": 3 })
        .withRawResponse();
    const items = Array.isArray(data) ? data.length : 0;
    const lp = rawResponse.headers.get("Last-Page");
    total += items;
    if (page >= 38 || items === 0) console.log(`page=${page} items=${items} Last-Page=${JSON.stringify(lp)}`);
    if (items === 0) sawEmpty = true;
}
console.log("total projects (size-3 walk to empty):", total);
