// behavior-parity drivers: run the SAME scenario through the SDK client, the
// CLI's main(--json), and the MCP server over InMemoryTransport, each
// against a single shared scripts/mock-clockify-server.mjs instance, then
// normalize each surface's very different response shape down to one
// {outcomeClass, errorCode, ids} so a test can compare them directly.
//
// H3 landed SUCCESS-parity only (PR #126). H3-followup-mock-fault-paths adds
// the first domain-level fault: POST tags with a missing name now 400s
// (scripts/mock-clockify-server.mjs), exercised end to end here. Broader
// fault coverage across more resources/shapes is P5 (campaign Phase D)
// territory, same as success-parity's sampling policy.
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
 * `extractIds`, since the raw SDK shape differs per operation. A thrown
 * `ClockifyApiError` is classified by HTTP status through the SDK's own
 * error-codes taxonomy, the same one the MCP layer uses, so `errorCode` is
 * comparable across surfaces.
 */
export async function driveSdk({ baseUrl, workspaceId }, op) {
    const { createClockifyClient } = await import("../../wrapper/create-client.ts");
    const { errorCodeForStatus } = await import("../../wrapper/error-codes.ts");
    const client = createClockifyClient({ apiKey: "mock", environment: baseUrl, maxRetries: 0 });
    try {
        const data = await op(client, workspaceId);
        return { outcomeClass: "ok", errorCode: null, data };
    } catch (err) {
        const statusCode = err?.statusCode;
        return { outcomeClass: "error", errorCode: errorCodeForStatus(statusCode) ?? "error", raw: err };
    }
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
        // `--json` mode's printError (cli/src/output.ts) writes a structured
        // `{ok:false, code, ...}` line to stderr; table mode does not, so a
        // parse failure there is expected, not a bug -- errorCode stays null.
        let errorCode = null;
        try {
            errorCode = JSON.parse(stderr).code ?? null;
        } catch {
            // table-mode stderr is plain text, not JSON -- leave errorCode null.
        }
        return { outcomeClass: "error", errorCode, raw: { code, stdout, stderr } };
    }
    return { outcomeClass: "ok", errorCode: null, data: JSON.parse(stdout) };
}

/**
 * Connect a real MCP Client over InMemoryTransport (mirrors
 * mcp/tests/mock-clockify.test.ts's connect() helper), run `fn(client)`,
 * and always close both ends afterward.
 */
async function withMcpClient({ baseUrl, workspaceId }, fn) {
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
        return await fn(client);
    } finally {
        await client.close();
        await server.close();
    }
}

/** mcp/src/result.ts's errorResult() nests the code under envelope.error.code,
 *  not a top-level envelope.errorCode. */
function normalizeMcpResponse(response) {
    const text = (response.content ?? [])[0]?.text ?? "{}";
    const envelope = JSON.parse(text);
    if (response.isError || envelope.ok !== true) {
        return { outcomeClass: "error", errorCode: envelope.error?.code ?? null, raw: envelope };
    }
    return { outcomeClass: "ok", errorCode: null, data: envelope };
}

/**
 * Drive the MCP server: call `toolName` with `args` and normalize the result.
 */
export async function driveMcp(mockCtx, toolName, args) {
    return withMcpClient(mockCtx, async (client) => {
        const response = await client.callTool({ name: toolName, arguments: args });
        return normalizeMcpResponse(response);
    });
}

/**
 * Drive a guarded (preview_token) MCP write: `dry_run: true` first to get a
 * `confirm_token`, then execute for real with it -- the two-call dance every
 * defineGuardedTool requires. Returns the EXECUTE call's normalized result;
 * throws if the dry_run itself did not come back `ok`.
 */
export async function driveMcpGuarded(mockCtx, toolName, args) {
    return withMcpClient(mockCtx, async (client) => {
        const preview = await client.callTool({ name: toolName, arguments: { ...args, dry_run: true } });
        const previewResult = normalizeMcpResponse(preview);
        if (previewResult.outcomeClass !== "ok") {
            throw new Error(`dry_run for ${toolName} did not succeed: ${JSON.stringify(previewResult)}`);
        }
        const confirmToken = previewResult.data.data.confirm_token;
        const response = await client.callTool({
            name: toolName,
            arguments: { ...args, confirm_token: confirmToken },
        });
        return normalizeMcpResponse(response);
    });
}
