import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { fakeContext as introspectContext } from "../scripts/introspect-harness.mjs";
import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(here, "..", "..", "docs", "mcp-tool-manifest.json");

function fakeContext(): Context {
    return introspectContext() as unknown as Context;
}

function liveNames(): string[] {
    const server = buildServer(fakeContext());
    return Object.keys(server._registeredTools ?? {}).sort((a, b) => a.localeCompare(b));
}

describe("mcp tool manifest", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        summary: Record<string, number>;
        tools: Array<{ name: string }>;
    };

    it("committed manifest names equal a fresh live introspection", () => {
        expect(manifest.tools.map((tool) => tool.name)).toEqual(liveNames());
    });

    it("summary is internally consistent and meets the structural floor", () => {
        const { summary, tools } = manifest;
        expect(summary.totalTools).toBe(tools.length);
        expect(summary.workflowTools + summary.domainTools).toBe(summary.totalTools);
        expect(summary.totalTools).toBeGreaterThanOrEqual(134);
        expect(summary.workflowTools).toBeGreaterThanOrEqual(21);
        expect(summary.domainTools).toBeGreaterThanOrEqual(113);
        expect(summary.destructiveTools).toBeGreaterThan(0);
        expect(summary.destructiveTools).toBeLessThanOrEqual(summary.totalTools);
        expect(summary.destructiveTools).toBeGreaterThanOrEqual(23);
    });

    it("generator floor is satisfied by the live server", () => {
        expect(liveNames().length).toBeGreaterThanOrEqual(134);
    });
});
