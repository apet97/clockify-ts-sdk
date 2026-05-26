/**
 * Live sandbox tests for @clockify/mcp-server. Connects to a real
 * Clockify workspace via the same `loadContext()` + `buildServer()`
 * path that the stdio bin uses, but pipes the MCP transport through
 * `InMemoryTransport.createLinkedPair()` so the assertions can run
 * inside vitest without spawning a child process.
 *
 * Gated on `CLOCKIFY_API_KEY` + `CLOCKIFY_WORKSPACE_ID`; without
 * them the suite skips cleanly. Mirrors `wrapper/tests/sandbox.test.ts`
 * and `cli/tests/sandbox.test.ts` so GitHub-hosted CI runners (which
 * intentionally don't get production credentials) keep passing.
 *
 * Coverage is read-only smoke for every list tool plus a single
 * create+delete round-trip on tags (the cheapest mutable resource —
 * no nested objects or downstream cleanup needed).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";
import { loadContext } from "../src/client.js";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
const liveSandboxAvailable = Boolean(apiKey && workspaceId);

const describeLive = liveSandboxAvailable ? describe : describe.skip;

if (!liveSandboxAvailable) {
    console.warn(
        "[sandbox.test] CLOCKIFY_API_KEY and/or CLOCKIFY_WORKSPACE_ID not set in env; MCP live tests skipped.",
    );
}

type EnvelopeOk = { ok: true; action: string; data: unknown; meta?: Record<string, unknown> };
type EnvelopeErr = { ok: false; action: string; error: { message: string; code?: string } };
type Envelope = EnvelopeOk | EnvelopeErr;

describeLive("@clockify/mcp-server live sandbox", () => {
    let teardown: () => Promise<void> = async () => {};

    afterEach(async () => {
        await teardown();
        teardown = async () => {};
    });

    async function connect(): Promise<Client> {
        // loadContext reads CLOCKIFY_API_KEY + CLOCKIFY_WORKSPACE_ID
        // from process.env, the exact path the stdio bin uses, so any
        // env-loading regression surfaces in this test.
        const ctx = loadContext();
        const server = buildServer(ctx);
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        const client = new Client({ name: "sandbox-test", version: "0.0.0" });
        await client.connect(clientTransport);
        teardown = async () => {
            await client.close();
            await server.close();
        };
        return client;
    }

    function parse(res: unknown): Envelope {
        const content = (res as { content?: unknown }).content;
        const text = (content as Array<{ type: string; text: string }> | undefined)?.[0]?.text ?? "";
        return JSON.parse(text) as Envelope;
    }

    it("clockify_status returns the canonical envelope and pinned workspace", async () => {
        const client = await connect();
        const res = await client.callTool({ name: "clockify_status", arguments: {} });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env.ok).toBe(true);
        if (!env.ok) return; // narrow
        const data = env.data as { workspaceId?: string; user?: { id?: string; email?: string } };
        expect(data.workspaceId).toBe(workspaceId);
        expect(typeof data.user?.id).toBe("string");
    }, 20_000);

    it("clockify_clients_list returns a paginated envelope", async () => {
        const client = await connect();
        const res = await client.callTool({
            name: "clockify_clients_list",
            arguments: { page: 1, pageSize: 5 },
        });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env.ok).toBe(true);
        if (!env.ok) return;
        expect(Array.isArray(env.data)).toBe(true);
        expect(env.meta?.page).toBe(1);
    }, 20_000);

    it("clockify_projects_list returns a paginated envelope", async () => {
        const client = await connect();
        const res = await client.callTool({
            name: "clockify_projects_list",
            arguments: { page: 1, pageSize: 5 },
        });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env.ok).toBe(true);
        if (!env.ok) return;
        expect(Array.isArray(env.data)).toBe(true);
    }, 20_000);

    it("clockify_tags_list returns a paginated envelope", async () => {
        const client = await connect();
        const res = await client.callTool({
            name: "clockify_tags_list",
            arguments: { page: 1, pageSize: 5 },
        });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env.ok).toBe(true);
        if (!env.ok) return;
        expect(Array.isArray(env.data)).toBe(true);
    }, 20_000);

    it("clockify_entries_list returns the current user's entries", async () => {
        const client = await connect();
        const res = await client.callTool({
            name: "clockify_entries_list",
            arguments: { pageSize: 5 },
        });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env.ok).toBe(true);
        if (!env.ok) return;
        expect(Array.isArray(env.data)).toBe(true);
    }, 20_000);

    it("clockify_tags_create + delete round-trips against real Clockify", async () => {
        const client = await connect();
        const slug = `mcp-sandbox-${Date.now()}`;

        const createRes = await client.callTool({
            name: "clockify_tags_create",
            arguments: { name: slug },
        });
        expect(createRes.isError).toBeFalsy();
        const created = parse(createRes);
        expect(created.ok).toBe(true);
        if (!created.ok) throw new Error("tag create envelope was not ok");
        const tagId = (created.data as { id?: string }).id;
        expect(typeof tagId).toBe("string");

        // Listing should surface the just-created tag (within the
        // first page; the sandbox workspace has bounded tag count).
        const listRes = await client.callTool({
            name: "clockify_tags_list",
            arguments: { page: 1, pageSize: 200, name: slug },
        });
        const listEnv = parse(listRes);
        expect(listEnv.ok).toBe(true);
        if (listEnv.ok) {
            const tags = listEnv.data as Array<{ id?: string; name?: string }>;
            expect(tags.some((t) => t.id === tagId)).toBe(true);
        }

        // Mandatory cleanup — pair every create with a delete per the
        // sandbox-workspace contract. The MCP doesn't expose a tag
        // delete tool yet (only first-slice CRUD pairs are wired), so
        // we reach through the context's underlying SDK client. This
        // keeps the workspace clean even when the upstream MCP surface
        // doesn't yet have a paired delete.
        const ctx = loadContext();
        await ctx.client.tags.delete({ workspaceId: workspaceId!, tagId: tagId! });
    }, 30_000);
});
