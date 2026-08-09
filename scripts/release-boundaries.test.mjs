import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
    classifyAttestation,
    classifyRegistryIntegrity,
    ReleaseBoundaryError,
    publishRelease,
    verifyAttestation,
} from "./lib/release-boundaries.mjs";
import {
    ReleaseStateError,
    initializeStateFile,
    readState,
    updateStateFile,
} from "./lib/release-state.mjs";

const FIXED_TIME = "2026-08-03T10:00:00.000Z";
const LOCAL = "sha512-local";
const REMOTE = "sha512-remote";

function metadata() {
    return {
        workflow: "release",
        runId: "123",
        runAttempt: "1",
        eventName: "push",
        refName: "wrapper-v0.15.0",
        sourceSha: "abc123",
        packageName: "clockify-sdk-ts-115",
        version: "0.15.0",
    };
}

function result(status, stdout = "", stderr = "", overrides = {}) {
    return { status, signal: null, error: undefined, stdout, stderr, ...overrides };
}

function receiptFixture({ published = false, smoked = false } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "clockify-release-boundaries-test-"));
    const filePath = path.join(root, "receipt.json");
    initializeStateFile(filePath, metadata(), { clock: () => FIXED_TIME });
    updateStateFile(filePath, "set-artifact", { path: "/tmp/package.tgz", integrity: LOCAL }, { clock: () => FIXED_TIME });
    if (published) {
        updateStateFile(
            filePath,
            "publish",
            { mode: "published_now", remoteIntegrity: LOCAL },
            { clock: () => FIXED_TIME },
        );
    }
    if (smoked) updateStateFile(filePath, "registry-smoke", { status: "passed" }, { clock: () => FIXED_TIME });
    return { root, filePath };
}

function queuedRunner(outcomes, calls) {
    return (args) => {
        calls.push(args);
        const outcome = outcomes.shift();
        assert.ok(outcome, `unexpected command ${JSON.stringify(args)}`);
        return outcome;
    };
}

function cleanup(fixture) {
    fs.rmSync(fixture.root, { recursive: true, force: true });
}

test("registry integrity classification distinguishes match, empty, 404, network, and mismatch", () => {
    assert.equal(classifyRegistryIntegrity(result(0, LOCAL)).kind, "present");
    assert.equal(classifyRegistryIntegrity(result(0, "\n")).kind, "empty");
    assert.equal(classifyRegistryIntegrity(result(1, "", "npm ERR! code E404")).kind, "not_found");
    assert.equal(classifyRegistryIntegrity(result(1, "", "ECONNRESET")).kind, "query_error");
    assert.equal(classifyRegistryIntegrity(result(0, REMOTE)).kind, "present");
    assert.equal(classifyRegistryIntegrity(result(0, "not-integrity")).kind, "malformed");
});

test("an existing matching package records exact remote integrity without publishing", () => {
    const fixture = receiptFixture();
    const calls = [];
    try {
        const state = publishRelease(
            {
                filePath: fixture.filePath,
                packageName: metadata().packageName,
                version: metadata().version,
                tarball: "/tmp/package.tgz",
                localIntegrity: LOCAL,
            },
            { run: queuedRunner([result(0, LOCAL)], calls), clock: () => FIXED_TIME },
        );
        assert.equal(state.publication.mode, "already_present_matching");
        assert.equal(state.publication.remoteIntegrity, LOCAL);
        assert.equal(calls.length, 1);
    } finally {
        cleanup(fixture);
    }
});

test("empty successful registry output fails closed without synthesizing local integrity", () => {
    const fixture = receiptFixture();
    try {
        assert.throws(
            () => publishRelease(
                {
                    filePath: fixture.filePath,
                    packageName: metadata().packageName,
                    version: metadata().version,
                    tarball: "/tmp/package.tgz",
                    localIntegrity: LOCAL,
                },
                { run: queuedRunner([result(0, "")], []), clock: () => FIXED_TIME },
            ),
            (error) => error instanceof ReleaseBoundaryError && error.code === "registry_integrity_invalid",
        );
        const state = readState(fixture.filePath);
        assert.equal(state.publication.mode, "failed");
        assert.equal(state.publication.remoteIntegrity, "");
    } finally {
        cleanup(fixture);
    }
});

test("a registry network error fails closed before publication", () => {
    const fixture = receiptFixture();
    try {
        assert.throws(
            () => publishRelease(
                {
                    filePath: fixture.filePath,
                    packageName: metadata().packageName,
                    version: metadata().version,
                    tarball: "/tmp/package.tgz",
                    localIntegrity: LOCAL,
                },
                { run: queuedRunner([result(1, "", "ECONNRESET")], []), clock: () => FIXED_TIME },
            ),
            (error) => error instanceof ReleaseBoundaryError && error.code === "registry_query_failed",
        );
        assert.equal(readState(fixture.filePath).publication.mode, "failed");
    } finally {
        cleanup(fixture);
    }
});

test("publish success is recorded before delayed registry propagation and then verified", () => {
    const fixture = receiptFixture();
    const calls = [];
    const sleeps = [];
    try {
        const state = publishRelease(
            {
                filePath: fixture.filePath,
                packageName: metadata().packageName,
                version: metadata().version,
                tarball: "/tmp/package.tgz",
                localIntegrity: LOCAL,
            },
            {
                run: queuedRunner(
                    [
                        result(1, "", "E404 Not Found"),
                        result(0, "published"),
                        result(1, "", "E404 Not Found"),
                        result(0, LOCAL),
                    ],
                    calls,
                ),
                sleep: (milliseconds) => sleeps.push(milliseconds),
                clock: () => FIXED_TIME,
            },
        );
        assert.equal(state.publication.mode, "published_now");
        assert.equal(state.publication.remoteIntegrity, LOCAL);
        assert.equal(calls[1][0], "publish");
        assert.deepEqual(sleeps, [2_000]);
    } finally {
        cleanup(fixture);
    }
});

// Regression: `sleep` defaulted to `() => {}`, so every test injected a
// recorder and production inherited the no-op. The eight propagation attempts
// ran back to back in ~9s, and every release from 1.0.0 to 4.0.0 reported
// registry_propagation_timeout after a successful publish -- skipping the
// provenance check, SBOM, and GitHub release that follow it. Deliberately does
// NOT inject `sleep`: the default is what is under test.
test("the default propagation backoff actually waits between attempts", () => {
    const fixture = receiptFixture();
    try {
        const startedAt = process.hrtime.bigint();
        publishRelease(
            {
                filePath: fixture.filePath,
                packageName: metadata().packageName,
                version: metadata().version,
                tarball: "/tmp/package.tgz",
                localIntegrity: LOCAL,
            },
            {
                run: queuedRunner([
                    result(1, "", "E404 Not Found"),
                    result(0, "published"),
                    result(1, "", "E404 Not Found"),
                    result(0, LOCAL),
                ], []),
                clock: () => FIXED_TIME,
                maxAttempts: 2,
                delayMs: 40,
            },
        );
        const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        assert.ok(elapsedMs >= 35, `expected the backoff to block, waited ${elapsedMs}ms`);
    } finally {
        cleanup(fixture);
    }
});

test("publish success plus propagation timeout preserves pending publication evidence", () => {
    const fixture = receiptFixture();
    const calls = [];
    try {
        assert.throws(
            () => publishRelease(
                {
                    filePath: fixture.filePath,
                    packageName: metadata().packageName,
                    version: metadata().version,
                    tarball: "/tmp/package.tgz",
                    localIntegrity: LOCAL,
                },
                {
                    run: queuedRunner(
                        [
                            result(1, "", "E404 Not Found"),
                            result(0, "published"),
                            result(1, "", "E404 Not Found"),
                            result(1, "", "E404 Not Found"),
                            result(1, "", "E404 Not Found"),
                        ],
                        calls,
                    ),
                    maxAttempts: 3,
                    clock: () => FIXED_TIME,
                },
            ),
            (error) => error instanceof ReleaseBoundaryError && error.code === "registry_propagation_timeout",
        );
        const state = readState(fixture.filePath);
        assert.equal(state.publication.mode, "published_pending_registry");
        assert.equal(state.finalStatus, "failed");
        assert.equal(calls.filter((args) => args[0] === "publish").length, 1);
    } finally {
        cleanup(fixture);
    }
});

test("a post-publish poll that returns a DIFFERENT integrity is terminal, not published_now (REL-3 pin)", () => {
    // The registry serving an artifact other than the one just published must
    // never be recorded as a clean publication. publishRelease delegates the
    // comparison to the state engine's "publish" transition; this pins the
    // post-publish path end to end.
    const fixture = receiptFixture();
    try {
        assert.throws(
            () => publishRelease(
                {
                    filePath: fixture.filePath,
                    packageName: metadata().packageName,
                    version: metadata().version,
                    tarball: "/tmp/package.tgz",
                    localIntegrity: LOCAL,
                },
                {
                    run: queuedRunner(
                        [
                            result(1, "", "E404 Not Found"),
                            result(0, "published"),
                            result(0, REMOTE),
                        ],
                        [],
                    ),
                    sleep: () => {},
                    clock: () => FIXED_TIME,
                },
            ),
            (error) => error instanceof ReleaseStateError && error.code === "integrity_mismatch",
        );
        const state = readState(fixture.filePath);
        assert.equal(state.publication.mode, "mismatch");
        assert.equal(state.publication.remoteIntegrity, REMOTE);
        assert.equal(state.finalStatus, "integrity_mismatch");
    } finally {
        cleanup(fixture);
    }
});

test("remote integrity mismatch is recorded as a terminal mismatch", () => {
    const fixture = receiptFixture();
    try {
        assert.throws(
            () => publishRelease(
                {
                    filePath: fixture.filePath,
                    packageName: metadata().packageName,
                    version: metadata().version,
                    tarball: "/tmp/package.tgz",
                    localIntegrity: LOCAL,
                },
                { run: queuedRunner([result(0, REMOTE)], []), clock: () => FIXED_TIME },
            ),
            (error) => error instanceof ReleaseStateError && error.code === "integrity_mismatch",
        );
        const state = readState(fixture.filePath);
        assert.equal(state.publication.mode, "mismatch");
        assert.equal(state.publication.remoteIntegrity, REMOTE);
        assert.equal(state.finalStatus, "integrity_mismatch");
    } finally {
        cleanup(fixture);
    }
});

test("attestation classification distinguishes present, absent, and malformed responses", () => {
    assert.equal(classifyAttestation(result(0, "null")).kind, "absent");
    assert.equal(classifyAttestation(result(0, "{}")).kind, "absent");
    assert.equal(classifyAttestation(result(0, "[]")).kind, "absent");
    assert.equal(classifyAttestation(result(0, '{"provenance":true}')).kind, "present");
    assert.equal(classifyAttestation(result(0, "not-json")).kind, "malformed");
    assert.equal(classifyAttestation(result(1, "", "EAI_AGAIN")).kind, "query_error");
});

test("missing attestation after smoke fails and persists a failed receipt", () => {
    const fixture = receiptFixture({ published: true, smoked: true });
    try {
        assert.throws(
            () => verifyAttestation(
                { filePath: fixture.filePath, packageName: metadata().packageName, version: metadata().version },
                { run: () => result(0, "null"), clock: () => FIXED_TIME },
            ),
            (error) => error instanceof ReleaseStateError && error.code === "attestation_missing",
        );
        const state = readState(fixture.filePath);
        assert.equal(state.verification.attestation, "absent");
        assert.equal(state.finalStatus, "failed");
    } finally {
        cleanup(fixture);
    }
});

test("corrupt attestation output fails without claiming absence", () => {
    const fixture = receiptFixture({ published: true });
    try {
        assert.throws(
            () => verifyAttestation(
                { filePath: fixture.filePath, packageName: metadata().packageName, version: metadata().version },
                { run: () => result(0, "not-json"), clock: () => FIXED_TIME },
            ),
            (error) => error instanceof ReleaseBoundaryError && error.code === "attestation_malformed",
        );
        const state = readState(fixture.filePath);
        assert.equal(state.verification.attestation, "not_checked");
        assert.equal(state.finalStatus, "failed");
    } finally {
        cleanup(fixture);
    }
});
