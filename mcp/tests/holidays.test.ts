import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

/** A holiday as the LIST read-back exposes it: assignment is FLAT (userIds). */
function existingHoliday(): Record<string, unknown> {
    return {
        id: "hol-1",
        name: "Christmas",
        datePeriod: { startDate: "2026-12-25", endDate: "2026-12-25" },
        occursAnnually: true,
        color: "#ff0000",
        userIds: ["u1", "u2"],
    };
}

function holidaysContext(captured: Record<string, unknown>, holiday = existingHoliday()): Context {
    return {
        workspaceId: "ws-1",
        client: {
            holidays: {
                list: async (req: unknown) => {
                    captured.list = req;
                    return [holiday];
                },
                update: async (req: unknown) => {
                    captured.update = req;
                    return { id: "hol-1", name: (req as { name?: string }).name };
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

describe("clockify_holidays_update — replace-safe (list-scan, full body, scope reconstruction)", () => {
    it("carries untouched fields forward and rebuilds the assignment as a CONTAINS filter", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(holidaysContext(captured));
        const res = await client.callTool({
            name: "clockify_holidays_update",
            arguments: { holidayId: "hol-1", name: "Xmas Day" },
        });
        expect(res.isError).toBeFalsy();
        // It must list (no single-GET route) to read the current holiday.
        expect(captured.list).toEqual({ workspaceId: "ws-1" });
        const update = captured.update as Record<string, unknown>;
        expect(update.name).toBe("Xmas Day");
        // Untouched fields survive the full-replace PUT…
        expect(update.datePeriod).toEqual({ startDate: "2026-12-25", endDate: "2026-12-25" });
        expect(update.occursAnnually).toBe(true);
        expect(update.color).toBe("#ff0000");
        // …and the FLAT userIds are re-sent as a {contains,ids,status} filter.
        expect(update.users).toEqual({ contains: "CONTAINS", ids: ["u1", "u2"], status: "ALL" });
        expect(update.userIds).toBeUndefined();
        expect(envelope(res).ok).toBe(true);
    });

    it("lets explicit userIds replace the assignment", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(holidaysContext(captured));
        await client.callTool({
            name: "clockify_holidays_update",
            arguments: { holidayId: "hol-1", userIds: ["u9"] },
        });
        const update = captured.update as Record<string, unknown>;
        expect(update.users).toEqual({ contains: "CONTAINS", ids: ["u9"], status: "ALL" });
    });

    it("keeps holiday assignment status ALL (not ACTIVE)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(holidaysContext(captured));
        await client.callTool({
            name: "clockify_holidays_update",
            arguments: { holidayId: "hol-1", name: "Xmas Day" },
        });
        const update = captured.update as Record<string, unknown>;
        // Holidays diverge from time-off policies: holidays send ALL.
        expect((update.users as { status: string }).status).toBe("ALL");
        expect((update.users as { status: string }).status).not.toBe("ACTIVE");
    });

    it("errors clearly instead of dropping a required assignment to nothing", async () => {
        const captured: Record<string, unknown> = {};
        // A holiday with no users/groups and not everyone-assigned.
        const noScope = { id: "hol-1", name: "Orphan", datePeriod: { startDate: "2026-01-01", endDate: "2026-01-01" } };
        const client = await connect(holidaysContext(captured, noScope));
        const res = await client.callTool({
            name: "clockify_holidays_update",
            arguments: { holidayId: "hol-1", name: "Still orphan" },
        });
        expect(res.isError).toBe(true);
        expect(captured.update).toBeUndefined();
        expect(JSON.stringify(envelope(res))).toContain("no resolvable user/group assignment");
    });

    it("preserves an everyone-assigned holiday without inventing a filter", async () => {
        const captured: Record<string, unknown> = {};
        const everyone = {
            id: "hol-1",
            name: "All-staff",
            datePeriod: { startDate: "2026-01-01", endDate: "2026-01-01" },
            everyoneIncludingNew: true,
        };
        const client = await connect(holidaysContext(captured, everyone));
        const res = await client.callTool({
            name: "clockify_holidays_update",
            arguments: { holidayId: "hol-1", name: "All staff day" },
        });
        expect(res.isError).toBeFalsy();
        const update = captured.update as Record<string, unknown>;
        expect(update.everyoneIncludingNew).toBe(true);
        expect(update.users).toBeUndefined();
        expect(update.userGroups).toBeUndefined();
    });
});
