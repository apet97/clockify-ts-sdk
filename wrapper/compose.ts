/**
 * Atomic multi-step composition with transactional rollback. A composed
 * operation is an ordered list of steps; `runComposition` executes them and owns
 * the transactional semantics so callers (e.g. a "create client → project → task
 * → tags" work-package) don't each re-implement them:
 *
 * - A **required** step that throws rolls back every entity created so far (its
 *   `undo`s run in REVERSE order) and reports a clean failure — no orphans.
 * - A **best-effort** step (`required: false`) that throws becomes a warning and
 *   the run continues.
 * - Only entities a step actually CREATED get an `undo`; reused entities are
 *   never rolled back.
 *
 * This module is pure orchestration — all I/O lives in the step closures, so it
 * has no SDK/transport dependency and is fully fixture-testable. `EntityRef` and
 * `Warning` are defined locally (structurally compatible with the receipt types
 * the CLI/MCP layers use) to keep this subpath dependency-free.
 */

/** A created/reused entity, structurally compatible with the CLI/MCP receipt refs. */
export interface EntityRef {
    type: string;
    id: string;
    name?: string;
    projectId?: string;
}

/** A non-fatal note (`code` optional, mirroring the reference receipt shape). */
export interface Warning {
    code?: string;
    message: string;
}

export interface StepResult {
    kind: "done";
    created?: EntityRef[];
    reused?: EntityRef[];
    warnings?: Warning[];
    /** Compensating action to undo this step's creates if a later required step fails. */
    undo?: () => Promise<void>;
}

export interface CompositionStep {
    label: string;
    /** Required: a throw rolls back + fails. Best-effort (false): a throw warns + continues. */
    required: boolean;
    run(): Promise<StepResult>;
}

export type CompositionStatus =
    | { kind: "ok" }
    | {
          kind: "failed";
          label: string;
          message: string;
          rolledBack: EntityRef[];
          rollbackWarnings: Warning[];
      };

export interface CompositionOutcome {
    created: EntityRef[];
    reused: EntityRef[];
    warnings: Warning[];
    status: CompositionStatus;
}

/**
 * The truthful cleanup note for a FAILED composition. Reassuring ("Nothing partial
 * was left behind.") ONLY when rollback was clean; when rollback itself failed
 * (rollbackWarnings non-empty) it must say so — otherwise the receipt tells the
 * caller the workspace is clean while orphaned entities remain. Pass
 * `outcome.status.rollbackWarnings`; never assume clean.
 */
export function leftBehindNote(rollbackWarnings: readonly { message: string }[]): string {
    if (rollbackWarnings.length === 0) return "Nothing partial was left behind.";
    return `WARNING: some already-created items could NOT be rolled back and may remain — ${rollbackWarnings
        .map((w) => w.message)
        .join("; ")}. Please check the workspace before retrying.`;
}

interface Undoable {
    refs: EntityRef[];
    undo: () => Promise<void>;
}

async function rollback(undos: Undoable[]): Promise<{ rolledBack: EntityRef[]; rollbackWarnings: Warning[] }> {
    const rolledBack: EntityRef[] = [];
    const rollbackWarnings: Warning[] = [];
    for (let i = undos.length - 1; i >= 0; i -= 1) {
        const entry = undos[i]!;
        try {
            await entry.undo();
            rolledBack.push(...entry.refs);
        } catch (err) {
            const what = entry.refs.map((r) => `${r.type} ${r.name ?? r.id}`).join(", ");
            rollbackWarnings.push({
                code: "rollback_failed",
                message: `Could not roll back ${what}: ${err instanceof Error ? err.message : String(err)}`,
            });
        }
    }
    return { rolledBack, rollbackWarnings };
}

/**
 * Run `steps` in order with transactional rollback. A failed required step rolls
 * back prior creates (in reverse) and returns `status.kind === "failed"`; a failed
 * best-effort step is collected as a warning and the run continues.
 *
 * @example
 * ```ts
 * const outcome = await runComposition([
 *   { label: "client", required: false, run: async () => {
 *       const c = await api.createClient(name);
 *       return { kind: "done", created: [{ type: "client", id: c.id, name }], undo: () => api.deleteClient(c.id) };
 *   } },
 *   { label: "project", required: true, run: async () => {
 *       const p = await api.createProject(name);
 *       return { kind: "done", created: [{ type: "project", id: p.id, name }], undo: () => api.deleteProject(p.id) };
 *   } },
 * ]);
 * if (outcome.status.kind === "failed") {
 *   console.error(outcome.status.message, leftBehindNote(outcome.status.rollbackWarnings));
 * }
 * ```
 */
export async function runComposition(steps: CompositionStep[]): Promise<CompositionOutcome> {
    const created: EntityRef[] = [];
    const reused: EntityRef[] = [];
    const warnings: Warning[] = [];
    const undos: Undoable[] = [];

    for (const step of steps) {
        let result: StepResult;
        try {
            result = await step.run();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (!step.required) {
                warnings.push({ code: "step_failed", message: `${step.label}: ${message}` });
                continue;
            }
            const { rolledBack, rollbackWarnings } = await rollback(undos);
            return { created, reused, warnings, status: { kind: "failed", label: step.label, message, rolledBack, rollbackWarnings } };
        }

        if (result.created?.length) created.push(...result.created);
        if (result.reused?.length) reused.push(...result.reused);
        if (result.warnings?.length) warnings.push(...result.warnings);
        // Only steps that actually CREATED something get an undo — never roll back a reuse.
        if (result.undo && result.created?.length) undos.push({ refs: result.created, undo: result.undo });
    }

    return { created, reused, warnings, status: { kind: "ok" } };
}
