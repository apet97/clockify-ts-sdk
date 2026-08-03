import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
    ReleaseStateError,
    createInitialState,
    initializeStateFile,
    isTerminalState,
    readState,
    redactedState,
    transitionState,
    updateStateFile,
    writeStateAtomic,
} from "./lib/release-state.mjs";

const FIXED_TIME = "2026-08-03T10:00:00.000Z";

function metadata(overrides = {}) {
    return {
        workflow: "release",
        runId: "123",
        runAttempt: "1",
        eventName: "push",
        refName: "wrapper-v0.15.0",
        sourceSha: "abc123",
        packageName: "clockify-sdk-ts-115",
        version: "0.15.0",
        ...overrides,
    };
}

function tempReceipt() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "clockify-release-state-test-"));
    return { root, file: path.join(root, "receipt.json") };
}

function clock() {
    return FIXED_TIME;
}

function initial(file) {
    return initializeStateFile(file, metadata(), { clock });
}

test("initializes the exact schema and named transitions only", () => {
    const state = createInitialState(metadata(), { clock });
    assert.deepEqual(Object.keys(state).sort(), [
        "eventName", "finalStatus", "localArtifact", "packageName", "publication", "refName",
        "repository", "runAttempt", "runId", "schemaVersion", "sourceSha", "timestamps", "verification", "version", "workflow",
    ].sort());
    assert.equal(state.finalStatus, "built");
    assert.throws(() => transitionState(state, "set", { "finalStatus": "verified" }), /unknown release-state command/);
});

test("malformed and schema-mismatched receipts fail closed without replacement", () => {
    const { root, file } = tempReceipt();
    try {
        fs.writeFileSync(file, "{not-json\n");
        const malformed = fs.readFileSync(file, "utf8");
        assert.throws(
            () => initializeStateFile(file, metadata(), { clock }),
            (error) => error instanceof ReleaseStateError && error.code === "malformed_receipt" && error.exitCode === 2,
        );
        assert.equal(fs.readFileSync(file, "utf8"), malformed);

        fs.writeFileSync(file, JSON.stringify({ ...createInitialState(metadata(), { clock }), schemaVersion: 99 }));
        assert.throws(
            () => readState(file),
            (error) => error instanceof ReleaseStateError && error.code === "schema_mismatch" && error.exitCode === 2,
        );

        const published = transitionState(
            transitionState(createInitialState(metadata(), { clock }), "set-artifact", { path: "/tmp/sdk.tgz", integrity: "sha512-local" }, { clock }),
            "publish",
            { mode: "published_now", remoteIntegrity: "sha512-local" },
            { clock },
        );
        fs.writeFileSync(file, JSON.stringify({ ...published, finalStatus: "verified" }));
        assert.throws(() => readState(file), /verified status requires/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("metadata is immutable after initialization", () => {
    const { root, file } = tempReceipt();
    try {
        initial(file);
        assert.throws(
            () => initializeStateFile(file, metadata({ sourceSha: "different" }), { clock }),
            (error) => error instanceof ReleaseStateError && error.code === "immutable_metadata",
        );
        assert.equal(readState(file).sourceSha, "abc123");
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("proof-only receipts reject publication and remain proof-only after smoke", () => {
    const state = transitionState(createInitialState(metadata(), { clock }), "proof-only", {}, { clock });
    assert.equal(state.publication.mode, "proof_only");
    assert.equal(state.finalStatus, "proof_only");
    const smoked = transitionState(state, "registry-smoke", { status: "passed" }, { clock });
    assert.equal(smoked.finalStatus, "proof_only");
    assert.throws(
        () => transitionState(state, "publish", { mode: "published_now", remoteIntegrity: "sha512-local" }, { clock }),
        (error) => error instanceof ReleaseStateError && error.code === "proof_only_publication",
    );
});

test("matching publication requires exact integrity and registry smoke proves it", () => {
    const state = createInitialState(metadata(), { clock });
    const artifact = transitionState(state, "set-artifact", { path: "/tmp/sdk.tgz", integrity: "sha512-local" }, { clock });
    const published = transitionState(artifact, "publish", { mode: "published_now", remoteIntegrity: "sha512-local" }, { clock });
    assert.equal(published.finalStatus, "published_unverified");
    const verified = transitionState(published, "registry-smoke", { status: "passed" }, { clock });
    assert.equal(verified.finalStatus, "verified");
    assert.equal(verified.verification.registrySmoke, "passed");
});

test("integrity mismatch is written as a terminal receipt before failing", () => {
    const { root, file } = tempReceipt();
    try {
        initial(file);
        updateStateFile(file, "set-artifact", { path: "/tmp/sdk.tgz", integrity: "sha512-local" }, { clock });
        assert.throws(
            () => updateStateFile(file, "publish", { mode: "already_present_matching", remoteIntegrity: "sha512-remote" }, { clock }),
            (error) => error instanceof ReleaseStateError && error.code === "integrity_mismatch" && error.nextState?.finalStatus === "integrity_mismatch",
        );
        const receipt = readState(file);
        assert.equal(receipt.publication.mode, "mismatch");
        assert.equal(receipt.publication.remoteIntegrity, "sha512-remote");
        assert.equal(receipt.finalStatus, "integrity_mismatch");
        assert.equal(isTerminalState(receipt), true);
        assert.throws(() => updateStateFile(file, "registry-smoke", { status: "passed" }, { clock }), /terminal/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("failed verification is persisted and becomes terminal", () => {
    const { root, file } = tempReceipt();
    try {
        initial(file);
        assert.throws(
            () => updateStateFile(file, "registry-smoke", { status: "failed" }, { clock }),
            (error) => error instanceof ReleaseStateError && error.code === "registry_smoke_failed",
        );
        assert.equal(readState(file).finalStatus, "failed");
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("a later workflow failure preserves recorded publication evidence", () => {
    const { root, file } = tempReceipt();
    try {
        initial(file);
        updateStateFile(file, "set-artifact", { path: "/tmp/sdk.tgz", integrity: "sha512-local" }, { clock });
        updateStateFile(file, "publish", { mode: "published_now", remoteIntegrity: "sha512-local" }, { clock });
        assert.throws(
            () => updateStateFile(file, "fail", {}, { clock }),
            (error) => error instanceof ReleaseStateError && error.code === "release_failed",
        );
        const receipt = readState(file);
        assert.equal(receipt.publication.mode, "published_now");
        assert.equal(receipt.publication.remoteIntegrity, "sha512-local");
        assert.equal(receipt.finalStatus, "failed");
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("atomic interruption leaves the prior receipt intact and cleans the temp file", () => {
    const { root, file } = tempReceipt();
    try {
        const state = initial(file);
        const original = fs.readFileSync(file, "utf8");
        assert.throws(
            () => writeStateAtomic(file, { ...state, timestamps: { ...state.timestamps, updatedAt: "2026-08-03T10:01:00.000Z" } }, {
                beforeRename: ({ temporaryPath }) => {
                    assert.equal(path.dirname(temporaryPath), path.dirname(file));
                    throw new Error("simulated interruption");
                },
            }),
            /simulated interruption/,
        );
        assert.equal(fs.readFileSync(file, "utf8"), original);
        assert.deepEqual(fs.readdirSync(root), ["receipt.json"]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("redacted output preserves receipt shape without exposing sensitive-shaped values", () => {
    const state = createInitialState(metadata(), { clock });
    const redacted = redactedState(state);
    assert.deepEqual(redacted, state);
    assert.equal(Object.hasOwn(redacted, "publication"), true);
});
