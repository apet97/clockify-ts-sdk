#!/usr/bin/env node
// Build the wrapper twice and fail if dist bytes differ. This catches
// nondeterministic emit before it reaches npm pack snapshots or consumer smoke.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "wrapper/dist");

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

function buildWrapper() {
    execFileSync("npm", ["run", "build", "-w", "clockify-sdk-ts-115"], {
        cwd: root,
        env: { ...process.env, CLOCKIFY_API_KEY: "", CLOCKIFY_WORKSPACE_ID: "" },
        stdio: ["ignore", "ignore", "inherit"],
    });
}

buildWrapper();
const firstHash = await hashTree(dist);
const firstCount = (await listFiles(dist)).length;

buildWrapper();
const secondHash = await hashTree(dist);
const secondCount = (await listFiles(dist)).length;

if (firstHash !== secondHash || firstCount !== secondCount) {
    console.error("build-determinism: two wrapper builds produced different dist output.");
    console.error(`  build 1: ${firstHash} (${firstCount} files)`);
    console.error(`  build 2: ${secondHash} (${secondCount} files)`);
    process.exit(1);
}

console.log(`build-determinism: wrapper dist stable across two builds (${firstCount} files).`);
