import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { CLEANUP_ENTITY_ORDER } from "./cleanup.mjs";

const FULL_COMMIT_SHA_RE = /^[0-9a-f]{40}$/;
const HEX_SHA256_RE = /^[0-9a-f]{64}$/;
const UTC_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const APPROVER_RE = /^[A-Za-z0-9][A-Za-z0-9._@-]{1,63}$/;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const EXPECTED_CLEANUP_ACTIONS = Object.freeze([...CLEANUP_ENTITY_ORDER, "registered_fallbacks"]);
export const GOVERNED_SAFETY_DEMOTIONS = Object.freeze({
    "POST /file/image": "cleanup_not_provable",
    "POST /workspaces/{workspaceId}/invoices/{invoiceId}/duplicate":
        "response_lost_create_not_discoverable",
    "POST /workspaces/{workspaceId}/invoices/{invoiceId}/payments": "cleanup_not_provable",
    "PATCH /workspaces/{workspaceId}/invoices/{invoiceId}/status": "cleanup_not_provable",
    "PUT /workspaces/{workspaceId}/scheduling/assignments/publish": "cleanup_not_provable",
    "POST /workspaces/{workspaceId}/users/{userId}/roles": "cleanup_not_readback_verifiable",
    "DELETE /workspaces/{workspaceId}/users/{userId}/roles": "cleanup_not_readback_verifiable",
});

export function isDirectInvocation(argv1, moduleFilename) {
    if (typeof argv1 !== "string" || typeof moduleFilename !== "string") return false;
    try {
        return fs.realpathSync(argv1) === fs.realpathSync(moduleFilename);
    } catch {
        return false;
    }
}
const SECRET_LIKE_KEYS = new Set([
    "apikey",
    "authorization",
    "clientsecret",
    "cookie",
    "email",
    "entityid",
    "password",
    "privatekey",
    "rawrequest",
    "rawresponse",
    "requestbody",
    "responsebody",
    "secret",
    "token",
    "accesstoken",
    "refreshtoken",
    "url",
    "userid",
    "workspaceid",
]);
const SECRET_LIKE_VALUES = [
    { name: "24-hex entity/workspace-like id", re: /\b[0-9a-f]{24}\b/i },
    { name: "email address", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
    { name: "URL", re: /https?:\/\//i },
    { name: "authorization value", re: /\b(?:basic|bearer)\s+[A-Za-z0-9._~+\/-]+=*/i },
    { name: "JWT-like value", re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/ },
    { name: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    {
        name: "credential assignment",
        re: /\b(?:api[_-]?key|authorization|cookie|password|secret|token)\s*[:=]\s*\S+/i,
    },
];

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function strictUtcInstant(value) {
    return (
        typeof value === "string" &&
        UTC_INSTANT_RE.test(value) &&
        Number.isFinite(Date.parse(value))
    );
}

function nonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
}

function validateObjectFields(value, label, allowedFields, requiredFields = allowedFields) {
    const errors = [];
    if (!isRecord(value)) return [`campaign receipt: ${label} must be an object`];
    const allowed = new Set(allowedFields);
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) errors.push(`campaign receipt: ${label}: unknown field ${key}`);
    }
    for (const field of requiredFields) {
        if (!(field in value))
            errors.push(`campaign receipt: ${label}: missing required field ${field}`);
    }
    return errors;
}

/** Recursively reject credential-bearing keys and sensitive string leaves. */
export function scanForSecretLikeData(value, pathLabel = "$") {
    const findings = [];
    if (typeof value === "string") {
        for (const { name, re } of SECRET_LIKE_VALUES) {
            if (re.test(value)) findings.push(`${pathLabel}: looks like a ${name}`);
        }
        return findings;
    }
    if (Array.isArray(value)) {
        value.forEach((entry, index) => {
            findings.push(...scanForSecretLikeData(entry, `${pathLabel}[${index}]`));
        });
        return findings;
    }
    if (!isRecord(value)) return findings;
    for (const [key, child] of Object.entries(value)) {
        const normalizedKey = key.replaceAll(/[^A-Za-z0-9]/g, "").toLowerCase();
        if (SECRET_LIKE_KEYS.has(normalizedKey)) {
            findings.push(`${pathLabel}.${key}: secret-like field name is forbidden`);
        }
        findings.push(...scanForSecretLikeData(child, `${pathLabel}.${key}`));
    }
    return findings;
}

function canonicalJsonValue(value) {
    if (Array.isArray(value)) return value.map(canonicalJsonValue);
    if (!isRecord(value)) return value;
    return Object.fromEntries(
        Object.keys(value)
            .sort()
            .map((key) => [key, canonicalJsonValue(value[key])]),
    );
}

/** Stable UTF-8 JSON representation used for every approved/imported artifact. */
export function canonicalJsonBytes(value) {
    return Buffer.from(`${JSON.stringify(canonicalJsonValue(value), null, 2)}\n`, "utf8");
}

export function sha256Hex(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}

export function computeHashesFingerprint(paths, hashes) {
    return sha256Hex(
        Buffer.from(paths.map((entry) => `${entry}:${hashes[entry] ?? ""}`).join("\n"), "utf8"),
    );
}

export function hashRelativeFiles(paths, readFileBytes) {
    const hashes = {};
    for (const relativePath of paths) {
        const bytes = readFileBytes(relativePath);
        if (!Buffer.isBuffer(bytes))
            throw new TypeError(`campaign input is not bytes: ${relativePath}`);
        hashes[relativePath] = sha256Hex(bytes);
    }
    return {
        hashes,
        fingerprint: computeHashesFingerprint(paths, hashes),
    };
}

export function compareHashSnapshots(before, after) {
    const paths = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
    return paths.filter((entry) => before?.[entry] !== after?.[entry]);
}

function walkRegularFiles(rootDir, currentDir, output) {
    const entries = fs
        .readdirSync(currentDir, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
        const absolutePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
            walkRegularFiles(rootDir, absolutePath, output);
        } else if (entry.isFile()) {
            output.push(path.relative(rootDir, absolutePath).replaceAll(path.sep, "/"));
        } else {
            throw new TypeError(`SDK artifact contains a non-regular entry: ${entry.name}`);
        }
    }
}

/** Hash the path and bytes of every regular file in a generated artifact tree. */
export function hashArtifactTree(rootDir) {
    const files = [];
    walkRegularFiles(rootDir, rootDir, files);
    if (files.length === 0) throw new TypeError("SDK artifact tree is empty");
    const hash = createHash("sha256");
    for (const relativePath of files) {
        hash.update(relativePath);
        hash.update("\0");
        hash.update(sha256Hex(fs.readFileSync(path.join(rootDir, relativePath))));
        hash.update("\0");
    }
    return { root: "wrapper/dist", sha256: hash.digest("hex"), fileCount: files.length };
}

export function safeErrorSummary(error) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : undefined;
    const code =
        typeof error?.code === "string" && /^(?:live_[a-z0-9_]+|ERR_[A-Z0-9_]+)$/.test(error.code)
            ? error.code
            : "operation_failed";
    return {
        code,
        ...(statusCode === undefined
            ? {}
            : { httpStatus: statusCode, httpClass: `${Math.floor(statusCode / 100)}xx` }),
    };
}

export function safeCorrelationId(runId, value) {
    return sha256Hex(Buffer.from(`${runId}:${String(value)}`, "utf8")).slice(0, 12);
}

export function validateCampaignReceipt(
    receipt,
    {
        manifest,
        manifestSha256,
        campaignInputs,
        campaignInputHashes,
        sdkArtifact,
        baseCommitExists = () => true,
        nowMs = Date.now(),
    },
) {
    const errors = [];
    if (!isRecord(receipt)) return ["campaign receipt must be an object"];
    const allowed = new Set([
        "schemaVersion",
        "baseCommit",
        "startedAt",
        "completedAt",
        "manifestSha256",
        "previousManifestSha256",
        "campaignInputFingerprint",
        "campaignInputHashes",
        "sdkArtifact",
        "runtime",
        "outcomes",
        "cleanup",
        "lock",
    ]);
    for (const key of Object.keys(receipt)) {
        if (!allowed.has(key)) errors.push(`campaign receipt: unknown field ${key}`);
    }
    for (const field of allowed) {
        if (!(field in receipt)) errors.push(`campaign receipt: missing required field ${field}`);
    }
    errors.push(
        ...scanForSecretLikeData(receipt).map(
            (finding) => `campaign receipt: sensitive data: ${finding}`,
        ),
    );
    if (receipt.schemaVersion !== 1) errors.push("campaign receipt: schemaVersion must be 1");
    if (!FULL_COMMIT_SHA_RE.test(receipt.baseCommit ?? "")) {
        errors.push("campaign receipt: baseCommit must be a full lowercase commit SHA");
    } else if (!baseCommitExists(receipt.baseCommit)) {
        errors.push("campaign receipt: baseCommit does not exist in the repository");
    }
    for (const field of ["startedAt", "completedAt"]) {
        if (!strictUtcInstant(receipt[field]))
            errors.push(`campaign receipt: ${field} must be a strict UTC instant`);
    }
    if (
        strictUtcInstant(receipt.startedAt) &&
        strictUtcInstant(receipt.completedAt) &&
        Date.parse(receipt.startedAt) > Date.parse(receipt.completedAt)
    ) {
        errors.push("campaign receipt: startedAt must not be later than completedAt");
    }
    if (
        strictUtcInstant(receipt.completedAt) &&
        Date.parse(receipt.completedAt) > nowMs + MAX_FUTURE_SKEW_MS
    ) {
        errors.push("campaign receipt: completedAt must not be in the future");
    }
    if (
        !HEX_SHA256_RE.test(receipt.manifestSha256 ?? "") ||
        receipt.manifestSha256 !== manifestSha256
    ) {
        errors.push("campaign receipt: manifestSha256 does not match the candidate bytes");
    }
    if (!HEX_SHA256_RE.test(receipt.previousManifestSha256 ?? "")) {
        errors.push("campaign receipt: previousManifestSha256 must be a SHA-256 digest");
    }
    if (
        !Array.isArray(campaignInputs) ||
        campaignInputs.length === 0 ||
        !isRecord(campaignInputHashes)
    ) {
        errors.push("campaign receipt: current campaign inputs are required");
    } else {
        const expectedFingerprint = computeHashesFingerprint(campaignInputs, campaignInputHashes);
        if (receipt.campaignInputFingerprint !== expectedFingerprint) {
            errors.push("campaign receipt: campaignInputFingerprint does not match current inputs");
        }
        for (const inputPath of campaignInputs) {
            if (receipt.campaignInputHashes?.[inputPath] !== campaignInputHashes[inputPath]) {
                errors.push(`campaign receipt: stale input ${inputPath}`);
            }
        }
        for (const inputPath of Object.keys(receipt.campaignInputHashes ?? {})) {
            if (!campaignInputs.includes(inputPath))
                errors.push(`campaign receipt: unknown input ${inputPath}`);
        }
        for (const [inputPath, digest] of Object.entries(receipt.campaignInputHashes ?? {})) {
            if (!HEX_SHA256_RE.test(digest)) {
                errors.push(
                    `campaign receipt: campaignInputHashes.${inputPath} must be a SHA-256 digest`,
                );
            }
        }
    }
    errors.push(
        ...validateObjectFields(receipt.sdkArtifact, "sdkArtifact", [
            "root",
            "sha256",
            "fileCount",
        ]),
    );
    if (
        !isRecord(sdkArtifact) ||
        receipt.sdkArtifact?.root !== sdkArtifact.root ||
        receipt.sdkArtifact?.sha256 !== sdkArtifact.sha256 ||
        receipt.sdkArtifact?.fileCount !== sdkArtifact.fileCount
    ) {
        errors.push("campaign receipt: SDK artifact tree does not match the executed artifact");
    }
    errors.push(...validateObjectFields(receipt.runtime, "runtime", ["nodeVersion"]));
    if (
        typeof receipt.runtime?.nodeVersion !== "string" ||
        !/^v\d+\.\d+\.\d+$/.test(receipt.runtime.nodeVersion)
    ) {
        errors.push("campaign receipt: runtime.nodeVersion must be an exact Node.js version");
    }
    const manifestOperations = Array.isArray(manifest?.operations) ? manifest.operations : [];
    const operationCount = Array.isArray(manifest?.operations) ? manifestOperations.length : -1;
    const liveSuccessCount = Array.isArray(manifest?.operations)
        ? manifestOperations.filter((row) => row.status === "live-success").length
        : -1;
    errors.push(
        ...validateObjectFields(receipt.outcomes, "outcomes", [
            "operationCount",
            "liveSuccessCount",
            "statusRegressions",
            "unexpectedProbeFailures",
            "deferredProbeFailures",
            "safetyDemotions",
        ]),
    );
    let safetyDemotionsValid = Array.isArray(receipt.outcomes?.safetyDemotions);
    const seenSafetyDemotions = new Set();
    if (Array.isArray(receipt.outcomes?.safetyDemotions)) {
        receipt.outcomes.safetyDemotions.forEach((demotion, index) => {
            errors.push(
                ...validateObjectFields(demotion, `outcomes.safetyDemotions[${index}]`, [
                    "operationKey",
                    "reason",
                ]),
            );
            const currentOperation = manifestOperations.find(
                (row) => row.operationKey === demotion?.operationKey,
            );
            if (
                !isRecord(demotion) ||
                !Object.hasOwn(GOVERNED_SAFETY_DEMOTIONS, demotion.operationKey) ||
                GOVERNED_SAFETY_DEMOTIONS[demotion.operationKey] !== demotion.reason ||
                seenSafetyDemotions.has(demotion.operationKey) ||
                currentOperation?.status !== "probe-documented"
            ) {
                safetyDemotionsValid = false;
            }
            if (isRecord(demotion)) seenSafetyDemotions.add(demotion.operationKey);
        });
    }
    if (
        receipt.outcomes?.operationCount !== operationCount ||
        receipt.outcomes?.liveSuccessCount !== liveSuccessCount ||
        receipt.outcomes?.statusRegressions !== 0 ||
        receipt.outcomes?.unexpectedProbeFailures !== 0 ||
        !nonNegativeInteger(receipt.outcomes?.deferredProbeFailures) ||
        !safetyDemotionsValid
    ) {
        errors.push(
            "campaign receipt: outcome counts are inconsistent or contain regressions/failures",
        );
    }
    errors.push(
        ...validateObjectFields(receipt.cleanup, "cleanup", [
            "status",
            "prefixCount",
            "leftovers",
            "actions",
        ]),
    );
    let cleanupValid =
        receipt.cleanup?.status === "passed" &&
        receipt.cleanup?.leftovers === 0 &&
        positiveInteger(receipt.cleanup?.prefixCount) &&
        Array.isArray(receipt.cleanup?.actions) &&
        receipt.cleanup.actions.length === EXPECTED_CLEANUP_ACTIONS.length;
    const seenCleanupActions = new Set();
    let computedLeftovers = 0;
    if (Array.isArray(receipt.cleanup?.actions)) {
        receipt.cleanup.actions.forEach((action, index) => {
            errors.push(
                ...validateObjectFields(action, `cleanup.actions[${index}]`, [
                    "entityType",
                    "sanitizedIdCount",
                    "deletedCount",
                    "failedCount",
                    "remainingCount",
                    "complete",
                ]),
            );
            const expectedEntityType = EXPECTED_CLEANUP_ACTIONS[index];
            const countsValid =
                isRecord(action) &&
                nonNegativeInteger(action.sanitizedIdCount) &&
                nonNegativeInteger(action.deletedCount) &&
                nonNegativeInteger(action.failedCount) &&
                nonNegativeInteger(action.remainingCount);
            if (
                !countsValid ||
                action.entityType !== expectedEntityType ||
                seenCleanupActions.has(action.entityType) ||
                action.complete !== true ||
                action.sanitizedIdCount !== action.deletedCount + action.failedCount ||
                action.failedCount !== 0 ||
                action.remainingCount !== 0
            ) {
                cleanupValid = false;
            }
            if (isRecord(action)) seenCleanupActions.add(action.entityType);
            if (nonNegativeInteger(action?.remainingCount)) {
                computedLeftovers += action.remainingCount;
            }
        });
    }
    if (receipt.cleanup?.leftovers !== computedLeftovers) cleanupValid = false;
    if (!cleanupValid) {
        errors.push("campaign receipt: cleanup must be complete with zero failures and leftovers");
    }
    errors.push(...validateObjectFields(receipt.lock, "lock", ["released"]));
    if (receipt.lock?.released !== true)
        errors.push("campaign receipt: exclusive live lock was not released");
    return errors;
}

export function validateApprovalReceipt(
    approval,
    { manifestSha256, campaignReceiptSha256, campaignCompletedAt, nowMs = Date.now() },
) {
    const errors = [];
    if (!isRecord(approval)) return ["approval receipt must be an object"];
    const allowed = new Set([
        "schemaVersion",
        "manifestSha256",
        "campaignReceiptSha256",
        "approvedBy",
        "approvedAt",
    ]);
    for (const key of Object.keys(approval)) {
        if (!allowed.has(key)) errors.push(`approval receipt: unknown field ${key}`);
    }
    for (const field of allowed) {
        if (!(field in approval)) errors.push(`approval receipt: missing required field ${field}`);
    }
    errors.push(
        ...scanForSecretLikeData(approval).map(
            (finding) => `approval receipt: sensitive data: ${finding}`,
        ),
    );
    if (approval.schemaVersion !== 1) errors.push("approval receipt: schemaVersion must be 1");
    if (approval.manifestSha256 !== manifestSha256)
        errors.push("approval receipt: manifestSha256 mismatch");
    if (approval.campaignReceiptSha256 !== campaignReceiptSha256) {
        errors.push("approval receipt: campaignReceiptSha256 mismatch");
    }
    if (!APPROVER_RE.test(approval.approvedBy ?? ""))
        errors.push("approval receipt: approvedBy is invalid");
    if (!strictUtcInstant(approval.approvedAt)) {
        errors.push("approval receipt: approvedAt must be a strict UTC instant");
    } else {
        const approvedAtMs = Date.parse(approval.approvedAt);
        if (approvedAtMs > nowMs + MAX_FUTURE_SKEW_MS)
            errors.push("approval receipt: approvedAt must not be in the future");
        if (
            strictUtcInstant(campaignCompletedAt) &&
            approvedAtMs < Date.parse(campaignCompletedAt)
        ) {
            errors.push("approval receipt: approval predates campaign completion");
        }
    }
    return errors;
}

/**
 * Build the two immutable campaign candidates only after every lifecycle
 * invariant is known. No filesystem write occurs on failure.
 */
export function createCampaignArtifacts({
    manifest,
    previousManifest,
    previousManifestBytes,
    baseCommit,
    startedAt,
    completedAt,
    inputBefore,
    inputAfter,
    artifactBefore,
    artifactAfter,
    probeFailures,
    safetyDemotions = [],
    cleanup,
    lockReleased,
    nodeVersion,
    validateManifest,
    baseCommitExists = () => true,
    nowMs = Date.now(),
}) {
    const errors = [];
    const changedInputs = compareHashSnapshots(inputBefore?.hashes, inputAfter?.hashes);
    if (changedInputs.length > 0 || inputBefore?.fingerprint !== inputAfter?.fingerprint) {
        errors.push(
            `campaign inputs changed during execution: ${changedInputs.join(", ") || "fingerprint"}`,
        );
    }
    if (
        artifactBefore?.root !== artifactAfter?.root ||
        artifactBefore?.sha256 !== artifactAfter?.sha256 ||
        artifactBefore?.fileCount !== artifactAfter?.fileCount
    ) {
        errors.push("SDK artifact tree changed during campaign execution");
    }
    errors.push(...validateManifest(manifest));

    const previousByKey = new Map(
        (Array.isArray(previousManifest?.operations) ? previousManifest.operations : []).map(
            (row) => [row.operationKey, row.status],
        ),
    );
    const currentByKey = new Map(
        (Array.isArray(manifest?.operations) ? manifest.operations : []).map((row) => [
            row.operationKey,
            row.status,
        ]),
    );
    const safetyDemotionKeys = new Set(
        Array.isArray(safetyDemotions)
            ? safetyDemotions.map((demotion) => demotion?.operationKey)
            : [],
    );
    const regressions = [...previousByKey].filter(
        ([operationKey, status]) =>
            status === "live-success" &&
            currentByKey.get(operationKey) !== "live-success" &&
            !safetyDemotionKeys.has(operationKey),
    );
    if (regressions.length > 0) {
        errors.push(`live-success status regressed for ${regressions.length} operation(s)`);
    }

    const failures = Array.isArray(probeFailures) ? probeFailures : [];
    const deferredProbeFailures = failures.filter((entry) => {
        const previousStatus = previousByKey.get(entry.operationKey);
        return previousStatus === "documented" || previousStatus === "probe-documented";
    }).length;
    const unexpectedProbeFailures = failures.length - deferredProbeFailures;
    if (unexpectedProbeFailures > 0) {
        errors.push(`campaign had ${unexpectedProbeFailures} unexpected probe failure(s)`);
    }
    if (cleanup?.status !== "passed" || cleanup?.leftovers !== 0) {
        errors.push("aggregate cleanup did not pass with zero leftovers");
    }
    if (lockReleased !== true) errors.push("exclusive live lock was not released");
    if (errors.length > 0) return { ok: false, errors };

    const manifestBytes = canonicalJsonBytes(manifest);
    const manifestSha256 = sha256Hex(manifestBytes);
    if (!Buffer.isBuffer(previousManifestBytes)) {
        return { ok: false, errors: ["previous manifest bytes are required"] };
    }
    const liveSuccessCount = manifest.operations.filter(
        (row) => row.status === "live-success",
    ).length;
    const receipt = {
        schemaVersion: 1,
        baseCommit,
        startedAt,
        completedAt,
        manifestSha256,
        previousManifestSha256: sha256Hex(previousManifestBytes),
        campaignInputFingerprint: inputBefore.fingerprint,
        campaignInputHashes: inputBefore.hashes,
        sdkArtifact: artifactBefore,
        runtime: { nodeVersion },
        outcomes: {
            operationCount: manifest.operations.length,
            liveSuccessCount,
            statusRegressions: 0,
            unexpectedProbeFailures: 0,
            deferredProbeFailures,
            safetyDemotions,
        },
        cleanup,
        lock: { released: true },
    };
    const receiptErrors = validateCampaignReceipt(receipt, {
        manifest,
        manifestSha256,
        campaignInputs: Object.keys(inputBefore.hashes),
        campaignInputHashes: inputBefore.hashes,
        sdkArtifact: artifactBefore,
        baseCommitExists,
        nowMs,
    });
    if (receiptErrors.length > 0) return { ok: false, errors: receiptErrors };
    const campaignReceiptBytes = canonicalJsonBytes(receipt);
    return {
        ok: true,
        errors: [],
        manifestBytes,
        manifestSha256,
        campaignReceiptBytes,
        campaignReceiptSha256: sha256Hex(campaignReceiptBytes),
        receipt,
    };
}

export function writeFileAtomic(destination, bytes) {
    const directory = path.dirname(destination);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = path.join(directory, `.${path.basename(destination)}.tmp-${process.pid}`);
    try {
        fs.writeFileSync(temporary, bytes, { flag: "wx" });
        fs.renameSync(temporary, destination);
    } finally {
        fs.rmSync(temporary, { force: true });
    }
}
