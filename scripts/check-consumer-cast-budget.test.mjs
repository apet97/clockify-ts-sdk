import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { validateConsumerCastGovernance } from "./lib/consumer-cast-governance.mjs";

async function withFixture(source, run) {
    const root = await mkdtemp(path.join(tmpdir(), "clockify-consumer-casts-"));
    try {
        await mkdir(path.join(root, "cli/src"), { recursive: true });
        await mkdir(path.join(root, "mcp/src"), { recursive: true });
        await writeFile(path.join(root, "cli/src/fixture.ts"), source);
        await run(root);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

const zeroContract = {
    schemaVersion: 2,
    requestCastGovernance: {
        canonicalZeroBaseline: true,
        sourceRoots: { cli: "cli/src", mcp: "mcp/src" },
        exceptions: { cli: [], mcp: [] },
    },
};

async function writeGovernanceReferences(root) {
    await mkdir(path.join(root, "docs/evidence"), { recursive: true });
    await mkdir(path.join(root, "spec/evidence"), { recursive: true });
    await writeFile(
        path.join(root, "docs/risk-register.json"),
        `${JSON.stringify({ risks: [{ id: "generated-request-gap", status: "open", closureGate: "make consumer-cast-budget" }] })}\n`,
    );
    await writeFile(
        path.join(root, "spec/evidence/discrepancies.md"),
        "### `generated.request-gap` — OPEN\n",
    );
    await writeFile(path.join(root, "docs/evidence/request-gap.md"), "# Request gap\nproof-anchor\n");
    await writeFile(path.join(root, "Makefile"), "consumer-cast-budget:\n\t@true\n");
}

function exceptionContract(exception, canonicalZeroBaseline = false) {
    return {
        schemaVersion: 2,
        requestCastGovernance: {
            canonicalZeroBaseline,
            sourceRoots: { cli: "cli/src", mcp: "mcp/src" },
            exceptions: { cli: [exception], mcp: [] },
        },
    };
}

function completeException() {
    return {
        id: "cli-project-create-gap",
        file: "cli/src/fixture.ts",
        codeMarker: "body as CreateProjectsRequest",
        generatedRequestType: "CreateProjectsRequest",
        discrepancyId: "generated.request-gap",
        openRiskId: "generated-request-gap",
        evidence: {
            path: "docs/evidence/request-gap.md",
            anchor: "proof-anchor",
        },
        exactClosureGate: "consumer-cast-budget",
    };
}

test("rejects an unannotated as-never request assertion", async () => {
    await withFixture(
        "export async function run(client, body) { return client.projects.create(body as never); }\n",
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as never.*cli\/src\/fixture\.ts:1/i);
        },
    );
});

test("rejects a chained unknown assertion to a generated request", async () => {
    await withFixture(
        "type CreateProjectsRequest = { workspaceId: string };\nexport async function run(client, body) { return client.projects.create(body as unknown as CreateProjectsRequest); }\n",
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /CreateProjectsRequest.*cli\/src\/fixture\.ts:2/i);
        },
    );
});

for (const [label, assertion] of [
    ["direct", "body as CreateProjectsRequest"],
    ["angle-bracket", "<CreateProjectsRequest>body"],
]) {
    test(`rejects a ${label} generated-request assertion`, async () => {
        await withFixture(
            `type CreateProjectsRequest = { workspaceId: string };\nexport async function run(client, body) { return client.projects.create(${assertion}); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
                assert.match(result.failures.join("\n"), /CreateProjectsRequest/);
            },
        );
    });
}

test("allows legitimate non-request assertions", async () => {
    await withFixture(
        "export function parse(value: unknown) { return value as Record<string, unknown>; }\nexport function unreachable(value: string) { return value as never; }\n",
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("rejects a helper-hidden blanket request cast", async () => {
    await withFixture(
        "function castRequest<T>(value: unknown): T { return value as T; }\nexport async function run(client, body) { return client.projects.create(castRequest(body)); }\n",
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /helper.*castRequest.*cli\/src\/fixture\.ts:1/i);
        },
    );
});

test("rejects a blanket request helper imported from another governed file", async () => {
    await withFixture(
        "import { castRequest } from './helper.js';\nexport async function run(client, body) { return client.projects.create(castRequest(body)); }\n",
        async (root) => {
            await writeFile(
                path.join(root, "cli/src/helper.ts"),
                "export function castRequest<T>(value: unknown): T { return value as T; }\n",
            );
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /helper.*castRequest.*cli\/src\/helper\.ts:1/i);
        },
    );
});

test("rejects an any-typed request adapter", async () => {
    await withFixture(
        "export function requestAdapter(value: any): any { return value; }\nexport async function run(client, body) { return client.projects.create(requestAdapter(body)); }\n",
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /any.*requestAdapter.*cli\/src\/fixture\.ts:1/i);
        },
    );
});

test("does not govern test-only fixture casts", async () => {
    await withFixture("export const clean = true;\n", async (root) => {
        await mkdir(path.join(root, "cli/tests"), { recursive: true });
        await writeFile(
            path.join(root, "cli/tests/request-fixture.ts"),
            "type CreateProjectsRequest = {}; const request = {} as CreateProjectsRequest;\n",
        );
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [field, mutate] of [
    ["id", (entry) => delete entry.id],
    ["file", (entry) => delete entry.file],
    ["file/range or codeMarker", (entry) => delete entry.codeMarker],
    ["generatedRequestType", (entry) => delete entry.generatedRequestType],
    ["discrepancyId", (entry) => delete entry.discrepancyId],
    ["openRiskId", (entry) => delete entry.openRiskId],
    ["evidence.path", (entry) => delete entry.evidence.path],
    ["evidence.anchor", (entry) => delete entry.evidence.anchor],
    ["exactClosureGate", (entry) => delete entry.exactClosureGate],
]) {
    test(`rejects an exception missing ${field}`, async () => {
        await withFixture(
            "type CreateProjectsRequest = {}; export async function run(client, body) { return client.projects.create(body as CreateProjectsRequest); }\n",
            async (root) => {
                await writeGovernanceReferences(root);
                const exception = completeException();
                mutate(exception);
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: exceptionContract(exception),
                });
                assert.match(result.failures.join("\n"), new RegExp(field.replace("/", ".*"), "i"));
            },
        );
    });
}

for (const [label, mutate, expected] of [
    ["missing discrepancy", (entry) => (entry.discrepancyId = "missing.discrepancy"), /discrepancyId.*does not exist/i],
    ["missing risk", (entry) => (entry.openRiskId = "missing-risk"), /openRiskId.*existing open risk/i],
    ["missing evidence", (entry) => (entry.evidence.path = "docs/evidence/missing.md"), /evidence\.path.*does not exist/i],
    ["missing evidence anchor", (entry) => (entry.evidence.anchor = "missing-anchor"), /evidence\.anchor.*does not exist/i],
    ["missing closure target", (entry) => (entry.exactClosureGate = "missing-gate"), /exactClosureGate.*(?:open risk|Makefile)/i],
    ["stale code marker", (entry) => (entry.codeMarker = "stale marker"), /codeMarker.*found 0/i],
]) {
    test(`rejects an exception with a ${label}`, async () => {
        await withFixture(
            "type CreateProjectsRequest = {}; export async function run(client, body) { return client.projects.create(body as CreateProjectsRequest); }\n",
            async (root) => {
                await writeGovernanceReferences(root);
                const exception = completeException();
                mutate(exception);
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: exceptionContract(exception),
                });
                assert.match(result.failures.join("\n"), expected);
            },
        );
    });
}

test("accepts one fully governed exception outside the canonical zero baseline", async () => {
    await withFixture(
        "type CreateProjectsRequest = {}; export async function run(client, body) { return client.projects.create(body as CreateProjectsRequest); }\n",
        async (root) => {
            await writeGovernanceReferences(root);
            const result = await validateConsumerCastGovernance({
                root,
                contract: exceptionContract(completeException()),
            });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("accepts an exact file/range instead of a stable code marker", async () => {
    await withFixture(
        "type CreateProjectsRequest = {}; export async function run(client, body) { return client.projects.create(body as CreateProjectsRequest); }\n",
        async (root) => {
            await writeGovernanceReferences(root);
            const exception = completeException();
            delete exception.codeMarker;
            exception.range = { startLine: 1, endLine: 1 };
            const result = await validateConsumerCastGovernance({
                root,
                contract: exceptionContract(exception),
            });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("rejects an orphaned exception whose marker exists without a request cast", async () => {
    await withFixture("export const marker = 'body as CreateProjectsRequest';\n", async (root) => {
        await writeGovernanceReferences(root);
        const result = await validateConsumerCastGovernance({
            root,
            contract: exceptionContract(completeException()),
        });
        assert.match(result.failures.join("\n"), /stale or orphaned.*found 0/i);
    });
});

test("rejects non-empty exceptions in the canonical zero baseline", async () => {
    await withFixture(
        "type CreateProjectsRequest = {}; export async function run(client, body) { return client.projects.create(body as CreateProjectsRequest); }\n",
        async (root) => {
            await writeGovernanceReferences(root);
            const result = await validateConsumerCastGovernance({
                root,
                contract: exceptionContract(completeException(), true),
            });
            assert.match(result.failures.join("\n"), /exceptions\.cli must stay empty.*canonical zero baseline/i);
        },
    );
});

test("rejects duplicate exception ids and duplicate cast ownership", async () => {
    await withFixture(
        "type CreateProjectsRequest = {}; export async function run(client, body) { return client.projects.create(body as CreateProjectsRequest); }\n",
        async (root) => {
            await writeGovernanceReferences(root);
            const first = completeException();
            const second = structuredClone(first);
            const contract = exceptionContract(first);
            contract.requestCastGovernance.exceptions.cli.push(second);
            const result = await validateConsumerCastGovernance({ root, contract });
            assert.match(result.failures.join("\n"), /exception id.*must be unique/i);
            assert.match(result.failures.join("\n"), /duplicates cli\/src\/fixture\.ts:1/i);
        },
    );
});
