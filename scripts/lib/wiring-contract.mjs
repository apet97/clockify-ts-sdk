// Test-wiring meta-gate.
//
// Every `node --test` invocation in this repo is an explicit filename list --
// in the Makefile, in root package.json scripts, or in a workflow `run:` block.
// That is deliberate: four checkers assert on those literal
// "node --test scripts/<name>.test.mjs" substrings, so replacing the lists
// with a glob would red them. See docs/test-wiring-contract.json.
//
// The cost of explicit lists is that adding a test file and forgetting to wire
// it is silent. It was not hypothetical: 24 of 51 test files under scripts/
// were executed by nothing at all, including five that contracts cited as
// proof (docs/openapi-source-lock-policy.md,
// docs/enterprise-hardening-audit.json, docs/docs-quality-contract.json). The
// contracts claimed coverage that no runner provided.
//
// So discovery belongs here, in a gate that AUDITS the list, rather than in
// the runner that replaces it.
//
// The exemption list is checked in four directions, which is what stops it
// becoming a permanent excuse the way the tests themselves became permanent
// orphans:
//
//   1. every discovered test is executed OR exempted
//   2. every exemption points at a file that still exists
//   3. every exemption is genuinely NOT executed -- so wiring a test forces
//      deletion of its exemption in the same commit
//   4. the discovered count matches `expectedTestFileCount`, so adding or
//      deleting a test file is a deliberate contract edit

/**
 * Generic orphan-detection primitive `evaluateTestWiring` below is built on,
 * kept separate and reusable for a non-test discovery kind: a Makefile
 * `check-*.mjs` script or any other file whose "wired" test is verbatim
 * mention in a Makefile/package.json/workflow (see collectExecutorSources
 * in ./executor-sources.mjs). Used by scripts/check-gate-reachability.mjs
 * for orphan checker-script detection, alongside evaluateTestWiring's
 * test-file-specific field names and messages, which stay untouched here
 * so the nine existing wiring-contract tests keep asserting on unchanged
 * behavior.
 *
 * @param {object} input
 * @param {string[]} input.discovered      repo-relative paths found on disk
 * @param {Array}    input.executorTexts   [{ source, text }]
 * @param {Array}    input.exemptions      [{ path, ...anyOtherFields }]
 * @param {number}   [input.expectedCount] when given, ratchets discovered.length
 * @param {string}   [input.kind]          noun used in failure messages (default "file")
 * @returns {string[]} failures, empty when wiring is honest
 */
export function evaluateWiring({ discovered, executorTexts, exemptions, expectedCount, kind = "file" }) {
    const failures = [];
    if (!Array.isArray(exemptions)) return ["exemptions must be an array (use [] when nothing is exempt)"];

    const found = [...(discovered ?? [])].sort();
    const executed = findExecuted(found, executorTexts);
    const exemptionMap = new Map(exemptions.map((entry) => [entry?.path, entry]));

    if (typeof expectedCount === "number" && found.length !== expectedCount) {
        failures.push(
            `discovered ${found.length} ${kind} files but expected ${expectedCount}; ` +
                "adding or removing one must be a deliberate contract edit",
        );
    }

    for (const filePath of found) {
        if (executed.has(filePath)) continue;
        if (exemptionMap.has(filePath)) continue;
        failures.push(
            `${filePath} is executed by no Makefile target, npm script, or workflow. ` +
                "Wire it to the target that runs it, or record it as a licensed exception with a reason.",
        );
    }

    const foundSet = new Set(found);
    for (const entry of exemptions) {
        if (!foundSet.has(entry?.path)) {
            failures.push(`exemption lists ${entry?.path}, which no longer exists; delete the entry`);
            continue;
        }
        if (executed.has(entry.path)) {
            failures.push(
                `exemption lists ${entry.path}, but it is executed by ${executed.get(entry.path).join(", ")}; ` +
                    "delete the entry",
            );
        }
    }

    return failures;
}

/** A path is "executed" if any executor command string mentions it verbatim. */
export function findExecuted(discovered, executorTexts) {
    const executed = new Map();
    for (const testPath of discovered) {
        const sources = [];
        for (const executor of executorTexts ?? []) {
            if (typeof executor?.text === "string" && executor.text.includes(testPath)) {
                sources.push(executor.source);
            }
        }
        if (sources.length > 0) executed.set(testPath, sources);
    }
    return executed;
}

export function assertTestWiringShape(contract) {
    const failures = [];
    if (!contract || typeof contract !== "object") return ["test-wiring contract is missing"];
    if (typeof contract.expectedTestFileCount !== "number") {
        failures.push("expectedTestFileCount must be a number");
    }
    if (!Array.isArray(contract.testFilePatterns) || contract.testFilePatterns.length === 0) {
        failures.push("testFilePatterns must be a non-empty array");
    }
    if (!Array.isArray(contract.executors) || contract.executors.length === 0) {
        failures.push("executors must be a non-empty array");
    }
    if (!Array.isArray(contract.unwiredTests)) {
        failures.push("unwiredTests must be an array (use [] when nothing is exempt)");
        return failures;
    }
    const seen = new Set();
    for (const entry of contract.unwiredTests) {
        if (typeof entry?.path !== "string" || entry.path.length === 0) {
            failures.push("unwiredTests entry missing path");
            continue;
        }
        if (entry.path.includes("..") || entry.path.startsWith("/")) {
            failures.push(`unwiredTests path must be repo-relative without traversal: ${entry.path}`);
        }
        if (typeof entry.reason !== "string" || entry.reason.trim().length === 0) {
            failures.push(`unwiredTests entry ${entry.path} needs a non-empty reason`);
        }
        if (typeof entry.disposition !== "string" || entry.disposition.trim().length === 0) {
            failures.push(`unwiredTests entry ${entry.path} needs a disposition`);
        }
        if (seen.has(entry.path)) failures.push(`unwiredTests duplicate path ${entry.path}`);
        seen.add(entry.path);
    }
    return failures;
}

/**
 * Pure evaluation.
 *
 * @param {object} input
 * @param {string[]} input.discovered     repo-relative test paths found on disk
 * @param {Array}    input.executorTexts  [{ source, text }]
 * @param {object}   input.contract       parsed test-wiring contract
 * @returns {string[]} failures, empty when wiring is honest
 */
export function evaluateTestWiring({ discovered, executorTexts, contract }) {
    const failures = assertTestWiringShape(contract);
    if (failures.length > 0) return failures;

    const found = [...(discovered ?? [])].sort();
    const executed = findExecuted(found, executorTexts);
    const exemptions = new Map((contract.unwiredTests ?? []).map((entry) => [entry.path, entry]));

    // 4. count ratchet
    if (found.length !== contract.expectedTestFileCount) {
        failures.push(
            `discovered ${found.length} test files but expectedTestFileCount is ${contract.expectedTestFileCount}; ` +
                "adding or removing a test file must be a deliberate contract edit",
        );
    }

    // 1. orphan detection
    for (const testPath of found) {
        if (executed.has(testPath)) continue;
        if (exemptions.has(testPath)) continue;
        failures.push(
            `${testPath} is executed by no Makefile target, npm script, or workflow. ` +
                "Wire it to the target that runs its subject, or record it in unwiredTests with a reason.",
        );
    }

    const foundSet = new Set(found);
    for (const entry of contract.unwiredTests ?? []) {
        // 2. stale exemption
        if (!foundSet.has(entry.path)) {
            failures.push(`unwiredTests lists ${entry.path}, which no longer exists; delete the entry`);
            continue;
        }
        // 3. exemption that is now wired
        if (executed.has(entry.path)) {
            failures.push(
                `unwiredTests lists ${entry.path}, but it is executed by ${executed.get(entry.path).join(", ")}; ` +
                    "delete the entry",
            );
        }
    }

    return failures;
}
