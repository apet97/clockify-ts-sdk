// behavior-parity drivers: run the SAME scenario through the SDK client, the
// CLI's main(--json), and the MCP server over InMemoryTransport, each
// against a single shared scripts/mock-clockify-server.mjs instance, then
// normalize each surface's very different response shape down to one
// {outcomeClass, errorCode, ids} so a test can compare them directly.
//
// H3 (campaign backlog): scoped to SUCCESS-parity only for now.
// scripts/mock-clockify-server.mjs has exactly one fault path -- a generic
// "route not found" 404 for genuinely unimplemented routes -- and no
// domain-level business fault (a missing-resource 404, a validation 400,
// ...) for any route it DOES implement. Manufacturing one would mean
// extending the mock server itself, which is a bigger, separate change
// (touches docs/mock-clockify-contract.json and the mock-contract gate).
// See the H3 PR body / campaign backlog for the filed fault-half follow-up.
//
// Every driver reads its package's TS source directly via the tsx loader
// (`node --import tsx --test`), the same loader
// scripts/check-cli-contract.mjs's checkExamplesCoverage() already uses to
// import cli/src/index.ts. driveSdk imports wrapper/create-client.ts
// directly, so it needs only `make sdk-codegen` (wrapper source reaches into
// wrapper/src/**). driveCli and driveMcp import cli/src/index.ts and
// mcp/src/{client,server}.ts, which both import the SDK by its PACKAGE NAME
// (clockify-sdk-ts-115) -- that resolves through the npm workspace symlink
// to wrapper's built dist/, so those two additionally need
// `npm run build -w clockify-sdk-ts-115` (learned this the same way D2
// learned it: ERR_MODULE_NOT_FOUND for clockify-sdk-ts-115/dist/esm/errors.js
// until the wrapper was built).
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";

import { createMockClockifyServer } from "../mock-clockify-server.mjs";

/**
 * Start a fresh mock Clockify server, run `fn({ baseUrl, workspaceId,
 * userId })` against it, and always close it afterward -- even if `fn`
 * throws.
 */
export async function withMock(fn) {
    const mock = createMockClockifyServer();
    const baseUrl = await mock.listen();
    try {
        return await fn({ mock, baseUrl, workspaceId: mock.workspaceId, userId: mock.userId });
    } finally {
        await mock.close();
    }
}

/** Temporarily set CLOCKIFY_* env vars, run `fn`, then restore the exact
 *  prior values (including "was unset") no matter how `fn` exits. Both the
 *  CLI (cli/src/config.ts's loadConfig) and the MCP server's default env
 *  parameter read process.env, so this is the one seam both surfaces share. */
async function withClockifyEnv({ baseUrl, workspaceId }, fn) {
    const keys = ["CLOCKIFY_API_KEY", "CLOCKIFY_WORKSPACE_ID", "CLOCKIFY_BASE_URL"];
    const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.CLOCKIFY_API_KEY = "mock";
    process.env.CLOCKIFY_WORKSPACE_ID = workspaceId;
    process.env.CLOCKIFY_BASE_URL = baseUrl;
    try {
        return await fn();
    } finally {
        for (const key of keys) {
            if (prior[key] === undefined) delete process.env[key];
            else process.env[key] = prior[key];
        }
    }
}

/**
 * Drive the SDK: `op(client, workspaceId)` returns the raw resource
 * (per-scenario async fn). Result is normalized by the caller's own
 * `extractIds`, since the raw SDK shape differs per operation.
 */
export async function driveSdk({ baseUrl, workspaceId }, op) {
    const { createClockifyClient } = await import("../../wrapper/create-client.ts");
    const client = createClockifyClient({ apiKey: "mock", environment: baseUrl, maxRetries: 0 });
    const data = await op(client, workspaceId);
    return { outcomeClass: "ok", errorCode: null, data };
}

/**
 * Drive the CLI: `main(["node", "clk115", "--json", ...argv])`, capturing
 * the last console.log line as stdout (mirrors cli/tests/mock-clockify.test.ts's
 * runCli helper, minus vitest's vi.spyOn).
 */
export async function driveCli({ baseUrl, workspaceId }, argv) {
    const { main } = await import("../../cli/src/index.ts");
    const logged = [];
    const errored = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (msg) => logged.push(String(msg ?? ""));
    console.error = (msg) => errored.push(String(msg ?? ""));
    let code;
    try {
        code = await withClockifyEnv({ baseUrl, workspaceId }, () =>
            main(["node", "clk115", "--json", ...argv]),
        );
    } finally {
        console.log = originalLog;
        console.error = originalError;
    }
    const stdout = logged[logged.length - 1] ?? "";
    const stderr = errored[errored.length - 1] ?? "";
    if (code !== 0) {
        return { outcomeClass: "error", errorCode: null, raw: { code, stdout, stderr } };
    }
    return { outcomeClass: "ok", errorCode: null, data: JSON.parse(stdout) };
}

/**
 * Drive the MCP server: connect a real Client over InMemoryTransport
 * (mirrors mcp/tests/mock-clockify.test.ts's connect() helper) and call
 * `toolName` with `args`.
 */
export async function driveMcp({ baseUrl, workspaceId }, toolName, args) {
    const { loadContext } = await import("../../mcp/src/client.ts");
    const { buildServer } = await import("../../mcp/src/server.ts");
    const ctx = loadContext({
        CLOCKIFY_API_KEY: "mock",
        CLOCKIFY_WORKSPACE_ID: workspaceId,
        CLOCKIFY_BASE_URL: baseUrl,
    });
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new McpClient({ name: "behavior-parity", version: "0.0.0" });
    await client.connect(clientTransport);
    try {
        const response = await client.callTool({ name: toolName, arguments: args });
        const text = (response.content ?? [])[0]?.text ?? "{}";
        const envelope = JSON.parse(text);
        if (response.isError || envelope.ok !== true) {
            return { outcomeClass: "error", errorCode: envelope.errorCode ?? null, raw: envelope };
        }
        return { outcomeClass: "ok", errorCode: null, data: envelope };
    } finally {
        await client.close();
        await server.close();
    }
}
