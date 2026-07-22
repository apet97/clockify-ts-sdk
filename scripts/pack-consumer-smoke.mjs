#!/usr/bin/env node
// pack-consumer-smoke: the shared exact-artifact engine. Runs npm pack for
// clockify-sdk-ts-115, @apet97/clockify-cli-115, and @apet97/clockify-mcp-115,
// prints each tarball's exact-artifact name and sha512 integrity digest, then
// installs the tarballs into temp consumer projects to verify the packed
// artifacts work end-to-end (ESM/CJS import smoke, CLI bin smoke, MCP import
// + stdio smoke). `--package=wrapper|cli|mcp` runs the single-package
// release-proof mode used by each package's prepublishOnly gate; with no
// argument it runs the full three-package proof (`make pack-smoke`).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(root, "docs", "pack-consumer-smoke-contract.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const packed = [];
const tempRoots = [];
const contractFailures = [];

// Single-package release-proof modes. Each mode packs the exact tarball set
// its consumer contract installs and runs only that consumer. Unknown
// arguments and unknown package ids fail closed before any packing.
const SINGLE_PACKAGE_MODES = {
    wrapper: { packageIds: ["wrapper"], consumerIds: ["sdk"] },
    cli: { packageIds: ["wrapper", "cli"], consumerIds: ["cli"] },
    mcp: { packageIds: ["wrapper", "mcp"], consumerIds: ["mcp"] },
};

let selectedPackageId = null;
for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--package=")) {
        selectedPackageId = arg.slice("--package=".length);
        continue;
    }
    console.error(`pack-consumer-smoke: unknown argument ${arg} (allowed: --package=wrapper|cli|mcp)`);
    process.exit(2);
}
if (selectedPackageId !== null && !(selectedPackageId in SINGLE_PACKAGE_MODES)) {
    console.error(
        `pack-consumer-smoke: unknown package id ${selectedPackageId} (allowed: wrapper, cli, mcp)`,
    );
    process.exit(2);
}
const packageIdsToPack = selectedPackageId === null
    ? ["wrapper", "cli", "mcp"]
    : SINGLE_PACKAGE_MODES[selectedPackageId].packageIds;
const consumerIdsToRun = selectedPackageId === null
    ? ["sdk", "cli", "mcp"]
    : SINGLE_PACKAGE_MODES[selectedPackageId].consumerIds;

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

function integrityOf(file) {
    return `sha512-${createHash("sha512").update(fs.readFileSync(file)).digest("base64")}`;
}

function pack(packageId) {
    const pkg = packageContract(packageId);
    const cwd = path.join(root, pkg.packageDir);
    const output = run("npm", ["pack", "--silent", "--json"], { cwd, capture: true });
    const parsed = JSON.parse(output.trim());
    const file = path.resolve(cwd, parsed[0].filename);
    packed.push(file);
    console.log(`exact-artifact ${packageId} (${pkg.npmName}): ${parsed[0].filename} ${integrityOf(file)}`);
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

function runSdkConsumer(tgzByPackageId) {
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
}

function runCliConsumer(tgzByPackageId) {
    const cliConsumer = tempProject("cli");
    install(cliConsumer, packageFilesForConsumer("cli", tgzByPackageId));
    run("node", [path.join(cliConsumer, "node_modules", "@apet97", "clockify-cli-115", "dist", "index.js"), "--version"], { cwd: cliConsumer });
}

function runMcpConsumer(tgzByPackageId) {
    const mcpConsumer = tempProject("mcp");
    install(mcpConsumer, packageFilesForConsumer("mcp", tgzByPackageId));
    writeAndRun(mcpConsumer, "mcp-imports.mjs", `
import assert from "node:assert/strict";
const server = await import("@apet97/clockify-mcp-115/server");
const client = await import("@apet97/clockify-mcp-115/client");
assert.equal(typeof server.buildServer, "function");
assert.equal(typeof client.loadContext, "function");
`);
    // stdio smoke: start the packed server binary over stdio with blank
    // credentials (graceful no-credential startup), then complete a real MCP
    // initialize -> initialized -> tools/list exchange before killing it.
    writeAndRun(mcpConsumer, "mcp-stdio.mjs", `
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const server = spawn(process.execPath, ["node_modules/@apet97/clockify-mcp-115/dist/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, CLOCKIFY_API_KEY: "", CLOCKIFY_WORKSPACE_ID: "", CLOCKIFY_BASE_URL: "" },
    stdio: ["pipe", "pipe", "ignore"],
});
let exited = null;
server.on("exit", (code, signal) => { exited = { code, signal }; });
const responses = new Map();
let buffer = "";
server.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line === "") continue;
        const message = JSON.parse(line);
        if (message.id !== undefined) responses.set(message.id, message);
    }
});
function send(message) {
    server.stdin.write(JSON.stringify(message) + "\\n");
}
function waitFor(id, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const tick = () => {
            if (responses.has(id)) return resolve(responses.get(id));
            if (exited !== null) return reject(new Error("mcp stdio server exited early: " + JSON.stringify(exited)));
            if (Date.now() - startedAt > timeoutMs) return reject(new Error("timed out waiting for response " + id));
            setTimeout(tick, 50);
        };
        tick();
    });
}
try {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "pack-consumer-smoke", version: "0.0.0" } } });
    const initialized = await waitFor(1);
    assert.equal(typeof initialized.result.serverInfo.name, "string");
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const toolsList = await waitFor(2);
    assert.equal(Array.isArray(toolsList.result.tools), true);
    assert.equal(toolsList.result.tools.length > 0, true);
    assert.equal(toolsList.result.tools.some((tool) => tool.name === "clockify_projects_list"), true);
    console.log("mcp stdio smoke ok: " + toolsList.result.tools.length + " tools listed over stdio");
} finally {
    server.kill();
}
`);
}

const CONSUMER_RUNNERS = { sdk: runSdkConsumer, cli: runCliConsumer, mcp: runMcpConsumer };

try {
    const tgzByPackageId = new Map();
    for (const packageId of packageIdsToPack) {
        tgzByPackageId.set(packageId, pack(packageId));
    }

    for (const consumerId of consumerIdsToRun) {
        CONSUMER_RUNNERS[consumerId](tgzByPackageId);
    }

    if (selectedPackageId === null) {
        console.log("packed consumer smoke passed for SDK, CLI, and MCP");
    } else {
        console.log(`packed consumer smoke passed for ${selectedPackageId}`);
    }
} finally {
    const keepTemp = process.env[contract.keepTempEnv] === "1";
    if (!keepTemp) {
        for (const file of packed) {
            try { fs.unlinkSync(file); } catch {}
        }
        for (const dir of tempRoots) {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        }
    }
}
