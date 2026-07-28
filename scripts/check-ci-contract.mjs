#!/usr/bin/env node
// check-ci-contract: enforces docs/ci-contract.json against the repository.
//
// Until 2026-07-28 this script hardcoded every assertion and never opened the
// contract at all, so `policyDocument`, `workflows[]` and `supportingDocs[]`
// were inert data that merely looked enforced. They drifted, undetected: the
// `ci.yml` entry still demanded `name: CI` and `node-version: ["20", "22"]`
// long after the workflow became `Workspace CI` on `["22.13.0", "24"]`, and it
// still listed `ci-cli.yml`/`ci-mcp.yml` — the very files this script asserts
// must NOT exist. A contract that contradicts its own checker is the
// false-green class this repo was hardened against, so the contract is now the
// single source of truth for text-presence assertions and the script keeps only
// the structural logic that cannot be expressed as `mustContain`.
import { readFileSync, existsSync, readdirSync } from "node:fs";

const contractPath = "docs/ci-contract.json";
const contract = JSON.parse(readFileSync(contractPath, "utf8"));
const failures = [];

/** Assert a file exists and satisfies its declared markers. */
const requireMarkers = (label, entry) => {
    const { path, mustContain = [], forbiddenMarkers = [] } = entry;
    if (!existsSync(path)) {
        failures.push(`${label}: ${path} is named by ${contractPath} but does not exist`);
        return;
    }
    const text = readFileSync(path, "utf8");
    for (const marker of mustContain) {
        if (!text.includes(marker))
            failures.push(`${label}: ${path} must contain ${JSON.stringify(marker)}`);
    }
    for (const marker of forbiddenMarkers) {
        if (text.includes(marker))
            failures.push(`${label}: ${path} must not contain ${JSON.stringify(marker)}`);
    }
};

requireMarkers("policyDocument", contract.policyDocument);
for (const entry of contract.workflows) requireMarkers("workflows", entry);
for (const entry of contract.supportingDocs) requireMarkers("supportingDocs", entry);

// Retired workflows must be gone AND must not be resurrected as live contract
// entries. The second half is the check that was missing: the contract listed
// two files whose absence this script separately required.
const retiredPaths = new Set();
for (const { path, reason } of contract.retiredWorkflows) {
    retiredPaths.add(path);
    if (!reason) failures.push(`retiredWorkflows: ${path} must record why it was retired`);
    if (existsSync(path))
        failures.push(`retiredWorkflows: ${path} was retired but still exists: ${reason}`);
}
for (const { path } of contract.workflows) {
    if (retiredPaths.has(path)) {
        failures.push(`workflows: ${path} is listed as a live workflow but also as retired`);
    }
}

// The 40-hex SHA pin is the load-bearing part. The trailing version comment is
// cosmetic, so accept every shape Dependabot emits: it writes the full release
// tag (`# v7.0.0`), while hand-edits here have used the bare major (`# v7`).
// Matching only `v\d+` silently failed every Dependabot action bump.
const pinnedUse = /@[0-9a-f]{40}(?:\s+#\s+v\d+(?:\.\d+)*)?\s*$/;
// Both YAML step forms count. Matching only a bare `uses:` — as this gate did
// until 2026-07-28 — silently skipped every `- uses:` line, i.e. the first step
// of every job, which is exactly where `actions/checkout` lives.
const isUsesLine = (line) => /^-?\s*uses:\s/.test(line.trim());
const usesLines = (path) => readFileSync(path, "utf8").split("\n").filter(isUsesLine);

const { enforcedFor, knownUnpinned } = contract.actionPinning;
const unpinnedByPath = new Map(knownUnpinned.map((entry) => [entry.path, entry]));

// Coverage is total by construction: every workflow on disk is either
// pin-enforced or a recorded gap. A new workflow cannot escape pinning by
// simply not being mentioned.
const onDisk = readdirSync(".github/workflows")
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => `.github/workflows/${name}`)
    .sort();
for (const path of onDisk) {
    const governed = enforcedFor.includes(path) || unpinnedByPath.has(path);
    if (!governed) {
        failures.push(
            `actionPinning: ${path} exists but is in neither enforcedFor nor knownUnpinned; add it to one`,
        );
    }
}
for (const path of [...enforcedFor, ...unpinnedByPath.keys()]) {
    if (!onDisk.includes(path))
        failures.push(`actionPinning: ${path} is governed but does not exist`);
}
for (const path of enforcedFor) {
    if (unpinnedByPath.has(path)) {
        failures.push(`actionPinning: ${path} cannot be both enforcedFor and knownUnpinned`);
        continue;
    }
    if (!existsSync(path)) continue;
    for (const line of usesLines(path)) {
        if (!pinnedUse.test(line)) {
            failures.push(
                `actionPinning: ${path} action is not SHA pinned with a version comment: ${line.trim()}`,
            );
        }
    }
}
// A recorded gap ratchets shut: once the actions are pinned, the record is
// stale and must move to enforcedFor rather than linger as a soft exemption.
for (const entry of unpinnedByPath.values()) {
    for (const field of ["openRisk", "closureTarget", "discoveredBy"]) {
        if (!entry[field])
            failures.push(`actionPinning: knownUnpinned ${entry.path} must record ${field}`);
    }
    if (!existsSync(entry.path)) continue;
    const stillUnpinned = usesLines(entry.path).filter((line) => !pinnedUse.test(line));
    if (stillUnpinned.length === 0) {
        failures.push(
            `actionPinning: ${entry.path} is now fully SHA pinned; move it from knownUnpinned to enforcedFor`,
        );
    }
    for (const declared of entry.unpinnedUses ?? []) {
        if (!stillUnpinned.some((line) => line.includes(declared))) {
            failures.push(
                `actionPinning: ${entry.path} no longer has unpinned ${declared}; update its knownUnpinned record`,
            );
        }
    }
}

const { wiring } = contract;
if (!existsSync(wiring.checker)) failures.push(`wiring: checker ${wiring.checker} does not exist`);

const makefile = readFileSync("Makefile", "utf8");
const makefileLines = makefile.split("\n");
const targetLine = (name) => makefileLines.find((line) => line.startsWith(`${name}:`)) ?? "";
if (!targetLine(wiring.makeTarget))
    failures.push(`wiring: Makefile has no ${wiring.makeTarget} target`);
if (!targetLine("contract-gates").includes(wiring.makeTarget)) {
    failures.push(`contract-gates must include ${wiring.makeTarget}`);
}
for (const aggregate of ["perfect-fast", "perfect-full"]) {
    if (!targetLine(aggregate).includes(wiring.makeTarget)) {
        failures.push(`${aggregate} must include ${wiring.makeTarget}`);
    }
}

if (failures.length > 0) {
    console.error("CI contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}
console.log(
    `CI contract passed (${contract.workflows.length} workflows, ${contract.retiredWorkflows.length} retired, ` +
        `${enforcedFor.length} pin-enforced, ${knownUnpinned.length} recorded pin gaps)`,
);
