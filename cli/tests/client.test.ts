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
        // buildClient hard-codes allowNonClockifyHttpsHost: false, so even an
        // env-var-injected host is rejected — never a console.warn pass.
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        await expect(buildClient({ ...base, baseUrl: "https://attacker.test/api/v1" })).rejects.toThrow(
            /not an allowlisted Clockify host/,
        );
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});

describe("buildClient routing (ROUTE-002/P02-08)", () => {
    it("builds a client for the default (no region set)", async () => {
        const client = await buildClient(base);
        expect(client).toBeDefined();
    });

    it("builds a client for an approved region", async () => {
        const client = await buildClient({ ...base, region: "eu" });
        expect(client).toBeDefined();
    });

    it("builds a client for a region + subdomain", async () => {
        const client = await buildClient({ ...base, region: "eu", subdomain: "acme" });
        expect(client).toBeDefined();
    });

    it("rejects an unrecognized --region value", async () => {
        await expect(buildClient({ ...base, region: "mars" })).rejects.toThrow(
            /unrecognized|unknown/i,
        );
    });

    it("rejects --subdomain without --region", async () => {
        await expect(buildClient({ ...base, subdomain: "acme" })).rejects.toThrow(/--region/);
    });

    it("rejects --subdomain paired with a region that has no regional prefix (global)", async () => {
        await expect(buildClient({ ...base, region: "global", subdomain: "acme" })).rejects.toThrow(
            /--region/,
        );
    });

    it("rejects a conflicting --region and --base-url on the same invocation", async () => {
        await expect(
            buildClient({ ...base, region: "eu", baseUrl: "https://api.clockify.me/api/v1" }),
        ).rejects.toThrow(/--region.*--base-url|--base-url.*--region/i);
    });
});
