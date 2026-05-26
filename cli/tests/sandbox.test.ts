/**
 * Live sandbox tests for @clockify115/cli. Each test invokes `main()`
 * (the same entrypoint the `clockify115` / `clk115` bin uses) with --json
 * mode, captures stdout, and parses the result against the real
 * Clockify API at the workspace pinned by CLOCKIFY_WORKSPACE_ID.
 *
 * Gated on `CLOCKIFY_API_KEY` + `CLOCKIFY_WORKSPACE_ID`; without
 * them the entire suite skips cleanly (`describe.skip`). Mirrors
 * `wrapper/tests/sandbox.test.ts` so CI machines without credentials
 * (the default for GitHub-hosted runners) keep passing.
 *
 * Tests are deliberately read-only — list smoke against every major
 * command group, plus `clockify115 status`. CRUD round-trips through the
 * CLI surface (e.g. `clk115 webhooks create` → `clk115 webhooks delete`)
 * remain a future addition once a sacrificial webhook URL contract
 * is decided.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { main } from "../src/index.js";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
const liveSandboxAvailable = Boolean(apiKey && workspaceId);

const describeLive = liveSandboxAvailable ? describe : describe.skip;

if (!liveSandboxAvailable) {
    console.warn(
        "[sandbox.test] CLOCKIFY_API_KEY and/or CLOCKIFY_WORKSPACE_ID not set in env; CLI live tests skipped.",
    );
}

describeLive("@clockify115/cli live sandbox", () => {
    let logged: string[] = [];
    let errored: string[] = [];
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
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    async function runCli(...args: string[]): Promise<{ code: number; json: unknown }> {
        // Prepend the conventional argv[0]/argv[1] entries so commander
        // parses everything after them as the command. --json is set on
        // every call so the test can JSON.parse stdout.
        const code = await main(["node", "clk115", "--json", ...args]);
        if (code !== 0) {
            throw new Error(
                `CLI exited with code ${code}; stderr=${errored.join("\n")}; stdout=${logged.join("\n")}`,
            );
        }
        const payload = logged[logged.length - 1] ?? "";
        return { code, json: JSON.parse(payload) };
    }

    it("clk115 status returns workspace + user info", async () => {
        const { json } = await runCli("status");
        const data = json as Record<string, unknown>;
        // status prints a flat object whose `workspaceId` echoes the
        // env we pinned; if this mismatches, the auth layer or
        // env-loading regressed.
        expect(data.workspaceId).toBe(workspaceId);
        expect(typeof data.userId === "string" || data.userId === undefined).toBe(true);
    }, 20_000);

    it("clk115 tags list returns an array (existing surface smoke)", async () => {
        const { json } = await runCli("tags", "list", "--limit", "5");
        expect(Array.isArray(json)).toBe(true);
    }, 20_000);

    it("clk115 projects list returns an array (existing surface smoke)", async () => {
        const { json } = await runCli("projects", "list", "--limit", "5");
        expect(Array.isArray(json)).toBe(true);
    }, 20_000);

    it("clk115 clients list returns an array (existing surface smoke)", async () => {
        const { json } = await runCli("clients", "list", "--limit", "5");
        expect(Array.isArray(json)).toBe(true);
    }, 20_000);

    it("clk115 webhooks list returns an array", async () => {
        const { json } = await runCli("webhooks", "list");
        expect(Array.isArray(json)).toBe(true);
    }, 20_000);

    it("clk115 invoices list returns an array", async () => {
        // Returns an empty array on workspaces without the invoicing
        // feature enabled; the contract is "no 4xx and a JSON array".
        const { json } = await runCli("invoices", "list");
        expect(Array.isArray(json)).toBe(true);
    }, 20_000);

    it("clk115 expenses list returns an array", async () => {
        const { json } = await runCli("expenses", "list", "--limit", "5");
        expect(Array.isArray(json)).toBe(true);
    }, 20_000);

    it("clk115 audit-log search accepts the documented filter shape", async () => {
        // Use a tight 1-day window so we don't pull a lot of rows and
        // we exercise the Clockify ≤31-day window contract by staying
        // well within it. CREATE_PROJECT is a common action so even an
        // empty result is a successful round-trip.
        const end = new Date();
        const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        try {
            const { json } = await runCli(
                "audit-log",
                "search",
                "--start",
                start.toISOString(),
                "--end",
                end.toISOString(),
                "--actions",
                "CREATE_PROJECT,CREATE_TIME_ENTRY",
                "--authors",
                "SYSTEM",
                "--limit",
                "5",
            );
            // Clockify returns either an array or a wrapped envelope;
            // both are valid because the live shape isn't documented.
            expect(json === null || Array.isArray(json) || typeof json === "object").toBe(true);
        } catch (err) {
            // Some workspaces gate audit-log behind a paid plan and
            // respond 403/404. Treat that as a "feature unavailable"
            // skip rather than a CLI bug — the goal here is to confirm
            // the request shape is acceptable, not that the workspace
            // is licensed for audit log access.
            const message = err instanceof Error ? err.message : String(err);
            if (/40[34]/.test(message) || /plan/i.test(message) || /not allowed/i.test(message)) {
                console.warn("[sandbox.test] audit-log gated by plan; skipping shape assertion");
                return;
            }
            throw err;
        }
    }, 20_000);
});
