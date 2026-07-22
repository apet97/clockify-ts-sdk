#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createGitHubBoundary, verifyRemoteMutationProof } from "./lib/remote-mutation-proof-verifier.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recordPath = path.join(root, "docs", "remote-mutation-proof-contract.json");
try {
    const record = JSON.parse(readFileSync(recordPath, "utf8"));
    const result = await verifyRemoteMutationProof({ record, root, github: createGitHubBoundary() });
    console.log(`remote mutation proof verified (run ${result.runId}, artifact ${result.artifactId}; temporary download removed).`);
} catch (error) {
    console.error(`remote mutation proof verification failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}
