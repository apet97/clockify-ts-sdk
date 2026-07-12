import { spawn } from "node:child_process";
import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import {
    closeSync,
    constants,
    existsSync,
    mkdtempSync,
    openSync,
    readFileSync,
    rmSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { CLEANUP_ENTITY_ORDER } from "./cleanup.mjs";

export const LIVE_LOCK_PATH = "/tmp/clockify115-live.lock";
export const LIVE_LOCK_STALE_AFTER_MS = 15 * 60 * 1_000;
export const LIVE_CLEANUP_RANGE_START = "2000-01-01T00:00:00.000Z";
export const LIVE_CLEANUP_RANGE_END = "2100-01-01T00:00:00.000Z";

export const GOVERNED_LEGACY_PREFIXES = Object.freeze([
    "clockify115-live-",
    "sdk-test-",
    "mcp-sandbox-",
    "mcp-workflow-",
    "mcp-log-",
    "mcp-fix-",
    "DEMO-",
]);

const LIVE_ENTITLEMENT_MARKERS = Object.freeze([
    "CLOCKIFY_LIVE_ENTITLEMENT:http_402",
    "CLOCKIFY_LIVE_ENTITLEMENT:feature_unavailable",
]);
const CLOCKIFY_ID = /^[0-9a-fA-F]{24}$/;

const SURFACES = Object.freeze([
    {
        name: "wrapper",
        command: "npm",
        args: ["test", "-w", "clockify-sdk-ts-115", "--", "tests/sandbox.test.ts"],
    },
    {
        name: "cli",
        command: "npm",
        args: ["test", "-w", "@apet97/clockify-cli-115", "--", "tests/sandbox.test.ts"],
    },
    {
        name: "mcp",
        command: "npm",
        args: ["test", "-w", "@apet97/clockify-mcp-115", "--", "tests/sandbox.test.ts"],
    },
    {
        name: "goclmcp",
        command: "make",
        args: ["live-contract-local"],
        sibling: true,
    },
]);

class LiveProofError extends Error {
    constructor(code) {
        super(code);
        this.name = "LiveProofError";
        this.code = code;
    }
}

function trimmed(value) {
    return typeof value === "string" ? value.trim() : "";
}

function pinnedWorkspaceFingerprint() {
    let manifest;
    try {
        manifest = JSON.parse(
            readFileSync(new URL("../../docs/live-sandbox-fingerprint.json", import.meta.url), "utf8"),
        );
    } catch {
        throw new LiveProofError("live_fingerprint_invalid");
    }
    if (
        manifest?.schemaVersion !== 1 ||
        manifest?.algorithm !== "sha256" ||
        typeof manifest?.workspaceIdSha256 !== "string" ||
        !/^[0-9a-f]{64}$/.test(manifest.workspaceIdSha256)
    ) {
        throw new LiveProofError("live_fingerprint_invalid");
    }
    return manifest.workspaceIdSha256;
}

export function validateLiveEnvironment(
    env,
    { expectedWorkspaceFingerprint = pinnedWorkspaceFingerprint() } = {},
) {
    const apiKey = trimmed(env?.CLOCKIFY_API_KEY);
    const workspaceId = trimmed(env?.CLOCKIFY_WORKSPACE_ID);
    const workspaceConfirm = trimmed(env?.CLOCKIFY_LIVE_WORKSPACE_CONFIRM);

    if (!apiKey || !workspaceId || !workspaceConfirm) {
        throw new LiveProofError("live_configuration_invalid");
    }
    if (!CLOCKIFY_ID.test(workspaceId)) {
        throw new LiveProofError("live_workspace_invalid");
    }
    if (workspaceConfirm !== workspaceId) {
        throw new LiveProofError("live_workspace_unconfirmed");
    }
    if (trimmed(env?.CLOCKIFY_BASE_URL)) {
        throw new LiveProofError("live_base_url_override_forbidden");
    }
    if (!/^[0-9a-f]{64}$/.test(expectedWorkspaceFingerprint)) {
        throw new LiveProofError("live_fingerprint_invalid");
    }
    const actualWorkspaceFingerprint = createHash("sha256").update(workspaceId).digest("hex");
    if (actualWorkspaceFingerprint !== expectedWorkspaceFingerprint) {
        throw new LiveProofError("live_workspace_not_sacrificial");
    }

    return { apiKey, workspaceId };
}

export function createLivePrefix({ now = new Date(), randomBytes = nodeRandomBytes } = {}) {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new LiveProofError("live_clock_invalid");
    }
    const random = randomBytes(4);
    if (!Buffer.isBuffer(random) || random.length < 4) {
        throw new LiveProofError("live_random_invalid");
    }
    const stamp = now.toISOString().replaceAll("-", "").replaceAll(":", "").replace(".", "");
    return `clockify115-live-${stamp}-${random.subarray(0, 4).toString("hex")}-`;
}

function defaultProcessExists(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error?.code !== "ESRCH";
    }
}

function parseLock(lockPath) {
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(lockPath, "utf8"));
    } catch {
        throw new LiveProofError("live_lock_invalid");
    }
    if (
        parsed?.schemaVersion !== 1 ||
        !Number.isSafeInteger(parsed.pid) ||
        parsed.pid <= 0 ||
        !Number.isFinite(parsed.createdAtMs) ||
        typeof parsed.nonce !== "string" ||
        parsed.nonce.length < 1
    ) {
        throw new LiveProofError("live_lock_invalid");
    }
    return parsed;
}

function createLockFile(lockPath, record) {
    const descriptor = openSync(
        lockPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
    );
    try {
        writeFileSync(descriptor, `${JSON.stringify(record)}\n`, "utf8");
    } finally {
        closeSync(descriptor);
    }
}

export function acquireLiveLock({
    lockPath = LIVE_LOCK_PATH,
    pid = process.pid,
    nowMs = Date.now(),
    nonce = nodeRandomBytes(16).toString("hex"),
    processExists = defaultProcessExists,
    staleAfterMs = LIVE_LOCK_STALE_AFTER_MS,
} = {}) {
    const record = { schemaVersion: 1, pid, createdAtMs: nowMs, nonce };
    const recoveryPath = `${lockPath}.reap`;
    if (existsSync(recoveryPath)) {
        throw new LiveProofError("live_lock_reap_active");
    }
    try {
        createLockFile(lockPath, record);
        return { lockPath, ...record };
    } catch (error) {
        if (error?.code !== "EEXIST") throw error;
    }

    const existing = parseLock(lockPath);
    if (processExists(existing.pid)) {
        throw new LiveProofError("live_lock_active");
    }
    if (nowMs - existing.createdAtMs < staleAfterMs) {
        throw new LiveProofError("live_lock_not_stale");
    }

    const recovery = {
        schemaVersion: 1,
        pid,
        createdAtMs: nowMs,
        nonce: `${nonce}-reap`,
    };
    try {
        createLockFile(recoveryPath, recovery);
    } catch (error) {
        if (error?.code === "EEXIST") throw new LiveProofError("live_lock_reap_active");
        throw error;
    }

    try {
        // The recovery lock excludes every cooperating acquirer while the
        // stale record is revalidated and replaced. A changed, active, or fresh
        // record is never deleted.
        const current = parseLock(lockPath);
        if (
            current.pid !== existing.pid ||
            current.createdAtMs !== existing.createdAtMs ||
            current.nonce !== existing.nonce
        ) {
            throw new LiveProofError("live_lock_changed");
        }
        if (processExists(current.pid)) throw new LiveProofError("live_lock_active");
        if (nowMs - current.createdAtMs < staleAfterMs) {
            throw new LiveProofError("live_lock_not_stale");
        }
        unlinkSync(lockPath);
        try {
            createLockFile(lockPath, record);
        } catch (error) {
            if (error?.code === "EEXIST") throw new LiveProofError("live_lock_raced");
            throw error;
        }
        return { lockPath, ...record };
    } finally {
        releaseLiveLock({ lockPath: recoveryPath, ...recovery });
    }
}

export function releaseLiveLock(handle) {
    let current;
    try {
        current = parseLock(handle.lockPath);
    } catch (error) {
        if (error?.code === "ENOENT") return false;
        return false;
    }
    if (current.pid !== handle.pid || current.nonce !== handle.nonce) return false;
    try {
        unlinkSync(handle.lockPath);
        return true;
    } catch {
        return false;
    }
}

function secretSafeOutput(output, secrets) {
    let safe = typeof output === "string" ? output : String(output ?? "");
    for (const secret of secrets) {
        if (secret) safe = safe.replaceAll(secret, "[REDACTED]");
    }
    return safe;
}

function outputHash(output, secrets) {
    return createHash("sha256").update(secretSafeOutput(output, secrets)).digest("hex");
}

function normalizeSurfaceResult(name, result, secrets) {
    const output = typeof result?.output === "string" ? result.output : "";
    const entitlementLimited =
        (name === "cli" || name === "mcp") &&
        result?.exitCode === 0 &&
        LIVE_ENTITLEMENT_MARKERS.some((marker) => output.includes(marker));
    const status = entitlementLimited
        ? "entitlement_limited"
        : result?.exitCode === 0
          ? "passed"
          : "failed";

    return {
        status,
        durationMs:
            Number.isFinite(result?.durationMs) && result.durationMs >= 0
                ? Math.round(result.durationMs)
                : 0,
        outputSha256: outputHash(output, secrets),
        ...(status === "failed"
            ? {
                  exitCode: Number.isInteger(result?.exitCode) ? result.exitCode : null,
                  signal: typeof result?.signal === "string" ? result.signal : null,
              }
            : {}),
        ...(entitlementLimited
            ? {
                  limitation: output.includes("CLOCKIFY_LIVE_ENTITLEMENT:http_402")
                      ? "http_402"
                      : "feature_unavailable",
              }
            : {}),
    };
}

function appendOutput(current, chunk, maxBytes = 2 * 1024 * 1024) {
    const combined = `${current}${chunk}`;
    if (Buffer.byteLength(combined) <= maxBytes) return combined;
    return combined.slice(-maxBytes);
}

export function terminateProcessTree(
    child,
    signal,
    { platform = process.platform, killProcess = process.kill } = {},
) {
    if (!Number.isSafeInteger(child?.pid) || child.pid <= 0) return false;
    if (platform !== "win32") {
        try {
            killProcess(-child.pid, signal);
            return true;
        } catch {
            // Fall back to the immediate process if its group already vanished
            // or the platform rejected negative-PID signalling.
        }
    }
    try {
        return child.kill(signal);
    } catch {
        return false;
    }
}

export async function runSurfaceCommand({
    command,
    args,
    cwd,
    env,
    timeoutMs = 15 * 60_000,
    terminationGraceMs = 5_000,
    signal,
}) {
    const startedAt = Date.now();
    if (signal?.aborted) {
        return {
            exitCode: null,
            signal: "ABORTED",
            durationMs: 0,
            output: "runner_aborted_before_dispatch",
        };
    }
    return await new Promise((resolve) => {
        let output = "";
        let settled = false;
        let terminationReason;
        let forceTimer;
        let forceFallbackTimer;
        const child = spawn(command, args, {
            cwd,
            env,
            stdio: ["ignore", "pipe", "pipe"],
            detached: process.platform !== "win32",
        });
        child.stdout?.setEncoding("utf8");
        child.stderr?.setEncoding("utf8");
        child.stdout?.on("data", (chunk) => {
            output = appendOutput(output, chunk);
        });
        child.stderr?.on("data", (chunk) => {
            output = appendOutput(output, chunk);
        });

        const beginTermination = (reason) => {
            if (settled || terminationReason !== undefined) return;
            terminationReason = reason;
            terminateProcessTree(child, "SIGTERM");
            forceTimer = setTimeout(() => {
                terminateProcessTree(child, "SIGKILL");
                forceFallbackTimer = setTimeout(
                    () => finish(null, reason, "runner_force_kill_unconfirmed"),
                    terminationGraceMs,
                );
                forceFallbackTimer.unref();
            }, terminationGraceMs);
            forceTimer.unref();
        };

        const timer = setTimeout(() => beginTermination("TIMEOUT"), timeoutMs);
        timer.unref();
        const abortHandler = () => beginTermination("ABORTED");
        signal?.addEventListener("abort", abortHandler, { once: true });
        if (signal?.aborted) beginTermination("ABORTED");

        const finish = (exitCode, closeSignal, extra = "") => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            clearTimeout(forceTimer);
            clearTimeout(forceFallbackTimer);
            signal?.removeEventListener?.("abort", abortHandler);
            resolve({
                exitCode: terminationReason === undefined ? exitCode : null,
                signal: terminationReason ?? closeSignal,
                durationMs: Date.now() - startedAt,
                output: appendOutput(output, extra),
            });
        };
        child.once("error", (error) => finish(null, null, `runner_error:${error?.code ?? "unknown"}`));
        child.once("close", (code, signal) => finish(code, signal));
    });
}

async function defaultCleanupContext({ rootDir, apiKey }) {
    const moduleUrl = pathToFileURL(path.join(rootDir, "wrapper/dist/esm/create-client.js")).href;
    const { createClockifyClient } = await import(moduleUrl);
    const client = createClockifyClient({ apiKey });
    const user = await client.users.getCurrentUser();
    const userId = trimmed(user?.id ?? user?._id);
    if (!userId) throw new LiveProofError("live_current_user_unavailable");
    return { client, userId };
}

async function defaultCleanup(options) {
    const { cleanupLivePrefixes } = await import("./cleanup.mjs");
    return await cleanupLivePrefixes(options);
}

function nonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

function invalidCleanupReceipt() {
    return {
        status: "failed",
        prefixCount: null,
        actions: [],
        leftovers: null,
        error: "cleanup_receipt_invalid",
    };
}

function normalizeCleanup(result, expectedPrefixCount) {
    if (
        result == null ||
        typeof result !== "object" ||
        !Array.isArray(result.actions) ||
        result.actions.length !== CLEANUP_ENTITY_ORDER.length ||
        result.prefixCount !== expectedPrefixCount
    ) {
        return invalidCleanupReceipt();
    }

    const actions = [];
    for (const [index, raw] of result.actions.entries()) {
        if (
            raw == null ||
            typeof raw !== "object" ||
            raw.entityType !== CLEANUP_ENTITY_ORDER[index] ||
            !nonNegativeInteger(raw.sanitizedIdCount) ||
            !nonNegativeInteger(raw.deletedCount) ||
            !nonNegativeInteger(raw.failedCount) ||
            typeof raw.complete !== "boolean" ||
            (raw.complete ? !nonNegativeInteger(raw.remainingCount) : raw.remainingCount !== null) ||
            (raw.complete && raw.deletedCount + raw.failedCount !== raw.sanitizedIdCount)
        ) {
            return invalidCleanupReceipt();
        }
        actions.push({
            entityType: raw.entityType,
            sanitizedIdCount: raw.sanitizedIdCount,
            deletedCount: raw.deletedCount,
            failedCount: raw.failedCount,
            remainingCount: raw.remainingCount,
            complete: raw.complete,
        });
    }

    const complete = actions.every((action) => action.complete);
    const computedLeftovers = complete
        ? actions.reduce((sum, action) => sum + action.remainingCount, 0)
        : null;
    if (result.leftovers !== computedLeftovers) return invalidCleanupReceipt();

    const passed =
        result.ok === true &&
        complete &&
        computedLeftovers === 0 &&
        actions.every((action) => action.failedCount === 0);
    return {
        status: passed ? "passed" : "failed",
        prefixCount: expectedPrefixCount,
        actions,
        leftovers: computedLeftovers,
    };
}

export async function runLiveProof({
    env = process.env,
    rootDir = process.cwd(),
    lockPath = LIVE_LOCK_PATH,
    now = new Date(),
    randomBytes = nodeRandomBytes,
    processExists = defaultProcessExists,
    runSurface = runSurfaceCommand,
    cleanup = defaultCleanup,
    createCleanupContext = defaultCleanupContext,
    signal,
    expectedWorkspaceFingerprint,
} = {}) {
    const { apiKey, workspaceId } = validateLiveEnvironment(env, {
        ...(expectedWorkspaceFingerprint !== undefined ? { expectedWorkspaceFingerprint } : {}),
    });
    const prefix = createLivePrefix({ now, randomBytes });
    const runId = createHash("sha256").update(prefix).digest("hex").slice(0, 16);
    const lock = acquireLiveLock({
        lockPath,
        nowMs: now.getTime(),
        processExists,
    });
    const secrets = [apiKey, workspaceId];
    const surfaces = {};
    let cleanupReceipt = {
        status: "failed",
        prefixCount: null,
        actions: [],
        leftovers: null,
        error: "cleanup_not_run",
    };
    let lockReleased = false;
    let isolatedHome;
    let isolationReleased = false;

    try {
        isolatedHome = mkdtempSync(path.join(tmpdir(), "clockify115-live-home-"));
        const surfaceEnv = {
            ...env,
            CLOCKIFY_API_KEY: apiKey,
            CLOCKIFY_ADDON_TOKEN: "",
            CLOCKIFY_WORKSPACE_ID: workspaceId,
            CLOCKIFY_BASE_URL: "",
            CLOCKIFY_ALLOW_CUSTOM_BASE_URL: "",
            CLOCKIFY_HOME: isolatedHome,
            CLOCKIFY_LIVE_WORKSPACE_CONFIRM: workspaceId,
            CLOCKIFY_LIVE_PREFIX: prefix,
            CLOCKIFY_RUN_LIVE_E2E: "1",
            // The root proof runs GOCLMCP's stable core. Optional/admin campaigns
            // remain explicit operator actions and must never leak in from a shell.
            CLOCKIFY_LIVE_OPTIONAL_DOMAINS: "",
            CLOCKIFY_LIVE_HIGH_RISK_WORKFLOWS: "",
            CLOCKIFY_LIVE_HAPPY_PATH_CAMPAIGNS: "",
        };
        for (const surface of SURFACES) {
            let result;
            if (signal?.aborted) {
                result = {
                    exitCode: null,
                    signal: "ABORTED",
                    durationMs: 0,
                    output: "runner_aborted_before_dispatch",
                };
            } else {
                try {
                    result = await runSurface({
                        ...surface,
                        cwd: surface.sibling ? path.resolve(rootDir, "../GOCLMCP") : rootDir,
                        env: surfaceEnv,
                        signal,
                    });
                } catch (error) {
                    result = {
                        exitCode: null,
                        signal: null,
                        durationMs: 0,
                        output: `runner_exception:${error?.code ?? "unknown"}`,
                    };
                }
            }
            surfaces[surface.name] = normalizeSurfaceResult(surface.name, result, secrets);
        }
    } finally {
        let context;
        try {
            context = await createCleanupContext({ rootDir, apiKey, workspaceId });
            const cleanupResult = await cleanup({
                client: context.client,
                workspaceId,
                userId: context.userId,
                prefixes: [prefix, ...GOVERNED_LEGACY_PREFIXES],
                // Release proof is exhaustive and cannot be narrowed by ambient
                // shell state. The library remains injectable for focused tests.
                rangeStart: LIVE_CLEANUP_RANGE_START,
                rangeEnd: LIVE_CLEANUP_RANGE_END,
            });
            cleanupReceipt = normalizeCleanup(cleanupResult, 1 + GOVERNED_LEGACY_PREFIXES.length);
        } catch {
            cleanupReceipt = {
                status: "failed",
                prefixCount: null,
                actions: [],
                leftovers: null,
                error: "cleanup_failed",
            };
        } finally {
            try {
                await context?.dispose?.();
            } catch {
                cleanupReceipt = { ...cleanupReceipt, status: "failed", error: "cleanup_dispose_failed" };
            }
            if (isolatedHome !== undefined) {
                try {
                    rmSync(isolatedHome, { recursive: true, force: true });
                    isolationReleased = true;
                } catch {
                    isolationReleased = false;
                }
            }
            lockReleased = releaseLiveLock(lock);
        }
    }

    const surfacesPassed = SURFACES.every(
        ({ name }) =>
            surfaces[name]?.status === "passed" || surfaces[name]?.status === "entitlement_limited",
    );
    const leftovers = cleanupReceipt.leftovers;
    const ok =
        surfacesPassed &&
        cleanupReceipt.status === "passed" &&
        leftovers === 0 &&
        isolationReleased &&
        lockReleased;

    return {
        schemaVersion: 1,
        runId,
        startedAt: now.toISOString(),
        ok,
        surfaces,
        cleanup: cleanupReceipt,
        leftovers,
        isolation: { released: isolationReleased },
        lock: { released: lockReleased },
    };
}

export function errorCode(error) {
    return typeof error?.code === "string" && error.code.startsWith("live_")
        ? error.code
        : "live_orchestrator_failed";
}
