#!/usr/bin/env node
// check-docs-drift: scans hand-written SDK docs/examples and changelogs
// (wrapper/CHANGELOG.md, cli/CHANGELOG.md, mcp/CHANGELOG.md) for the
// legacy-sdk-package-name, old-mcp-tool-count drift, and placeholder-marker
// regressions. Reads docs/migration-guide.md and wrapper/tsconfig.json as
// allowlist anchors.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contract = JSON.parse(await readRel("docs/docs-drift-contract.json"));
const failures = [];
const shapeFailures = [];

async function readRel(relPath) {
    return readFile(path.join(root, relPath), "utf8");
}

function failShape(message) {
    shapeFailures.push(`contract: ${message}`);
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function assertStringArray(value, field, { allowEmpty = false } = {}) {
    if (!Array.isArray(value)) {
        failShape(`${field} must be an array`);
        return [];
    }

    if (!allowEmpty && value.length === 0) {
        failShape(`${field} must not be empty`);
    }

    const seen = new Set();
    for (const [index, entry] of value.entries()) {
        if (!isNonEmptyString(entry)) {
            failShape(`${field}[${index}] must be a non-empty string`);
            continue;
        }

        if (seen.has(entry)) {
            failShape(`${field} contains duplicate entry ${entry}`);
            continue;
        }

        seen.add(entry);
    }

    return value;
}

function assertSafeRelativePath(value, field) {
    if (!isNonEmptyString(value)) {
        failShape(`${field} must be a non-empty string path`);
        return;
    }

    if (path.isAbsolute(value)) {
        failShape(`${field} must be repo-relative, got ${value}`);
    }

    if (value.includes("\\") || value.includes("//")) {
        failShape(`${field} must use normalized forward-slash paths, got ${value}`);
    }

    if (value.split("/").includes("..")) {
        failShape(`${field} must not escape the repository, got ${value}`);
    }

    if (!/^[A-Za-z0-9._/-]+$/.test(value)) {
        failShape(`${field} contains unsupported path characters, got ${value}`);
    }
}

function assertContractShape(value) {
    if (!isPlainObject(value)) {
        failShape("root must be a JSON object");
        return;
    }

    if (value.schemaVersion !== 1) {
        failShape(`schemaVersion must be 1, got ${value.schemaVersion ?? "(missing)"}`);
    }

    if (!isNonEmptyString(value.purpose)) {
        failShape("purpose must be a non-empty string");
    }

    const invariants = assertStringArray(value.contractInvariants, "contractInvariants");
    for (const requiredInvariant of [
        "safe-docs-drift-paths",
        "typed-scan-roots",
        "typed-excluded-dirs",
        "typed-scan-rules",
        "declared-allowlists",
        "wrapper-scan-boundary",
        "makefile-audit-wiring",
    ]) {
        if (!invariants.includes(requiredInvariant)) {
            failShape(`contractInvariants must include ${requiredInvariant}`);
        }
    }

    for (const [index, relPath] of assertStringArray(value.scanRoots, "scanRoots").entries()) {
        assertSafeRelativePath(relPath, `scanRoots[${index}]`);
    }

    for (const [index, relPath] of assertStringArray(value.excludedDirs, "excludedDirs").entries()) {
        assertSafeRelativePath(relPath, `excludedDirs[${index}]`);
    }

    for (const [index, extension] of assertStringArray(value.allowedExtensions, "allowedExtensions").entries()) {
        if (!/^\.[A-Za-z0-9]+$/.test(extension)) {
            failShape(`allowedExtensions[${index}] must look like .ext, got ${extension}`);
        }
    }

    if (!isNonEmptyString(value.wrapperScanAllowPattern)) {
        failShape("wrapperScanAllowPattern must be a non-empty regex string");
    } else {
        try {
            new RegExp(value.wrapperScanAllowPattern);
        } catch (error) {
            failShape(`wrapperScanAllowPattern must compile as RegExp: ${error.message}`);
        }
    }

    const requiredRuleIds = assertStringArray(value.requiredRuleIds, "requiredRuleIds");
    if (!Array.isArray(value.rules) || value.rules.length === 0) {
        failShape("rules must be a non-empty array");
    }

    if (!Number.isInteger(value.expectedRuleCount) || value.expectedRuleCount <= 0) {
        failShape("expectedRuleCount must be a positive integer");
    } else if (Array.isArray(value.rules) && value.expectedRuleCount !== value.rules.length) {
        failShape(`expectedRuleCount ${value.expectedRuleCount} does not match rules.length ${value.rules.length}`);
    }

    const ruleIds = new Set();
    for (const [index, rule] of (Array.isArray(value.rules) ? value.rules : []).entries()) {
        const prefix = `rules[${index}]`;
        if (!isPlainObject(rule)) {
            failShape(`${prefix} must be an object`);
            continue;
        }

        if (!isNonEmptyString(rule.id)) {
            failShape(`${prefix}.id must be a non-empty string`);
        } else {
            if (ruleIds.has(rule.id)) {
                failShape(`${prefix}.id duplicates ${rule.id}`);
            }
            ruleIds.add(rule.id);
        }

        if (!isNonEmptyString(rule.pattern)) {
            failShape(`${prefix}.pattern must be a non-empty regex string`);
        } else {
            try {
                new RegExp(rule.pattern, rule.flags ?? "g");
            } catch (error) {
                failShape(`${prefix}.pattern must compile as RegExp: ${error.message}`);
            }
        }

        if ("flags" in rule && !/^[dgimsuvy]*$/.test(rule.flags)) {
            failShape(`${prefix}.flags contains unsupported RegExp flags`);
        }

        for (const [allowedIndex, relPath] of assertStringArray(rule.allowedPaths ?? [], `${prefix}.allowedPaths`, {
            allowEmpty: true,
        }).entries()) {
            assertSafeRelativePath(relPath, `${prefix}.allowedPaths[${allowedIndex}]`);
        }

        if ("allowedPathPattern" in rule) {
            if (!isNonEmptyString(rule.allowedPathPattern)) {
                failShape(`${prefix}.allowedPathPattern must be a non-empty regex string when present`);
            } else {
                try {
                    new RegExp(rule.allowedPathPattern);
                } catch (error) {
                    failShape(`${prefix}.allowedPathPattern must compile as RegExp: ${error.message}`);
                }
            }
        }
    }

    for (const requiredRuleId of requiredRuleIds) {
        if (!ruleIds.has(requiredRuleId)) {
            failShape(`rules must include requiredRuleId ${requiredRuleId}`);
        }
    }

    if (!isPlainObject(value.wiring)) {
        failShape("wiring must be an object");
    } else {
        if (value.wiring.makeTarget !== "docs-drift") {
            failShape(`wiring.makeTarget must be docs-drift, got ${value.wiring.makeTarget ?? "(missing)"}`);
        }
        if (value.wiring.enterpriseAuditId !== "docs-drift-checker") {
            failShape(`wiring.enterpriseAuditId must be docs-drift-checker, got ${value.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        assertSafeRelativePath(value.wiring.checker, "wiring.checker");
        if (value.wiring.checker !== "scripts/check-docs-drift.mjs") {
            failShape(`wiring.checker must be scripts/check-docs-drift.mjs, got ${value.wiring.checker ?? "(missing)"}`);
        }
    }
}

assertContractShape(contract);

if (shapeFailures.length > 0) {
    console.error("Documentation drift contract shape failed:");
    for (const failure of shapeFailures) console.error(`- ${failure}`);
    process.exit(1);
}

const roots = contract.scanRoots;
const excludedDirs = new Set(contract.excludedDirs);
const allowedExtensions = new Set(contract.allowedExtensions);
const wrapperScanAllowPattern = new RegExp(contract.wrapperScanAllowPattern);
const rules = contract.rules.map((rule) => ({
    id: rule.id,
    pattern: new RegExp(rule.pattern, rule.flags ?? "g"),
    allowedPaths: new Set(rule.allowedPaths ?? []),
    allowedPathPattern: rule.allowedPathPattern ? new RegExp(rule.allowedPathPattern) : undefined,
}));

const makefile = await readRel("Makefile");
const docsIndex = await readRel("docs/README.md");
const qualityGates = await readRel("docs/quality-gates.md");
const enterpriseAudit = await readRel("docs/enterprise-hardening-audit.json");

for (const rel of await collectFiles()) {
    const text = await readFile(path.join(root, rel), "utf8");
    for (const rule of rules) {
        if (rule.allowedPaths?.has(rel)) continue;
        if (rule.allowedPathPattern?.test(rel)) continue;
        const matches = [...text.matchAll(rule.pattern)];
        for (const match of matches) {
            const line = text.slice(0, match.index).split("\n").length;
            failures.push(`${rel}:${line}: ${rule.id}: ${match[0]}`);
        }
    }
}

if (!makefile.includes(`${contract.wiring.makeTarget}:`)) {
    failures.push(`Makefile missing target: ${contract.wiring.makeTarget}`);
}
if (!makefile.includes("perfect-fast:") || !makefile.includes("docs-drift")) {
    failures.push("Makefile perfect-fast/perfect-full wiring missing docs-drift");
}
if (!qualityGates.includes("allowlisted docs drift is checked")) {
    failures.push("docs/quality-gates.md missing docs drift quality-gate wording");
}
if (!docsIndex.includes("./docs-drift-contract.json")) {
    failures.push("docs/README.md missing docs drift contract link");
}
if (!enterpriseAudit.includes('"id": "docs-drift-checker"')) {
    failures.push("docs/enterprise-hardening-audit.json missing docs-drift-checker requirement");
}

if (failures.length > 0) {
    console.error("Documentation drift check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("Documentation drift check passed.");

async function collectFiles() {
    const files = new Set();
    for (const rel of roots) {
        const abs = path.join(root, rel);
        try {
            const info = await stat(abs);
            if (info.isDirectory()) {
                for (const file of await walk(rel)) files.add(file);
            } else if (shouldScan(rel)) {
                files.add(rel);
            }
        } catch {
            continue;
        }
    }
    return [...files].sort();
}

async function walk(relDir) {
    const out = [];
    if (isExcluded(relDir)) return out;
    for (const entry of await readdir(path.join(root, relDir), { withFileTypes: true })) {
        const rel = path.join(relDir, entry.name);
        if (entry.isDirectory()) {
            out.push(...(await walk(rel)));
        } else if (entry.isFile() && shouldScan(rel)) {
            out.push(rel);
        }
    }
    return out;
}

function shouldScan(rel) {
    if (isExcluded(rel)) return false;
    if (!allowedExtensions.has(path.extname(rel))) return false;
    if (rel.startsWith("wrapper/") && rel.includes("/scripts/")) return false;
    if (rel.startsWith("wrapper/") && !wrapperScanAllowPattern.test(rel)) {
        return false;
    }
    return true;
}

function isExcluded(rel) {
    return [...excludedDirs].some((dir) => rel === dir || rel.startsWith(`${dir}/`));
}
