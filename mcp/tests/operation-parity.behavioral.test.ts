import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const parityPath = path.join(repoRoot, "docs", "operation-parity.json");
const wrapperEsm = path.join(repoRoot, "wrapper", "dist", "esm", "create-client.js");

const parity = JSON.parse(readFileSync(parityPath, "utf8")) as {
    operations: Array<{ sdk: string | null; tsMcp: string | null }>;
};

function fakeContext(): Context {
    return {
        workspaceId: "ws-1",
        client: { users: { getCurrentUser: async () => ({ id: "u1", email: "mock@example.com", name: "Mock" }) } } as never,
    };
}

describe("operation-parity tsMcp stamps resolve to real registered tools", () => {
    it("every non-null tsMcp stamp is in listTools()", async () => {
        const server = buildServer(fakeContext());
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        const client = new Client({ name: "parity-tsmcp", version: "0.0.0" });
        await client.connect(clientTransport);

        try {
            const registered = new Set((await client.listTools()).tools.map((tool) => tool.name));
            const stamps = [...new Set(parity.operations.map((op) => op.tsMcp).filter((stamp): stamp is string => Boolean(stamp)))];
            expect(stamps.filter((stamp) => !registered.has(stamp))).toEqual([]);
        } finally {
            await client.close();
            await server.close();
        }
    });
});

const sdkDescribe = existsSync(wrapperEsm) ? describe : describe.skip;

sdkDescribe("operation-parity sdk stamps resolve to real client methods", () => {
    it("every non-null sdk stamp is a function on a fake-fetch client", async () => {
        const { createClockifyClient } = (await import(pathToFileURL(wrapperEsm).href)) as {
            createClockifyClient: (opts: { apiKey: string; fetch?: typeof fetch }) => Record<string, unknown>;
        };
        const client = createClockifyClient({
            apiKey: "fake-key-for-typeof-walk",
            fetch: (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
        });

        const stamps = [...new Set(parity.operations.map((op) => op.sdk).filter((stamp): stamp is string => Boolean(stamp)))];
        const unresolved: string[] = [];
        for (const stamp of stamps) {
            const parts = stamp.split(".");
            const groupName = parts[1];
            const methodName = parts[2];
            if (parts.length !== 3 || parts[0] !== "client" || !groupName || !methodName) {
                unresolved.push(`${stamp} (unexpected shape)`);
                continue;
            }
            const group = client[groupName];
            const method = group && typeof group === "object" ? (group as Record<string, unknown>)[methodName] : undefined;
            if (typeof method !== "function") unresolved.push(stamp);
        }
        expect(unresolved).toEqual([]);
    });
});
