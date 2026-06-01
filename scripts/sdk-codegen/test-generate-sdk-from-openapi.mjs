import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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

        const filesClient = await readGenerated(out, "api/resources/files/client/Client.ts");
        assert.match(filesClient, /multipart: true/);
        const uploadRequest = await readGenerated(out, "api/resources/files/client/requests/UploadImageFilesRequest.ts");
        assert.match(uploadRequest, /file: Blob \| File \| Buffer \| Uint8Array \| string;/);

        const reportsClient = await readGenerated(out, "api/resources/reports/client/Client.ts");
        assert.match(reportsClient, /core\.HttpResponsePromise<core\.BinaryResponse>/);
        assert.match(reportsClient, /responseType: "binary"/);
        assert.match(reportsClient, /baseUrl: "https:\/\/reports\.api\.clockify\.me\/v1"/);

        const parsedReceipt = JSON.parse(await readFile(receipt, "utf8"));
        assert.equal(parsedReceipt.ok, true);
        assert.deepEqual(
            parsedReceipt.operations.map((operation) => operation.operationId),
            ["uploadImage", "exportReport", "listTags", "createTag"],
        );
        assert.equal(parsedReceipt.operationCount, 4);
        assert.equal(parsedReceipt.resourceCount, 3);
        assert.deepEqual(parsedReceipt.diagnostics, []);

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
