import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { McpServer } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";

import { createContext } from "../src/client.js";
import { buildServer } from "../src/server.js";
import type { ToolOutcome } from "../src/tool-observability.js";

interface CorrelatedToolOutcome extends ToolOutcome {
    requestId: string;
}

const closeHarnesses: Array<() => Promise<void>> = [];

afterEach(async () => {
    for (const close of closeHarnesses.splice(0).reverse()) await close();
});

describe("MCP tool outcome observability", () => {
    it("emits one bounded redacted outcome per successful and guarded-error invocation", async () => {
        const outcomes: CorrelatedToolOutcome[] = [];
        const server = buildServer(testContext(), {
            toolObserver: (outcome) => {
                outcomes.push({ requestId: "trace-safe", ...outcome });
            },
        });
        const client = await connect(server);

        const success = await client.callTool({
            name: "clockify_docs_search",
            arguments: { query: "private-query-value" },
        });
        expect(success).not.toHaveProperty("isError", true);
        expect(outcomes).toEqual([
            {
                requestId: "trace-safe",
                tool: "clockify_docs_search",
                risk: "read",
                outcome: "success",
                code: "ok",
                retryable: false,
                durationMs: expect.any(Number),
            },
        ]);

        const guardedError = await client.callTool({
            name: "clockify_tags_delete",
            arguments: { tagId: "private-tag-id" },
        });
        expect(guardedError).toHaveProperty("isError", true);
        expect(outcomes.at(-1)).toEqual({
            requestId: "trace-safe",
            tool: "clockify_tags_delete",
            risk: "destructive",
            outcome: "error",
            code: "invalid_request",
            retryable: true,
            durationMs: expect.any(Number),
        });
        expect(outcomes).toHaveLength(2);
        for (const outcome of outcomes) {
            expect(Number.isInteger(outcome.durationMs)).toBe(true);
            expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
            expect(outcome.durationMs).toBeLessThanOrEqual(86_400_000);
        }
        const serialized = JSON.stringify(outcomes);
        expect(serialized).not.toContain("private-query-value");
        expect(serialized).not.toContain("private-tag-id");
        expect(serialized).not.toContain("private-api-key");
        expect(serialized).not.toContain("private-workspace-id");
    });

    it("does not let observer failure alter the tool result", async () => {
        const server = buildServer(testContext(), {
            toolObserver: async () => {
                throw new Error("observability sink unavailable");
            },
        });
        const client = await connect(server);

        const result = await client.callTool({
            name: "clockify_docs_search",
            arguments: { query: "status" },
        });

        expect(result).not.toHaveProperty("isError", true);
        expect(result).toHaveProperty("structuredContent.ok", true);
    });

    it("keeps concurrent request observers isolated", async () => {
        const outcomes: CorrelatedToolOutcome[] = [];
        let arrivals = 0;
        let release!: () => void;
        const bothAuthorized = new Promise<void>((resolve) => {
            release = resolve;
        });
        const authorizeTool = async (): Promise<void> => {
            arrivals += 1;
            if (arrivals === 2) release();
            await bothAuthorized;
        };
        const first = await connect(
            buildServer(testContext(authorizeTool), {
                toolObserver: (outcome) => {
                    outcomes.push({ requestId: "concurrent-1", ...outcome });
                },
            }),
        );
        const second = await connect(
            buildServer(testContext(authorizeTool), {
                toolObserver: (outcome) => {
                    outcomes.push({ requestId: "concurrent-2", ...outcome });
                },
            }),
        );

        await Promise.all([
            first.callTool({
                name: "clockify_docs_search",
                arguments: { query: "private-first-query" },
            }),
            second.callTool({
                name: "clockify_docs_search",
                arguments: { query: "private-second-query" },
            }),
        ]);

        expect(outcomes).toHaveLength(2);
        expect(outcomes.map(({ requestId }) => requestId).sort()).toEqual([
            "concurrent-1",
            "concurrent-2",
        ]);
        expect(outcomes.every(({ tool }) => tool === "clockify_docs_search")).toBe(true);
        const serialized = JSON.stringify(outcomes);
        expect(serialized).not.toContain("private-first-query");
        expect(serialized).not.toContain("private-second-query");
    });
});

function testContext(authorizeTool?: () => Promise<void>) {
    return createContext({
        apiKey: "private-api-key",
        workspaceId: "private-workspace-id",
        ...(authorizeTool === undefined ? {} : { authorizeTool }),
    });
}

async function connect(server: McpServer): Promise<Client> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "tool-observability-test", version: "1.0.0" });
    await client.connect(clientTransport);
    closeHarnesses.push(async () => {
        await client.close();
        await server.close();
    });
    return client;
}
