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
