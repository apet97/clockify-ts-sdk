import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

import { callGuarded } from "./guarded-call.js";

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

        const res = (await callGuarded(client, {
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

        const res = (await callGuarded(client, {
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

        const res = (await callGuarded(client, {
            name: "clockify_time_off_requests_submit",
            arguments: { policyId: "aaaaaaaaaaaaaaaaaaaaaaaa", start: "2026-08-01" },
        })) as { isError?: boolean };

        expect(res.isError).toBe(true);
        expect(submit).not.toHaveBeenCalled();
    });

    it("rejects a submit with both end and days before issuing a token", async () => {
        const submit = vi.fn(async (request: unknown) => request);
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeOff: { submit } } as never,
        });

        const res = await callGuarded(client, {
            name: "clockify_time_off_requests_submit",
            arguments: {
                policyId: "aaaaaaaaaaaaaaaaaaaaaaaa",
                start: "2026-08-01",
                end: "2026-08-02",
                days: 2,
            },
        });

        expect(res.isError).toBe(true);
        expect(submit).not.toHaveBeenCalled();
    });
});

describe("clockify_request_time_off honors half_day_period (afternoon)", () => {
    const HEX = "aaaaaaaaaaaaaaaaaaaaaaaa";
    function text(res: unknown): Record<string, unknown> {
        const t = (res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}";
        return JSON.parse(t) as Record<string, unknown>;
    }

    it("submits the requested SECOND_HALF (was hardcoded FIRST_HALF) through the confirm flow", async () => {
        const submit = vi.fn(async (r: unknown) => ({ id: "to-1", ...(r as object) }));
        const ctx = {
            workspaceId: "ws-1",
            client: { timeOff: { submit }, users: { getCurrentUser: async () => ({ id: "me" }) } },
        } as unknown as Context;
        const client = await connect(ctx);
        const args = {
            policy_id: HEX,
            start: "2026-08-01",
            days: 1,
            half_day: true,
            half_day_period: "SECOND_HALF",
        };
        const preview = await client.callTool({
            name: "clockify_request_time_off",
            arguments: { ...args, dry_run: true },
        });
        const token = (text(preview).data as { confirm_token?: string }).confirm_token;
        expect(token).toBeTruthy();
        await client.callTool({
            name: "clockify_request_time_off",
            arguments: { ...args, confirm_token: token },
        });
        expect(submit).toHaveBeenCalledTimes(1);
        const body = (
            submit.mock.calls[0]?.[0] as { body: { timeOffPeriod: Record<string, unknown> } }
        ).body;
        expect(body.timeOffPeriod.isHalfDay).toBe(true);
        expect(body.timeOffPeriod.halfDayPeriod).toBe("SECOND_HALF");
    });

    it("defaults a bare half_day:true to FIRST_HALF", async () => {
        const submit = vi.fn(async (r: unknown) => ({ id: "to-1", ...(r as object) }));
        const ctx = {
            workspaceId: "ws-1",
            client: { timeOff: { submit }, users: { getCurrentUser: async () => ({ id: "me" }) } },
        } as unknown as Context;
        const client = await connect(ctx);
        const preview = text(
            await client.callTool({
                name: "clockify_request_time_off",
                arguments: {
                    policy_id: HEX,
                    start: "2026-08-01",
                    days: 1,
                    half_day: true,
                    dry_run: true,
                },
            }),
        );
        const period = (
            preview.data as { preview: { body: { timeOffPeriod: Record<string, unknown> } } }
        ).preview.body.timeOffPeriod;
        expect(period.halfDayPeriod).toBe("FIRST_HALF");
    });
});
