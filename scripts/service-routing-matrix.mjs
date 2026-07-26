#!/usr/bin/env node
// Validates docs/service-routing-matrix.json (ROUTE-001/H02-ROUTING) and
// derives the empirical operation-to-service map from the corrected
// OpenAPI's per-operation `servers` overrides. This is evidence tooling
// only -- no runtime routing behavior changes here (that is ROUTE-002,
// gated on H02-ROUTING human approval of this matrix).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_SERVICE_KEYS = ["regular", "reports", "audit", "pto"];
const WILDCARD_PATTERN = /[*]/;
const SUBDOMAIN_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PENDING_REVIEW_MARKERS = ["TODO", "TBD", "flagged for human confirmation", "needs human confirmation", "PASTE TOKEN"];

function findPendingReviewMarker(value) {
    if (typeof value === "string") {
        return PENDING_REVIEW_MARKERS.find((marker) => value.includes(marker));
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findPendingReviewMarker(item);
            if (found) return found;
        }
        return undefined;
    }
    if (isPlainObject(value)) {
        for (const child of Object.values(value)) {
            const found = findPendingReviewMarker(child);
            if (found) return found;
        }
    }
    return undefined;
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

/** Validate a candidate Clockify workspace-subdomain DNS label. Returns { ok, reason }. */
export function validateSubdomainLabel(label) {
    if (!isNonEmptyString(label)) return { ok: false, reason: "subdomain label must be a non-empty string" };
    if (label !== label.toLowerCase()) return { ok: false, reason: "subdomain label must be lowercase" };
    if (label.includes(".")) return { ok: false, reason: "subdomain label must not contain dots" };
    if (label.startsWith("xn--")) return { ok: false, reason: "subdomain label must not be punycode/IDN" };
    if (label.startsWith("-") || label.endsWith("-")) {
        return { ok: false, reason: "subdomain label must not start or end with a hyphen" };
    }
    if (!SUBDOMAIN_LABEL_RE.test(label)) return { ok: false, reason: "subdomain label has an invalid character or length" };
    return { ok: true };
}

function checkServiceUrlShape(url, label, reasons) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        reasons.push(`${label}: url is not a parseable absolute URL`);
        return;
    }
    const isLoopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !isLoopback) {
        reasons.push(`${label}: must use https (got ${parsed.protocol}) unless the host is loopback`);
    }
    if (parsed.username || parsed.password) {
        reasons.push(`${label}: must not embed credentials in the URL`);
    }
    if (parsed.search) {
        reasons.push(`${label}: must not include a query string`);
    }
    if (parsed.hash) {
        reasons.push(`${label}: must not include a fragment`);
    }
    if (WILDCARD_PATTERN.test(url)) {
        reasons.push(`${label}: must not contain wildcard host text`);
    }
}

function checkRow(row, label, reasons, { regionalPrefixes } = {}) {
    if (!isPlainObject(row)) {
        reasons.push(`${label}: must be an object`);
        return;
    }

    const hasUrl = "url" in row;
    const hasTemplate = "urlTemplate" in row;
    const isUnsupported = row.url === null;

    if (isUnsupported) {
        if (!isNonEmptyString(row.unsupportedReason)) {
            reasons.push(`${label}: url is null but unsupportedReason is missing`);
        }
        return;
    }

    if (!hasUrl && !hasTemplate) {
        reasons.push(`${label}: must have either url or urlTemplate (or url: null + unsupportedReason)`);
        return;
    }

    if (!isNonEmptyString(row.sourcePointer)) {
        reasons.push(`${label}: not backed by source evidence (missing sourcePointer)`);
    }
    if (!isNonEmptyString(row.proofKind)) {
        reasons.push(`${label}: missing proofKind (unreviewed row)`);
    }

    if (hasUrl) {
        if (!isNonEmptyString(row.url)) {
            reasons.push(`${label}: url must be a non-empty string or null`);
        } else {
            checkServiceUrlShape(row.url, label, reasons);
        }
    }

    if (hasTemplate) {
        if (!isNonEmptyString(row.urlTemplate)) {
            reasons.push(`${label}: urlTemplate must be a non-empty string`);
        } else {
            const rendered = row.urlTemplate.replace("{prefix}", "euc1").replace("{subdomain}", "example");
            checkServiceUrlShape(rendered, label, reasons);
            if (regionalPrefixes && row.urlTemplate.includes("{prefix}") === false) {
                const referenced = Object.keys(regionalPrefixes).find((prefix) => row.urlTemplate.includes(prefix));
                if (!referenced && /https:\/\/[a-z0-9-]+\.clockify\.me/.test(row.urlTemplate)) {
                    const hostMatch = row.urlTemplate.match(/https:\/\/([a-z0-9-]+)\.clockify\.me/);
                    if (hostMatch && !Object.keys(regionalPrefixes).includes(hostMatch[1]) && hostMatch[1] !== "example") {
                        reasons.push(`${label}: urlTemplate references an unrecognized regional prefix "${hostMatch[1]}"`);
                    }
                }
            }
        }
        if (Array.isArray(row.alternateTemplates) && row.alternateTemplates.length > 0) {
            reasons.push(`${label}: conflicting profile templates (urlTemplate plus alternateTemplates)`);
        }
    }
}

/**
 * Validate a service-routing-matrix document. Returns { ok, reasons }.
 * Pure -- does not read the filesystem.
 */
export function validateServiceRoutingMatrix(matrix) {
    const reasons = [];

    if (!isPlainObject(matrix)) return { ok: false, reasons: ["matrix must be an object"] };
    if (matrix.schemaVersion !== 1) reasons.push("schemaVersion must be 1");
    if (!isPlainObject(matrix.profiles) || Object.keys(matrix.profiles).length === 0) {
        reasons.push("profiles must be a non-empty object");
        return { ok: false, reasons };
    }

    const regionalPrefixes = isPlainObject(matrix.regionalPrefixes) ? matrix.regionalPrefixes : undefined;

    for (const [profileName, profile] of Object.entries(matrix.profiles)) {
        if (!isPlainObject(profile)) {
            reasons.push(`profiles.${profileName}: must be an object`);
            continue;
        }
        for (const serviceKey of REQUIRED_SERVICE_KEYS) {
            if (!(serviceKey in profile)) {
                reasons.push(`profiles.${profileName}: missing required service key "${serviceKey}"`);
                continue;
            }
            checkRow(profile[serviceKey], `profiles.${profileName}.${serviceKey}`, reasons, { regionalPrefixes });
        }
    }

    if (isPlainObject(matrix.profileAliases)) {
        const targets = Object.values(matrix.profileAliases);
        const seen = new Set();
        for (const target of targets) {
            if (seen.has(target)) {
                reasons.push(`profileAliases: duplicate profile alias target "${target}"`);
            }
            seen.add(target);
        }
    }

    if (matrix.conflicts !== undefined && !Array.isArray(matrix.conflicts)) {
        reasons.push("conflicts must be an array when present");
    } else if (Array.isArray(matrix.conflicts)) {
        for (const conflict of matrix.conflicts) {
            if (isPlainObject(conflict) && conflict.needsHumanResolution === true) {
                reasons.push(`conflicts: unresolved conflict "${conflict.id ?? "<unknown>"}" (needsHumanResolution: true)`);
            }
        }
    }

    // H02-ROUTING approval gate (runtime routing must never be built from a
    // provisional/unapproved matrix -- this is a permanent property of the
    // checker from H02-ROUTING onward, not a one-time check).
    if (matrix.approved !== true) {
        reasons.push("approved must be exactly true (H02-ROUTING has not signed off on this matrix)");
    }
    for (const field of ["approvedBy", "approvedDate", "sourceRevision"]) {
        if (!isNonEmptyString(matrix[field])) {
            reasons.push(`${field} must be a non-empty string (required once approved)`);
        }
    }
    const pendingMarker = findPendingReviewMarker(matrix);
    if (pendingMarker) {
        reasons.push(`matrix contains a pending-review marker "${pendingMarker}" -- not safe to treat as approved`);
    }

    return { ok: reasons.length === 0, reasons };
}

/**
 * Resolve each corrected-spec operation to exactly one service id by its
 * effective server host (operation-level servers override, else the first
 * root server). Returns { ok, serviceByOperationId, counts, reasons }.
 * Pure -- takes already-parsed operations/root servers.
 */
export function deriveOperationServiceMap(operations, rootServers) {
    const HOST_TO_SERVICE = {
        "api.clockify.me": "api",
        "reports.api.clockify.me": "reports",
        "auditlog-api.api.clockify.me": "audit",
    };

    const reasons = [];
    const serviceByOperationId = {};
    const counts = { api: 0, reports: 0, audit: 0 };

    for (const operation of operations) {
        const servers = Array.isArray(operation.servers) && operation.servers.length > 0 ? operation.servers : rootServers;
        if (!Array.isArray(servers) || servers.length === 0) {
            reasons.push(`${operation.operationId}: no resolvable server (no operation override and no root servers)`);
            continue;
        }
        let host;
        try {
            host = new URL(servers[0].url).hostname;
        } catch {
            reasons.push(`${operation.operationId}: server url is not parseable`);
            continue;
        }
        const service = HOST_TO_SERVICE[host];
        if (!service) {
            reasons.push(`${operation.operationId}: resolves to unrecognized host "${host}"`);
            continue;
        }
        serviceByOperationId[operation.operationId] = service;
        counts[service] += 1;
    }

    return { ok: reasons.length === 0, serviceByOperationId, counts, reasons };
}

function extractOperations(doc) {
    const operations = [];
    for (const [operationPath, pathItem] of Object.entries(doc.paths ?? {})) {
        for (const method of ["get", "post", "put", "patch", "delete", "head", "options"]) {
            const operation = pathItem[method];
            if (!operation) continue;
            operations.push({
                operationId: operation.operationId,
                method: method.toUpperCase(),
                path: operationPath,
                servers: operation.servers,
            });
        }
    }
    return operations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const matrixPath = path.join(root, "docs", "service-routing-matrix.json");
    const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
    const matrixResult = validateServiceRoutingMatrix(matrix);
    if (!matrixResult.ok) {
        console.error("service-routing-matrix validation failed:");
        for (const reason of matrixResult.reasons) console.error(`- ${reason}`);
        process.exit(1);
    }

    const correctedDoc = YAML.parse(fs.readFileSync(path.join(root, "spec", "corrected", "clockify.corrected.openapi.yaml"), "utf8"));
    const operations = extractOperations(correctedDoc);
    const mapResult = deriveOperationServiceMap(operations, correctedDoc.servers);
    if (!mapResult.ok) {
        console.error("operation-to-service derivation failed:");
        for (const reason of mapResult.reasons) console.error(`- ${reason}`);
        process.exit(1);
    }

    console.log(
        `service-routing-matrix valid; ${operations.length} operations map to exactly one service (api=${mapResult.counts.api}, reports=${mapResult.counts.reports}, audit=${mapResult.counts.audit}).`,
    );
}
