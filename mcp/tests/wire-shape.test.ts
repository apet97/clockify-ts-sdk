/**
 * Wire-shape regression (MCP layer). Locks the pure `scopeFilter` helper that
 * encodes the holiday/time-off-policy assignment quirk: the GET echoes the
 * assignment back FLAT as `userIds`/`userGroupIds`, but the POST/PUT body wants
 * it as a `{contains:"CONTAINS", ids, status:"ALL"}` filter under `users`/
 * `userGroups`. Sending the flat arrays silently drops the assignment.
 *
 * The tool-level round-trips for these findings live in holidays.test.ts /
 * time-off-policies.test.ts; this pins the shared shape they both reconstruct.
 */
import { describe, expect, it } from "vitest";

import { scopeFilter } from "../src/scope-filter.js";

describe("wire-shape ledger (MCP scope filter)", () => {
    it("wraps ids in the CONTAINS filter Clockify wants on POST/PUT", () => {
        expect(scopeFilter(["u1", "u2"])).toEqual({ contains: "CONTAINS", ids: ["u1", "u2"], status: "ALL" });
    });

    it("never emits the flat userIds/userGroupIds shape the GET echoes", () => {
        const filter = scopeFilter(["g1"]);
        expect(filter).not.toHaveProperty("userIds");
        expect(filter).not.toHaveProperty("userGroupIds");
        expect(filter.contains).toBe("CONTAINS");
        expect(filter.status).toBe("ALL");
    });

    it("preserves id order and supports an empty assignment list", () => {
        expect((scopeFilter(["c", "a", "b"]) as { ids: string[] }).ids).toEqual(["c", "a", "b"]);
        expect((scopeFilter([]) as { ids: string[] }).ids).toEqual([]);
    });
});
