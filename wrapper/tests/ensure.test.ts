import { describe, expect, it } from "vitest";

import {
    archiveThenDeleteClient,
    archiveThenDeleteProject,
    ensureClient,
    ensureProject,
    ensureTag,
    type NamedRecord,
} from "../ensure.js";

const tags: NamedRecord[] = [
    { id: "tag_1", name: "Billable" },
    { id: "tag_2", name: "Internal", archived: true },
];

describe("ensureTag", () => {
    it("coalesces concurrent calls sharing a scopeKey, then clears the completed flight", async () => {
        let creates = 0;
        const options = {
            name: "Concurrent",
            scopeKey: "workspace-1:tag:concurrent",
            list: async () => [],
            create: async (name: string) => {
                creates += 1;
                await Promise.resolve();
                return { id: `tag-new-${creates}`, name };
            },
        };
        const [first, second] = await Promise.all([ensureTag(options), ensureTag(options)]);
        expect(creates).toBe(1);
        expect(first).toEqual(second);
        await expect(ensureTag(options)).resolves.toMatchObject({ id: "tag-new-2", created: true });
        expect(creates).toBe(2);
    });

    it("clears a failed single-flight so a later call can retry", async () => {
        let attempts = 0;
        const options = {
            name: "Retry",
            scopeKey: "workspace-1:tag:retry",
            list: async () => {
                attempts += 1;
                if (attempts === 1) throw new Error("temporary list failure");
                return [];
            },
            create: async (name: string) => ({ id: "tag-retry", name }),
        };

        await expect(ensureTag(options)).rejects.toThrow("temporary list failure");
        await expect(ensureTag(options)).resolves.toMatchObject({ id: "tag-retry", created: true });
        expect(attempts).toBe(2);
    });
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

    it("ensureClient preserves the former alias's create-when-missing behavior", async () => {
        const result = await ensureClient({
            name: "New Co",
            list: async () => [],
            create: async (name) => ({ id: "c_new", name }),
        });
        expect(result.created).toBe(true);
        expect(result.entity.name).toBe("New Co");
    });

    it.each([
        ["project", ensureProject],
        ["client", ensureClient],
    ] as const)(
        "uses the %s noun when an ambiguous name needs intervention",
        async (noun, ensure) => {
            await expect(
                ensure({
                    name: "Duplicate",
                    list: async () => [
                        { id: "first", name: "Duplicate" },
                        { id: "second", name: "duplicate" },
                    ],
                    create: async (name) => ({ id: "new", name }),
                }),
            ).rejects.toThrow(new RegExp(`More than one ${noun} is named`));
        },
    );
});

/**
 * A capturing fake of an SDK resource (`client.projects` / `client.clients`): it
 * returns `name` from `get` and records every request it receives, so a test can
 * assert BOTH the call order and the exact archive request body shape (flattened
 * for a project, body-envelope for a client).
 */
function fakeAdapter(
    current: string | undefined | Record<string, unknown>,
    { failArchive = false }: { failArchive?: boolean } = {},
) {
    const order: string[] = [];
    const archiveInputs: unknown[] = [];
    const currentRecord =
        current !== null && typeof current === "object" ? current : { name: current };
    return {
        order,
        archiveInputs,
        adapter: {
            getCurrent: async (_target: { workspaceId: string; id: string }) => {
                order.push("getCurrent");
                return { ...currentRecord };
            },
            archive: async (input: unknown) => {
                order.push("archive");
                archiveInputs.push(input);
                if (failArchive) throw new Error("archive failed");
            },
            delete: async (_target: { workspaceId: string; id: string }) => {
                order.push("delete");
            },
        },
    };
}

describe("archiveThenDeleteProject", () => {
    it("GETs the name, archives (flattened archived:true), then deletes — in that order", async () => {
        const f = fakeAdapter("Acme");
        const result = await archiveThenDeleteProject({
            workspaceId: "ws",
            id: "p_1",
            adapter: f.adapter,
        });
        expect(f.order).toEqual(["getCurrent", "archive", "delete"]);
        expect(f.archiveInputs).toEqual([
            { workspaceId: "ws", id: "p_1", current: { name: "Acme" } },
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
        const f = fakeAdapter("Acme");
        const result = await archiveThenDeleteProject({
            workspaceId: "ws",
            id: "p_2",
            adapter: f.adapter,
            alreadyArchived: true,
        });
        expect(f.order).toEqual(["delete"]);
        expect(f.archiveInputs).toEqual([]);
        expect(result.archived).toBe(false);
        expect(result.deleted).toBe(true);
    });

    it("throws BEFORE archiving when the entity has no name to carry through the replace-PUT", async () => {
        const f = fakeAdapter(undefined); // no name on the wire
        await expect(
            archiveThenDeleteProject({ workspaceId: "ws", id: "p_3", adapter: f.adapter }),
        ).rejects.toThrow(/Cannot archive project before delete.*no name/);
        // The guard short-circuits after the GET: no archive, no delete.
        expect(f.order).toEqual(["getCurrent"]);
        expect(f.archiveInputs).toEqual([]);
    });

    it("rejects a truthy non-string current name before the replacement archive", async () => {
        const f = fakeAdapter({ name: 123 });
        await expect(
            archiveThenDeleteProject({ workspaceId: "ws", id: "p_non_string", adapter: f.adapter }),
        ).rejects.toThrow(/Cannot archive project before delete.*no name/);
        expect(f.order).toEqual(["getCurrent"]);
        expect(f.archiveInputs).toEqual([]);
    });

    it("does not delete when the replacement archive fails", async () => {
        const f = fakeAdapter("Acme", { failArchive: true });
        await expect(
            archiveThenDeleteProject({ workspaceId: "ws", id: "p_4", adapter: f.adapter }),
        ).rejects.toThrow("archive failed");
        expect(f.order).toEqual(["getCurrent", "archive"]);
    });
});

describe("archiveThenDeleteClient", () => {
    it("GETs the name, archives via the BODY-ENVELOPE quirk, then deletes — in that order", async () => {
        const f = fakeAdapter("Globex");
        const result = await archiveThenDeleteClient({
            workspaceId: "ws",
            id: "c_1",
            adapter: f.adapter,
        });
        expect(f.order).toEqual(["getCurrent", "archive", "delete"]);
        expect(f.archiveInputs).toEqual([
            { workspaceId: "ws", id: "c_1", current: { name: "Globex" } },
        ]);
        expect(result).toEqual({
            id: "c_1",
            projectId: "c_1",
            clientId: "c_1",
            archived: true,
            deleted: true,
        });
    });

    it("preserves every current editable value while archiving, including false and empty strings", async () => {
        const f = fakeAdapter({
            name: "Globex",
            address: "",
            currencyCode: "USD",
            email: "",
            note: "",
            archived: false,
        });

        await archiveThenDeleteClient({
            workspaceId: "ws",
            id: "c_preserve",
            adapter: f.adapter,
        });

        expect(f.archiveInputs).toEqual([
            {
                workspaceId: "ws",
                id: "c_preserve",
                current: {
                    name: "Globex",
                    address: "",
                    currencyCode: "USD",
                    email: "",
                    note: "",
                    archived: false,
                },
            },
        ]);
    });

    it("bypasses get-current and replacement archive when already archived", async () => {
        const f = fakeAdapter("Globex");
        const result = await archiveThenDeleteClient({
            workspaceId: "ws",
            id: "c_archived",
            adapter: f.adapter,
            alreadyArchived: true,
        });

        expect(f.order).toEqual(["delete"]);
        expect(f.archiveInputs).toEqual([]);
        expect(result).toMatchObject({ archived: false, deleted: true });
    });

    it("throws (noun 'client') BEFORE archiving when the client has no name", async () => {
        const f = fakeAdapter(""); // empty name
        await expect(
            archiveThenDeleteClient({ workspaceId: "ws", id: "c_2", adapter: f.adapter }),
        ).rejects.toThrow(/Cannot archive client before delete.*no name/);
        expect(f.order).toEqual(["getCurrent"]);
        expect(f.archiveInputs).toEqual([]);
    });
});
