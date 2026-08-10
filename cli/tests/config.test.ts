import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig, requireApiKey, requireWorkspaceId } from "../src/config.js";

let home: string;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "clk115-test-"));
});

afterEach(() => {
    rmSync(home, { recursive: true, force: true });
});

function envWithHome(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return { ...extra, CLOCKIFY_HOME: home };
}

describe("loadConfig", () => {
    it("returns empty config when no source provides values", () => {
        const config = loadConfig({}, envWithHome());
        expect(config).toEqual({});
    });

    it("reads env vars", () => {
        const config = loadConfig(
            {},
            envWithHome({
                CLOCKIFY_API_KEY: "env-key",
                CLOCKIFY_WORKSPACE_ID: "env-ws",
                CLOCKIFY_BASE_URL: "https://clockify.test/api/v1",
            }),
        );
        expect(config).toEqual({
            apiKey: "env-key",
            workspaceId: "env-ws",
            baseUrl: "https://clockify.test/api/v1",
        });
    });

    it("reads non-secret values from ~/.clockifyrc.json", () => {
        writeFileSync(
            join(home, "clockifyrc.json"),
            JSON.stringify({ workspaceId: "rc-ws", baseUrl: "https://rc.test" }),
        );
        const config = loadConfig({}, envWithHome());
        expect(config).toEqual({ workspaceId: "rc-ws", baseUrl: "https://rc.test" });
    });

    it("env vars beat rc file", () => {
        writeFileSync(join(home, "clockifyrc.json"), JSON.stringify({ baseUrl: "https://rc.test" }));
        const config = loadConfig(
            {},
            envWithHome({ CLOCKIFY_API_KEY: "env-key", CLOCKIFY_BASE_URL: "https://env.test" }),
        );
        expect(config.apiKey).toBe("env-key");
        expect(config.baseUrl).toBe("https://env.test");
    });

    it("does not source credentials from the rc file when the env var is blank", () => {
        writeFileSync(join(home, "clockifyrc.json"), JSON.stringify({ workspaceId: "rc-ws" }));
        const config = loadConfig({}, envWithHome({ CLOCKIFY_API_KEY: "", CLOCKIFY_WORKSPACE_ID: "   " }));
        expect(config.apiKey).toBeUndefined();
        expect(config.workspaceId).toBe("rc-ws");
    });

    it("non-secret flags beat env vars", () => {
        const config = loadConfig(
            { baseUrl: "https://flag.test" },
            envWithHome({ CLOCKIFY_API_KEY: "env-key", CLOCKIFY_BASE_URL: "https://env.test" }),
        );
        expect(config.apiKey).toBe("env-key");
        expect(config.baseUrl).toBe("https://flag.test");
    });

    it("reads region/subdomain env vars", () => {
        const config = loadConfig(
            {},
            envWithHome({ CLOCKIFY_REGION: "eu", CLOCKIFY_SUBDOMAIN: "acme" }),
        );
        expect(config).toMatchObject({ region: "eu", subdomain: "acme" });
    });

    it("reads region/subdomain from ~/.clockifyrc.json", () => {
        writeFileSync(
            join(home, "clockifyrc.json"),
            JSON.stringify({ region: "eu", subdomain: "acme" }),
        );
        const config = loadConfig({}, envWithHome());
        expect(config).toMatchObject({ region: "eu", subdomain: "acme" });
    });

    it("warns with the nearest known key and ignores unknown rc-file keys", () => {
        writeFileSync(
            join(home, "clockifyrc.json"),
            JSON.stringify({
                workspaceId: "rc-ws",
                baseUrl: "https://rc.test",
                region: "eu",
                subdomain: "acme",
                workspceId: "ignored",
                baseURL: "ignored",
                reigon: "ignored",
                subdoman: "ignored",
            }),
        );
        const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
        const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
        try {
            expect(loadConfig({}, envWithHome())).toEqual({
                workspaceId: "rc-ws",
                baseUrl: "https://rc.test",
                region: "eu",
                subdomain: "acme",
            });
            expect(stderr).toHaveBeenNthCalledWith(
                1,
                'WARN clk115: ignoring unknown rc-file key "workspceId". Did you mean "workspaceId"?\n',
            );
            expect(stderr).toHaveBeenNthCalledWith(
                2,
                'WARN clk115: ignoring unknown rc-file key "baseURL". Did you mean "baseUrl"?\n',
            );
            expect(stderr).toHaveBeenNthCalledWith(
                3,
                'WARN clk115: ignoring unknown rc-file key "reigon". Did you mean "region"?\n',
            );
            expect(stderr).toHaveBeenNthCalledWith(
                4,
                'WARN clk115: ignoring unknown rc-file key "subdoman". Did you mean "subdomain"?\n',
            );
            expect(stderr).toHaveBeenCalledTimes(4);
            expect(stdout).not.toHaveBeenCalled();
        } finally {
            stderr.mockRestore();
            stdout.mockRestore();
        }
    });

    it("region/subdomain flags beat env vars beat rc file (flags > env > rc)", () => {
        writeFileSync(join(home, "clockifyrc.json"), JSON.stringify({ region: "us" }));
        const config = loadConfig(
            { region: "eu" },
            envWithHome({ CLOCKIFY_REGION: "uk" }),
        );
        expect(config.region).toBe("eu");
    });

    it("rejects legacy rc-file apiKey secrets with migration guidance", () => {
        writeFileSync(join(home, "clockifyrc.json"), JSON.stringify({ apiKey: "legacy-secret" }));
        expect(() => loadConfig({}, envWithHome())).toThrow(/remove apiKey.*CLOCKIFY_API_KEY/i);
        // The file read and parsed fine — it must NOT be reported as unreadable.
        expect(() => loadConfig({}, envWithHome())).not.toThrow(/failed to read/);
    });

    it("throws a helpful message on malformed rc file", () => {
        writeFileSync(join(home, "clockifyrc.json"), "{ not json }");
        expect(() => loadConfig({}, envWithHome())).toThrow(/failed to read Clockify rc file/);
    });
});

describe("requireApiKey / requireWorkspaceId", () => {
    it("returns the value when present", () => {
        expect(requireApiKey({ apiKey: "key" })).toBe("key");
        expect(requireWorkspaceId({ workspaceId: "ws" })).toBe("ws");
    });

    it("throws naming the missing input", () => {
        expect(() => requireApiKey({})).toThrow(/Clockify API key not set/);
        expect(() => requireWorkspaceId({})).toThrow(/Clockify workspace ID not set/);
    });
});
