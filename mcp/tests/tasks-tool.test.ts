/**
 * Behaviour coverage for the six `clockify_tasks_*` domain tools
 * (`src/tools/tasks.ts`). Sibling suites already pin the
 * archive-then-delete ordering (archive-then-delete.test.ts), the
 * HOURLY rate happy path (rates.test.ts), and the confirm-guard matrix
 * (confirm-guard-matrix.test.ts). This file targets the previously
 * untested branches: list pagination/name filtering + hasMore, the
 * optional-field spreads in create/update, the COST rate arm and `since`
 * branch, the delete dry_run preview / invalid-token / missing-token
 * handshake, and the `errorResult` envelope for thrown 4xx errors.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

interface TasksStub {
    list?: (req: unknown) => Promise<unknown>;
    create?: (req: unknown) => Promise<unknown>;
    get?: (req: unknown) => Promise<unknown>;
    update?: (req: unknown) => Promise<unknown>;
    delete?: (req: unknown) => Promise<unknown>;
    updateBillableRate?: (req: unknown) => Promise<unknown>;
    updateCostRate?: (req: unknown) => Promise<unknown>;
}

function tasksContext(tasks: TasksStub): Context {
    return {
        workspaceId: "ws-1",
        client: { tasks } as never,
    };
}

/** A plain Error carrying a Clockify HTTP status, classified by errorCodeForStatus. */
function httpError(message: string, statusCode: number): Error {
    return Object.assign(new Error(message), { statusCode });
}

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test-harness", version: "0.0.0" });
    await client.connect(clientTransport);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function envelope(res: unknown): Record<string, unknown> {
    const text = (res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}";
    return JSON.parse(text) as Record<string, unknown>;
}

function responseAware<T>(data: T, headers: Record<string, string>) {
    const promise = Promise.resolve(data) as Promise<T> & {
        withRawResponse(): Promise<{ data: T; rawResponse: { headers: Headers } }>;
    };
    promise.withRawResponse = async () => ({ data, rawResponse: { headers: new Headers(headers) } });
    return promise;
}

describe("clockify_tasks_list", () => {
    it("omits the name filter and defaults page/page-size, reporting hasMore=true on a full page", async () => {
        const captured: Record<string, unknown> = {};
        const rows = Array.from({ length: 50 }, (_, i) => ({ id: `t-${i}` }));
        const client = await connect(
            tasksContext({
                list: async (req) => {
                    captured.list = req;
                    return rows;
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_list",
            arguments: { projectId: "proj-1" },
        });
        expect(res.isError).toBeFalsy();
        // No `name` arg => the `if (args.name)` branch is skipped entirely.
        expect(captured.list).toEqual({
            workspaceId: "ws-1",
            projectId: "proj-1",
            page: 1,
            "page-size": 50,
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        const meta = json.meta as {
            count?: number;
            page?: number;
            pageSize?: number;
            hasMore?: boolean;
            projectId?: string;
        };
        expect(meta.count).toBe(50);
        expect(meta.page).toBe(1);
        expect(meta.pageSize).toBe(50);
        expect(meta.projectId).toBe("proj-1");
        // rows.length === pageSize default => hasMore true.
        expect(meta.hasMore).toBe(true);
    });

    it("forwards the name filter + explicit pagination and reports hasMore=false on a short page", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            tasksContext({
                list: async (req) => {
                    captured.list = req;
                    return [{ id: "t-1" }, { id: "t-2" }];
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_list",
            arguments: { projectId: "proj-1", name: "Design", page: 3, pageSize: 25 },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.list).toEqual({
            workspaceId: "ws-1",
            projectId: "proj-1",
            page: 3,
            "page-size": 25,
            name: "Design",
        });
        const meta = envelope(res).meta as { page?: number; pageSize?: number; hasMore?: boolean; count?: number };
        expect(meta.page).toBe(3);
        expect(meta.pageSize).toBe(25);
        expect(meta.count).toBe(2);
        // 2 rows !== pageSize 25 => hasMore false.
        expect(meta.hasMore).toBe(false);
    });

    it("uses Last-Page:true to report no more rows on a full page", async () => {
        const client = await connect(
            tasksContext({
                list: () =>
                    responseAware([{ id: "t-1" }, { id: "t-2" }], {
                        "Last-Page": "true",
                    }) as unknown as Promise<unknown>,
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_list",
            arguments: { projectId: "proj-1", pageSize: 2 },
        });
        const meta = envelope(res).meta as { hasMore?: boolean; lastPageHeader?: boolean };
        expect(meta.hasMore).toBe(false);
        expect(meta.lastPageHeader).toBe(true);
    });

    it("classifies a thrown 404 as not_found in the error envelope and carries the tailored recovery hint", async () => {
        const client = await connect(
            tasksContext({
                list: async () => {
                    throw httpError("project not found", 404);
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_list",
            arguments: { projectId: "missing" },
        });
        expect(res.isError).toBe(true);
        const json = envelope(res);
        expect(json.ok).toBe(false);
        const err = json.error as { code?: string; message?: string };
        expect(err.code).toBe("not_found");
        expect(err.message).toBe("project not found");
        // The tool registered a custom recovery string; errorResult surfaces it verbatim.
        expect((json.recovery as { hint?: string }).hint).toBe("Verify the projectId exists in this workspace.");
    });
});

describe("clockify_tasks_create", () => {
    it("sends only name when estimate/assigneeIds are absent and emits a created receipt with id+name", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            tasksContext({
                create: async (req) => {
                    captured.create = req;
                    return { id: "task-9", name: "Build" };
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_create",
            arguments: { projectId: "proj-1", name: "Build" },
        });
        expect(res.isError).toBeFalsy();
        // Both optional spreads collapse to {} => body has name only.
        expect(captured.create).toEqual({
            workspaceId: "ws-1",
            projectId: "proj-1",
            body: { name: "Build" },
        });
        const json = envelope(res);
        expect(json.entity).toBe("task");
        const created = (json.changed as { created?: Array<{ type: string; id: string; name?: string }> }).created;
        expect(created).toEqual([{ type: "task", id: "task-9", name: "Build" }]);
        // Chain-to-next hint: log work against the new task, carrying project + task ids.
        const next = json.next as Array<{ tool?: string; args?: { project_id?: string; task_id?: string } }>;
        expect(next[0]?.tool).toBe("clockify_log_work");
        expect(next[0]?.args).toEqual({ project_id: "proj-1", task_id: "task-9" });
    });

    it("includes estimate and assigneeIds in the body when supplied", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            tasksContext({
                create: async (req) => {
                    captured.create = req;
                    return { id: "task-10", name: "Spec" };
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_create",
            arguments: {
                projectId: "proj-1",
                name: "Spec",
                estimate: "PT8H",
                assigneeIds: ["u-1", "u-2"],
            },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.create).toEqual({
            workspaceId: "ws-1",
            projectId: "proj-1",
            body: { name: "Spec", estimate: "PT8H", assigneeIds: ["u-1", "u-2"] },
        });
    });

    it("surfaces a thrown 409 conflict as the conflict error code", async () => {
        const client = await connect(
            tasksContext({
                create: async () => {
                    throw httpError("Task already exists", 409);
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_create",
            arguments: { projectId: "proj-1", name: "Dup" },
        });
        expect(res.isError).toBe(true);
        const json = envelope(res);
        expect((json.error as { code?: string }).code).toBe("conflict");
        // No custom recovery on create => the default recovery for the code is used.
        expect((json.recovery as { retryable?: boolean }).retryable).toBe(false);
    });
});

describe("clockify_tasks_get", () => {
    it("pins the workspace and returns the task read-only (no changed receipt)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            tasksContext({
                get: async (req) => {
                    captured.get = req;
                    return { id: "t-1", name: "Read" };
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_get",
            arguments: { projectId: "proj-1", taskId: "t-1" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.get).toEqual({ workspaceId: "ws-1", projectId: "proj-1", taskId: "t-1" });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.changed).toBeUndefined();
        const meta = json.meta as { taskId?: string; projectId?: string };
        expect(meta.taskId).toBe("t-1");
        expect(meta.projectId).toBe("proj-1");
        expect((json.data as { id?: string }).id).toBe("t-1");
    });

    it("classifies a thrown 401 as auth_or_permission", async () => {
        const client = await connect(
            tasksContext({
                get: async () => {
                    throw httpError("unauthorized", 401);
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_get",
            arguments: { projectId: "proj-1", taskId: "t-1" },
        });
        expect(res.isError).toBe(true);
        expect((envelope(res).error as { code?: string }).code).toBe("auth_or_permission");
    });
});

describe("clockify_tasks_update", () => {
    it("includes every supplied field — keeping billable:false — and casts status onto the wired body", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            tasksContext({
                update: async (req) => {
                    captured.update = req;
                    return { id: "t-1" };
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_update",
            arguments: {
                projectId: "proj-1",
                taskId: "t-1",
                name: "Renamed",
                billable: false,
                estimate: "PT2H",
                status: "DONE",
                assigneeIds: ["u-1"],
            },
        });
        expect(res.isError).toBeFalsy();
        // The mutable fields are collected into `body` (wireBody returns the
        // {workspaceId,...,body} envelope verbatim); billable:false must survive
        // because the guard is `!== undefined`, not truthiness.
        expect(captured.update).toEqual({
            workspaceId: "ws-1",
            projectId: "proj-1",
            taskId: "t-1",
            body: {
                name: "Renamed",
                billable: false,
                estimate: "PT2H",
                status: "DONE",
                assigneeIds: ["u-1"],
            },
        });
        const json = envelope(res);
        expect(json.entity).toBe("task");
        const updated = (json.changed as { updated?: Array<{ id: string }> }).updated;
        expect(updated).toEqual([{ type: "task", id: "t-1" }]);
        expect((json.meta as { taskId?: string }).taskId).toBe("t-1");
    });

    it("wires an empty body when no mutable fields are supplied", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            tasksContext({
                update: async (req) => {
                    captured.update = req;
                    return { id: "t-1" };
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_update",
            arguments: { projectId: "proj-1", taskId: "t-1" },
        });
        expect(res.isError).toBeFalsy();
        // Every `if` branch is false => body stays {}.
        expect(captured.update).toEqual({
            workspaceId: "ws-1",
            projectId: "proj-1",
            taskId: "t-1",
            body: {},
        });
    });

    it("surfaces a thrown 400 invalid_request from the update call", async () => {
        const client = await connect(
            tasksContext({
                update: async () => {
                    throw httpError("Bad status value", 400);
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_update",
            arguments: { projectId: "proj-1", taskId: "t-1", status: "NOPE" },
        });
        expect(res.isError).toBe(true);
        expect((envelope(res).error as { code?: string }).code).toBe("invalid_request");
    });
});

describe("clockify_tasks_set_rate", () => {
    it("COST routes to updateCostRate, converts major→minor, forwards `since`, and reports both amounts", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            tasksContext({
                updateCostRate: async (req) => {
                    captured.cost = req;
                    return { id: "t-1" };
                },
                updateBillableRate: async (req) => {
                    captured.billable = req;
                    return { id: "t-1" };
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_set_rate",
            arguments: {
                projectId: "proj-1",
                taskId: "t-1",
                rateKind: "COST",
                amount: 75.5,
                since: "2026-06-01",
            },
        });
        expect(res.isError).toBeFalsy();
        // COST arm only; billable arm untouched.
        expect(captured.billable).toBeUndefined();
        expect(captured.cost).toEqual({
            workspaceId: "ws-1",
            projectId: "proj-1",
            taskId: "t-1",
            amount: 7550,
            since: "2026-06-01",
        });
        const meta = envelope(res).meta as {
            rateKind?: string;
            amountMajor?: number;
            amountMinor?: number;
        };
        expect(meta.rateKind).toBe("COST");
        expect(meta.amountMajor).toBe(75.5);
        expect(meta.amountMinor).toBe(7550);
    });

    it("HOURLY omits `since` when not supplied and routes to updateBillableRate", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            tasksContext({
                updateBillableRate: async (req) => {
                    captured.billable = req;
                    return { id: "t-1" };
                },
                updateCostRate: async (req) => {
                    captured.cost = req;
                    return { id: "t-1" };
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_set_rate",
            arguments: { projectId: "proj-1", taskId: "t-1", rateKind: "HOURLY", amount: 50 },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.cost).toBeUndefined();
        // No `since` key (the `if (args.since)` branch is skipped).
        expect(captured.billable).toEqual({
            workspaceId: "ws-1",
            projectId: "proj-1",
            taskId: "t-1",
            amount: 5000,
        });
    });

    it("rejects a non-enum rateKind before any rate call (schema validation)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            tasksContext({
                updateBillableRate: async (req) => {
                    captured.billable = req;
                    return { id: "t-1" };
                },
                updateCostRate: async (req) => {
                    captured.cost = req;
                    return { id: "t-1" };
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_set_rate",
            arguments: { projectId: "proj-1", taskId: "t-1", rateKind: "MONTHLY", amount: 10 },
        });
        expect(res.isError).toBe(true);
        // Neither rate endpoint was reached.
        expect(captured.cost).toBeUndefined();
        expect(captured.billable).toBeUndefined();
    });
});

describe("clockify_tasks_delete confirm-guard handshake", () => {
    it("dry_run returns a preview + confirm_token + next action without touching the client", async () => {
        const calls: string[] = [];
        const client = await connect(
            tasksContext({
                get: async () => {
                    calls.push("get");
                    return { id: "t-1", name: "Task" };
                },
                update: async () => {
                    calls.push("update");
                    return {};
                },
                delete: async () => {
                    calls.push("delete");
                    return {};
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_delete",
            arguments: { projectId: "p-1", taskId: "t-1", dry_run: true },
        });
        expect(res.isError).toBeFalsy();
        // No mutation on a preview.
        expect(calls).toEqual([]);
        const json = envelope(res);
        const data = json.data as {
            preview?: { action?: string; entity?: string; id?: string; projectId?: string };
            confirm_token?: string;
            risk_class?: string;
        };
        expect(data.preview).toEqual({ action: "delete", entity: "task", id: "t-1", projectId: "p-1" });
        expect(data.risk_class).toBe("task_delete");
        expect(typeof data.confirm_token).toBe("string");
        expect(data.confirm_token).toBeTruthy();
        // The `next` step echoes the same call with the token wired in.
        const next = json.next as Array<{ tool?: string; args?: Record<string, unknown> }>;
        expect(next[0]?.tool).toBe("clockify_tasks_delete");
        expect(next[0]?.args?.confirm_token).toBe(data.confirm_token);
        expect(next[0]?.args?.projectId).toBe("p-1");
    });

    it("a bogus confirm_token is rejected as invalid_request and never deletes", async () => {
        const calls: string[] = [];
        const client = await connect(
            tasksContext({
                get: async () => {
                    calls.push("get");
                    return { id: "t-1", name: "Task" };
                },
                update: async () => {
                    calls.push("update");
                    return {};
                },
                delete: async () => {
                    calls.push("delete");
                    return {};
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_delete",
            arguments: { projectId: "p-1", taskId: "t-1", confirm_token: "not-a-real-token" },
        });
        expect(res.isError).toBe(true);
        expect(calls).toEqual([]);
        const json = envelope(res);
        // "...was not issued..." matches the invalid_request message regex.
        expect((json.error as { code?: string }).code).toBe("invalid_request");
        expect((json.error as { message?: string }).message).toMatch(/was not issued|expired|already used/);
    });

    it("a confirm_token minted for a different taskId does not satisfy this call", async () => {
        const client = await connect(
            tasksContext({
                get: async () => ({ id: "t-1", name: "Task" }),
                update: async () => ({}),
                delete: async () => ({}),
            }),
        );
        // Mint a token against taskId t-1.
        const dry = envelope(
            await client.callTool({
                name: "clockify_tasks_delete",
                arguments: { projectId: "p-1", taskId: "t-1", dry_run: true },
            }),
        );
        const token = (dry.data as { confirm_token?: string }).confirm_token;
        expect(token).toBeTruthy();
        // Replay it against a DIFFERENT taskId — the payload hash no longer matches.
        const res = await client.callTool({
            name: "clockify_tasks_delete",
            arguments: { projectId: "p-1", taskId: "t-2", confirm_token: token },
        });
        expect(res.isError).toBe(true);
        const json = envelope(res);
        expect((json.error as { code?: string }).code).toBe("invalid_request");
    });

    it("missing both dry_run and confirm_token returns the run-dry_run-first error with a retryable hint", async () => {
        const calls: string[] = [];
        const client = await connect(
            tasksContext({
                get: async () => {
                    calls.push("get");
                    return { id: "t-1", name: "Task" };
                },
                update: async () => {
                    calls.push("update");
                    return {};
                },
                delete: async () => {
                    calls.push("delete");
                    return {};
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tasks_delete",
            arguments: { projectId: "p-1", taskId: "t-1" },
        });
        expect(res.isError).toBe(true);
        expect(calls).toEqual([]);
        const json = envelope(res);
        const recovery = json.recovery as { tool?: string; retryable?: boolean; args?: Record<string, unknown> };
        expect(recovery.tool).toBe("clockify_tasks_delete");
        expect(recovery.retryable).toBe(true);
        expect(recovery.args?.dry_run).toBe(true);
    });

    it("a valid confirm_token marks the task DONE (carrying its name) before deleting", async () => {
        const calls: string[] = [];
        const client = await connect(
            tasksContext({
                get: async () => {
                    calls.push("get");
                    return { id: "t-1", name: "Important task" };
                },
                update: async (req) => {
                    const body = req as { status?: string; name?: string };
                    calls.push(`update:${body.status}:${body.name}`);
                    return {};
                },
                delete: async () => {
                    calls.push("delete");
                    return {};
                },
            }),
        );
        const dry = envelope(
            await client.callTool({
                name: "clockify_tasks_delete",
                arguments: { projectId: "p-1", taskId: "t-1", dry_run: true },
            }),
        );
        const token = (dry.data as { confirm_token?: string }).confirm_token;
        const res = await client.callTool({
            name: "clockify_tasks_delete",
            arguments: { projectId: "p-1", taskId: "t-1", confirm_token: token },
        });
        expect(res.isError).toBeFalsy();
        // GET (name) -> PUT status=DONE carrying name -> DELETE.
        expect(calls).toEqual(["get", "update:DONE:Important task", "delete"]);
        const json = envelope(res);
        expect((json.data as { deleted?: boolean }).deleted).toBe(true);
        const deleted = (json.changed as { deleted?: Array<{ id: string }> }).deleted;
        expect(deleted).toEqual([{ type: "task", id: "t-1" }]);
    });
});
