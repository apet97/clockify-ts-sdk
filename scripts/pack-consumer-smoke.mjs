#!/usr/bin/env node
// pack-consumer-smoke: runs npm pack for clockify-sdk-ts-115, @apet97/clockify-cli-115, and @apet97/clockify-mcp-115,
// then installs each tarball into a temp consumer project to verify the packed artifacts work end-to-end.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(root, "docs", "pack-consumer-smoke-contract.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const packed = [];
const tempRoots = [];
const contractFailures = [];

function failContract(id, message) {
    contractFailures.push(`${id}: ${message}`);
}

function safeRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
        failContract(label, "must be a non-empty string");
        return null;
    }
    const normalized = path.normalize(relativePath);
    if (path.isAbsolute(relativePath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        failContract(label, "must be a repo-relative path without parent traversal");
        return null;
    }
    return normalized;
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        failContract(label, "must be a non-empty string");
    }
}

function assertStringArray(label, value, { allowEmpty = true } = {}) {
    if (!Array.isArray(value)) {
        failContract(label, "must be an array");
        return [];
    }
    if (!allowEmpty && value.length === 0) {
        failContract(label, "must be a non-empty array");
    }
    for (const entry of value) {
        if (typeof entry !== "string" || entry.trim().length === 0) {
            failContract(label, "contains non-string or empty entry");
        }
    }
    return value.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) failContract(label, `duplicate ${value}`);
        seen.add(value);
    }
}

function assertObject(label, value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        failContract(label, "must be an object");
        return false;
    }
    return true;
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) failContract("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);

    if (!Array.isArray(contract.packages) || contract.packages.length === 0) {
        failContract("packages", "must be a non-empty array");
    }
    const packageIds = (contract.packages ?? []).map((pkg) => pkg?.id).filter((id) => typeof id === "string");
    assertUnique("packages.id", packageIds);
    for (const requiredPackageId of ["wrapper", "cli", "mcp"]) {
        if (!packageIds.includes(requiredPackageId)) failContract("packages", `missing ${requiredPackageId}`);
    }

    for (const [index, pkg] of (contract.packages ?? []).entries()) {
        const label = pkg?.id ?? `packages[${index}]`;
        if (!assertObject(label, pkg)) continue;
        assertNonEmptyString(`${label}.id`, pkg.id);
        assertNonEmptyString(`${label}.npmName`, pkg.npmName);
        const packageDir = safeRelativePath(`${label}.packageDir`, pkg.packageDir);
        if (packageDir != null && !fs.existsSync(path.join(root, packageDir, "package.json"))) {
            failContract(`${label}.packageDir`, "must contain package.json");
        }
    }

    if (!Array.isArray(contract.consumers) || contract.consumers.length === 0) {
        failContract("consumers", "must be a non-empty array");
    }
    assertUnique(
        "consumers.id",
        (contract.consumers ?? []).map((consumer) => consumer?.id).filter((id) => typeof id === "string"),
    );
    for (const [index, consumer] of (contract.consumers ?? []).entries()) {
        const label = consumer?.id ?? `consumers[${index}]`;
        if (!assertObject(label, consumer)) continue;
        assertNonEmptyString(`${label}.id`, consumer.id);
        assertNonEmptyString(`${label}.tempPrefix`, consumer.tempPrefix);
        if (typeof consumer.tempPrefix === "string" && !consumer.tempPrefix.startsWith("clockify-")) {
            failContract(`${label}.tempPrefix`, "must use a clockify- prefix");
        }
        const installPackageIds = assertStringArray(`${label}.installPackageIds`, consumer.installPackageIds, {
            allowEmpty: false,
        });
        assertUnique(`${label}.installPackageIds`, installPackageIds);
        for (const packageId of installPackageIds) {
            if (!packageIds.includes(packageId)) failContract(`${label}.installPackageIds`, `unknown package ${packageId}`);
        }
    }

    const markers = assertStringArray("requiredScriptMarkers", contract.requiredScriptMarkers, {
        allowEmpty: false,
    });
    assertUnique("requiredScriptMarkers", markers);
    const scriptText = fs.readFileSync(fileURLToPath(import.meta.url), "utf8");
    for (const marker of markers) {
        if (!scriptText.includes(marker)) failContract("requiredScriptMarkers", `script missing marker ${marker}`);
    }

    assertNonEmptyString("keepTempEnv", contract.keepTempEnv);
    if (contract.keepTempEnv !== "KEEP_CLOCKIFY_PACK_SMOKE_TEMP") {
        failContract("keepTempEnv", "must remain KEEP_CLOCKIFY_PACK_SMOKE_TEMP");
    }

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        assertNonEmptyString("wiring.checker", contract.wiring.checker);
        assertNonEmptyString("wiring.enterpriseAuditId", contract.wiring.enterpriseAuditId);
        if (contract.wiring.makeTarget !== "pack-smoke") {
            failContract("wiring.makeTarget", "must be pack-smoke");
        }
        if (contract.wiring.checker !== "scripts/pack-consumer-smoke.mjs") {
            failContract("wiring.checker", "must be scripts/pack-consumer-smoke.mjs");
        }
    }
}

function failIfInvalidContract() {
    if (contractFailures.length === 0) return;
    console.error("pack consumer smoke contract shape failed");
    for (const failure of contractFailures) console.error(`- ${failure}`);
    process.exit(1);
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: options.cwd ?? root,
        stdio: options.capture ? "pipe" : "inherit",
        encoding: "utf8",
        env: { ...process.env, ...(options.env ?? {}) },
    });
    if (result.status !== 0) {
        if (options.capture && result.stderr) process.stderr.write(result.stderr);
        throw new Error(`${command} ${args.join(" ")} failed`);
    }
    return result.stdout ?? "";
}

function packageContract(packageId) {
    const found = contract.packages.find((pkg) => pkg.id === packageId);
    if (found == null) throw new Error(`missing package contract ${packageId}`);
    return found;
}

function pack(packageDir) {
    const cwd = path.join(root, packageDir);
    const output = run("npm", ["pack", "--silent", "--json"], { cwd, capture: true });
    const parsed = JSON.parse(output.trim());
    const file = path.resolve(cwd, parsed[0].filename);
    packed.push(file);
    return file;
}

function consumerContract(consumerId) {
    const found = contract.consumers.find((consumer) => consumer.id === consumerId);
    if (found == null) throw new Error(`missing consumer contract ${consumerId}`);
    return found;
}

function tempProject(name) {
    const consumer = consumerContract(name);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), consumer.tempPrefix));
    tempRoots.push(dir);
    run("npm", ["init", "-y"], { cwd: dir, capture: true });
    return dir;
}

function packageFilesForConsumer(consumerId, tgzByPackageId) {
    return consumerContract(consumerId).installPackageIds.map((packageId) => tgzByPackageId.get(packageId));
}

function install(cwd, packages) {
    run("npm", ["install", "--silent", ...packages], { cwd });
}

function writeAndRun(cwd, fileName, content) {
    const file = path.join(cwd, fileName);
    fs.writeFileSync(file, content);
    run("node", [file], { cwd });
}

validateContractShape();
failIfInvalidContract();

try {
    const tgzByPackageId = new Map();
    for (const packageId of ["wrapper", "cli", "mcp"]) {
        tgzByPackageId.set(packageId, pack(packageContract(packageId).packageDir));
    }

    const sdkConsumer = tempProject("sdk");
    install(sdkConsumer, packageFilesForConsumer("sdk", tgzByPackageId));
    writeAndRun(sdkConsumer, "sdk-esm.mjs", `
import assert from "node:assert/strict";
import * as sdk from "clockify-sdk-ts-115";
import * as iter from "clockify-sdk-ts-115/iter";
import * as webhooks from "clockify-sdk-ts-115/webhooks";
assert.equal(typeof sdk.createClockifyClient, "function");
assert.equal(typeof iter.iterAll, "function");
assert.equal(typeof webhooks.verifyClockifyWebhook, "function");
`);
    writeAndRun(sdkConsumer, "sdk-cjs.cjs", `
const assert = require("node:assert/strict");
const sdk = require("clockify-sdk-ts-115");
const errors = require("clockify-sdk-ts-115/errors");
assert.equal(typeof sdk.createClockifyClient, "function");
assert.equal(typeof errors.promoteApiError, "function");
`);

    const cliConsumer = tempProject("cli");
    install(cliConsumer, packageFilesForConsumer("cli", tgzByPackageId));
    run("node", [path.join(cliConsumer, "node_modules", "@apet97", "clockify-cli-115", "dist", "index.js"), "--version"], { cwd: cliConsumer });

    const mcpConsumer = tempProject("mcp");
    install(mcpConsumer, packageFilesForConsumer("mcp", tgzByPackageId));
    writeAndRun(mcpConsumer, "mcp-imports.mjs", `
import assert from "node:assert/strict";
const server = await import("@apet97/clockify-mcp-115/server");
const client = await import("@apet97/clockify-mcp-115/client");
assert.equal(typeof server.buildServer, "function");
assert.equal(typeof client.loadContext, "function");
`);

    console.log("packed consumer smoke passed for SDK, CLI, and MCP");
} finally {
    for (const file of packed) {
        try { fs.unlinkSync(file); } catch {}
    }
    if (process.env[contract.keepTempEnv] !== "1") {
        for (const dir of tempRoots) {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        }
    }
}
