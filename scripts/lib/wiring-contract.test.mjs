import assert from "node:assert/strict";
import test from "node:test";

import { assertTestWiringShape, evaluateTestWiring, findExecuted } from "./wiring-contract.mjs";

function contract(overrides = {}) {
    return {
        expectedTestFileCount: 2,
        testFilePatterns: ["**/*.test.mjs"],
        executors: ["Makefile"],
        unwiredTests: [],
        ...overrides,
    };
}

const EXECUTORS = [{ source: "Makefile", text: "docs-drift:\n\tnode --test scripts/a.test.mjs\n" }];

test("findExecuted attributes each test to the executors that mention it", () => {
    const executed = findExecuted(["scripts/a.test.mjs", "scripts/b.test.mjs"], EXECUTORS);
    assert.deepEqual(executed.get("scripts/a.test.mjs"), ["Makefile"]);
    assert.equal(executed.has("scripts/b.test.mjs"), false);
});

test("an unwired test is reported as an orphan", () => {
    const failures = evaluateTestWiring({
        discovered: ["scripts/a.test.mjs", "scripts/b.test.mjs"],
        executorTexts: EXECUTORS,
        contract: contract(),
    });
    assert.equal(failures.length, 1);
    assert.match(failures[0], /scripts\/b\.test\.mjs is executed by no Makefile target/);
});

test("fully wired tests pass", () => {
    const failures = evaluateTestWiring({
        discovered: ["scripts/a.test.mjs"],
        executorTexts: EXECUTORS,
        contract: contract({ expectedTestFileCount: 1 }),
    });
    assert.deepEqual(failures, []);
});

test("an exempted orphan passes, but only with a disposition and reason", () => {
    const exempt = { path: "scripts/b.test.mjs", disposition: "quarantine", reason: "mutates the tracked Makefile" };
    assert.deepEqual(
        evaluateTestWiring({
            discovered: ["scripts/a.test.mjs", "scripts/b.test.mjs"],
            executorTexts: EXECUTORS,
            contract: contract({ unwiredTests: [exempt] }),
        }),
        [],
    );
    assert.match(
        evaluateTestWiring({
            discovered: ["scripts/a.test.mjs", "scripts/b.test.mjs"],
            executorTexts: EXECUTORS,
            contract: contract({ unwiredTests: [{ ...exempt, reason: "  " }] }),
        }).join("\n"),
        /needs a non-empty reason/,
    );
});

// Direction 2 -- without this the list rots into a permanent excuse.
test("an exemption for a deleted file fails", () => {
    const failures = evaluateTestWiring({
        discovered: ["scripts/a.test.mjs"],
        executorTexts: EXECUTORS,
        contract: contract({
            expectedTestFileCount: 1,
            unwiredTests: [{ path: "scripts/gone.test.mjs", disposition: "quarantine", reason: "x" }],
        }),
    });
    assert.equal(failures.length, 1);
    assert.match(failures[0], /no longer exists; delete the entry/);
});

// Direction 3 -- this is what forces each wiring commit to remove its own
// exemption, so the list cannot drift back out of sync with reality.
test("an exemption for a test that is now wired fails", () => {
    const failures = evaluateTestWiring({
        discovered: ["scripts/a.test.mjs"],
        executorTexts: EXECUTORS,
        contract: contract({
            expectedTestFileCount: 1,
            unwiredTests: [{ path: "scripts/a.test.mjs", disposition: "quarantine", reason: "x" }],
        }),
    });
    assert.equal(failures.length, 1);
    assert.match(failures[0], /but it is executed by Makefile; delete the entry/);
});

// Direction 4 -- adding a test file must be a deliberate contract edit.
test("a changed test-file count fails the ratchet", () => {
    const failures = evaluateTestWiring({
        discovered: ["scripts/a.test.mjs"],
        executorTexts: EXECUTORS,
        contract: contract({ expectedTestFileCount: 2 }),
    });
    assert.match(failures.join("\n"), /discovered 1 test files but expectedTestFileCount is 2/);
});

test("npm scripts and workflows count as executors, not just the Makefile", () => {
    const failures = evaluateTestWiring({
        discovered: ["scripts/a.test.mjs", "scripts/b.test.mjs"],
        executorTexts: [
            { source: "package.json", text: '"test:codegen": "node --test scripts/a.test.mjs"' },
            { source: ".github/workflows/ci.yml", text: "run: node --test scripts/b.test.mjs" },
        ],
        contract: contract(),
    });
    assert.deepEqual(failures, []);
});

test("shape validation rejects traversal, duplicates, and a non-array exemption list", () => {
    assert.match(
        assertTestWiringShape(contract({ unwiredTests: [{ path: "../evil.test.mjs", disposition: "d", reason: "r" }] })).join("\n"),
        /repo-relative without traversal/,
    );
    const dup = { path: "scripts/b.test.mjs", disposition: "d", reason: "r" };
    assert.match(assertTestWiringShape(contract({ unwiredTests: [dup, dup] })).join("\n"), /duplicate path/);
    assert.match(assertTestWiringShape(contract({ unwiredTests: undefined })).join("\n"), /must be an array/);
    assert.match(assertTestWiringShape(undefined)[0], /contract is missing/);
});
