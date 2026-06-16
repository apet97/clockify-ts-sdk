import { describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { planChange } from "../src/tools/workflows/plan.js";

// planChange is a pure, offline planning function: it makes no API calls and
// only maps a free-text goal onto a static, order-sensitive INTENTS table (with
// a FALLBACK for unmatched goals). These tests pin the routing, the ordered
// tool chains, the mutating / confirmation accounting, and the fallback path to
// the real implementation in src/tools/workflows/plan.ts.

const ctx: Context = { workspaceId: "ws-test", client: {} as never };

interface PlanStep {
    step: number;
    tool: string;
    mutates: boolean;
    requiresConfirmation: boolean;
    why: string;
}

interface PlanData {
    goal: string;
    entity: string | null;
    intent: string;
    plan: PlanStep[];
    mutatingSteps: number;
    confirmationRequiredSteps: number;
    notes: string[];
}

interface Envelope {
    ok: boolean;
    action: string;
    entity?: string;
    data: PlanData;
    next?: Array<{ tool: string; reason?: string }>;
}

function envelopeOf(res: unknown): Envelope {
    return JSON.parse((res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}") as Envelope;
}

function tools(plan: PlanStep[]): string[] {
    return plan.map((s) => s.tool);
}

describe("planChange — representative goals route to the expected ordered tool chain", () => {
    it("an invoicing goal routes to status -> review_week -> invoice_client_work", async () => {
        const env = envelopeOf(await planChange(ctx, { goal: "invoice Acme for last week" }));
        expect(env.ok).toBe(true);
        expect(env.action).toBe("clockify_plan_change");
        expect(env.data.intent).toBe("invoice a client");
        expect(tools(env.data.plan)).toEqual([
            "clockify_status",
            "clockify_review_week",
            "clockify_invoice_client_work",
        ]);
        // step numbers are 1-based and contiguous
        expect(env.data.plan.map((s) => s.step)).toEqual([1, 2, 3]);
    });

    it("a log-work goal routes to create_work_package -> log_work", async () => {
        const env = envelopeOf(await planChange(ctx, { goal: "log yesterday's work" }));
        expect(env.data.intent).toBe("log finished work");
        expect(tools(env.data.plan)).toEqual(["clockify_create_work_package", "clockify_log_work"]);
    });

    it("a review goal routes to a single read-only review_week step", async () => {
        const env = envelopeOf(await planChange(ctx, { goal: "show me a summary of this week" }));
        expect(env.data.intent).toBe("review time");
        expect(tools(env.data.plan)).toEqual(["clockify_review_week"]);
        expect(env.data.plan[0]?.mutates).toBe(false);
    });
});

describe("planChange — INTENTS order-sensitivity (earlier intent wins over a broader later one)", () => {
    it("'schedule a new project' matches the schedule intent, not the later project/create intent", async () => {
        const env = envelopeOf(await planChange(ctx, { goal: "schedule a new project for next week" }));
        expect(env.data.intent).toBe("schedule work");
        expect(tools(env.data.plan)).toEqual(["clockify_schedule_work"]);
    });

    it("'set up a webhook' matches the webhook intent, not the later set-up/create intent", async () => {
        const env = envelopeOf(await planChange(ctx, { goal: "set up a webhook for new entries" }));
        expect(env.data.intent).toBe("set up a webhook");
        expect(tools(env.data.plan)).toEqual(["clockify_setup_webhook"]);
    });

    it("'clean up demo data' matches the delete/clean-up intent before any later intent", async () => {
        const env = envelopeOf(await planChange(ctx, { goal: "clean up the demo data" }));
        expect(env.data.intent).toBe("delete / clean up data");
        expect(tools(env.data.plan)).toEqual(["clockify_review_day", "clockify_demo_cleanup"]);
    });
});

describe("planChange — mutating and dry_run->confirm accounting", () => {
    it("counts mutating and confirmation-required steps for the invoice chain", async () => {
        const env = envelopeOf(await planChange(ctx, { goal: "bill the client" }));
        // status (read) + review_week (read) + invoice (mutate, confirm)
        expect(env.data.mutatingSteps).toBe(1);
        expect(env.data.confirmationRequiredSteps).toBe(1);
        // the counts equal the actual flags on the plan steps
        expect(env.data.mutatingSteps).toBe(env.data.plan.filter((s) => s.mutates).length);
        expect(env.data.confirmationRequiredSteps).toBe(
            env.data.plan.filter((s) => s.requiresConfirmation).length,
        );
        // a confirmation step implies a mutating step in the same chain
        const confirmStep = env.data.plan.find((s) => s.requiresConfirmation);
        expect(confirmStep?.mutates).toBe(true);
        // the confirmation note explains the handshake
        expect(env.data.notes.some((n) => n.includes("dry_run -> confirm_token"))).toBe(true);
    });

    it("log-work mutates without confirmation (idempotent upsert + log)", async () => {
        const env = envelopeOf(await planChange(ctx, { goal: "log finished work" }));
        expect(env.data.mutatingSteps).toBe(2);
        expect(env.data.confirmationRequiredSteps).toBe(0);
        // with zero confirmation steps the note states the handshake is not needed
        expect(env.data.notes.some((n) => n.includes("No step in this plan needs"))).toBe(true);
    });

    it("a pure read intent has zero mutating and zero confirmation steps", async () => {
        const env = envelopeOf(await planChange(ctx, { goal: "audit my totals" }));
        expect(env.data.intent).toBe("review time");
        expect(env.data.mutatingSteps).toBe(0);
        expect(env.data.confirmationRequiredSteps).toBe(0);
    });
});

describe("planChange — FALLBACK for unrecognized goals", () => {
    it("an unmatched goal routes to the orient-first fallback (status -> tools_guide)", async () => {
        const env = envelopeOf(await planChange(ctx, { goal: "xyzzy plugh nothing matches here" }));
        expect(env.data.intent).toBe("orient first");
        expect(tools(env.data.plan)).toEqual(["clockify_status", "clockify_tools_guide"]);
        expect(env.data.mutatingSteps).toBe(0);
        expect(env.data.confirmationRequiredSteps).toBe(0);
    });

    it("echoes the goal/entity and surfaces the first step as `next`", async () => {
        const env = envelopeOf(
            await planChange(ctx, { goal: "qwerty unmatched", entity: "project" }),
        );
        expect(env.data.goal).toBe("qwerty unmatched");
        expect(env.data.entity).toBe("project");
        expect(env.next?.[0]?.tool).toBe("clockify_status");
        expect(env.next?.[0]?.reason).toContain("First step:");
    });

    it("defaults entity to null when not provided", async () => {
        const env = envelopeOf(await planChange(ctx, { goal: "qwerty unmatched" }));
        expect(env.data.entity).toBeNull();
    });
});
