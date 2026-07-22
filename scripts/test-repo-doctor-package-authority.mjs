#!/usr/bin/env node
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "clockify-repo-doctor-authority-"));

async function copy(relativePath) {
    const target = path.join(fixtureRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(root, relativePath), target);
}

async function runDoctor() {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["scripts/repo-doctor.mjs", "--compact"], {
            cwd: fixtureRoot,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
}

try {
    for (const relativePath of [
        "package.json",
        "wrapper/package.json",
        "cli/package.json",
        "mcp/package.json",
        "docs/package-contract.json",
        "scripts/repo-doctor.mjs",
    ]) {
        await copy(relativePath);
    }

    const environmentContract = JSON.parse(
        await readFile(path.join(root, "docs", "developer-environment-contract.json"), "utf8"),
    );
    const packageContract = JSON.parse(await readFile(path.join(root, "docs", "package-contract.json"), "utf8"));
    const wrapperEnvironment = environmentContract.packages.find((pkg) => pkg.id === "wrapper");
    const wrapperPackage = packageContract.packages.find((pkg) => pkg.id === "wrapper");
    assert.ok(wrapperEnvironment, "fixture needs a wrapper environment package");
    assert.ok(wrapperPackage, "fixture needs a wrapper package contract");

    wrapperEnvironment.requiredScriptValues.prepublishOnly = "npm run intentionally-wrong-prepublish-proof";
    await mkdir(path.join(fixtureRoot, "docs"), { recursive: true });
    await writeFile(
        path.join(fixtureRoot, "docs", "developer-environment-contract.json"),
        `${JSON.stringify(environmentContract, null, 2)}\n`,
    );
    await writeFile(path.join(fixtureRoot, "package-lock.json"), "{}\n");
    await mkdir(path.join(fixtureRoot, "scripts", "sdk-codegen"), { recursive: true });
    await writeFile(
        path.join(fixtureRoot, "scripts", "generate-sdk-from-openapi.mjs"),
        "// spec/corrected/clockify.corrected.openapi.yaml -> output/ts-sdk\n",
    );
    await writeFile(path.join(fixtureRoot, "scripts", "sdk-codegen", "constants.mjs"), "\n");
    await mkdir(path.join(fixtureRoot, "wrapper", "scripts"), { recursive: true });
    await writeFile(path.join(fixtureRoot, "wrapper", "scripts", "sync-sdk.sh"), "#!/bin/sh\n");
    await mkdir(path.join(fixtureRoot, "spec", "corrected"), { recursive: true });
    await writeFile(path.join(fixtureRoot, "spec", "corrected", "clockify.corrected.openapi.yaml"), "openapi: 3.0.0\n");

    const result = await runDoctor();
    assert.equal(result.stderr, "");
    assert.equal(result.code, 0, result.stdout);
    const report = JSON.parse(result.stdout);
    const wrapperCheck = report.checks.find((entry) => entry.id === "wrapper.script.prepublishOnly.command");
    assert.equal(wrapperCheck?.status, "pass");
    assert.equal(wrapperCheck?.details?.expected, wrapperPackage.requiredScripts.prepublishOnly);
    console.log("repo-doctor package-contract authority passed");
} finally {
    await rm(fixtureRoot, { recursive: true, force: true });
}
