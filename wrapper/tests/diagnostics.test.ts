// Diagnostics tests cover SDK clockifyDiagnostics on Node.js 22.13 and above.
import { describe, expect, it } from "vitest";

import { clockifyDiagnostics } from "../diagnostics.js";

describe("clockifyDiagnostics", () => {
    it("reports missing auth without contacting Clockify", () => {
        const result = clockifyDiagnostics({ env: {}, nodeVersion: "22.13.0" });

        expect(result.ok).toBe(false);
        expect(result.readiness).toBe("configuration_incomplete");
        expect(result.checks.auth).toMatchObject({ ok: false, status: "missing" });
        expect(result.next.join("\n")).toContain("CLOCKIFY_API_KEY");
    });

    it("redacts env credentials and masks workspace IDs", () => {
        const result = clockifyDiagnostics({
            env: {
                CLOCKIFY_API_KEY: "super-secret-token",
                CLOCKIFY_WORKSPACE_ID: "1234567890abcdef12345678",
            },
            nodeVersion: "22.13.0",
        });

        expect(result.ok).toBe(true);
        expect(result.readiness).toBe("ready_for_health");
        expect(JSON.stringify(result)).not.toContain("super-secret-token");
        expect(result.checks.auth).toMatchObject({
            source: "env",
            value: "CLOCKIFY_API_KEY configured (redacted)",
        });
        expect(result.checks.workspaceId).toMatchObject({ source: "env", value: "1234...5678" });
        expect(result.checks.baseUrl).toMatchObject({ source: "default", status: "default" });
        expect(result.next).toContain("Create the client with createClockifyClient().");
    });

    it("tracks explicit workspace and base URL sources", () => {
        const result = clockifyDiagnostics({
            apiKey: "api",
            workspaceId: "1234567890abcdef12345678",
            baseUrl: "http://127.0.0.1:19091/api/v1",
            env: {
                CLOCKIFY_WORKSPACE_ID: "env-workspace-should-not-win",
                CLOCKIFY_BASE_URL: "http://env.example/api/v1",
            },
            nodeVersion: "22.13.0",
        });

        expect(result.ok).toBe(true);
        expect(result.checks.workspaceId).toMatchObject({
            source: "explicit",
            value: "1234...5678",
        });
        expect(result.checks.baseUrl).toMatchObject({
            source: "explicit",
            status: "override",
            value: "http://127.0.0.1:19091/api/v1",
        });
    });

    it("tracks environment base URL overrides separately from defaults", () => {
        const result = clockifyDiagnostics({
            apiKey: "api",
            env: { CLOCKIFY_BASE_URL: "http://127.0.0.1:45881/api/v1" },
            nodeVersion: "22.13.0",
        });

        expect(result.ok).toBe(true);
        expect(result.checks.baseUrl).toMatchObject({
            source: "env",
            status: "override",
            value: "http://127.0.0.1:45881/api/v1",
        });
    });

    it("reports explicit auth conflicts before createClockifyClient throws", () => {
        const result = clockifyDiagnostics({
            apiKey: "api",
            addonToken: "addon",
            env: {},
            nodeVersion: "22.13.0",
        });

        expect(result.ok).toBe(false);
        expect(result.readiness).toBe("configuration_conflict");
        expect(result.checks.auth).toMatchObject({ status: "conflict", source: "explicit" });
        expect(result.next).toContain("Keep exactly one auth scheme: apiKey or addonToken.");
    });

    it("warns when both auth env vars are set because api key wins", () => {
        const result = clockifyDiagnostics({
            env: {
                CLOCKIFY_API_KEY: "api-token",
                CLOCKIFY_ADDON_TOKEN: "addon-token",
            },
            nodeVersion: "22.13.0",
        });

        expect(result.ok).toBe(true);
        expect(result.warnings.join("\n")).toContain(
            "createClockifyClient prefers CLOCKIFY_API_KEY",
        );
        expect(JSON.stringify(result)).not.toContain("addon-token");
    });

    it("marks old Node versions unsupported", () => {
        const result = clockifyDiagnostics({ apiKey: "api", env: {}, nodeVersion: "18.20.0" });

        expect(result.ok).toBe(false);
        expect(result.readiness).toBe("runtime_unsupported");
        expect(result.checks.runtime.recovery).toMatch(/Node\.js 22\.13/);
    });
    it("reports an allowlisted Clockify base URL override as allowed", () => {
        const result = clockifyDiagnostics({
            apiKey: "api",
            baseUrl: "https://api.clockify.me/api/v1",
            env: {},
            nodeVersion: "22.13.0",
        });

        expect(result.ok).toBe(true);
        expect(result.checks.baseUrl).toMatchObject({ status: "override", allowlist: "allowed" });
    });

    it("flags a non-Clockify base URL override as rejected with recovery guidance", () => {
        const result = clockifyDiagnostics({
            apiKey: "api",
            baseUrl: "https://evil.example.com/api/v1",
            env: {},
            nodeVersion: "22.13.0",
        });

        // Diagnostics never throws — it reports advisory readiness — so ok
        // stays true even though createClockifyClient would reject the host.
        expect(result.ok).toBe(true);
        expect(result.checks.baseUrl).toMatchObject({ status: "override", allowlist: "rejected" });
        expect(result.warnings.join("\n")).toContain("not an allowlisted Clockify host");
    });
});
