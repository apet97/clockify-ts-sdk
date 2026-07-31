import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

import { callGuarded } from "./guarded-call.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

const ALICE = "aaaaaaaaaaaaaaaaaaaaaaaa";
const SAM1 = "cccccccccccccccccccccccc";
const SAM2 = "dddddddddddddddddddddddd";
const ME = "eeeeeeeeeeeeeeeeeeeeeeee";
const PROJ = "111111111111111111111111";

function schedulingContext(captured: Record<string, unknown>): Context {
    return {
        workspaceId: "ws-1",
        client: {
            scheduling: {
                createRecurring: async (req: unknown) => {
                    captured.createRecurring = req;
                    // createRecurring returns an ARRAY (one entry per occurrence).
                    return [{ id: "asg-1" }];
                },
                publish: async (req: unknown) => {
                    captured.publish = req;
                },
                update: async (req: unknown) => {
                    captured.update = req; // dead bare PUT — must NOT be called
                    return { id: "asg-1" };
                },
                updateRecurring: async (req: unknown) => {
                    captured.updateRecurring = req;
                    return [{ id: "asg-1" }];
                },
            },
            users: {
                list: async () => {
                    captured.usersListCalled = true;
                    return [
                        { id: ALICE, name: "Alice" },
                        { id: SAM1, name: "Sam" },
                        { id: SAM2, name: "Sam" },
                    ];
                },
                getCurrentUser: async () => ({ id: ME }),
            },
            projects: {
                list: async (req: unknown) => {
                    captured.projectsList = req;
                    return [{ id: PROJ, name: "Apollo", archived: false }];
                },
            },
        } as never,
    };
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

describe("scheduling assignments resolve NAME -> id", () => {
    it("assignments_create resolves a user NAME and a project NAME to ids", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_scheduling_assignments_create",
            arguments: {
                userId: "Alice",
                projectId: "Apollo",
                start: "2026-06-01",
                end: "2026-06-07",
                hoursPerDay: 8,
            },
        });
        expect(res.isError).toBeFalsy();
        const create =
            (captured.createRecurring as { body?: { userId?: string; projectId?: string } }).body ??
            {};
        expect(create.userId).toBe(ALICE);
        expect(create.projectId).toBe(PROJ);
        // createRecurring returns an array; the receipt id must come from the FIRST element.
        expect(
            (envelope(res).changed as { created?: Array<{ id?: string }> })?.created?.[0]?.id,
        ).toBe("asg-1");
    });

    it("assignments_create clarifies + does not create on an unknown project name", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_scheduling_assignments_create",
            arguments: {
                userId: "Alice",
                projectId: "Nonexistent",
                start: "2026-06-01",
                end: "2026-06-07",
                hoursPerDay: 8,
            },
        });
        expect(res.isError).toBeFalsy();
        const env = envelope(res);
        expect(env.ok).toBe(true);
        expect((env.clarification as { field?: string }).field).toBe("projectId");
        expect(captured.createRecurring).toBeUndefined();
    });

    it("assignments_create clarifies on an ambiguous user name and does not create", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_scheduling_assignments_create",
            arguments: {
                userId: "Sam",
                projectId: "Apollo",
                start: "2026-06-01",
                end: "2026-06-07",
                hoursPerDay: 8,
            },
        });
        expect(res.isError).toBeFalsy();
        const env = envelope(res);
        expect(env.ok).toBe(true);
        expect((env.clarification as { field?: string }).field).toBe("userId");
        expect(captured.createRecurring).toBeUndefined();
    });

    it("assignments_create passes 24-hex userId + projectId through (resolved id equals input)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_scheduling_assignments_create",
            arguments: {
                userId: ALICE,
                projectId: PROJ,
                start: "2026-06-01",
                end: "2026-06-07",
                hoursPerDay: 8,
            },
        });
        expect(res.isError).toBeFalsy();
        const create =
            (captured.createRecurring as { body?: { userId?: string; projectId?: string } }).body ??
            {};
        expect(create.userId).toBe(ALICE);
        expect(create.projectId).toBe(PROJ);
        // createRecurring returns an array; the receipt id must come from the FIRST element.
        expect(
            (envelope(res).changed as { created?: Array<{ id?: string }> })?.created?.[0]?.id,
        ).toBe("asg-1");
    });

    it("assignments_create with published:true publishes the range and reports meta.published", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_scheduling_assignments_create",
            arguments: {
                userId: "Alice",
                projectId: "Apollo",
                start: "2026-06-01",
                end: "2026-06-07",
                hoursPerDay: 8,
                published: true,
            },
        });
        expect(res.isError).toBeFalsy();
        expect((envelope(res).meta as { published?: boolean }).published).toBe(true);
        expect(captured.publish).toEqual({
            workspaceId: "ws-1",
            start: "2026-06-01",
            end: "2026-06-07",
            userFilter: { contains: "CONTAINS", ids: [ALICE] },
        });
    });

    it("assignments_create defaults to a draft: no publish call and meta.published false", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_scheduling_assignments_create",
            arguments: {
                userId: "Alice",
                projectId: "Apollo",
                start: "2026-06-01",
                end: "2026-06-07",
                hoursPerDay: 8,
            },
        });
        expect(res.isError).toBeFalsy();
        expect((envelope(res).meta as { published?: boolean }).published).toBe(false);
        expect(captured.publish).toBeUndefined();
    });

    it("assignments_create resolves a project NAME that only appears on page 2", async () => {
        // The reference-list closure must walk every page: a single-page fetch
        // returns a false "there is no active project named X" clarification for
        // any workspace with more than one page of projects.
        const captured: Record<string, unknown> = {};
        const ctx = schedulingContext(captured);
        const pagesSeen: number[] = [];
        (ctx.client as unknown as { projects: { list: (req: unknown) => Promise<unknown> } }
        ).projects.list = async (req: unknown) => {
            const page = (req as { page?: number }).page ?? 1;
            pagesSeen.push(page);
            if (page === 1) {
                return Array.from({ length: 200 }, (_unused, index) => ({
                    id: String(index).padStart(24, "9"),
                    name: `Filler ${index}`,
                    archived: false,
                }));
            }
            if (page === 2) return [{ id: PROJ, name: "Apollo", archived: false }];
            return [];
        };
        const client = await connect(ctx);
        const res = await callGuarded(client, {
            name: "clockify_scheduling_assignments_create",
            arguments: {
                userId: "Alice",
                projectId: "Apollo",
                start: "2026-06-01",
                end: "2026-06-07",
                hoursPerDay: 8,
            },
        });
        expect(res.isError).toBeFalsy();
        expect(envelope(res).clarification).toBeUndefined();
        expect(pagesSeen).toContain(2);
        const create =
            (captured.createRecurring as { body?: { projectId?: string } }).body ?? {};
        expect(create.projectId).toBe(PROJ);
    });

    it("assignments_create reports the created draft when publishing fails", async () => {
        // defineGuardedTool burns the confirm token before execute runs, so a bare
        // error would hide the created id and force a duplicate create.
        const captured: Record<string, unknown> = {};
        const ctx = schedulingContext(captured);
        (
            ctx.client as unknown as { scheduling: { publish: () => Promise<void> } }
        ).scheduling.publish = async () => {
            throw new Error("publish exploded");
        };
        const client = await connect(ctx);
        const res = await callGuarded(client, {
            name: "clockify_scheduling_assignments_create",
            arguments: {
                userId: "Alice",
                projectId: "Apollo",
                start: "2026-06-01",
                end: "2026-06-07",
                hoursPerDay: 8,
                published: true,
            },
        });
        expect(res.isError).toBeFalsy();
        const env = envelope(res);
        expect((env.changed as { created?: Array<{ id?: string }> })?.created?.[0]?.id).toBe(
            "asg-1",
        );
        expect((env.meta as { published?: boolean }).published).toBe(false);
        expect((env.warnings as Array<{ code?: string; message?: string }>)[0]?.code).toBe(
            "publish_failed",
        );
        expect((env.warnings as Array<{ message?: string }>)[0]?.message).toMatch(
            /publish exploded/,
        );
        expect((env.next as Array<{ tool?: string }>)[0]?.tool).toBe(
            "clockify_scheduling_publish",
        );
    });

    it("assignments_update no longer resolves/forwards user or project — the recurring edit route cannot reassign them", async () => {
        // The live edit route is PATCH /scheduling/assignments/recurring/{id}
        // (AssignmentUpdateRequestV1), which has no user/project field. So the
        // tool rejects userId/projectId up front rather than resolving a NAME
        // and silently dropping it; neither SDK update method is called.
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_scheduling_assignments_update",
            arguments: {
                assignmentId: "asg-1",
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                userId: "Alice",
            },
        });
        expect(res.isError).toBe(true);
        const env = envelope(res);
        expect(env.ok).toBe(false);
        expect((env.error as { code?: string }).code).toBe("invalid_request");
        expect(captured.usersListCalled).toBeUndefined(); // no NAME resolution attempted
        expect(captured.update).toBeUndefined();
        expect(captured.updateRecurring).toBeUndefined();
    });

    it("assignments_update forwards a plain field edit to updateRecurring (PATCH), not the dead bare update", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_scheduling_assignments_update",
            arguments: {
                assignmentId: "asg-1",
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                note: "moved",
            },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.update).toBeUndefined();
        expect(captured.updateRecurring).toEqual({
            workspaceId: "ws-1",
            assignmentId: "asg-1",
            body: { start: "2026-06-01T00:00:00Z", end: "2026-06-07T00:00:00Z", note: "moved" },
        });
    });
});
