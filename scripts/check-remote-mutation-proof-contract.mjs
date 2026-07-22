#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRemoteMutationProofRecord } from "./lib/remote-mutation-proof-contract.mjs";
import { validateRemoteMutationProofBindings } from "./lib/remote-mutation-proof-bindings.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recordPath = path.join(root, "docs", "remote-mutation-proof-contract.json");
const roadmapStatusPath = path.join(root, "docs", "roadmap-1.0-status.json");
const receiptPath = path.join(root, "docs", "roadmap-1.0-receipts", "task-18-remote-mutation.md");
const roadmapPath = path.join(root, "docs", "roadmap-1.0.md");
const riskRegisterPath = path.join(root, "docs", "risk-register.json");
let record;
try {
    record = JSON.parse(readFileSync(recordPath, "utf8"));
} catch (error) {
    console.error(`remote mutation proof contract failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}
const failures = validateRemoteMutationProofRecord(record);
try {
    failures.push(...validateRemoteMutationProofBindings({
        record,
        roadmapStatus: JSON.parse(readFileSync(roadmapStatusPath, "utf8")),
        receipt: readFileSync(receiptPath, "utf8"),
        roadmap: readFileSync(roadmapPath, "utf8"),
        riskRegister: JSON.parse(readFileSync(riskRegisterPath, "utf8")),
    }));
} catch (error) {
    failures.push(`duplicate-evidence binding: ${error instanceof Error ? error.message : String(error)}`);
}
const scoreContract = record?.scoreContract;
if (scoreContract?.path === "docs/mutation-score-contract.json" && typeof scoreContract.sha256 === "string") {
    const source = spawnSync("git", ["show", `${record.proofCommit}:${scoreContract.path}`], {
        cwd: root,
        encoding: "utf8",
    });
    if (source.status !== 0) {
        failures.push(`scoreContract: cannot read ${scoreContract.path} at proofCommit`);
    } else {
        const sourceHash = createHash("sha256").update(source.stdout).digest("hex");
        if (sourceHash !== scoreContract.sha256) failures.push("scoreContract.sha256: differs from proofCommit source");
        try {
            const sourcePackages = JSON.parse(source.stdout).packages?.map(({ id, globalFloor, moduleFloors }) => ({ id, globalFloor, moduleFloors }));
            if (JSON.stringify(sourcePackages) !== JSON.stringify(scoreContract.packages)) {
                failures.push("scoreContract.packages: differs from proofCommit source floors");
            }
        } catch {
            failures.push("scoreContract: proofCommit source is invalid JSON");
        }
    }
}
if (failures.length) {
    console.error("remote mutation proof contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}
console.log(`remote mutation proof contract passed (${record.status}; no GitHub or artifact download attempted).`);
