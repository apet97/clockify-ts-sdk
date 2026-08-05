import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { typeFromSchema } from "./schema.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const generator = path.join(root, "scripts/generate-sdk-from-openapi.mjs");
const fixtures = path.join(root, "scripts/sdk-codegen/__fixtures__");

test("fixture generation preserves schema fidelity and runtime compatibility", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "clockify-codegen-test-"));
    try {
        const out = path.join(temp, "out");
        const receipt = path.join(temp, "receipt.json");
        await runGenerator([
            "--write",
            "--input",
            path.join(fixtures, "golden.openapi.yaml"),
            "--out",
            out,
            "--receipt",
            receipt,
        ]);

        const invoiceFields = await readGenerated(out, "api/types/OpenapiInvoiceExportFields.ts");
        assert.match(invoiceFields, /RTL\?: boolean;/);
        assert.match(invoiceFields, /rtl\?: boolean;/);

        const auditLogEntry = await readGenerated(out, "api/types/AuditLogEntry.ts");
        assert.match(auditLogEntry, /content\?: string \| null;/);

        const customFieldValue = await readGenerated(out, "api/types/CustomFieldValue.ts");
        assert.match(
            customFieldValue,
            /export type CustomFieldValue = string \| number \| boolean \| string\[\] \| Record<string, unknown> \| null;/,
        );

        const tagRequest = await readGenerated(out, "api/resources/tags/client/requests/TagCreate.ts");
        assert.match(tagRequest, /workspaceId: string;/);
        assert.match(tagRequest, /name: string;/);
        assert.match(tagRequest, /body: TagCreateBody;/);

        const tagClient = await readGenerated(out, "api/resources/tags/client/Client.ts");
        assert.match(tagClient, /public list\(/);
        assert.match(tagClient, /"page-size": request\["page-size"\]/);
        assert.match(tagClient, /core\.bodyFromRequest/);

        const tagType = await readGenerated(out, "api/types/Tag.ts");
        assert.match(tagType, /colors\?: \("RED" \| "GREEN"\)\[\];/);

        const customFieldValueArray = await readGenerated(out, "api/types/CustomFieldValue.ts");
        assert.match(customFieldValueArray, /string\[\]/);

        const filesClient = await readGenerated(out, "api/resources/files/client/Client.ts");
        assert.match(filesClient, /multipart: true/);
        const uploadRequest = await readGenerated(out, "api/resources/files/client/requests/UploadImageFilesRequest.ts");
        assert.match(uploadRequest, /file: Blob \| File \| Buffer \| Uint8Array \| string;/);

        const reportsClient = await readGenerated(out, "api/resources/reports/client/Client.ts");
        assert.match(reportsClient, /core\.HttpResponsePromise<core\.BinaryResponse>/);
        assert.match(reportsClient, /responseType: "binary"/);
        assert.match(reportsClient, /baseUrl: "https:\/\/reports\.api\.clockify\.me\/v1"/);
        assert.match(reportsClient, /service: "reports"/);

        const auditLogClient = await readGenerated(out, "api/resources/auditLog/client/Client.ts");
        assert.match(auditLogClient, /baseUrl: "https:\/\/auditlog-api\.api\.clockify\.me\/v1"/);
        assert.match(auditLogClient, /service: "audit"/);

        assert.match(tagClient, /service: "regular"/);

        const parsedReceipt = JSON.parse(await readFile(receipt, "utf8"));
        assert.equal(parsedReceipt.ok, true);
        assert.deepEqual(
            parsedReceipt.operations.map((operation) => operation.operationId),
            ["listAuditLog", "uploadImage", "exportReport", "listTags", "createTag"],
        );
        assert.equal(parsedReceipt.operationCount, 5);
        assert.equal(parsedReceipt.resourceCount, 4);
        assert.deepEqual(parsedReceipt.diagnostics, []);
        assert.deepEqual(
            Object.fromEntries(parsedReceipt.operations.map((operation) => [operation.operationId, operation.service])),
            {
                listAuditLog: "audit",
                uploadImage: "regular",
                exportReport: "reports",
                listTags: "regular",
                createTag: "regular",
            },
        );

        await runGenerator([
            "--check",
            "--input",
            path.join(fixtures, "golden.openapi.yaml"),
            "--out",
            out,
            "--receipt",
            path.join(temp, "check-receipt.json"),
        ]);
    } finally {
        await rm(temp, { recursive: true, force: true });
    }
});

test("generated runtime models empty JSON bodies, prunes dead filter shadows, and exposes binary text helpers", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "clockify-codegen-contract-"));
    try {
        const input = path.join(temp, "contract.openapi.json");
        const out = path.join(temp, "out");
        const fixture = {
            openapi: "3.0.3",
            info: { title: "Clockify contract fixture", version: "1.0.0" },
            paths: {
                "/workspaces/{workspaceId}/scheduling/empty": {
                    get: {
                        operationId: "getEmptySchedulingTotal",
                        tags: ["Scheduling"],
                        "x-fern-sdk-group-name": "scheduling",
                        "x-fern-sdk-method-name": "empty",
                        "x-clockify-empty-body-is-valid": true,
                        parameters: [
                            {
                                name: "workspaceId",
                                in: "path",
                                required: true,
                                schema: { type: "string" },
                            },
                        ],
                        responses: {
                            "200": {
                                description: "A total, or an empty body when no data exists",
                                content: {
                                    "application/json": {
                                        schema: { $ref: "#/components/schemas/EmptyTotal" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {
                    EmptyTotal: { type: "object", properties: { total: { type: "number" } } },
                    OpenapiAttendanceFilter: { type: "object" },
                    OpenapiDetailedFilter: { type: "object" },
                    OpenapiSummaryFilter: { type: "object" },
                    OpenapiWeeklyFilter: { type: "object" },
                },
            },
        };
        await writeFile(input, JSON.stringify(fixture));
        await runGenerator([
            "--write",
            "--input",
            input,
            "--out",
            out,
            "--receipt",
            path.join(temp, "receipt.json"),
        ]);

        const schedulingClient = await readGenerated(out, "api/resources/scheduling/client/Client.ts");
        assert.match(schedulingClient, /HttpResponsePromise<ClockifyApi\.EmptyTotal \| undefined>/);
        assert.match(schedulingClient, /responseType: "json"/);

        const typeBarrel = await readGenerated(out, "api/types/index.ts");
        assert.doesNotMatch(typeBarrel, /Openapi(?:Attendance|Detailed|Summary|Weekly)Filter/);

        const binaryResponse = await readGenerated(out, "core/fetcher/BinaryResponse.ts");
        assert.match(binaryResponse, /text: \(\) => ReturnType<Response\["text"\]>;/);
        assert.match(binaryResponse, /json<T = unknown>\(\): Promise<T>;/);
        assert.match(binaryResponse, /text: response\.text\.bind\(response\)/);
        assert.match(binaryResponse, /json: response\.json\.bind\(response\)/);
    } finally {
        await rm(temp, { recursive: true, force: true });
    }
});

test("emitted request runtime shares replay-safe typed and passthrough execution", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "clockify-codegen-runtime-"));
    try {
        const out = path.join(temp, "out");
        await runGenerator([
            "--write",
            "--input",
            path.join(fixtures, "golden.openapi.yaml"),
            "--out",
            out,
            "--receipt",
            path.join(temp, "receipt.json"),
        ]);

        const requestRuntime = await readGenerated(out, "core/request.ts");
        assert.match(requestRuntime, /baseUrl\?: string;/);
        assert.match(
            requestRuntime,
            /suppliedBaseUrl \?\? suppliedEnvironment \?\? serviceBaseUrl \?\? operationBaseUrl \?\? ClockifyApiEnvironment\.Default/,
        );
        assert.match(requestRuntime, /resolveBaseUrl\(/);
        assert.match(requestRuntime, /executeRequest\(/);
        assert.equal(requestRuntime.match(/async function executeRequest<T>\(/g)?.length, 1);
        assert.equal(requestRuntime.match(/await executeRequest\(/g)?.length, 2);
        assert.match(requestRuntime, /type ExecuteOutcome<T>/);
        assert.match(requestRuntime, /const value = await abortable\(controller\.signal, \(\) => consume\(response\)\)/);
        assert.match(requestRuntime, /await response\.body\?\.cancel\(\)/);
        assert.match(requestRuntime, /template\.clone\(\)/);
        assert.match(requestRuntime, /response\.body\?\.cancel\(\)/);
        assert.match(requestRuntime, /validateMaxRetries\(/);
        assert.match(requestRuntime, /if \(isAbortError\(cause\)\) throw cause;/);
        assert.match(
            requestRuntime,
            /typeof cause === "object"\s*&&\s*cause !== null\s*&&\s*\(cause as \{ name\?: unknown \}\)\.name === "AbortError"/,
        );
        assert.equal(requestRuntime.match(/applyAuthenticationHeaders\(/g)?.length, 3);
        assert.match(requestRuntime, /const addonToken = requestOptions\?\.addonToken;/);
        assert.match(
            requestRuntime,
            /headers\.has\("X-Api-Key"\) && headers\.has\("X-Addon-Token"\)/,
        );

        const client = await readGenerated(out, "Client.ts");
        assert.match(client, /baseUrl: this\._options\.baseUrl,/);
        assert.match(client, /environment: this\._options\.environment,/);
        assert.match(client, /retryMutationMethods: this\._options\.retryMutationMethods,/);
    } finally {
        await rm(temp, { recursive: true, force: true });
    }
});

test("unsupported schema features fail with JSON-pointer diagnostics and a receipt", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "clockify-codegen-unsupported-"));
    try {
        const receipt = path.join(temp, "receipt.json");
        const result = await runGenerator(
            [
                "--write",
                "--input",
                path.join(fixtures, "unsupported.openapi.yaml"),
                "--out",
                path.join(temp, "out"),
                "--receipt",
                receipt,
            ],
            { reject: false },
        );

        assert.notEqual(result.code, 0);
        assert.match(result.stderr, /#\/components\/schemas\/UnsupportedThing\/not/);

        const parsedReceipt = JSON.parse(await readFile(receipt, "utf8"));
        assert.equal(parsedReceipt.ok, false);
        assert.deepEqual(parsedReceipt.diagnostics, [
            {
                severity: "error",
                pointer: "#/components/schemas/UnsupportedThing/not",
                message: "Unsupported schema keyword: not",
            },
        ]);
    } finally {
        await rm(temp, { recursive: true, force: true });
    }
});

test("--out pointing at an existing directory is rejected without deleting its contents", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "clockify-codegen-unrelated-"));
    try {
        const existing = path.join(temp, "unrelated");
        await mkdir(existing);
        const sentinel = path.join(existing, "sentinel.txt");
        await writeFile(sentinel, "do-not-delete");

        const result = await runGenerator(
            ["--write", "--input", path.join(fixtures, "golden.openapi.yaml"), "--out", existing],
            { reject: false },
        );

        assert.notEqual(result.code, 0);
        assert.match(result.stderr, /unsafe --out/);
        assert.equal(await readFile(sentinel, "utf8"), "do-not-delete");
    } finally {
        await rm(temp, { recursive: true, force: true });
    }
});

test("union members keep balanced brackets when a structured member has an internal union", () => {
    const schema = {
        oneOf: [
            { type: "object", additionalProperties: { oneOf: [{ type: "string" }, { type: "number" }] } },
            { type: "object", additionalProperties: { oneOf: [{ type: "string" }, { type: "boolean" }] } },
        ],
    };
    assert.equal(
        typeFromSchema(schema, { doc: {} }),
        "Record<string, string | number> | Record<string, string | boolean>",
    );

    const flat = { oneOf: [{ type: "string" }, { type: "string" }, { type: "number" }] };
    assert.equal(typeFromSchema(flat, { doc: {} }), "string | number");
});

test("an OpenAPI 3.1 `type` array and the equivalent 3.0 `nullable` flag emit the identical declaration", () => {
    const model = { doc: {} };
    const dialectPairs = [
        [{ type: ["string", "null"] }, { type: "string", nullable: true }],
        [{ type: ["integer", "null"] }, { type: "integer", nullable: true }],
        [{ type: ["boolean", "null"] }, { type: "boolean", nullable: true }],
        [{ type: ["array", "null"], items: { type: "string" } }, { type: "array", items: { type: "string" }, nullable: true }],
    ];
    for (const [threeOne, threeZero] of dialectPairs) {
        assert.equal(typeFromSchema(threeOne, model), typeFromSchema(threeZero, model));
    }

    // A single-element array with no null sibling is the 3.1 spelling of a
    // plain (non-nullable) type — not a nullability signal by itself.
    assert.equal(typeFromSchema({ type: ["string"] }, model), typeFromSchema({ type: "string" }, model));

    // Two or more non-null members have no single-type reduction; this falls
    // through to the pre-3.1-recognition "unknown" behavior rather than
    // guessing at unverified multi-type union semantics.
    assert.equal(typeFromSchema({ type: ["string", "integer"] }, model), "unknown");
});

test("a $ref's OpenAPI 3.1 `type: [\"null\"]` sibling is recognized as nullable, like the 3.0 `nullable` sibling", () => {
    const model = { doc: { components: { schemas: { Widget: { type: "object", properties: { id: { type: "string" } } } } } } };
    const threeZero = typeFromSchema({ $ref: "#/components/schemas/Widget", nullable: true }, model);
    const threeOne = typeFromSchema({ $ref: "#/components/schemas/Widget", type: ["null"] }, model);
    assert.equal(threeZero, "ClockifyApi.Widget | null");
    assert.equal(threeOne, threeZero);
});

async function readGenerated(out, relativePath) {
    return await readFile(path.join(out, relativePath), "utf8");
}

function runGenerator(args, options = {}) {
    return new Promise((resolve, reject) => {
        execFile(process.execPath, [generator, ...args], { cwd: root }, (error, stdout, stderr) => {
            const result = { code: error?.code ?? 0, stdout, stderr };
            if (error && options.reject !== false) {
                error.stdout = stdout;
                error.stderr = stderr;
                reject(error);
                return;
            }
            resolve(result);
        });
    });
}
