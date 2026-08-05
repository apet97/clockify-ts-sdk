import { createClockifyClient } from "../wrapper/create-client.js";

const client = createClockifyClient();
const ws = "65b382b606de527a7ee2b60e";

// Probe projects.list with a tiny page size across pages, capturing Last-Page.
for (const page of [1, 2, 3, 4, 5]) {
    const { data, rawResponse } = await client.projects
        .list({ workspaceId: ws, page, "page-size": 3 })
        .withRawResponse();
    const lp = rawResponse.headers.get("Last-Page");
    console.log(
        `projects page=${page} size=3 items=${Array.isArray(data) ? data.length : "n/a"} Last-Page=${JSON.stringify(lp)}`,
    );
}

// Out-of-range page with a larger size
{
    const { data, rawResponse } = await client.tags
        .list({ workspaceId: ws, page: 99999, "page-size": 5 })
        .withRawResponse();
    console.log(
        `tags page=99999 size=5 items=${Array.isArray(data) ? data.length : "n/a"} Last-Page=${JSON.stringify(
            rawResponse.headers.get("Last-Page"),
        )}`,
    );
}
