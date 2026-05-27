import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { main } from "../src/index.js";

let logged: string[];
let errored: string[];
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    logged = [];
    errored = [];
    logSpy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
        logged.push(String(msg ?? ""));
    });
    errorSpy = vi.spyOn(console, "error").mockImplementation((msg?: unknown) => {
        errored.push(String(msg ?? ""));
    });
    vi.stubEnv("CLOCKIFY_API_KEY", "");
    vi.stubEnv("CLOCKIFY_WORKSPACE_ID", "");
    vi.stubEnv("CLOCKIFY_BASE_URL", "");
});

afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
});

describe("CLI doctor", () => {
    it("prints a safe missing-config receipt without contacting Clockify", async () => {
        const code = await main(["node", "clk115", "--json", "doctor"]);

        expect(code).toBe(0);
        expect(errored).toEqual([]);
        const payload = JSON.parse(logged[logged.length - 1] ?? "{}") as {
            ok?: boolean;
            readiness?: string;
            checks?: { apiKey?: { status?: string }; workspaceId?: { status?: string } };
            next?: string[];
        };
        expect(payload.ok).toBe(false);
        expect(payload.readiness).toBe("configuration_incomplete");
        expect(payload.checks?.apiKey?.status).toBe("missing");
        expect(payload.checks?.workspaceId?.status).toBe("missing");
        expect(payload.next?.join("\n")).toMatch(/CLOCKIFY_API_KEY/);
    });

    it("redacts credentials and reports readiness when config is present", async () => {
        vi.stubEnv("CLOCKIFY_API_KEY", "super-secret-clockify-token");
        vi.stubEnv("CLOCKIFY_WORKSPACE_ID", "1234567890abcdef12345678");
        vi.stubEnv("CLOCKIFY_BASE_URL", "http://127.0.0.1:19091/api/v1");

        const code = await main(["node", "clk115", "--json", "doctor"]);

        expect(code).toBe(0);
        const raw = logged[logged.length - 1] ?? "{}";
        expect(raw).not.toContain("super-secret-clockify-token");
        const payload = JSON.parse(raw) as {
            ok?: boolean;
            readiness?: string;
            checks?: { apiKey?: { source?: string; value?: string }; baseUrl?: { status?: string } };
            next?: string[];
        };
        expect(payload.ok).toBe(true);
        expect(payload.readiness).toBe("ready_for_status");
        expect(payload.checks?.apiKey).toMatchObject({ source: "env", value: "configured (redacted)" });
        expect(payload.checks?.baseUrl?.status).toBe("override");
        expect(payload.next?.join("\n")).toMatch(/base-url/i);
    });
});
