import { describe, expect, it, vi } from "vitest";

import { createClockifyClient } from "../create-client.js";
import { _resetWarnOnceForTests } from "../deprecation.js";
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

describe("Workspace ensure helpers", () => {
    /** Mock that returns a list (GET) or a created record (POST/other). */
    function ensureFetch(listBody: unknown, createBody: unknown): ReturnType<typeof vi.fn> {
        return vi.fn(async (_input: unknown, init?: { method?: string }) => {
            const method = (init?.method ?? "GET").toUpperCase();
            const body = method === "GET" ? listBody : createBody;
            return new Response(JSON.stringify(body), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        });
    }

    it("ensureTag reuses an existing tag by name (case-insensitive, no create)", async () => {
        const fetchMock = ensureFetch([{ id: "tg_1", name: "Acme" }], { id: "tg_new", name: "acme" });
        const ws = createClockifyClient({ apiKey: "test", fetch: fetchMock as typeof fetch }).workspace("ws-e");
        const result = await ws.ensureTag("acme");
        expect(result.created).toBe(false);
        expect(result.id).toBe("tg_1");
        expect(firstUrl(fetchMock)).toContain("/workspaces/ws-e/tags");
    });

    it("ensureProject creates when no match exists", async () => {
        const fetchMock = ensureFetch([], { id: "p_new", name: "Launch" });
        const ws = createClockifyClient({ apiKey: "test", fetch: fetchMock as typeof fetch }).workspace("ws-e");
        const result = await ws.ensureProject("Launch");
        expect(result.created).toBe(true);
        expect(result.entity.name).toBe("Launch");
    });

    it("ensureClient creates via the body envelope when missing", async () => {
        const fetchMock = ensureFetch([], { id: "c_new", name: "New Co" });
        const ws = createClockifyClient({ apiKey: "test", fetch: fetchMock as typeof fetch }).workspace("ws-e");
        const result = await ws.ensureClient("New Co");
        expect(result.created).toBe(true);
        expect(result.id).toBe("c_new");
    });
});

describe("Workspace iterators", () => {
    /** Mock that serves a different GET page each call, terminating via the
     *  authoritative `Last-Page: true` header on the final page. */
    function pageFetch(pages: unknown[][]): ReturnType<typeof vi.fn> {
        let call = 0;
        return vi.fn(async () => {
            const body = pages[call] ?? [];
            const last = call >= pages.length - 1;
            call += 1;
            return new Response(JSON.stringify(body), {
                status: 200,
                headers: { "content-type": "application/json", "Last-Page": last ? "true" : "false" },
            });
        });
    }

    it("iterProjects walks pages and yields every project (Last-Page header)", async () => {
        const fetchMock = pageFetch([
            [{ id: "p_1", name: "Alpha" }, { id: "p_2", name: "Beta" }],
            [{ id: "p_3", name: "Gamma" }],
        ]);
        const ws = createClockifyClient({ apiKey: "test", fetch: fetchMock as typeof fetch }).workspace("ws-it");

        const names: string[] = [];
        for await (const project of ws.iterProjects({})) {
            names.push((project as { name: string }).name);
        }

        expect(names).toEqual(["Alpha", "Beta", "Gamma"]);
        expect(firstUrl(fetchMock)).toContain("/workspaces/ws-it/projects");
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("iterTags scopes the workspace and stops on the Last-Page header", async () => {
        const fetchMock = pageFetch([[{ id: "tg_1", name: "urgent" }]]);
        const ws = createClockifyClient({ apiKey: "test", fetch: fetchMock as typeof fetch }).workspace("ws-it");

        const ids: string[] = [];
        for await (const tag of ws.iterTags({})) {
            ids.push((tag as { id: string }).id);
        }

        expect(ids).toEqual(["tg_1"]);
        expect(firstUrl(fetchMock)).toContain("/workspaces/ws-it/tags");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("iterClients yields across pages scoped to the workspace", async () => {
        const fetchMock = pageFetch([
            [{ id: "c_1", name: "Acme" }],
            [{ id: "c_2", name: "Globex" }],
        ]);
        const ws = createClockifyClient({ apiKey: "test", fetch: fetchMock as typeof fetch }).workspace("ws-it");

        const ids: string[] = [];
        for await (const c of ws.iterClients({})) {
            ids.push((c as { id: string }).id);
        }

        expect(ids).toEqual(["c_1", "c_2"]);
        expect(firstUrl(fetchMock)).toContain("/workspaces/ws-it/clients");
    });
});

describe("Workspace.entityChangesExperimental stability marker", () => {
    it("returns a stable scoped client and warns at most once outside tests", () => {
        const previousNodeEnv = process.env.NODE_ENV;
        delete process.env.NODE_ENV;
        _resetWarnOnceForTests();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            const ws = createClockifyClient({ apiKey: "test" }).workspace("ws-experimental");

            expect(ws.entityChangesExperimental).toBe(ws.entityChangesExperimental);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0]?.[0]).toContain("entityChangesExperimental");
        } finally {
            warn.mockRestore();
            _resetWarnOnceForTests();
            if (previousNodeEnv === undefined) {
                delete process.env.NODE_ENV;
            } else {
                process.env.NODE_ENV = previousNodeEnv;
            }
        }
    });
});
