import { describe, expect, it } from "vitest";

import { startWork, stopWork, switchWork } from "../src/tools/workflows/time-tracking.js";
import type { WorkflowContext } from "../src/tools/workflows/types.js";

/**
 * Behavioral coverage for the start/stop/switch_work workflow tools, pinning
 * the SDK calls they make, the request shapes, and the success receipts with a
 * mocked client (no network). In particular this pins that clockify_stop_work
 * routes through timeEntries.stopTimer — the generated `/stop` route that 404s
 * live (see spec/evidence/discrepancies.md `entries.stoptimer.route-404...`);
 * the route fix is GOCLMCP-owned, so here we pin current behavior, including the
 * graceful 404 -> "no timer running" degradation the MCP layer compensates with.
 */

interface Calls {
    create: Record<string, unknown>[];
    stopTimer: Record<string, unknown>[];
    getCurrentUser: number;
}

function makeCtx(opts: { stopTimer?: (req: Record<string, unknown>) => Promise<unknown> } = {}): {
    ctx: WorkflowContext;
    calls: Calls;
} {
    const calls: Calls = { create: [], stopTimer: [], getCurrentUser: 0 };
    const defaultStop = async (req: Record<string, unknown>) => {
        calls.stopTimer.push(req);
        return { id: "te-1", ...req };
    };
    const client = {
        users: {
            getCurrentUser: async () => {
                calls.getCurrentUser += 1;
                return { id: "user-1" };
            },
        },
        timeEntries: {
            create: async (body: Record<string, unknown>) => {
                calls.create.push(body);
                return { id: "te-1", ...body };
            },
            stopTimer: opts.stopTimer ?? defaultStop,
        },
    };
    return { ctx: { workspaceId: "ws-1", client } as unknown as WorkflowContext, calls };
}

function envelopeOf(res: unknown): Record<string, unknown> {
    return JSON.parse((res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}") as Record<string, unknown>;
}

describe("clockify_start_work", () => {
    it("creates a running entry (no end) and surfaces stop/switch as next steps", async () => {
        const { ctx, calls } = makeCtx();
        const env = envelopeOf(await startWork(ctx, { description: "writing", start: "2026-06-01T08:00:00.000Z" }));
        expect(env.ok).toBe(true);
        expect(env.action).toBe("clockify_start_work");
        expect(calls.create).toHaveLength(1);
        expect(calls.create[0]).toMatchObject({ workspaceId: "ws-1", start: "2026-06-01T08:00:00.000Z", description: "writing" });
        expect(calls.create[0].end).toBeUndefined(); // a running timer has no end
        expect((env.changed as { created?: unknown[] }).created).toHaveLength(1);
        expect((env.next as Array<{ tool: string }>).map((n) => n.tool)).toEqual([
            "clockify_stop_work",
            "clockify_switch_work",
        ]);
    });

    it("defaults a missing start to now and records the resolved value in meta", async () => {
        const { ctx, calls } = makeCtx();
        const env = envelopeOf(await startWork(ctx, { description: "x" }));
        const sentStart = calls.create[0].start as string;
        expect(typeof sentStart).toBe("string");
        expect(Number.isNaN(Date.parse(sentStart))).toBe(false);
        const meta = env.meta as { startWasDefaulted?: boolean; resolvedStart?: string };
        expect(meta.startWasDefaulted).toBe(true);
        expect(meta.resolvedStart).toBe(sentStart);
    });
});

describe("clockify_stop_work", () => {
    it("calls getCurrentUser then the /stop route (timeEntries.stopTimer) with {workspaceId, userId, end}", async () => {
        const { ctx, calls } = makeCtx();
        const env = envelopeOf(await stopWork(ctx, { end: "2026-06-01T10:00:00.000Z" }));
        expect(calls.getCurrentUser).toBe(1);
        // PIN: stop_work uses the generated stopTimer /stop route (404s live; GOCLMCP-owned fix).
        expect(calls.stopTimer).toHaveLength(1);
        expect(calls.stopTimer[0]).toEqual({ workspaceId: "ws-1", userId: "user-1", end: "2026-06-01T10:00:00.000Z" });
        expect(env.ok).toBe(true);
        expect(env.action).toBe("clockify_stop_work");
        expect((env.changed as { updated?: unknown[] }).updated).toHaveLength(1);
    });

    it("degrades a 404 from the dead /stop route to a graceful 'no timer running' success", async () => {
        const { ctx } = makeCtx({
            stopTimer: async () => {
                throw Object.assign(new Error("No static resource ...time-entries/stop."), { statusCode: 404 });
            },
        });
        const res = await stopWork(ctx, {});
        expect((res as { isError?: boolean }).isError).toBeFalsy();
        const env = envelopeOf(res);
        expect(env.ok).toBe(true);
        const data = env.data as { stopped?: boolean; reason?: string };
        expect(data.stopped).toBe(false);
        expect(data.reason).toMatch(/no timer running/i);
    });
});

describe("clockify_switch_work", () => {
    it("stops the current timer then starts the new one, returning both", async () => {
        const { ctx, calls } = makeCtx();
        const env = envelopeOf(await switchWork(ctx, { description: "new task", start: "2026-06-01T09:00:00.000Z" }));
        expect(env.ok).toBe(true);
        expect(env.action).toBe("clockify_switch_work");
        expect(calls.getCurrentUser).toBe(1); // stop attempt
        expect(calls.stopTimer).toHaveLength(1);
        expect(calls.create).toHaveLength(1); // new timer started
        expect(calls.create[0]).toMatchObject({ description: "new task" });
        const data = env.data as { status?: string; started?: unknown };
        expect(data.status).toBe("ok");
        expect(data.started).toBeTruthy();
        expect((env.next as Array<{ tool: string }>).map((n) => n.tool)).toEqual(["clockify_stop_work"]);
    });

    it("still starts the new timer when stopping the old one fails", async () => {
        const { ctx, calls } = makeCtx({
            stopTimer: async () => {
                throw Object.assign(new Error("boom"), { statusCode: 500 });
            },
        });
        const env = envelopeOf(await switchWork(ctx, { description: "next", start: "2026-06-01T09:00:00.000Z" }));
        expect(env.ok).toBe(true);
        expect(calls.create).toHaveLength(1); // new timer started despite stop failure
        const warnings = (env.warnings as Array<{ code: string }>) ?? [];
        expect(warnings.some((w) => w.code === "stop_failed")).toBe(true);
    });
});
