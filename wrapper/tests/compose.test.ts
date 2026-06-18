import { describe, expect, it } from "vitest";

import { leftBehindNote, runComposition, type CompositionStep } from "../compose.js";

describe("runComposition", () => {
    it("runs all steps and reports ok, accumulating created + reused", async () => {
        const steps: CompositionStep[] = [
            { label: "client", required: false, run: async () => ({ kind: "done", reused: [{ type: "client", id: "c1", name: "Acme" }] }) },
            { label: "project", required: true, run: async () => ({ kind: "done", created: [{ type: "project", id: "p1", name: "Launch" }], undo: async () => {} }) },
        ];
        const outcome = await runComposition(steps);
        expect(outcome.status.kind).toBe("ok");
        expect(outcome.created).toEqual([{ type: "project", id: "p1", name: "Launch" }]);
        expect(outcome.reused).toEqual([{ type: "client", id: "c1", name: "Acme" }]);
    });

    it("rolls back created entities in REVERSE order when a required step fails", async () => {
        const undone: string[] = [];
        const steps: CompositionStep[] = [
            {
                label: "client",
                required: false,
                run: async () => ({ kind: "done", created: [{ type: "client", id: "c1", name: "Acme" }], undo: async () => { undone.push("client"); } }),
            },
            {
                label: "project",
                required: false,
                run: async () => ({ kind: "done", created: [{ type: "project", id: "p1", name: "Launch" }], undo: async () => { undone.push("project"); } }),
            },
            { label: "task", required: true, run: async () => { throw new Error("tasks.create 400"); } },
        ];
        const outcome = await runComposition(steps);
        expect(outcome.status.kind).toBe("failed");
        if (outcome.status.kind === "failed") {
            expect(outcome.status.label).toBe("task");
            expect(outcome.status.message).toContain("tasks.create 400");
            expect(outcome.status.rolledBack.map((r) => r.type)).toEqual(["project", "client"]);
            expect(outcome.status.rollbackWarnings).toEqual([]);
        }
        // reverse order: project undone before client
        expect(undone).toEqual(["project", "client"]);
    });

    it("never rolls back a REUSED entity (no undo on the reuse branch)", async () => {
        const undone: string[] = [];
        const steps: CompositionStep[] = [
            // reused client: NO undo even though a later required step fails
            { label: "client", required: false, run: async () => ({ kind: "done", reused: [{ type: "client", id: "c9", name: "Acme" }] }) },
            {
                label: "project",
                required: false,
                run: async () => ({ kind: "done", created: [{ type: "project", id: "p1", name: "Launch" }], undo: async () => { undone.push("project"); } }),
            },
            { label: "task", required: true, run: async () => { throw new Error("boom"); } },
        ];
        const outcome = await runComposition(steps);
        expect(outcome.status.kind).toBe("failed");
        // only the created project was rolled back; the reused client was not touched
        expect(undone).toEqual(["project"]);
        if (outcome.status.kind === "failed") {
            expect(outcome.status.rolledBack.map((r) => r.id)).toEqual(["p1"]);
        }
    });

    it("a best-effort step failure warns and the run continues", async () => {
        const steps: CompositionStep[] = [
            { label: "project", required: true, run: async () => ({ kind: "done", created: [{ type: "project", id: "p1" }], undo: async () => {} }) },
            { label: "timer", required: false, run: async () => { throw new Error("start failed"); } },
        ];
        const outcome = await runComposition(steps);
        expect(outcome.status.kind).toBe("ok");
        expect(outcome.warnings).toContainEqual({ code: "step_failed", message: "timer: start failed" });
    });

    it("surfaces rollbackWarnings when an undo itself throws", async () => {
        const steps: CompositionStep[] = [
            {
                label: "project",
                required: false,
                run: async () => ({ kind: "done", created: [{ type: "project", id: "p1", name: "Launch" }], undo: async () => { throw new Error("delete 400"); } }),
            },
            { label: "task", required: true, run: async () => { throw new Error("nope"); } },
        ];
        const outcome = await runComposition(steps);
        expect(outcome.status.kind).toBe("failed");
        if (outcome.status.kind === "failed") {
            expect(outcome.status.rollbackWarnings).toHaveLength(1);
            expect(outcome.status.rollbackWarnings[0]!.code).toBe("rollback_failed");
            expect(outcome.status.rollbackWarnings[0]!.message).toContain("project Launch");
        }
    });
});

describe("leftBehindNote", () => {
    it("is reassuring only when rollback was clean", () => {
        expect(leftBehindNote([])).toBe("Nothing partial was left behind.");
    });

    it("warns truthfully when rollback left items behind", () => {
        const note = leftBehindNote([{ message: "Could not roll back project Launch: delete 400" }]);
        expect(note).toContain("could NOT be rolled back");
        expect(note).toContain("project Launch");
    });
});
