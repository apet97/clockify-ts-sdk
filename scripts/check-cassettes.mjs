#!/usr/bin/env node
/**
 * Replay committed redacted response cassettes through the real typed SDK client.
 *
 * `replay-fixtures` checks static fixture bytes and helper arithmetic. This gate
 * starts the local mock server, seeds it with the cassette body, calls the public
 * generated client method, and asserts the parsed fields are present.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const cassettesDir = "spec/evidence/cassettes";
const failures = [];

function fail(where, message) {
    failures.push(`${where}: ${message}`);
}

function readJson(relPath) {
    return JSON.parse(fs.readFileSync(path.join(root, relPath), "utf8"));
}

const secretPolicy = readJson("docs/secret-hygiene.json");
const secretPatterns = (secretPolicy.patterns ?? []).map((item) => ({
    id: item.id,
    re: new RegExp(item.regex),
}));
const placeholderId = /^0{20}[0-9]{4}$/;
const hex24 = /\b[0-9a-f]{24}\b/gi;

const mockUrl = pathToFileURL(path.join(root, "scripts", "mock-clockify-server.mjs")).href;
const clientUrl = pathToFileURL(path.join(root, "wrapper", "create-client.ts")).href;
const { createMockClockifyServer } = await import(mockUrl);
const { createClockifyClient } = await import(clientUrl);

const dirAbs = path.join(root, cassettesDir);
const files = fs.existsSync(dirAbs)
    ? fs.readdirSync(dirAbs).filter((file) => file.endsWith(".json")).sort()
    : [];

if (files.length === 0) fail(cassettesDir, "no cassettes found");

for (const file of files) {
    const rel = path.join(cassettesDir, file);
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    for (const { id, re } of secretPatterns) {
        if (re.test(text)) fail(rel, `secret-hygiene pattern ${id} matched`);
    }
    for (const match of text.matchAll(hex24)) {
        if (!placeholderId.test(match[0])) fail(rel, `un-redacted 24-hex id ${match[0]}`);
    }

    let cassette;
    try {
        cassette = JSON.parse(text);
    } catch (error) {
        fail(rel, `invalid JSON: ${error.message}`);
        continue;
    }

    if (typeof cassette.operationId !== "string" || cassette.operationId.length === 0) {
        fail(rel, "operationId must be a non-empty string");
    }
    if (cassette.response == null) fail(rel, "response payload missing");
    if (!Array.isArray(cassette.expectParse) || cassette.expectParse.length === 0) {
        fail(rel, "expectParse must be a non-empty array");
    }

    try {
        const parsed = await replay(cassette);
        for (const assertion of cassette.expectParse ?? []) {
            assertParsed(rel, parsed, assertion);
        }
    } catch (error) {
        fail(rel, error instanceof Error ? error.message : String(error));
    }
}

if (failures.length > 0) {
    console.error("cassettes gate FAILED:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log(`cassettes gate passed (${files.length} typed-client replays, hygiene clean).`);

async function replay(cassette) {
    const mock = createMockClockifyServer({
        state: stateFor(cassette),
        workspaceId: cassette.request?.workspaceId,
    });
    try {
        const baseUrl = await mock.listen();
        const client = createClockifyClient({ apiKey: "mock", environment: baseUrl, maxRetries: 0 });
        switch (cassette.operationId) {
            case "getWorkspaceProjects":
                return await client.projects.list(cassette.request, { maxRetries: 0 });
            case "getInvoice":
                return await client.invoices.get(cassette.request, { maxRetries: 0 });
            case "getTimeOffRequests":
                return await client.timeOff.list(cassette.request, { maxRetries: 0 });
            default:
                throw new Error(`unsupported cassette operation ${cassette.operationId}`);
        }
    } finally {
        await mock.close();
    }
}

function stateFor(cassette) {
    const userId = "000000000000000000000002";
    const base = {
        tags: [],
        clients: [{ id: "000000000000000000000201", name: "Acme", archived: false }],
        projects: [],
        entries: [],
        invoices: [],
        timeOffRequests: [],
        lastInvoicePut: null,
    };
    if (cassette.operationId === "getWorkspaceProjects") base.projects = cassette.response;
    if (cassette.operationId === "getInvoice") base.invoices = [cassette.response];
    if (cassette.operationId === "getTimeOffRequests") {
        base.timeOffRequests = cassette.response.requests ?? [];
    }
    return { ...base, userId };
}

function assertParsed(rel, parsed, assertion) {
    if (typeof assertion?.path !== "string" || typeof assertion?.type !== "string") {
        fail(rel, "expectParse entries need path and type");
        return;
    }
    const value = getPath(parsed, assertion.path);
    const type = Array.isArray(value) ? "array" : typeof value;
    if (type !== assertion.type) {
        fail(rel, `${assertion.path} type ${type}, expected ${assertion.type}`);
        return;
    }
    if ("equals" in assertion && value !== assertion.equals) {
        fail(rel, `${assertion.path} = ${JSON.stringify(value)}, expected ${JSON.stringify(assertion.equals)}`);
    }
}

function getPath(value, dotted) {
    return dotted.split(".").reduce((current, segment) => {
        if (current == null) return undefined;
        if (/^\d+$/.test(segment)) return current[Number(segment)];
        return current[segment];
    }, value);
}
