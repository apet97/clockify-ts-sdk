import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(here, "..", "..", "docs", "mcp-tool-manifest.json");

function fakeContext(): Context {
    const guard = new Proxy(function () {
        throw new Error("handler must not be called");
    }, {
        get: () => guard,
        apply: () => {
            throw new Error("handler must not be called");
        },
    });
    return { workspaceId: "ws-test", client: guard } as unknown as Context;
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

    it("summary counts are 134 / 21 / 113 / 23", () => {
        expect(manifest.summary.totalTools).toBe(134);
        expect(manifest.summary.workflowTools).toBe(21);
        expect(manifest.summary.domainTools).toBe(113);
        expect(manifest.summary.destructiveTools).toBe(23);
    });
});
