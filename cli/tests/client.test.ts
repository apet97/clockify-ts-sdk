import { describe, expect, it, vi } from "vitest";

import { buildClient } from "../src/client.js";
import type { CliConfig } from "../src/config.js";

const base: CliConfig = { apiKey: "k", workspaceId: "ws" };

describe("buildClient base URL allowlist (H1)", () => {
    it("rejects an arbitrary --base-url / CLOCKIFY_BASE_URL host by default", async () => {
        await expect(buildClient({ ...base, baseUrl: "https://evil.example.com/api/v1" })).rejects.toThrow(
            /not an allowlisted Clockify host/,
        );
    });

    it("rejects an http:// base URL (must be HTTPS for non-loopback)", async () => {
        await expect(buildClient({ ...base, baseUrl: "http://api.clockify.me/api/v1" })).rejects.toThrow(
            /https:\/\//,
        );
    });

    it("allows the production Clockify host", async () => {
        const client = await buildClient({ ...base, baseUrl: "https://api.clockify.me/api/v1" });
        expect(client).toBeDefined();
    });

    it("allows a loopback test/mock base URL", async () => {
        const client = await buildClient({ ...base, baseUrl: "http://127.0.0.1:19091/api/v1" });
        expect(client).toBeDefined();
    });

    it("allows building with no base URL override (default Clockify host)", async () => {
        const client = await buildClient(base);
        expect(client).toBeDefined();
    });

    it("stays strict: CLI does not silently opt in to arbitrary HTTPS hosts", async () => {
        // buildClient hard-codes allowInsecureBaseUrl: false, so even an
        // env-var-injected host is rejected — never a console.warn pass.
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        await expect(buildClient({ ...base, baseUrl: "https://attacker.test/api/v1" })).rejects.toThrow(
            /not an allowlisted Clockify host/,
        );
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
