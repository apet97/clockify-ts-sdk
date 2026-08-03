import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const RELEASE_STATE_SCHEMA_VERSION = 1;
export const RELEASE_STATE_REPOSITORY = "apet97/clockify-ts-sdk";

export const PUBLICATION_MODES = Object.freeze([
    "proof_only",
    "published_now",
    "already_present_matching",
    "not_attempted",
    "failed",
    "mismatch",
]);

export const REGISTRY_SMOKE_STATES = Object.freeze(["not_run", "passed", "failed"]);
export const ATTESTATION_STATES = Object.freeze(["not_checked", "present", "absent"]);
export const GITHUB_RELEASE_STATES = Object.freeze(["not_checked", "present", "absent"]);
export const FINAL_STATUSES = Object.freeze([
    "proof_only",
    "built",
    "published_unverified",
    "verified",
    "failed",
    "integrity_mismatch",
]);

const TOP_LEVEL_KEYS = Object.freeze([
    "schemaVersion",
    "repository",
    "workflow",
    "runId",
    "runAttempt",
    "eventName",
    "refName",
    "sourceSha",
    "packageName",
    "version",
    "localArtifact",
    "publication",
    "verification",
    "timestamps",
    "finalStatus",
]);
const LOCAL_ARTIFACT_KEYS = Object.freeze(["path", "integrity"]);
const PUBLICATION_KEYS = Object.freeze(["mode", "remoteIntegrity"]);
const VERIFICATION_KEYS = Object.freeze(["registrySmoke", "attestation", "githubRelease"]);
const TIMESTAMP_KEYS = Object.freeze(["createdAt", "updatedAt"]);
const IMMUTABLE_FIELDS = Object.freeze([
    "repository",
    "workflow",
    "runId",
    "runAttempt",
    "eventName",
    "refName",
    "sourceSha",
    "packageName",
    "version",
]);
const PACKAGE_TAG = /^(?:wrapper|cli|mcp)-v[^\s/]+$/;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]+=*$/;

export class ReleaseStateError extends Error {
    constructor(message, { code = "release_state_error", exitCode = 1, nextState } = {}) {
        super(message);
        this.name = "ReleaseStateError";
        this.code = code;
        this.exitCode = exitCode;
        this.nextState = nextState;
    }
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function exactKeys(label, value, expected) {
    if (!isPlainObject(value)) {
        throw new ReleaseStateError(`${label} must be an object`, { code: "schema_mismatch", exitCode: 2 });
    }
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
        throw new ReleaseStateError(`${label} has unexpected or missing keys`, { code: "schema_mismatch", exitCode: 2 });
    }
}

function stringField(label, value) {
    if (typeof value !== "string") {
        throw new ReleaseStateError(`${label} must be a string`, { code: "schema_mismatch", exitCode: 2 });
    }
}

function enumField(label, value, allowed) {
    stringField(label, value);
    if (!allowed.includes(value)) {
        throw new ReleaseStateError(`${label} has unsupported value ${JSON.stringify(value)}`, {
            code: "schema_mismatch",
            exitCode: 2,
        });
    }
}

function integrityField(label, value) {
    stringField(label, value);
    if (value !== "" && !INTEGRITY.test(value)) {
        throw new ReleaseStateError(`${label} must be an npm sha512 integrity value or empty`, {
            code: "schema_mismatch",
            exitCode: 2,
        });
    }
}

function timestampField(label, value) {
    stringField(label, value);
    if (value !== "" && Number.isNaN(Date.parse(value))) {
        throw new ReleaseStateError(`${label} must be an ISO timestamp or empty`, {
            code: "schema_mismatch",
            exitCode: 2,
        });
    }
}

export function validateState(state) {
    exactKeys("receipt", state, TOP_LEVEL_KEYS);
    if (state.schemaVersion !== RELEASE_STATE_SCHEMA_VERSION) {
        throw new ReleaseStateError(`unsupported release receipt schema ${state.schemaVersion}`, {
            code: "schema_mismatch",
            exitCode: 2,
        });
    }
    for (const field of ["repository", "workflow", "runId", "runAttempt", "eventName", "refName", "sourceSha", "packageName", "version"]) {
        stringField(`receipt.${field}`, state[field]);
    }
    if (state.repository !== "" && state.repository !== RELEASE_STATE_REPOSITORY) {
        throw new ReleaseStateError(`receipt.repository must be ${RELEASE_STATE_REPOSITORY}`, {
            code: "schema_mismatch",
            exitCode: 2,
        });
    }

    exactKeys("receipt.localArtifact", state.localArtifact, LOCAL_ARTIFACT_KEYS);
    stringField("receipt.localArtifact.path", state.localArtifact.path);
    integrityField("receipt.localArtifact.integrity", state.localArtifact.integrity);

    exactKeys("receipt.publication", state.publication, PUBLICATION_KEYS);
    enumField("receipt.publication.mode", state.publication.mode, PUBLICATION_MODES);
    integrityField("receipt.publication.remoteIntegrity", state.publication.remoteIntegrity);

    exactKeys("receipt.verification", state.verification, VERIFICATION_KEYS);
    enumField("receipt.verification.registrySmoke", state.verification.registrySmoke, REGISTRY_SMOKE_STATES);
    enumField("receipt.verification.attestation", state.verification.attestation, ATTESTATION_STATES);
    enumField("receipt.verification.githubRelease", state.verification.githubRelease, GITHUB_RELEASE_STATES);

    exactKeys("receipt.timestamps", state.timestamps, TIMESTAMP_KEYS);
    timestampField("receipt.timestamps.createdAt", state.timestamps.createdAt);
    timestampField("receipt.timestamps.updatedAt", state.timestamps.updatedAt);
    enumField("receipt.finalStatus", state.finalStatus, FINAL_STATUSES);

    const published = state.publication.mode === "published_now" || state.publication.mode === "already_present_matching";
    if (published) {
        if (!state.localArtifact.integrity || !state.publication.remoteIntegrity || state.localArtifact.integrity !== state.publication.remoteIntegrity) {
            throw new ReleaseStateError("published receipt must contain equal local and remote integrity values", {
                code: "integrity_mismatch",
                exitCode: 2,
            });
        }
        if (state.eventName !== "push" || !PACKAGE_TAG.test(state.refName)) {
            throw new ReleaseStateError("published receipt must identify a pushed package tag", {
                code: "publish_not_tag_only",
                exitCode: 2,
            });
        }
    }
    if (state.publication.mode === "proof_only" && state.publication.remoteIntegrity !== "") {
        throw new ReleaseStateError("proof_only receipt cannot contain a remote integrity", {
            code: "schema_mismatch",
            exitCode: 2,
        });
    }
    if (state.publication.mode === "mismatch" && state.finalStatus !== "integrity_mismatch") {
        throw new ReleaseStateError("mismatch publication must be terminal", { code: "schema_mismatch", exitCode: 2 });
    }
    if (state.finalStatus === "integrity_mismatch" && state.publication.mode !== "mismatch") {
        throw new ReleaseStateError("integrity_mismatch status must use mismatch publication mode", { code: "schema_mismatch", exitCode: 2 });
    }
    if (state.finalStatus === "proof_only" && state.publication.mode !== "proof_only") {
        throw new ReleaseStateError("proof_only status must use proof_only publication mode", { code: "schema_mismatch", exitCode: 2 });
    }
    if (state.finalStatus === "verified" && (!published || state.verification.registrySmoke !== "passed")) {
        throw new ReleaseStateError("verified status requires a matching publication and passed registry smoke", {
            code: "schema_mismatch",
            exitCode: 2,
        });
    }
    if (state.verification.registrySmoke === "failed" && state.finalStatus !== "failed") {
        throw new ReleaseStateError("failed registry smoke must make the receipt failed", { code: "schema_mismatch", exitCode: 2 });
    }
    if (state.publication.mode === "failed" && state.finalStatus !== "failed") {
        throw new ReleaseStateError("failed publication must make the receipt failed", { code: "schema_mismatch", exitCode: 2 });
    }
    if (state.finalStatus === "published_unverified" && (!published || state.verification.registrySmoke === "passed")) {
        throw new ReleaseStateError("published_unverified requires a matching publication before passed registry smoke", {
            code: "schema_mismatch",
            exitCode: 2,
        });
    }
    return state;
}

function nowIso(clock) {
    const value = typeof clock === "function" ? clock() : new Date().toISOString();
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
        throw new ReleaseStateError("clock must return an ISO timestamp", { code: "invalid_clock", exitCode: 2 });
    }
    return value;
}

export function createInitialState(metadata = {}, { clock } = {}) {
    const createdAt = nowIso(clock);
    const state = {
        schemaVersion: RELEASE_STATE_SCHEMA_VERSION,
        repository: metadata.repository ?? RELEASE_STATE_REPOSITORY,
        workflow: metadata.workflow ?? "",
        runId: metadata.runId ?? "",
        runAttempt: metadata.runAttempt ?? "",
        eventName: metadata.eventName ?? "",
        refName: metadata.refName ?? "",
        sourceSha: metadata.sourceSha ?? "",
        packageName: metadata.packageName ?? "",
        version: metadata.version ?? "",
        localArtifact: { path: "", integrity: "" },
        publication: { mode: "not_attempted", remoteIntegrity: "" },
        verification: { registrySmoke: "not_run", attestation: "not_checked", githubRelease: "not_checked" },
        timestamps: { createdAt, updatedAt: createdAt },
        finalStatus: "built",
    };
    validateState(state);
    return state;
}

export function immutableMetadata(state) {
    validateState(state);
    return Object.fromEntries(IMMUTABLE_FIELDS.map((field) => [field, state[field]]));
}

export function assertImmutableMetadata(existing, candidate) {
    validateState(existing);
    for (const field of IMMUTABLE_FIELDS) {
        if (candidate[field] !== undefined && candidate[field] !== existing[field]) {
            throw new ReleaseStateError(`${field} is immutable after receipt initialization`, {
                code: "immutable_metadata",
                exitCode: 1,
            });
        }
    }
    return existing;
}

function transitionFailure(message, code = "illegal_transition", nextState) {
    throw new ReleaseStateError(message, { code, exitCode: 1, nextState });
}

function withUpdatedTimestamp(state, clock) {
    const next = clone(state);
    next.timestamps.updatedAt = nowIso(clock);
    return next;
}

function requireArtifact(state) {
    if (!state.localArtifact.path || !state.localArtifact.integrity) {
        transitionFailure("local artifact path and sha512 integrity are required before publication", "missing_artifact");
    }
}

function requireTagPush(state) {
    if (state.eventName !== "push" || !PACKAGE_TAG.test(state.refName)) {
        transitionFailure("publication is allowed only for a pushed package tag", "publish_not_tag_only");
    }
}

export function transitionState(state, command, payload = {}, { clock } = {}) {
    validateState(state);
    if (state.finalStatus === "failed" || state.finalStatus === "integrity_mismatch") {
        transitionFailure(`receipt is terminal in ${state.finalStatus}`, "terminal_receipt");
    }
    if (!isPlainObject(payload)) {
        transitionFailure("transition payload must be an object", "invalid_transition_payload");
    }

    let next = withUpdatedTimestamp(state, clock);
    switch (command) {
        case "set-artifact": {
            if (next.publication.mode !== "not_attempted") {
                transitionFailure("artifact cannot be changed after publication has been finalized");
            }
            if (typeof payload.path !== "string" || payload.path.length === 0) {
                transitionFailure("set-artifact requires a non-empty path", "missing_artifact");
            }
            if (typeof payload.integrity !== "string" || !INTEGRITY.test(payload.integrity)) {
                transitionFailure("set-artifact requires a sha512 integrity value", "invalid_integrity");
            }
            next.localArtifact = { path: payload.path, integrity: payload.integrity };
            break;
        }
        case "proof-only": {
            if (next.publication.mode === "published_now" || next.publication.mode === "already_present_matching") {
                transitionFailure("a published receipt cannot be changed to proof_only");
            }
            next.publication = { mode: "proof_only", remoteIntegrity: "" };
            next.finalStatus = "proof_only";
            break;
        }
        case "publish": {
            requireTagPush(next);
            if (next.publication.mode === "proof_only") {
                transitionFailure("proof_only receipts can never publish", "proof_only_publication");
            }
            const mode = payload.mode;
            const remoteIntegrity = payload.remoteIntegrity;
            if (mode !== "published_now" && mode !== "already_present_matching") {
                transitionFailure("publish requires published_now or already_present_matching", "invalid_publication_mode");
            }
            if (typeof remoteIntegrity !== "string" || !INTEGRITY.test(remoteIntegrity)) {
                transitionFailure("publish requires a sha512 remote integrity value", "invalid_integrity");
            }
            requireArtifact(next);
            next.publication = { mode, remoteIntegrity };
            if (remoteIntegrity !== next.localArtifact.integrity) {
                next.publication.mode = "mismatch";
                next.finalStatus = "integrity_mismatch";
                transitionFailure("local and remote artifact integrities do not match", "integrity_mismatch", next);
            }
            next.finalStatus = "published_unverified";
            break;
        }
        case "registry-smoke": {
            if (payload.status !== "passed" && payload.status !== "failed") {
                transitionFailure("registry-smoke requires status passed or failed", "invalid_verification_state");
            }
            next.verification.registrySmoke = payload.status;
            if (payload.status === "failed") {
                next.finalStatus = "failed";
                transitionFailure("registry smoke failed", "registry_smoke_failed", next);
            }
            if (next.publication.mode === "published_now" || next.publication.mode === "already_present_matching") {
                next.finalStatus = "verified";
            }
            break;
        }
        case "attestation": {
            if (payload.status !== "present" && payload.status !== "absent") {
                transitionFailure("attestation requires status present or absent", "invalid_verification_state");
            }
            next.verification.attestation = payload.status;
            break;
        }
        case "github-release": {
            if (payload.status !== "present" && payload.status !== "absent") {
                transitionFailure("github-release requires status present or absent", "invalid_verification_state");
            }
            next.verification.githubRelease = payload.status;
            break;
        }
        case "fail": {
            const publicationWasRecorded = next.publication.mode === "published_now" || next.publication.mode === "already_present_matching";
            if (!publicationWasRecorded) {
                next.publication = { mode: "failed", remoteIntegrity: next.publication.remoteIntegrity };
            }
            next.finalStatus = "failed";
            transitionFailure("release receipt marked failed", "release_failed", next);
            break;
        }
        default:
            transitionFailure(`unknown release-state command ${JSON.stringify(command)}`);
    }
    validateState(next);
    return next;
}

export function readState(filePath) {
    let text;
    try {
        text = fs.readFileSync(filePath, "utf8");
    } catch (error) {
        if (error?.code === "ENOENT") throw error;
        throw new ReleaseStateError(`could not read release receipt: ${error.message}`, { code: "receipt_read_failed", exitCode: 2 });
    }
    let state;
    try {
        state = JSON.parse(text);
    } catch (error) {
        throw new ReleaseStateError(`release receipt is malformed JSON: ${error.message}`, { code: "malformed_receipt", exitCode: 2 });
    }
    try {
        return validateState(state);
    } catch (error) {
        if (error instanceof ReleaseStateError) throw error;
        throw new ReleaseStateError(`release receipt is invalid: ${error.message}`, { code: "schema_mismatch", exitCode: 2 });
    }
}

function fsyncDirectory(directory) {
    let fd;
    try {
        fd = fs.openSync(directory, "r");
        fs.fsyncSync(fd);
    } catch {
        // Some filesystems do not permit fsync on a directory. The receipt is
        // still durable at the file level; do not make a successful rename
        // look like a state transition failure for that platform detail.
    } finally {
        if (fd !== undefined) {
            try { fs.closeSync(fd); } catch {}
        }
    }
}

export function writeStateAtomic(filePath, state, { beforeRename, clock } = {}) {
    validateState(state);
    const absolutePath = path.resolve(filePath);
    const directory = path.dirname(absolutePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = path.join(
        directory,
        `.${path.basename(absolutePath)}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`,
    );
    const serialized = `${JSON.stringify(state, null, 2)}\n`;
    let fd;
    try {
        fd = fs.openSync(temporaryPath, "wx", 0o600);
        fs.writeFileSync(fd, serialized, "utf8");
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = undefined;
        if (typeof beforeRename === "function") beforeRename({ temporaryPath, filePath: absolutePath, state });
        fs.renameSync(temporaryPath, absolutePath);
        fsyncDirectory(directory);
    } catch (error) {
        if (fd !== undefined) {
            try { fs.closeSync(fd); } catch {}
        }
        try { fs.unlinkSync(temporaryPath); } catch {}
        throw error;
    }
    return state;
}

export function initializeStateFile(filePath, metadata, options = {}) {
    try {
        const existing = readState(filePath);
        const candidate = createInitialState(metadata, options);
        assertImmutableMetadata(existing, candidate);
        return existing;
    } catch (error) {
        if (error?.code !== "ENOENT") throw error;
    }
    const state = createInitialState(metadata, options);
    writeStateAtomic(filePath, state, options);
    return state;
}

export function updateStateFile(filePath, command, payload = {}, options = {}) {
    const current = readState(filePath);
    let next;
    try {
        next = transitionState(current, command, payload, options);
    } catch (error) {
        if (error instanceof ReleaseStateError && error.nextState) {
            writeStateAtomic(filePath, error.nextState, options);
        }
        throw error;
    }
    writeStateAtomic(filePath, next, options);
    return next;
}

function redact(value, key = "") {
    if (Array.isArray(value)) return value.map((entry) => redact(entry));
    if (!isPlainObject(value)) return value;
    const result = {};
    for (const [childKey, childValue] of Object.entries(value)) {
        if (/(?:token|secret|password|authorization|npm.?token|api.?key)/i.test(`${key}.${childKey}`)) {
            result[childKey] = childValue ? "[REDACTED]" : childValue;
        } else {
            result[childKey] = redact(childValue, `${key}.${childKey}`);
        }
    }
    return result;
}

export function redactedState(state) {
    validateState(state);
    return redact(clone(state));
}

export function isTerminalState(state) {
    validateState(state);
    return state.finalStatus === "failed" || state.finalStatus === "integrity_mismatch";
}

export const RELEASE_STATE_KEYS = Object.freeze({
    topLevel: TOP_LEVEL_KEYS,
    localArtifact: LOCAL_ARTIFACT_KEYS,
    publication: PUBLICATION_KEYS,
    verification: VERIFICATION_KEYS,
    timestamps: TIMESTAMP_KEYS,
});
