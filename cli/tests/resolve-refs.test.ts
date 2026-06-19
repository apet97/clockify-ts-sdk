import { describe, expect, it } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import {
    resolveClientId,
    resolveProjectId,
    resolveTagIds,
    resolveTaskId,
} from "../src/commands/resolve-refs.js";

const ID = "b".repeat(24);

function clientWith(lists: {
    projects?: unknown[];
    clients?: unknown[];
    tasks?: unknown[];
    tags?: unknown[];
}): ClockifyClient {
    return {
        projects: { list: async () => lists.projects ?? [] },
        clients: { list: async () => lists.clients ?? [] },
        tasks: { list: async () => lists.tasks ?? [] },
        tags: { list: async () => lists.tags ?? [] },
    } as unknown as ClockifyClient;
}

describe("resolve-refs direct entry points", () => {
    it("resolveClientId passes a 24-hex id through untouched", async () => {
        await expect(resolveClientId(clientWith({}), "ws-1", ID)).resolves.toBe(ID);
    });

    it("resolveClientId resolves a unique name case-insensitively", async () => {
        const client = clientWith({ clients: [{ id: "c-7", name: "Globex" }] });
        await expect(resolveClientId(client, "ws-1", "globex")).resolves.toBe("c-7");
    });

    it("resolveClientId throws a clear not-found error", async () => {
        await expect(resolveClientId(clientWith({ clients: [] }), "ws-1", "Nope")).rejects.toThrow(
            /client "Nope" not found/,
        );
    });

    it("resolveClientId throws a clear ambiguity error", async () => {
        const client = clientWith({
            clients: [
                { id: "c-1", name: "Dup" },
                { id: "c-2", name: "Dup" },
            ],
        });
        await expect(resolveClientId(client, "ws-1", "Dup")).rejects.toThrow(
            /multiple clients named/,
        );
    });

    it("resolveTaskId resolves within a project and reports the project on miss", async () => {
        const ok = clientWith({ tasks: [{ id: "tk-1", name: "QA" }] });
        await expect(resolveTaskId(ok, "ws-1", "p-1", "QA")).resolves.toBe("tk-1");
        await expect(
            resolveTaskId(clientWith({ tasks: [] }), "ws-1", "p-1", "Missing"),
        ).rejects.toThrow(/task "Missing" not found on project p-1/);
    });

    it("resolveProjectId passes ids through and resolves names", async () => {
        await expect(resolveProjectId(clientWith({}), "ws-1", ID)).resolves.toBe(ID);
        const client = clientWith({ projects: [{ id: "p-3", name: "Site" }] });
        await expect(resolveProjectId(client, "ws-1", "Site")).resolves.toBe("p-3");
    });

    it("resolveTagIds maps a mix of ids and names, preserving order", async () => {
        const client = clientWith({ tags: [{ id: "t-2", name: "Deep" }] });
        await expect(resolveTagIds(client, "ws-1", [ID, "Deep"])).resolves.toEqual([
            ID,
            "t-2",
        ]);
    });
});
