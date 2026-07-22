import { describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";
import {
    GUARDED_TOOL_RISKS,
    TOOL_RISK_BY_NAME,
    riskForGuardedTool,
    riskForTool,
    riskForUnguardedTool,
    type ToolRisk,
} from "../src/tool-risk.js";

const EXPECTED_DISTRIBUTION = {
    read: 60,
    routine_write: 26,
    business_write: 32,
    external_side_effect: 5,
    privileged: 5,
    destructive: 18,
} satisfies Record<ToolRisk, number>;

function fakeContext(): Context {
    const guard: unknown = new Proxy(function () {}, {
        get: () => guard,
        apply: () => {
            throw new Error("tool handler must not run during introspection");
        },
    });
    return { workspaceId: "ws-introspect", client: guard as Context["client"] };
}

function liveRegistrations(): Record<
    string,
    { annotations?: Record<string, unknown>; _meta?: Record<string, unknown> }
> {
    const server = buildServer(fakeContext());
    return (
        (
            server as unknown as {
                _registeredTools?: Record<
                    string,
                    { annotations?: Record<string, unknown>; _meta?: Record<string, unknown> }
                >;
            }
        )._registeredTools ?? {}
    );
}

describe("MCP tool risk registry", () => {
    it("classifies exactly the live 146-tool surface once", () => {
        const governedNames = Object.keys(TOOL_RISK_BY_NAME).sort((a, b) => a.localeCompare(b));
        const liveNames = Object.keys(liveRegistrations()).sort((a, b) => a.localeCompare(b));

        expect(governedNames).toEqual(liveNames);
        expect(governedNames).toHaveLength(146);
        expect(new Set(governedNames).size).toBe(146);
    });

    it("pins the six required risk totals and 60 guarded tools", () => {
        const distribution = Object.values(TOOL_RISK_BY_NAME).reduce(
            (counts, risk) => ({ ...counts, [risk]: counts[risk] + 1 }),
            {
                read: 0,
                routine_write: 0,
                business_write: 0,
                external_side_effect: 0,
                privileged: 0,
                destructive: 0,
            } satisfies Record<ToolRisk, number>,
        );

        expect(distribution).toEqual(EXPECTED_DISTRIBUTION);
        expect(
            Object.values(TOOL_RISK_BY_NAME).filter((risk) =>
                GUARDED_TOOL_RISKS.includes(risk as (typeof GUARDED_TOOL_RISKS)[number]),
            ),
        ).toHaveLength(60);
    });

    it("fails closed for an ungoverned tool name", () => {
        expect(() => riskForTool("clockify_not_governed")).toThrowError(
            "Unclassified MCP tool: clockify_not_governed",
        );
    });

    it("rejects a tool registered through the wrong helper family", () => {
        expect(() => riskForUnguardedTool("clockify_invoices_delete")).toThrowError(
            "clockify_invoices_delete must use defineGuardedTool",
        );
        expect(() => riskForGuardedTool("clockify_status")).toThrowError(
            "clockify_status must use defineTool",
        );
    });

    it("publishes live risk and confirmation metadata with derived annotations", () => {
        const registrations = liveRegistrations();

        for (const [name, risk] of Object.entries(TOOL_RISK_BY_NAME)) {
            const registration = registrations[name];
            expect(registration, name).toBeDefined();
            expect(registration?._meta?.["io.github.apet97.clockify115/risk"], name).toBe(risk);
            expect(registration?._meta?.["io.github.apet97.clockify115/confirmation"], name).toBe(
                GUARDED_TOOL_RISKS.includes(risk as never) ? "preview_token" : "none",
            );
            expect(registration?.annotations?.readOnlyHint, name).toBe(risk === "read");
            expect(registration?.annotations?.destructiveHint, name).toBe(risk === "destructive");
            expect(registration?.annotations?.openWorldHint, name).toBe(
                risk === "external_side_effect",
            );
        }
    });
});
