import { describe, expect, it } from "vitest";

import {
    looksLikeClockifyId,
    matchByName,
    resolveEntityRef,
    resolveGroupRefs,
    resolveProjectTaskRefs,
    resolveTagRefs,
    resolveUserFilter,
    resolveUserRef,
    resolveUserRefs,
    suggestOptions,
} from "../resolve.js";

const HEX = "000000000000000000000301";
const HEX2 = "000000000000000000000302";

const projects = [
    { id: HEX, name: "Website", archived: false },
    { id: HEX2, name: "Website", archived: false }, // duplicate name → ambiguous
    { id: "000000000000000000000401", name: "Old Site", archived: true },
];

describe("looksLikeClockifyId", () => {
    it("recognizes 24-hex ids and rejects names / short ids", () => {
        expect(looksLikeClockifyId(HEX)).toBe(true);
        expect(looksLikeClockifyId("Acme")).toBe(false);
        expect(looksLikeClockifyId("p1")).toBe(false);
        expect(looksLikeClockifyId("000000000000000000000301 ")).toBe(true); // trims
    });
});

describe("matchByName", () => {
    const items = [
        { id: "a", name: "Acme", archived: false },
        { id: "b", name: "Beta", archived: false },
        { id: "c", name: "Acme", archived: false },
        { id: "d", name: "Gamma", archived: true },
    ];
    it("is case-insensitive and exact", () => {
        expect(matchByName(items, "beta")).toEqual({ kind: "one", entity: items[1] });
        expect(matchByName(items, "  BETA ")).toEqual({ kind: "one", entity: items[1] });
        expect(matchByName(items, "Bet")).toEqual({ kind: "none" }); // exact, not prefix
    });
    it("reports ambiguous and missing", () => {
        expect(matchByName(items, "Acme").kind).toBe("many");
        expect(matchByName(items, "Nope")).toEqual({ kind: "none" });
    });
    it("excludes archived unless asked", () => {
        expect(matchByName(items, "Gamma")).toEqual({ kind: "none" });
        expect(matchByName(items, "Gamma", { includeArchived: true })).toEqual({ kind: "one", entity: items[3] });
    });
});

describe("suggestOptions", () => {
    it("prefers name-contains matches and tags archived", () => {
        const opts = suggestOptions(projects, "site", { includeArchived: true });
        expect(opts.map((o) => o.label)).toContain("Old Site (archived)");
    });
});

describe("resolveEntityRef", () => {
    it("trusts a 24-hex id without listing", async () => {
        let listed = false;
        const result = await resolveEntityRef(
            { id: HEX },
            { noun: "project", verb: "open", list: async () => ((listed = true), projects) },
        );
        expect(result).toEqual({ ok: true, id: HEX, name: undefined });
        expect(listed).toBe(false);
    });

    it("resolves a name case-insensitively", async () => {
        const result = await resolveEntityRef(
            { name: "old site" },
            { noun: "project", verb: "open", list: async () => projects, includeArchived: true },
        );
        expect(result).toMatchObject({ ok: true, id: "000000000000000000000401", name: "Old Site" });
    });

    it("clarifies (with options) on an ambiguous name", async () => {
        const result = await resolveEntityRef({ name: "Website" }, { noun: "project", verb: "open", list: async () => projects });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.clarify.clarify).toMatch(/More than one/);
            expect(result.clarify.options).toHaveLength(2);
        }
    });

    it("clarifies with did-you-mean suggestions on a miss", async () => {
        const result = await resolveEntityRef({ name: "Websyte" }, { noun: "project", verb: "open", list: async () => projects });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.clarify.clarify).toMatch(/couldn't find|no active/i);
    });

    it("verifyId clarifies on an unknown hex id instead of matching by name", async () => {
        const result = await resolveEntityRef(
            { id: "ffffffffffffffffffffffff", name: "Website" },
            { noun: "project", verb: "open", list: async () => projects, verifyId: true },
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.clarify.clarify).toMatch(/with id ffffffffffffffffffffffff/);
    });
});

describe("resolveProjectTaskRefs", () => {
    const listProjects = async () => [{ id: HEX, name: "Website", archived: false }, { id: HEX2, name: "API", archived: false }];
    const listTasks = async (projectId: string) =>
        projectId === HEX ? [{ id: "000000000000000000000501", name: "Design" }] : [];

    it("resolves a project name and a task name within it", async () => {
        const result = await resolveProjectTaskRefs({ projectName: "Website", taskName: "Design" }, { verb: "log", listProjects, listTasks });
        expect(result).toMatchObject({ ok: true, projectId: HEX, taskId: "000000000000000000000501", taskName: "Design" });
    });

    it("clarifies when a task name has no project", async () => {
        const result = await resolveProjectTaskRefs({ taskName: "Design" }, { verb: "log", listProjects, listTasks });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.clarify.clarify).toMatch(/I need the project/);
    });

    it("passes through when no refs are given", async () => {
        const result = await resolveProjectTaskRefs({}, { verb: "log", listProjects, listTasks });
        expect(result).toEqual({ ok: true, projectId: undefined, projectName: undefined, taskId: undefined, taskName: undefined });
    });
});

describe("resolveUserRef", () => {
    const listUsers = async () => [
        { id: "000000000000000000000601", name: "Ada Lovelace" },
        { id: "000000000000000000000602", name: "Alan Turing" },
    ];
    it("maps 'me' to the supplied user id", async () => {
        expect(await resolveUserRef({ id: "me" }, { verb: "assign", meUserId: "000000000000000000000609", listUsers })).toEqual({
            ok: true,
            userId: "000000000000000000000609",
            label: "you",
        });
    });
    it("resolves a name and clarifies on an unknown member", async () => {
        expect(await resolveUserRef({ name: "Ada Lovelace" }, { verb: "assign", meUserId: "x", listUsers })).toMatchObject({
            ok: true,
            userId: "000000000000000000000601",
        });
        const miss = await resolveUserRef({ name: "Grace Hopper" }, { verb: "assign", meUserId: "x", listUsers });
        expect(miss.ok).toBe(false);
        if (!miss.ok) expect(miss.clarify.clarify).toMatch(/isn't a workspace member/);
    });
    it("trustIds takes a 24-hex value without listing (read filters)", async () => {
        let listed = false;
        const result = await resolveUserRef(
            { id: "000000000000000000000601" },
            { verb: "filter", meUserId: "x", listUsers: async () => ((listed = true), []), trustIds: true },
        );
        expect(result).toEqual({ ok: true, userId: "000000000000000000000601", label: "000000000000000000000601" });
        expect(listed).toBe(false);
    });
});

const countingList = (items: Array<{ id: string; name: string }>) => {
    const listed = { n: 0 };
    const list = async () => {
        listed.n += 1;
        return items;
    };
    return { listed, list };
};

describe("resolveUserRefs", () => {
    const usersFixture = [
        { id: HEX, name: "Alice" },
        { id: "u2", name: "Bob" },
        { id: "u3", name: "Charlie" },
        { id: "u4", name: "Charlie" }, // duplicate → ambiguous
    ];

    it("trusts a 24-hex id without listing, maps 'me' to meUserId, and resolves names", async () => {
        const { listed, list } = countingList(usersFixture);
        const result = await resolveUserRefs([HEX, "me", "Bob"], { verb: "assign", meUserId: "admin-1", listUsers: list });
        expect(result).toEqual({ ok: true, userIds: [HEX, "admin-1", "u2"], labels: ["000000000000000000000301", "you", "Bob"] });
        expect(listed.n).toBe(1);
    });

    it("resolves short test-style ids via the list before treating them as names", async () => {
        const { list } = countingList(usersFixture);
        const result = await resolveUserRefs(["u2"], { verb: "assign", meUserId: "admin-1", listUsers: list });
        expect(result).toMatchObject({ ok: true, userIds: ["u2"] });
    });

    it("collapses duplicates and ignores blanks (order-preserving dedup)", async () => {
        const { list } = countingList(usersFixture);
        const result = await resolveUserRefs(["me", "me", "  ", "Alice"], { verb: "assign", meUserId: "admin-1", listUsers: list });
        expect(result).toMatchObject({ ok: true, userIds: ["admin-1", HEX] });
    });

    it("clarifies (no commit) on an ambiguous name with grounded options", async () => {
        const { list } = countingList(usersFixture);
        const result = await resolveUserRefs(["Charlie"], { verb: "assign", meUserId: "admin-1", listUsers: list });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect((result.clarify.options ?? []).map((o) => o.id).sort()).toEqual(["u3", "u4"]);
        }
        expect("userIds" in result).toBe(false);
    });

    it("clarifies with grounded options on an unknown name", async () => {
        const { list } = countingList(usersFixture);
        const result = await resolveUserRefs(["Nobody"], { verb: "assign", meUserId: "admin-1", listUsers: list });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.clarify.clarify).toMatch(/isn't a workspace member/);
    });

    it("verifyIds forces a list check even for a 24-hex id", async () => {
        const { listed, list } = countingList(usersFixture);
        const result = await resolveUserRefs([HEX2], { verb: "assign", meUserId: "admin-1", listUsers: list, verifyIds: true });
        expect(listed.n).toBe(1);
        expect(result.ok).toBe(false);
    });
});

describe("resolveGroupRefs", () => {
    const groupsFixture = [
        { id: "g1", name: "Devs" },
        { id: "g2", name: "Ops" },
        { id: "g3", name: "Ops" }, // duplicate → ambiguous
    ];

    it("resolves group names + ids to ids with labels", async () => {
        const { list } = countingList(groupsFixture);
        const result = await resolveGroupRefs(["Devs", "g2"], { verb: "add", listGroups: list });
        expect(result).toMatchObject({ ok: true, groupIds: ["g1", "g2"], labels: ["Devs", "Ops"] });
    });

    it("ALWAYS verifies a 24-hex value: an unknown id clarifies as a group", async () => {
        const { listed, list } = countingList(groupsFixture);
        const result = await resolveGroupRefs([HEX], { verb: "add", listGroups: list });
        expect(listed.n).toBe(1);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.clarify.clarify).toMatch(/isn't a user group/);
    });

    it("clarifies (does not guess) on an ambiguous group name", async () => {
        const { list } = countingList(groupsFixture);
        const result = await resolveGroupRefs(["Ops"], { verb: "add", listGroups: list });
        expect(result.ok).toBe(false);
        if (!result.ok) expect((result.clarify.options ?? []).map((o) => o.id).sort()).toEqual(["g2", "g3"]);
    });

    it("collapses duplicates and ignores blanks", async () => {
        const { list } = countingList(groupsFixture);
        const result = await resolveGroupRefs(["Devs", "  ", "Devs", "g2"], { verb: "add", listGroups: list });
        expect(result).toMatchObject({ ok: true, groupIds: ["g1", "g2"] });
    });
});

describe("resolveTagRefs", () => {
    const tagsFixture = [
        { id: "t1", name: "Deep Work" },
        { id: "t2", name: "Meeting" },
        { id: "t3", name: "Review" },
        { id: "t4", name: "Review" }, // duplicate → ambiguous
    ];

    it("trusts a 24-hex id without listing and resolves names/short ids", async () => {
        const { listed, list } = countingList(tagsFixture);
        const result = await resolveTagRefs([HEX, "Deep Work", "t2"], { verb: "tag", listTags: list });
        expect(result).toMatchObject({ ok: true, tagIds: [HEX, "t1", "t2"] });
        expect(listed.n).toBe(1);
    });

    it("clarifies on an ambiguous tag name with grounded options", async () => {
        const { list } = countingList(tagsFixture);
        const result = await resolveTagRefs(["Review"], { verb: "tag", listTags: list });
        expect(result.ok).toBe(false);
        if (!result.ok) expect((result.clarify.options ?? []).map((o) => o.id).sort()).toEqual(["t3", "t4"]);
    });

    it("clarifies on an unknown tag name", async () => {
        const { list } = countingList(tagsFixture);
        const result = await resolveTagRefs(["Ghost"], { verb: "tag", listTags: list });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.clarify.clarify).toMatch(/isn't a workspace tag/);
    });
});

describe("resolveUserFilter", () => {
    const usersFixture = [
        { id: "000000000000000000000601", name: "Ada Lovelace" },
        { id: "000000000000000000000602", name: "Alan Turing" },
    ];

    it("returns defaultTo without listing when the slot is empty", async () => {
        const { listed, list } = countingList(usersFixture);
        const result = await resolveUserFilter(undefined, { verb: "filter by", meUserId: "x", listUsers: list, defaultTo: "admin-1" });
        expect(result).toEqual({ ok: true, userId: "admin-1" });
        expect(listed.n).toBe(0);
    });

    it("returns undefined (unfiltered) when empty and no defaultTo", async () => {
        const { list } = countingList(usersFixture);
        const result = await resolveUserFilter("  ", { verb: "filter by", meUserId: "x", listUsers: list });
        expect(result).toEqual({ ok: true, userId: undefined });
    });

    it("trusts a 24-hex id without a list call (read-filter happy path)", async () => {
        const { listed, list } = countingList(usersFixture);
        const result = await resolveUserFilter(HEX, { verb: "filter by", meUserId: "x", listUsers: list });
        expect(result).toEqual({ ok: true, userId: HEX });
        expect(listed.n).toBe(0);
    });

    it("resolves a name and clarifies on an unknown member", async () => {
        const { list } = countingList(usersFixture);
        const resolved = await resolveUserFilter("Ada Lovelace", { verb: "filter by", meUserId: "x", listUsers: list });
        expect(resolved).toMatchObject({ ok: true, userId: "000000000000000000000601" });
        const miss = await resolveUserFilter("Nobody", { verb: "filter by", meUserId: "x", listUsers: list });
        expect(miss.ok).toBe(false);
    });
});
