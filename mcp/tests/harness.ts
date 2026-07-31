/**
 * Shared server-connection harness for the MCP test suites.
 *
 * ~53 test files carry a byte-identical `connect(ctx)` (buildServer +
 * InMemoryTransport linked pair + module-level teardown) and ~32 a local
 * `envelope()` JSON parser. New tests should use these exports instead of
 * copying the pattern again; existing files migrate opportunistically in
 * cleanup commits — no big-bang rewrite.
 *
 * Usage:
 * ```ts
 * import { connectServer, envelope } from "./harness.js";
 *
 * let close = async () => {};
 * afterEach(async () => close());
 *
 * const { client, close: c } = await connectServer(ctx);
 * close = c;
 * const res = await client.callTool({ name: "clockify_tags_list", arguments: {} });
 * expect(envelope(res).ok).toBe(true);
 * ```
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

/** Build the MCP server over `ctx` and connect an in-memory client to it. */
export async function connectServer(
    ctx: Context,
): Promise<{ client: Client; close: () => Promise<void> }> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test-harness", version: "0.0.0" });
    await client.connect(clientTransport);
    return {
        client,
        close: async () => {
            await client.close();
            await server.close();
        },
    };
}

/** Parse the JSON envelope out of a callTool result's first content block. */
export function envelope(res: unknown): Record<string, unknown> {
    const text = (res as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? "{}";
    return JSON.parse(text) as Record<string, unknown>;
}
