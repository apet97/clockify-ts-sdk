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
    const evidenceMappings = [];
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
            evidenceMappings.push({
                operationId,
                evidenceIds: ["fern.x-fern-sdk-method-name.drops-resource-modules"],
            });
        }
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
        evidenceMappings,
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
    fixture.evidenceMappings = [
        {
            operationId: "operation0",
            evidenceIds: ["invoices.update.missing-bill-from-and-client-address"],
        },
    ];

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

test("rejects orphaned, unknown, duplicate, and mismatched operation evidence", () => {
    const fixture = canonicalFixture();
    fixture.knownEvidenceIds = new Set([
        "fern.x-fern-sdk-method-name.drops-resource-modules",
    ]);
    fixture.evidenceMappings.push(
        {
            operationId: "orphanOperation",
            evidenceIds: ["fern.x-fern-sdk-method-name.drops-resource-modules"],
        },
        {
            operationId: "operation0",
            evidenceIds: ["unknown.evidence.anchor"],
        },
        {
            operationId: "operation0",
            evidenceIds: ["fern.x-fern-sdk-method-name.drops-resource-modules"],
        },
    );
    fixture.artifact.operations[155].evidenceIds = [];

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /orphanOperation.*evidence mapping.*missing.*inventory/i.test(failure)));
    assert.ok(failures.some((failure) => /operation0.*duplicate evidence mapping/i.test(failure)));
    assert.ok(failures.some((failure) => /operation0.*unknown evidenceId/i.test(failure)));
    assert.ok(failures.some((failure) => /operation155.*evidenceIds differ from governance/i.test(failure)));
});

test("governs the corrected scheduling and explicit invoice evidence attribution", () => {
    const evidenceDocument = JSON.parse(
        readFileSync(new URL("../docs/operation-evidence-map.json", import.meta.url), "utf8"),
    );
    const evidenceByOperation = new Map(
        evidenceDocument.mappings.map((mapping) => [mapping.operationId, mapping.evidenceIds]),
    );

    assert.deepEqual(evidenceByOperation.get("createRecurringAssignment"), [
        "scheduling.createRecurring.returns-array-and-publish-is-range-scoped",
    ]);
    assert.ok(
        !evidenceByOperation
            .get("changeRecurringPeriod")
            .includes("scheduling.createRecurring.returns-array-and-publish-is-range-scoped"),
    );
    assert.deepEqual(evidenceByOperation.get("updateInvoice"), [
        "invoices.update.replace-and-tax-discount-zeroing",
        "invoices.update.missing-bill-from-and-client-address",
    ]);
});
