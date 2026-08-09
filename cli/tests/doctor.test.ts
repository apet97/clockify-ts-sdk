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

    it("renders each check as its own table row, not one stringified JSON cell", async () => {
        const code = await main(["node", "clk115", "doctor"]);

        expect(code).toBe(0);
        const out = logged.join("\n");
        // The per-check recovery hint is the point of the command; through
        // printObject it was buried in a ~560-char `checks` cell.
        expect(out).toMatch(/apiKey[\s\S]*Set CLOCKIFY_API_KEY/);
        expect(out).not.toContain('"checks":{');
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

    it("is not ready when the base URL is outside the host allowlist", async () => {
        vi.stubEnv("CLOCKIFY_API_KEY", "super-secret-clockify-token");
        vi.stubEnv("CLOCKIFY_WORKSPACE_ID", "1234567890abcdef12345678");
        vi.stubEnv("CLOCKIFY_BASE_URL", "https://evil.example.com/api/v1");

        const code = await main(["node", "clk115", "--json", "doctor"]);

        const payload = JSON.parse(logged[logged.length - 1] ?? "{}") as {
            ok?: boolean;
            readiness?: string;
            checks?: { baseUrl?: { ok?: boolean; recovery?: string } };
        };
        // The receipt used to print "The client will reject it" beside
        // `readiness: ready_for_status`, contradicting itself about the very
        // misconfiguration it was displaying.
        expect(payload.checks?.baseUrl?.ok).toBe(false);
        expect(payload.checks?.baseUrl?.recovery).toMatch(/client will reject it/);
        expect(payload.readiness).toBe("configuration_incomplete");
        expect(payload.ok).toBe(false);
        // `doctor` reports rather than gates: it exits 0 even when it finds a
        // problem, exactly as it does for missing credentials above.
        expect(code).toBe(0);
    });

    it("reports region/subdomain source attribution and redacts the subdomain value", async () => {
        vi.stubEnv("CLOCKIFY_API_KEY", "super-secret-clockify-token");
        vi.stubEnv("CLOCKIFY_WORKSPACE_ID", "1234567890abcdef12345678");
        vi.stubEnv("CLOCKIFY_REGION", "eu");
        vi.stubEnv("CLOCKIFY_SUBDOMAIN", "acme-corporation-workspace");

        const code = await main(["node", "clk115", "--json", "doctor"]);

        expect(code).toBe(0);
        const raw = logged[logged.length - 1] ?? "{}";
        expect(raw).not.toContain("acme-corporation-workspace");
        const payload = JSON.parse(raw) as {
            ok?: boolean;
            checks?: {
                region?: { ok?: boolean; status?: string; source?: string; value?: string };
                subdomain?: { ok?: boolean; status?: string; source?: string };
            };
        };
        expect(payload.ok).toBe(true);
        expect(payload.checks?.region).toMatchObject({ ok: true, status: "override", source: "env", value: "eu" });
        expect(payload.checks?.subdomain).toMatchObject({ ok: true, status: "override", source: "env" });
    });

    it("reports an unrecognized region as not-ok with recovery guidance", async () => {
        vi.stubEnv("CLOCKIFY_API_KEY", "super-secret-clockify-token");
        vi.stubEnv("CLOCKIFY_WORKSPACE_ID", "1234567890abcdef12345678");
        vi.stubEnv("CLOCKIFY_REGION", "mars");

        const code = await main(["node", "clk115", "--json", "doctor"]);

        expect(code).toBe(0);
        const payload = JSON.parse(logged[logged.length - 1] ?? "{}") as {
            ok?: boolean;
            checks?: {
                region?: { ok?: boolean; recovery?: string };
                subdomain?: { ok?: boolean; recovery?: string };
            };
        };
        expect(payload.ok).toBe(false);
        expect(payload.checks?.region?.ok).toBe(false);
        expect(payload.checks?.region?.recovery).toMatch(/unrecognized/i);
        // No subdomain configured, so the routing failure must NOT be attached to
        // the subdomain check: pins the `&& isPresent(config.subdomain)` operand.
        expect(payload.checks?.subdomain?.recovery).toBeUndefined();
    });

    it("attaches the routing failure to the subdomain check when a subdomain is set", async () => {
        vi.stubEnv("CLOCKIFY_API_KEY", "super-secret-clockify-token");
        vi.stubEnv("CLOCKIFY_WORKSPACE_ID", "1234567890abcdef12345678");
        vi.stubEnv("CLOCKIFY_REGION", "mars");
        vi.stubEnv("CLOCKIFY_SUBDOMAIN", "acme");

        const code = await main(["node", "clk115", "--json", "doctor"]);
        expect(code).toBe(0);
        const payload = JSON.parse(logged[logged.length - 1] ?? "{}") as {
            checks?: { subdomain?: { ok?: boolean; recovery?: string } };
        };
        expect(payload.checks?.subdomain?.ok).toBe(false);
        expect(payload.checks?.subdomain?.recovery).toMatch(/--subdomain requires --region/);
    });

    // The runtime here is Node 26, so the 22.13 boundary is only reachable with a
    // stubbed process.versions; without the stub the minor-version arm is dead code.
    it("reports Node 22.12 as unsupported (engines.node is >=22.13.0)", async () => {
        vi.stubEnv("CLOCKIFY_API_KEY", "super-secret-clockify-token");
        vi.stubEnv("CLOCKIFY_WORKSPACE_ID", "1234567890abcdef12345678");
        const realVersions = process.versions;
        Object.defineProperty(process, "versions", {
            value: { ...realVersions, node: "22.12.0" },
            configurable: true,
        });
        try {
            const code = await main(["node", "clk115", "--json", "doctor"]);

            expect(code).toBe(0);
            const payload = JSON.parse(logged[logged.length - 1] ?? "{}") as {
                ok?: boolean;
                readiness?: string;
                checks?: { node?: { ok?: boolean; status?: string; recovery?: string } };
            };
            expect(payload.ok).toBe(false);
            expect(payload.readiness).toBe("runtime_unsupported");
            expect(payload.checks?.node).toMatchObject({ ok: false, status: "unsupported" });
            expect(payload.checks?.node?.recovery).toMatch(/22\.13/);
        } finally {
            Object.defineProperty(process, "versions", {
                value: realVersions,
                configurable: true,
            });
        }
    });

    it("reports Node 22.13 as supported", async () => {
        vi.stubEnv("CLOCKIFY_API_KEY", "super-secret-clockify-token");
        vi.stubEnv("CLOCKIFY_WORKSPACE_ID", "1234567890abcdef12345678");
        const realVersions = process.versions;
        Object.defineProperty(process, "versions", {
            value: { ...realVersions, node: "22.13.0" },
            configurable: true,
        });
        try {
            await main(["node", "clk115", "--json", "doctor"]);
            const payload = JSON.parse(logged[logged.length - 1] ?? "{}") as {
                readiness?: string;
                checks?: { node?: { ok?: boolean } };
            };
            expect(payload.checks?.node?.ok).toBe(true);
            expect(payload.readiness).toBe("ready_for_status");
        } finally {
            Object.defineProperty(process, "versions", {
                value: realVersions,
                configurable: true,
            });
        }
    });
});
