#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = await readJson("docs/mcp-write-safety-contract.json", "contractPath");
const manifest = await readJson(
    process.env.MCP_WRITE_SAFETY_MANIFEST ??
        contract.wiring?.toolManifest ??
        "docs/mcp-tool-manifest.json",
    "toolManifest",
);

const risks = [
    "read",
    "routine_write",
    "business_write",
    "external_side_effect",
    "privileged",
    "destructive",
];
const guardedRisks = new Set([
    "business_write",
    "external_side_effect",
    "privileged",
    "destructive",
]);
const destructiveNamePattern = /_(delete|remove)(?![a-z])/;

function fail(label, message) {
    failures.push(`${label}: ${message}`);
}

function safeRelativePath(label, relPath) {
    if (typeof relPath !== "string" || relPath.trim().length === 0) {
        fail(label, "must be a non-empty string");
        return null;
    }
    const normalized = path.normalize(relPath);
    if (path.isAbsolute(relPath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        fail(label, "must be a repo-relative path without parent traversal");
        return null;
    }
    return normalized;
}

async function readRel(relPath, label = relPath) {
    const safePath = safeRelativePath(label, relPath);
    if (safePath == null) return "";
    try {
        return await readFile(path.join(root, safePath), "utf8");
    } catch {
        fail(safePath, "missing file");
        return "";
    }
}

async function readJson(relPath, label = relPath) {
    const text = await readRel(relPath, label);
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (error) {
        fail(label, `invalid JSON: ${error.message}`);
        return {};
    }
}

function sameRecord(left, right) {
    const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
    return [...keys].every((key) => left?.[key] === right?.[key]);
}

function makeTargetPrerequisites(makefile, target) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${target}:`)) ?? "";
    return targetLine
        .slice(targetLine.indexOf(":") + 1)
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

function validateContract() {
    if (contract.schemaVersion !== 2) fail("schemaVersion", "must be 2");
    if (typeof contract.purpose !== "string" || contract.purpose.trim().length === 0) {
        fail("purpose", "must be a non-empty string");
    }
    if (!Number.isInteger(contract.expected?.totalTools) || contract.expected.totalTools <= 0) {
        fail("expected.totalTools", "must be a positive integer");
    }
    if (!Number.isInteger(contract.expected?.guardedTools) || contract.expected.guardedTools <= 0) {
        fail("expected.guardedTools", "must be a positive integer");
    }
    if (
        !Number.isInteger(contract.expected?.destructiveTools) ||
        contract.expected.destructiveTools <= 0
    ) {
        fail("expected.destructiveTools", "must be a positive integer");
    }
    for (const risk of risks) {
        if (!Number.isInteger(contract.expected?.riskDistribution?.[risk])) {
            fail(`expected.riskDistribution.${risk}`, "must be an integer");
        }
    }
    for (const [key, value] of Object.entries({
        riskMetaKey: "io.github.apet97.clockify115/risk",
        confirmationMetaKey: "io.github.apet97.clockify115/confirmation",
        guardedConfirmation: "preview_token",
        unguardedConfirmation: "none",
    })) {
        if (contract.metadata?.[key] !== value) {
            fail(`metadata.${key}`, `must be ${JSON.stringify(value)}`);
        }
    }
    for (const [key, value] of Object.entries({
        makeTarget: "mcp-write-safety",
        aggregateExecutionTarget: "mcp-write-safety-run",
        checker: "scripts/check-mcp-write-safety.mjs",
        toolManifestDriftTarget: "mcp-tool-manifest-drift",
        toolManifestDriftExecutionTarget: "mcp-tool-manifest-drift-run",
        toolManifestWriterTarget: "mcp-tool-manifest",
    })) {
        if (contract.wiring?.[key] !== value) {
            fail(`wiring.${key}`, `must be ${JSON.stringify(value)}`);
        }
    }
    safeRelativePath("wiring.toolManifest", contract.wiring?.toolManifest);
    safeRelativePath("wiring.toolsDirectory", contract.wiring?.toolsDirectory);
    safeRelativePath("wiring.registrationModule", contract.wiring?.registrationModule);
}

async function validateMakeWiring() {
    const makefile = await readRel("Makefile");
    const dependencies = makeTargetPrerequisites(makefile, contract.wiring?.makeTarget);
    const requiredDependencies = [
        contract.wiring?.toolManifestDriftTarget,
        contract.wiring?.aggregateExecutionTarget,
    ];
    if (JSON.stringify(dependencies) !== JSON.stringify(requiredDependencies)) {
        fail(
            "Makefile",
            `${contract.wiring?.makeTarget} must depend only on exact target ${contract.wiring?.toolManifestDriftTarget}; found ${JSON.stringify(dependencies)}`,
        );
    }
    if (dependencies.includes(contract.wiring?.toolManifestWriterTarget)) {
        fail(
            "Makefile",
            `${contract.wiring?.makeTarget} must not depend on writer ${contract.wiring?.toolManifestWriterTarget}`,
        );
    }

    const aggregateDependencies = makeTargetPrerequisites(makefile, "contract-gates");
    if (!aggregateDependencies.includes(contract.wiring?.aggregateExecutionTarget)) {
        fail(
            "Makefile",
            `contract-gates missing exact prerequisite ${contract.wiring?.aggregateExecutionTarget}`,
        );
    }
    if (!makefile.includes(`node ${contract.wiring?.checker}`)) {
        fail("Makefile", `missing ${contract.wiring?.checker} invocation`);
    }
}

function validateManifest() {
    if (manifest.schemaVersion !== 2) fail("toolManifest.schemaVersion", "must be 2");
    if (!Array.isArray(manifest.tools)) {
        fail("toolManifest.tools", "must be an array");
        return;
    }
    const expected = contract.expected ?? {};
    if (manifest.tools.length !== expected.totalTools) {
        fail(
            "toolManifest.tools",
            `expected ${expected.totalTools}, found ${manifest.tools.length}`,
        );
    }

    const names = new Set();
    const distribution = Object.fromEntries(risks.map((risk) => [risk, 0]));
    let guardedCount = 0;
    let destructiveCount = 0;
    for (const tool of manifest.tools) {
        const name = typeof tool?.name === "string" ? tool.name : "(unnamed tool)";
        if (names.has(name)) fail(name, "duplicate tool registration");
        names.add(name);

        if (!risks.includes(tool?.risk)) {
            fail(name, `invalid or missing risk ${JSON.stringify(tool?.risk)}`);
        } else {
            distribution[tool.risk] += 1;
        }
        const guarded = guardedRisks.has(tool?.risk);
        const expectedConfirmation = guarded ? "preview_token" : "none";
        if (tool?.confirmation !== expectedConfirmation) {
            fail(
                name,
                `risk ${JSON.stringify(tool?.risk)} requires confirmation ${expectedConfirmation}, found ${JSON.stringify(tool?.confirmation)}`,
            );
        }
        if (guarded) guardedCount += 1;

        const annotations = tool?.annotations ?? {};
        const expectedAnnotations = {
            readOnlyHint: tool?.risk === "read",
            destructiveHint: tool?.risk === "destructive",
            openWorldHint: tool?.risk === "external_side_effect",
        };
        for (const [key, value] of Object.entries(expectedAnnotations)) {
            if (annotations[key] !== value) {
                fail(name, `${key} must be ${value} for risk ${JSON.stringify(tool?.risk)}`);
            }
        }
        if (typeof annotations.idempotentHint !== "boolean") {
            fail(name, "idempotentHint must be a boolean");
        }
        if (tool?.destructiveHint !== expectedAnnotations.destructiveHint) {
            fail(name, `destructiveHint must be ${expectedAnnotations.destructiveHint}`);
        }
        if (expectedAnnotations.destructiveHint) destructiveCount += 1;

        if (destructiveNamePattern.test(name) && tool?.risk !== "destructive") {
            fail(name, "must publish risk destructive and destructiveHint:true");
        }
    }

    if (!sameRecord(distribution, expected.riskDistribution)) {
        fail(
            "toolManifest.riskDistribution",
            `expected ${JSON.stringify(expected.riskDistribution)}, found ${JSON.stringify(distribution)}`,
        );
    }
    if (!sameRecord(manifest.summary?.riskDistribution, expected.riskDistribution)) {
        fail("toolManifest.summary.riskDistribution", "does not match the governed distribution");
    }
    if (guardedCount !== expected.guardedTools || manifest.summary?.guardedTools !== guardedCount) {
        fail(
            "toolManifest.summary.guardedTools",
            `expected ${expected.guardedTools}, found ${guardedCount}`,
        );
    }
    if (
        destructiveCount !== expected.destructiveTools ||
        manifest.summary?.destructiveTools !== destructiveCount
    ) {
        fail(
            "toolManifest.summary.destructiveTools",
            `expected ${expected.destructiveTools}, found ${destructiveCount}`,
        );
    }
}

async function validateRegistrationBoundary() {
    const toolsDirectory = safeRelativePath(
        "wiring.toolsDirectory",
        contract.wiring?.toolsDirectory,
    );
    if (toolsDirectory) {
        const files = await listTypeScriptFiles(path.join(root, toolsDirectory));
        for (const file of files) {
            const text = await readFile(file, "utf8");
            if (/\bserver\.registerTool\s*\(/.test(text)) {
                fail(
                    path.relative(root, file),
                    "tool modules must use defineTool/defineGuardedTool",
                );
            }
        }
    }
    const registrationModule = await readRel(contract.wiring?.registrationModule);
    for (const marker of [
        "export function defineTool",
        "export function defineGuardedTool",
        "server.registerTool(",
    ]) {
        if (!registrationModule.includes(marker)) {
            fail(contract.wiring?.registrationModule ?? "registrationModule", `missing ${marker}`);
        }
    }
}

async function listTypeScriptFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...(await listTypeScriptFiles(absolute)));
        else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(absolute);
    }
    return files.sort((a, b) => a.localeCompare(b));
}

validateContract();
validateManifest();
await validateMakeWiring();
await validateRegistrationBoundary();

if (failures.length > 0) {
    console.error("MCP write-safety contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(
    `MCP write-safety contract passed (${contract.expected.totalTools} tools, ` +
        `${contract.expected.guardedTools} guarded, ${contract.expected.destructiveTools} destructive).`,
);
