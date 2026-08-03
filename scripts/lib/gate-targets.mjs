/**
 * Shared gate-target resolution for the contract checkers.
 *
 * Several checkers assert that a contract's declared target id resolves to a
 * real `Makefile` `<target>:` rule. When a leaf gate is retired and folded
 * into a survivor gate, its id stays referenced across many contracts/policies
 * (by design — those references are history + cross-gate coverage). The
 * `retiredGates` map in `docs/contract-inventory.json` records each
 * `<old-target> -> <survivor-target>` edge so a retired id still resolves
 * (transitively) to a live target. This collapses a leaf-gate retirement from
 * ~20 cross-reference edits down to one map entry plus the gate's own removal.
 */
import { readFile } from "node:fs/promises";

import { parseMakefile } from "./aggregate-gates.mjs";

/** Read the `{ "<old-target>": "<survivor-target>" }` map from contract-inventory.json. */
export async function loadRetiredGates() {
    const url = new URL("../../docs/contract-inventory.json", import.meta.url);
    const raw = await readFile(url, "utf8");
    return JSON.parse(raw).retiredGates ?? {};
}

/**
 * True if `target` resolves to a live Makefile target, either directly
 * (`makefile` contains `${target}:`) or because it is a `retiredGates` key
 * whose survivor target is itself live (resolved transitively, cycle-safe).
 */
export function isLiveTarget(makefile, target, retiredGates = {}, seen = new Set()) {
    if (makefile.includes(`${target}:`)) return true;
    if (seen.has(target)) return false;
    seen.add(target);
    const survivor = retiredGates[target];
    if (!survivor) return false;
    return isLiveTarget(makefile, survivor, retiredGates, seen);
}

/**
 * Return the Make target that actually executes a contract's proof. Wrapper
 * targets such as `breaking-change-review` deliberately point at a `*-run`
 * target in aggregate graphs, so wiring checks must use that execution target
 * rather than guessing from the contract's public name.
 */
export function aggregateWiringTarget(wiring = {}) {
    return wiring.aggregateTarget ?? wiring.aggregateExecutionTarget ?? wiring.makeTarget ?? null;
}

/** Resolve the effective execution target declared by a contract's wiring. */
export function isWiringTargetReachable(makefile, aggregateTarget, wiring = {}, retiredGates = {}) {
    const target = aggregateWiringTarget(wiring);
    return target != null && isTargetReachable(makefile, aggregateTarget, target, retiredGates);
}

/**
 * Resolve a target through the real Make prerequisite DAG.
 *
 * This is intentionally separate from `isLiveTarget`: the latter answers
 * whether a target id exists (including a retired alias), while this helper
 * answers whether an aggregate reaches that id. It is cycle-safe and fails
 * closed when the bounded Make parser cannot parse the source.
 */
export function isTargetReachable(makefile, aggregateTarget, target, retiredGates = {}) {
    if (typeof makefile !== "string" || typeof aggregateTarget !== "string" || typeof target !== "string") {
        return false;
    }
    const model = parseMakefile(makefile);
    if (model.parseFailures.length > 0) return false;

    const targetCandidates = new Set();
    const candidateSeen = new Set();
    let candidate = target;
    while (typeof candidate === "string" && candidate !== "" && !candidateSeen.has(candidate)) {
        targetCandidates.add(candidate);
        candidateSeen.add(candidate);
        candidate = retiredGates[candidate];
    }

    const visited = new Set();
    function visit(current) {
        if (targetCandidates.has(current)) return true;
        if (visited.has(current)) return false;
        visited.add(current);
        const definition = model.targets.get(current);
        if (definition == null) return false;
        return definition.prerequisites.some(visit);
    }

    return visit(aggregateTarget);
}

/** True when any named aggregate reaches the target through its Make DAG. */
export function isTargetReachableFromAny(makefile, aggregateTargets, target, retiredGates = {}) {
    if (!Array.isArray(aggregateTargets)) return false;
    return aggregateTargets.some((aggregateTarget) =>
        isTargetReachable(makefile, aggregateTarget, target, retiredGates),
    );
}
