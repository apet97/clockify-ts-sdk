import assert from "node:assert/strict";
import test from "node:test";

import {
    compareStoredOperationServiceDerivation,
    deriveOperationServiceMap,
    validateServiceRoutingMatrix,
    validateSubdomainLabel,
} from "./service-routing-matrix.mjs";

const REGIONAL_PREFIXES = { euc1: "EU (Germany)", use2: "USA", euw2: "UK", apse2: "AU" };

function validRow(url) {
    return { url, sourcePointer: "spec/corrected/clockify.corrected.openapi.yaml#/servers", proofKind: "spec-corrected" };
}

function unsupportedRow(reason) {
    return { url: null, unsupportedReason: reason };
}

function minimalValidMatrix() {
    return {
        schemaVersion: 1,
        approved: true,
        approvedBy: "apet97",
        approvedDate: "2026-07-27",
        sourceRevision: "092642d",
        regionalPrefixes: REGIONAL_PREFIXES,
        profiles: {
            global: {
                regular: validRow("https://api.clockify.me/api/v1"),
                reports: validRow("https://reports.api.clockify.me/v1"),
                audit: validRow("https://auditlog-api.api.clockify.me/v1"),
                pto: unsupportedRow("confirmed dead/speculative allowlist entry; no operation will route here"),
            },
        },
        conflicts: [],
    };
}

test("accepts a minimal well-formed matrix", () => {
    const result = validateServiceRoutingMatrix(minimalValidMatrix());
    assert.equal(result.ok, true, JSON.stringify(result.reasons));
});

test("rejects a profile missing a required service key", () => {
    const matrix = minimalValidMatrix();
    delete matrix.profiles.global.audit;
    const result = validateServiceRoutingMatrix(matrix);
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes("audit")), JSON.stringify(result.reasons));
});

test("rejects a service URL with no sourcePointer (not backed by source evidence)", () => {
    const matrix = minimalValidMatrix();
    matrix.profiles.global.reports = { url: "https://reports.api.clockify.me/v1" };
    const result = validateServiceRoutingMatrix(matrix);
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes("sourcePointer")), JSON.stringify(result.reasons));
});

test("rejects plain HTTP on a non-loopback service URL", () => {
    const matrix = minimalValidMatrix();
    matrix.profiles.global.regular = validRow("http://api.clockify.me/api/v1");
    const result = validateServiceRoutingMatrix(matrix);
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes("https")), JSON.stringify(result.reasons));
});

test("accepts plain HTTP on loopback (test/mock override)", () => {
    const matrix = minimalValidMatrix();
    matrix.profiles.global.regular = validRow("http://localhost:4010/api/v1");
    const result = validateServiceRoutingMatrix(matrix);
    assert.equal(result.ok, true, JSON.stringify(result.reasons));
});

test("rejects credentials embedded in a service URL", () => {
    const matrix = minimalValidMatrix();
    matrix.profiles.global.regular = validRow("https://user:pass@api.clockify.me/api/v1");
    const result = validateServiceRoutingMatrix(matrix);
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes("credentials")), JSON.stringify(result.reasons));
});

test("rejects a query string or fragment in a service base URL", () => {
    for (const bad of ["https://api.clockify.me/api/v1?x=1", "https://api.clockify.me/api/v1#frag"]) {
        const matrix = minimalValidMatrix();
        matrix.profiles.global.regular = validRow(bad);
        const result = validateServiceRoutingMatrix(matrix);
        assert.equal(result.ok, false, bad);
        assert.ok(result.reasons.some((r) => r.includes("query") || r.includes("fragment")), JSON.stringify(result.reasons));
    }
});

test("rejects wildcard host text", () => {
    const matrix = minimalValidMatrix();
    matrix.profiles.global.regular = validRow("https://*.clockify.me/api/v1");
    const result = validateServiceRoutingMatrix(matrix);
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes("wildcard")), JSON.stringify(result.reasons));
});

test("rejects an unreviewed row (missing proofKind) even with a sourcePointer present", () => {
    const matrix = minimalValidMatrix();
    matrix.profiles.global.regular = { url: "https://api.clockify.me/api/v1", sourcePointer: "somewhere" };
    const result = validateServiceRoutingMatrix(matrix);
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes("proofKind")), JSON.stringify(result.reasons));
});

test("rejects duplicate profile aliases", () => {
    const matrix = minimalValidMatrix();
    matrix.profiles.eu = matrix.profiles.global;
    matrix.profileAliases = { europe: "eu", eu: "eu" };
    const result = validateServiceRoutingMatrix(matrix);
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes("duplicate")), JSON.stringify(result.reasons));
});

test("rejects an unrecognized regional prefix referenced by a template", () => {
    const matrix = minimalValidMatrix();
    matrix.profiles.eu = {
        regular: { urlTemplate: "https://zz9.clockify.me/api/v1", sourcePointer: "spec/official", proofKind: "official-doc-only" },
        reports: unsupportedRow("n/a"),
        audit: unsupportedRow("n/a"),
        pto: unsupportedRow("n/a"),
    };
    const result = validateServiceRoutingMatrix(matrix);
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes("zz9") || r.includes("regional prefix")), JSON.stringify(result.reasons));
});

test("rejects conflicting profile templates for the same profile/service", () => {
    const matrix = minimalValidMatrix();
    matrix.profiles.eu = {
        regular: {
            urlTemplate: "https://euc1.clockify.me/api/v1",
            alternateTemplates: ["https://euc1-alt.clockify.me/api/v1"],
            sourcePointer: "spec/official",
            proofKind: "official-doc-only",
        },
        reports: unsupportedRow("n/a"),
        audit: unsupportedRow("n/a"),
        pto: unsupportedRow("n/a"),
    };
    const result = validateServiceRoutingMatrix(matrix);
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes("conflicting")), JSON.stringify(result.reasons));
});

// --- H02-ROUTING approval gate ---

test("rejects a matrix that is not approved:true", () => {
    const matrix = minimalValidMatrix();
    matrix.approved = false;
    const result = validateServiceRoutingMatrix(matrix);
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes("approved")), JSON.stringify(result.reasons));
});

test("rejects a matrix missing approvedBy/approvedDate/sourceRevision", () => {
    const matrix = minimalValidMatrix();
    delete matrix.approvedBy;
    const result = validateServiceRoutingMatrix(matrix);
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes("approvedBy")), JSON.stringify(result.reasons));
});

test("rejects an unresolved conflict (needsHumanResolution:true) in an approved matrix", () => {
    const matrix = minimalValidMatrix();
    matrix.conflicts = [{ id: "x", description: "y", needsHumanResolution: true }];
    const result = validateServiceRoutingMatrix(matrix);
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes("unresolved conflict")), JSON.stringify(result.reasons));
});

test("accepts a resolved conflict (needsHumanResolution:false) in an approved matrix", () => {
    const matrix = minimalValidMatrix();
    matrix.conflicts = [{ id: "x", description: "y", needsHumanResolution: false, resolution: "decided" }];
    const result = validateServiceRoutingMatrix(matrix);
    assert.equal(result.ok, true, JSON.stringify(result.reasons));
});

test("rejects a lingering pending-review marker anywhere in an approved matrix", () => {
    for (const marker of ["TODO", "TBD", "flagged for human confirmation", "needs human confirmation"]) {
        const matrix = minimalValidMatrix();
        matrix.profiles.global.pto.unsupportedReason = `${marker}: still deciding`;
        const result = validateServiceRoutingMatrix(matrix);
        assert.equal(result.ok, false, marker);
        assert.ok(result.reasons.some((r) => r.includes("pending-review marker")), JSON.stringify(result.reasons));
    }
});

// --- subdomain label validation ---

test("validateSubdomainLabel accepts a plain lowercase alphanumeric-hyphen label", () => {
    assert.equal(validateSubdomainLabel("acme-corp").ok, true);
    assert.equal(validateSubdomainLabel("a").ok, true);
});

test("validateSubdomainLabel rejects dots (a label, not a full domain)", () => {
    assert.equal(validateSubdomainLabel("acme.corp").ok, false);
});

test("validateSubdomainLabel rejects uppercase (case-normalization surprise)", () => {
    assert.equal(validateSubdomainLabel("AcmeCorp").ok, false);
});

test("validateSubdomainLabel rejects punycode/IDN labels", () => {
    assert.equal(validateSubdomainLabel("xn--mnchen-3ya").ok, false);
});

test("validateSubdomainLabel rejects leading or trailing hyphen", () => {
    assert.equal(validateSubdomainLabel("-acme").ok, false);
    assert.equal(validateSubdomainLabel("acme-").ok, false);
});

test("validateSubdomainLabel rejects the empty label", () => {
    assert.equal(validateSubdomainLabel("").ok, false);
});

// --- operation -> service derivation ---

function op(operationId, method, path, serversOverride) {
    return { operationId, method, path, servers: serversOverride };
}

test("deriveOperationServiceMap maps every operation to exactly one service by resolved host", () => {
    const rootServers = [{ url: "https://api.clockify.me/api/v1" }];
    const operations = [
        op("getWorkspaces", "GET", "/workspaces"),
        op("exportReport", "POST", "/workspaces/{id}/reports/detailed", [{ url: "https://reports.api.clockify.me/v1" }]),
        op("getAuditLog", "GET", "/workspaces/{id}/audit-log", [{ url: "https://auditlog-api.api.clockify.me/v1" }]),
        op("submitTimeOffRequest", "POST", "/workspaces/{id}/time-off-requests"),
    ];
    const result = deriveOperationServiceMap(operations, rootServers);
    assert.equal(result.ok, true, JSON.stringify(result.reasons));
    assert.deepEqual(result.serviceByOperationId, {
        getWorkspaces: "api",
        exportReport: "reports",
        getAuditLog: "audit",
        submitTimeOffRequest: "api",
    });
    assert.deepEqual(result.counts, { api: 2, reports: 1, audit: 1 });
});

test("deriveOperationServiceMap flags an operation with no resolvable host", () => {
    const operations = [op("orphan", "GET", "/orphan")];
    const result = deriveOperationServiceMap(operations, []);
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes("orphan")), JSON.stringify(result.reasons));
});

test("deriveOperationServiceMap flags an operation resolving to an unrecognized host", () => {
    const operations = [op("weird", "GET", "/weird", [{ url: "https://unexpected.clockify.me/v1" }])];
    const result = deriveOperationServiceMap(operations, [{ url: "https://api.clockify.me/api/v1" }]);
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes("unexpected.clockify.me")), JSON.stringify(result.reasons));
});

test("stored routing counts must match the current operation derivation", () => {
    const derivation = {
        totalOperations: 4,
        counts: { api: 2, reports: 1, audit: 1 },
        serviceByOperationId: { a: "api", b: "api", c: "reports", d: "audit" },
    };
    const matrix = {
        operationServiceDerivation: {
            totalOperations: 4,
            counts: { api: 2, reports: 1, audit: 1 },
        },
    };
    assert.deepEqual(compareStoredOperationServiceDerivation(matrix, derivation), { ok: true, reasons: [] });

    matrix.operationServiceDerivation.counts.api = 158;
    const drift = compareStoredOperationServiceDerivation(matrix, derivation);
    assert.equal(drift.ok, false);
    assert.ok(drift.reasons.some((reason) => reason.includes("counts.api")), JSON.stringify(drift.reasons));
});

test("routing snapshot comparison rejects a missing derivation block", () => {
    const result = compareStoredOperationServiceDerivation({}, { totalOperations: 1, counts: { api: 1 } });
    assert.equal(result.ok, false);
    assert.match(result.reasons[0], /must be an object/);
});
