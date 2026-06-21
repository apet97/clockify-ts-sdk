/**
 * The flat `timeOff.delete` route (`/time-off/requests/{id}`) 404s live; the
 * working delete is the policy-scoped `timeOff.withdraw`
 * (`/time-off/policies/{policyId}/requests/{id}`, 200 on a PENDING request,
 * live-verified 2026-06-22). `clockify_time_off_requests_delete` must require
 * `policyId` and call `withdraw`, never the dead flat route. See
 * spec/evidence/discrepancies.md `time-off.requests.delete.policy-scoped-only-pending`.
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
    return JSON.parse((res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}") as Record<
        string,
        unknown
    >;
}

describe("clockify_time_off_requests_delete — policy-scoped withdraw, not the dead flat route", () => {
    const POLICY_ID = "000000000000000000000301";

    it("calls timeOff.withdraw with policyId after confirmation, never the flat timeOff.delete", async () => {
        const captured: Record<string, unknown> = {};
        const ctx: Context = {
            workspaceId: "ws-1",
            client: {
                timeOff: {
                    withdraw: async (r: unknown) => {
                        captured.withdraw = r;
                        return { id: "req-1" };
                    },
                    delete: async (r: unknown) => {
                        captured.delete = r; // dead flat route — must NOT be called
                        return {};
                    },
                },
            } as never,
        };
        const client = await connect(ctx);
        const dry = dataOf(
            await client.callTool({
                name: "clockify_time_off_requests_delete",
                arguments: { policyId: POLICY_ID, requestId: "req-1", dry_run: true },
            }),
        );
        const token = (dry.data as { confirm_token?: string }).confirm_token;
        expect(token).toBeTruthy();
        const res = dataOf(
            await client.callTool({
                name: "clockify_time_off_requests_delete",
                arguments: { policyId: POLICY_ID, requestId: "req-1", confirm_token: token },
            }),
        );
        expect(res.ok).toBe(true);
        expect(captured.withdraw).toEqual({
            workspaceId: "ws-1",
            policyId: POLICY_ID,
            requestId: "req-1",
        });
        expect(captured.delete).toBeUndefined();
    });

    it("rejects a call missing policyId at the input layer", async () => {
        const ctx: Context = {
            workspaceId: "ws-1",
            client: {
                timeOff: { withdraw: async () => ({}), delete: async () => ({}) },
            } as never,
        };
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_time_off_requests_delete",
            arguments: { requestId: "req-1", dry_run: true },
        });
        expect(res.isError).toBe(true);
    });
});
