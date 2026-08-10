#!/usr/bin/env node
// check-lint-config: the repo runs three hand-written ESLint flat configs
// (wrapper, cli, mcp), each on `strictTypeChecked` with zero rules
// downgraded to "warn" (a warn is a suppression nobody has to fix). Every
// rule turned "off" in hand-written scope must be one of the six reviewed,
// rationale-backed disables recorded in docs/lint-config-contract.json --
// this is the ratchet that catches a silent new suppression, a deleted
// rationale, or a dropped strictTypeChecked preset before it ships.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import tseslint from "typescript-eslint";

import {
    LINT_CONFIGS,
    collectRuleStates,
    findContiguousRange,
    findOffRuleLines,
    loadFlatConfig,
    readSource,
} from "./lib/lint-config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = JSON.parse(
    await readFile(path.join(root, "docs/lint-config-contract.json"), "utf8"),
);

function fail(message) {
    failures.push(message);
}

// --- contract shape ---------------------------------------------------
if (contract.schemaVersion !== 1) fail("schemaVersion must be 1");
if (typeof contract.purpose !== "string" || contract.purpose.trim().length === 0) {
    fail("purpose must be a non-empty string");
}
if (!Array.isArray(contract.configs) || contract.configs.length !== LINT_CONFIGS.length) {
    fail(`configs must list exactly ${LINT_CONFIGS.length} entries`);
} else {
    for (const expected of LINT_CONFIGS) {
        const match = contract.configs.find(
            (entry) => entry.package === expected.package && entry.path === expected.path,
        );
        if (!match) fail(`configs missing ${expected.package} (${expected.path})`);
    }
}
if (!Array.isArray(contract.disableAllowlist) || contract.disableAllowlist.length !== 6) {
    fail("disableAllowlist must list exactly 6 entries");
}
for (const entry of contract.disableAllowlist ?? []) {
    const rules = entry.rules ?? (entry.rule != null ? [entry.rule] : []);
    if (rules.length === 0) fail(`${entry.id}: must name rule or rules`);
    if (!Array.isArray(entry.packages) || entry.packages.length === 0) {
        fail(`${entry.id}: packages must be a non-empty array`);
    }
    if (entry.scopeFiles !== null && !Array.isArray(entry.scopeFiles)) {
        fail(`${entry.id}: scopeFiles must be null or an array`);
    }
    if (typeof entry.count !== "number" || entry.count <= 0) {
        fail(`${entry.id}: count must be a positive number`);
    }
    if (!Array.isArray(entry.rationaleMarkers) || entry.rationaleMarkers.length === 0) {
        fail(`${entry.id}: rationaleMarkers must be a non-empty array`);
    }
}

if (failures.length > 0) {
    console.error("Lint config check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

// --- per-config structural + textual proof ------------------------------
const strictTypeChecked = tseslint.configs.strictTypeChecked;
const occurrences = new Map(contract.disableAllowlist.map((entry) => [entry.id, 0]));
const rationaleFoundFor = new Set();
const ruleToEntry = new Map();
for (const entry of contract.disableAllowlist) {
    for (const rule of entry.rules ?? [entry.rule]) {
        const key = `${rule}`;
        if (!ruleToEntry.has(key)) ruleToEntry.set(key, []);
        ruleToEntry.get(key).push(entry);
    }
}

function scopeMatches(stateScopeFiles, entryScopeFiles) {
    if (entryScopeFiles === null) return stateScopeFiles === null;
    if (stateScopeFiles === null) return false;
    const a = [...stateScopeFiles].sort();
    const b = [...entryScopeFiles].sort();
    return JSON.stringify(a) === JSON.stringify(b);
}

for (const { package: packageName, path: relativePath } of LINT_CONFIGS) {
    const absoluteExists = await readSource(root, relativePath).catch(() => null);
    if (absoluteExists == null) {
        fail(`${packageName}: missing config file ${relativePath}`);
        continue;
    }
    const sourceText = absoluteExists;
    const configArray = await loadFlatConfig(root, relativePath);

    const presetBlocks = findContiguousRange(configArray, strictTypeChecked);
    if (presetBlocks == null) {
        fail(`${packageName}: ${relativePath} does not spread tseslint.configs.strictTypeChecked`);
    }

    const states = collectRuleStates(configArray, presetBlocks ?? new Set());

    const hasConsistentTypeImports = states.some(
        (state) =>
            state.rule === "@typescript-eslint/consistent-type-imports" &&
            !state.off &&
            !state.warn &&
            !state.testScope,
    );
    if (!hasConsistentTypeImports) {
        fail(`${packageName}: consistent-type-imports must be enabled (non-off, non-warn) outside test scope`);
    }

    const warnStates = states.filter((state) => state.warn);
    for (const state of warnStates) {
        fail(`${packageName}: rule ${state.rule} is set to "warn" -- zero-warn-rules requires "error" or "off"`);
    }

    for (const state of states) {
        if (!state.off || state.testScope) continue;
        const candidates = (ruleToEntry.get(state.rule) ?? []).filter(
            (entry) =>
                entry.packages.includes(packageName) && scopeMatches(state.scopeFiles, entry.scopeFiles),
        );
        if (candidates.length === 0) {
            fail(
                `${packageName}: undeclared lint suppression ${state.rule} (scope ${
                    state.scopeFiles ? state.scopeFiles.join(",") : "global"
                }) is not in the 6-entry disableAllowlist`,
            );
            continue;
        }
        const entry = candidates[0];
        occurrences.set(entry.id, (occurrences.get(entry.id) ?? 0) + 1);

        const hits = findOffRuleLines(sourceText, state.rule);
        const withRationale = hits.some((hit) =>
            entry.rationaleMarkers.some((marker) =>
                hit.rationaleText.toLowerCase().includes(marker.toLowerCase()),
            ),
        );
        const key = `${entry.id}|${packageName}`;
        if (withRationale) rationaleFoundFor.add(key);
    }
}

// A multi-rule group entry (e.g. the six no-unsafe-* rules) is authored
// with ONE shared rationale comment above the first rule in the group, not
// a repeated comment per rule -- so rationale presence is checked per
// (entry, package), not per individual raw off-state.
for (const entry of contract.disableAllowlist) {
    for (const packageName of entry.packages) {
        if (!rationaleFoundFor.has(`${entry.id}|${packageName}`)) {
            fail(
                `${packageName}: allowlist entry ${entry.id} has no preceding rationale comment containing one of ${JSON.stringify(entry.rationaleMarkers)}`,
            );
        }
    }
}

for (const entry of contract.disableAllowlist) {
    const actual = occurrences.get(entry.id) ?? 0;
    if (actual !== entry.count) {
        fail(`disableAllowlist entry ${entry.id} expected count ${entry.count} but found ${actual}`);
    }
}

if (failures.length > 0) {
    console.error("Lint config check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(
    `Lint config check passed (${LINT_CONFIGS.length} configs, strictTypeChecked, zero warn rules, ${contract.disableAllowlist.length}-entry rationale-backed disable allowlist).`,
);
