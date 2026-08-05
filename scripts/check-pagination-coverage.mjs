#!/usr/bin/env node
// Reconcile the SDK's documentary `KNOWN_PAGINATED_METHODS` (wrapper/iter.ts)
// against the corrected spec's own pagination signals (query/body `page` +
// `page-size` fields, and the `x-clockify-last-page-header` stamp), deriving
// every set from its source rather than hand-typing counts.
//
// `KNOWN_PAGINATED_METHODS` is explicitly documented as a non-exhaustive,
// non-load-bearing curated subset covering only bare-array-response
// pagination (see its docstring in wrapper/iter.ts: "Not load-bearing for
// iterAll -- the helper accepts any matching call site, not just these").
// Many spec-paginated operations (expenses, invoices, holidays, custom
// fields, balances, entity-change feeds, webhook logs, ...) return
// envelope-shaped responses instead and are deliberately handled outside
// this registry. Asserting the two sets are EQUAL would therefore be a
// false-red generator against that legitimate design choice.
//
// What genuinely IS a bug, and what this gate hard-fails on: any
// `KNOWN_PAGINATED_METHODS` entry the spec no longer backs with a pagination
// signal at all -- i.e. `known ⊆ (page-stamped ∪ last-page-header-stamped)`
// must hold. The reverse direction (spec-stamped ops absent from the
// documentary registry) is reported for human review, not failed on, since
// classifying each as "different convention" vs. "should be added" needs
// per-operation judgment this script cannot safely automate.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function readText(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

/** Resolve a local `#/...` JSON-pointer `$ref` against the parsed spec document. */
function deref(schema, document) {
    if (!schema?.$ref?.startsWith("#/")) return schema;
    return schema.$ref
        .slice(2)
        .split("/")
        .reduce((value, segment) => value?.[segment], document);
}

function pairKey([resource, method]) {
    return `${resource}.${method}`;
}

/** Every `(resource, method)` pair `wrapper/iter.ts` documents as paginated. */
function extractKnownPaginatedMethods() {
    const source = readText("wrapper/iter.ts");
    const block = source.match(
        /KNOWN_PAGINATED_METHODS[^[]*\[(.*?)\]\s*as const/s,
    )?.[1];
    if (block == null) {
        throw new Error("wrapper/iter.ts: could not locate the KNOWN_PAGINATED_METHODS array literal");
    }
    return [...block.matchAll(/resource:\s*"([^"]+)",\s*method:\s*"([^"]+)"/g)].map((match) => [
        match[1],
        match[2],
    ]);
}

/**
 * operationId -> [group, method] for every generated SDK operation, using the
 * spec's own `x-fern-sdk-group-name`/`x-fern-sdk-method-name` stamps (the
 * generator's own naming source), falling back to the committed
 * operationId-derived classification for the handful of operations that
 * have no fern stamp.
 */
function buildOperationNameIndex(document) {
    const fallback = new Map(
        readJson("docs/sdk-operation-naming-classifications.json").classifications.map((entry) => [
            entry.operationId,
            [entry.generatedGroup, entry.generatedMethod],
        ]),
    );
    const index = new Map();
    for (const pathItem of Object.values(document.paths ?? {})) {
        for (const [method, operation] of Object.entries(pathItem ?? {})) {
            if (!HTTP_METHODS.has(method) || !operation?.operationId) continue;
            const { operationId } = operation;
            const group = operation["x-fern-sdk-group-name"];
            const sdkMethod = operation["x-fern-sdk-method-name"];
            index.set(operationId, group && sdkMethod ? [group, sdkMethod] : fallback.get(operationId));
        }
    }
    return index;
}

/**
 * Every operationId that signals `page`/`page-size` pagination, either as a
 * query parameter or as a field on the JSON request body (e.g. the
 * audit-log search endpoint paginates through its POST body, not the query
 * string).
 */
function findPageStampedOperations(document) {
    const found = [];
    for (const pathItem of Object.values(document.paths ?? {})) {
        for (const [method, operation] of Object.entries(pathItem ?? {})) {
            if (!HTTP_METHODS.has(method) || !operation?.operationId) continue;
            const paramNames = new Set((operation.parameters ?? []).map((param) => param?.name));
            const bodySchema = deref(
                operation.requestBody?.content?.["application/json"]?.schema,
                document,
            );
            const bodyProps = new Set(Object.keys(bodySchema?.properties ?? {}));
            if (paramNames.has("page") || paramNames.has("page-size") || bodyProps.has("page") || bodyProps.has("page-size")) {
                found.push(operation.operationId);
            }
        }
    }
    return found;
}

/** Every operationId stamped `x-clockify-last-page-header`. */
function findLastPageHeaderOperations(document) {
    const found = [];
    for (const pathItem of Object.values(document.paths ?? {})) {
        for (const [method, operation] of Object.entries(pathItem ?? {})) {
            if (!HTTP_METHODS.has(method) || !operation?.operationId) continue;
            if (operation["x-clockify-last-page-header"]) found.push(operation.operationId);
        }
    }
    return found;
}

export function reconcilePaginationCoverage() {
    const document = parse(readText("spec/corrected/clockify.corrected.openapi.yaml"));
    const nameIndex = buildOperationNameIndex(document);
    const toPair = (operationId) => nameIndex.get(operationId);

    const known = new Set(extractKnownPaginatedMethods().map(pairKey));
    const pageStamped = new Set(findPageStampedOperations(document).map(toPair).filter(Boolean).map(pairKey));
    const lastPageStamped = new Set(
        findLastPageHeaderOperations(document).map(toPair).filter(Boolean).map(pairKey),
    );
    const specPaginated = new Set([...pageStamped, ...lastPageStamped]);

    const unbacked = [...known].filter((pair) => !specPaginated.has(pair)).sort();
    const uncatalogued = [...specPaginated].filter((pair) => !known.has(pair)).sort();

    return { known, specPaginated, unbacked, uncatalogued };
}

function main() {
    const { known, specPaginated, unbacked, uncatalogued } = reconcilePaginationCoverage();

    if (uncatalogued.length > 0) {
        console.log(
            `pagination-coverage: ${uncatalogued.length} spec-paginated operation(s) outside KNOWN_PAGINATED_METHODS ` +
                "(informational -- expected for envelope-shaped responses and other non-bare-array conventions):",
        );
        for (const pair of uncatalogued) console.log(`  - ${pair}`);
    }

    if (unbacked.length > 0) {
        console.error(
            `pagination-coverage: ${unbacked.length} KNOWN_PAGINATED_METHODS entry(ies) have NO backing ` +
                "pagination signal in the corrected spec (stale documentary claim -- fix wrapper/iter.ts or the spec):",
        );
        for (const pair of unbacked) console.error(`  - ${pair}`);
        process.exit(1);
    }

    console.log(
        `pagination-coverage passed (${known.size} documented paginated methods, all backed by the spec; ` +
            `${specPaginated.size} spec-paginated operations total).`,
    );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
