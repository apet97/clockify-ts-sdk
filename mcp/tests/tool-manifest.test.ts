import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";
import { registeredToolsFor } from "../src/tool-registry.js";
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
    return [...registeredToolsFor(server).keys()].sort((a, b) => a.localeCompare(b));
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
            ui: { visibility: string[]; resourceUri?: string };
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
        expect(summary.totalTools).toBe(163);
        expect(summary.workflowTools).toBe(23);
        expect(summary.domainTools).toBe(140);
        expect(summary.destructiveTools).toBe(21);
        expect(summary.guardedTools).toBe(73);
        expect(summary.riskDistribution).toEqual({
            read: 65,
            routine_write: 25,
            business_write: 42,
            external_side_effect: 5,
            privileged: 5,
            destructive: 21,
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

    it("governs the five-tool App boundary with canonical nested UI metadata", () => {
        const appTools = manifest.tools.filter((tool) => tool.ui.visibility.includes("app"));

        expect(appTools.map((tool) => tool.name)).toEqual([
            "clockify_reports_attendance",
            "clockify_reports_detailed",
            "clockify_reports_expense",
            "clockify_reports_summary",
            "clockify_reports_weekly",
        ]);
        for (const tool of appTools) {
            expect(tool.ui).toEqual({
                visibility: ["model", "app"],
                resourceUri: "ui://clockify115/reports-dashboard",
            });
        }
        for (const tool of manifest.tools.filter((candidate) => !appTools.includes(candidate))) {
            expect(tool.ui, tool.name).toEqual({ visibility: ["model"] });
        }
    });

    it("generator floor is satisfied by the live server", () => {
        expect(liveNames()).toHaveLength(163);
    });

    it("committed idempotentHint equals a fresh live introspection for every tool", () => {
        // The other three annotations (readOnlyHint/destructiveHint/openWorldHint) are pure
        // functions of `risk` and are pinned above by re-deriving the expected value from
        // TOOL_RISK_BY_NAME. idempotentHint is the one annotation that is NOT purely
        // risk-derived — result.ts computes it as `idempotent ?? risk === "read"`, so a tool
        // can opt into `idempotent: true` regardless of risk (e.g. timeOff/requests.ts). A
        // flipped opt-in flag would silently desync the committed manifest from runtime
        // behavior with no other test noticing; comparing against a live introspection (not
        // a hand-maintained expected set) catches that without knowing the override list.
        const server = buildServer(fakeContext());
        const registered = registeredToolsFor(server);
        for (const tool of manifest.tools) {
            expect(registered.get(tool.name)?.annotations?.idempotentHint, tool.name).toBe(
                tool.annotations.idempotentHint,
            );
        }
    });
});
