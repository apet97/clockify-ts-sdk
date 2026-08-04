#!/usr/bin/env node
// Downstream validator for the operation-level sanitized live-evidence
// manifest (docs/live-evidence-manifest.schema.json). A credentialed sandbox
// campaign produces a sanitized candidate; this validator checks the exact
// human-approved candidate again before and after import.
//
// Validates: shape, exact operation-set equality with
// docs/openapi-operations.json, canonical commit/hash equality with the
// current docs/openapi-source-lock.json (a stale manifest is rejected, not
// silently accepted), allowed status/proofKind/cleanup values, every
// live-success row has evidence id + timestamp + shape hashes, every
// sandbox-mutation row has a cleanup state, and no forbidden sensitive
// data pattern (24-hex ID, email, URL) anywhere in the document.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FULL_COMMIT_SHA_RE = /^[0-9a-f]{40}$/;
const HEX_SHA256_RE = /^[0-9a-f]{64}$/;
const OPERATION_KEY_RE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \/.+$/;
const EVIDENCE_ID_RE = /^probe-[0-9a-f]{8,16}-[0-9]{3}$/;
const UTC_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const ALLOWED_STATUS = new Set(["documented", "probe-documented", "live-success"]);
const ALLOWED_PROOF_KIND = new Set(["read-only", "sandbox-mutation"]);
const ALLOWED_HTTP_CLASS = new Set(["2xx", "3xx", "4xx", "5xx"]);
const ALLOWED_CLEANUP = new Set(["passed"]);

const MANIFEST_ALLOWED_FIELDS = new Set([
    "schemaVersion",
    "canonicalCommit",
    "canonicalOpenApiSha256",
    "redactionVersion",
    "generatedAt",
    "operations",
]);
const ROW_ALLOWED_FIELDS = new Set([
    "operationKey",
    "operationId",
    "status",
    "proofKind",
    "observedHttpClass",
    "requestShapeSha256",
    "responseShapeSha256",
    "evidenceId",
    "verifiedAt",
    "cleanup",
]);
const ROW_REQUIRED_FIELDS = ["operationKey", "operationId", "status"];
const LIVE_SUCCESS_REQUIRED_FIELDS = [
    "proofKind",
    "observedHttpClass",
    "requestShapeSha256",
    "responseShapeSha256",
    "evidenceId",
    "verifiedAt",
];

function isPlainObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function isStrictUtcInstant(value) {
    return (
        isNonEmptyString(value) && UTC_INSTANT_RE.test(value) && !Number.isNaN(Date.parse(value))
    );
}

/** Pure shape validation, no filesystem/cross-reference checks. */
export function validateLiveEvidenceManifestShape(manifest, { nowMs = Date.now() } = {}) {
    const errors = [];

    if (!isPlainObject(manifest)) return ["manifest must be a JSON object"];

    for (const key of Object.keys(manifest)) {
        if (!MANIFEST_ALLOWED_FIELDS.has(key)) errors.push(`unknown field: ${key}`);
    }
    for (const field of MANIFEST_ALLOWED_FIELDS) {
        if (!(field in manifest)) errors.push(`missing required field: ${field}`);
    }
    if (errors.length > 0 && !("operations" in manifest)) return errors;

    if ("schemaVersion" in manifest && manifest.schemaVersion !== 1) {
        errors.push("schemaVersion: must be exactly 1");
    }
    if ("canonicalCommit" in manifest && !FULL_COMMIT_SHA_RE.test(manifest.canonicalCommit ?? "")) {
        errors.push("canonicalCommit: must be a full 40-character lowercase hex commit SHA");
    }
    if (
        "canonicalOpenApiSha256" in manifest &&
        !HEX_SHA256_RE.test(manifest.canonicalOpenApiSha256 ?? "")
    ) {
        errors.push("canonicalOpenApiSha256: must be a 64-character lowercase hex SHA-256 digest");
    }
    if (
        "redactionVersion" in manifest &&
        (!Number.isInteger(manifest.redactionVersion) || manifest.redactionVersion < 1)
    ) {
        errors.push("redactionVersion: must be a positive integer");
    }
    if ("generatedAt" in manifest && !isStrictUtcInstant(manifest.generatedAt)) {
        errors.push("generatedAt: must be a strict UTC ISO-8601 instant");
    } else if (
        "generatedAt" in manifest &&
        Date.parse(manifest.generatedAt) > nowMs + MAX_FUTURE_SKEW_MS
    ) {
        errors.push("generatedAt: must not be in the future");
    }

    if (!Array.isArray(manifest.operations)) {
        errors.push("operations: must be an array");
        return errors;
    }
    if (manifest.operations.length === 0) {
        errors.push("operations: must contain at least one row");
    }

    const seenKeys = new Set();
    const seenEvidenceIds = new Set();
    let liveSuccessCount = 0;
    manifest.operations.forEach((row, index) => {
        const label = `operations[${index}]`;
        if (!isPlainObject(row)) {
            errors.push(`${label}: must be an object`);
            return;
        }
        for (const key of Object.keys(row)) {
            if (!ROW_ALLOWED_FIELDS.has(key)) errors.push(`${label}: unknown field ${key}`);
        }
        for (const field of ROW_REQUIRED_FIELDS) {
            if (!(field in row)) errors.push(`${label}: missing required field ${field}`);
        }
        if (isNonEmptyString(row.operationKey)) {
            if (!OPERATION_KEY_RE.test(row.operationKey)) {
                errors.push(
                    `${label}: operationKey must be "<METHOD> /path" (got ${JSON.stringify(row.operationKey)})`,
                );
            }
            if (seenKeys.has(row.operationKey)) {
                errors.push(`${label}: duplicate operationKey ${row.operationKey}`);
            }
            seenKeys.add(row.operationKey);
        } else {
            errors.push(`${label}: operationKey must be a non-empty string`);
        }
        if (!isNonEmptyString(row.operationId))
            errors.push(`${label}: operationId must be a non-empty string`);
        if ("status" in row && !ALLOWED_STATUS.has(row.status)) {
            errors.push(`${label}: unknown status ${JSON.stringify(row.status)}`);
        }
        if ("proofKind" in row && !ALLOWED_PROOF_KIND.has(row.proofKind)) {
            errors.push(`${label}: unknown proofKind ${JSON.stringify(row.proofKind)}`);
        }
        if ("observedHttpClass" in row && !ALLOWED_HTTP_CLASS.has(row.observedHttpClass)) {
            errors.push(
                `${label}: unknown observedHttpClass ${JSON.stringify(row.observedHttpClass)}`,
            );
        }
        if ("cleanup" in row && !ALLOWED_CLEANUP.has(row.cleanup)) {
            errors.push(`${label}: unknown cleanup ${JSON.stringify(row.cleanup)}`);
        }
        if ("requestShapeSha256" in row && !HEX_SHA256_RE.test(row.requestShapeSha256)) {
            errors.push(
                `${label}: requestShapeSha256 must be a 64-character lowercase hex SHA-256 digest`,
            );
        }
        if ("responseShapeSha256" in row && !HEX_SHA256_RE.test(row.responseShapeSha256)) {
            errors.push(
                `${label}: responseShapeSha256 must be a 64-character lowercase hex SHA-256 digest`,
            );
        }
        if ("verifiedAt" in row && !isStrictUtcInstant(row.verifiedAt)) {
            errors.push(`${label}: verifiedAt must be a strict UTC ISO-8601 instant`);
        } else if (
            "verifiedAt" in row &&
            isStrictUtcInstant(manifest.generatedAt) &&
            Date.parse(row.verifiedAt) > Date.parse(manifest.generatedAt)
        ) {
            errors.push(`${label}: verifiedAt must not be later than generatedAt`);
        }
        if ("evidenceId" in row) {
            if (!EVIDENCE_ID_RE.test(row.evidenceId ?? "")) {
                errors.push(`${label}: evidenceId must match ${EVIDENCE_ID_RE}`);
            } else if (seenEvidenceIds.has(row.evidenceId)) {
                errors.push(`${label}: duplicate evidenceId ${row.evidenceId}`);
            }
            seenEvidenceIds.add(row.evidenceId);
        }

        if (row.status === "live-success") {
            liveSuccessCount += 1;
            for (const field of LIVE_SUCCESS_REQUIRED_FIELDS) {
                if (!(field in row)) errors.push(`${label}: live-success rows require ${field}`);
            }
            if (row.observedHttpClass !== "2xx") {
                errors.push(`${label}: live-success rows require observedHttpClass 2xx`);
            }
            if (row.proofKind === "sandbox-mutation" && row.cleanup !== "passed") {
                errors.push(`${label}: sandbox-mutation live-success rows require cleanup passed`);
            }
            if (row.proofKind === "read-only" && "cleanup" in row) {
                errors.push(`${label}: read-only live-success rows must not declare cleanup`);
            }
        } else {
            for (const field of [...LIVE_SUCCESS_REQUIRED_FIELDS, "cleanup"]) {
                if (field in row) errors.push(`${label}: non-live rows must not declare ${field}`);
            }
        }
    });
    if (manifest.operations.length > 0 && liveSuccessCount === 0) {
        errors.push("operations: must contain at least one live-success row");
    }

    return errors;
}

const SENSITIVE_PATTERNS = [
    { name: "24-hex entity/workspace-like id", re: /\b[0-9a-f]{24}\b/i },
    { name: "email address", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
    { name: "URL", re: /https?:\/\//i },
];

/** Recursively scan every string leaf value for forbidden sensitive-data patterns. */
export function scanForSensitiveData(value, pathLabel = "$") {
    const findings = [];
    if (typeof value === "string") {
        for (const { name, re } of SENSITIVE_PATTERNS) {
            if (re.test(value)) findings.push(`${pathLabel}: looks like a ${name}`);
        }
    } else if (Array.isArray(value)) {
        value.forEach((item, index) =>
            findings.push(...scanForSensitiveData(item, `${pathLabel}[${index}]`)),
        );
    } else if (isPlainObject(value)) {
        for (const [key, child] of Object.entries(value)) {
            findings.push(...scanForSensitiveData(child, `${pathLabel}.${key}`));
        }
    }
    return findings;
}

/**
 * Full semantic validation: shape, sensitive-data scan, source-lock
 * fingerprint currency, and exact operation-set equality against the
 * canonical operation inventory.
 */
export function validateLiveEvidenceManifest(
    manifest,
    { sourceLock, operationInventory, nowMs } = {},
) {
    const errors = [
        ...validateLiveEvidenceManifestShape(manifest, {
            ...(nowMs === undefined ? {} : { nowMs }),
        }),
    ];
    errors.push(...scanForSensitiveData(manifest).map((finding) => `sensitive data: ${finding}`));

    if (!isPlainObject(sourceLock)) {
        errors.push("sourceLock: a canonical source-lock object is required");
    } else {
        if (manifest.canonicalCommit !== sourceLock.commit) {
            errors.push(
                `canonicalCommit: stale -- manifest is tied to ${manifest.canonicalCommit}, current source lock is ${sourceLock.commit}`,
            );
        }
        if (manifest.canonicalOpenApiSha256 !== sourceLock.sourceSha256) {
            errors.push(
                `canonicalOpenApiSha256: stale -- manifest is tied to ${manifest.canonicalOpenApiSha256}, current source lock is ${sourceLock.sourceSha256}`,
            );
        }
    }

    if (!Array.isArray(operationInventory) || operationInventory.length === 0) {
        errors.push("operationInventory: a non-empty canonical operation inventory is required");
    } else if (Array.isArray(manifest.operations)) {
        const canonicalByKey = new Map();
        for (const [index, operation] of operationInventory.entries()) {
            const operationKey = `${String(operation?.method).toUpperCase()} ${operation?.path}`;
            if (!OPERATION_KEY_RE.test(operationKey) || !isNonEmptyString(operation?.operationId)) {
                errors.push(`operationInventory[${index}]: invalid method, path, or operationId`);
                continue;
            }
            if (canonicalByKey.has(operationKey)) {
                errors.push(`operationInventory: duplicate canonical operation ${operationKey}`);
                continue;
            }
            canonicalByKey.set(operationKey, operation.operationId);
        }
        const canonicalKeys = new Set(canonicalByKey.keys());
        const manifestKeys = new Set(
            manifest.operations.map((row) => row.operationKey).filter(Boolean),
        );

        const missing = [...canonicalKeys].filter((key) => !manifestKeys.has(key));
        const extra = [...manifestKeys].filter((key) => !canonicalKeys.has(key));

        for (const key of missing)
            errors.push(`operations: missing a row for canonical operation ${key}`);
        for (const key of extra)
            errors.push(
                `operations: row for unknown operation ${key} (not in the canonical inventory)`,
            );
        for (const row of manifest.operations) {
            const expectedOperationId = canonicalByKey.get(row.operationKey);
            if (expectedOperationId !== undefined && row.operationId !== expectedOperationId) {
                errors.push(
                    `operations: ${row.operationKey} has operationId ${JSON.stringify(row.operationId)}; expected ${JSON.stringify(expectedOperationId)}`,
                );
            }
        }
    }

    return errors;
}

/** Derive headline counts from imported rows only -- never from prose/YAML markers. */
export function deriveHeadlineCounts(manifest) {
    const rows = Array.isArray(manifest?.operations) ? manifest.operations : [];
    const counts = { total: rows.length, documented: 0, "probe-documented": 0, "live-success": 0 };
    for (const row of rows) {
        if (row.status in counts) counts[row.status] += 1;
    }
    return counts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const manifestPath = path.join(root, "spec", "evidence", "live-evidence-manifest.json");
    if (!fs.existsSync(manifestPath)) {
        console.error(
            `${path.relative(root, manifestPath)} does not exist yet -- it is imported only once a human has supplied a real, upstream-approved manifest (H01-LIVE).`,
        );
        process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const sourceLock = JSON.parse(
        fs.readFileSync(path.join(root, "docs", "openapi-source-lock.json"), "utf8"),
    );
    const operationInventory = JSON.parse(
        fs.readFileSync(path.join(root, "docs", "openapi-operations.json"), "utf8"),
    ).operations;

    const errors = validateLiveEvidenceManifest(manifest, { sourceLock, operationInventory });
    if (errors.length > 0) {
        console.error("live-evidence-manifest validation failed:");
        for (const message of errors) console.error(`- ${message}`);
        process.exit(1);
    }
    const counts = deriveHeadlineCounts(manifest);
    console.log(
        `live-evidence-manifest valid: ${counts.total} operations (live-success=${counts["live-success"]}, probe-documented=${counts["probe-documented"]}, documented=${counts.documented})`,
    );
}
