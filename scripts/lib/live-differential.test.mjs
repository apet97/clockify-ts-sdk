import assert from "node:assert/strict";
import test from "node:test";

import {
    diffOperation,
    resolveRef,
    responseSchemaFor,
    schemaFieldPaths,
    wireFieldPaths,
} from "./live-differential.mjs";

// These fixtures reproduce the three shipped defects this gate exists to catch,
// all caused by GOCLMCP's first-writer-wins schema-name collision resolution:
// Client.ccEmails/currencyId, Webhook.deliveryEnabled/planEnabled, and
// SharedReport declaring public/url when the wire says isPublic/link.
const spec = {
    components: {
        schemas: {
            Client: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    // ccEmails and currencyId deliberately absent -- the real bug.
                },
            },
            Webhook: {
                type: "object",
                properties: { id: { type: "string" }, url: { type: "string" } },
            },
            FreeForm: { type: "object", additionalProperties: true },
            Nested: {
                type: "object",
                properties: {
                    outer: {
                        type: "object",
                        properties: { inner: { type: "string" } },
                    },
                },
            },
            Cyclic: {
                type: "object",
                properties: { self: { $ref: "#/components/schemas/Cyclic" } },
            },
        },
    },
};

test("resolves local refs and rejects foreign ones", () => {
    assert.equal(resolveRef(spec, "#/components/schemas/Client").type, "object");
    assert.equal(resolveRef(spec, "#/components/schemas/Nope"), null);
    assert.equal(resolveRef(spec, "https://example.com/x.json#/Client"), null);
});

test("a wire field absent from the schema is reported as dropped data", () => {
    const result = diffOperation({
        spec,
        schema: { $ref: "#/components/schemas/Client" },
        body: { id: "1", name: "Acme", ccEmails: ["a@b.c"], currencyId: "usd" },
    });
    assert.deepEqual(result.missingFromSchema, ["ccEmails", "currencyId"]);
});

test("array responses compare per item", () => {
    const result = diffOperation({
        spec,
        schema: { type: "array", items: { $ref: "#/components/schemas/Client" } },
        body: [
            { id: "1", name: "A" },
            { id: "2", name: "B", ccEmails: [] },
        ],
    });
    assert.deepEqual(result.missingFromSchema, ["[].ccEmails"]);
});

test("a renamed wire field surfaces as both a drop and a schema-only field", () => {
    // The SharedReport case: schema says url, wire says link.
    const result = diffOperation({
        spec,
        schema: {
            type: "object",
            properties: { url: { type: "string" }, public: { type: "boolean" } },
        },
        body: { link: "https://x", isPublic: true },
    });
    assert.deepEqual(result.missingFromSchema, ["isPublic", "link"]);
    assert.deepEqual(result.schemaOnly, ["public", "url"]);
});

test("an absent optional field only warns, never fails", () => {
    const result = diffOperation({
        spec,
        schema: { $ref: "#/components/schemas/Client" },
        body: { id: "1" },
    });
    assert.deepEqual(result.missingFromSchema, []);
    assert.deepEqual(result.schemaOnly, ["name"]);
});

test("additionalProperties permits unknown keys", () => {
    const result = diffOperation({
        spec,
        schema: { $ref: "#/components/schemas/FreeForm" },
        body: { anything: 1, else: 2 },
    });
    assert.deepEqual(result.missingFromSchema, []);
});

test("a free-form object with no declared properties is open", () => {
    const result = diffOperation({
        spec,
        schema: { type: "object" },
        body: { whatever: true },
    });
    assert.deepEqual(result.missingFromSchema, []);
});

test("nested drops are reported with a dotted path", () => {
    const result = diffOperation({
        spec,
        schema: { $ref: "#/components/schemas/Nested" },
        body: { outer: { inner: "x", surprise: "y" } },
    });
    assert.deepEqual(result.missingFromSchema, ["outer.surprise"]);
});

test("allOf merges branches rather than picking one", () => {
    const result = diffOperation({
        spec,
        schema: {
            allOf: [
                { type: "object", properties: { a: { type: "string" } } },
                { type: "object", properties: { b: { type: "string" } } },
            ],
        },
        body: { a: "1", b: "2", c: "3" },
    });
    assert.deepEqual(result.missingFromSchema, ["c"]);
});

test("oneOf accepts a key contributed by any branch", () => {
    const result = diffOperation({
        spec,
        schema: {
            oneOf: [
                { type: "object", properties: { a: { type: "string" } } },
                { type: "object", properties: { b: { type: "string" } } },
            ],
        },
        body: { b: "2" },
    });
    assert.deepEqual(result.missingFromSchema, []);
});

test("a cyclic schema terminates instead of hanging", () => {
    const { paths } = schemaFieldPaths(spec, { $ref: "#/components/schemas/Cyclic" });
    assert.ok(paths.has("self"));
});

test("an unresolvable ref is treated as open, not as zero known fields", () => {
    // Fail-open here is deliberate: claiming a dangling ref declares no fields
    // would report every wire key as dropped data and bury real findings.
    const result = diffOperation({
        spec,
        schema: { $ref: "#/components/schemas/Missing" },
        body: { a: 1, b: 2 },
    });
    assert.deepEqual(result.missingFromSchema, []);
});

test("wireFieldPaths and schemaFieldPaths agree on array notation", () => {
    assert.ok(wireFieldPaths([{ id: "x" }]).has("[].id"));
    const { paths } = schemaFieldPaths(spec, {
        type: "array",
        items: { $ref: "#/components/schemas/Webhook" },
    });
    assert.ok(paths.has("[].id"));
});

test("depth limits bound both walks symmetrically", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    assert.ok(!wireFieldPaths(deep, { maxDepth: 2 }).has("a.b.c.d"));
});

test("picks the lowest 2xx JSON response schema", () => {
    const operation = {
        responses: {
            400: { content: { "application/json": { schema: { type: "object" } } } },
            201: { content: { "application/json": { schema: { $ref: "#/x" } } } },
            200: { content: { "application/json": { schema: { type: "array" } } } },
        },
    };
    assert.deepEqual(responseSchemaFor(operation), { type: "array" });
});

test("an operation with no JSON 2xx body yields no schema", () => {
    assert.equal(responseSchemaFor({ responses: { 204: { description: "No Content" } } }), null);
    assert.equal(responseSchemaFor({}), null);
});
