export const CANONICAL_SDK_OPERATION_COUNTS = Object.freeze({
    sdkGenerated: 169,
    sdkExplicitlyNamed: 155,
    sdkOperationIdDerived: 14,
});

export function buildOperationDisposition({ classifications = [], inventory, receipt }) {
    const inventoryById = new Map(
        (inventory?.operations ?? []).map((operation) => [operation.operationId, operation]),
    );
    const classificationById = new Map(
        classifications.map((classification) => [classification.operationId, classification]),
    );
    const operations = (receipt?.operations ?? []).map((generatedOperation) => {
        const inventoryOperation = inventoryById.get(generatedOperation.operationId);
        const explicit = Boolean(inventoryOperation?.sdkGroup && inventoryOperation?.sdkMethod);
        const classification = classificationById.get(generatedOperation.operationId);
        return {
            operationId: generatedOperation.operationId,
            httpMethod: generatedOperation.httpMethod,
            path: generatedOperation.path,
            generated: {
                group: generatedOperation.resource,
                method: generatedOperation.methodName,
                clientPath: `client.${generatedOperation.resource}.${generatedOperation.methodName}`,
                reachable: true,
            },
            sdkNaming: explicit ? "explicit" : "operationId-derived",
            evidenceIds: classification?.evidenceIds ?? [],
        };
    });
    return {
        schemaVersion: 1,
        summary: {
            sdkGenerated: operations.length,
            sdkExplicitlyNamed: operations.filter((operation) => operation.sdkNaming === "explicit").length,
            sdkOperationIdDerived: operations.filter(
                (operation) => operation.sdkNaming === "operationId-derived",
            ).length,
        },
        operations,
    };
}

export function validateOperationDisposition({
    artifact,
    classifications = [],
    inventory,
    knownEvidenceIds,
    receipt,
}) {
    const failures = [];
    const inventoryOperations = inventory?.operations ?? [];
    const receiptOperations = receipt?.operations ?? [];
    const dispositionOperations = artifact?.operations ?? [];

    function collectById(label, operations) {
        const counts = new Map();
        const byId = new Map();
        for (const operation of operations) {
            const operationId = operation?.operationId;
            counts.set(operationId, (counts.get(operationId) ?? 0) + 1);
            byId.set(operationId, operation);
        }
        for (const [operationId, count] of counts) {
            if (count > 1) failures.push(`${operationId}: duplicate ${label} rows (${count})`);
        }
        return byId;
    }

    for (const [field, expected] of Object.entries(CANONICAL_SDK_OPERATION_COUNTS)) {
        const actual = artifact?.summary?.[field];
        if (actual !== expected) {
            failures.push(`summary.${field}: expected ${expected} but got ${actual}`);
        }
    }
    if (inventory?.operationCount !== CANONICAL_SDK_OPERATION_COUNTS.sdkGenerated) {
        failures.push(
            `inventory.operationCount: expected ${CANONICAL_SDK_OPERATION_COUNTS.sdkGenerated} but got ${inventory?.operationCount}`,
        );
    }
    if (inventoryOperations.length !== inventory?.operationCount) {
        failures.push(
            `inventory.operationCount is ${inventory?.operationCount} but inventory has ${inventoryOperations.length} rows`,
        );
    }
    if (receipt?.ok !== true) failures.push("receipt.ok: expected true");
    if (receipt?.operationCount !== CANONICAL_SDK_OPERATION_COUNTS.sdkGenerated) {
        failures.push(
            `receipt.operationCount: expected ${CANONICAL_SDK_OPERATION_COUNTS.sdkGenerated} but got ${receipt?.operationCount}`,
        );
    }
    if (receiptOperations.length !== receipt?.operationCount) {
        failures.push(
            `receipt.operationCount is ${receipt?.operationCount} but receipt has ${receiptOperations.length} rows`,
        );
    }
    if (dispositionOperations.length !== receiptOperations.length) {
        failures.push(
            `receipt has ${receiptOperations.length} operations but artifact has ${dispositionOperations.length}`,
        );
    }
    if (classifications.length !== CANONICAL_SDK_OPERATION_COUNTS.sdkOperationIdDerived) {
        failures.push(
            `classifications: expected ${CANONICAL_SDK_OPERATION_COUNTS.sdkOperationIdDerived} but got ${classifications.length}`,
        );
    }

    const inventoryById = collectById("inventory", inventoryOperations);
    const receiptById = collectById("receipt", receiptOperations);
    const dispositionById = collectById("disposition", dispositionOperations);
    const classificationById = collectById("classification", classifications);

    for (const operationId of inventoryById.keys()) {
        if (!receiptById.has(operationId)) failures.push(`${operationId}: missing codegen receipt row`);
        if (!dispositionById.has(operationId)) failures.push(`${operationId}: missing disposition row`);
    }
    for (const operationId of receiptById.keys()) {
        if (!inventoryById.has(operationId)) {
            failures.push(`${operationId}: codegen receipt row is missing from the OpenAPI inventory`);
        }
    }
    for (const operationId of dispositionById.keys()) {
        if (!inventoryById.has(operationId)) {
            failures.push(`${operationId}: disposition row is missing from the OpenAPI inventory`);
        }
    }
    for (const classification of classifications) {
        if (!inventoryById.has(classification.operationId)) {
            failures.push(
                `${classification.operationId}: governed classification is missing from the OpenAPI inventory`,
            );
        }
        if (classification.sdkNaming !== "operationId-derived") {
            failures.push(`${classification.operationId}: sdkNaming must be operationId-derived`);
        }
        for (const field of ["generatedGroup", "generatedMethod"]) {
            if (typeof classification[field] !== "string" || classification[field].length === 0) {
                failures.push(`${classification.operationId}: ${field} must be a non-empty string`);
            }
        }
        if (!Array.isArray(classification.evidenceIds) || classification.evidenceIds.length === 0) {
            failures.push(`${classification.operationId}: evidenceIds must be non-empty`);
        } else {
            const uniqueEvidence = new Set(classification.evidenceIds);
            if (uniqueEvidence.size !== classification.evidenceIds.length) {
                failures.push(`${classification.operationId}: evidenceIds must be unique`);
            }
            for (const evidenceId of classification.evidenceIds) {
                if (knownEvidenceIds && !knownEvidenceIds.has(evidenceId)) {
                    failures.push(`${classification.operationId}: unknown evidenceId ${evidenceId}`);
                }
            }
        }
    }

    let derivedCount = 0;
    for (const operation of inventoryOperations) {
        const hasGroup = typeof operation.sdkGroup === "string" && operation.sdkGroup.length > 0;
        const hasMethod = typeof operation.sdkMethod === "string" && operation.sdkMethod.length > 0;
        if (hasGroup !== hasMethod) {
            failures.push(`${operation.operationId}: OpenAPI SDK naming must provide both group and method or neither`);
        }
        const explicit = hasGroup && hasMethod;
        if (!explicit) derivedCount += 1;
        const classification = classificationById.get(operation.operationId);
        const generated = receiptById.get(operation.operationId);
        const disposition = dispositionById.get(operation.operationId);
        if (explicit && classification) {
            failures.push(
                `${operation.operationId}: OpenAPI naming is explicit but classified as operationId-derived`,
            );
        }
        if (!explicit && !classification) {
            failures.push(
                `${operation.operationId}: unclassified operationId-derived generated operation`,
            );
        }
        if (generated) {
            if (generated.httpMethod !== operation.method || generated.path !== operation.path) {
                failures.push(`${operation.operationId}: codegen receipt method/path does not match OpenAPI inventory`);
            }
            const expectedGroup = explicit ? operation.sdkGroup : classification?.generatedGroup;
            const expectedMethod = explicit ? operation.sdkMethod : classification?.generatedMethod;
            if (generated.resource !== expectedGroup || generated.methodName !== expectedMethod) {
                failures.push(
                    `${operation.operationId}: generated path client.${generated.resource}.${generated.methodName} does not match governed client.${expectedGroup}.${expectedMethod}`,
                );
            }
        }
        const expectedNaming = explicit ? "explicit" : "operationId-derived";
        if (disposition && disposition.sdkNaming !== expectedNaming) {
            failures.push(
                `${operation.operationId}: OpenAPI naming is ${expectedNaming} but artifact classifies it as ${disposition.sdkNaming}`,
            );
        }
        if (generated && disposition) {
            const expectedGenerated = {
                group: generated.resource,
                method: generated.methodName,
                clientPath: `client.${generated.resource}.${generated.methodName}`,
                reachable: true,
            };
            if (JSON.stringify(disposition.generated) !== JSON.stringify(expectedGenerated)) {
                failures.push(`${operation.operationId}: disposition generated reachability differs from codegen receipt`);
            }
            if (disposition.httpMethod !== generated.httpMethod || disposition.path !== generated.path) {
                failures.push(`${operation.operationId}: disposition method/path differs from codegen receipt`);
            }
            const expectedEvidence = classification?.evidenceIds ?? [];
            if (JSON.stringify(disposition.evidenceIds) !== JSON.stringify(expectedEvidence)) {
                failures.push(`${operation.operationId}: disposition evidenceIds differ from governance`);
            }
        }
    }
    if (derivedCount !== CANONICAL_SDK_OPERATION_COUNTS.sdkOperationIdDerived) {
        failures.push(
            `OpenAPI operationId-derived count: expected ${CANONICAL_SDK_OPERATION_COUNTS.sdkOperationIdDerived} but got ${derivedCount}`,
        );
    }
    return failures;
}
