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

    it("returns 2 and a JSON envelope for a SUBCOMMAND usage error", async () => {
        // exitOverride() must reach subcommands, not just the root: `tags list
        // --limit 0` is rejected by the subcommand's parseIntArg parser. Before the
        // recursive override the child still had _exitCallback=null and called
        // process.exit(1), bypassing both the exit-2 contract and this JSON envelope.
        const code = await main(["node", "clk115", "--json", "tags", "list", "--limit", "0"]);

        expect(code).toBe(2);
        const payload = JSON.parse(errored[errored.length - 1] ?? "{}") as {
            ok?: boolean;
            code?: string;
            error?: string;
        };
        expect(payload).toMatchObject({ ok: false, code: "invalid_request" });
        expect(payload.error).toMatch(/positive integer/i);
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

    it("reports an invalid --output without throwing an uncaught exception", async () => {
        // An invalid --output makes the happy-path resolveMode throw at the
        // action site (caught + reported). main()'s own catch block then
        // re-resolves the flags to format that error — which previously threw
        // AGAIN on the same bad --output and escaped as an uncaught rejection.
        // It must instead resolve to a clean non-zero exit code. A throwaway
        // resolveMode throws before status reaches the wire.
        vi.stubEnv("CLOCKIFY_API_KEY", "fake-key-for-output-test");
        const promise = main([
            "node",
            "clk115",
            "--output",
            "totally-bogus",
            "status",
        ]);
        await expect(promise).resolves.toBeGreaterThan(0);
        // The fall-back reporter still surfaces the underlying error message.
        expect(errored.join("\n")).toMatch(/totally-bogus|table, json, or ndjson/i);
    });

    it("returns 0 for version output", async () => {
        const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        try {
            const code = await main(["node", "clk115", "--version"]);
            expect(code).toBe(0);
            const written = writeSpy.mock.calls.map((args) => String(args[0])).join("");
            expect(written).toContain("0.2.0");
        } finally {
            writeSpy.mockRestore();
        }
    });
});
