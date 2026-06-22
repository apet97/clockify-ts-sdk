// Exercises the `clockify-workflow-plan` prompt END TO END: the registered
// callback body (mcp/src/prompts.ts, lines 14-35) is otherwise never invoked
// by a test. We stand up a bare McpServer with only the prompts registered,
// connect a real MCP client over an in-memory transport, then drive
// listPrompts/getPrompt so the prompt handler actually runs and renders its
// message content (both sides of the `goal?.trim() || "not specified"` arm).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it } from "vitest";

import { registerClockifyPrompts } from "../src/prompts.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

async function connect(): Promise<Client> {
    const server = new McpServer(
        { name: "prompt-test-harness", version: "0.0.0" },
        { capabilities: { prompts: {} } },
    );
    registerClockifyPrompts(server);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "prompt-test-client", version: "0.0.0" });
    await client.connect(clientTransport);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function promptText(
    messages: { role: string; content: { type: string; text?: string } }[],
): string {
    const first = messages[0];
    expect(first.role).toBe("user");
    expect(first.content.type).toBe("text");
    return first.content.text ?? "";
}

describe("clockify-workflow-plan prompt", () => {
    it("advertises the prompt with title, description, and an optional goal arg", async () => {
        const client = await connect();
        const { prompts } = await client.listPrompts();
        const plan = prompts.find((p) => p.name === "clockify-workflow-plan");
        expect(plan).toBeDefined();
        expect(plan?.title).toBe("Clockify Workflow Plan");
        expect(plan?.description).toMatch(/Plan a safe Clockify workflow/i);
        // `goal` is the single optional argument.
        const goalArg = plan?.arguments?.find((a) => a.name === "goal");
        expect(goalArg).toBeDefined();
        expect(goalArg?.required ?? false).toBe(false);
    });

    it("renders the supplied goal and the standing safety guidance", async () => {
        const client = await connect();
        const result = await client.getPrompt({
            name: "clockify-workflow-plan",
            arguments: { goal: "Log 2h of design work on the Acme project today" },
        });
        const text = promptText(result.messages);
        expect(text).toContain("Goal: Log 2h of design work on the Acme project today");
        // The body's standing instructions must survive rendering.
        expect(text).toContain("clockify_status");
        expect(text).toContain("dry_run");
        expect(text).toMatch(/recovery code/i);
    });

    it("trims surrounding whitespace from the goal before rendering", async () => {
        const client = await connect();
        const result = await client.getPrompt({
            name: "clockify-workflow-plan",
            arguments: { goal: "  Reconcile last week  " },
        });
        const text = promptText(result.messages);
        expect(text).toContain("Goal: Reconcile last week\n");
    });

    it("falls back to 'not specified' when no goal is provided", async () => {
        const client = await connect();
        // The argsSchema makes `arguments` itself required (an object), even though
        // `goal` within it is optional — pass an empty args object to omit goal.
        const result = await client.getPrompt({ name: "clockify-workflow-plan", arguments: {} });
        const text = promptText(result.messages);
        expect(text).toContain("Goal: not specified");
    });

    it("falls back to 'not specified' for a whitespace-only goal", async () => {
        const client = await connect();
        const result = await client.getPrompt({
            name: "clockify-workflow-plan",
            arguments: { goal: "   " },
        });
        const text = promptText(result.messages);
        expect(text).toContain("Goal: not specified");
    });
});
