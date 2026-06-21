import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
    teardown = async () => {};
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

describe("clockify_time_off_requests_submit halfDayPeriod", () => {
    it("rejects an out-of-enum halfDayPeriod before calling the API", async () => {
        const submit = vi.fn(async (request: unknown) => request);
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeOff: { submit } } as never,
        });

        const res = (await client.callTool({
            name: "clockify_time_off_requests_submit",
            arguments: {
                policyId: "policy-1",
                start: "2026-01-01",
                end: "2026-01-01",
                halfDayPeriod: "MORNING",
            },
        })) as { isError?: boolean };

        expect(res.isError).toBe(true);
        expect(submit).not.toHaveBeenCalled();
    });

    it("accepts {start, days} without end and submits period {start, days}", async () => {
        const submit = vi.fn(async (request: unknown) => request);
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeOff: { submit } } as never,
        });

        const res = (await client.callTool({
            name: "clockify_time_off_requests_submit",
            arguments: {
                policyId: "aaaaaaaaaaaaaaaaaaaaaaaa",
                start: "2026-08-01",
                days: 2,
            },
        })) as { isError?: boolean };

        expect(res.isError).toBeFalsy();
        expect(submit).toHaveBeenCalledTimes(1);
        const req = submit.mock.calls[0]?.[0] as {
            body: { timeOffPeriod: { period: Record<string, unknown> } };
        };
        expect(req.body.timeOffPeriod.period).toEqual({ start: "2026-08-01", days: 2 });
        expect(req.body.timeOffPeriod.period).not.toHaveProperty("end");
    });

    it("rejects a submit with neither end nor days (never calls the API)", async () => {
        const submit = vi.fn(async (request: unknown) => request);
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeOff: { submit } } as never,
        });

        const res = (await client.callTool({
            name: "clockify_time_off_requests_submit",
            arguments: { policyId: "aaaaaaaaaaaaaaaaaaaaaaaa", start: "2026-08-01" },
        })) as { isError?: boolean };

        expect(res.isError).toBe(true);
        expect(submit).not.toHaveBeenCalled();
    });
});
