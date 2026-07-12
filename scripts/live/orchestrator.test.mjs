import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
    GOVERNED_LEGACY_PREFIXES,
    acquireLiveLock,
    createLivePrefix,
    releaseLiveLock,
    runLiveProof,
    terminateProcessTree,
    validateLiveEnvironment,
} from "./orchestrator.mjs";

const SAFE_ENV = Object.freeze({
    CLOCKIFY_API_KEY: "secret-api-key",
    CLOCKIFY_WORKSPACE_ID: "0123456789abcdef01234567",
    CLOCKIFY_LIVE_WORKSPACE_CONFIRM: "0123456789abcdef01234567",
});
const SAFE_FINGERPRINT = createHash("sha256")
    .update(SAFE_ENV.CLOCKIFY_WORKSPACE_ID)
    .digest("hex");

const CLEANUP_ENTITY_ORDER = [
    "time_entries",
    "scheduling_assignments",
    "time_off_requests",
    "expenses",
    "invoices",
    "shared_reports",
    "webhooks",
    "tasks",
    "projects",
    "clients",
    "tags",
];

function cleanActions() {
    return CLEANUP_ENTITY_ORDER.map((entityType) => ({
        entityType,
        sanitizedIdCount: 0,
        deletedCount: 0,
        failedCount: 0,
        remainingCount: 0,
        complete: true,
    }));
}

function cleanCleanup(prefixCount = 8) {
    return { ok: true, prefixCount, actions: cleanActions(), leftovers: 0 };
}

test("live environment requires a non-empty key and an exactly confirmed workspace", () => {
    assert.throws(() => validateLiveEnvironment({}), /live_configuration_invalid/);
    assert.throws(
        () =>
            validateLiveEnvironment({
                ...SAFE_ENV,
                CLOCKIFY_LIVE_WORKSPACE_CONFIRM: "fedcba9876543210fedcba98",
            }),
        /live_workspace_unconfirmed/,
    );
    assert.throws(
        () =>
            validateLiveEnvironment({
                CLOCKIFY_API_KEY: "secret-api-key",
                CLOCKIFY_WORKSPACE_ID: "not-a-clockify-id",
                CLOCKIFY_LIVE_WORKSPACE_CONFIRM: "not-a-clockify-id",
            }),
        /live_workspace_invalid/,
    );
    assert.throws(
        () =>
            validateLiveEnvironment({
                ...SAFE_ENV,
                CLOCKIFY_BASE_URL: "https://api.clockify.me/api/v1",
            }),
        /live_base_url_override_forbidden/,
    );

    assert.throws(
        () =>
            validateLiveEnvironment(SAFE_ENV, {
                expectedWorkspaceFingerprint: "0".repeat(64),
            }),
        /live_workspace_not_sacrificial/,
    );

    const result = validateLiveEnvironment(SAFE_ENV, {
        expectedWorkspaceFingerprint: SAFE_FINGERPRINT,
    });
    assert.equal(result.apiKey, SAFE_ENV.CLOCKIFY_API_KEY);
    assert.equal(result.workspaceId, SAFE_ENV.CLOCKIFY_WORKSPACE_ID);
});

test("run prefixes are unique-looking, sortable, and end with a separator", () => {
    const prefix = createLivePrefix({
        now: new Date("2026-07-12T05:06:07.890Z"),
        randomBytes: () => Buffer.from("a1b2c3d4", "hex"),
    });

    assert.equal(prefix, "clockify115-live-20260712T050607890Z-a1b2c3d4-");
    assert.equal(new Set(GOVERNED_LEGACY_PREFIXES).size, GOVERNED_LEGACY_PREFIXES.length);
    assert.ok(GOVERNED_LEGACY_PREFIXES.includes("clockify115-live-"));
    assert.ok(GOVERNED_LEGACY_PREFIXES.includes("sdk-test-"));
    assert.ok(GOVERNED_LEGACY_PREFIXES.includes("DEMO-"));
});

test("live lock refuses active and fresh-dead owners, but replaces a proven stale lock", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "clockify-live-lock-"));
    const lockPath = path.join(dir, "proof.lock");
    const nowMs = Date.parse("2026-07-12T06:00:00.000Z");

    try {
        const first = acquireLiveLock({
            lockPath,
            pid: 101,
            nowMs,
            nonce: "first",
            processExists: (pid) => pid === 101,
        });
        assert.throws(
            () =>
                acquireLiveLock({
                    lockPath,
                    pid: 202,
                    nowMs: nowMs + 60_000,
                    nonce: "second",
                    processExists: (pid) => pid === 101,
                }),
            /live_lock_active/,
        );

        writeFileSync(
            lockPath,
            JSON.stringify({ schemaVersion: 1, pid: 101, createdAtMs: nowMs, nonce: "first" }),
        );
        assert.throws(
            () =>
                acquireLiveLock({
                    lockPath,
                    pid: 202,
                    nowMs: nowMs + 60_000,
                    nonce: "second",
                    processExists: () => false,
                    staleAfterMs: 5 * 60_000,
                }),
            /live_lock_not_stale/,
        );

        writeFileSync(
            lockPath,
            JSON.stringify({ schemaVersion: 1, pid: 101, createdAtMs: nowMs, nonce: "first" }),
        );
        const replacement = acquireLiveLock({
            lockPath,
            pid: 202,
            nowMs: nowMs + 6 * 60_000,
            nonce: "second",
            processExists: () => false,
            staleAfterMs: 5 * 60_000,
        });
        assert.equal(JSON.parse(readFileSync(lockPath, "utf8")).pid, 202);
        assert.equal(existsSync(`${lockPath}.reap`), false);

        assert.equal(releaseLiveLock(first), false, "an old owner cannot release a replacement lock");
        assert.equal(releaseLiveLock(replacement), true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("a recovery lock prevents concurrent stale-lock reaping", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "clockify-live-lock-"));
    const lockPath = path.join(dir, "proof.lock");
    const nowMs = Date.parse("2026-07-12T06:00:00.000Z");
    writeFileSync(
        lockPath,
        JSON.stringify({ schemaVersion: 1, pid: 101, createdAtMs: nowMs - 600_000, nonce: "old" }),
    );
    writeFileSync(
        `${lockPath}.reap`,
        JSON.stringify({ schemaVersion: 1, pid: 303, createdAtMs: nowMs, nonce: "reaper" }),
    );

    try {
        assert.throws(
            () =>
                acquireLiveLock({
                    lockPath,
                    pid: 202,
                    nowMs,
                    nonce: "new",
                    processExists: () => false,
                }),
            /live_lock_reap_active/,
        );
        assert.equal(JSON.parse(readFileSync(lockPath, "utf8")).nonce, "old");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("malformed lock files fail closed and are never deleted", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "clockify-live-lock-"));
    const lockPath = path.join(dir, "proof.lock");
    writeFileSync(lockPath, "not-json");

    try {
        assert.throws(
            () =>
                acquireLiveLock({
                    lockPath,
                    pid: 202,
                    nowMs: Date.now(),
                    nonce: "second",
                    processExists: () => false,
                }),
            /live_lock_invalid/,
        );
        assert.equal(readFileSync(lockPath, "utf8"), "not-json");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("all four surfaces run after a failure and cleanup still runs exactly once", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "clockify-live-proof-"));
    const calls = [];
    const cleanupCalls = [];

    try {
        const receipt = await runLiveProof({
            expectedWorkspaceFingerprint: SAFE_FINGERPRINT,
            env: {
                ...SAFE_ENV,
                CLOCKIFY_ADDON_TOKEN: "ambient-addon-token",
                CLOCKIFY_ALLOW_CUSTOM_BASE_URL: "true",
                CLOCKIFY_HOME: "/unsafe/ambient/home",
                CLOCKIFY_CLEANUP_START: "2026-07-12T05:00:00.000Z",
                CLOCKIFY_CLEANUP_END: "2026-07-12T05:01:00.000Z",
            },
            rootDir: dir,
            lockPath: path.join(dir, "proof.lock"),
            now: new Date("2026-07-12T05:06:07.890Z"),
            randomBytes: () => Buffer.from("a1b2c3d4", "hex"),
            processExists: () => false,
            runSurface: async ({ name, env }) => {
                calls.push({
                    name,
                    prefix: env.CLOCKIFY_LIVE_PREFIX,
                    addonToken: env.CLOCKIFY_ADDON_TOKEN,
                    allowCustomBaseUrl: env.CLOCKIFY_ALLOW_CUSTOM_BASE_URL,
                    baseUrl: env.CLOCKIFY_BASE_URL,
                    clockifyHome: env.CLOCKIFY_HOME,
                });
                if (name === "wrapper") {
                    return { exitCode: 1, signal: null, durationMs: 12, output: "failed" };
                }
                return { exitCode: 0, signal: null, durationMs: 8, output: "passed" };
            },
            cleanup: async (options) => {
                cleanupCalls.push(options);
                return cleanCleanup(options.prefixes.length);
            },
            createCleanupContext: async () => ({ client: {}, userId: "user-id" }),
        });

        assert.deepEqual(
            calls.map(({ name }) => name),
            ["wrapper", "cli", "mcp", "goclmcp"],
        );
        assert.equal(new Set(calls.map(({ prefix }) => prefix)).size, 1);
        assert.ok(calls.every(({ addonToken }) => addonToken === ""));
        assert.ok(calls.every(({ allowCustomBaseUrl }) => allowCustomBaseUrl === ""));
        assert.ok(calls.every(({ baseUrl }) => baseUrl === ""));
        assert.equal(new Set(calls.map(({ clockifyHome }) => clockifyHome)).size, 1);
        assert.equal(existsSync(calls[0].clockifyHome), false);
        assert.equal(cleanupCalls.length, 1);
        assert.ok(cleanupCalls[0].prefixes.includes(calls[0].prefix));
        assert.equal(cleanupCalls[0].rangeStart, "2000-01-01T00:00:00.000Z");
        assert.equal(cleanupCalls[0].rangeEnd, "2100-01-01T00:00:00.000Z");
        assert.equal(receipt.surfaces.wrapper.status, "failed");
        assert.equal(receipt.surfaces.goclmcp.status, "passed");
        assert.equal(receipt.cleanup.status, "passed");
        assert.equal(receipt.leftovers, 0);
        assert.equal(receipt.ok, false);

        const serialized = JSON.stringify(receipt);
        assert.equal(serialized.includes(SAFE_ENV.CLOCKIFY_API_KEY), false);
        assert.equal(serialized.includes(SAFE_ENV.CLOCKIFY_WORKSPACE_ID), false);
        assert.equal(serialized.includes("user-id"), false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("only explicit 402/feature-unavailable markers can limit CLI or MCP", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "clockify-live-proof-"));
    try {
        const receipt = await runLiveProof({
            expectedWorkspaceFingerprint: SAFE_FINGERPRINT,
            env: SAFE_ENV,
            rootDir: dir,
            lockPath: path.join(dir, "proof.lock"),
            now: new Date("2026-07-12T05:06:07.890Z"),
            randomBytes: () => Buffer.from("a1b2c3d4", "hex"),
            processExists: () => false,
            runSurface: async ({ name }) => ({
                exitCode: name === "wrapper" ? 1 : 0,
                signal: null,
                durationMs: 1,
                output:
                    name === "cli"
                        ? "CLOCKIFY_LIVE_ENTITLEMENT:http_402"
                        : name === "mcp"
                          ? "CLOCKIFY_LIVE_ENTITLEMENT:feature_unavailable"
                          : name === "wrapper"
                            ? "403 forbidden"
                            : "passed",
            }),
            cleanup: async (options) => cleanCleanup(options.prefixes.length),
            createCleanupContext: async () => ({ client: {}, userId: "user-id" }),
        });

        assert.equal(receipt.surfaces.cli.status, "entitlement_limited");
        assert.equal(receipt.surfaces.mcp.status, "entitlement_limited");
        assert.equal(receipt.surfaces.wrapper.status, "failed");
        assert.equal(receipt.surfaces.goclmcp.status, "passed");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("cleanup actions are projected to count-only receipt fields", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "clockify-live-proof-"));
    const hiddenId = "0123456789abcdef01234567";
    try {
        const receipt = await runLiveProof({
            expectedWorkspaceFingerprint: SAFE_FINGERPRINT,
            env: SAFE_ENV,
            rootDir: dir,
            lockPath: path.join(dir, "proof.lock"),
            now: new Date("2026-07-12T05:06:07.890Z"),
            randomBytes: () => Buffer.from("a1b2c3d4", "hex"),
            processExists: () => false,
            runSurface: async () => ({ exitCode: 0, signal: null, durationMs: 1, output: "ok" }),
            cleanup: async (options) => {
                const result = cleanCleanup(options.prefixes.length);
                result.actions[0].rawId = hiddenId;
                return result;
            },
            createCleanupContext: async () => ({ client: {}, userId: "user-id" }),
        });

        assert.equal(receipt.ok, true);
        assert.equal(JSON.stringify(receipt).includes(hiddenId), false);
        assert.deepEqual(Object.keys(receipt.cleanup.actions[0]), [
            "entityType",
            "sanitizedIdCount",
            "deletedCount",
            "failedCount",
            "remainingCount",
            "complete",
        ]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("surface termination targets the detached process group", () => {
    const calls = [];
    const child = { pid: 321, kill: (signal) => calls.push(["child", signal]) };
    terminateProcessTree(child, "SIGTERM", {
        platform: "darwin",
        killProcess: (pid, signal) => calls.push([pid, signal]),
    });
    assert.deepEqual(calls, [[-321, "SIGTERM"]]);
});

test("incomplete cleanup retains every count row without exposing raw failure data", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "clockify-live-proof-"));
    try {
        const receipt = await runLiveProof({
            expectedWorkspaceFingerprint: SAFE_FINGERPRINT,
            env: SAFE_ENV,
            rootDir: dir,
            lockPath: path.join(dir, "proof.lock"),
            now: new Date("2026-07-12T05:06:07.890Z"),
            randomBytes: () => Buffer.from("a1b2c3d4", "hex"),
            processExists: () => false,
            runSurface: async () => ({ exitCode: 0, signal: null, durationMs: 1, output: "ok" }),
            cleanup: async (options) => {
                const actions = cleanActions();
                actions[0] = {
                    entityType: "time_entries",
                    sanitizedIdCount: 0,
                    deletedCount: 0,
                    failedCount: 1,
                    remainingCount: null,
                    complete: false,
                    rawError: "contains-sensitive-server-state",
                };
                return {
                    ok: false,
                    prefixCount: options.prefixes.length,
                    actions,
                    leftovers: null,
                };
            },
            createCleanupContext: async () => ({ client: {}, userId: "user-id" }),
        });

        assert.equal(receipt.ok, false);
        assert.equal(receipt.cleanup.status, "failed");
        assert.equal(receipt.cleanup.actions.length, CLEANUP_ENTITY_ORDER.length);
        assert.deepEqual(receipt.cleanup.actions[0], {
            entityType: "time_entries",
            sanitizedIdCount: 0,
            deletedCount: 0,
            failedCount: 1,
            remainingCount: null,
            complete: false,
        });
        assert.equal(JSON.stringify(receipt).includes("sensitive-server-state"), false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("an already-aborted proof dispatches no surface and still cleans up", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "clockify-live-proof-"));
    const controller = new AbortController();
    controller.abort(new Error("operator interrupted"));
    let dispatches = 0;
    let cleanups = 0;
    try {
        const receipt = await runLiveProof({
            expectedWorkspaceFingerprint: SAFE_FINGERPRINT,
            env: SAFE_ENV,
            rootDir: dir,
            lockPath: path.join(dir, "proof.lock"),
            now: new Date("2026-07-12T05:06:07.890Z"),
            randomBytes: () => Buffer.from("a1b2c3d4", "hex"),
            processExists: () => false,
            signal: controller.signal,
            runSurface: async () => {
                dispatches += 1;
                return { exitCode: 0, signal: null, durationMs: 1, output: "unexpected" };
            },
            cleanup: async (options) => {
                cleanups += 1;
                return cleanCleanup(options.prefixes.length);
            },
            createCleanupContext: async () => ({ client: {}, userId: "user-id" }),
        });

        assert.equal(dispatches, 0);
        assert.equal(cleanups, 1);
        assert.equal(receipt.ok, false);
        assert.ok(Object.values(receipt.surfaces).every((surface) => surface.signal === "ABORTED"));
        assert.equal(receipt.cleanup.status, "passed");
        assert.equal(receipt.lock.released, true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
