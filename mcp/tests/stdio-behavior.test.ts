/**
 * V4: real spawned-stdio MCP behavior, missing-creds path.
 *
 * Every other MCP suite in this directory connects over
 * `InMemoryTransport` (see harness.ts) -- a direct in-process pipe between
 * a hand-built `Context` and `buildServer`. That suite owns deep per-tool
 * behavior and stays the fast, high-volume default; this file does not
 * duplicate it.
 *
 * What InMemoryTransport tests cannot reach is the real process boundary:
 * `mcp/src/index.ts`'s `main()` spawned as an actual child process, reading
 * `CLOCKIFY_API_KEY`/`CLOCKIFY_WORKSPACE_ID` from its own `process.env` via
 * `loadContext()`, talking real MCP JSON-RPC framing over real OS stdio
 * pipes to a real `@modelcontextprotocol/sdk` client. `entrypoint.test.ts`
 * spawns the real process too, but only checks for import side effects --
 * it never sends a `tools/call`. That combination (real spawn + real
 * missing-creds env + a real `tools/call` round trip) was untested before
 * this file; CI's own "packages" job runs every package's tests with both
 * credential env vars blanked, so this exercises the exact env shape CI
 * itself uses.
 *
 * clockify_tools_guide's workflow catalog is pure static content, but its
 * handler (mcp/src/tools/workflows/index.ts) also stamps `ctx.workspaceId`
 * into the receipt's `ids` field for context -- and `ctx.workspaceId` is a
 * getter that throws `MissingCredentialsError` when no credentials are
 * configured (see client.ts's `makeSetupRequiredContext`). That was not
 * visible from a source read (the workflow catalog itself never mentions
 * `ctx`) and only showed up by actually invoking the real tool over a real
 * transport with real missing creds -- exactly the untested seam this file
 * exists to cover. clockify_tools_guide is in `ALWAYS_ADVERTISED_TOOLS`
 * (discovery.ts) precisely because it is meant to be a first-contact,
 * before-setup orientation tool, so failing closed here is plausibly an
 * unintended UX regression, not a deliberate contract -- tracked as
 * backlog item V4-followup-tools-guide-setup-required rather than fixed in
 * this additive test-only item.
 *
 * clockify_docs_search's handler (mcp/src/tools/agent-docs.ts) never
 * touches `ctx` and is the card's named fallback confirming a genuinely
 * credential-free discovery tool exists on this surface. clockify_status
 * is the deliberate contrast case: it does touch `ctx.client`, so it is
 * expected to fail closed with the `setup_required` error code (never a
 * raw exception or an empty response) over the same real transport.
 */
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

const MCP_ENTRY = path.resolve(import.meta.dirname, "../src/index.ts");
const MCP_ROOT = path.resolve(import.meta.dirname, "..");

/** Explicit env with both Clockify credential vars absent -- StdioClientTransport
 *  replaces the child's environment wholesale when `env` is set, so PATH must
 *  be carried through by hand or the spawned `node` cannot resolve `tsx`. */
function envWithoutCreds(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value === undefined) continue;
        if (key === "CLOCKIFY_API_KEY" || key === "CLOCKIFY_WORKSPACE_ID") continue;
        env[key] = value;
    }
    return env;
}

let close: () => Promise<void> = async () => {};

afterEach(async () => {
    await close();
    close = async () => {};
});

async function connectRealStdio(): Promise<Client> {
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: ["--import", "tsx", MCP_ENTRY],
        cwd: MCP_ROOT,
        env: envWithoutCreds(),
    });
    const client = new Client({ name: "stdio-behavior-test", version: "0.0.0" });
    await client.connect(transport);
    close = async () => client.close();
    return client;
}

function envelope(res: unknown): Record<string, unknown> {
    const text = (res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}";
    return JSON.parse(text) as Record<string, unknown>;
}

describe("real spawned-stdio MCP server, missing credentials", () => {
    it("clockify_tools_guide fails closed with setup_required, not a raw exception", async () => {
        // See the file header: this always-advertised orientation tool's
        // static workflow catalog gets no credentials, but its receipt's
        // `ids` field stamps `ctx.workspaceId`, which throws when unset --
        // so the whole call fails closed rather than returning the catalog.
        const client = await connectRealStdio();
        const res = await client.callTool({ name: "clockify_tools_guide", arguments: {} });
        const body = envelope(res) as { ok?: boolean; error?: { code?: string } };
        expect(res.isError).toBe(true);
        expect(body.ok).toBe(false);
        expect(body.error?.code).toBe("setup_required");
    });

    it("clockify_docs_search succeeds with no credentials configured", async () => {
        const client = await connectRealStdio();
        const res = await client.callTool({
            name: "clockify_docs_search",
            arguments: { query: "start a timer" },
        });
        const body = envelope(res) as { ok?: boolean };
        expect(res.isError).not.toBe(true);
        expect(body.ok).toBe(true);
    });

    it("clockify_status fails closed with setup_required, not a raw exception", async () => {
        const client = await connectRealStdio();
        const res = await client.callTool({ name: "clockify_status", arguments: {} });
        const body = envelope(res) as { ok?: boolean; error?: { code?: string } };
        expect(res.isError).toBe(true);
        expect(body.ok).toBe(false);
        expect(body.error?.code).toBe("setup_required");
    });
});
