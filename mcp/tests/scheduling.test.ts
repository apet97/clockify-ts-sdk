import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

function schedulingContext(captured: Record<string, unknown>): Context {
    return {
        workspaceId: "ws-1",
        client: {
            scheduling: {
                publish: async (req: unknown) => {
                    captured.publish = req;
                    return undefined;
                },
                getUsersCapacityFiltered: async (req: unknown) => {
                    captured.capacity = req;
                    return [{ userId: "u-1", capacityPerDay: 28800 }];
                },
                // The live edit/delete routes are the recurring PATCH/DELETE;
                // the bare /assignments/{id} PUT+DELETE 404. Record which SDK
                // method the tool actually invokes.
                updateRecurring: async (req: unknown) => {
                    captured.updateRecurring = req;
                    return [{ id: "assign-1" }];
                },
                update: async (req: unknown) => {
                    captured.update = req;
                    return undefined;
                },
                deleteRecurring: async (req: unknown) => {
                    captured.deleteRecurring = req;
                    return [{ id: "assign-1" }];
                },
                delete: async (req: unknown) => {
                    captured.delete = req;
                    return undefined;
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

describe("scheduling completion tools", () => {
    it("clockify_scheduling_publish is a write that pins the workspace and merges extra filters", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const res = await client.callTool({
            name: "clockify_scheduling_publish",
            arguments: {
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                notifyUsers: true,
                extra: { userGroupFilter: { ids: ["g-1"] } },
            },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.publish).toEqual({
            workspaceId: "ws-1",
            start: "2026-06-01T00:00:00Z",
            end: "2026-06-07T00:00:00Z",
            notifyUsers: true,
            userGroupFilter: { ids: ["g-1"] },
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect((json.data as { published?: boolean }).published).toBe(true);

        const tool = (await client.listTools()).tools.find((t) => t.name === "clockify_scheduling_publish");
        expect(tool?.annotations?.readOnlyHint).toBe(false);
    });

    it("clockify_scheduling_capacity passes pagination + filters and returns the rows read-only", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const res = await client.callTool({
            name: "clockify_scheduling_capacity",
            arguments: {
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                page: 2,
                pageSize: 10,
                extra: { statusFilter: "PUBLISHED" },
            },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.capacity).toEqual({
            workspaceId: "ws-1",
            start: "2026-06-01T00:00:00Z",
            end: "2026-06-07T00:00:00Z",
            page: 2,
            pageSize: 10,
            statusFilter: "PUBLISHED",
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.changed).toBeUndefined();
        expect((json.meta as { count?: number }).count).toBe(1);

        const tool = (await client.listTools()).tools.find((t) => t.name === "clockify_scheduling_capacity");
        expect(tool?.annotations?.readOnlyHint).toBe(true);
    });
});

describe("scheduling edit/delete re-point to the live recurring routes", () => {
    it("clockify_scheduling_assignments_update calls updateRecurring (PATCH), never the dead bare update", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const res = await client.callTool({
            name: "clockify_scheduling_assignments_update",
            arguments: {
                assignmentId: "assign-1",
                start: "2026-07-01T00:00:00Z",
                end: "2026-07-05T00:00:00Z",
                hoursPerDay: 6,
                note: "shifted",
                billable: true,
                seriesUpdateOption: "THIS_AND_FOLLOWING",
            },
        });
        expect(res.isError).toBeFalsy();
        // The bare PUT /assignments/{id} 404s live — it must not be called.
        expect(captured.update).toBeUndefined();
        expect(captured.updateRecurring).toEqual({
            workspaceId: "ws-1",
            assignmentId: "assign-1",
            body: {
                start: "2026-07-01T00:00:00Z",
                end: "2026-07-05T00:00:00Z",
                hoursPerDay: 6,
                note: "shifted",
                billable: true,
                seriesUpdateOption: "THIS_AND_FOLLOWING",
            },
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.entity).toBe("scheduling_assignment");
        expect(
            (json.changed as { updated?: Array<{ type?: string; id?: string }> }).updated?.[0],
        ).toMatchObject({ type: "scheduling_assignment", id: "assign-1" });
    });

    it("clockify_scheduling_assignments_update sends only set body fields (start+end minimum)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const res = await client.callTool({
            name: "clockify_scheduling_assignments_update",
            arguments: {
                assignmentId: "assign-1",
                start: "2026-07-01T00:00:00Z",
                end: "2026-07-05T00:00:00Z",
            },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.updateRecurring).toEqual({
            workspaceId: "ws-1",
            assignmentId: "assign-1",
            body: { start: "2026-07-01T00:00:00Z", end: "2026-07-05T00:00:00Z" },
        });
    });

    it("clockify_scheduling_assignments_update rejects user/project reassignment without calling the SDK", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const res = await client.callTool({
            name: "clockify_scheduling_assignments_update",
            arguments: {
                assignmentId: "assign-1",
                start: "2026-07-01T00:00:00Z",
                end: "2026-07-05T00:00:00Z",
                userId: "u-2",
            },
        });
        expect(res.isError).toBe(true);
        expect(captured.updateRecurring).toBeUndefined();
        expect(captured.update).toBeUndefined();
        const json = envelope(res);
        expect(json.ok).toBe(false);
        expect((json.error as { code?: string }).code).toBe("invalid_request");
    });

    it("clockify_scheduling_assignments_delete calls deleteRecurring after confirmation, forwarding seriesUpdateOption", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const dry = envelope(
            await client.callTool({
                name: "clockify_scheduling_assignments_delete",
                arguments: {
                    assignmentId: "assign-1",
                    seriesUpdateOption: "ALL",
                    dry_run: true,
                },
            }),
        );
        const token = (dry.data as { confirm_token?: string }).confirm_token;
        expect(token).toBeTruthy();
        const res = await client.callTool({
            name: "clockify_scheduling_assignments_delete",
            arguments: {
                assignmentId: "assign-1",
                seriesUpdateOption: "ALL",
                confirm_token: token,
            },
        });
        expect(res.isError).toBeFalsy();
        // The bare DELETE /assignments/{id} 404s live — it must not be called.
        expect(captured.delete).toBeUndefined();
        expect(captured.deleteRecurring).toEqual({
            workspaceId: "ws-1",
            assignmentId: "assign-1",
            seriesUpdateOption: "ALL",
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect((json.data as { deleted?: boolean }).deleted).toBe(true);
    });

    it("clockify_scheduling_assignments_delete omits seriesUpdateOption when not supplied", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const dry = envelope(
            await client.callTool({
                name: "clockify_scheduling_assignments_delete",
                arguments: { assignmentId: "assign-1", dry_run: true },
            }),
        );
        const token = (dry.data as { confirm_token?: string }).confirm_token;
        await client.callTool({
            name: "clockify_scheduling_assignments_delete",
            arguments: { assignmentId: "assign-1", confirm_token: token },
        });
        expect(captured.deleteRecurring).toEqual({
            workspaceId: "ws-1",
            assignmentId: "assign-1",
        });
    });
});
