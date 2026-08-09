import { BINARY_CONTENT_TYPES, COLLATOR, HTTP_METHOD_ORDER, HTTP_METHODS, JSON_CONTENT_TYPES } from "./constants.mjs";
import { deref } from "./schema.mjs";
import { refToName, tagToResource, toCamel, toPascal } from "./naming.mjs";

// Approved Clockify service families (H02-ROUTING, docs/service-routing-matrix.json
// `profiles.global`). "regular" is the vocabulary the SDK's public routing
// surface (wrapper/internal/routing.ts's ClockifyService) already uses --
// this stays the single name for the concept end to end, generator through
// wrapper. A host resolving to none of these is a locked-upstream-contract
// gap, not something to guess at (see buildModel's thrown error below).
const HOST_TO_SERVICE = {
    "api.clockify.me": "regular",
    "reports.api.clockify.me": "reports",
    "auditlog-api.api.clockify.me": "audit",
};

export function buildModel(doc) {
    const defaultServer = doc.servers?.[0]?.url;
    const operations = [];
    for (const [rawPath, pathItem] of Object.entries(doc.paths ?? {})) {
        const pathParameters = (pathItem.parameters ?? []).map((parameter) => deref(parameter, { doc }));
        for (const [method, operation] of Object.entries(pathItem)) {
            if (!HTTP_METHODS.has(method)) continue;
            const parameters = [
                ...pathParameters,
                ...(operation.parameters ?? []).map((parameter) => deref(parameter, { doc })),
            ];
            const tag = operation.tags?.[0] ?? "Default";
            const resource = operation["x-fern-sdk-group-name"] ?? tagToResource(tag);
            const methodName = operation["x-fern-sdk-method-name"] ?? toCamel(operation.operationId ?? `${method} ${rawPath}`);
            const requestBody = getRequestBody(deref(operation.requestBody, { doc }));
            const pathParams = parameters.filter((parameter) => parameter.in === "path");
            const queryParams = parameters.filter((parameter) => parameter.in === "query");
            const requestType = getRequestType({
                methodName,
                resource,
                requestBody,
                pathParams,
                queryParams,
            });
            const response = {
                ...getResponse(operation.responses ?? {}, doc),
                allowsEmptyBody: operation["x-clockify-empty-body-is-valid"] === true,
            };
            // Operations on Clockify's reports/audit-log hosts carry a per-operation
            // `servers` override; route them there instead of the default api host.
            const operationServer = (operation.servers ?? pathItem.servers)?.[0]?.url;
            const baseUrl = operationServer && operationServer !== defaultServer ? operationServer : undefined;
            const service = deriveService(operationServer ?? defaultServer, operation.operationId ?? methodName);
            operations.push({
                httpMethod: method.toUpperCase(),
                path: rawPath,
                operationId: operation.operationId ?? methodName,
                tag,
                resource,
                methodName,
                pathParams,
                queryParams,
                requestBody,
                requestType,
                response,
                baseUrl,
                service,
            });
        }
    }

    operations.sort(compareOperations);
    assertUniqueNames(operations);
    const resources = [...new Set(operations.map((operation) => operation.resource))].sort();
    const requestTypeNames = new Set(operations.map((operation) => operation.requestType).filter(Boolean));
    const schemas = doc.components?.schemas ?? {};

    return { doc, operations, resources, requestTypeNames, schemas };
}

// Every operation must resolve to exactly one approved service (P02-06's
// completion test). An effective server that isn't in HOST_TO_SERVICE is a
// gap in the locked upstream OpenAPI contract, not something to guess at --
// fail loudly with the offending operation named, same posture as
// assertUniqueNames below.
function deriveService(effectiveServer, operationId) {
    const url = effectiveServer ?? "https://api.clockify.me/api/v1";
    let hostname;
    try {
        hostname = new URL(url).hostname;
    } catch {
        throw new Error(`Cannot derive service identity for "${operationId}": server URL "${url}" is not parseable.`);
    }
    const service = HOST_TO_SERVICE[hostname];
    if (!service) {
        throw new Error(
            `Cannot derive service identity for "${operationId}": host "${hostname}" is not an approved service host ` +
                `(expected one of ${Object.keys(HOST_TO_SERVICE).join(", ")}). Fix the locked upstream contract first.`,
        );
    }
    return service;
}

// A duplicate operationId or request-type name silently overwrites a generated
// file (or collides in the resource barrel), so fail loudly with the offenders
// named instead of shipping a truncated SDK.
function assertUniqueNames(operations) {
    const byOperationId = new Map();
    const byRequestType = new Map();
    for (const operation of operations) {
        const where = `${operation.httpMethod} ${operation.path}`;
        const priorOp = byOperationId.get(operation.operationId);
        if (priorOp) throw new Error(`Duplicate operationId "${operation.operationId}": ${priorOp} and ${where}`);
        byOperationId.set(operation.operationId, where);
        if (!operation.requestType) continue;
        const priorType = byRequestType.get(operation.requestType);
        if (priorType) throw new Error(`Duplicate request-type name "${operation.requestType}": ${priorType} and ${where}`);
        byRequestType.set(operation.requestType, where);
    }
}

function compareOperations(a, b) {
    return (
        COLLATOR.compare(a.path, b.path) ||
        HTTP_METHOD_ORDER.indexOf(a.httpMethod.toLowerCase()) - HTTP_METHOD_ORDER.indexOf(b.httpMethod.toLowerCase()) ||
        COLLATOR.compare(a.tag, b.tag) ||
        COLLATOR.compare(a.operationId, b.operationId)
    );
}

export function collectDiagnostics(doc) {
    const diagnostics = [];
    visitSchema(doc.components?.schemas ?? {}, "#/components/schemas");
    // Inline schemas live under `paths`, and they are exactly the ones rendered
    // by `objectTypeFromSchema` — walking only `components` would leave the
    // renderer's own territory unchecked.
    visitSchema(doc.paths ?? {}, "#/paths");
    return diagnostics;

    function visitSchema(value, pointer) {
        if (Array.isArray(value)) {
            value.forEach((item, index) => visitSchema(item, `${pointer}/${index}`));
            return;
        }
        if (value == null || typeof value !== "object") return;
        if (Object.prototype.hasOwnProperty.call(value, "not")) {
            diagnostics.push({
                severity: "error",
                pointer: `${pointer}/not`,
                message: "Unsupported schema keyword: not",
            });
        }
        // `objectTypeFromSchema` emits an index signature only for
        // `additionalProperties: true`, which widens to `unknown` and therefore
        // accepts every declared property's type. A narrower schema alongside
        // named properties has no sound rendering, so the generator would drop
        // it silently. The corrected spec contains no such schema today; this
        // fails the run loudly on the day one appears.
        if (value.properties && value.additionalProperties && value.additionalProperties !== true) {
            diagnostics.push({
                severity: "error",
                pointer: `${pointer}/additionalProperties`,
                message: "Unsupported schema shape: additionalProperties schema alongside properties (index signature would be dropped)",
            });
        }
        for (const [key, child] of Object.entries(value)) visitSchema(child, `${pointer}/${escapeJsonPointer(key)}`);
    }
}

function escapeJsonPointer(value) {
    return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function buildReceipt(model, { input, diagnostics, ok }) {
    return {
        ok,
        input,
        operationCount: model.operations.length,
        resourceCount: model.resources.length,
        operations: model.operations.map((operation) => ({
            operationId: operation.operationId,
            resource: operation.resource,
            methodName: operation.methodName,
            httpMethod: operation.httpMethod,
            path: operation.path,
            service: operation.service,
        })),
        diagnostics,
    };
}

function getRequestBody(requestBody) {
    const content = requestBody?.content;
    if (!content) return undefined;
    const contentType =
        JSON_CONTENT_TYPES.find((candidate) => content[candidate]) ??
        Object.keys(content).find((candidate) => candidate.includes("json")) ??
        Object.keys(content).find((candidate) => candidate.includes("multipart")) ??
        Object.keys(content)[0];
    if (!contentType) return undefined;
    return {
        contentType,
        schema: content[contentType]?.schema ?? {},
        required: requestBody.required === true,
        multipart: contentType.includes("multipart"),
    };
}

function getResponse(responses, doc) {
    const status = Object.keys(responses).find((code) => code.startsWith("2")) ?? "200";
    const response = deref(responses[status] ?? {}, { doc });
    const content = response.content ?? {};
    const binaryContentType = BINARY_CONTENT_TYPES.find((candidate) => content[candidate]);
    const jsonContentType =
        JSON_CONTENT_TYPES.find((candidate) => content[candidate]) ??
        Object.keys(content).find((candidate) => candidate.includes("json"));
    if (binaryContentType && jsonContentType) {
        return {
            type: "mixed",
            schema: content[jsonContentType]?.schema,
            contentType: jsonContentType,
        };
    }
    const contentType = binaryContentType ?? jsonContentType ?? Object.keys(content)[0];
    if (!contentType) return { type: "void", schema: undefined, contentType: undefined };
    if (BINARY_CONTENT_TYPES.some((candidate) => contentType.includes(candidate.split("/").at(-1)))) {
        return { type: "binary", schema: content[contentType]?.schema, contentType };
    }
    return { type: "json", schema: content[contentType]?.schema, contentType };
}

function getRequestType({ methodName, resource, requestBody, pathParams, queryParams }) {
    if (!requestBody && pathParams.length === 0 && queryParams.length === 0) return undefined;
    const refName = requestBody?.schema?.$ref ? refToName(requestBody.schema.$ref) : undefined;
    if (refName && methodName === "create") return refName;
    const suffix = toPascal(resource);
    return `${toPascal(methodName)}${suffix}Request`;
}
