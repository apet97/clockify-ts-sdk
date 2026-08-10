#!/usr/bin/env node
// check-gate-reachability: every scripts/check-*.mjs file must be executed
// by the Makefile, a root package.json script, or a workflow, or be a
// recorded licensed exception. Reuses the same orphan-detection engine
// scripts/check-test-wiring.mjs already runs for test files
// (scripts/lib/wiring-contract.mjs's evaluateWiring) and the same
// Makefile/package.json/workflow scanner (scripts/lib/executor-sources.mjs)
// -- see docs/gate-reachability-contract.json's purpose for why this is a
// reachability gap contract-inventory.json does not close (it validates
// FROM its own entries outward, never the reverse) and why it deliberately
// stays single-purpose rather than multi-rooting
// scripts/generate-gate-tier-inventory.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectExecutorSources } from "./lib/executor-sources.mjs";
import { evaluateWiring } from "./lib/wiring-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(root, "docs", "gate-reachability-contract.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const failures = [];

if (contract.schemaVersion !== 1) failures.push("schemaVersion must be 1");
if (typeof contract.purpose !== "string" || contract.purpose.trim().length === 0) {
    failures.push("purpose must be a non-empty string");
}
if (!Array.isArray(contract.roots) || contract.roots.length === 0) {
    failures.push("roots must be a non-empty array");
} else {
    const makefile = fs.readFileSync(path.join(root, "Makefile"), "utf8");
    for (const rootTarget of contract.roots) {
        if (!makefile.includes(`${rootTarget}:`)) {
            failures.push(`roots names ${rootTarget}, which is not a real Makefile target`);
        }
    }
}
if (!Array.isArray(contract.licensedExceptions)) {
    failures.push("licensedExceptions must be an array (use [] when nothing is exempt)");
} else {
    for (const entry of contract.licensedExceptions) {
        if (typeof entry?.path !== "string" || entry.path.length === 0) {
            failures.push("licensedExceptions entry missing path");
            continue;
        }
        if (typeof entry.reason !== "string" || entry.reason.trim().length === 0) {
            failures.push(`licensedExceptions ${entry.path} needs a non-empty reason`);
        }
        if (typeof entry.who !== "string" || entry.who.trim().length === 0) {
            failures.push(`licensedExceptions ${entry.path} needs a non-empty who`);
        }
        if (typeof entry.when !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.when)) {
            failures.push(`licensedExceptions ${entry.path} needs a when in YYYY-MM-DD form`);
        }
    }
}

if (failures.length > 0) {
    console.error("gate reachability check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

/** Recursively collect check-*.mjs files under scripts/, excluding *.test.mjs. */
function collectCheckers(relativeRoot) {
    const results = [];
    const walk = (relativeDir) => {
        const absolute = path.join(root, relativeDir);
        if (!fs.existsSync(absolute)) return;
        for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
            const relative = path.posix.join(relativeDir, entry.name);
            if (entry.isDirectory()) {
                walk(relative);
                continue;
            }
            if (/^check-.*\.mjs$/.test(entry.name) && !entry.name.endsWith(".test.mjs")) {
                results.push(relative);
            }
        }
    };
    walk(relativeRoot);
    return results.sort();
}

const discovered = collectCheckers(contract.scanRoot ?? "scripts");
const wiringFailures = evaluateWiring({
    discovered,
    executorTexts: collectExecutorSources(root),
    exemptions: contract.licensedExceptions,
    expectedCount: contract.expectedCheckerFileCount,
    kind: "checker",
});

if (wiringFailures.length > 0) {
    console.error("gate reachability check failed:");
    for (const failure of wiringFailures) console.error(`- ${failure}`);
    process.exit(1);
}

const exempt = contract.licensedExceptions.length;
console.log(
    `gate reachability passed (${discovered.length} checker files under ${contract.scanRoot ?? "scripts"}, ` +
        `${discovered.length - exempt} executed, ${exempt} licensed exception${exempt === 1 ? "" : "s"}, ` +
        `${contract.roots.length} named root gates).`,
);
