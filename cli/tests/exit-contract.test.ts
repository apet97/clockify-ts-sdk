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
});

afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
});

describe("CLI exit and JSON error contract", () => {
    it("returns 2 for commander usage errors", async () => {
        const code = await main(["node", "clk115", "--json", "--definitely-not-a-real-flag"]);

        expect(code).toBe(2);
        const payload = JSON.parse(errored[errored.length - 1] ?? "{}") as {
            ok?: boolean;
            code?: string;
            error?: string;
            retryable?: boolean;
        };
        expect(payload).toMatchObject({ ok: false, code: "invalid_request", retryable: false });
        expect(payload.error).toMatch(/unknown option/i);
    });

    it("returns 1 for runtime configuration errors", async () => {
        const code = await main(["node", "clk115", "--json", "status"]);

        expect(code).toBe(1);
        const payload = JSON.parse(errored[errored.length - 1] ?? "{}") as {
            ok?: boolean;
            code?: string;
            recovery?: string;
        };
        expect(payload.ok).toBe(false);
        expect(payload.code).toBe("auth_or_permission");
        expect(payload.recovery).toMatch(/token|workspace|permissions/i);
    });

    it("returns 0 for version output", async () => {
        const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        try {
            const code = await main(["node", "clk115", "--version"]);
            expect(code).toBe(0);
            const written = writeSpy.mock.calls.map((args) => String(args[0])).join("");
            expect(written).toContain("0.1.0");
        } finally {
            writeSpy.mockRestore();
        }
    });
});
