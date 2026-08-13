import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
    buildVerifiedSdkArtifact,
    captureCampaignInputSnapshot,
    runChildWithGracefulTermination,
    sameArtifact,
    sameHashes,
    sanitizedOutput,
    writeByteSnapshot,
} from "./run-live-evidence-campaign.mjs";

test("byte snapshots contain only the supplied immutable bytes", () => {
    const destination = fs.mkdtempSync(path.join(os.tmpdir(), "live-campaign-snapshot-"));
    const source = Buffer.from("first");
    try {
        writeByteSnapshot(destination, new Map([["nested/input.txt", source]]));
        source.fill("x");

        assert.equal(fs.readFileSync(path.join(destination, "nested/input.txt"), "utf8"), "first");
        assert.deepEqual(fs.readdirSync(destination), ["nested"]);
    } finally {
        fs.rmSync(destination, { recursive: true, force: true });
    }
});

test("byte snapshots reject traversal and non-byte inputs", () => {
    const destination = fs.mkdtempSync(path.join(os.tmpdir(), "live-campaign-snapshot-"));
    try {
        assert.throws(
            () => writeByteSnapshot(destination, new Map([["../escape", Buffer.from("x")]])),
            (error) => error?.code === "live_campaign_snapshot_input_invalid",
        );
        assert.throws(
            () => writeByteSnapshot(destination, new Map([["input", "not bytes"]])),
            (error) => error?.code === "live_campaign_snapshot_input_invalid",
        );
    } finally {
        fs.rmSync(destination, { recursive: true, force: true });
    }
});

test("snapshot equality binds both input hashes and SDK artifact identity", () => {
    const inputs = { fingerprint: "a", hashes: { one: "1", two: "2" } };
    const artifact = { root: "wrapper/dist", sha256: "b", fileCount: 2 };

    assert.equal(sameHashes(inputs, structuredClone(inputs)), true);
    assert.equal(sameHashes(inputs, { ...inputs, fingerprint: "changed" }), false);
    assert.equal(sameArtifact(artifact, structuredClone(artifact)), true);
    assert.equal(sameArtifact(artifact, { ...artifact, fileCount: 3 }), false);
});

test("SDK build rejects campaign inputs that change during the build", () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "live-campaign-inputs-"));
    const inputPath = path.join(sourceRoot, "input.txt");
    fs.writeFileSync(inputPath, "before");
    try {
        assert.throws(
            () =>
                buildVerifiedSdkArtifact({
                    captureInputs: () =>
                        captureCampaignInputSnapshot(sourceRoot, ["input.txt"]),
                    build: () => fs.writeFileSync(inputPath, "after"),
                    hashArtifact: () => ({
                        root: "wrapper/dist",
                        sha256: "a".repeat(64),
                        fileCount: 1,
                    }),
                }),
            (error) => error?.code === "live_campaign_inputs_changed_during_build",
        );
    } finally {
        fs.rmSync(sourceRoot, { recursive: true, force: true });
    }
});

test("worker timeout requests graceful cleanup before exit", async () => {
    const destination = fs.mkdtempSync(path.join(os.tmpdir(), "live-campaign-worker-"));
    const cleanupMarker = path.join(destination, "cleanup-ran");
    try {
        const result = await runChildWithGracefulTermination(
            process.execPath,
            [
                "-e",
                `const fs = require("node:fs");
process.on("SIGTERM", () => {
  fs.writeFileSync(process.argv[1], "cleanup");
  setTimeout(() => process.exit(17), 20);
});
setInterval(() => {}, 1_000);`,
                cleanupMarker,
            ],
            {
                timeoutMs: 200,
                cleanupGraceMs: 1_000,
                maxBufferBytes: 1_024,
                forwardSignals: false,
            },
        );

        assert.equal(result.timedOut, true);
        assert.equal(result.forced, false);
        assert.equal(result.status, 17);
        assert.equal(fs.readFileSync(cleanupMarker, "utf8"), "cleanup");
    } finally {
        fs.rmSync(destination, { recursive: true, force: true });
    }
});

test("worker receives a bounded hard kill only after ignoring the cleanup grace window", async () => {
    const result = await runChildWithGracefulTermination(
        process.execPath,
        [
            "-e",
            `process.on("SIGTERM", () => {});
setInterval(() => {}, 1_000);`,
        ],
        {
            timeoutMs: 200,
            cleanupGraceMs: 100,
            maxBufferBytes: 1_024,
            forwardSignals: false,
        },
    );

    assert.equal(result.timedOut, true);
    assert.equal(result.forced, true);
    assert.equal(result.signal, "SIGKILL");
});

test("worker termination sends graceful and hard signals through the shared terminator", async () => {
    const signals = [];
    const result = await runChildWithGracefulTermination(
        process.execPath,
        [
            "-e",
            `process.on("SIGTERM", () => {});
setInterval(() => {}, 1_000);`,
        ],
        {
            timeoutMs: 200,
            cleanupGraceMs: 100,
            maxBufferBytes: 1_024,
            forwardSignals: false,
            terminate: (child, signal) => {
                signals.push(signal);
                return signal === "SIGKILL" ? child.kill(signal) : true;
            },
        },
    );

    assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
    assert.equal(result.forced, true);
});

test("launcher output redacts every occurrence of workspace and credential values", () => {
    const output = sanitizedOutput("key key workspace key", ["key", "workspace"]);
    assert.equal(output, "[REDACTED] [REDACTED] [REDACTED] [REDACTED]");
    assert.equal(output.includes("key"), false);
    assert.equal(output.includes("workspace"), false);
});

test("launcher main path uses the shared cleanup grace constant", () => {
    const source = fs.readFileSync(
        new URL("./run-live-evidence-campaign.mjs", import.meta.url),
        "utf8",
    );
    assert.match(source, /cleanupGraceMs: LIVE_CAMPAIGN_CLEANUP_GRACE_MS/);
    assert.doesNotMatch(source, /cleanupGraceMs: CLEANUP_GRACE_MS/);
});
