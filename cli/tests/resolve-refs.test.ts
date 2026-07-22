import { describe, expect, it } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import {
    resolveClientId,
    resolveProjectId,
    resolveTagIds,
    resolveTaskId,
} from "../src/commands/resolve-refs.js";

const ID = "b".repeat(24);

type ListCall = Record<string, unknown>;

function clientWith(lists: {
    projects?: unknown[] | ((req: ListCall) => Promise<unknown[]>);
    clients?: unknown[] | ((req: ListCall) => Promise<unknown[]>);
    tasks?: unknown[] | ((req: ListCall) => Promise<unknown[]>);
    tags?: unknown[] | ((req: ListCall) => Promise<unknown[]>);
}): ClockifyClient {
    const list = (rows?: unknown[] | ((req: ListCall) => Promise<unknown[]>)) =>
        async (req: ListCall): Promise<unknown[]> =>
            typeof rows === "function" ? rows(req) : (rows ?? []);
    return {
        projects: { list: list(lists.projects) },
        clients: { list: list(lists.clients) },
        tasks: { list: list(lists.tasks) },
        tags: { list: list(lists.tags) },
    } as unknown as ClockifyClient;
}

function pagedRows(rows: unknown[], calls: ListCall[]): (req: ListCall) => Promise<unknown[]> {
    return async (req) => {
        calls.push(req);
        const page = Number(req.page ?? 1);
        const pageSize = Number(req["page-size"] ?? 50);
        return rows.slice((page - 1) * pageSize, page * pageSize);
    };
}

describe("resolve-refs direct entry points", () => {
    it("resolveClientId passes a 24-hex id through untouched", async () => {
        await expect(resolveClientId(clientWith({}), "ws-1", ID)).resolves.toBe(ID);
    });

    it("passes a project id through without listing, then resolves a named project", async () => {
        const calls: ListCall[] = [];
        const client = clientWith({
            projects: async (request) => {
                calls.push(request);
                return [{ id: "p-7", name: "Launch" }];
            },
        });

        await expect(resolveProjectId(client, "ws-1", ID)).resolves.toBe(ID);
        expect(calls).toEqual([]);
        await expect(resolveProjectId(client, "ws-1", "launch")).resolves.toBe("p-7");
        expect(calls).toEqual([
            expect.objectContaining({ workspaceId: "ws-1", name: "launch", page: 1, "page-size": 200 }),
        ]);
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

    it("treats an empty client name as missing after pagination", async () => {
        const calls: ListCall[] = [];
        const client = clientWith({ clients: pagedRows([], calls) });

        await expect(resolveClientId(client, "ws-1", "")).rejects.toThrow(
            'client "" not found in workspace',
        );
        expect(calls).toEqual([
            expect.objectContaining({ workspaceId: "ws-1", name: "", page: 1, "page-size": 200 }),
        ]);
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

    it("resolveClientId finds an exact match beyond the first 200 rows", async () => {
        const calls: ListCall[] = [];
        const filler = Array.from({ length: 200 }, (_, index) => ({
            id: `c-${index}`,
            name: `Client ${index}`,
        }));
        const client = clientWith({
            clients: pagedRows([...filler, { id: "c-target", name: "Globex" }], calls),
        });

        await expect(resolveClientId(client, "ws-1", "Globex")).resolves.toBe("c-target");
        expect(calls.map((call) => call.page)).toEqual([1, 2]);
        expect(calls.every((call) => call["page-size"] === 200)).toBe(true);
    });

    it("resolveClientId detects exact-name ambiguity across pages", async () => {
        const calls: ListCall[] = [];
        const filler = Array.from({ length: 199 }, (_, index) => ({
            id: `c-${index}`,
            name: `Client ${index}`,
        }));
        const client = clientWith({
            clients: pagedRows(
                [{ id: "c-first", name: "Dup" }, ...filler, { id: "c-second", name: "Dup" }],
                calls,
            ),
        });

        await expect(resolveClientId(client, "ws-1", "Dup")).rejects.toThrow(
            /multiple clients named/,
        );
        expect(calls.map((call) => call.page)).toEqual([1, 2]);
    });

    it("resolveTaskId resolves within a project and reports the project on miss", async () => {
        const ok = clientWith({ tasks: [{ id: "tk-1", name: "QA" }] });
        await expect(resolveTaskId(ok, "ws-1", "p-1", "QA")).resolves.toBe("tk-1");
        await expect(
            resolveTaskId(clientWith({ tasks: [] }), "ws-1", "p-1", "Missing"),
        ).rejects.toThrow(/task "Missing" not found on project p-1/);
    });

    it("resolves task ids and names in scope, but rejects ambiguous task names", async () => {
        const calls: ListCall[] = [];
        const client = clientWith({
            tasks: async (request) => {
                calls.push(request);
                return [
                    { id: "task-active", name: "Deploy", archived: false },
                    { id: "task-archived", name: "Deploy", archived: true },
                ];
            },
        });

        await expect(resolveTaskId(client, "ws-1", "p-1", ID)).resolves.toBe(ID);
        expect(calls).toEqual([]);
        await expect(resolveTaskId(client, "ws-1", "p-1", "deploy")).resolves.toBe("task-active");
        expect(calls).toEqual([
            expect.objectContaining({
                workspaceId: "ws-1",
                projectId: "p-1",
                name: "deploy",
                page: 1,
                "page-size": 200,
            }),
        ]);

        await expect(
            resolveTaskId(
                clientWith({
                    tasks: [
                        { id: "task-1", name: "Deploy" },
                        { id: "task-2", name: "Deploy" },
                    ],
                }),
                "ws-1",
                "p-1",
                "Deploy",
            ),
        ).rejects.toThrow(/multiple tasks named "Deploy" on project p-1/);
    });

    it("resolveTagIds maps ids and active names in order without listing ids", async () => {
        const calls: ListCall[] = [];
        const client = clientWith({
            tags: async (request) => {
                calls.push(request);
                return [
                    { id: "t-archived", name: "Deep", archived: true },
                    { id: "t-2", name: "Deep", archived: false },
                ];
            },
        });
        await expect(resolveTagIds(client, "ws-1", [ID, "Deep"])).resolves.toEqual([
            ID,
            "t-2",
        ]);
        expect(calls).toEqual([
            expect.objectContaining({ workspaceId: "ws-1", name: "Deep", page: 1, "page-size": 200 }),
        ]);
    });

    it("returns no tag ids for an empty input without calling the API", async () => {
        const calls: ListCall[] = [];
        const client = clientWith({
            tags: async (request) => {
                calls.push(request);
                return [];
            },
        });

        await expect(resolveTagIds(client, "ws-1", [])).resolves.toEqual([]);
        expect(calls).toEqual([]);
    });
});
