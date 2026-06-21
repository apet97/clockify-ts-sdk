/**
 * Unbounded-walk guard: `reviewPeriod` (clockify_review_week) and
 * `clockify_groups_get` walk `iterAll` with a `maxPages` cap so a backend that
 * keeps returning full pages (the `Last-Page: false` / always-full case, which
 * makes the length heuristic say "more pages" forever) can't spin without end.
 * A fake fetcher that always returns a FULL page is the worst case; the walk
 * must terminate at exactly the cap (1000 page fetches).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

const MAX_PAGES = 1000;
const PAGE_SIZE = 200;

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
    teardown = async () => {};
});

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test-harness", version: "0.0.0" });
    await client.connect(clientTransport);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

// A fetcher that ALWAYS returns a full page (length === requested page-size) so
// the `Last-Page`-absent length heuristic reports "more pages" on every call —
// i.e. it never signals an end on its own. Counts how many times it is called.
function alwaysFullPage(counter: { calls: number }) {
    return async (req: { "page-size"?: number } = {}) => {
        counter.calls += 1;
        const size = req["page-size"] ?? PAGE_SIZE;
        return Array.from({ length: size }, (_, i) => ({ id: `g-${counter.calls}-${i}` }));
    };
}

describe("iterAll maxPages cap stops an unbounded walk", () => {
    it("clockify_review_week terminates at the cap instead of spinning forever", async () => {
        const counter = { calls: 0 };
        const ctx: Context = {
            workspaceId: "ws-1",
            client: {
                users: { getCurrentUser: async () => ({ id: "user-1" }) },
                timeEntries: { listForUser: alwaysFullPage(counter) },
            } as never,
        };
        const client = await connect(ctx);
        const res = await client.callTool({ name: "clockify_review_week", arguments: {} });
        // The call returns (it does not hang) and the walk stopped at the cap.
        expect((res as { isError?: boolean }).isError).toBeFalsy();
        expect(counter.calls).toBe(MAX_PAGES);
    });

    it("clockify_groups_get terminates at the cap when the list never ends", async () => {
        const counter = { calls: 0 };
        const ctx: Context = {
            workspaceId: "ws-1",
            client: {
                userGroups: { list: alwaysFullPage(counter) },
            } as never,
        };
        const client = await connect(ctx);
        // Search for an id no synthetic page contains: the walk exhausts the cap
        // and then reports "not found" rather than looping unbounded.
        const res = await client.callTool({
            name: "clockify_groups_get",
            arguments: { groupId: "does-not-exist" },
        });
        expect(counter.calls).toBe(MAX_PAGES);
        const text = ((res as { content: Array<{ text: string }> }).content[0] ?? { text: "{}" }).text;
        expect(JSON.parse(text).ok).toBe(false);
    });
});
