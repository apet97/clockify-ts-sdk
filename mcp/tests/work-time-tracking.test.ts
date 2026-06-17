import { describe, expect, it } from "vitest";

import { startWork, stopWork, switchWork } from "../src/tools/workflows/time-tracking.js";
import type { WorkflowContext } from "../src/tools/workflows/types.js";

/**
 * Behavioral coverage for the start/stop/switch_work workflow tools, pinning the
 * SDK calls they make, the request shapes, and the success receipts with a mocked
 * client (no network). stop_work/switch_work detect a running timer via
 * `timeEntries.listInProgress` and stop it through the bound bare route
 * `timeEntries.updateForUser` (PATCH /workspaces/{ws}/user/{userId}/time-entries,
 * `{ end }`). The dead `/stop` suffix route (`stopTimer`) is gone: "no timer
 * running" now comes from an empty in-progress list, NOT from swallowing a 404 —
 * see spec/evidence/discrepancies.md `entries.stoptimer.route-404...`.
 */

interface Calls {
    create: Record<string, unknown>[];
    listInProgress: number;
    updateForUser: Record<string, unknown>[];
    getCurrentUser: number;
}

function makeCtx(
    opts: {
        inProgress?: () => Promise<unknown[]>;
        updateForUser?: (req: Record<string, unknown>) => Promise<unknown>;
        create?: (body: Record<string, unknown>) => Promise<unknown>;
    } = {},
): { ctx: WorkflowContext; calls: Calls } {
    const calls: Calls = { create: [], listInProgress: 0, updateForUser: [], getCurrentUser: 0 };
    const client = {
        users: {
            getCurrentUser: async () => {
                calls.getCurrentUser += 1;
                return { id: "user-1" };
            },
        },
        timeEntries: {
            create:
                opts.create ??
                (async (body: Record<string, unknown>) => {
                    calls.create.push(body);
                    return { id: "te-1", ...body };
                }),
            listInProgress: async () => {
                calls.listInProgress += 1;
                return opts.inProgress ? await opts.inProgress() : [];
            },
            updateForUser:
                opts.updateForUser ??
                (async (req: Record<string, unknown>) => {
                    calls.updateForUser.push(req);
                    return { id: "te-1", ...req };
                }),
        },
    };
    return { ctx: { workspaceId: "ws-1", client } as unknown as WorkflowContext, calls };
}

function envelopeOf(res: unknown): Record<string, unknown> {
    return JSON.parse((res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}") as Record<string, unknown>;
}

const runningForUser = async () => [{ id: "te-1", userId: "user-1" }];

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
    it("lists in-progress, then stops the user's running timer via updateForUser (never stopTimer)", async () => {
        const { ctx, calls } = makeCtx({ inProgress: runningForUser });
        const env = envelopeOf(await stopWork(ctx, { end: "2026-06-01T10:00:00.000Z" }));
        expect(calls.getCurrentUser).toBe(1);
        expect(calls.listInProgress).toBe(1);
        // PIN: the stop goes through the bound bare route, with the minimal { end } body.
        expect(calls.updateForUser).toHaveLength(1);
        expect(calls.updateForUser[0]).toEqual({ workspaceId: "ws-1", userId: "user-1", end: "2026-06-01T10:00:00.000Z" });
        expect(env.ok).toBe(true);
        expect(env.action).toBe("clockify_stop_work");
        expect((env.changed as { updated?: unknown[] }).updated).toHaveLength(1);
    });

    it("reports 'no timer running' WITHOUT any update when nothing is in progress", async () => {
        const { ctx, calls } = makeCtx({ inProgress: async () => [] });
        const env = envelopeOf(await stopWork(ctx, {}));
        expect(calls.listInProgress).toBe(1);
        expect(calls.updateForUser).toHaveLength(0); // no write when no timer is running
        expect(env.ok).toBe(true);
        const data = env.data as { stopped?: boolean; reason?: string };
        expect(data.stopped).toBe(false);
        expect(data.reason).toMatch(/no timer running/i);
    });

    it("ignores an in-progress entry that belongs to a different user", async () => {
        const { ctx, calls } = makeCtx({ inProgress: async () => [{ id: "other", userId: "user-2" }] });
        const env = envelopeOf(await stopWork(ctx, {}));
        expect(calls.updateForUser).toHaveLength(0);
        expect((env.data as { stopped?: boolean }).stopped).toBe(false);
    });
});

describe("clockify_switch_work", () => {
    it("stops the current timer then starts the new one, returning both", async () => {
        const { ctx, calls } = makeCtx({ inProgress: runningForUser });
        const env = envelopeOf(await switchWork(ctx, { description: "new task", start: "2026-06-01T09:00:00.000Z" }));
        expect(env.ok).toBe(true);
        expect(env.action).toBe("clockify_switch_work");
        expect(calls.getCurrentUser).toBe(1); // stop attempt
        expect(calls.updateForUser).toHaveLength(1); // old timer stopped via the bound route
        expect(calls.create).toHaveLength(1); // new timer started
        expect(calls.create[0]).toMatchObject({ description: "new task" });
        const data = env.data as { status?: string; started?: unknown };
        expect(data.status).toBe("ok");
        expect(data.started).toBeTruthy();
        expect((env.next as Array<{ tool: string }>).map((n) => n.tool)).toEqual(["clockify_stop_work"]);
    });

    it("still starts the new timer (with a stop_failed warning) when stopping the old one errors", async () => {
        const { ctx, calls } = makeCtx({
            inProgress: async () => {
                throw Object.assign(new Error("boom"), { statusCode: 500 });
            },
        });
        const env = envelopeOf(await switchWork(ctx, { description: "next", start: "2026-06-01T09:00:00.000Z" }));
        expect(env.ok).toBe(true);
        expect(calls.create).toHaveLength(1); // new timer started despite stop failure
        const warnings = (env.warnings as Array<{ code: string }>) ?? [];
        expect(warnings.some((w) => w.code === "stop_failed")).toBe(true);
    });

    it("when starting fails AFTER a successful stop, the error reports the timer was already stopped", async () => {
        const { ctx } = makeCtx({
            inProgress: runningForUser,
            create: async () => {
                throw new Error("start boom");
            },
        });
        await expect(switchWork(ctx, { description: "next" })).rejects.toThrow(
            /previous timer was stopped.*starting the new timer failed: start boom/,
        );
    });
});
