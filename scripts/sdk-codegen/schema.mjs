import { identifier, literal, refToName } from "./naming.mjs";

export function schemaToDeclaration(name, schema, model) {
    if (name === "AuditLogAction" && Array.isArray(schema?.enum)) {
        return `export const AUDIT_LOG_ACTIONS = ${JSON.stringify(schema.enum)} as const;\nexport type AuditLogAction = typeof AUDIT_LOG_ACTIONS[number];`;
    }
    if (schema?.enum || schema?.oneOf || schema?.anyOf || schema?.type === "array" || primitiveType(schema?.type)) {
        return `export type ${name} = ${typeFromSchema(schema, model)};`;
    }
    const properties = schemaProperties(schema, model);
    if (properties.length === 0) return `export type ${name} = ${typeFromSchema(schema, model)};`;
    return [`export interface ${name} {`, ...properties.map(fieldLine), "}"].join("\n");
}

export function requestFields(model, operation) {
    const fields = [];
    fields.push(...requestNonBodyFields(model, operation));
    const existing = new Set(fields.map((field) => field.name));
    for (const field of bodyFields(model, operation)) {
        if (existing.has(field.name)) continue;
        fields.push(field);
    }
    return fields;
}

export function requestNonBodyFields(model, operation) {
    const fields = [];
    for (const parameter of operation.pathParams) fields.push(parameterField(parameter, true, model));
    for (const parameter of operation.queryParams) fields.push(parameterField(parameter, parameter.required === true, model));
    return fields;
}

export function bodyFields(model, operation) {
    const schema = deref(operation.requestBody?.schema, model);
    if (!schema) return [];
    return schemaProperties(schema, model);
}

function schemaProperties(schema, model) {
    const resolved = deref(schema, model);
    const merged = mergeComposedSchema(resolved, model);
    const properties = merged.properties ?? {};
    const required = new Set(merged.required ?? []);
    return Object.entries(properties).map(([name, property]) => ({
        name,
        required: required.has(name),
        type: typeFromSchema(property, model),
        description: property.description,
    }));
}

function mergeComposedSchema(schema, model) {
    if (!schema) return {};
    const parts = [...(schema.allOf ?? []), ...(schema.anyOf?.length === 1 ? schema.anyOf : [])].map((part) => deref(part, model));
    if (parts.length === 0) return schema;
    const merged = { ...schema, properties: { ...(schema.properties ?? {}) }, required: [...(schema.required ?? [])] };
    for (const part of parts) {
        Object.assign(merged.properties, part.properties ?? {});
        merged.required.push(...(part.required ?? []));
    }
    return merged;
}

function parameterField(parameter, required, model) {
    return {
        name: parameter.name,
        required,
        type: typeFromSchema(parameter.schema ?? {}, model),
        description: parameter.description,
    };
}

export function fieldLine(field) {
    const optional = field.required ? "" : "?";
    const name = identifier(field.name) ? field.name : JSON.stringify(field.name);
    const description = field.description ? `    /** ${field.description.replace(/\*\//g, "* /")} */\n` : "";
    return `${description}    ${name}${optional}: ${field.type};`;
}

export function typeFromSchema(schema, model) {
    const sourceSchema = schema;
    if (schema?.$ref) {
        const refName = refToName(schema.$ref);
        const type = schema.$ref.split("/").length === 4 ? `ClockifyApi.${refName}` : typeFromSchema(deref(schema, model), model);
        return withNullable(type, normalizeSchema(sourceSchema));
    }
    const resolved = normalizeSchema(deref(schema, model));
    if (!resolved) return "unknown";
    let type;
    if (resolved.enum) type = unionTypes(resolved.enum.map(literal));
    else if (resolved.oneOf || resolved.anyOf) type = unionTypes([...(resolved.oneOf ?? []), ...(resolved.anyOf ?? [])].map((part) => typeFromSchema(part, model)));
    else if (resolved.allOf) type = resolved.allOf.map((part) => typeFromSchema(part, model)).join(" & ") || "unknown";
    else if (resolved.type === "array") {
        const item = typeFromSchema(resolved.items, model);
        type = item.includes(" | ") ? `(${item})[]` : `${item}[]`;
    }
    else if (resolved.type === "integer" || resolved.type === "number") type = "number";
    else if (resolved.type === "boolean") type = "boolean";
    else if (resolved.type === "null") type = "null";
    else if (resolved.type === "string") {
        if (["binary", "base64", "byte"].includes(resolved.format)) {
            type = "Blob | File | Buffer | Uint8Array | string";
        } else {
            type = "string";
        }
    } else if (resolved.type === "object" || resolved.properties) {
        if (resolved.additionalProperties && !resolved.properties) {
            type = `Record<string, ${resolved.additionalProperties === true ? "unknown" : typeFromSchema(resolved.additionalProperties, model)}>`;
        } else {
            type = "Record<string, unknown>";
        }
    }
    return withNullable(type ?? "unknown", sourceSchema, resolved);
}

function primitiveType(type) {
    return type === "string" || type === "integer" || type === "number" || type === "boolean" || type === "null";
}

/**
 * Normalize an OpenAPI 3.1 `type` array (e.g. `["string", "null"]`) into the
 * single-type-plus-`nullable` shape every branch below already expects. 3.1
 * dropped the 3.0 `nullable` keyword in favor of type arrays; folding both
 * dialects into one shape here — instead of teaching every `resolved.type
 * === "..."` branch about arrays — keeps `withNullable` the single
 * nullability sink for either dialect. A 3.0-style schema (`type` is a plain
 * string, or absent) has no `type` array and passes through unchanged, so
 * this is a no-op against the current 3.0.3 corrected spec.
 */
function normalizeSchema(schema) {
    if (!schema || !Array.isArray(schema.type)) return schema;
    const nonNull = schema.type.filter((entry) => entry !== "null");
    const nullable = schema.nullable === true || nonNull.length !== schema.type.length;
    // Two or more remaining non-null types (e.g. `["string", "integer",
    // "null"]`) have no single-type reduction; leave `type` as the array so
    // every existing `resolved.type === "..."` branch still falls through to
    // "unknown" exactly as it did before this schema shape was recognized,
    // rather than guessing at unverified multi-type union semantics.
    if (nonNull.length !== 1) return { ...schema, nullable };
    return { ...schema, type: nonNull[0], nullable };
}

function withNullable(type, ...schemas) {
    if (!schemas.some((schema) => schema?.nullable === true)) return type;
    return unionTypes([type, "null"]);
}

function unionTypes(types) {
    const flattened = [];
    for (const type of types) {
        for (const part of splitTopLevelUnion(String(type))
            .map((entry) => entry.trim())
            .filter(Boolean)) {
            if (!flattened.includes(part)) flattened.push(part);
        }
    }
    return flattened.join(" | ") || "unknown";
}

function splitTopLevelUnion(type) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < type.length; i++) {
        const ch = type[i];
        if (ch === "<" || ch === "(" || ch === "[" || ch === "{") depth++;
        else if (ch === ">" || ch === ")" || ch === "]" || ch === "}") depth--;
        else if (depth === 0 && ch === "|" && type[i - 1] === " " && type[i + 1] === " ") {
            parts.push(type.slice(start, i - 1));
            start = i + 2;
        }
    }
    parts.push(type.slice(start));
    return parts;
}

export function deref(schema, model) {
    if (!schema) return schema;
    if (schema.$ref?.startsWith("#/")) {
        const parts = schema.$ref.slice(2).split("/");
        let current = model.doc;
        for (const part of parts) current = current?.[part];
        return current ?? schema;
    }
    return schema;
}
