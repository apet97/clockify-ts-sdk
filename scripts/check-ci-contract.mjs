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
import YAML from "yaml";

import { isWiringTargetReachable } from "./lib/gate-targets.mjs";

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

const requireWorkflowSemantics = (label, entry) => {
    const { path, semantic } = entry;
    if (!semantic) return;
    if (!existsSync(path)) return;

    const text = readFileSync(path, "utf8");
    let workflow;
    try {
        workflow = YAML.parse(text);
    } catch (error) {
        failures.push(`${label}: ${path} is invalid YAML: ${error.message}`);
        return;
    }

    if (semantic.requireWorkflowDispatch) {
        const dispatch = workflow?.on?.workflow_dispatch;
        if (
            !dispatch ||
            typeof dispatch !== "object" ||
            Array.isArray(dispatch) ||
            Object.keys(dispatch).length !== 0
        ) {
            failures.push(`${label}: ${path} must define workflow_dispatch: {}`);
        }
    }

    for (const [name, expected] of Object.entries(semantic.topLevelPermissions ?? {})) {
        if (workflow?.permissions?.[name] !== expected) {
            failures.push(
                `${label}: ${path} top-level permissions.${name} must be ${JSON.stringify(expected)}`,
            );
        }
    }

    const runValues = [];
    const collectRunValues = (value) => {
        if (Array.isArray(value)) {
            for (const item of value) collectRunValues(item);
            return;
        }
        if (!value || typeof value !== "object") return;
        if (typeof value.run === "string") runValues.push(value.run);
        for (const item of Object.values(value)) collectRunValues(item);
    };
    collectRunValues(workflow);

    for (const sourcePattern of semantic.forbiddenRunPatterns ?? []) {
        let pattern;
        try {
            pattern = new RegExp(sourcePattern);
        } catch (error) {
            failures.push(
                `${label}: ${path} has invalid forbiddenRunPatterns regex ${sourcePattern}: ${error.message}`,
            );
            continue;
        }
        if (runValues.some((run) => pattern.test(run))) {
            failures.push(`${label}: ${path} step run must not match ${JSON.stringify(sourcePattern)}`);
        }
    }

    for (const sourcePattern of semantic.forbiddenWorkflowPatterns ?? []) {
        if (text.includes(sourcePattern)) {
            failures.push(`${label}: ${path} must not contain ${JSON.stringify(sourcePattern)}`);
        }
    }

    // `mustContain` only proves every marker is present SOMEWHERE in the file;
    // it does not prove they run in the order CI depends on. A job whose steps
    // got reordered (e.g. a drift check moved ahead of the codegen step it
    // depends on) still satisfies every `mustContain` entry and stayed green
    // until this ordering was added as its own assertion (T9).
    for (const entry of semantic.jobStepOrder ?? []) {
        const { job: jobName, require: requiredOrder = [] } = entry;
        const job = workflow?.jobs?.[jobName];
        if (!job) {
            failures.push(`${label}: ${path} jobStepOrder names job "${jobName}" which does not exist`);
            continue;
        }
        const steps = Array.isArray(job.steps) ? job.steps : [];
        const runText = steps
            .map((step) => (typeof step?.run === "string" ? step.run : ""))
            .join("\n\x00STEP\x00\n");
        let cursor = -1;
        let lastMarker = null;
        for (const marker of requiredOrder) {
            const index = runText.indexOf(marker, cursor + 1);
            if (index === -1) {
                failures.push(
                    lastMarker === null
                        ? `${label}: ${path} job "${jobName}" must run ${JSON.stringify(marker)}`
                        : `${label}: ${path} job "${jobName}" must run ${JSON.stringify(marker)} after ${JSON.stringify(lastMarker)}`,
                );
                break;
            }
            cursor = index;
            lastMarker = marker;
        }
    }
};

requireMarkers("policyDocument", contract.policyDocument);
for (const entry of contract.workflows) {
    requireMarkers("workflows", entry);
    requireWorkflowSemantics("workflows", entry);
}
for (const entry of contract.supportingDocs) requireMarkers("supportingDocs", entry);

// R3b: the pack-snapshot leg runs on exactly one Node version out of the CI
// matrix, and that CHOICE is the load-bearing part -- a pack-snapshot proof
// gathered at any Node version other than what release actually publishes
// with says nothing about what gets published. mustContain only proves the
// leg exists; it does not prove its chosen version still matches release, so
// a version bump to one side without the other used to drift silently.
if (contract.crossWorkflowNodeVersion) {
    const {
        sourceWorkflow,
        sourceJob,
        sourceStepRunContains,
        targetWorkflows = [],
        reason,
    } = contract.crossWorkflowNodeVersion;
    if (!reason) failures.push("crossWorkflowNodeVersion: must record why (reason)");
    if (!existsSync(sourceWorkflow)) {
        failures.push(`crossWorkflowNodeVersion: source workflow ${sourceWorkflow} does not exist`);
    } else {
        let sourceYaml;
        try {
            sourceYaml = YAML.parse(readFileSync(sourceWorkflow, "utf8"));
        } catch (error) {
            failures.push(`crossWorkflowNodeVersion: ${sourceWorkflow} is invalid YAML: ${error.message}`);
        }
        const sourceSteps = sourceYaml?.jobs?.[sourceJob]?.steps ?? [];
        const sourceStep = sourceSteps.find(
            (step) => typeof step?.run === "string" && step.run.includes(sourceStepRunContains),
        );
        if (!sourceStep) {
            failures.push(
                `crossWorkflowNodeVersion: ${sourceWorkflow} job ${JSON.stringify(sourceJob)} has no step ` +
                    `running ${JSON.stringify(sourceStepRunContains)}`,
            );
        } else {
            const condition = typeof sourceStep.if === "string" ? sourceStep.if : "";
            const match = condition.match(/matrix\.node\s*==\s*'([^']+)'/);
            if (!match) {
                failures.push(
                    `crossWorkflowNodeVersion: ${sourceWorkflow} step running ${JSON.stringify(sourceStepRunContains)} ` +
                        "has no matrix.node == '<version>' condition to bind",
                );
            } else {
                const sourceVersion = match[1];
                for (const targetPath of targetWorkflows) {
                    if (!existsSync(targetPath)) {
                        failures.push(`crossWorkflowNodeVersion: target workflow ${targetPath} does not exist`);
                        continue;
                    }
                    let targetYaml;
                    try {
                        targetYaml = YAML.parse(readFileSync(targetPath, "utf8"));
                    } catch (error) {
                        failures.push(`crossWorkflowNodeVersion: ${targetPath} is invalid YAML: ${error.message}`);
                        continue;
                    }
                    const nodeVersions = [];
                    const collectNodeVersions = (value) => {
                        if (Array.isArray(value)) {
                            for (const item of value) collectNodeVersions(item);
                            return;
                        }
                        if (!value || typeof value !== "object") return;
                        if (typeof value["node-version"] === "string") nodeVersions.push(value["node-version"]);
                        for (const item of Object.values(value)) collectNodeVersions(item);
                    };
                    collectNodeVersions(targetYaml);
                    if (nodeVersions.length === 0) {
                        failures.push(`crossWorkflowNodeVersion: ${targetPath} has no node-version to compare`);
                    } else if (!nodeVersions.every((version) => version === sourceVersion)) {
                        failures.push(
                            `crossWorkflowNodeVersion: ${targetPath} node-version(s) ${JSON.stringify(nodeVersions)} ` +
                                `must all equal ${JSON.stringify(sourceVersion)} (the packsnapshot leg's Node, from ${sourceWorkflow})`,
                        );
                    }
                }
            }
        }
    }
}

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
if (!isWiringTargetReachable(makefile, "contract-gates", wiring)) {
    failures.push(`contract-gates cannot reach ${wiring.makeTarget}`);
}
for (const aggregate of ["perfect-fast", "perfect-full"]) {
    if (!isWiringTargetReachable(makefile, aggregate, wiring)) {
        failures.push(`${aggregate} cannot reach ${wiring.makeTarget}`);
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
