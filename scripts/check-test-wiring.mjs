#!/usr/bin/env node
// check-test-wiring: fails when a test file under scripts/ is executed by no
// Makefile target, npm script, or workflow. See scripts/lib/wiring-contract.mjs
// for why discovery lives in a meta-gate rather than in the runner.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectExecutorSources } from "./lib/executor-sources.mjs";
import { evaluateTestWiring } from "./lib/wiring-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(root, "docs", "test-wiring-contract.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));

/** Recursively collect test files under a root, in repo-relative form. */
function collectTests(relativeRoot) {
    const results = [];
    const walk = (relativeDir) => {
        const absolute = path.join(root, relativeDir);
        if (!fs.existsSync(absolute)) return;
        for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
            const relative = path.posix.join(relativeDir, entry.name);
            if (entry.isDirectory()) {
                if (contract.excludedDirs?.includes(relative)) continue;
                walk(relative);
                continue;
            }
            if (entry.name.endsWith(".test.mjs") || entry.name.startsWith("test-")) {
                if (entry.name.endsWith(".mjs")) results.push(relative);
            }
        }
    };
    walk(relativeRoot);
    return results.sort();
}

const discovered = collectTests(contract.scanRoot ?? "scripts");
const failures = evaluateTestWiring({ discovered, executorTexts: collectExecutorSources(root), contract });

if (failures.length > 0) {
    console.error("test wiring check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const exempt = contract.unwiredTests?.length ?? 0;
console.log(
    `test wiring passed (${discovered.length} test files under ${contract.scanRoot ?? "scripts"}, ` +
        `${discovered.length - exempt} executed, ${exempt} recorded as unwired)`,
);
