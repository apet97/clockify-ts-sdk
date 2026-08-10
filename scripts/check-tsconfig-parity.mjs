#!/usr/bin/env node
// check-tsconfig-parity: wrapper, cli, and mcp each carry their own
// tsconfig.json rather than extending a shared base (see
// docs/tsconfig-parity-contract.json's purpose -- no shared base config
// migration is in scope). This is the declared-equivalence proof that
// stands in for a shared base: every flag that must be identical is
// asserted equal, every flag that legitimately differs is named with a
// reason and checked against the real file, and verbatimModuleSyntax's
// compiler-side equivalence claim (lint half lives in check-lint-config.mjs)
// is swept across every tsconfig*.json in the repo.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    checkAllowedDiffs,
    checkRequiredFlags,
    discoverTsconfigs,
    loadTsconfig,
} from "./lib/tsconfig-parity.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = JSON.parse(
    await readFile(path.join(root, "docs/tsconfig-parity-contract.json"), "utf8"),
);

function fail(message) {
    failures.push(message);
}

if (contract.schemaVersion !== 1) fail("schemaVersion must be 1");
if (typeof contract.purpose !== "string" || contract.purpose.trim().length === 0) {
    fail("purpose must be a non-empty string");
}
if (!Array.isArray(contract.packages) || contract.packages.length !== 3) {
    fail("packages must list exactly 3 entries");
}

const configsByPackage = {};
for (const { package: packageName, path: relativePath } of contract.packages ?? []) {
    try {
        configsByPackage[packageName] = await loadTsconfig(root, relativePath);
    } catch (error) {
        fail(`${packageName}: cannot load ${relativePath}: ${error.message}`);
    }
}

if (failures.length === 0) {
    const flagMismatches = checkRequiredFlags(configsByPackage, contract.requiredFlags ?? {});
    for (const mismatch of flagMismatches) {
        fail(
            `${mismatch.packageName}: compilerOptions.${mismatch.flag} expected ${JSON.stringify(mismatch.expected)} but found ${JSON.stringify(mismatch.actual)}`,
        );
    }

    const diffMismatches = checkAllowedDiffs(configsByPackage, contract.allowedDiffs ?? {});
    for (const mismatch of diffMismatches) {
        fail(
            `${mismatch.packageName}: declared allowedDiffs.${mismatch.flag} expected ${JSON.stringify(mismatch.expected)} but found ${JSON.stringify(mismatch.actual)} -- update the contract's reason if this drift is deliberate`,
        );
    }

    // paths aliasing: special-cased rather than folded into allowedDiffs
    // because wrapper's `paths` map is a large, generated-adjacent object
    // that would have to be duplicated verbatim in the contract to compare
    // by value -- a second copy that could itself drift. Presence/absence
    // is the invariant that matters here, not the map's exact contents.
    const pathsRule = contract.pathsAliasing ?? {};
    const wrapperPaths = configsByPackage.wrapper?.compilerOptions?.paths;
    if (pathsRule.wrapperMustDeclarePaths) {
        if (wrapperPaths == null || typeof wrapperPaths !== "object" || Object.keys(wrapperPaths).length === 0) {
            fail("wrapper: compilerOptions.paths must be a non-empty object (pathsAliasing.wrapperMustDeclarePaths)");
        }
    }
    for (const packageName of pathsRule.othersMustNotDeclarePaths ?? []) {
        const config = configsByPackage[packageName];
        if (config?.compilerOptions?.paths != null) {
            fail(`${packageName}: compilerOptions.paths must not be declared (pathsAliasing.othersMustNotDeclarePaths)`);
        }
    }
}

// verbatimModuleSyntax equivalence sweep across every discovered tsconfig.
const discovered = await discoverTsconfigs(root, contract.packageDirs ?? []);
const pinnedFalsePaths = new Set((contract.verbatimModuleSyntaxEquivalence?.pinnedFalse ?? []).map((entry) => entry.path));
for (const relativePath of discovered) {
    let config;
    try {
        config = await loadTsconfig(root, relativePath);
    } catch (error) {
        fail(`cannot load ${relativePath}: ${error.message}`);
        continue;
    }
    const value = config.compilerOptions?.verbatimModuleSyntax;
    if (value === true) {
        fail(`${relativePath}: verbatimModuleSyntax must not be true -- the equivalent guarantee is enforced by @typescript-eslint/consistent-type-imports (see docs/lint-config-contract.json), not the compiler flag`);
    }
}
for (const relativePath of pinnedFalsePaths) {
    if (!discovered.includes(relativePath)) {
        fail(`verbatimModuleSyntaxEquivalence.pinnedFalse names ${relativePath}, which no longer exists`);
        continue;
    }
    const config = await loadTsconfig(root, relativePath);
    if (config.compilerOptions?.verbatimModuleSyntax !== false) {
        fail(`${relativePath}: must explicitly pin verbatimModuleSyntax: false`);
    }
}

const equivalentGate = contract.verbatimModuleSyntaxEquivalence?.equivalentLintGate;
if (equivalentGate == null || typeof equivalentGate.contract !== "string" || typeof equivalentGate.checker !== "string") {
    fail("verbatimModuleSyntaxEquivalence.equivalentLintGate must name the sibling contract and checker");
} else {
    for (const relativePath of [equivalentGate.contract, equivalentGate.checker]) {
        try {
            await readFile(path.join(root, relativePath), "utf8");
        } catch {
            fail(`verbatimModuleSyntaxEquivalence.equivalentLintGate names missing file ${relativePath}`);
        }
    }
}

if (failures.length > 0) {
    console.error("tsconfig parity check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(
    `tsconfig parity check passed (3 packages, ${Object.keys(contract.requiredFlags ?? {}).length} required flags, ${Object.keys(contract.allowedDiffs ?? {}).length} declared allowed diffs, ${discovered.length} tsconfig files swept for verbatimModuleSyntax).`,
);
