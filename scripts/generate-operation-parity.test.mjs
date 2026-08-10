#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
    buildOperationDisposition,
    validateOperationDisposition,
} from "./lib/operation-parity-contract.mjs";
import { withoutGoMcpProvenance } from "./lib/operation-parity-provenance.mjs";
import {
    candidateTools,
    methodAliasKeys,
    methodSourceFor,
    rawGroupFor,
    resourceAliases,
    toSnake,
} from "./lib/operation-parity-aliases.mjs";

function canonicalFixture() {
    const explicitCount = 149;
    const derivedCount = 19;
    const inventoryOperations = [];
    const receiptOperations = [];
    const classifications = [];
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
        receiptOperations.push({
            operationId,
            resource,
            methodName,
            httpMethod,
            path: operationPath,
        });
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
        inventory: { operationCount: 168, operations: inventoryOperations },
        receipt: { ok: true, operationCount: 168, operations: receiptOperations },
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
                sdkGenerated: 168,
                sdkExplicitlyNamed: 149,
                sdkOperationIdDerived: 19,
            },
            operations: dispositions,
        },
    };
}

test("rejects an omitted operation evidence-audit row", () => {
    const fixture = canonicalFixture();
    fixture.evidenceAudit.pop();

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /operation167.*missing.*evidence audit/i.test(failure)));
});

test("rejects a false audited-no-evidence marker when the anchor inventory maps evidence", () => {
    const fixture = canonicalFixture();
    fixture.evidenceAudit[149] = {
        operationId: "operation149",
        status: "audited-no-applicable-evidence",
        evidenceIds: [],
        reason: "Incorrect empty marker.",
    };

    const failures = validateOperationDisposition(fixture);

    assert.ok(
        failures.some((failure) => /operation149.*evidence audit.*anchor inventory/i.test(failure)),
    );
});

test("requires every no-applicable-evidence audit row to carry an explicit empty evidenceIds array", () => {
    const fixture = canonicalFixture();
    delete fixture.evidenceAudit[0].evidenceIds;

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /operation0.*evidenceIds.*array/i.test(failure)));
});

test("rejects duplicate, orphaned, and incomplete operation evidence-audit rows", () => {
    const fixture = canonicalFixture();
    fixture.evidenceAudit[167] = structuredClone(fixture.evidenceAudit[166]);
    fixture.evidenceAudit.push({
        operationId: "orphanOperation",
        status: "audited-no-applicable-evidence",
        evidenceIds: [],
        reason: "Not a real operation.",
    });

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /operation166.*duplicate evidence audit/i.test(failure)));
    assert.ok(failures.some((failure) => /operation167.*missing evidence audit/i.test(failure)));
    assert.ok(
        failures.some((failure) =>
            /orphanOperation.*evidence audit.*missing.*inventory/i.test(failure),
        ),
    );
});

test("rejects a discrepancy-ledger anchor omitted from the reviewed anchor inventory", () => {
    const fixture = canonicalFixture();
    fixture.knownEvidenceIds.add("new.unreviewed.anchor");

    const failures = validateOperationDisposition(fixture);

    assert.ok(
        failures.some((failure) =>
            /new\.unreviewed\.anchor.*missing.*anchor inventory/i.test(failure),
        ),
    );
});

test("rejects an anchor inventory set that disagrees with independent semantic expectations", () => {
    const fixture = canonicalFixture();
    fixture.semanticEvidenceExpectations = {
        "fern.x-fern-sdk-method-name.drops-resource-modules": {
            applicability: "operation-specific",
            operationIds: fixture.classifications.map(
                (classification) => classification.operationId,
            ),
        },
    };
    fixture.evidenceAnchors[0].operationIds.pop();

    const failures = validateOperationDisposition(fixture);

    assert.ok(
        failures.some((failure) => /drops-resource-modules.*semantic expectation/i.test(failure)),
    );
});

test("rejects the stale 147 explicit / 14 operationId-derived expectation", () => {
    const fixture = canonicalFixture();
    fixture.artifact.summary.sdkExplicitlyNamed = 147;
    fixture.artifact.summary.sdkOperationIdDerived = 14;

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /sdkExplicitlyNamed.*149.*147/.test(failure)));
    assert.ok(failures.some((failure) => /sdkOperationIdDerived.*19.*14/.test(failure)));
});

test("rejects a new operationId-derived operation without a governed classification", () => {
    const fixture = canonicalFixture();
    fixture.classifications = fixture.classifications.filter(
        (classification) => classification.operationId !== "operation167",
    );

    const failures = validateOperationDisposition(fixture);

    assert.ok(
        failures.some((failure) =>
            /operation167.*unclassified.*operationId-derived/i.test(failure),
        ),
    );
});

test("rejects a renamed operationId-derived operation and its orphaned classification", () => {
    const fixture = canonicalFixture();
    fixture.inventory.operations.at(-1).operationId = "renamedOperation167";
    fixture.receipt.operations.at(-1).operationId = "renamedOperation167";
    fixture.artifact.operations.at(-1).operationId = "renamedOperation167";

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /renamedOperation167.*unclassified/i.test(failure)));
    assert.ok(
        failures.some((failure) =>
            /operation167.*classification.*missing.*inventory/i.test(failure),
        ),
    );
});

test("rejects duplicate and missing disposition rows", () => {
    const duplicate = canonicalFixture();
    duplicate.artifact.operations[167] = structuredClone(duplicate.artifact.operations[166]);
    const duplicateFailures = validateOperationDisposition(duplicate);
    assert.ok(
        duplicateFailures.some((failure) => /operation166.*duplicate.*disposition/i.test(failure)),
    );
    assert.ok(
        duplicateFailures.some((failure) => /operation167.*missing.*disposition/i.test(failure)),
    );

    const missing = canonicalFixture();
    missing.artifact.operations.pop();
    const missingFailures = validateOperationDisposition(missing);
    assert.ok(
        missingFailures.some((failure) => /operation167.*missing.*disposition/i.test(failure)),
    );
});

test("rejects receipt and disposition artifact count mismatches", () => {
    const fixture = canonicalFixture();
    fixture.receipt.operationCount = 167;
    fixture.receipt.operations.pop();

    const failures = validateOperationDisposition(fixture);

    assert.ok(
        failures.some((failure) => /receipt\.operationCount.*expected 168.*got 167/i.test(failure)),
    );
    assert.ok(failures.some((failure) => /receipt.*167.*artifact.*168/i.test(failure)));
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
    fixture.artifact.operations[149].sdkNaming = "explicit";

    const failures = validateOperationDisposition(fixture);

    assert.ok(
        failures.some((failure) =>
            /operation0.*OpenAPI.*explicit.*classified.*operationId-derived/i.test(failure),
        ),
    );
    assert.ok(
        failures.some((failure) =>
            /operation149.*OpenAPI.*operationId-derived.*artifact.*explicit/i.test(failure),
        ),
    );
});

test("accepts all 168 generated operations exactly once with the governed 149 / 19 split", () => {
    assert.deepEqual(validateOperationDisposition(canonicalFixture()), []);
});

test("builds generated reachability from the codegen receipt for explicit and derived operations", () => {
    const fixture = canonicalFixture();
    const explicitReceipt = fixture.receipt.operations[0];
    const derivedReceipt = fixture.receipt.operations[149];
    explicitReceipt.resource = "receiptExplicitGroup";
    explicitReceipt.methodName = "receiptExplicitMethod";
    derivedReceipt.resource = "receiptDerivedGroup";
    derivedReceipt.methodName = "receiptDerivedMethod";

    const artifact = buildOperationDisposition(fixture);

    assert.deepEqual(artifact.summary, {
        sdkGenerated: 168,
        sdkExplicitlyNamed: 149,
        sdkOperationIdDerived: 19,
    });
    assert.deepEqual(artifact.operations[0].generated, {
        group: "receiptExplicitGroup",
        method: "receiptExplicitMethod",
        clientPath: "client.receiptExplicitGroup.receiptExplicitMethod",
        reachable: true,
    });
    assert.deepEqual(artifact.operations[149].generated, {
        group: "receiptDerivedGroup",
        method: "receiptDerivedMethod",
        clientPath: "client.receiptDerivedGroup.receiptDerivedMethod",
        reachable: true,
    });
});

test("governs evidence for an explicit operation independently of SDK naming classification", () => {
    const fixture = canonicalFixture();
    fixture.evidenceAudit[0] = {
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
    fixture.classifications[0].evidenceIds = ["fern.x-fern-sdk-method-name.drops-resource-modules"];

    const failures = validateOperationDisposition(fixture);

    assert.ok(
        failures.some((failure) => /classification.*must not govern evidence/i.test(failure)),
    );
});

test("rejects an unsuccessful receipt plus duplicate and missing receipt operations", () => {
    const fixture = canonicalFixture();
    fixture.receipt.ok = false;
    fixture.receipt.operations[167] = structuredClone(fixture.receipt.operations[166]);

    const failures = validateOperationDisposition(fixture);

    assert.ok(failures.some((failure) => /receipt\.ok.*expected true/i.test(failure)));
    assert.ok(failures.some((failure) => /operation166.*duplicate.*receipt/i.test(failure)));
    assert.ok(failures.some((failure) => /operation167.*missing.*receipt/i.test(failure)));
});

test("rejects receipt and disposition method or path drift", () => {
    const fixture = canonicalFixture();
    fixture.receipt.operations[0].path = "/wrong-receipt-path";
    fixture.artifact.operations[1].httpMethod = "DELETE";

    const failures = validateOperationDisposition(fixture);

    assert.ok(
        failures.some((failure) => /operation0.*receipt method\/path.*OpenAPI/i.test(failure)),
    );
    assert.ok(
        failures.some((failure) => /operation1.*disposition method\/path.*receipt/i.test(failure)),
    );
});

test("rejects orphaned, unknown, duplicate, and mismatched anchor-governed evidence", () => {
    const fixture = canonicalFixture();
    fixture.evidenceAnchors[0].operationIds.push("orphanOperation");
    fixture.evidenceAnchors.push(structuredClone(fixture.evidenceAnchors[0]), {
        evidenceId: "unknown.evidence.anchor",
        applicability: "operation-specific",
        operationIds: ["operation0"],
    });
    fixture.artifact.operations[149].evidenceIds = [];

    const failures = validateOperationDisposition(fixture);

    assert.ok(
        failures.some((failure) =>
            /anchor inventory.*unknown operation orphanOperation/i.test(failure),
        ),
    );
    assert.ok(failures.some((failure) => /duplicate evidence anchor/i.test(failure)));
    assert.ok(
        failures.some((failure) =>
            /unknown\.evidence\.anchor.*absent.*discrepancy ledger/i.test(failure),
        ),
    );
    assert.ok(
        failures.some((failure) =>
            /operation149.*evidenceIds differ from governance/i.test(failure),
        ),
    );
});

test("governs all 168 operations and the reviewed concrete evidence omissions", () => {
    const evidenceDocument = JSON.parse(
        readFileSync(new URL("../docs/operation-evidence-map.json", import.meta.url), "utf8"),
    );
    const evidenceByOperation = new Map(
        evidenceDocument.operations.map((row) => [row.operationId, row.evidenceIds]),
    );

    assert.equal(evidenceDocument.operations.length, 168);
    assert.equal(evidenceByOperation.size, 168);
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

    // Deliberate-act ratchet: bump only alongside a new `### \`id\`` heading in
    // spec/evidence/discrepancies.md and its inventory row. 79 -> 86 for the
    // 2026-08-07 live re-probe wave, which also absorbs an off-by-one this
    // ratchet had been carrying since 11e1ce2: the ledger and the inventory
    // agreed at 79 while this pin still said 78, and only `make perfect-full`
    // runs the check, so contract-gates stayed green through it.
    // 86 -> 91 for the 2026-08-08 consumer-report probe wave.
    // 91 -> 94 for the sibling-session findings re-probed the same day.
    // 94 -> 101 for the second sibling pass: four date-window timezone findings
    // and three client-write findings, all live-probed 2026-08-08.
    // 101 -> 105 for the 2026-08-09 audit-remediation waves: the mis-paired
    // time-entries Fern method names, the archived-list default (live-probed),
    // and the two wave-F probes on project rate omission and the tag replace-PUT.
    assert.equal(ledgerIds.size, 105);
    assert.equal(anchorIds.length, 105);
    assert.deepEqual(new Set(anchorIds), ledgerIds);
});

// W5-fix: withoutGoMcpProvenance must ignore CI's sibling-less
// catalogPresent/carriedForward mismatch (no false red) while still
// catching a hand-forged carriedFromVerifiedAt (real gap this closes --
// see docs/operation-parity.json's sources.goMcp and
// check-operation-coverage.mjs's 90-day freshness gate, which trusts this
// field directly).
function goMcpFixture(overrides) {
    return JSON.stringify({
        sources: {
            goMcp: {
                path: "../GOCLMCP/docs/tool-catalog.json",
                catalogPresent: true,
                carriedForward: false,
                carriedFromVerifiedAt: "2026-08-10",
                ...overrides,
            },
        },
        unrelated: "content stays untouched",
    });
}

test("withoutGoMcpProvenance treats catalogPresent/carriedForward as environment noise", () => {
    const committed = goMcpFixture({ catalogPresent: true, carriedForward: false });
    const ciComputed = goMcpFixture({ catalogPresent: false, carriedForward: true });
    assert.equal(withoutGoMcpProvenance(committed), withoutGoMcpProvenance(ciComputed));
});

test("withoutGoMcpProvenance still catches a hand-forged carriedFromVerifiedAt", () => {
    const committed = goMcpFixture({ carriedFromVerifiedAt: "2026-08-10" });
    const forged = goMcpFixture({ carriedFromVerifiedAt: "2020-01-01" });
    assert.notEqual(withoutGoMcpProvenance(committed), withoutGoMcpProvenance(forged));
});

test("withoutGoMcpProvenance passes through non-goMcp content and malformed JSON unchanged", () => {
    assert.equal(withoutGoMcpProvenance(""), "");
    assert.equal(withoutGoMcpProvenance("not json"), "not json");
    const noGoMcp = JSON.stringify({ sources: {} });
    assert.equal(withoutGoMcpProvenance(noGoMcp), `${JSON.stringify({ sources: {} }, null, 2)}\n`);
});

// V6: resourceAliases and methodAliases are bound in both directions against
// the real repo data -- every key must be reachable (a key nothing reaches is
// dead code left over from a rename) and every alias must be able to produce
// at least one candidate tool name that actually exists in the real tool
// manifest (an alias pointing nowhere is either wrong or stale).
function realInventoryOperations() {
    const doc = JSON.parse(
        readFileSync(new URL("../docs/openapi-operations.json", import.meta.url), "utf8"),
    );
    return doc.operations ?? [];
}

function realManifestToolNames() {
    const doc = JSON.parse(
        readFileSync(new URL("../docs/mcp-tool-manifest.json", import.meta.url), "utf8"),
    );
    return new Set((doc.tools ?? []).map((tool) => tool.name).filter(Boolean));
}

test("every resourceAliases key is reachable from a real operation's SDK group", () => {
    const rawGroups = new Set(realInventoryOperations().map((op) => rawGroupFor(op)));
    for (const key of resourceAliases.keys()) {
        assert.ok(
            rawGroups.has(key),
            `resourceAliases key ${JSON.stringify(key)} matches no real operation's SDK group -- dead alias`,
        );
    }
});

test("every methodAliases key is reachable from a real operation's SDK method", () => {
    const methodSnakes = new Set(
        realInventoryOperations().map((op) => toSnake(methodSourceFor(op))),
    );
    for (const key of methodAliasKeys) {
        assert.ok(
            methodSnakes.has(key),
            `methodAliases key ${JSON.stringify(key)} matches no real operation's SDK method -- dead alias`,
        );
    }
});

test("every resourceAliases target produces a candidate tool name that exists in the real manifest", () => {
    const ops = realInventoryOperations();
    const tools = realManifestToolNames();
    for (const [key, target] of resourceAliases) {
        const matching = ops.filter((op) => rawGroupFor(op) === key);
        const hit = matching.some((op) => candidateTools(op).some((name) => tools.has(name)));
        assert.ok(
            hit,
            `resourceAliases ${JSON.stringify(key)} -> ${JSON.stringify(target)} produces no candidate ` +
                "tool name present in docs/mcp-tool-manifest.json",
        );
    }
});

test("every methodAliases key produces a candidate tool name that exists in the real manifest", () => {
    const ops = realInventoryOperations();
    const tools = realManifestToolNames();
    for (const key of methodAliasKeys) {
        const matching = ops.filter((op) => toSnake(methodSourceFor(op)) === key);
        const hit = matching.some((op) => candidateTools(op).some((name) => tools.has(name)));
        assert.ok(
            hit,
            `methodAliases key ${JSON.stringify(key)} produces no candidate tool name present in ` +
                "docs/mcp-tool-manifest.json",
        );
    }
});
