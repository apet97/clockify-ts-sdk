import { describe, expect, it, vi } from "vitest";

import { MissingCredentialsError, createCurrentUserIdMemo, loadContext } from "../src/client.js";
import { isDirectInvocation } from "../src/index.js";

describe("MCP package contract", () => {
    it("does not throw on missing env; defers to a setup_required context", () => {
        const ctx = loadContext({});
        expect(ctx.setupError).toBeInstanceOf(MissingCredentialsError);
        // The renamed package and bin still appear in the missing-env guidance.
        expect(ctx.setupError?.message).toMatch(/@clockify115\/mcp-server/);
        expect(ctx.setupError?.message).toMatch(/clockify115-mcp/);
        // The throw is deferred to first client/workspace access.
        expect(() => ctx.client).toThrow(MissingCredentialsError);
        expect(() => ctx.workspaceId).toThrow(MissingCredentialsError);
    });

    it("recognizes the installed mcp bin name as direct invocation", () => {
        expect(isDirectInvocation("/usr/local/bin/clockify115-mcp")).toBe(true);
        expect(isDirectInvocation("/tmp/index.js")).toBe(true);
        expect(isDirectInvocation("/usr/local/bin/clockify-mcp")).toBe(false);
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

    it("resolves to \"\" when the user has no id (matches the prior inline fallback)", async () => {
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
    });

    it("allows a configured loopback test/mock CLOCKIFY_BASE_URL", () => {
        const ctx = loadContext({ ...goodEnv, CLOCKIFY_BASE_URL: "http://127.0.0.1:19091/api/v1" });
        expect(ctx.workspaceId).toBe("ws");
    });

    it("allows an arbitrary host only when allowInsecureBaseUrl is opted in", () => {
        // Strict by default: the arbitrary host is rejected.
        expect(() =>
            loadContext({ ...goodEnv, CLOCKIFY_BASE_URL: "https://my-proxy.example.com/api/v1" }),
        ).toThrow(/not an allowlisted Clockify host/);

        // With the explicit opt-in it is accepted (and warns).
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const ctx = loadContext(
            { ...goodEnv, CLOCKIFY_BASE_URL: "https://my-proxy.example.com/api/v1" },
            { allowInsecureBaseUrl: true },
        );
        expect(ctx.workspaceId).toBe("ws");
        warnSpy.mockRestore();
    });
});
