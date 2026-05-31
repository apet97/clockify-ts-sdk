import { describe, expect, it, vi } from "vitest";

import { buildClient } from "../src/client.js";
import type { CliConfig } from "../src/config.js";

const base: CliConfig = { apiKey: "k", workspaceId: "ws" };

describe("buildClient base URL allowlist (H1)", () => {
    it("rejects an arbitrary --base-url / CLOCKIFY_BASE_URL host by default", () => {
        expect(() => buildClient({ ...base, baseUrl: "https://evil.example.com/api/v1" })).toThrow(
            /not an allowlisted Clockify host/,
        );
    });

    it("rejects an http:// base URL (must be HTTPS for non-loopback)", () => {
        expect(() => buildClient({ ...base, baseUrl: "http://api.clockify.me/api/v1" })).toThrow(
            /https:\/\//,
        );
    });

    it("allows the production Clockify host", () => {
        const client = buildClient({ ...base, baseUrl: "https://api.clockify.me/api/v1" });
        expect(client).toBeDefined();
    });

    it("allows a loopback test/mock base URL", () => {
        const client = buildClient({ ...base, baseUrl: "http://127.0.0.1:19091/api/v1" });
        expect(client).toBeDefined();
    });

    it("allows building with no base URL override (default Clockify host)", () => {
        const client = buildClient(base);
        expect(client).toBeDefined();
    });

    it("stays strict: CLI does not silently opt in to arbitrary HTTPS hosts", () => {
        // buildClient hard-codes allowInsecureBaseUrl: false, so even an
        // env-var-injected host is rejected — never a console.warn pass.
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(() => buildClient({ ...base, baseUrl: "https://attacker.test/api/v1" })).toThrow(
            /not an allowlisted Clockify host/,
        );
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
