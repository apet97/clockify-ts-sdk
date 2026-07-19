const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);
const TIME_OFF_STATUS_REF = "#/components/schemas/TimeOffRequestStatus";

export function extractCanonicalPaginatedRoutes(generatorSource) {
    const block = String(generatorSource).match(
        /PAGINATED_LIST_OPS\s*=\s*Set\.new\(\[(.*?)\]\)\.freeze/s,
    )?.[1];
    if (block == null) throw new Error("canonical generator is missing PAGINATED_LIST_OPS");
    return [...block.matchAll(/\["([^"]+)",\s*"([^"]+)"\]/g)].map((match) => [
        match[1].toUpperCase(),
        match[2],
    ]);
}

function resolveJsonPointer(document, pointer) {
    if (typeof pointer !== "string" || !pointer.startsWith("#/")) return undefined;
    return pointer
        .slice(2)
        .split("/")
        .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
        .reduce((value, segment) => value?.[segment], document);
}

function reachesReference(value, targetRef, document, seenRefs = new Set()) {
    if (value == null || typeof value !== "object") return false;
    if (typeof value.$ref === "string") {
        if (value.$ref === targetRef) return true;
        if (seenRefs.has(value.$ref)) return false;
        const nextSeenRefs = new Set(seenRefs).add(value.$ref);
        return reachesReference(
            resolveJsonPointer(document, value.$ref),
            targetRef,
            document,
            nextSeenRefs,
        );
    }
    return Object.values(value).some((nested) =>
        reachesReference(nested, targetRef, document, new Set(seenRefs)),
    );
}

function operationsWhoseResponsesReach(openapi, targetRef) {
    const operationIds = [];
    for (const pathItem of Object.values(openapi?.paths ?? {})) {
        if (pathItem == null || typeof pathItem !== "object") continue;
        for (const [method, operation] of Object.entries(pathItem)) {
            if (!HTTP_METHODS.has(method) || operation == null || typeof operation !== "object") {
                continue;
            }
            if (reachesReference(operation.responses, targetRef, openapi)) {
                operationIds.push(operation.operationId);
            }
        }
    }
    return operationIds;
}

export function buildOperationEvidenceSemanticExpectations({
    inventory,
    openapi,
    semanticContract,
}) {
    const collisionPaths = new Set([
        "/workspaces/{workspaceId}/expenses/categories",
        "/workspaces/{workspaceId}/expenses/{expenseId}",
        "/workspaces/{workspaceId}/invoices/settings",
        "/workspaces/{workspaceId}/invoices/{invoiceId}",
        "/workspaces/{workspaceId}/scheduling/assignments/publish",
        "/workspaces/{workspaceId}/scheduling/assignments/{assignmentId}",
    ]);
    const collisionOperationIds = (inventory?.operations ?? [])
        .filter((operation) => collisionPaths.has(operation.path))
        .map((operation) => operation.operationId);
    const timeOffStatusOperationIds = operationsWhoseResponsesReach(openapi, TIME_OFF_STATUS_REF);
    const operationByRoute = new Map(
        (inventory?.operations ?? []).map((operation) => [
            `${operation.method} ${operation.path}`,
            operation.operationId,
        ]),
    );
    return {
        "fern.x-fern-pagination.bare-array-unsupported": {
            applicability: "not-operation-specific",
            operationIds: [],
        },
        "fern-check.no-conflicting-endpoint-paths.literal-vs-id-siblings": {
            applicability: "operation-specific",
            operationIds: collisionOperationIds,
        },
        "gen-clockify-openapi.pagination-params-stamped": {
            applicability: "operation-specific",
            operationIds: (semanticContract?.canonicalPaginatedRoutes ?? []).map(([method, path]) =>
                operationByRoute.get(`${method} ${path}`),
            ),
        },
        "routes.literal-vs-parameterized.collisions": {
            applicability: "operation-specific",
            operationIds: collisionOperationIds,
        },
        "time-off-b.yaml.changedForUserName.malformed-inline-yaml": {
            applicability: "operation-specific",
            operationIds: timeOffStatusOperationIds,
        },
        "time-off.request.status.schema-collision": {
            applicability: "operation-specific",
            operationIds: timeOffStatusOperationIds,
        },
    };
}
