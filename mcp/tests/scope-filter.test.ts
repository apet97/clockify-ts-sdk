import { describe, expect, it } from "vitest";

import { scopeFilter } from "../src/scope-filter.js";

/**
 * scopeFilter builds the `{contains, ids, status}` envelope that Clockify's
 * holiday and time-off-policy POST/PUT bodies require under `users`/`userGroups`.
 * Sending the flat `userIds`/`userGroupIds` arrays the GET echoes back instead
 * silently DROPS the assignment, and an assignment-less holiday/policy is
 * rejected -- so every field here is load-bearing, not cosmetic.
 *
 * The status segment is the subtle one: holidays rely on the `"ALL"` default,
 * time-off policy scope must pass `"ACTIVE"` (both live-verified in the
 * ai-assistant addon, 2026-06-12). A mutant that swaps the default, drops a
 * key, or blanks a literal must not survive.
 */
describe("scopeFilter", () => {
    it("wraps ids in the CONTAINS envelope the write body requires", () => {
        expect(scopeFilter(["u1", "u2"])).toEqual({
            contains: "CONTAINS",
            ids: ["u1", "u2"],
            status: "ALL",
        });
    });

    it("defaults status to ALL, which is what holidays depend on", () => {
        expect(scopeFilter(["u1"]).status).toBe("ALL");
    });

    it("passes ACTIVE through for time-off policy scope", () => {
        expect(scopeFilter(["u1"], "ACTIVE").status).toBe("ACTIVE");
    });

    it("passes an explicit ALL through unchanged", () => {
        expect(scopeFilter(["u1"], "ALL").status).toBe("ALL");
    });

    it("always sets contains to the literal CONTAINS", () => {
        expect(scopeFilter([]).contains).toBe("CONTAINS");
        expect(scopeFilter(["u1"], "ACTIVE").contains).toBe("CONTAINS");
    });

    it("preserves the ids array exactly, including order and duplicates", () => {
        const ids = ["b", "a", "b"];
        expect(scopeFilter(ids).ids).toEqual(["b", "a", "b"]);
    });

    it("carries an empty id list through rather than substituting one", () => {
        expect(scopeFilter([]).ids).toEqual([]);
    });

    it("emits exactly the three expected keys and no others", () => {
        expect(Object.keys(scopeFilter(["u1"])).sort()).toEqual(["contains", "ids", "status"]);
    });

    it("does not copy the ids array defensively -- callers rely on the value, not identity", () => {
        // Pins current behaviour: the same array instance is forwarded. If this
        // ever becomes a defensive copy that is a deliberate change, not a
        // silent one.
        const ids = ["u1"];
        expect(scopeFilter(ids).ids).toBe(ids);
    });
});
