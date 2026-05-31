import { describe, expect, it, vi } from "vitest";

import { loadContext } from "../src/client.js";
import { isDirectInvocation } from "../src/index.js";

describe("MCP package contract", () => {
    it("uses the renamed package and bin in missing-env guidance", () => {
        expect(() => loadContext({})).toThrow(/@clockify115\/mcp-server/);
        expect(() => loadContext({})).toThrow(/clockify115-mcp/);
    });

    it("recognizes the installed mcp bin name as direct invocation", () => {
        expect(isDirectInvocation("/usr/local/bin/clockify115-mcp")).toBe(true);
        expect(isDirectInvocation("/tmp/index.js")).toBe(true);
        expect(isDirectInvocation("/usr/local/bin/clockify-mcp")).toBe(false);
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
