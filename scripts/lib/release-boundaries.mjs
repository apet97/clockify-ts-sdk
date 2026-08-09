import { spawnSync } from "node:child_process";

import {
    ReleaseStateError,
    readState,
    updateStateFile,
} from "./release-state.mjs";

const INTEGRITY = /^sha512-[A-Za-z0-9+/]+=*$/;
const NOT_FOUND = /\bE404\b|\b404\b|not found/i;

function safeText(value) {
    if (value === undefined || value === null) return "";
    return String(value)
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(
            /((?:token|password|secret|authorization|_authToken)\s*[=:]\s*)[^\s]+/gi,
            "$1[redacted]",
        )
        .slice(0, 2_000);
}

export function commandDiagnostics(result) {
    return {
        status: Number.isInteger(result?.status) ? result.status : null,
        signal: typeof result?.signal === "string" ? result.signal : null,
        stdout: safeText(result?.stdout),
        stderr: safeText(result?.stderr),
        error: result?.error === undefined ? null : safeText(result.error?.message ?? result.error),
    };
}

export function runNpm(args, { cwd = process.cwd() } = {}) {
    const result = spawnSync("npm", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 64 * 1024 * 1024,
    });
    return {
        status: result.status,
        signal: result.signal,
        error: result.error,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
    };
}

export function classifyRegistryIntegrity(result) {
    const diagnostics = commandDiagnostics(result);
    if (diagnostics.error !== null || diagnostics.signal !== null || diagnostics.status === null) {
        return { kind: "query_error", diagnostics };
    }
    if (diagnostics.status === 0) {
        const integrity = String(result.stdout ?? "").trim();
        if (integrity === "") return { kind: "empty", diagnostics };
        if (!INTEGRITY.test(integrity)) return { kind: "malformed", diagnostics, integrity };
        return { kind: "present", diagnostics, integrity };
    }
    if (NOT_FOUND.test(`${result.stdout ?? ""}\n${result.stderr ?? ""}`)) {
        return { kind: "not_found", diagnostics };
    }
    return { kind: "query_error", diagnostics };
}

export function classifyAttestation(result) {
    const diagnostics = commandDiagnostics(result);
    if (diagnostics.error !== null || diagnostics.signal !== null || diagnostics.status !== 0) {
        return { kind: "query_error", diagnostics };
    }
    const stdout = String(result.stdout ?? "").trim();
    if (stdout === "") return { kind: "malformed", diagnostics };
    let value;
    try {
        value = JSON.parse(stdout);
    } catch {
        return { kind: "malformed", diagnostics };
    }
    if (value === null || (Array.isArray(value) && value.length === 0)) {
        return { kind: "absent", diagnostics };
    }
    if (typeof value === "object" && Object.keys(value).length === 0) {
        return { kind: "absent", diagnostics };
    }
    if (typeof value === "object") return { kind: "present", diagnostics };
    return { kind: "malformed", diagnostics };
}

export class ReleaseBoundaryError extends Error {
    constructor(message, { code = "release_boundary_error", diagnostics = null } = {}) {
        super(message);
        this.name = "ReleaseBoundaryError";
        this.code = code;
        this.diagnostics = diagnostics;
    }
}

function persistFailure(filePath, { clock } = {}) {
    try {
        return updateStateFile(filePath, "fail", {}, { clock });
    } catch (error) {
        if (error instanceof ReleaseStateError && error.nextState) return error.nextState;
        throw error;
    }
}

function failWithReceipt(filePath, message, code, diagnostics, options) {
    persistFailure(filePath, options);
    throw new ReleaseBoundaryError(message, { code, diagnostics });
}

function registryQueryArgs(packageName, version) {
    return ["view", `${packageName}@${version}`, "dist.integrity"];
}

/**
 * Block the thread for `milliseconds`. The publish path is synchronous
 * (`spawnSync` throughout), so the propagation backoff cannot await.
 *
 * This is the DEFAULT deliberately: it used to be `() => {}`, which every test
 * overrides and production therefore inherited. The eight propagation attempts
 * ran back to back with no delay — the whole step took ~9s — so every release
 * since 1.0.0 failed `registry_propagation_timeout` after a successful publish
 * and skipped the provenance check, SBOM, and GitHub release that follow it.
 * Tests still inject their own recorder; only production gets the real wait.
 */
function sleepSync(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export function publishRelease(
    { filePath, packageName, version, tarball, localIntegrity },
    {
        run = runNpm,
        sleep = sleepSync,
        clock,
        maxAttempts = 8,
        delayMs = 2_000,
    } = {},
) {
    const state = readState(filePath);
    if (state.localArtifact.integrity !== localIntegrity) {
        throw new ReleaseBoundaryError("local integrity does not match the release receipt artifact", {
            code: "local_integrity_mismatch",
        });
    }
    if (!INTEGRITY.test(localIntegrity)) {
        throw new ReleaseBoundaryError("local integrity must be a sha512 npm integrity value", {
            code: "invalid_local_integrity",
        });
    }

    const initial = classifyRegistryIntegrity(run(registryQueryArgs(packageName, version)));
    if (initial.kind === "present") {
        return updateStateFile(
            filePath,
            "publish",
            { mode: "already_present_matching", remoteIntegrity: initial.integrity },
            { clock },
        );
    }
    if (initial.kind === "malformed" || initial.kind === "empty") {
        return failWithReceipt(
            filePath,
            "npm registry returned an empty or malformed dist.integrity value",
            "registry_integrity_invalid",
            initial.diagnostics,
            { clock },
        );
    }
    if (initial.kind !== "not_found") {
        return failWithReceipt(
            filePath,
            "npm registry integrity query failed before publication",
            "registry_query_failed",
            initial.diagnostics,
            { clock },
        );
    }

    const published = run(["publish", tarball, "--access", "public", "--provenance"]);
    if (published.error !== undefined || published.signal !== null || published.status !== 0) {
        return failWithReceipt(
            filePath,
            "npm publish did not complete successfully",
            "publish_command_failed",
            commandDiagnostics(published),
            { clock },
        );
    }

    // This is deliberately the first state write after npm publish returns 0.
    updateStateFile(filePath, "publish-command-succeeded", {}, { clock });

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const polled = classifyRegistryIntegrity(run(registryQueryArgs(packageName, version)));
        if (polled.kind === "present") {
            // The integrity comparison is NOT skipped here: the state
            // engine's "publish" transition (scripts/lib/release-state.mjs)
            // compares remoteIntegrity to the receipt's local artifact and
            // fails terminal (mode "mismatch", finalStatus
            // "integrity_mismatch") on any disagreement — pinned by the
            // "registry serves a different artifact" tests. A local branch on
            // the same predicate was byte-identical in both arms (REL-3) and
            // only obscured where the real comparison lives.
            return updateStateFile(
                filePath,
                "publish",
                { mode: "published_now", remoteIntegrity: polled.integrity },
                { clock },
            );
        }
        if (polled.kind === "not_found" && attempt < maxAttempts) {
            sleep(delayMs * attempt);
            continue;
        }
        if (polled.kind === "not_found") {
            return failWithReceipt(
                filePath,
                "npm publish succeeded but registry propagation timed out; publication remains pending and must not be retried blindly",
                "registry_propagation_timeout",
                polled.diagnostics,
                { clock },
            );
        }
        return failWithReceipt(
            filePath,
            "npm registry integrity query failed after publication; publication remains pending",
            polled.kind === "empty" || polled.kind === "malformed" ? "registry_integrity_invalid" : "registry_query_failed",
            polled.diagnostics,
            { clock },
        );
    }
    return failWithReceipt(
        filePath,
        "npm publish registry verification did not complete",
        "registry_propagation_timeout",
        null,
        { clock },
    );
}

export function verifyAttestation(
    { filePath, packageName, version },
    { run = runNpm, clock } = {},
) {
    const result = run(["view", `${packageName}@${version}`, "dist.attestations", "--json"]);
    const outcome = classifyAttestation(result);
    if (outcome.kind === "query_error" || outcome.kind === "malformed") {
        return failWithReceipt(
            filePath,
            "npm provenance attestation query failed or returned malformed JSON",
            outcome.kind === "malformed" ? "attestation_malformed" : "attestation_query_failed",
            outcome.diagnostics,
            { clock },
        );
    }
    return updateStateFile(
        filePath,
        "attestation",
        { status: outcome.kind === "present" ? "present" : "absent" },
        { clock },
    );
}
