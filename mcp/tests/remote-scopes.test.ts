import { describe, expect, it } from "vitest";

import { effectiveScopes, requiredScopeForRisk } from "../src/remote/scopes.js";

describe("remote scope policy", () => {
    it.each([
        ["read", "clockify:read"],
        ["routine_write", "clockify:write"],
        ["business_write", "clockify:write"],
        ["external_side_effect", "clockify:write"],
        ["privileged", "clockify:admin"],
        ["destructive", "clockify:admin"],
    ] as const)("maps %s to %s", (risk, scope) => {
        expect(requiredScopeForRisk(risk)).toBe(scope);
    });

    it("requires each exact OAuth scope instead of inventing a hierarchy", () => {
        expect([...effectiveScopes(new Set(["clockify:admin"]), "admin")]).toEqual([
            "clockify:admin",
        ]);
        expect([...effectiveScopes(new Set(["clockify:write"]), "admin")]).toEqual([
            "clockify:write",
        ]);
        expect([...effectiveScopes(new Set(["clockify:read"]), "admin")]).toEqual([
            "clockify:read",
        ]);
    });

    it("applies the database grant as an independent ceiling", () => {
        const all = new Set([
            "clockify:read",
            "clockify:write",
            "clockify:admin",
        ]);
        expect([...effectiveScopes(all, "read")]).toEqual(["clockify:read"]);
        expect([...effectiveScopes(all, "write")]).toEqual([
            "clockify:read",
            "clockify:write",
        ]);
        expect([...effectiveScopes(all, "admin")]).toEqual([
            "clockify:read",
            "clockify:write",
            "clockify:admin",
        ]);
    });
});
