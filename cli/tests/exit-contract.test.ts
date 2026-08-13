import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import type { Services } from "../src/commands/types.js";
import { PACKAGE_VERSION } from "../src/generated/version.js";
import { buildProgram, main, resolveFlags } from "../src/index.js";

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

    it("returns 1 for a raw HTTP error already printed with --include-headers", async () => {
        const client = {
            fetch: async () =>
                new Response(JSON.stringify({ message: "missing" }), {
                    status: 404,
                    headers: { "content-type": "application/json", "x-test": "yes" },
                }),
        } as unknown as ClockifyClient;
        const services: Services = {
            loadConfig: () => ({ apiKey: "test", workspaceId: "workspace-1" }),
            buildClient: () => client,
        };

        const code = await main(
            ["node", "clk115", "--json", "api", "GET", "/missing", "--include-headers"],
            services,
        );

        expect(code).toBe(1);
        expect(logged).toHaveLength(1);
        expect(JSON.parse(logged[0] ?? "{}")).toMatchObject({
            status: 404,
            data: { message: "missing" },
        });
        expect(errored).toEqual([]);
    });

    it("returns 1 without duplicate stderr after reporting a partial scheduling publish", async () => {
        const client = {
            scheduling: {
                createRecurring: async () => [{ id: "assignment-1" }],
                publish: async () => {
                    throw new Error("publication rejected");
                },
            },
        } as unknown as ClockifyClient;
        const services: Services = {
            loadConfig: () => ({ apiKey: "test", workspaceId: "workspace-1" }),
            buildClient: () => client,
        };

        const code = await main(
            [
                "node",
                "clk115",
                "--json",
                "scheduling",
                "create",
                "--user",
                "user-1",
                "--project",
                "project-1",
                "--start",
                "2026-06-01T00:00:00Z",
                "--end",
                "2026-06-05T00:00:00Z",
                "--hours-per-day",
                "6",
                "--publish",
            ],
            services,
        );

        expect(code).toBe(1);
        expect(logged).toHaveLength(1);
        expect(JSON.parse(logged[0] ?? "{}")).toMatchObject({
            id: "assignment-1",
            published: false,
            warningCode: "publish_failed",
        });
        expect(errored).toEqual([]);
    });

    it("returns 2 for an invalid --output, like every other bad flag value", async () => {
        // `--output` carries a commander parse-arg validator, so a bad value is
        // a PARSE-time usage error (exit 2, matching docs/cli-contract.json's
        // usageError) rather than the action-site resolveMode throw that used to
        // land in main()'s runtime branch and exit 1. main()'s catch still
        // re-resolves the flags to format it, and resolveFlagsSafe keeps that
        // from throwing a second time.
        vi.stubEnv("CLOCKIFY_API_KEY", "fake-key-for-output-test");
        const code = await main([
            "node",
            "clk115",
            "--output",
            "totally-bogus",
            "status",
        ]);
        expect(code).toBe(2);
        expect(errored.join("\n")).toMatch(/totally-bogus|table, json, or ndjson/i);
    });

    it("resolveFlags still rejects an invalid output mode set programmatically", () => {
        // Defence-in-depth path: parse-time validation cannot see a value that
        // never went through argv.
        const program = buildProgram();
        program.setOptionValue("output", "xml");
        expect(() => resolveFlags(program)).toThrow(/Unsupported output mode/);
    });

    it("returns 0 for version output", async () => {
        const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        try {
            const code = await main(["node", "clk115", "--version"]);
            expect(code).toBe(0);
            const written = writeSpy.mock.calls.map((args) => String(args[0])).join("");
            expect(written).toContain(PACKAGE_VERSION);
        } finally {
            writeSpy.mockRestore();
        }
    });
});
