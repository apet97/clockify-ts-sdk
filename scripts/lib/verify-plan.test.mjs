import assert from "node:assert/strict";
import test from "node:test";

import {
    commandsForPhase,
    makeStepGroupsForPhase,
} from "./verify-plan.mjs";

function makeTargets(phase) {
    return makeStepGroupsForPhase(phase).flat();
}

test("standalone full and release retain generator and mutation wiring once", () => {
    for (const phase of ["full", "release"]) {
        const targets = makeTargets(phase);
        for (const required of ["generator-comparison", "mutation-ci"]) {
            assert.equal(
                targets.filter((target) => target === required).length,
                1,
                `${phase} must run ${required} exactly once`,
            );
        }
    }
});

test("fast and full end with one fatal performance budget gate", () => {
    for (const phase of ["fast", "full"]) {
        const commands = commandsForPhase(phase);
        assert.deepEqual(commands.at(-1), {
            command: "make",
            args: ["performance-budgets"],
        });
        assert.equal(
            makeTargets(phase).filter((target) => target === "performance-budgets").length,
            1,
        );
    }
});

test("live and release keep performance policy outside fast/full ordering law", () => {
    assert.ok(Array.isArray(commandsForPhase("live")));
    assert.ok(Array.isArray(commandsForPhase("release")));
});

test("plan reads are defensive and unsupported phases fail closed", () => {
    const first = commandsForPhase("fast");
    first[0].args.push("mutation");
    assert.ok(!makeTargets("fast").includes("mutation"));
    assert.throws(() => commandsForPhase("unknown"), /unsupported verify phase/i);
});
