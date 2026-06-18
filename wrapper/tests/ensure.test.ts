import { describe, expect, it, vi } from "vitest";

import { _resetWarnOnceForTests } from "../deprecation.js";
import {
    archiveThenDeleteProject,
    ensureClient,
    ensureProject,
    ensureTag,
    findOrCreateClient,
    type NamedRecord,
} from "../ensure.js";

const tags: NamedRecord[] = [
    { id: "tag_1", name: "Billable" },
    { id: "tag_2", name: "Internal", archived: true },
];

describe("ensureTag", () => {
    it("reuses an existing tag by case-insensitive name without creating", async () => {
        let created = 0;
        const result = await ensureTag({
            name: "billable",
            list: async () => tags,
            create: async (name) => {
                created += 1;
                return { id: "tag_new", name };
            },
        });
        expect(result.created).toBe(false);
        expect(result.id).toBe("tag_1");
        expect(created).toBe(0);
    });

    it("creates when no active match exists", async () => {
        const result = await ensureTag({
            name: "Urgent",
            list: async () => tags,
            create: async (name) => ({ id: "tag_new", name }),
        });
        expect(result.created).toBe(true);
        expect(result.entity.name).toBe("Urgent");
        expect(result.id).toBe("tag_new");
    });

    it("does not reuse an archived match unless includeArchived is set", async () => {
        const result = await ensureTag({
            name: "Internal",
            list: async () => tags,
            create: async (name) => ({ id: "tag_new", name }),
        });
        expect(result.created).toBe(true);

        const reused = await ensureTag({
            name: "Internal",
            includeArchived: true,
            list: async () => tags,
            create: async (name) => ({ id: "tag_new", name }),
        });
        expect(reused.created).toBe(false);
        expect(reused.id).toBe("tag_2");
    });

    it("throws on an ambiguous active match rather than guessing", async () => {
        await expect(
            ensureTag({
                name: "Dup",
                list: async () => [
                    { id: "a", name: "Dup" },
                    { id: "b", name: "dup" },
                ],
                create: async (name) => ({ id: "c", name }),
            }),
        ).rejects.toThrow(/More than one tag/);
    });
});

describe("ensureProject / ensureClient", () => {
    it("ensureProject reuses by name", async () => {
        const result = await ensureProject({
            name: "Acme",
            list: async () => [{ id: "p_1", name: "Acme" }],
            create: async (name) => ({ id: "p_new", name }),
        });
        expect(result).toEqual({ entity: { id: "p_1", name: "Acme" }, id: "p_1", created: false });
    });

    it("ensureClient creates when missing", async () => {
        const result = await ensureClient({
            name: "New Co",
            list: async () => [],
            create: async (name) => ({ id: "c_new", name }),
        });
        expect(result.created).toBe(true);
        expect(result.entity.name).toBe("New Co");
    });

    it("findOrCreateClient is a deprecated alias that warns once and delegates to ensureClient", async () => {
        _resetWarnOnceForTests();
        const prevEnv = process.env.NODE_ENV;
        delete process.env.NODE_ENV; // warnOnce is silent under NODE_ENV=test
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            const result = await findOrCreateClient({
                name: "Legacy Co",
                list: async () => [],
                create: async (name) => ({ id: "c_legacy", name }),
            });
            expect(result.created).toBe(true);
            expect(result.entity.name).toBe("Legacy Co");
            const warned = warnSpy.mock.calls.map((c) => String(c[0]));
            expect(warned.some((m) => m.includes("findOrCreateClient") && m.includes("ensureClient"))).toBe(true);
        } finally {
            warnSpy.mockRestore();
            if (prevEnv !== undefined) process.env.NODE_ENV = prevEnv;
            _resetWarnOnceForTests();
        }
    });
});

describe("archiveThenDeleteProject", () => {
    it("archives before deleting an active project", async () => {
        const calls: string[] = [];
        const result = await archiveThenDeleteProject({
            projectId: "p_1",
            archiveProject: async () => {
                calls.push("archive");
            },
            deleteProject: async () => {
                calls.push("delete");
            },
        });
        expect(calls).toEqual(["archive", "delete"]);
        expect(result).toEqual({ projectId: "p_1", archived: true, deleted: true });
    });

    it("skips the archive step when alreadyArchived is set", async () => {
        const calls: string[] = [];
        const result = await archiveThenDeleteProject({
            projectId: "p_2",
            alreadyArchived: true,
            archiveProject: async () => {
                calls.push("archive");
            },
            deleteProject: async () => {
                calls.push("delete");
            },
        });
        expect(calls).toEqual(["delete"]);
        expect(result.archived).toBe(false);
        expect(result.deleted).toBe(true);
    });
});
