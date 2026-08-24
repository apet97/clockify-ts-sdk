import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";
import {
    ALWAYS_ADVERTISED_TOOLS,
    DISCOVERY_ENV_VAR,
    MAX_TOOLS_PER_SEARCH,
    MIN_REGISTERED_TOOLS,
    SEARCH_TOOL_NAME,
    discoveryModeEnabled,
} from "../src/tools/discovery.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
    process.env[DISCOVERY_ENV_VAR] = "";
});

async function connect(): Promise<Client> {
    const ctx = { workspaceId: "ws-1", client: {} as never } as Context;
    const server = buildServer(ctx, { discoveryEnv: process.env });
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

function envelope(res: unknown): Record<string, unknown> {
    const text = (res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}";
    return JSON.parse(text) as Record<string, unknown>;
}

async function listNames(client: Client): Promise<string[]> {
    return (await client.listTools()).tools.map((tool) => tool.name);
}

describe("discovery mode is off by default", () => {
    it("advertises the whole surface and hides the search tool", async () => {
        const client = await connect();
        const names = await listNames(client);

        expect(names).toContain("clockify_projects_list");
        expect(names.length).toBeGreaterThan(150);
        // Registered so every gate reads one surface, but disabled — so it is
        // neither listed nor callable until discovery mode is on.
        expect(names).not.toContain(SEARCH_TOOL_NAME);
        await expect(
            client.callTool({
                name: SEARCH_TOOL_NAME,
                arguments: { query: "projects" },
            }),
        ).rejects.toThrow(/disabled/i);
    });

    it.each([undefined, "", "0", "false", "FALSE", "  "])("treats %o as off", (value) => {
        const env = value === undefined ? {} : { [DISCOVERY_ENV_VAR]: value };
        expect(discoveryModeEnabled(env)).toBe(false);
    });

    it.each(["1", "true", "yes", "on"])("treats %o as on", (value) => {
        expect(discoveryModeEnabled({ [DISCOVERY_ENV_VAR]: value })).toBe(true);
    });
});

describe("discovery mode on", () => {
    it("advertises only the workflow tools plus the search tool", async () => {
        process.env[DISCOVERY_ENV_VAR] = "1";
        const names = await listNames(await connect());

        expect(new Set(names)).toEqual(new Set([...ALWAYS_ADVERTISED_TOOLS, SEARCH_TOOL_NAME]));
    });

    it("a hidden tool is not callable, not merely unlisted", async () => {
        // The whole point. If disabling only filtered `tools/list` while the
        // handler still ran, discovery would be cosmetic over an open surface.
        process.env[DISCOVERY_ENV_VAR] = "1";
        const client = await connect();

        await expect(
            client.callTool({ name: "clockify_projects_list", arguments: {} }),
        ).rejects.toThrow(/clockify_projects_list disabled/i);
    });

    it("a search loads its matches and makes them callable", async () => {
        process.env[DISCOVERY_ENV_VAR] = "1";
        const client = await connect();

        const body = envelope(
            await client.callTool({
                name: SEARCH_TOOL_NAME,
                arguments: { query: "list projects" },
            }),
        );
        const loaded = (body.data as { loaded: Array<{ tool: string }> }).loaded;

        expect(loaded.map((entry) => entry.tool)).toContain("clockify_projects_list");
        expect(await listNames(client)).toContain("clockify_projects_list");
    });

    it("never loads more than the requested limit", async () => {
        process.env[DISCOVERY_ENV_VAR] = "1";
        const client = await connect();
        const before = (await listNames(client)).length;

        const body = envelope(
            await client.callTool({
                name: SEARCH_TOOL_NAME,
                // Deliberately broad: nearly every tool name contains "list" or
                // "create", so an unbounded search would advertise the surface.
                arguments: { query: "list create update delete", limit: 3 },
            }),
        );

        expect((body.data as { loaded: unknown[] }).loaded).toHaveLength(3);
        expect((await listNames(client)).length).toBe(before + 3);
    });

    it("repeating a search returns the same tools and does not grow the surface", async () => {
        process.env[DISCOVERY_ENV_VAR] = "1";
        const client = await connect();
        const args = { name: SEARCH_TOOL_NAME, arguments: { query: "list projects" } };

        const first = envelope(await client.callTool(args));
        const afterFirst = await listNames(client);
        const second = envelope(await client.callTool(args));

        // Ranking runs over every domain tool, loaded or not, so a query is a
        // stable answer rather than a page of results. Re-running it re-enables
        // tools that are already enabled, which is a no-op.
        expect(second.data).toEqual(first.data);
        expect(await listNames(client)).toEqual(afterFirst);
    });

    it("reports no match rather than loading something unrelated", async () => {
        process.env[DISCOVERY_ENV_VAR] = "1";
        const client = await connect();

        const body = envelope(
            await client.callTool({
                name: SEARCH_TOOL_NAME,
                arguments: { query: "zzzznotarealthing" },
            }),
        );

        expect((body.data as { loaded: unknown[] }).loaded).toHaveLength(0);
        expect(body.next).toEqual([expect.objectContaining({ tool: "clockify_tools_guide" })]);
    });
});

describe("ALWAYS_ADVERTISED_TOOLS tracks the generated manifest", () => {
    it("equals the manifest's workflow group", () => {
        // Drift guard. Adding a workflow tool without listing it here would
        // hide it in discovery mode, which no other gate would notice.
        const manifestPath = fileURLToPath(
            new URL("../../docs/mcp-tool-manifest.json", import.meta.url),
        );
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
            tools: Array<{ name: string; group: string }>;
        };
        const workflow = manifest.tools
            .filter((tool) => tool.group === "workflow")
            .map((tool) => tool.name);

        expect(new Set(ALWAYS_ADVERTISED_TOOLS)).toEqual(new Set(workflow));
    });

    it("has no duplicates and stays sorted", () => {
        expect(new Set(ALWAYS_ADVERTISED_TOOLS).size).toBe(ALWAYS_ADVERTISED_TOOLS.length);
        expect([...ALWAYS_ADVERTISED_TOOLS]).toEqual([...ALWAYS_ADVERTISED_TOOLS].sort());
    });

    it("caps a single search below the advertised surface", () => {
        expect(MAX_TOOLS_PER_SEARCH).toBeLessThan(ALWAYS_ADVERTISED_TOOLS.length);
    });

    it("keeps the fail-closed floor strictly below the surface it guards", () => {
        // The floor catches a renamed or empty registry (reads as zero tools).
        // It is deliberately NOT the exact count, so adding a tool does not
        // hand-move it; exactness is anchored in server.test.ts and
        // tool-manifest.test.ts. It must stay below the pre-search-tool
        // surface (totalTools - 1) or discovery mode false-reds, and close
        // enough that a gutted registry cannot slip under it.
        const manifestPath = fileURLToPath(
            new URL("../../docs/mcp-tool-manifest.json", import.meta.url),
        );
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
            summary: { totalTools: number };
        };

        expect(MIN_REGISTERED_TOOLS).toBeLessThan(manifest.summary.totalTools);
        expect(MIN_REGISTERED_TOOLS).toBeGreaterThanOrEqual(
            Math.floor((manifest.summary.totalTools - 1) * 0.9),
        );
    });
});
