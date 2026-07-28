// Structural comparison of a live Clockify response against the corrected
// OpenAPI response schema for the same operation.
//
// Why the schema and not the emitted .d.ts: the TypeScript types are generated
// FROM spec/corrected by scripts/generate-sdk-from-openapi.mjs, so a field
// absent from the schema is a field absent from the type. The failure this gate
// exists to catch is upstream of both -- GOCLMCP's generator resolves
// schema-name collisions first-writer-wins, so a thin hand-authored schema can
// shadow a richer fragment and silently drop live fields. That has shipped three
// times (Client.ccEmails/currencyId, Webhook.deliveryEnabled/planEnabled, and
// SharedReport using public/url when the wire says isPublic/link -- which made
// the CLI/MCP `--public` flag a silent no-op). No existing gate catches it.
//
// Direction matters. A field on the wire but absent from the schema is DATA THE
// SDK SILENTLY DROPS -- that fails. A field in the schema but absent from the
// wire is usually just an optional field the sandbox did not populate -- that
// warns. This module is pure: no network, no fs, so it is testable offline.

const DEFAULT_MAX_DEPTH = 6;
/** Paths whose keys are user-defined data, not API surface, so extra keys are expected. */
const OPEN_BY_CONVENTION = new Set(["additionalProperties", "customFieldValues"]);

/** Follow a local `#/components/...` ref. Returns null for unresolvable refs. */
export function resolveRef(spec, ref) {
    if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
    let node = spec;
    for (const rawSegment of ref.slice(2).split("/")) {
        const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
        if (node == null || typeof node !== "object") return null;
        node = node[segment];
    }
    return node ?? null;
}

function deref(spec, schema, seen) {
    let current = schema;
    let guard = 0;
    while (current && typeof current === "object" && typeof current.$ref === "string") {
        if (seen.has(current.$ref) || guard > 20) return null; // cyclic or pathological
        seen.add(current.$ref);
        current = resolveRef(spec, current.$ref);
        guard += 1;
    }
    return current ?? null;
}

/**
 * Every field path the schema declares, plus the paths under which unknown keys
 * are legitimate (free-form objects, `additionalProperties`, maps).
 * Array elements are addressed as `parent[]`, so `[].id` is "id on each item".
 */
export function schemaFieldPaths(spec, rootSchema, { maxDepth = DEFAULT_MAX_DEPTH } = {}) {
    const paths = new Set();
    const openPaths = new Set();

    const walk = (schema, prefix, depth, seenRefs) => {
        if (depth > maxDepth) return;
        const node = deref(spec, schema, new Set(seenRefs));
        if (!node || typeof node !== "object") {
            openPaths.add(prefix); // unresolvable -> do not claim knowledge of its keys
            return;
        }

        let composed = false;
        for (const key of ["allOf", "oneOf", "anyOf"]) {
            if (Array.isArray(node[key])) {
                // Union of branches: a wire key satisfied by ANY branch is fine.
                composed = true;
                for (const branch of node[key]) walk(branch, prefix, depth, seenRefs);
            }
        }
        // A composition node carries no `type`/`properties` of its own. Without
        // this guard the free-form fallback below would mark the composition's
        // own path open and swallow every drop underneath it.
        if (composed && !node.properties && node.additionalProperties === undefined) return;

        if (node.items) {
            walk(node.items, prefix ? `${prefix}[]` : "[]", depth, seenRefs);
            return;
        }

        const properties = node.properties;
        const hasProperties = properties && typeof properties === "object";
        if (hasProperties) {
            for (const [name, child] of Object.entries(properties)) {
                const childPath = prefix ? `${prefix}.${name}` : name;
                paths.add(childPath);
                if (OPEN_BY_CONVENTION.has(name)) openPaths.add(childPath);
                walk(child, childPath, depth + 1, seenRefs);
            }
        }

        // A free-form object, or one that explicitly permits extra members, can
        // legitimately carry keys the schema never names.
        const additional = node.additionalProperties;
        if (additional === true || (additional && typeof additional === "object")) {
            openPaths.add(prefix);
        } else if (!hasProperties && (node.type === "object" || node.type === undefined)) {
            const isScalar = typeof node.type === "string" && node.type !== "object";
            if (!isScalar) openPaths.add(prefix);
        }
    };

    walk(rootSchema, "", 0, new Set());
    paths.delete("");
    return { paths, openPaths };
}

/** Every field path actually present in a live response body. */
export function wireFieldPaths(value, { maxDepth = DEFAULT_MAX_DEPTH } = {}) {
    const paths = new Set();

    const walk = (node, prefix, depth) => {
        if (depth > maxDepth || node == null) return;
        if (Array.isArray(node)) {
            for (const item of node) walk(item, prefix ? `${prefix}[]` : "[]", depth);
            return;
        }
        if (typeof node !== "object") return;
        for (const [key, child] of Object.entries(node)) {
            const childPath = prefix ? `${prefix}.${key}` : key;
            paths.add(childPath);
            walk(child, childPath, depth + 1);
        }
    };

    walk(value, "", 0);
    return paths;
}

/** True when `path` sits at or beneath a path where unknown keys are allowed. */
function isCoveredByOpenPath(path, openPaths) {
    if (openPaths.has(path)) return true;
    for (const open of openPaths) {
        if (open === "") return true;
        if (path.startsWith(`${open}.`) || path.startsWith(`${open}[]`)) return true;
    }
    return false;
}

/**
 * Compare one live response against its declared schema.
 * `missingFromSchema` is the failing direction: the wire carries data the
 * generated types cannot express, so callers silently lose it.
 */
export function diffOperation({ spec, schema, body, maxDepth = DEFAULT_MAX_DEPTH }) {
    const { paths: schemaPaths, openPaths } = schemaFieldPaths(spec, schema, { maxDepth });
    const wirePaths = wireFieldPaths(body, { maxDepth });

    const missingFromSchema = [];
    for (const path of wirePaths) {
        if (schemaPaths.has(path)) continue;
        if (isCoveredByOpenPath(path, openPaths)) continue;
        missingFromSchema.push(path);
    }

    const schemaOnly = [];
    for (const path of schemaPaths) {
        if (!wirePaths.has(path)) schemaOnly.push(path);
    }

    return {
        missingFromSchema: missingFromSchema.sort(),
        schemaOnly: schemaOnly.sort(),
        schemaPathCount: schemaPaths.size,
        wirePathCount: wirePaths.size,
    };
}

/** The 2xx JSON response schema for an operation, or null when it declares none. */
export function responseSchemaFor(operation) {
    const responses = operation?.responses;
    if (!responses || typeof responses !== "object") return null;
    const code = Object.keys(responses)
        .filter((key) => /^2\d\d$/.test(key))
        .sort()[0];
    if (!code) return null;
    const content = responses[code]?.content;
    if (!content || typeof content !== "object") return null;
    const jsonKey = Object.keys(content).find((key) => key.includes("json"));
    return jsonKey ? (content[jsonKey]?.schema ?? null) : null;
}
