import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { validateRemoteMutationProofRecord } from "./remote-mutation-proof-contract.mjs";
import { validateRemoteMutationProofBindings } from "./remote-mutation-proof-bindings.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const readJson = (relative) => JSON.parse(readFileSync(path.join(root, relative), "utf8"));
const receipt = () => readFileSync(path.join(root, "docs/roadmap-1.0-receipts/task-18-remote-mutation.md"), "utf8");
const roadmap = () => readFileSync(path.join(root, "docs/roadmap-1.0.md"), "utf8");

function inputs() {
    return {
        record: readJson("docs/remote-mutation-proof-contract.json"),
        roadmapStatus: readJson("docs/roadmap-1.0-status.json"),
        receipt: receipt(),
        roadmap: roadmap(),
    };
}

test("canonical Task 18 duplicate evidence binds to the verified record", () => {
    const value = inputs();
    assert.deepEqual(validateRemoteMutationProofRecord(value.record), []);
    assert.deepEqual(validateRemoteMutationProofBindings(value), []);
});

test("proof-SHA substitution that preserves the score contract fails duplicate binding", () => {
    const value = inputs();
    const substitute = "3fdf27913470b09a79149fc4e2518e7837164c90";
    value.record.proofCommit = substitute;
    value.record.run.headSha = substitute;
    assert.deepEqual(validateRemoteMutationProofRecord(value.record), []);
    assert.match(validateRemoteMutationProofBindings(value).join("\n"), /taskBase|headSha|receipt|roadmap/i);
});

test("status and readable receipt substitutions fail exact canonical bindings", () => {
    const statusValue = inputs();
    statusValue.roadmapStatus.remoteMutationProof.aggregateProof.artifactSizeBytes += 1;
    assert.match(validateRemoteMutationProofBindings(statusValue).join("\n"), /artifactSizeBytes/);

    const receiptValue = inputs();
    receiptValue.receipt = receiptValue.receipt.replace(receiptValue.record.artifact.archiveSha256, "0".repeat(64));
    assert.match(validateRemoteMutationProofBindings(receiptValue).join("\n"), /receipt.*877a785/i);
});

test("receipt score, module-floor, expiry, and no-local claims bind to canonical measurements", () => {
    const cases = [
        ["wrapper global score", (value) => { value.receipt = value.receipt.replace("86.31067961165049", "99"); }, /86\.31067961165049/],
        ["wrapper module floor", (value) => { value.receipt = value.receipt.replace("`ensure` 94.5945945945946/94", "`ensure` 94.5945945945946/95"); }, /`ensure` 94\.5945945945946\/94/],
        ["artifact expiry", (value) => { value.receipt = value.receipt.replace("expired `false` at verification", "expired `true` at verification"); }, /expired `false`/],
        ["no-local assertion", (value) => { value.receipt = value.receipt.replace("Canonical no-local-mutation assertion: `true`.", "Canonical no-local-mutation assertion: `false`."); }, /no-local-mutation assertion: `true`/],
    ];
    for (const [name, mutate, expected] of cases) {
        const value = inputs();
        mutate(value);
        assert.match(validateRemoteMutationProofBindings(value).join("\n"), expected, name);
    }
});

test("pending template is valid nonproof evidence and needs no duplicate binding", () => {
    const value = inputs();
    value.record.status = "pending-live-evidence";
    value.record.run = null;
    value.record.artifact = null;
    value.record.measurements = null;
    value.record.verifiedAt = null;
    assert.deepEqual(validateRemoteMutationProofRecord(value.record), []);
    assert.deepEqual(validateRemoteMutationProofBindings(value), []);
});
