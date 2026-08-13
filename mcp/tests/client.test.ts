import { readFileSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ClockifyRegion } from "clockify-sdk-ts-115/create-client";
import { describe, expect, it, vi } from "vitest";


import {
    KNOWN_REGIONS,
    MissingCredentialsError,
    REGIONAL_PREFIXES,
    createCurrentUserIdMemo,
    loadContext,
    warnStartupDiagnostics,
    type LoadContextOptions,
} from "../src/client.js";
import { isDirectInvocation } from "../src/index.js";

describe("MCP package contract", () => {
    it("does not throw on missing env; defers to a setup_required context", () => {
        const ctx = loadContext({});
        expect(ctx.setupError).toBeInstanceOf(MissingCredentialsError);
        // The renamed package and bin still appear in the missing-env guidance.
        expect(ctx.setupError?.message).toMatch(/@apet97\/clockify-mcp-115/);
        expect(ctx.setupError?.message).toMatch(/clockify115-mcp/);
        // The throw is deferred to first client/workspace access.
        expect(() => ctx.client).toThrow(MissingCredentialsError);
        expect(() => ctx.workspaceId).toThrow(MissingCredentialsError);
    });

    // A whitespace-only credential is truthy. Before the trim it slipped past
    // the deferred setup_required path into createClockifyClient, which
    // rejected it with a bare TypeError -- the process died at startup instead
    // of answering setup_required, contradicting the documented contract.
    it.each([
        ["CLOCKIFY_API_KEY", { CLOCKIFY_API_KEY: "   ", CLOCKIFY_WORKSPACE_ID: "ws" }],
        ["CLOCKIFY_WORKSPACE_ID", { CLOCKIFY_API_KEY: "k", CLOCKIFY_WORKSPACE_ID: "   " }],
        ["both", { CLOCKIFY_API_KEY: "   ", CLOCKIFY_WORKSPACE_ID: "\t\n " }],
    ])("treats a whitespace-only %s as absent instead of crashing at startup", (name, env) => {
        const ctx = loadContext(env);
        expect(ctx.setupError).toBeInstanceOf(MissingCredentialsError);
        if (name !== "both") expect(ctx.setupError?.message).toContain(name);
        expect(() => ctx.client).toThrow(MissingCredentialsError);
    });

    it("recognizes only the exact entry module, including an installed-bin symlink", () => {
        const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url));
        const directory = mkdtempSync(path.join(tmpdir(), "clockify-mcp-bin-"));
        const installedBin = path.join(directory, "clockify115-mcp");
        symlinkSync(entry, installedBin);
        try {
            expect(isDirectInvocation(entry)).toBe(true);
            expect(isDirectInvocation(installedBin)).toBe(true);
            expect(isDirectInvocation("/tmp/index.js")).toBe(false);
            expect(isDirectInvocation(undefined)).toBe(false);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
});

describe("createCurrentUserIdMemo (single-flight current-user memo)", () => {
    function fakeClient(getCurrentUser: () => Promise<unknown>) {
        return { users: { getCurrentUser } } as never;
    }

    it("fetches the current user at most once and caches the id", async () => {
        let calls = 0;
        const memo = createCurrentUserIdMemo(
            fakeClient(async () => {
                calls += 1;
                return { id: "user-1" };
            }),
        );
        expect(await memo()).toBe("user-1");
        expect(await memo()).toBe("user-1");
        expect(await memo()).toBe("user-1");
        expect(calls).toBe(1);
    });

    it("dedupes concurrent callers onto a single in-flight fetch", async () => {
        let calls = 0;
        const memo = createCurrentUserIdMemo(
            fakeClient(async () => {
                calls += 1;
                await new Promise((r) => setTimeout(r, 5));
                return { id: "user-9" };
            }),
        );
        const [a, b, c] = await Promise.all([memo(), memo(), memo()]);
        expect([a, b, c]).toEqual(["user-9", "user-9", "user-9"]);
        expect(calls).toBe(1);
    });

    it("does not cache a failed fetch — the next call retries", async () => {
        let calls = 0;
        const memo = createCurrentUserIdMemo(
            fakeClient(async () => {
                calls += 1;
                if (calls === 1) throw new Error("boom");
                return { id: "user-2" };
            }),
        );
        await expect(memo()).rejects.toThrow(/boom/);
        expect(await memo()).toBe("user-2");
        expect(calls).toBe(2);
    });

    it('resolves to "" when the user has no id (matches the prior inline fallback)', async () => {
        const memo = createCurrentUserIdMemo(fakeClient(async () => ({})));
        expect(await memo()).toBe("");
    });
});

describe("MCP base URL allowlist (H1)", () => {
    const goodEnv = { CLOCKIFY_API_KEY: "k", CLOCKIFY_WORKSPACE_ID: "ws" };

    it("rejects a malicious CLOCKIFY_BASE_URL pointing at an arbitrary host", () => {
        expect(() =>
            loadContext({ ...goodEnv, CLOCKIFY_BASE_URL: "https://evil.example.com/api/v1" }),
        ).toThrow(/not an allowlisted Clockify host/);
    });

    it("rejects an http:// CLOCKIFY_BASE_URL (must be HTTPS for non-loopback)", () => {
        expect(() =>
            loadContext({ ...goodEnv, CLOCKIFY_BASE_URL: "http://api.clockify.me/api/v1" }),
        ).toThrow(/https:\/\//);
    });

    it("accepts an unset CLOCKIFY_BASE_URL (default Clockify host)", () => {
        const ctx = loadContext({ ...goodEnv });
        expect(ctx.workspaceId).toBe("ws");
        expect(ctx.routingPosture).toEqual({
            mode: "default",
            subdomainConfigured: false,
        });
    });

    it("treats a blank CLOCKIFY_BASE_URL as unset (default Clockify host, no crash)", () => {
        const ctx = loadContext({ ...goodEnv, CLOCKIFY_BASE_URL: "" });
        expect(ctx.workspaceId).toBe("ws");
    });

    it("treats a whitespace-only CLOCKIFY_BASE_URL as unset (default Clockify host, no crash)", () => {
        const ctx = loadContext({ ...goodEnv, CLOCKIFY_BASE_URL: "   " });
        expect(ctx.workspaceId).toBe("ws");
    });

    it("allows a configured loopback test/mock CLOCKIFY_BASE_URL", () => {
        const ctx = loadContext({ ...goodEnv, CLOCKIFY_BASE_URL: "http://127.0.0.1:19091/api/v1" });
        expect(ctx.workspaceId).toBe("ws");
        expect(ctx.routingPosture).toEqual({
            mode: "base-url",
            host: "127.0.0.1",
            subdomainConfigured: false,
        });
    });

    it("removes the ambiguous insecure-host option name", () => {
        const options: LoadContextOptions = {
            // @ts-expect-error: removed in 1.0; use allowNonClockifyHttpsHost
            allowInsecureBaseUrl: true,
        };
        expect(options).toBeDefined();
    });

    it("allows an arbitrary host only when allowNonClockifyHttpsHost is opted in", () => {
        // Strict by default: the arbitrary host is rejected.
        expect(() =>
            loadContext({ ...goodEnv, CLOCKIFY_BASE_URL: "https://my-proxy.example.com/api/v1" }),
        ).toThrow(/not an allowlisted Clockify host/);

        // With the explicit opt-in it is accepted (and warns).
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const ctx = loadContext(
            { ...goodEnv, CLOCKIFY_BASE_URL: "https://my-proxy.example.com/api/v1" },
            { allowNonClockifyHttpsHost: true },
        );
        expect(ctx.workspaceId).toBe("ws");
        expect(ctx.routingPosture).toEqual({
            mode: "base-url",
            host: "my-proxy.example.com",
            subdomainConfigured: false,
        });
        warnSpy.mockRestore();
    });
});

describe("MCP routing (ROUTE-002/P02-08)", () => {
    const goodEnv = { CLOCKIFY_API_KEY: "k", CLOCKIFY_WORKSPACE_ID: "ws" };

    it("builds a context for the default (no CLOCKIFY_REGION set)", () => {
        const ctx = loadContext({ ...goodEnv });
        expect(ctx.workspaceId).toBe("ws");
        expect(ctx.routingPosture).toEqual({
            mode: "default",
            subdomainConfigured: false,
        });
    });

    // buildRoutingOptions supplies acknowledgeUnconfirmedRegion on the
    // operator's behalf, so an inherited CLOCKIFY_REGION would otherwise route
    // authenticated traffic to an unproven host with nothing on the record.
    it("records a startup notice for an unconfirmed region and stays silent for global", () => {
        expect(loadContext({ ...goodEnv, CLOCKIFY_REGION: "eu" }).startupNotices).toEqual([
            expect.stringContaining('unconfirmed "eu"'),
        ]);
        expect(
            loadContext({ ...goodEnv, CLOCKIFY_REGION: "eu", CLOCKIFY_SUBDOMAIN: "acme" })
                .startupNotices?.[0],
        ).toContain("acme (eu)");
        expect(loadContext({ ...goodEnv, CLOCKIFY_REGION: "global" }).startupNotices).toBeUndefined();
        expect(loadContext({ ...goodEnv }).startupNotices).toBeUndefined();
    });

    it("writes every startup notice to stderr, never stdout", () => {
        const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
        const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
        try {
            warnStartupDiagnostics(loadContext({ ...goodEnv, CLOCKIFY_REGION: "uk" }));
            expect(stderr).toHaveBeenCalledWith(expect.stringContaining('unconfirmed "uk"'));
            expect(stdout).not.toHaveBeenCalled();
        } finally {
            stderr.mockRestore();
            stdout.mockRestore();
        }
    });


    // REGIONAL_PREFIXES / KNOWN_REGIONS are hand-written in BOTH cli/src/client.ts
    // and mcp/src/client.ts, and nothing else compares them -- not to each other,
    // and not to the SDK union that decides which values actually route. The
    // exhaustive Record binds this copy to ClockifyRegion at compile time, so
    // TypeScript reds the test if the SDK adds or drops a profile, and the
    // assertions below red it if this package's copy drifts from that union.
    it("accepts exactly the regions the SDK routes, and no others", () => {
        const sdkRegions: Record<ClockifyRegion, true> = {
            global: true,
            eu: true,
            us: true,
            uk: true,
            au: true,
            developer: true,
        };
        expect([...KNOWN_REGIONS].sort()).toEqual(Object.keys(sdkRegions).sort());
        // The subdomain-capable subset is every region with a regional prefix:
        // "global" has no prefix and "developer" is a distinct documented host.
        expect([...REGIONAL_PREFIXES].sort()).toEqual(
            Object.keys(sdkRegions)
                .filter((region) => region !== "global" && region !== "developer")
                .sort(),
        );
    });

    it("builds a context for an approved CLOCKIFY_REGION and routes to the regional host", async () => {
        // Observe the dispatched host: proves the routing arm (not the
        // default/environment arm) actually reached createClockifyClient.
        const dispatch = vi.fn<typeof fetch>().mockImplementation(
            async () =>
                new Response("{}", {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
        );
        const ctx = loadContext({ ...goodEnv, CLOCKIFY_REGION: "eu" }, { fetch: dispatch });
        expect(ctx.workspaceId).toBe("ws");
        expect(ctx.routingPosture).toEqual({
            mode: "region",
            region: "eu",
            subdomainConfigured: false,
        });
        await ctx.client.users.getCurrentUser();
        const [input, init] = dispatch.mock.calls[0] as Parameters<typeof fetch>;
        expect(new URL(new Request(input, init).url).host).toBe("euc1.clockify.me");
    });

    it("builds a context for CLOCKIFY_REGION + CLOCKIFY_SUBDOMAIN and keeps the regional regular host", async () => {
        // A subdomain profile changes only reports routing; the regular-service
        // host staying regional still proves the routing arm was taken.
        const dispatch = vi.fn<typeof fetch>().mockImplementation(
            async () =>
                new Response("{}", {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
        );
        const ctx = loadContext(
            { ...goodEnv, CLOCKIFY_REGION: "eu", CLOCKIFY_SUBDOMAIN: "acme" },
            { fetch: dispatch },
        );
        expect(ctx.workspaceId).toBe("ws");
        expect(ctx.routingPosture).toEqual({
            mode: "subdomain",
            region: "eu",
            subdomainConfigured: true,
        });
        await ctx.client.users.getCurrentUser();
        const [input, init] = dispatch.mock.calls[0] as Parameters<typeof fetch>;
        expect(new URL(new Request(input, init).url).host).toBe("euc1.clockify.me");
    });

    it("rejects an unrecognized CLOCKIFY_REGION", () => {
        expect(() => loadContext({ ...goodEnv, CLOCKIFY_REGION: "mars" })).toThrow(/unrecognized/i);
    });

    it("rejects CLOCKIFY_SUBDOMAIN without CLOCKIFY_REGION", () => {
        expect(() => loadContext({ ...goodEnv, CLOCKIFY_SUBDOMAIN: "acme" })).toThrow(
            /CLOCKIFY_REGION/,
        );
    });

    it("rejects a conflicting CLOCKIFY_REGION and CLOCKIFY_BASE_URL", () => {
        expect(() =>
            loadContext({
                ...goodEnv,
                CLOCKIFY_REGION: "eu",
                CLOCKIFY_BASE_URL: "https://api.clockify.me/api/v1",
            }),
        ).toThrow(/CLOCKIFY_REGION.*CLOCKIFY_BASE_URL|CLOCKIFY_BASE_URL.*CLOCKIFY_REGION/i);
    });

    it("has no rc-file-reading mechanism at all (process-env-only, no CLI-rc leakage)", () => {
        const source = readFileSync(new URL("../src/client.ts", import.meta.url), "utf8");
        expect(source).not.toMatch(/clockifyrc/i);
        expect(source).not.toMatch(/CLOCKIFY_HOME/);
        expect(source).not.toContain("readFileSync");
    });
});
