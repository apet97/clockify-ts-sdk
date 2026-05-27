import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { main } from "../src/index.js";
import { createMockClockifyServer, type MockClockifyServer } from "../../scripts/mock-clockify-server.mjs";

let mock: MockClockifyServer;
let baseUrl: string;
let logged: string[];
let errored: string[];
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
    mock = createMockClockifyServer();
    baseUrl = await mock.listen();
    logged = [];
    errored = [];
    vi.stubEnv("CLOCKIFY_API_KEY", "mock");
    vi.stubEnv("CLOCKIFY_WORKSPACE_ID", mock.workspaceId);
    vi.stubEnv("CLOCKIFY_BASE_URL", baseUrl);
    logSpy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
        logged.push(String(msg ?? ""));
    });
    errorSpy = vi.spyOn(console, "error").mockImplementation((msg?: unknown) => {
        errored.push(String(msg ?? ""));
    });
});

afterEach(async () => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
    await mock.close();
});

async function runCli(...args: string[]) {
    const code = await main(["node", "clk115", "--json", ...args]);
    const stdout = logged[logged.length - 1] ?? "";
    const stderr = errored[errored.length - 1] ?? "";
    return { code, stdout, stderr };
}

describe("CLI mock Clockify server", () => {
    it("prints status JSON through CLOCKIFY_BASE_URL", async () => {
        const result = await runCli("status");

        expect(result.code).toBe(0);
        const payload = JSON.parse(result.stdout) as { workspaceId?: string; userId?: string };
        expect(payload.workspaceId).toBe(mock.workspaceId);
        expect(payload.userId).toBe(mock.userId);
    });

    it("prints tag rows through --base-url", async () => {
        vi.stubEnv("CLOCKIFY_BASE_URL", "");

        const result = await runCli("--base-url", baseUrl, "tags", "list", "--limit", "2");

        expect(result.code).toBe(0);
        const payload = JSON.parse(result.stdout) as Array<{ name?: string }>;
        expect(payload.map((row) => row.name)).toContain("Deep Work");
    });
});
