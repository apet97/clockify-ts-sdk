import { collectPagedList, pageWithMeta } from "../mcp/src/tools/paging.js";
import { iterPages } from "../wrapper/iter.js";

// Scenario: server always answers with Last-Page: false and an EMPTY page
// (misbehaving/inconsistent backend). SDK iterPages stops at the first empty
// page; MCP collectPagedList keeps going.
function emptyPageFetch(headerValue) {
    let n = 0;
    const fetcher = () => {
        n += 1;
        const headers = new Headers();
        headers.set("Last-Page", headerValue);
        const response = new Response(JSON.stringify([]), { status: 200, headers });
        const rawResponse = {
            data: [],
            rawResponse: { headers },
        };
        return {
            then: (res) => res(rawResponse.data),
            withRawResponse: async () => rawResponse,
        };
    };
    return { fetcher, count: () => n };
}

// --- SDK iterPages ---
{
    const { fetcher, count } = emptyPageFetch("false");
    const pages = [];
    for await (const page of iterPages(fetcher, {}, { pageSize: 50 })) {
        pages.push(page.page);
    }
    console.log("SDK iterPages: pages walked before stop:", pages.join(","), "| fetches:", count());
}

// --- MCP collectPagedList ---
{
    const { fetcher, count } = emptyPageFetch("false");
    const rows = await collectPagedList(fetcher, { maxPages: 1000 });
    console.log("MCP collectPagedList: rows:", rows.length, "| fetches:", count());
}

// --- MCP pageWithMeta hasMore semantics ---
{
    const { fetcher } = emptyPageFetch("false");
    const meta = await pageWithMeta(fetcher(), { workspaceId: "w", page: 1, pageSize: 50 });
    console.log("MCP pageWithMeta (Last-Page:false, empty page): hasMore =", meta.meta.hasMore);
}
