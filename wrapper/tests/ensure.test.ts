import { describe, expect, it, vi } from "vitest";

import { _resetWarnOnceForTests } from "../deprecation.js";
import {
    archiveThenDeleteClient,
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

/**
 * A capturing fake of an SDK resource (`client.projects` / `client.clients`): it
 * returns `name` from `get` and records every request it receives, so a test can
 * assert BOTH the call order and the exact archive request body shape (flattened
 * for a project, body-envelope for a client).
 */
function fakeResource(name: string | undefined) {
    const order: string[] = [];
    const updateReqs: unknown[] = [];
    return {
        order,
        updateReqs,
        resource: {
            get: async (req: { workspaceId: string } & Record<string, unknown>) => {
                order.push("get");
                return { name, ...req };
            },
            update: async (req: unknown) => {
                order.push("update");
                updateReqs.push(req);
                return req as object;
            },
            delete: async (_req: { workspaceId: string } & Record<string, unknown>) => {
                order.push("delete");
                return undefined;
            },
        },
    };
}

describe("archiveThenDeleteProject", () => {
    it("GETs the name, archives (flattened archived:true), then deletes — in that order", async () => {
        const f = fakeResource("Acme");
        const result = await archiveThenDeleteProject({
            workspaceId: "ws",
            id: "p_1",
            resource: f.resource,
        });
        expect(f.order).toEqual(["get", "update", "delete"]);
        // A project archives via the FLATTENED shape (its whitelist has `archived`),
        // carrying the GET-ed name through the replace-PUT.
        expect(f.updateReqs).toEqual([
            { workspaceId: "ws", projectId: "p_1", name: "Acme", archived: true },
        ]);
        expect(result).toEqual({
            id: "p_1",
            projectId: "p_1",
            clientId: "p_1",
            archived: true,
            deleted: true,
        });
    });

    it("skips the GET + archive steps when alreadyArchived is set", async () => {
        const f = fakeResource("Acme");
        const result = await archiveThenDeleteProject({
            workspaceId: "ws",
            id: "p_2",
            resource: f.resource,
            alreadyArchived: true,
        });
        expect(f.order).toEqual(["delete"]);
        expect(f.updateReqs).toEqual([]);
        expect(result.archived).toBe(false);
        expect(result.deleted).toBe(true);
    });

    it("throws BEFORE archiving when the entity has no name to carry through the replace-PUT", async () => {
        const f = fakeResource(undefined); // no name on the wire
        await expect(
            archiveThenDeleteProject({ workspaceId: "ws", id: "p_3", resource: f.resource }),
        ).rejects.toThrow(/Cannot archive project before delete.*no name/);
        // The guard short-circuits after the GET: no archive, no delete.
        expect(f.order).toEqual(["get"]);
        expect(f.updateReqs).toEqual([]);
    });
});

describe("archiveThenDeleteClient", () => {
    it("GETs the name, archives via the BODY-ENVELOPE quirk, then deletes — in that order", async () => {
        const f = fakeResource("Globex");
        const result = await archiveThenDeleteClient({
            workspaceId: "ws",
            id: "c_1",
            resource: f.resource,
        });
        expect(f.order).toEqual(["get", "update", "delete"]);
        // A client MUST archive via the BODY-ENVELOPE shape — the flattened
        // clients.update drops `archived` (field whitelist), so the envelope is the
        // only path that lands archived:true on the wire. It carries the GET-ed name.
        expect(f.updateReqs).toEqual([
            { workspaceId: "ws", clientId: "c_1", body: { name: "Globex", archived: true } },
        ]);
        expect(result).toEqual({
            id: "c_1",
            projectId: "c_1",
            clientId: "c_1",
            archived: true,
            deleted: true,
        });
    });

    it("throws (noun 'client') BEFORE archiving when the client has no name", async () => {
        const f = fakeResource(""); // empty name
        await expect(
            archiveThenDeleteClient({ workspaceId: "ws", id: "c_2", resource: f.resource }),
        ).rejects.toThrow(/Cannot archive client before delete.*no name/);
        expect(f.order).toEqual(["get"]);
        expect(f.updateReqs).toEqual([]);
    });
});
