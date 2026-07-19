#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
    buildOperationDisposition,
    validateOperationDisposition,
} from "./lib/operation-parity-contract.mjs";

function canonicalFixture() {
    const explicitCount = 155;
    const derivedCount = 14;
    const inventoryOperations = [];
    const receiptOperations = [];
    const classifications = [];
    const evidenceAnchors = [];
    const evidenceAudit = [];
    const dispositions = [];

    for (let index = 0; index < explicitCount + derivedCount; index += 1) {
        const operationId = `operation${index}`;
        const explicit = index < explicitCount;
        const resource = `resource${index}`;
        const methodName = `method${index}`;
        const httpMethod = index % 2 === 0 ? "GET" : "POST";
        const operationPath = `/operations/${index}`;
        inventoryOperations.push({
            operationId,
            method: httpMethod,
            path: operationPath,
            sdkGroup: explicit ? resource : null,
            sdkMethod: explicit ? methodName : null,
        });
        receiptOperations.push({ operationId, resource, methodName, httpMethod, path: operationPath });
        if (!explicit) {
            classifications.push({
                operationId,
                sdkNaming: "operationId-derived",
                generatedGroup: resource,
                generatedMethod: methodName,
            });
        }
        evidenceAudit.push(
            explicit
                ? {
                      operationId,
                      status: "audited-no-applicable-evidence",
                      evidenceIds: [],
                      reason: "No operation-specific discrepancy anchor applies in the current ledger.",
                  }
                : {
                      operationId,
                      status: "applicable",
                      evidenceIds: ["fern.x-fern-sdk-method-name.drops-resource-modules"],
                  },
        );
        dispositions.push({
            operationId,
            httpMethod,
            path: operationPath,
            generated: {
                group: resource,
                method: methodName,
                clientPath: `client.${resource}.${methodName}`,
                reachable: true,
            },
            sdkNaming: explicit ? "explicit" : "operationId-derived",
            evidenceIds: explicit ? [] : ["fern.x-fern-sdk-method-name.drops-resource-modules"],
        });
    }

    return {
        inventory: { operationCount: 169, operations: inventoryOperations },
        receipt: { ok: true, operationCount: 169, operations: receiptOperations },
        classifications,
        evidenceAnchors: [
            {
                evidenceId: "fern.x-fern-sdk-method-name.drops-resource-modules",
                applicability: "operation-specific",
                operationIds: classifications.map((classification) => classification.operationId),
            },
        ],
        evidenceAudit,
        knownEvidenceIds: new Set(["fern.x-fern-sdk-method-name.drops-resource-modules"]),
        artifact: {
            schemaVersion: 1,
            summary: {
                sdkGenerated: 169,
                sdkExplicitlyNamed: 155,
                sdkOperationIdDerived: 14,
            },
            operations: dispositions,
        },
    };
}

test("rejects an omitted operation evidence-audit row", () => {
    const fixture = canonicalFixture();
    fixture.evidenceAudit.pop();

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /operation168.*missing.*evidence audit/i.test(failure)));
});

test("rejects a false audited-no-evidence marker when the anchor inventory maps evidence", () => {
    const fixture = canonicalFixture();
    fixture.evidenceAudit[155] = {
        operationId: "operation155",
        status: "audited-no-applicable-evidence",
        evidenceIds: [],
        reason: "Incorrect empty marker.",
    };

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /operation155.*evidence audit.*anchor inventory/i.test(failure)));
});

test("requires every no-applicable-evidence audit row to carry an explicit empty evidenceIds array", () => {
    const fixture = canonicalFixture();
    delete fixture.evidenceAudit[0].evidenceIds;

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /operation0.*evidenceIds.*array/i.test(failure)));
});

test("rejects duplicate, orphaned, and incomplete operation evidence-audit rows", () => {
    const fixture = canonicalFixture();
    fixture.evidenceAudit[168] = structuredClone(fixture.evidenceAudit[167]);
    fixture.evidenceAudit.push({
        operationId: "orphanOperation",
        status: "audited-no-applicable-evidence",
        evidenceIds: [],
        reason: "Not a real operation.",
    });

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /operation167.*duplicate evidence audit/i.test(failure)));
    assert.ok(failures.some((failure) => /operation168.*missing evidence audit/i.test(failure)));
    assert.ok(failures.some((failure) => /orphanOperation.*evidence audit.*missing.*inventory/i.test(failure)));
});

test("rejects a discrepancy-ledger anchor omitted from the reviewed anchor inventory", () => {
    const fixture = canonicalFixture();
    fixture.knownEvidenceIds.add("new.unreviewed.anchor");

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /new\.unreviewed\.anchor.*missing.*anchor inventory/i.test(failure)));
});

test("rejects an anchor inventory set that disagrees with independent semantic expectations", () => {
    const fixture = canonicalFixture();
    fixture.semanticEvidenceExpectations = {
        "fern.x-fern-sdk-method-name.drops-resource-modules": {
            applicability: "operation-specific",
            operationIds: fixture.classifications.map((classification) => classification.operationId),
        },
    };
    fixture.evidenceAnchors[0].operationIds.pop();

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /drops-resource-modules.*semantic expectation/i.test(failure)));
});

test("rejects the stale 156 explicit / 13 operationId-derived expectation", () => {
    const fixture = canonicalFixture();
    fixture.artifact.summary.sdkExplicitlyNamed = 156;
    fixture.artifact.summary.sdkOperationIdDerived = 13;

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /sdkExplicitlyNamed.*155.*156/.test(failure)));
    assert.ok(failures.some((failure) => /sdkOperationIdDerived.*14.*13/.test(failure)));
});

test("rejects a new operationId-derived operation without a governed classification", () => {
    const fixture = canonicalFixture();
    fixture.classifications = fixture.classifications.filter(
        (classification) => classification.operationId !== "operation168",
    );

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /operation168.*unclassified.*operationId-derived/i.test(failure)));
});

test("rejects a renamed operationId-derived operation and its orphaned classification", () => {
    const fixture = canonicalFixture();
    fixture.inventory.operations.at(-1).operationId = "renamedOperation168";
    fixture.receipt.operations.at(-1).operationId = "renamedOperation168";
    fixture.artifact.operations.at(-1).operationId = "renamedOperation168";

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /renamedOperation168.*unclassified/i.test(failure)));
    assert.ok(failures.some((failure) => /operation168.*classification.*missing.*inventory/i.test(failure)));
});

test("rejects duplicate and missing disposition rows", () => {
    const duplicate = canonicalFixture();
    duplicate.artifact.operations[168] = structuredClone(duplicate.artifact.operations[167]);
    const duplicateFailures = validateOperationDisposition(duplicate);
    assert.ok(duplicateFailures.some((failure) => /operation167.*duplicate.*disposition/i.test(failure)));
    assert.ok(duplicateFailures.some((failure) => /operation168.*missing.*disposition/i.test(failure)));

    const missing = canonicalFixture();
    missing.artifact.operations.pop();
    const missingFailures = validateOperationDisposition(missing);
    assert.ok(missingFailures.some((failure) => /operation168.*missing.*disposition/i.test(failure)));
});

test("rejects receipt and disposition artifact count mismatches", () => {
    const fixture = canonicalFixture();
    fixture.receipt.operationCount = 168;
    fixture.receipt.operations.pop();

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /receipt\.operationCount.*expected 169.*got 168/i.test(failure)));
    assert.ok(failures.some((failure) => /receipt.*168.*artifact.*169/i.test(failure)));
});

test("rejects explicit and operationId-derived naming classification inversions", () => {
    const fixture = canonicalFixture();
    fixture.classifications.push({
        operationId: "operation0",
        sdkNaming: "operationId-derived",
        generatedGroup: "resource0",
        generatedMethod: "method0",
    });
    fixture.artifact.operations[0].sdkNaming = "operationId-derived";
    fixture.artifact.operations[155].sdkNaming = "explicit";

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /operation0.*OpenAPI.*explicit.*classified.*operationId-derived/i.test(failure)));
    assert.ok(failures.some((failure) => /operation155.*OpenAPI.*operationId-derived.*artifact.*explicit/i.test(failure)));
});

test("accepts all 169 generated operations exactly once with the governed 155 / 14 split", () => {
    assert.deepEqual(validateOperationDisposition(canonicalFixture()), []);
});

test("builds generated reachability from the codegen receipt for explicit and derived operations", () => {
    const fixture = canonicalFixture();
    const explicitReceipt = fixture.receipt.operations[0];
    const derivedReceipt = fixture.receipt.operations[155];
    explicitReceipt.resource = "receiptExplicitGroup";
    explicitReceipt.methodName = "receiptExplicitMethod";
    derivedReceipt.resource = "receiptDerivedGroup";
    derivedReceipt.methodName = "receiptDerivedMethod";

    const artifact = buildOperationDisposition(fixture);

    assert.deepEqual(artifact.summary, {
        sdkGenerated: 169,
        sdkExplicitlyNamed: 155,
        sdkOperationIdDerived: 14,
    });
    assert.deepEqual(artifact.operations[0].generated, {
        group: "receiptExplicitGroup",
        method: "receiptExplicitMethod",
        clientPath: "client.receiptExplicitGroup.receiptExplicitMethod",
        reachable: true,
    });
    assert.deepEqual(artifact.operations[155].generated, {
        group: "receiptDerivedGroup",
        method: "receiptDerivedMethod",
        clientPath: "client.receiptDerivedGroup.receiptDerivedMethod",
        reachable: true,
    });
});

test("governs evidence for an explicit operation independently of SDK naming classification", () => {
    const fixture = canonicalFixture();
    fixture.evidenceAudit[0] =
        {
            operationId: "operation0",
            status: "applicable",
            evidenceIds: ["invoices.update.missing-bill-from-and-client-address"],
        };

    const artifact = buildOperationDisposition(fixture);

    assert.deepEqual(artifact.operations[0].evidenceIds, [
        "invoices.update.missing-bill-from-and-client-address",
    ]);
    assert.deepEqual(artifact.operations[1].evidenceIds, []);
});

test("rejects evidence embedded in the SDK naming registry", () => {
    const fixture = canonicalFixture();
    fixture.classifications[0].evidenceIds = [
        "fern.x-fern-sdk-method-name.drops-resource-modules",
    ];

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /classification.*must not govern evidence/i.test(failure)));
});

test("rejects an unsuccessful receipt plus duplicate and missing receipt operations", () => {
    const fixture = canonicalFixture();
    fixture.receipt.ok = false;
    fixture.receipt.operations[168] = structuredClone(fixture.receipt.operations[167]);

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /receipt\.ok.*expected true/i.test(failure)));
    assert.ok(failures.some((failure) => /operation167.*duplicate.*receipt/i.test(failure)));
    assert.ok(failures.some((failure) => /operation168.*missing.*receipt/i.test(failure)));
});

test("rejects receipt and disposition method or path drift", () => {
    const fixture = canonicalFixture();
    fixture.receipt.operations[0].path = "/wrong-receipt-path";
    fixture.artifact.operations[1].httpMethod = "DELETE";

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /operation0.*receipt method\/path.*OpenAPI/i.test(failure)));
    assert.ok(failures.some((failure) => /operation1.*disposition method\/path.*receipt/i.test(failure)));
});

test("rejects orphaned, unknown, duplicate, and mismatched anchor-governed evidence", () => {
    const fixture = canonicalFixture();
    fixture.evidenceAnchors[0].operationIds.push("orphanOperation");
    fixture.evidenceAnchors.push(
        structuredClone(fixture.evidenceAnchors[0]),
        {
            evidenceId: "unknown.evidence.anchor",
            applicability: "operation-specific",
            operationIds: ["operation0"],
        },
    );
    fixture.artifact.operations[155].evidenceIds = [];

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /anchor inventory.*unknown operation orphanOperation/i.test(failure)));
    assert.ok(failures.some((failure) => /duplicate evidence anchor/i.test(failure)));
    assert.ok(failures.some((failure) => /unknown\.evidence\.anchor.*absent.*discrepancy ledger/i.test(failure)));
    assert.ok(failures.some((failure) => /operation155.*evidenceIds differ from governance/i.test(failure)));
});

test("governs all 169 operations and the reviewed concrete evidence omissions", () => {
    const evidenceDocument = JSON.parse(
        readFileSync(new URL("../docs/operation-evidence-map.json", import.meta.url), "utf8"),
    );
    const evidenceByOperation = new Map(
        evidenceDocument.operations.map((row) => [row.operationId, row.evidenceIds]),
    );

    assert.equal(evidenceDocument.operations.length, 169);
    assert.equal(evidenceByOperation.size, 169);
    assert.deepEqual(evidenceByOperation.get("createRecurringAssignment"), [
        "scheduling.createRecurring.returns-array-and-publish-is-range-scoped",
    ]);
    assert.ok(
        evidenceByOperation
            .get("publishAssignments")
            .includes("scheduling.createRecurring.returns-array-and-publish-is-range-scoped"),
    );
    assert.ok(
        !evidenceByOperation
            .get("changeRecurringPeriod")
            .includes("scheduling.createRecurring.returns-array-and-publish-is-range-scoped"),
    );
    assert.ok(
        evidenceByOperation.get("addInvoice").includes("invoices.create.note-subject-dropped"),
    );
    assert.ok(
        evidenceByOperation
            .get("createWebhook")
            .includes("webhook.create.name-required-on-api-key-not-addon"),
    );
    assert.ok(
        evidenceByOperation
            .get("getTimeOffPolicies")
            .includes("getTimeOffPolicies.sort-order.enum-tightened"),
    );
});

test("classifies every unique current discrepancy-ledger anchor exactly once", () => {
    const ledger = readFileSync(
        new URL("../spec/evidence/discrepancies.md", import.meta.url),
        "utf8",
    );
    const ledgerIds = new Set([...ledger.matchAll(/^### `([^`]+)`/gm)].map((match) => match[1]));
    const anchorDocument = JSON.parse(
        readFileSync(
            new URL("../docs/operation-evidence-anchor-inventory.json", import.meta.url),
            "utf8",
        ),
    );
    const anchorIds = anchorDocument.anchors.map((anchor) => anchor.evidenceId);

    assert.equal(ledgerIds.size, 62);
    assert.equal(anchorIds.length, 62);
    assert.deepEqual(new Set(anchorIds), ledgerIds);
});
