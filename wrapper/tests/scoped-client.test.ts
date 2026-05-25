import { describe, expect, it, vi } from "vitest";

import { createClockifyClient } from "../create-client.js";
import { Workspace } from "../scoped-client.js";
import type { ClockifyApi } from "../src/index.js";

/** Helper: extract the URL string from the first fetch call of a mock. */
function firstUrl(mock: ReturnType<typeof vi.fn>): string {
    const calls = mock.mock.calls as unknown as Array<[string | URL | Request, ...unknown[]]>;
    const arg = calls[0]?.[0];
    if (arg == null) return "";
    if (typeof arg === "string") return arg;
    // URL and Request both expose a .url string or .toString() that gives the href.
    return arg instanceof URL ? arg.href : (arg as Request).url;
}

describe("Workspace scoped client", () => {
    it("client.workspace(id) returns a Workspace instance", () => {
        const client = createClockifyClient({ apiKey: "test" });
        const ws = client.workspace("ws-123");
        expect(ws).toBeInstanceOf(Workspace);
        expect(ws.workspaceId).toBe("ws-123");
    });

    it("auto-injects workspaceId on resource method calls", async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response(JSON.stringify([]), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
        );
        const client = createClockifyClient({
            apiKey: "test",
            fetch: fetchMock as typeof fetch,
        });
        const ws = client.workspace("ws-abc");
        // Cast: workspaceId is required by the Fern type but the Proxy injects it.
        await ws.tags.list({} as ClockifyApi.ListTagsRequest);

        expect(firstUrl(fetchMock)).toContain("/workspaces/ws-abc/tags");
    });

    it("preserves the same workspaceId across multiple resource calls", async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response(JSON.stringify([]), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
        );
        const client = createClockifyClient({
            apiKey: "test",
            fetch: fetchMock as typeof fetch,
        });
        const ws = client.workspace("ws-shared");
        await ws.tags.list({} as ClockifyApi.ListTagsRequest);
        await ws.projects.list({} as ClockifyApi.ListProjectsRequest);

        const url1 = firstUrl(fetchMock);
        const url2 = (() => {
            const calls = fetchMock.mock.calls as unknown as Array<
                [string | URL | Request, ...unknown[]]
            >;
            const arg = calls[1]?.[0];
            if (arg == null) return "";
            if (typeof arg === "string") return arg;
            return arg instanceof URL ? arg.href : (arg as Request).url;
        })();
        expect(url1).toContain("/workspaces/ws-shared/tags");
        expect(url2).toContain("/workspaces/ws-shared/projects");
    });

    it("scoped workspaceId wins over an explicit one in the request", async () => {
        // Decision: scoped wins. (If you decide otherwise, update this test.)
        const fetchMock = vi.fn(
            async () =>
                new Response(JSON.stringify([]), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
        );
        const client = createClockifyClient({
            apiKey: "test",
            fetch: fetchMock as typeof fetch,
        });
        const ws = client.workspace("ws-scoped");
        // Cast to bypass TS — we're testing runtime behavior on conflicting input.
        await ws.tags.list({ workspaceId: "ws-explicit" } as ClockifyApi.ListTagsRequest);

        expect(firstUrl(fetchMock)).toContain("/workspaces/ws-scoped/tags");
    });

    it("workspace(id) instances are independent", () => {
        const client = createClockifyClient({ apiKey: "test" });
        const wsA = client.workspace("a");
        const wsB = client.workspace("b");
        expect(wsA.workspaceId).toBe("a");
        expect(wsB.workspaceId).toBe("b");
        expect(wsA).not.toBe(wsB);
    });
});
