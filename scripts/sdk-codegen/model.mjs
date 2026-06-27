import { BINARY_CONTENT_TYPES, COLLATOR, HTTP_METHOD_ORDER, HTTP_METHODS, JSON_CONTENT_TYPES } from "./constants.mjs";
import { deref } from "./schema.mjs";
import { refToName, tagToResource, toCamel, toPascal } from "./naming.mjs";

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
                operation,
                requestBody,
                pathParams,
                queryParams,
            });
            const response = getResponse(operation.responses ?? {}, doc);
            // Operations on Clockify's reports/audit-log hosts carry a per-operation
            // `servers` override; route them there instead of the default api host.
            const operationServer = (operation.servers ?? pathItem.servers)?.[0]?.url;
            const baseUrl = operationServer && operationServer !== defaultServer ? operationServer : undefined;
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
    const contentType =
        BINARY_CONTENT_TYPES.find((candidate) => content[candidate]) ??
        JSON_CONTENT_TYPES.find((candidate) => content[candidate]) ??
        Object.keys(content).find((candidate) => candidate.includes("json")) ??
        Object.keys(content)[0];
    if (!contentType) return { type: "void", schema: undefined, contentType: undefined };
    if (BINARY_CONTENT_TYPES.some((candidate) => contentType.includes(candidate.split("/").at(-1)))) {
        return { type: "binary", schema: content[contentType]?.schema, contentType };
    }
    return { type: "json", schema: content[contentType]?.schema, contentType };
}

function getRequestType({ methodName, resource, operation, requestBody, pathParams, queryParams }) {
    if (!requestBody && pathParams.length === 0 && queryParams.length === 0) return undefined;
    const refName = requestBody?.schema?.$ref ? refToName(requestBody.schema.$ref) : undefined;
    if (refName && methodName === "create") return refName;
    const suffix = toPascal(resource);
    return `${toPascal(methodName)}${suffix}Request`;
}
