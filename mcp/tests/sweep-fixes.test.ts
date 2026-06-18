import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

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

function dataOf(res: unknown): Record<string, unknown> {
    return JSON.parse((res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}") as Record<string, unknown>;
}

describe("clockify_time_off_requests_update_status — correct method, path, and field", () => {
    it("calls changeTimeOffRequestStatus (policy-scoped) with the `status` wire field, not updateStatus/statusType", async () => {
        const captured: Record<string, unknown> = {};
        const ctx: Context = {
            workspaceId: "ws-1",
            client: {
                timeOff: {
                    changeTimeOffRequestStatus: async (r: unknown) => {
                        captured.change = r;
                        return { id: "req-1" };
                    },
                    updateStatus: async (r: unknown) => {
                        captured.updateStatus = r; // must NOT be called (dead route)
                        return {};
                    },
                },
            } as never,
        };
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_time_off_requests_update_status",
            arguments: { policyId: "pol-1", requestId: "req-1", statusType: "APPROVED", note: "ok" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.change).toEqual({
            workspaceId: "ws-1",
            policyId: "pol-1",
            requestId: "req-1",
            status: "APPROVED",
            note: "ok",
        });
        expect(captured.updateStatus).toBeUndefined();
    });

    it("rejects PENDING and WITHDRAWN at the input layer (only APPROVED/REJECTED are valid targets)", async () => {
        const captured: Record<string, unknown> = {};
        const ctx: Context = {
            workspaceId: "ws-1",
            client: {
                timeOff: {
                    changeTimeOffRequestStatus: async (r: unknown) => {
                        captured.change = r; // must NOT be reached for invalid status
                        return { id: "req-1" };
                    },
                },
            } as never,
        };
        const client = await connect(ctx);
        for (const statusType of ["PENDING", "WITHDRAWN"]) {
            const res = await client.callTool({
                name: "clockify_time_off_requests_update_status",
                arguments: { policyId: "pol-1", requestId: "req-1", statusType },
            });
            expect(res.isError).toBeTruthy();
        }
        // The wire was never hit for either rejected status.
        expect(captured.change).toBeUndefined();
    });
});

describe("clockify_expenses_categories_delete — archive before delete", () => {
    it("archives (PATCH status) the category before deleting it", async () => {
        const order: string[] = [];
        const captured: Record<string, unknown> = {};
        const ctx: Context = {
            workspaceId: "ws-1",
            client: {
                expenseCategories: {
                    archive: async (r: unknown) => {
                        order.push("archive");
                        captured.archive = r;
                        return {};
                    },
                    delete: async (r: unknown) => {
                        order.push("delete");
                        captured.delete = r;
                        return {};
                    },
                },
            } as never,
        };
        const client = await connect(ctx);
        // The delete is now behind the shared dry_run -> confirm_token guard: a
        // dry_run must preview without mutating, then the confirmed call archives
        // before deleting.
        const dry = dataOf(
            await client.callTool({
                name: "clockify_expenses_categories_delete",
                arguments: { categoryId: "cat-1", dry_run: true },
            }),
        );
        const token = (dry.data as { confirm_token?: string }).confirm_token;
        expect(token).toBeTruthy();
        expect(order).toEqual([]); // dry_run must not archive or delete
        const res = await client.callTool({
            name: "clockify_expenses_categories_delete",
            arguments: { categoryId: "cat-1", confirm_token: token },
        });
        expect(res.isError).toBeFalsy();
        expect(order).toEqual(["archive", "delete"]);
        expect(captured.archive).toEqual({ workspaceId: "ws-1", categoryId: "cat-1", archived: true });
        expect(captured.delete).toEqual({ workspaceId: "ws-1", categoryId: "cat-1" });
    });
});
