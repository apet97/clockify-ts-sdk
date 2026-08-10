#!/usr/bin/env node
// Structural gate for docs/published-surface-diff-contract.json (P1): the
// contract's `packages` list is documentation ABOUT the differ, not a
// second source of truth the differ reads from at runtime (that stays
// scripts/published-surface-diff/packages.mjs, code, so registrySpec
// typos fail at import time, not silently). This checker is what gives the
// doc real teeth -- it cross-validates the two never drift apart.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PACKAGES } from "./published-surface-diff/packages.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
    failures.push(message);
}

const contractPath = "docs/published-surface-diff-contract.json";
let contract;
try {
    contract = JSON.parse(fs.readFileSync(path.join(root, contractPath), "utf8"));
} catch (err) {
    console.error(`${contractPath}: could not read/parse (${err instanceof Error ? err.message : String(err)})`);
    process.exit(1);
}

const REQUIRED_BUMP_CLASSES = ["downgrade", "none", "patch", "minor", "major"];
for (const key of REQUIRED_BUMP_CLASSES) {
    if (typeof contract.bumpClassPolicy?.[key] !== "string" || contract.bumpClassPolicy[key].trim() === "") {
        fail(`bumpClassPolicy.${key}: must be a non-empty string`);
    }
}

if (!Array.isArray(contract.packages)) {
    fail("packages: must be an array");
} else {
    const contractIds = contract.packages.map((entry) => entry.id).sort();
    const realIds = PACKAGES.map((pkg) => pkg.id).sort();
    if (JSON.stringify(contractIds) !== JSON.stringify(realIds)) {
        fail(
            `packages: contract declares [${contractIds.join(", ")}] but ` +
                `scripts/published-surface-diff/packages.mjs's PACKAGES declares [${realIds.join(", ")}]`,
        );
    }
    for (const real of PACKAGES) {
        const declared = contract.packages.find((entry) => entry.id === real.id);
        if (declared == null) continue; // already reported by the set-mismatch above
        if (declared.registrySpec !== real.registrySpec) {
            fail(
                `packages[id=${real.id}].registrySpec: contract says ${JSON.stringify(declared.registrySpec)}, ` +
                    `packages.mjs says ${JSON.stringify(real.registrySpec)}`,
            );
        }
    }
}

if (failures.length > 0) {
    console.error(`${contractPath} drifted from scripts/published-surface-diff/packages.mjs:`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`published-surface-diff contract passed (${PACKAGES.length} packages, ${REQUIRED_BUMP_CLASSES.length} bump classes documented)`);
