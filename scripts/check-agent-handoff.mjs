#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    TASK1_FINAL_RECEIPT_PATH,
    validatePlanLifecycle,
} from "./lib/plan-lifecycle-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF_CLOSEOUT_SNAPSHOT_PATHS = [
    "docs/plan-lifecycle-contract.json",
    "docs/roadmap-1.0-status.json",
    "docs/unique-claim-inventory.json",
];
const failures = [];
const contract = readJson("docs/agent-handoff-contract.json", "contract") ?? {};
const lifecycleContract = readJson("docs/plan-lifecycle-contract.json", "plan lifecycle contract") ?? {};

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function isObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim() === "") {
        fail(label, "must be a non-empty repo-relative path");
        return "";
    }

    const normalized = path.normalize(relativePath).replace(/\\/g, "/");
    const segments = relativePath.split(/[\\/]+/);
    if (path.isAbsolute(relativePath) || segments.includes("..") || normalized.startsWith("../")) {
        fail(label, `must not escape the repository root: ${relativePath}`);
        return "";
    }

    return normalized;
}

function readRelative(relativePath, label = relativePath) {
    const safePath = safeRelativePath(label, relativePath);
    if (safePath === "") return "";

    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(label, "missing");
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath, label = relativePath) {
    const text = readRelative(relativePath, label);
    if (text === "") return null;

    try {
        return JSON.parse(text);
    } catch (error) {
        fail(label, `invalid JSON: ${error.message}`);
        return null;
    }
}

function assertObject(label, value) {
    if (!isObject(value)) {
        fail(label, "must be an object");
        return false;
    }
    return true;
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim() === "") {
        fail(label, "must be a non-empty string");
        return false;
    }
    return true;
}

function assertUnique(label, values) {
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    if (duplicates.length > 0) fail(label, `must be unique; duplicates: ${[...new Set(duplicates)].join(", ")}`);
}

function assertStringArray(label, values, { required = true, min = 0 } = {}) {
    if (values == null && !required) return [];
    if (!Array.isArray(values)) {
        fail(label, "must be an array");
        return [];
    }
    if (values.length < min) fail(label, `must contain at least ${min} item(s)`);
    for (const [index, value] of values.entries()) {
        if (typeof value !== "string" || value.trim() === "") {
            fail(`${label}[${index}]`, "must be a non-empty string");
        }
    }
    assertUnique(label, values);
    return values.filter((value) => typeof value === "string" && value.trim() !== "");
}

function validateEntryShape(label, entry) {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    assertStringArray(`${label}.mustContain`, entry.mustContain, { min: 1 });
    assertStringArray(`${label}.forbiddenMarkers`, entry.forbiddenMarkers, { required: false });
}

function validateEntryCollection(label, entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        fail(label, "must be a non-empty array");
        return;
    }
    for (const [index, entry] of entries.entries()) {
        validateEntryShape(`${label}[${index}]`, entry);
    }
    assertUnique(
        `${label}.path`,
        entries.map((entry) => entry?.path).filter((entryPath) => typeof entryPath === "string"),
    );
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validateEntryShape("policyDocument", contract.policyDocument);
    validateEntryCollection("guidance", contract.guidance);
    validateEntryCollection("supportingChecks", contract.supportingChecks);
    for (const [index, relativePath] of assertStringArray("guidanceScanPaths", contract.guidanceScanPaths, {
        min: 1,
    }).entries()) {
        safeRelativePath(`guidanceScanPaths[${index}]`, relativePath);
    }
    assertStringArray("forbiddenGuidanceMarkers", contract.forbiddenGuidanceMarkers, { min: 1 });

    if (assertObject("wiring", contract.wiring)) {
        for (const key of ["makeTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
            assertNonEmptyString(`wiring.${key}`, contract.wiring[key]);
        }
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, { min: 1 });
    }
}

function checkEntry(entry) {
    const text = readRelative(entry.path);
    for (const marker of entry.mustContain ?? []) {
        if (!text.includes(marker)) fail(entry.path, `missing marker ${JSON.stringify(marker)}`);
    }
    for (const marker of entry.forbiddenMarkers ?? []) {
        if (text.includes(marker)) fail(entry.path, `contains forbidden marker ${marker}`);
    }
}

function gitOutput(args, label) {
    try {
        return execFileSync("git", args, {
            cwd: root,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        }).trim();
    } catch (error) {
        fail(label, `git evidence unavailable: ${error.stderr?.toString().trim() || error.message}`);
        return "";
    }
}

function commitEvidence(commit, label, taskId) {
    const parent = gitOutput(["rev-parse", `${commit}^`], `${label}.parent`);
    const changedPaths = gitOutput(
        ["diff-tree", "--no-commit-id", "--name-only", "-r", commit],
        `${label}.changedPaths`,
    )
        .split("\n")
        .filter(Boolean);
    const diff = gitOutput(
        ["show", "--format=", "--no-ext-diff", "--find-renames", commit, "--"],
        `${label}.diff`,
    );
    const fileSnapshots = {};
    for (const relativePath of SELF_CLOSEOUT_SNAPSHOT_PATHS) {
        if (!changedPaths.includes(relativePath)) continue;
        fileSnapshots[relativePath] = {
            before: gitOutput(
                ["show", `${parent}:${relativePath}`],
                `${label}.${relativePath}.before`,
            ),
            after: gitOutput(
                ["show", `${commit}:${relativePath}`],
                `${label}.${relativePath}.after`,
            ),
        };
    }
    if (taskId === 1) {
        fileSnapshots[TASK1_FINAL_RECEIPT_PATH] = {
            after: gitOutput(
                ["show", `${commit}:${TASK1_FINAL_RECEIPT_PATH}`],
                `${label}.${TASK1_FINAL_RECEIPT_PATH}.after`,
            ),
        };
    }
    return { parent, changedPaths, diff, fileSnapshots };
}

function currentCloseoutGitEvidence(closeout) {
    if (!isObject(closeout) || closeout.closeoutCommit !== "SELF") return undefined;
    const head = gitOutput(["rev-parse", "HEAD"], "currentEvidenceOnlyCloseout.SELF");
    const evidence = {
        head,
        ...commitEvidence(head, "currentEvidenceOnlyCloseout.SELF", closeout.taskId),
    };
    if (closeout.correction === true && /^[0-9a-f]{40}$/u.test(closeout.priorCloseoutCommit ?? "")) {
        const commit = gitOutput(
            ["rev-parse", `${closeout.priorCloseoutCommit}^{commit}`],
            "currentEvidenceOnlyCloseout.priorCloseoutCommit",
        );
        evidence.priorCloseout = {
            commit,
            ...commitEvidence(commit, "currentEvidenceOnlyCloseout.priorCloseoutCommit", closeout.taskId),
        };
    }
    return evidence;
}

function checkPlanLifecycle() {
    if (lifecycleContract.schemaVersion !== 1) fail("plan lifecycle schemaVersion", "must be 1");
    assertNonEmptyString("plan lifecycle purpose", lifecycleContract.purpose);
    validateEntryShape("plan lifecycle policyDocument", lifecycleContract.policyDocument);
    if (isObject(lifecycleContract.policyDocument)) checkEntry(lifecycleContract.policyDocument);

    const agentTasksContract = readJson("docs/agent-tasks-contract.json", "agent tasks contract") ?? {};
    const packetPath = lifecycleContract.taskPacket?.path;
    const packet = {
        path: packetPath,
        contractPackets: agentTasksContract.packets,
        indexText: readRelative(agentTasksContract.indexDocument?.path ?? "docs/agent-tasks/README.md"),
        requiredSections: agentTasksContract.requiredSections,
        text: readRelative(packetPath, "plan lifecycle task packet"),
    };

    const terminology = [];
    for (const binding of lifecycleContract.terminologyBindings ?? []) {
        const surfaces = [];
        for (const surface of binding.surfaces ?? []) {
            const text = readRelative(surface.path);
            if (!text.includes(surface.marker)) {
                fail(surface.path, `missing lifecycle terminology marker ${JSON.stringify(surface.marker)}`);
            }
            surfaces.push({ path: surface.path, state: surface.state });
        }
        terminology.push({ taskId: binding.taskId, surfaces });
    }

    const canonicalSourceContract = lifecycleContract.canonicalLifecycleSources ?? {};
    const canonicalSources = {
        roadmapText: readRelative(canonicalSourceContract.roadmapPath ?? "docs/roadmap-1.0.md"),
        roadmapStatus:
            readJson(
                canonicalSourceContract.roadmapStatusPath ?? "docs/roadmap-1.0-status.json",
                "plan lifecycle roadmap status",
            ) ?? {},
        statusBindings: canonicalSourceContract.statusBindings,
        uniqueClaimInventory:
            readJson(
                canonicalSourceContract.uniqueClaimInventoryPath ?? "docs/unique-claim-inventory.json",
                "plan lifecycle unique-claim inventory",
            ) ?? {},
        terminologyDocuments: (canonicalSourceContract.terminologyDocumentPaths ?? []).map(
            (relativePath) => ({ path: relativePath, text: readRelative(relativePath) }),
        ),
    };

    const closeout = lifecycleContract.currentEvidenceOnlyCloseout;

    const lifecycleFailures = validatePlanLifecycle({
        contract: lifecycleContract,
        tasks: lifecycleContract.tasks,
        files: (relativePath) => fs.existsSync(path.join(root, relativePath)),
        packet,
        guidance: (lifecycleContract.guidanceScanPaths ?? []).map((relativePath) => ({
            path: relativePath,
            text: readRelative(relativePath),
        })),
        terminology,
        canonicalSources,
        task1ApprovalRecord: lifecycleContract.currentTask1ApprovalRecord,
        closeout,
        gitEvidence: currentCloseoutGitEvidence(closeout),
    });
    for (const failure of lifecycleFailures) fail("plan lifecycle", failure);
}

validateContractShape();

if (failures.length > 0) {
    console.error("agent handoff contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

checkEntry(contract.policyDocument);
for (const entry of contract.guidance ?? []) checkEntry(entry);
for (const entry of contract.supportingChecks ?? []) checkEntry(entry);
checkPlanLifecycle();

const guidanceText = contract.guidanceScanPaths.map((file) => readRelative(file)).join("\n");

for (const marker of contract.forbiddenGuidanceMarkers ?? []) {
    if (guidanceText.includes(marker)) fail("guidance", `stale marker still present: ${marker}`);
}

const makefile = readRelative("Makefile");
if (!makefile.includes(`${contract.wiring.makeTarget}:`)) fail("Makefile", `missing ${contract.wiring.makeTarget} target`);
if (!makefile.includes(`node ${contract.wiring.checker}`)) fail("Makefile", `missing ${contract.wiring.checker} invocation`);
const aggregateLine = makefile.split("\n").find((line) => line.startsWith("contract-gates:")) ?? "";
if (!aggregateLine.includes(contract.wiring.makeTarget)) {
    fail("Makefile", `contract-gates missing ${contract.wiring.makeTarget}`);
}
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.includes(contract.wiring.makeTarget)) {
        fail("Makefile", `${aggregateTarget} must include ${contract.wiring.makeTarget}`);
    }
}

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of contract.wiring.docsIndex) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}

if (!readRelative("docs/quality-gates.md").includes(contract.wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${contract.wiring.qualityGate}`);
}
if (!readRelative("docs/contract-inventory.json").includes(`"id": "${contract.wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${contract.wiring.inventoryId}`);
}
if (!readRelative("docs/enterprise-hardening-audit.json").includes(`"id": "${contract.wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${contract.wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("agent handoff contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("agent handoff contract passed");
