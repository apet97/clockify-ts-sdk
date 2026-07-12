import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";
import { TOOL_RISK_BY_NAME, type ToolRisk } from "../src/tool-risk.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(here, "..", "..", "docs", "mcp-tool-manifest.json");

function fakeContext(): Context {
    const guard: unknown = new Proxy(function () {}, {
        get: () => guard,
        apply: () => {
            throw new Error("tool handler must not run during introspection");
        },
    });
    return { workspaceId: "ws-introspect", client: guard as Context["client"] };
}

function liveNames(): string[] {
    const server = buildServer(fakeContext());
    const registered = (server as unknown as { _registeredTools?: Record<string, unknown> })
        ._registeredTools;
    return Object.keys(registered ?? {}).sort((a, b) => a.localeCompare(b));
}

describe("mcp tool manifest", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        schemaVersion: number;
        summary: {
            totalTools: number;
            workflowTools: number;
            domainTools: number;
            destructiveTools: number;
            guardedTools: number;
            riskDistribution: Record<ToolRisk, number>;
        };
        tools: Array<{
            name: string;
            risk: ToolRisk;
            confirmation: "none" | "preview_token";
            annotations: {
                readOnlyHint: boolean;
                destructiveHint: boolean;
                idempotentHint: boolean;
                openWorldHint: boolean;
            };
        }>;
    };

    it("committed manifest names equal a fresh live introspection", () => {
        expect(manifest.tools.map((tool) => tool.name)).toEqual(liveNames());
    });

    it("summary is internally consistent and meets the structural floor", () => {
        const { summary, tools } = manifest;
        expect(manifest.schemaVersion).toBe(2);
        expect(summary.totalTools).toBe(tools.length);
        expect(summary.workflowTools + summary.domainTools).toBe(summary.totalTools);
        expect(summary.totalTools).toBe(140);
        expect(summary.workflowTools).toBe(22);
        expect(summary.domainTools).toBe(118);
        expect(summary.destructiveTools).toBe(18);
        expect(summary.guardedTools).toBe(56);
        expect(summary.riskDistribution).toEqual({
            read: 58,
            routine_write: 26,
            business_write: 30,
            external_side_effect: 5,
            privileged: 3,
            destructive: 18,
        });
    });

    it("records the governed runtime risk and confirmation contract for every tool", () => {
        for (const tool of manifest.tools) {
            const expectedRisk = TOOL_RISK_BY_NAME[tool.name as keyof typeof TOOL_RISK_BY_NAME];
            expect(tool.risk, tool.name).toBe(expectedRisk);
            expect(tool.confirmation, tool.name).toBe(
                ["read", "routine_write"].includes(expectedRisk) ? "none" : "preview_token",
            );
            expect(tool.annotations.readOnlyHint, tool.name).toBe(expectedRisk === "read");
            expect(tool.annotations.destructiveHint, tool.name).toBe(
                expectedRisk === "destructive",
            );
            expect(tool.annotations.openWorldHint, tool.name).toBe(
                expectedRisk === "external_side_effect",
            );
        }
    });

    it("generator floor is satisfied by the live server", () => {
        expect(liveNames()).toHaveLength(140);
    });
});
