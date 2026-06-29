#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(fs.readFileSync(path.join(root, "docs", "generated-edit-contract.json"), "utf8"));
const shapeFailures = [];

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


    const guardedPrefixes = assertStringArray(value.guardedPrefixes, "guardedPrefixes");
    for (const [index, guardedPrefix] of guardedPrefixes.entries()) {
        assertSafeRelativePath(guardedPrefix, `guardedPrefixes[${index}]`);
        if (!guardedPrefix.endsWith("/")) {
            failShape(`guardedPrefixes[${index}] must be a directory prefix ending in /`);
        }
    }

    for (const requiredPrefix of ["spec/corrected/", "output/ts-sdk/", "wrapper/src/"]) {
        if (!guardedPrefixes.includes(requiredPrefix)) {
            failShape(`guardedPrefixes must include ${requiredPrefix}`);
        }
    }

    if (value.bypassEnv !== "CLOCKIFY_ALLOW_GENERATED_DIFF") {
        failShape(`bypassEnv must be CLOCKIFY_ALLOW_GENERATED_DIFF, got ${value.bypassEnv ?? "(missing)"}`);
    }

    if (!isNonEmptyString(value.regenerationGuidance)) {
        failShape("regenerationGuidance must be a non-empty string");
    }

    if (!isPlainObject(value.wiring)) {
        failShape("wiring must be an object");
    } else {
        if (value.wiring.makeTarget !== "generated-edit-check") {
            failShape(`wiring.makeTarget must be generated-edit-check, got ${value.wiring.makeTarget ?? "(missing)"}`);
        }
        if (value.wiring.enterpriseAuditId !== "generated-edit-guard") {
            failShape(`wiring.enterpriseAuditId must be generated-edit-guard, got ${value.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        assertSafeRelativePath(value.wiring.checker, "wiring.checker");
        if (value.wiring.checker !== "scripts/check-no-generated-edits.mjs") {
            failShape(`wiring.checker must be scripts/check-no-generated-edits.mjs, got ${value.wiring.checker ?? "(missing)"}`);
        }
    }
}

assertContractShape(contract);

if (shapeFailures.length > 0) {
    console.error("generated edit contract shape failed");
    for (const failure of shapeFailures) console.error(failure);
    process.exit(1);
}

const guardedPrefixes = contract.guardedPrefixes;

if (process.env[contract.bypassEnv] === "1") {
    console.log(`generated edit guard bypassed by ${contract.bypassEnv}=1`);
    process.exit(0);
}

function gitNames(args) {
    const result = spawnSync("git", args, { encoding: "utf8", cwd: root });
    if (result.error || result.status !== 0) {
        console.error(`generated edit guard: \`git ${args.join(" ")}\` failed (status ${result.status ?? "n/a"})`);
        if (result.stderr) console.error(String(result.stderr).trim());
        process.exit(1);
    }
    return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

function isIgnoredPrefix(prefix) {
    const result = spawnSync("git", ["check-ignore", "-q", prefix.replace(/\/+$/, "")], { cwd: root });
    return result.status === 0;
}

const WRAPPER_SYNC_EXCLUDES = new Set([
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "tsconfig.json",
    "codegen-receipt.json",
    ".npmignore",
    ".gitignore",
]);

function isSyncExcluded(relativeFile) {
    const base = relativeFile.split("/").pop();
    return WRAPPER_SYNC_EXCLUDES.has(base) || /^tsconfig\..*\.json$/.test(base);
}

function listTreeFiles(dir) {
    const files = [];
    const walk = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory()) walk(absolute);
            else if (entry.isFile()) files.push(path.relative(dir, absolute).split(path.sep).join("/"));
        }
    };
    walk(dir);
    return files;
}

function compareSyncTree(sourceDir, syncedDir) {
    const drift = [];
    const expected = listTreeFiles(sourceDir).filter((file) => !isSyncExcluded(file)).sort();
    const actual = new Set(listTreeFiles(syncedDir));
    const expectedSet = new Set(expected);
    for (const file of expected) {
        if (!actual.has(file)) {
            drift.push(`missing ${file}`);
            continue;
        }
        const sourceText = fs.readFileSync(path.join(sourceDir, file), "utf8");
        const syncedText = fs.readFileSync(path.join(syncedDir, file), "utf8");
        if (sourceText !== syncedText) drift.push(`changed ${file}`);
    }
    for (const file of actual) {
        if (!expectedSet.has(file)) drift.push(`extra ${file}`);
    }
    return drift;
}

const trackedPrefixes = guardedPrefixes.filter((prefix) => !isIgnoredPrefix(prefix));
const ignoredPrefixes = new Set(guardedPrefixes.filter((prefix) => isIgnoredPrefix(prefix)));

const changed = new Set([
    ...gitNames(["diff", "--name-only"]),
    ...gitNames(["diff", "--name-only", "--cached"]),
]);

const blocked = [...changed].filter((file) => trackedPrefixes.some((prefix) => file.startsWith(prefix)));

const tamperEdits = [];

// output/ts-sdk/ is gitignored, so `git diff` can never list it. Detect a
// hand-edit by regenerating into a temp dir and diffing against the working
// tree (same machinery as `make sdk-codegen-drift`). Skip-if-absent so a fresh
// clone before `make sdk-codegen` still passes.
if (ignoredPrefixes.has("output/ts-sdk/") && fs.existsSync(path.join(root, "output", "ts-sdk"))) {
    const check = spawnSync("node", ["scripts/generate-sdk-from-openapi.mjs", "--check"], {
        cwd: root,
        encoding: "utf8",
    });
    if (check.status !== 0) {
        tamperEdits.push("output/ts-sdk/ diverges from a fresh codegen (hand-edit or stale snapshot):");
        const detail = `${check.stdout ?? ""}${check.stderr ?? ""}`.trim();
        if (detail) tamperEdits.push(detail);
    }
}

// wrapper/src/ is gitignored too. It must be a verbatim copy of output/ts-sdk/
// (minus package metadata). Detect a hand-edit by comparing the two trees.
if (ignoredPrefixes.has("wrapper/src/")
    && fs.existsSync(path.join(root, "wrapper", "src"))
    && fs.existsSync(path.join(root, "output", "ts-sdk"))) {
    const drift = compareSyncTree(path.join(root, "output", "ts-sdk"), path.join(root, "wrapper", "src"));
    if (drift.length > 0) {
        tamperEdits.push("wrapper/src/ diverges from output/ts-sdk/ (hand-edit — re-run `cd wrapper && npm run sync`):");
        for (const entry of drift.slice(0, 50)) tamperEdits.push(`  - ${entry}`);
    }
}

if (blocked.length > 0 || tamperEdits.length > 0) {
    console.error("Generated or snapshot surfaces changed:");
    for (const file of blocked.sort()) console.error(`  - ${file}`);
    for (const line of tamperEdits) console.error(line);
    console.error("");
    console.error(contract.regenerationGuidance);
    console.error(`If this is a deliberate generated-chain diff, rerun via make perfect-full and set ${contract.bypassEnv}=1 only for this guard.`);
    process.exit(1);
}

console.log("no guarded generated/snapshot edits detected");
