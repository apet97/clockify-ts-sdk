#!/usr/bin/env node
// Networked proof (NOT part of ordinary offline verification): fetches the
// exact commit recorded in docs/openapi-source-lock.json from the real
// public upstream and confirms repository/commit existence, source
// byte-for-byte identity, and composer identity. Prints only safe metadata
// (labels, pass/fail, byte counts, hashes) -- never raw file contents or
// credentials. Exit 0 means the exact immutable bytes were observed; any
// network failure or mismatch is a nonzero, explicit exit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyOpenApiSourceLock } from "./lib/openapi-source-lock-verify.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = path.join(root, "docs", "openapi-source-lock.json");

if (!fs.existsSync(lockPath)) {
    console.error(
        `docs/openapi-source-lock.json does not exist yet -- it is created only once a human has supplied and approved real upstream values (H01-LOCK).`,
    );
    process.exit(1);
}

const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));

const result = await verifyOpenApiSourceLock(lock, {});

for (const check of result.checks) {
    const status = check.ok ? "OK" : "FAIL";
    const bytesSuffix = typeof check.bytes === "number" ? ` (${check.bytes} bytes)` : "";
    console.log(`${status}: ${check.label}${bytesSuffix}`);
}

if (!result.ok) {
    console.error("openapi source lock verification failed:");
    for (const message of result.errors) console.error(`- ${message}`);
    process.exit(1);
}

console.log(`openapi source lock verified: ${lock.repositoryUrl}@${lock.commit}`);
