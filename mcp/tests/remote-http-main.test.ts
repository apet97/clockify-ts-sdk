import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { main } from "../src/http-main.js";

const BASE_ENV: NodeJS.ProcessEnv = {
    CLOCKIFY_MCP_PUBLIC_URL: "https://mcp.example/mcp",
    CLOCKIFY_MCP_OAUTH_ISSUER: "https://issuer.example/",
    CLOCKIFY_MCP_OAUTH_JWKS_URL: "https://issuer.example/jwks",
    CLOCKIFY_MCP_OAUTH_AUTHORIZATION_ENDPOINT: "https://issuer.example/authorize",
    CLOCKIFY_MCP_OAUTH_TOKEN_ENDPOINT: "https://issuer.example/token",
    CLOCKIFY_MCP_OAUTH_INTROSPECTION_URL: "https://issuer.example/introspect",
    CLOCKIFY_MCP_OAUTH_JWT_ALGORITHMS: "RS256",
    CLOCKIFY_MCP_OAUTH_CLIENT_ID: "clockify-mcp",
    CLOCKIFY_MCP_OAUTH_CLIENT_SECRET_FILE: "/not/read/oauth-secret",
    CLOCKIFY_MCP_KEYRING_FILE: "/not/read/keyring",
};

describe("remote HTTP binary configuration boundary", () => {
    let stdout: ReturnType<typeof vi.spyOn>;
    let stderr: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    });

    afterEach(() => {
        stdout.mockRestore();
        stderr.mockRestore();
    });

    it("prints help with no configuration or database access", async () => {
        await expect(main(["--help"], {})).resolves.toBe(0);
        expect(written(stdout)).toContain("clockify115-mcp-http");
        expect(written(stderr)).toBe("");
    });

    it("returns a deterministic usage exit for unknown options", async () => {
        await expect(main(["--unknown"], {})).resolves.toBe(2);
        expect(jsonLines(stderr)).toEqual([
            {
                event: "service_lifecycle",
                phase: "fatal",
                reason: "configuration",
                failure: "invalid_configuration",
            },
        ]);
    });

    it.each(["CLOCKIFY_API_KEY", "CLOCKIFY_WORKSPACE_ID"])(
        "rejects a present %s before configuration or database access",
        async (name) => {
            await expect(main([], { ...BASE_ENV, [name]: "" })).resolves.toBe(1);
            expect(jsonLines(stderr)).toEqual([
                {
                    event: "service_lifecycle",
                    phase: "fatal",
                    reason: "configuration",
                    failure: "invalid_configuration",
                },
            ]);
        },
    );

    it.each([
        "http://issuer.example/authorize",
        "https://user:secret@issuer.example/authorize",
        "https://issuer.example/authorize?tenant=one",
        "https://issuer.example/authorize#fragment",
        "https://issuer.example/authorize/../authorize",
    ])("rejects a non-canonical authorization endpoint: %s", async (endpoint) => {
        await expect(
            main([], {
                ...BASE_ENV,
                CLOCKIFY_MCP_OAUTH_AUTHORIZATION_ENDPOINT: endpoint,
            }),
        ).resolves.toBe(1);
        expect(jsonLines(stderr).at(0)).toEqual({
            event: "service_lifecycle",
            phase: "starting",
        });
        expect(jsonLines(stderr)).toContainEqual({
            event: "service_lifecycle",
            phase: "fatal",
            reason: "configuration",
            failure: "invalid_configuration",
        });
        expect(written(stderr)).not.toContain(endpoint);
    });

    it.each([
        "http://issuer.example/token",
        "https://user:secret@issuer.example/token",
        "https://issuer.example/token?tenant=one",
        "https://issuer.example/token#fragment",
        "https://issuer.example/token/../token",
    ])("rejects a non-canonical token endpoint: %s", async (endpoint) => {
        await expect(
            main([], { ...BASE_ENV, CLOCKIFY_MCP_OAUTH_TOKEN_ENDPOINT: endpoint }),
        ).resolves.toBe(1);
        expect(jsonLines(stderr)).toContainEqual({
            event: "service_lifecycle",
            phase: "fatal",
            reason: "configuration",
            failure: "invalid_configuration",
        });
        expect(written(stderr)).not.toContain(endpoint);
    });

    it.each([
        ["CLOCKIFY_MCP_MIGRATION_MODE", "run"],
        ["CLOCKIFY_MCP_CLOCKIFY_TIMEOUT_SECONDS", "0"],
        ["CLOCKIFY_MCP_CLOCKIFY_TIMEOUT_SECONDS", "601"],
        ["CLOCKIFY_MCP_CLOCKIFY_TIMEOUT_SECONDS", "1.5"],
        ["CLOCKIFY_MCP_MAX_CONCURRENT_REQUESTS", "0"],
        ["CLOCKIFY_MCP_MAX_CONCURRENT_REQUESTS", "10001"],
        ["CLOCKIFY_MCP_MAX_CONCURRENT_REQUESTS", "many"],
    ])("rejects invalid %s=%s before database access", async (name, value) => {
        await expect(main([], { ...BASE_ENV, [name]: value })).resolves.toBe(1);
        expect(jsonLines(stderr)).toContainEqual({
            event: "service_lifecycle",
            phase: "fatal",
            reason: "configuration",
            failure: "invalid_configuration",
        });
    });
});

function written(spy: { mock: { calls: readonly (readonly unknown[])[] } }): string {
    return spy.mock.calls.map((call) => String(call[0])).join("");
}

function jsonLines(spy: { mock: { calls: readonly (readonly unknown[])[] } }): unknown[] {
    return written(spy)
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as unknown);
}
