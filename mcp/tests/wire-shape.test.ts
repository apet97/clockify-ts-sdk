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
import { resolveProjectId, resolveUserId } from "../src/tools/workflows/resolve.js";

// A minimal context whose project list contains one project named "Website".
function ctxWith(projects: Array<{ id: string; name: string }>) {
    return {
        workspaceId: "ws1",
        client: { projects: { list: async () => projects } },
    } as unknown as Parameters<typeof resolveProjectId>[0];
}
const PROJECT_ID = "000000000000000000000301";

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

describe("workflow name→id resolution never ships a name as an id", () => {
    const projects = [{ id: PROJECT_ID, name: "Website" }];

    it("resolves a known name to its id", async () => {
        expect(await resolveProjectId(ctxWith(projects), "Website")).toBe(PROJECT_ID);
    });

    it("trusts a 24-hex id without listing", async () => {
        let listed = false;
        const ctx = {
            workspaceId: "ws1",
            client: { projects: { list: async () => ((listed = true), projects) } },
        } as unknown as Parameters<typeof resolveProjectId>[0];
        expect(await resolveProjectId(ctx, "ffffffffffffffffffffffff")).toBe("ffffffffffffffffffffffff");
        expect(listed).toBe(false);
    });

    it("throws on an unknown name instead of shipping it as an id", async () => {
        await expect(resolveProjectId(ctxWith(projects), "Nonexistent")).rejects.toThrow(/no project named/);
    });

    it("resolves a user by EMAIL through the unified matcher (matchKeys name+email)", async () => {
        const ctx = {
            workspaceId: "ws1",
            client: { users: { list: async () => [{ id: "u-7", name: "Bob Smith", email: "bob@x.com" }] } },
        } as unknown as Parameters<typeof resolveUserId>[0];
        // resolveUserId -> resolveByName -> findOneByName(["name","email"]) -> SDK matchByName
        expect(await resolveUserId(ctx, "bob@x.com")).toBe("u-7");
    });
});
