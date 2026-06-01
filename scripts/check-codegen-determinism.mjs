#!/usr/bin/env node
// Generate the SDK twice into throwaway directories and fail if the two trees
// differ. Catches nondeterministic codegen (locale/Node-version skew, unstable
// iteration order) before it reaches wrapper/.packsnapshot and reddens CI.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generator = path.join(root, "scripts/generate-sdk-from-openapi.mjs");

async function listFiles(dir) {
    const files = [];
    async function walk(current) {
        for (const entry of (await readdir(current)).sort()) {
            const absolute = path.join(current, entry);
            const info = await stat(absolute);
            if (info.isDirectory()) await walk(absolute);
            else if (info.isFile()) files.push(path.relative(dir, absolute).replace(/\\/g, "/"));
        }
    }
    await walk(dir);
    return files.sort();
}

async function hashTree(dir) {
    const hash = createHash("sha256");
    for (const file of await listFiles(dir)) {
        hash.update(file);
        hash.update("\0");
        hash.update(await readFile(path.join(dir, file)));
        hash.update("\0");
    }
    return hash.digest("hex");
}

function generateInto(dir) {
    // Keep the receipt out of the hashed ts-sdk tree so the check is strictly
    // over generated SDK content.
    const out = path.join(dir, "ts-sdk");
    const receipt = path.join(dir, "codegen-receipt.json");
    execFileSync("node", [generator, "--write", "--out", out, "--receipt", receipt], {
        cwd: root,
        stdio: ["ignore", "ignore", "inherit"],
    });
}

const first = await mkdtemp(path.join(os.tmpdir(), "clockify-codegen-determinism-a-"));
const second = await mkdtemp(path.join(os.tmpdir(), "clockify-codegen-determinism-b-"));
try {
    generateInto(first);
    generateInto(second);
    const [firstHash, secondHash] = await Promise.all([
        hashTree(path.join(first, "ts-sdk")),
        hashTree(path.join(second, "ts-sdk")),
    ]);
    if (firstHash !== secondHash) {
        console.error("codegen-determinism: two consecutive runs produced different output.");
        console.error("Likely locale/Node-version skew or unstable iteration order in the generator.");
        console.error(`  run 1: ${firstHash}`);
        console.error(`  run 2: ${secondHash}`);
        process.exit(1);
    }
    const fileCount = (await listFiles(path.join(first, "ts-sdk"))).length;
    console.log(`codegen-determinism: stable across two runs (${fileCount} files).`);
} finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
}
