import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

    it("reads ~/.clockifyrc.json (clockifyrc.json variant)", () => {
        writeFileSync(
            join(home, "clockifyrc.json"),
            JSON.stringify({ apiKey: "rc-key", workspaceId: "rc-ws", baseUrl: "https://rc.test" }),
        );
        const config = loadConfig({}, envWithHome());
        expect(config).toEqual({ apiKey: "rc-key", workspaceId: "rc-ws", baseUrl: "https://rc.test" });
    });

    it("env vars beat rc file", () => {
        writeFileSync(join(home, "clockifyrc.json"), JSON.stringify({ apiKey: "rc-key", baseUrl: "https://rc.test" }));
        const config = loadConfig(
            {},
            envWithHome({ CLOCKIFY_API_KEY: "env-key", CLOCKIFY_BASE_URL: "https://env.test" }),
        );
        expect(config.apiKey).toBe("env-key");
        expect(config.baseUrl).toBe("https://env.test");
    });

    it("flags beat env vars", () => {
        const config = loadConfig(
            { apiKey: "flag-key", baseUrl: "https://flag.test" },
            envWithHome({ CLOCKIFY_API_KEY: "env-key", CLOCKIFY_BASE_URL: "https://env.test" }),
        );
        expect(config.apiKey).toBe("flag-key");
        expect(config.baseUrl).toBe("https://flag.test");
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
