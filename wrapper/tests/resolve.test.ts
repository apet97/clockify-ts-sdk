import { describe, expect, it } from "vitest";

import {
    looksLikeClockifyId,
    matchByName,
    resolveEntityRef,
    resolveProjectTaskRefs,
    resolveUserRef,
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
