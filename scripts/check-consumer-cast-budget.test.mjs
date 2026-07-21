import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import {
    CANONICAL_CONSUMER_CAST_CONTRACT,
    validateCanonicalConsumerCastContract,
    validateConsumerCastMakeWiring,
    validatePublicNoAnyProofSource,
} from "./lib/consumer-cast-contract.mjs";
import { validateConsumerCastGovernance } from "./lib/consumer-cast-governance.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonicalContract = JSON.parse(
    await readFile(path.join(repoRoot, "docs/consumer-cast-budget-contract.json"), "utf8"),
);

async function withFixture(source, run) {
    const root = await mkdtemp(path.join(tmpdir(), "clockify-consumer-casts-"));
    try {
        await mkdir(path.join(root, "cli/src"), { recursive: true });
        await mkdir(path.join(root, "mcp/src"), { recursive: true });
        await mkdir(path.join(root, "node_modules/clockify-sdk-ts-115"), { recursive: true });
        await writeFile(
            path.join(root, "node_modules/clockify-sdk-ts-115/package.json"),
            `${JSON.stringify({
                name: "clockify-sdk-ts-115",
                type: "module",
                exports: { "./requests": { types: "./requests.d.ts" } },
            })}\n`,
        );
        await writeFile(
            path.join(root, "node_modules/clockify-sdk-ts-115/requests.d.ts"),
            [
                "export namespace ClockifyApi {",
                "  export interface CreateProjectsRequest { workspaceId: string; body?: unknown }",
                "  export interface UpdateProjectsRequest { workspaceId: string; projectId: string; body?: unknown }",
                "}",
                "export interface FixtureClient {",
                "  projects: {",
                "    create(request: ClockifyApi.CreateProjectsRequest): Promise<unknown>;",
                "    update(request: ClockifyApi.UpdateProjectsRequest): Promise<unknown>;",
                "  };",
                "}",
                "",
            ].join("\n"),
        );
        await writeFile(path.join(root, "cli/src/fixture.ts"), source);
        await run(root);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

const generatedImports =
    'import type { ClockifyApi, FixtureClient } from "clockify-sdk-ts-115/requests";\n';

function requestFixture(expression, before = "") {
    return `${generatedImports}${before}export async function run(client: FixtureClient, body: unknown) { return client.projects.create(${expression}); }\n`;
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
    await writeFile(
        path.join(root, "docs/evidence/request-gap.md"),
        "# Request gap\nproof-anchor\n",
    );
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
        codeMarker: "body as ClockifyApi.CreateProjectsRequest",
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
    await withFixture(requestFixture("body as never"), async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as never.*cli\/src\/fixture\.ts:2/i);
    });
});

test("rejects an as-never request assertion through a client alias", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const api = client; return api.projects.create(body as never); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as never.*cli\/src\/fixture\.ts:2/i);
        },
    );
});

test("does not treat an unrelated RetryRequest as a generated Clockify request", async () => {
    await withFixture(
        "interface RetryRequest { retries: number }\ninterface Transport { send(request: RetryRequest): void }\nexport function run(transport: Transport, body: unknown) { transport.send(body as RetryRequest); }\n",
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, invocation] of [
    ["parenthesized client receiver", "(client).projects.create(body as never)"],
    ["element-access client call", 'client["projects"]["create"](body as never)'],
]) {
    test(`rejects an as-never request assertion through a ${label}`, async () => {
        await withFixture(
            `${generatedImports}export async function run(client: FixtureClient, body: unknown) { return ${invocation}; }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as never.*CreateProjectsRequest/i);
            },
        );
    });
}

test("rejects a variable-indirected request assertion", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const request = body as never; return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as never.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, prelude, assertion] of [
    ["direct any", "", "body as any"],
    ["angle-bracket any", "", "<any>body"],
    ["aliased any", "type Loose = any;\n", "body as Loose"],
    ["aliased never", "type Impossible = never;\n", "body as Impossible"],
    [
        "aliased generated request",
        "type ProjectCreate = ClockifyApi.CreateProjectsRequest;\n",
        "body as ProjectCreate",
    ],
]) {
    test(`rejects a ${label} request escape`, async () => {
        await withFixture(requestFixture(assertion, prelude), async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.notEqual(result.failures.length, 0);
            assert.match(result.failures.join("\n"), /CreateProjectsRequest/);
        });
    });
}

test("rejects an imported helper alias", async () => {
    await withFixture(
        `${generatedImports}import { castRequest as adapt } from "./helper.js";\nexport async function run(client: FixtureClient, body: unknown) { return client.projects.create(adapt(body)); }\n`,
        async (root) => {
            await writeFile(
                path.join(root, "cli/src/helper.ts"),
                "export function castRequest<T>(value: unknown): T { return value as T; }\n",
            );
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /generic request helper.*helper\.ts:1/i);
        },
    );
});

test("rejects a namespace-qualified imported helper", async () => {
    await withFixture(
        `${generatedImports}import * as helpers from "./helper.js";\nexport async function run(client: FixtureClient, body: unknown) { return client.projects.create(helpers.castRequest(body)); }\n`,
        async (root) => {
            await writeFile(
                path.join(root, "cli/src/helper.ts"),
                "export function castRequest<T>(value: unknown): T { return value as T; }\n",
            );
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /generic request helper.*helper\.ts:1/i);
        },
    );
});

test("rejects a property helper", async () => {
    await withFixture(
        requestFixture(
            "helpers.castRequest(body)",
            "const helpers = { castRequest<T>(value: unknown): T { return value as T; } };\n",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /generic request helper.*fixture\.ts:2/i);
        },
    );
});

test("rejects a helper imported from outside the configured source roots", async () => {
    await withFixture(
        `${generatedImports}import { castRequest } from "../../shared/helper.js";\nexport async function run(client: FixtureClient, body: unknown) { return client.projects.create(castRequest(body)); }\n`,
        async (root) => {
            await mkdir(path.join(root, "shared"), { recursive: true });
            await writeFile(
                path.join(root, "shared/helper.ts"),
                "export function castRequest<T>(value: unknown): T { return value as T; }\n",
            );
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(
                result.failures.join("\n"),
                /generic request helper.*shared\/helper\.ts:1/i,
            );
        },
    );
});

test("rejects transitive wrapper chains", async () => {
    await withFixture(
        requestFixture(
            "outer(body)",
            "function inner<T>(value: unknown): T { return value as T; }\nfunction outer<T>(value: unknown): T { return inner<T>(value); }\n",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /generic request helper.*fixture\.ts:2/i);
        },
    );
});

test("rejects generic Readonly request wrappers", async () => {
    await withFixture(
        requestFixture(
            "readonlyRequest<ClockifyApi.CreateProjectsRequest>(body)",
            "function readonlyRequest<T>(value: unknown): Readonly<T> { return value as Readonly<T>; }\n",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /generic request helper.*Readonly<T>/i);
        },
    );
});

test("rejects aliased-any adapters", async () => {
    await withFixture(
        requestFixture(
            "adapt(body)",
            "type Loose = any;\nfunction adapt(value: Loose): Loose { return value; }\n",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /any request helper.*adapt/i);
        },
    );
});

test("rejects helper results assigned before the request call", async () => {
    await withFixture(
        `${generatedImports}function castRequest<T>(value: unknown): T { return value as T; }\nexport async function run(client: FixtureClient, body: unknown) { const request = castRequest<ClockifyApi.CreateProjectsRequest>(body); return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /generic request helper.*fixture\.ts:2/i);
        },
    );
});

test("rejects an annotated-any request variable", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const request: any = body; return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /any.*CreateProjectsRequest/i);
        },
    );
});

test("rejects a request escape introduced by a later assignment", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { let request; request = body as never; return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as never.*CreateProjectsRequest/i);
        },
    );
});

test("rejects a request escape introduced by a request-contributing parameter initializer", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { function submit(request: ClockifyApi.CreateProjectsRequest = body as any) { return client.projects.create(request); } return submit(); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("does not flag an unreachable request parameter initializer", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { function submit(request: ClockifyApi.CreateProjectsRequest = body as any) { return client.projects.create(request); } return submit({ workspaceId: "safe" }); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("traces a destructured request parameter default", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { function submit({ request = body as any }: { request?: ClockifyApi.CreateProjectsRequest } = {}) { return client.projects.create(request); } return submit(); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("traces a request-bearing object parameter default", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { function submit(options: { request: ClockifyApi.CreateProjectsRequest } = { request: body as any }) { return client.projects.create(options.request); } return submit(); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("does not flag unreachable structured parameter defaults", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { function submit({ request = body as any }: { request?: ClockifyApi.CreateProjectsRequest } = {}) { return client.projects.create(request); } return submit({ request: { workspaceId: "safe" } }); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("keeps an exported callable parameter default reachable despite safe internal calls", async () => {
    await withFixture(
        `${generatedImports}declare const fallback: unknown; export function submit(client: FixtureClient, request: ClockifyApi.CreateProjectsRequest = fallback as any) { return client.projects.create(request); } export function internal(client: FixtureClient) { return submit(client, { workspaceId: "safe" }); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("keeps a default-exported callable parameter default reachable", async () => {
    await withFixture(
        `${generatedImports}declare const fallback: unknown; export default function submit(client: FixtureClient, request: ClockifyApi.CreateProjectsRequest = fallback as any) { return client.projects.create(request); } export function internal(client: FixtureClient) { return submit(client, { workspaceId: "safe" }); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("keeps an escaped callable parameter default reachable", async () => {
    await withFixture(
        `${generatedImports}declare const fallback: unknown; function submit(client: FixtureClient, request: ClockifyApi.CreateProjectsRequest = fallback as any) { return client.projects.create(request); } export const api = { submit }; export function internal(client: FixtureClient) { return submit(client, { workspaceId: "safe" }); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, type, initial, operator] of [
    ["nullish", "ClockifyApi.CreateProjectsRequest | undefined", "undefined", "??="],
    ["logical-or", "ClockifyApi.CreateProjectsRequest | undefined", "undefined", "||="],
    ["logical-and", "ClockifyApi.CreateProjectsRequest", '{ workspaceId: "unsafe-path" }', "&&="],
]) {
    test(`qualifies ${label} compound reachability by exact receiver`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ${type} }\nexport async function run(client: FixtureClient, body: unknown) { const target: Holder = { request: ${initial} }; const other: Holder = { request: { workspaceId: "safe" } }; other.request = { workspaceId: "later-safe" }; target.request ${operator} body as any; return client.projects.create(target.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

for (const [label, type, targetValue, otherValue, operator] of [
    [
        "nullish",
        "ClockifyApi.CreateProjectsRequest | undefined",
        '{ workspaceId: "safe" }',
        "undefined",
        "??=",
    ],
    [
        "logical-or",
        "ClockifyApi.CreateProjectsRequest | undefined",
        '{ workspaceId: "safe" }',
        "undefined",
        "||=",
    ],
    [
        "logical-and",
        "ClockifyApi.CreateProjectsRequest | undefined",
        "undefined",
        '{ workspaceId: "safe" }',
        "&&=",
    ],
]) {
    test(`does not let another receiver make an unsafe ${label} RHS reachable`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ${type} }\nexport async function run(client: FixtureClient, body: unknown) { const target: Holder = { request: ${targetValue} }; const other: Holder = { request: ${otherValue} }; other.request = ${otherValue}; target.request ${operator} body as any; return client.projects.create(target.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.deepEqual(result.failures, []);
            },
        );
    });
}

for (const [label, declaration, assignment] of [
    [
        "nullish",
        "let request: ClockifyApi.CreateProjectsRequest | undefined;",
        "request ??= body as any;",
    ],
    [
        "logical-or",
        "let request: ClockifyApi.CreateProjectsRequest | undefined;",
        "request ||= body as any;",
    ],
    [
        "logical-and",
        'let request: ClockifyApi.CreateProjectsRequest = { workspaceId: "safe" };',
        "request &&= body as any;",
    ],
]) {
    test(`rejects a request escape introduced by ${label} assignment`, async () => {
        await withFixture(
            `${generatedImports}export async function run(client: FixtureClient, body: unknown) { ${declaration} ${assignment} return client.projects.create(request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

for (const [label, assignment] of [
    ["nullish", "request ??= body as any;"],
    ["logical-or", "request ||= body as any;"],
    ["logical-and", "request &&= { workspaceId: 'still-safe' };"],
]) {
    test(`does not flag an unreachable unsafe ${label} assignment branch`, async () => {
        await withFixture(
            `${generatedImports}export async function run(client: FixtureClient, body: unknown) { let request: ClockifyApi.CreateProjectsRequest = { workspaceId: "safe" }; ${assignment} return client.projects.create(request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.deepEqual(result.failures, []);
            },
        );
    });
}

test("does not flag an unreachable unsafe logical-and assignment from a falsey value", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { let request: ClockifyApi.CreateProjectsRequest | null = null; request &&= body as any; request = { workspaceId: "safe" }; return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not let a conditional prior write hide a reachable nullish assignment", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown, choose: boolean) { let request: ClockifyApi.CreateProjectsRequest | undefined; if (choose) request = { workspaceId: "safe" }; request ??= body as any; return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("rejects a request escape introduced by a destructuring assignment target", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { let request: ClockifyApi.CreateProjectsRequest = { workspaceId: "safe" }; ({ request } = { request: body as any }); return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("rejects every branch assignment that may reach the request boundary", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown, unsafe: boolean) { let request: ClockifyApi.CreateProjectsRequest = { workspaceId: "safe" }; if (unsafe) { request = body as any; } else { request = { workspaceId: "also-safe" }; } return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("does not flag an unsafe value that is definitely overwritten before the request", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { let request: any = body as any; request = { workspaceId: "safe" }; return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not flag an unsafe prior value when both control-flow branches overwrite it", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown, first: boolean) { let request: any = body as any; if (first) { request = { workspaceId: "first-safe" }; } else { request = { workspaceId: "second-safe" }; } return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("rejects request escapes introduced by property writes", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const holder: { request: ClockifyApi.CreateProjectsRequest } = { request: { workspaceId: "safe" } }; holder.request = body as any; return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("does not flag an unsafe property value definitely overwritten before the request", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const holder: { request: ClockifyApi.CreateProjectsRequest } = { request: { workspaceId: "safe" } }; holder.request = body as any; holder.request = { workspaceId: "safe-again" }; return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not conflate property writes on distinct receiver symbols", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const unsafe: Holder = { request: { workspaceId: "initial" } }; unsafe.request = body as any; const safe: Holder = { request: { workspaceId: "safe" } }; return client.projects.create(safe.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not let a different receiver write cut off an unsafe reaching property write", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const unsafe: Holder = { request: { workspaceId: "initial" } }; const safe: Holder = { request: { workspaceId: "safe" } }; unsafe.request = body as any; safe.request = { workspaceId: "later-safe" }; return client.projects.create(unsafe.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("keeps receiver origins ordered across reassignment", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const unsafe: Holder = { request: { workspaceId: "initial" } }; const safe: Holder = { request: { workspaceId: "safe" } }; let target = unsafe; target.request = body as any; target = safe; target.request = { workspaceId: "later-safe" }; return client.projects.create(unsafe.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, alias] of [
    ["conditional", "choose ? unsafe : safe"],
    ["logical", "choose && unsafe || safe"],
]) {
    test(`traces ${label} receiver-producing aliases conservatively`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const unsafe: Holder = { request: { workspaceId: "initial" } }; const safe: Holder = { request: { workspaceId: "safe" } }; unsafe.request = body as any; const target = ${alias}; return client.projects.create(target.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("traces an unknown receiver-producing alias conservatively", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nfunction pick(left: Holder, right: Holder): Holder { return Math.random() > 0.5 ? left : right; }\nexport async function run(client: FixtureClient, body: unknown) { const unsafe: Holder = { request: { workspaceId: "initial" } }; const safe: Holder = { request: { workspaceId: "safe" } }; unsafe.request = body as any; const target = pick(unsafe, safe); return client.projects.create(target.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("does not trace a discarded receiver in a sequence alias", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const unsafe: Holder = { request: { workspaceId: "initial" } }; const safe: Holder = { request: { workspaceId: "safe" } }; unsafe.request = body as any; const target = (unsafe, safe); return client.projects.create(target.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("rejects request escapes through a const-literal computed property write", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const holder: { request: ClockifyApi.CreateProjectsRequest } = { request: { workspaceId: "safe" } }; const key: "request" = "request"; holder[key] = body as any; return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("rejects an unresolved computed write that may target the request property", async () => {
    await withFixture(
        `${generatedImports}type Holder = Record<string, unknown> & { request: ClockifyApi.CreateProjectsRequest };\nexport async function run(client: FixtureClient, body: unknown, key: string) { const holder: Holder = { request: { workspaceId: "safe" } }; holder[key] = body as any; return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("does not spread an unresolved computed write across distinct receivers", async () => {
    await withFixture(
        `${generatedImports}type Holder = Record<string, unknown> & { request: ClockifyApi.CreateProjectsRequest };\nexport async function run(client: FixtureClient, body: unknown, key: string) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; other[key] = body as any; return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not conflate a known different computed property with request", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest; other: unknown }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" }, other: null }; const key: "other" = "other"; holder[key] = body as any; return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("rejects request escapes from relevant property declarations", async () => {
    await withFixture(
        `${generatedImports}class Holder { request: any; constructor(body: unknown) { this.request = body; } }\nexport async function run(client: FixtureClient, body: unknown) { const holder = new Holder(body); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /any.*CreateProjectsRequest/i);
        },
    );
});

test("rejects request escapes returned by relevant accessors", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const holder = { get request(): ClockifyApi.CreateProjectsRequest { return body as any; } }; return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("rejects request escapes flowing through array binding elements", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const [request]: [ClockifyApi.CreateProjectsRequest] = [body as any]; return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("rejects a request escape in an array binding default", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const [request = body as any]: [ClockifyApi.CreateProjectsRequest?] = []; return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("rejects a request escape in an object binding default", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const { request = body as any }: { request?: ClockifyApi.CreateProjectsRequest } = {}; return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, binding] of [
    ["array", "const [request = body as any] = [undefined];"],
    ["object", "const { request = body as any } = { request: undefined };"],
]) {
    test(`rejects a ${label} binding default reached through explicit undefined`, async () => {
        await withFixture(
            `${generatedImports}export async function run(client: FixtureClient, body: unknown) { ${binding} return client.projects.create(request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("rejects request escapes flowing through nested binding patterns", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const { inner: { request } } = { inner: { request: body as any } }; return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, binding] of [
    ["array", 'const [request = body as any] = [{ workspaceId: "safe" }];'],
    ["object", 'const { request = body as any } = { request: { workspaceId: "safe" } };'],
]) {
    test(`does not flag an unreachable ${label} binding default`, async () => {
        await withFixture(
            `${generatedImports}export async function run(client: FixtureClient, body: unknown) { ${binding} return client.projects.create(request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.deepEqual(result.failures, []);
            },
        );
    });
}

test("rejects request escapes flowing through object binding elements", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const { request } = { request: body as any }; return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("resolves a computed constant object binding key", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const key = "request" as const; const { [key]: request } = { request: body as any }; return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("traces object-rest binding values", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const source = { ignored: true, request: body as any }; const { ignored, ...rest } = source; return client.projects.create(rest.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("traces array-rest binding values", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const [ignored, ...rest] = [null, body as any]; return client.projects.create(rest[0]); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("does not conflate an excluded object-rest property", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const source = { unsafe: body as any, request: { workspaceId: "safe" } }; const { unsafe, ...rest } = source; return client.projects.create(rest.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("traces a nested object-rest access flow", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const source = { outer: { ignored: true, request: body as any } }; const { outer: { ignored, ...rest } } = source; return client.projects.create(rest.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("does not conflate a computed binding key with another property", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const key = "request" as const; const { [key]: request } = { request: { workspaceId: "safe" }, unsafe: body as any }; return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("traces object-rest destructuring assignment from a typed source", async () => {
    await withFixture(
        `${generatedImports}interface Source { ignored: boolean; request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const source: Source = { ignored: true, request: body as any }; let rest: Omit<Source, "ignored">; ({ ignored: source.ignored, ...rest } = source); return client.projects.create(rest.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("traces array-rest destructuring assignment including later elements", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const source: [null, string, ClockifyApi.CreateProjectsRequest] = [null, "skip", body as any]; let rest: [string, ClockifyApi.CreateProjectsRequest]; [, ...rest] = source; return client.projects.create(rest[1]); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("traces a defaulted destructuring assignment target", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { let request: ClockifyApi.CreateProjectsRequest; ({ request = body as any } = {} as { request?: ClockifyApi.CreateProjectsRequest }); return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("does not trace an unreachable destructuring assignment default", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { let request: ClockifyApi.CreateProjectsRequest; ({ request = body as any } = { request: { workspaceId: "safe" } }); return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not include nested object-rest exclusions", async () => {
    await withFixture(
        `${generatedImports}interface Source { unsafe: unknown; request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const source: { inner: Source } = { inner: { unsafe: body as any, request: { workspaceId: "safe" } } }; let rest: Omit<Source, "unsafe">; ({ inner: { unsafe: source.inner.unsafe, ...rest } } = source); return client.projects.create(rest.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("derives receiver origins from a captured factory return", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const unsafe: Holder = { request: { workspaceId: "initial" } }; unsafe.request = body as any; function factory() { return unsafe; } const target = factory(); return client.projects.create(target.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("derives receiver origins from recursive factory returns with a bound", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const unsafe: Holder = { request: { workspaceId: "initial" } }; unsafe.request = body as any; function factory(depth: number): Holder { return depth > 0 ? factory(depth - 1) : unsafe; } const target = factory(1); return client.projects.create(target.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("does not derive receiver origins from unused factory arguments", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nfunction factory(_ignored: Holder, safe: Holder): Holder { return safe; }\nexport async function run(client: FixtureClient, body: unknown) { const unsafe: Holder = { request: { workspaceId: "initial" } }; unsafe.request = body as any; const safe: Holder = { request: { workspaceId: "safe" } }; const target = factory(unsafe, safe); return client.projects.create(target.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, expression] of [
    ["logical", "(body as any) || { workspaceId: 'ws' }"],
    ["nullish", "(body as any) ?? { workspaceId: 'ws' }"],
    ["sequence", "(0, body as any)"],
]) {
    test(`rejects request escapes in ${label} expressions`, async () => {
        await withFixture(requestFixture(expression), async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

test("rejects spread request arguments", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { return client.projects.create(...([body as any] as [any])); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("rejects a direct structural assertion at a Clockify request boundary", async () => {
    await withFixture(requestFixture("body as { workspaceId: string }"), async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /workspaceId.*CreateProjectsRequest/i);
    });
});

test("rejects generic request casts inside object spreads", async () => {
    await withFixture(
        requestFixture(
            "{ ...cast<ClockifyApi.CreateProjectsRequest>(body) }",
            "function cast<T>(value: unknown): T { return value as T; }\n",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(
                result.failures.join("\n"),
                /generic request helper.*CreateProjectsRequest/i,
            );
        },
    );
});

test("rejects declaration-only generic request casters", async () => {
    await withFixture(
        requestFixture(
            "cast<ClockifyApi.CreateProjectsRequest>(body)",
            "declare function cast<T>(value: unknown): T;\n",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(
                result.failures.join("\n"),
                /declaration-only request helper.*CreateProjectsRequest/i,
            );
        },
    );
});

test("rejects interface-declared generic request casters", async () => {
    await withFixture(
        requestFixture(
            "caster.cast<ClockifyApi.CreateProjectsRequest>(body)",
            "interface Caster { cast<T>(value: unknown): T; }\ndeclare const caster: Caster;\n",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(
                result.failures.join("\n"),
                /declaration-only request helper.*CreateProjectsRequest/i,
            );
        },
    );
});

test("rejects imported declaration-only generic request casters", async () => {
    await withFixture(
        `${generatedImports}import { cast } from "../../shared/caster.js";\nexport async function run(client: FixtureClient, body: unknown) { return client.projects.create(cast<ClockifyApi.CreateProjectsRequest>(body)); }\n`,
        async (root) => {
            await mkdir(path.join(root, "shared"), { recursive: true });
            await writeFile(
                path.join(root, "shared/caster.d.ts"),
                "export declare function cast<T>(value: unknown): T;\n",
            );
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(
                result.failures.join("\n"),
                /declaration-only request helper.*shared\/caster\.d\.ts/i,
            );
        },
    );
});

for (const [label, invocation] of [
    ["call", "client.projects.create.call(client.projects, body as any)"],
    ["apply", "client.projects.create.apply(client.projects, [body as any])"],
    ["bind", "client.projects.create.bind(client.projects, body as any)()"],
]) {
    test(`rejects request escapes through Function.${label}`, async () => {
        await withFixture(
            `${generatedImports}export async function run(client: FixtureClient, body: unknown) { return ${invocation}; }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("recovers a generated request boundary through an any helper parameter", async () => {
    await withFixture(
        `${generatedImports}function invoke(create: any, body: unknown) { return create(body as never); }\nexport async function run(client: FixtureClient, body: unknown) { return invoke(client.projects.create, body); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as never.*CreateProjectsRequest/i);
        },
    );
});

test("recovers a generated request boundary from an any helper call result", async () => {
    await withFixture(
        `${generatedImports}function requestMethod(client: FixtureClient): any { return client.projects.create; }\nexport async function run(client: FixtureClient, body: unknown) { const create = requestMethod(client); return create(body as never); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as never.*CreateProjectsRequest/i);
        },
    );
});

test("recovers a generated request boundary from an any-valued object holder", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const holder: { create: any } = { create: client.projects.create }; return holder.create(body as never); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as never.*CreateProjectsRequest/i);
        },
    );
});

test("recovers a generated request boundary through an any-erased Function.call", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { return (client.projects.create as any).call(client.projects, body as never); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as never.*CreateProjectsRequest/i);
        },
    );
});

test("does not infer a generated boundary through an unrelated any helper parameter", async () => {
    await withFixture(
        `${generatedImports}function invoke(send: any, body: unknown) { return send(body as never); }\nexport function run(body: unknown) { return invoke((value: string) => value, body); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, invocation] of [
    ["erased client receiver", "(client as any).projects.create(body as never)"],
    ["erased request method", "(client.projects.create as any)(body as never)"],
    [
        "aliased erased client receiver",
        "(() => { const erased = client as any; return erased.projects.create(body as never); })()",
    ],
    [
        "aliased erased request method",
        "(() => { const create = client.projects.create as any; return create(body as never); })()",
    ],
]) {
    test(`rejects a request escape through an ${label}`, async () => {
        await withFixture(
            `${generatedImports}export async function run(client: FixtureClient, body: unknown) { return ${invocation}; }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as never.*CreateProjectsRequest/i);
            },
        );
    });
}

test("does not flag an unrelated any logger parameter that cannot flow into the request", async () => {
    await withFixture(
        requestFixture(
            "build(logger)",
            "function build(logger: any): ClockifyApi.CreateProjectsRequest { logger.info('building'); return { workspaceId: 'ws' }; }\nconst logger: any = { info() {} };\n",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("models a called hoisted helper mutation of a governed request value", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; mutate(holder, body); return client.projects.create(holder.request); function mutate(target: Holder, value: unknown) { target.request = value as any; } }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("does not model an uncalled helper mutation", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; return client.projects.create(holder.request); function mutate(target: Holder, value: unknown) { target.request = value as any; } }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("models bounded recursive helper side effects", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nfunction mutate(target: Holder, value: unknown, depth: number): void { if (depth > 0) mutate(target, value, depth - 1); else target.request = value as any; }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; mutate(holder, body, 1); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("models an imported helper mutation of a governed request value", async () => {
    await withFixture(
        `${generatedImports}import { mutate } from "./mutate.js";\ninterface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; mutate(holder, body); return client.projects.create(holder.request); }\n`,
        async (root) => {
            await writeFile(
                path.join(root, "cli/src/mutate.ts"),
                `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function mutate(target: Holder, value: unknown) { target.request = value as any; }\n`,
            );
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("recovers a later property write on an any-valued function holder", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const holder: any = {}; holder.create = client.projects.create; return holder.create(body as never); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as never.*CreateProjectsRequest/i);
        },
    );
});

test("recovers a generated boundary passed through an any-erased Function.call invocation", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const invoke: any = Function.prototype.call; return invoke.call(null, client.projects.create, body as never); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as never.*CreateProjectsRequest/i);
        },
    );
});

test("does not infer a generated boundary from an unrelated any function property", async () => {
    await withFixture(
        requestFixture(
            '{ workspaceId: "safe" }',
            "const holder: any = {}; holder.log = (value: unknown) => value; holder.log({ ignored: true } as never);\n",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("substitutes nested helper receiver paths", async () => {
    await withFixture(
        `${generatedImports}interface Holder { inner: { request: ClockifyApi.CreateProjectsRequest } }\nfunction mutate(target: Holder, value: unknown) { target.inner.request = value as any; }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { inner: { request: { workspaceId: "safe" } } }; mutate(holder, body); return client.projects.create(holder.inner.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, invocation] of [
    ["call", "mutate.call(null, holder, body)"],
    ["apply", "mutate.apply(null, [holder, body])"],
]) {
    test(`models synchronous helper effects through Function.${label}`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nfunction mutate(target: Holder, value: unknown) { target.request = value as any; }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ${invocation}; return client.projects.create(holder.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("models synchronous helper effects through Function.bind invocation", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nfunction mutate(target: Holder, value: unknown) { target.request = value as any; }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const bound = mutate.bind(null, holder); bound(body); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const method of ["forEach", "map"]) {
    test(`models synchronous Array.${method} callback effects`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; [holder].${method}((target) => { target.request = body as any; }); return client.projects.create(holder.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

for (const [label, callback] of [
    ["named", "mutate"],
    ["aliased", "callback"],
]) {
    test(`models synchronous Array.forEach effects through a ${label} callback`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function mutate(target: Holder) { target.request = body as any; } const callback = mutate; [holder].forEach(${callback}); return client.projects.create(holder.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

for (const [method, callbackTail] of [
    ["filter", "return true;"],
    ["every", "return true;"],
    ["some", "return false;"],
    ["find", "return true;"],
    ["findIndex", "return true;"],
    ["flatMap", "return [target];"],
]) {
    test(`models synchronous Array.${method} named callback effects`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function mutate(target: Holder) { target.request = body as any; ${callbackTail} } [holder].${method}(mutate); return client.projects.create(holder.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

for (const method of ["reduce", "reduceRight"]) {
    test(`models synchronous Array.${method} callback argument substitution`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function mutate(accumulator: Holder, current: Holder) { current.request = body as any; return accumulator; } [holder].${method}(mutate, holder); return client.projects.create(holder.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

for (const method of [
    "forEach",
    "map",
    "filter",
    "every",
    "some",
    "find",
    "findIndex",
    "flatMap",
]) {
    test(`does not claim Array.${method} callback effects for a known-empty receiver`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function mutate(target: Holder) { target.request = body as any; return true; } ([] as Holder[]).${method}(mutate); return client.projects.create(holder.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.deepEqual(result.failures, []);
            },
        );
    });
}

test("does not claim a named asynchronous callback effect before the request", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function mutate() { holder.request = body as any; } setTimeout(mutate, 0); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not claim a synchronous callback effect behind a definite logical short circuit", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function mutate(target: Holder) { target.request = body as any; return true; } true || [holder].some(mutate); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not claim callback execution for a receiver that is not statically non-empty", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, values: Holder[]) { const holder: Holder = { request: { workspaceId: "safe" } }; function mutate(target: Holder) { target.request = body as any; } values.forEach(mutate); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("models a synchronous callback through a statically recovered array receiver alias", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const values = [holder]; function mutate(target: Holder) { target.request = body as any; } values.forEach(mutate); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, receiver] of [
    ["conditional", "choose ? [holder] : []"],
    ["logical", "optional || [holder]"],
    ["sequence", "(optional, [holder])"],
]) {
    test(`models a synchronous callback through ${label} array receiver alternatives`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean, optional: Holder[] | undefined) { const holder: Holder = { request: { workspaceId: "safe" } }; const values = ${receiver}; function mutate(target: Holder) { target.request = body as any; } values.forEach(mutate); return client.projects.create(holder.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("retains nested helper effects from a synthetic inline callback invocation", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nfunction mutate(target: Holder, value: unknown) { target.request = value as any; }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const values = [holder]; values.forEach((value) => mutate(value, body)); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("does not retain an overwritten array receiver alias", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; let values: Holder[] = [holder]; values = []; function mutate(target: Holder) { target.request = body as any; } values.forEach(mutate); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const method of ["reduce", "reduceRight"]) {
    test(`propagates Array.${method} callback returns into the next accumulator`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const initial: Holder = { request: { workspaceId: "initial" } }; const returned: Holder = { request: { workspaceId: "returned" } }; const first: Holder = { request: { workspaceId: "first" } }; const second: Holder = { request: { workspaceId: "second" } }; function combine(accumulator: Holder, _current: Holder) { accumulator.request = body as any; return returned; } [first, second].${method}(combine, initial); return client.projects.create(returned.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

for (const [method, terminal] of [
    ["some", "true"],
    ["every", "false"],
    ["find", "true"],
    ["findIndex", "true"],
]) {
    test(`stops Array.${method} callback effects after a statically terminal return`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const first: Holder = { request: { workspaceId: "first" } }; const later: Holder = { request: { workspaceId: "later" } }; function inspect(target: Holder) { target.request = body as any; return ${terminal}; } [first, later].${method}(inspect); return client.projects.create(later.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.deepEqual(result.failures, []);
            },
        );
    });
}

test("evaluates a callback branch before short-circuiting Array.some", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const first: Holder = { request: { workspaceId: "first" } }; const later: Holder = { request: { workspaceId: "later" } }; function inspect(target: Holder) { target.request = body as any; if (target === first) return true; return false; } [first, later].some(inspect); return client.projects.create(later.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("keeps unknown Array.some callback returns conservative", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, stop: boolean) { const first: Holder = { request: { workspaceId: "first" } }; const later: Holder = { request: { workspaceId: "later" } }; function inspect(target: Holder) { target.request = body as any; return stop; } [first, later].some(inspect); return client.projects.create(later.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("models Object.assign request writes", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; Object.assign(holder, { request: body as any }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("models Reflect.set request writes", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; Reflect.set(holder, "request", body as any); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, source] of [
    ["patch variable", "const patch = { request: body as any }; Object.assign(holder, patch);"],
    [
        "spread source",
        "const patch = { request: body as any }; Object.assign(holder, { ...patch });",
    ],
    [
        "factory-returned patch",
        "function patch() { return { request: body as any }; } Object.assign(holder, patch());",
    ],
    [
        "aliased Object.assign",
        "const assign = Object.assign; assign(holder, { request: body as any });",
    ],
    [
        "namespace-aliased Object.assign",
        "const Objects = Object; Objects.assign(holder, { request: body as any });",
    ],
    [
        "property-aliased Object.assign",
        "const api = { assign: Object.assign }; api.assign(holder, { request: body as any });",
    ],
    ["aliased Reflect.set", 'const set = Reflect.set; set(holder, "request", body as any);'],
    [
        "namespace-aliased Reflect.set",
        'const Reflection = Reflect; Reflection.set(holder, "request", body as any);',
    ],
]) {
    test(`models request writes through a ${label}`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ${source} return client.projects.create(holder.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("does not spread an aliased Object.assign effect across receivers", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; const assign = Object.assign; const patch = { request: body as any }; assign(other, patch); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not treat an unrelated local assign function as Object.assign", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nfunction assign(_target: Holder, _patch: unknown) {}\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; assign(holder, { request: body as any }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not retain overwritten Object.assign alias provenance", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; let assign: (target: Holder, patch: Partial<Holder>) => Holder = Object.assign; assign = (target) => target; assign(holder, { request: body as any }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not retain an overwritten Object.assign patch value", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; let patch: Holder = { request: body as any }; patch = { request: { workspaceId: "replacement" } }; Object.assign(holder, patch); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("lets a later definite Object.assign call dominate an earlier unsafe effect", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "initial" } }; Object.assign(holder, { request: body as any }); Object.assign(holder, { request: { workspaceId: "safe" } }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("lets a later definite Reflect.set dominate an earlier unsafe effect", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "initial" } }; Object.assign(holder, { request: body as any }); Reflect.set(holder, "request", { workspaceId: "safe" }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("keeps an earlier unsafe effect when a later safe call is conditional", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, applySafe: boolean) { const holder: Holder = { request: { workspaceId: "initial" } }; Object.assign(holder, { request: body as any }); if (applySafe) Object.assign(holder, { request: { workspaceId: "safe" } }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, guarded] of [
    [
        "unknown logical-and Object.assign",
        'applySafe && Object.assign(holder, { request: { workspaceId: "safe" } });',
    ],
    [
        "unknown logical-or Reflect.set",
        'applySafe || Reflect.set(holder, "request", { workspaceId: "safe" });',
    ],
    [
        "unknown nullish Object.assign",
        'maybe ?? Object.assign(holder, { request: { workspaceId: "safe" } });',
    ],
    [
        "conditional-expression Object.assign",
        'applySafe ? Object.assign(holder, { request: { workspaceId: "safe" } }) : undefined;',
    ],
]) {
    test(`keeps prior effects through ${label}`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, applySafe: boolean, maybe: unknown) { const holder: Holder = { request: { workspaceId: "initial" } }; Object.assign(holder, { request: body as any }); ${guarded} return client.projects.create(holder.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

for (const [label, definite] of [
    [
        "true logical-and Object.assign",
        'true && Object.assign(holder, { request: { workspaceId: "safe" } });',
    ],
    [
        "false logical-or Reflect.set",
        'false || Reflect.set(holder, "request", { workspaceId: "safe" });',
    ],
]) {
    test(`allows dominance through ${label}`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "initial" } }; Object.assign(holder, { request: body as any }); ${definite} return client.projects.create(holder.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.deepEqual(result.failures, []);
            },
        );
    });
}

test("traces an unsafe getter in a direct request object", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { return client.projects.create({ get workspaceId() { return body as any; } }); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("allows a safe getter in a direct request object", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient) { return client.projects.create({ get workspaceId() { return "safe"; } }); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("traces an unsafe getter projected by Object.assign", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; Object.assign(holder, { get request() { return body as any; } }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("allows a safe getter projected by Object.assign", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient) { const holder: Holder = { request: { workspaceId: "initial" } }; Object.assign(holder, { get request() { return { workspaceId: "safe" }; } }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, setup, effect] of [
    [
        "Object.defineProperty value",
        "",
        'Object.defineProperty(holder, "request", { value: body as any });',
    ],
    [
        "Object.defineProperty getter",
        "",
        'Object.defineProperty(holder, "request", { get() { return body as any; } });',
    ],
    [
        "aliased Object.defineProperty",
        "const define = Object.defineProperty;",
        'define(holder, "request", { value: body as any });',
    ],
    [
        "Object.defineProperties",
        "",
        "Object.defineProperties(holder, { request: { value: body as any } });",
    ],
]) {
    test(`models ${label} effects`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ${setup} ${effect} return client.projects.create(holder.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("lets a later definite defineProperty dominate an unsafe effect", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; Object.assign(holder, { request: body as any }); Object.defineProperty(holder, "request", { value: { workspaceId: "safe" } }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not spread defineProperty effects across receivers", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; Object.defineProperty(other, "request", { value: body as any }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("keeps prior unsafe effects when a safe defineProperty is conditional", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, applySafe: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; Object.assign(holder, { request: body as any }); applySafe && Object.defineProperty(holder, "request", { value: { workspaceId: "safe" } }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("hard-stops analysis work at the configured cap", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, a: boolean, b: boolean, c: boolean) { const holder = { request: { workspaceId: "safe" } }; Object.assign(holder, { ...(a ? { a: 1 } : { aa: 1 }), ...(b ? { b: 1 } : { bb: 1 }), ...(c ? { c: 1 } : { cc: 1 }) }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({
                root,
                contract: zeroContract,
                analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 12 },
            });
            assert.match(result.failures.join("\n"), /analysis limit exceeded.*work.*12/i);
            assert.deepEqual(result.analysisStats, { work: 12, exhausted: true });
        },
    );
});

test("reports normal bounded work below a configured cap", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient) { const holder = { request: { workspaceId: "safe" } }; Object.assign(holder, { request: { workspaceId: "safe" } }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({
                root,
                contract: zeroContract,
                analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 100 },
            });
            assert.deepEqual(result.failures, []);
            assert.equal(result.analysisStats.exhausted, false);
            assert.ok(result.analysisStats.work < 100);
        },
    );
});

for (const [label, descriptor] of [
    [
        "unsafe-then-safe conditional descriptor",
        'chooseUnsafe ? { value: body as any } : { value: { workspaceId: "safe" } }',
    ],
    [
        "safe-then-unsafe conditional descriptor",
        'chooseUnsafe ? { value: { workspaceId: "safe" } } : { value: body as any }',
    ],
]) {
    test("keeps mutually exclusive " + label + " paths", async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, chooseUnsafe: boolean) { const holder: Holder = { request: { workspaceId: "initial" } }; Object.defineProperty(holder, "request", ' +
                descriptor +
                "); return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("allows all-safe conditional defineProperty descriptor paths", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, choose: boolean) { const holder: Holder = { request: { workspaceId: "initial" } }; Object.defineProperty(holder, "request", choose ? { value: { workspaceId: "one" } } : { value: { workspaceId: "two" } }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, descriptors] of [
    [
        "unsafe-getter-then-safe defineProperties map",
        'chooseUnsafe ? { request: { get() { return body as any; } } } : { request: { value: { workspaceId: "safe" } } }',
    ],
    [
        "safe-then-unsafe-getter defineProperties map",
        'chooseUnsafe ? { request: { value: { workspaceId: "safe" } } } : { request: { get() { return body as any; } } }',
    ],
]) {
    test("keeps mutually exclusive " + label + " paths", async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, chooseUnsafe: boolean) { const holder: Holder = { request: { workspaceId: "initial" } }; Object.defineProperties(holder, ' +
                descriptors +
                "); return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("allows all-safe conditional defineProperties map paths", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, choose: boolean) { const holder: Holder = { request: { workspaceId: "initial" } }; Object.defineProperties(holder, choose ? { request: { get() { return { workspaceId: "one" }; } } } : { request: { value: { workspaceId: "two" } } }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, setup, descriptor] of [
    ["shorthand getter", "const get = () => body as any;", "{ get }"],
    [
        "aliased shorthand getter",
        "const getter = () => body as any; const get = getter;",
        "{ get }",
    ],
    ["spread descriptor", "const descriptor = { value: body as any };", "{ ...descriptor }"],
    [
        "factory descriptor",
        "function descriptor() { return { value: body as any }; }",
        "descriptor()",
    ],
]) {
    test("traces an unsafe " + label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "initial" } }; ' +
                setup +
                ' Object.defineProperty(holder, "request", ' +
                descriptor +
                "); return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

for (const [label, setup, descriptors] of [
    ["direct unresolved defineProperties map", "", "body as any"],
    ["aliased unresolved defineProperties map", "const map = body as any;", "map"],
    [
        "unsafe-last unresolved defineProperties map spread",
        "",
        '{ request: { value: { workspaceId: "safe" } }, ...(body as any) }',
    ],
]) {
    test("traces an " + label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "initial" } }; ' +
                setup +
                " Object.defineProperties(holder, " +
                descriptors +
                "); return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("lets a later exact defineProperties descriptor dominate an unresolved map spread", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "initial" } }; Object.defineProperties(holder, { ...(body as any), request: { value: { workspaceId: "safe" } } }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("bounds nested conditional reducer returns before materializing every origin", async () => {
    const nested = ["a", "b", "c", "d", "e", "f", "g"].reduceRight(
        (inner, flag) => flag + " ? (" + inner + ") : (" + inner + ")",
        "acc",
    );
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, a: boolean, b: boolean, c: boolean, d: boolean, e: boolean, f: boolean, g: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; [1].reduce((acc) => ' +
            nested +
            ", holder); return client.projects.create(holder.request); }\n",
        async (root) => {
            const result = await validateConsumerCastGovernance({
                root,
                contract: zeroContract,
                analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 60 },
            });
            assert.match(result.failures.join("\n"), /analysis limit exceeded.*work.*60/i);
            assert.deepEqual(result.analysisStats, {
                work: 60,
                exhausted: true,
                largestCallbackExpansion: 60,
            });
        },
    );
});

test("reports a below-cap nested conditional reducer expansion", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, a: boolean, b: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; [1].reduce((acc) => a ? (b ? acc : acc) : (b ? acc : acc), holder); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({
                root,
                contract: zeroContract,
                analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 1000 },
            });
            assert.deepEqual(result.failures, []);
            assert.equal(result.analysisStats.exhausted, false);
            assert.ok(result.analysisStats.largestCallbackExpansion > 0);
            assert.ok(result.analysisStats.largestCallbackExpansion < 1000);
        },
    );
});

for (const [label, setup, effect] of [
    [
        "Reflect.defineProperty value",
        "",
        'Reflect.defineProperty(holder, "request", { value: body as any });',
    ],
    [
        "Reflect.defineProperty getter",
        "",
        'Reflect.defineProperty(holder, "request", { get() { return body as any; } });',
    ],
    [
        "aliased Reflect.defineProperty",
        "const define = Reflect.defineProperty;",
        'define(holder, "request", { value: body as any });',
    ],
    [
        "unsafe-then-safe conditional Reflect.defineProperty descriptor",
        "",
        'Reflect.defineProperty(holder, "request", choose ? { value: body as any } : { value: { workspaceId: "safe" } });',
    ],
    [
        "safe-then-unsafe conditional Reflect.defineProperty descriptor",
        "",
        'Reflect.defineProperty(holder, "request", choose ? { value: { workspaceId: "safe" } } : { value: body as any });',
    ],
]) {
    test("models " + label + " effects", async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "initial" } }; ' +
                setup +
                " " +
                effect +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("allows all-safe conditional Reflect.defineProperty descriptor paths", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, choose: boolean) { const holder: Holder = { request: { workspaceId: "initial" } }; Reflect.defineProperty(holder, "request", choose ? { value: { workspaceId: "one" } } : { value: { workspaceId: "two" } }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not spread Reflect.defineProperty effects across receivers", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; Reflect.defineProperty(other, "request", { value: body as any }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("lets a later definite Reflect.defineProperty dominate an unsafe effect", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; Object.assign(holder, { request: body as any }); Reflect.defineProperty(holder, "request", { value: { workspaceId: "safe" } }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("keeps an unsafe effect when a safe Reflect.defineProperty is conditional", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; Object.assign(holder, { request: body as any }); choose && Reflect.defineProperty(holder, "request", { value: { workspaceId: "safe" } }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

const computedBuiltinEffects = [
    {
        label: "Object assign",
        globalName: "Object",
        member: "assign",
        overwritten: "keys",
        args: "holder, { request: body as any }",
    },
    {
        label: "Object defineProperty",
        globalName: "Object",
        member: "defineProperty",
        overwritten: "keys",
        args: 'holder, "request", { value: body as any }',
    },
    {
        label: "Object defineProperties",
        globalName: "Object",
        member: "defineProperties",
        overwritten: "keys",
        args: "holder, body as any",
    },
    {
        label: "Reflect set",
        globalName: "Reflect",
        member: "set",
        overwritten: "get",
        args: 'holder, "request", body as any',
    },
    {
        label: "Reflect defineProperty",
        globalName: "Reflect",
        member: "defineProperty",
        overwritten: "get",
        args: 'holder, "request", { value: body as any }',
    },
];

for (const effect of computedBuiltinEffects) {
    test("models literal element access for " + effect.label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ' +
                effect.globalName +
                '["' +
                effect.member +
                '"](' +
                effect.args +
                "); return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });

    test("models const-key element access for " + effect.label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const member = "' +
                effect.member +
                '" as const; ' +
                effect.globalName +
                "[member](" +
                effect.args +
                "); return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });

    test("does not retain an overwritten element-access key for " + effect.label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; let member: keyof typeof ' +
                effect.globalName +
                ' = "' +
                effect.member +
                '"; member = "' +
                effect.overwritten +
                '"; ' +
                effect.globalName +
                "[member](" +
                effect.args +
                "); return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.deepEqual(result.failures, []);
            },
        );
    });
}

test("does not treat a shadow Object literal element member as Object.assign", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const Object = { assign(target: Holder, _patch: unknown) { return target; } }; Object["assign"](holder, { request: body as any }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not treat a shadow Reflect literal element member as Reflect.set", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const Reflect = { set(_target: Holder, _key: string, _value: unknown) { return true; } }; Reflect["set"](holder, "request", body as any); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not treat an unrelated local literal element member as a built-in", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const helpers = { assign(target: Holder, _patch: unknown) { return target; } }; helpers["assign"](holder, { request: body as any }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, setup, invocation] of [
    [
        "direct Object.assign.call",
        "",
        "Object.assign.call(Object, holder, { request: body as any });",
    ],
    [
        "direct Object.assign.apply array",
        "",
        "Object.assign.apply(Object, [holder, { request: body as any }]);",
    ],
    [
        "aliased Object.assign.call",
        "const assign = Object.assign;",
        "assign.call(Object, holder, { request: body as any });",
    ],
    [
        "computed Object.assign.apply",
        "",
        'Object["assign"].apply(Object, [holder, { request: body as any }]);',
    ],
    [
        "tuple-aliased Object.assign.apply",
        "const args = [holder, { request: body as any }] as const;",
        "Object.assign.apply(Object, args);",
    ],
    [
        "invoked bound computed Object.assign",
        'const assign = Object["assign"].bind(Object, holder);',
        "assign({ request: body as any });",
    ],
    ["direct Reflect.set.call", "", 'Reflect.set.call(Reflect, holder, "request", body as any);'],
    [
        "aliased Reflect.set.apply",
        "const set = Reflect.set;",
        'set.apply(Reflect, [holder, "request", body as any]);',
    ],
    [
        "invoked bound Reflect.set",
        'const set = Reflect.set.bind(Reflect, holder, "request");',
        "set(body as any);",
    ],
    [
        "Object.defineProperty.call getter descriptor",
        "",
        'Object.defineProperty.call(Object, holder, "request", { get() { return body as any; } });',
    ],
    [
        "computed Reflect.defineProperty.apply",
        "",
        'Reflect["defineProperty"].apply(Reflect, [holder, "request", { value: body as any }]);',
    ],
    [
        "invoked bound Object.defineProperties",
        "const define = Object.defineProperties.bind(Object, holder);",
        "define({ request: { value: body as any } });",
    ],
]) {
    test("models " + label + " effects", async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ' +
                setup +
                " " +
                invocation +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

for (const [label, setup] of [
    [
        "canonical Function.prototype.bind assignment",
        "const assign = Object.assign; assign.bind = Function.prototype.bind;",
    ],
    [
        "canonical Function.prototype.bind restoration",
        "const assign = Object.assign; const custom = ((_thisArg: unknown) => (_patch: unknown) => undefined) as typeof assign.bind; assign.bind = custom; assign.bind = Function.prototype.bind;",
    ],
]) {
    test("models native bind after " + label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ' +
                setup +
                " assign.bind(Object, holder)({ request: body as any }); return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("does not treat a shadow Function.prototype.bind as native", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; const Function = { prototype: { bind: (_target: unknown, _thisArg: unknown) => (_patch: unknown) => undefined } }; assign.bind = Function.prototype.bind as typeof assign.bind; assign.bind(Object, holder)({ request: body as any }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not treat a non-native bind lookalike as native", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; const bind = (_target: unknown, _thisArg: unknown) => (_patch: unknown) => undefined; assign.bind = bind as typeof assign.bind; assign.bind(Object, holder)({ request: body as any }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, invocation] of [
    ["direct custom binder", "assign.bind(Object, holder, body)({});"],
    ["custom binder through call", "assign.bind.call(assign, Object, holder, body)({});"],
    ["custom binder through apply", "assign.bind.apply(assign, [Object, holder, body])({});"],
]) {
    test("models unsafe creation-time effects from " + label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown) { Object.assign(target, { request: input as any }); return (_patch: unknown) => undefined; }) as typeof assign.bind; ' +
                invocation +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("keeps conditional unsafe custom-binder creation effects", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (choose ? function (_thisArg: unknown, target: Holder, input: unknown) { Object.assign(target, { request: input as any }); return (_patch: unknown) => undefined; } : function (_thisArg: unknown, _target: Holder, _input: unknown) { return (_patch: unknown) => undefined; }) as typeof assign.bind; assign.bind(Object, holder, body)({}); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("allows a definite returned-callable safe write after an unsafe binder write", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown) { Object.assign(target, { request: input as any }); return () => Object.assign(target, { request: { workspaceId: "safe" } }); }) as typeof assign.bind; const bound = assign.bind(Object, holder, body); bound(); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("keeps an unsafe binder write when the later returned write is conditional", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown) { Object.assign(target, { request: input as any }); return () => { if (choose) Object.assign(target, { request: { workspaceId: "safe" } }); }; }) as typeof assign.bind; const bound = assign.bind(Object, holder, body); bound(); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, invocation] of [
    ["direct custom binder", "assign.bind(Object, holder, body)();"],
    ["custom binder through call", "assign.bind.call(assign, Object, holder, body)();"],
    ["custom binder through apply", "assign.bind.apply(assign, [Object, holder, body])();"],
]) {
    test("allows an immediate safe returned write after " + label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown) { Object.assign(target, { request: input as any }); return () => Object.assign(target, { request: { workspaceId: "safe" } }); }) as typeof assign.bind; ' +
                invocation +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.deepEqual(result.failures, []);
            },
        );
    });
}

for (const [label, invocation] of [
    ["direct custom binder", "assign.bind(Object, holder)(body);"],
    ["custom binder through call", "assign.bind.call(assign, Object, holder)(body);"],
    ["custom binder through apply", "assign.bind.apply(assign, [Object, holder])(body);"],
]) {
    test("keeps an immediate unsafe returned write after " + label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder) { Object.assign(target, { request: { workspaceId: "safe" } }); return (input: unknown) => Object.assign(target, { request: input as any }); }) as typeof assign.bind; ' +
                invocation +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("keeps an immediate unsafe binder write when the returned safe write is conditional", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown) { Object.assign(target, { request: input as any }); return () => { if (choose) Object.assign(target, { request: { workspaceId: "safe" } }); }; }) as typeof assign.bind; assign.bind(Object, holder, body)(); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, invocation] of [
    ["direct custom binder", "assign.bind(Object, holder, body)();"],
    ["custom binder through call", "assign.bind.call(assign, Object, holder, body)();"],
    ["custom binder through apply", "assign.bind.apply(assign, [Object, holder, body])();"],
]) {
    test(
        "keeps unsafe binder effects across mutually exclusive " + label + " alternatives",
        async () => {
            await withFixture(
                generatedImports +
                    'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (choose ? function (_thisArg: unknown, target: Holder, input: unknown) { Object.assign(target, { request: input as any }); return () => undefined; } : function (_thisArg: unknown, target: Holder, _input: unknown) { return () => Object.assign(target, { request: { workspaceId: "safe" } }); }) as typeof assign.bind; ' +
                    invocation +
                    " return client.projects.create(holder.request); }\n",
                async (root) => {
                    const result = await validateConsumerCastGovernance({
                        root,
                        contract: zeroContract,
                    });
                    assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
                },
            );
        },
    );
}

for (const [label, invocation] of [
    ["direct custom binder", "assign.bind(Object, holder, body, choose)();"],
    ["custom binder through call", "assign.bind.call(assign, Object, holder, body, choose)();"],
    ["custom binder through apply", "assign.bind.apply(assign, [Object, holder, body, choose])();"],
]) {
    test(
        "keeps unsafe binder effects when " + label + " conditionally returns a safe callable",
        async () => {
            await withFixture(
                generatedImports +
                    'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown, selectSafe: boolean) { Object.assign(target, { request: input as any }); return selectSafe ? () => Object.assign(target, { request: { workspaceId: "safe" } }) : () => undefined; }) as typeof assign.bind; ' +
                    invocation +
                    " return client.projects.create(holder.request); }\n",
                async (root) => {
                    const result = await validateConsumerCastGovernance({
                        root,
                        contract: zeroContract,
                    });
                    assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
                },
            );
        },
    );
}

test("allows immediate safe writes when every custom-binder alternative overwrites", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (choose ? function (_thisArg: unknown, target: Holder, input: unknown) { Object.assign(target, { request: input as any }); return () => Object.assign(target, { request: { workspaceId: "safe" } }); } : function (_thisArg: unknown, target: Holder, input: unknown) { Reflect.set(target, "request", input as any); return () => Reflect.set(target, "request", { workspaceId: "safe" }); }) as typeof assign.bind; assign.bind(Object, holder, body)(); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, invocation] of [
    ["direct custom binder", "assign.bind(Object, holder, body)();"],
    ["custom binder through call", "assign.bind.call(assign, Object, holder, body)();"],
    ["custom binder through apply", "assign.bind.apply(assign, [Object, holder, body])();"],
]) {
    test("allows an immediate direct safe assignment after " + label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown) { target.request = input as any; return () => { target.request = { workspaceId: "safe" }; }; }) as typeof assign.bind; ' +
                invocation +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.deepEqual(result.failures, []);
            },
        );
    });
}

for (const [label, invocation] of [
    ["direct custom binder", "assign.bind(Object, holder)(body);"],
    ["custom binder through call", "assign.bind.call(assign, Object, holder)(body);"],
    ["custom binder through apply", "assign.bind.apply(assign, [Object, holder])(body);"],
]) {
    test("keeps an immediate direct unsafe assignment after " + label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder) { target.request = { workspaceId: "safe" }; return (input: unknown) => { target.request = input as any; }; }) as typeof assign.bind; ' +
                invocation +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("allows sequential unsafe then safe direct assignments inside a custom binder", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown) { target.request = input as any; target.request = { workspaceId: "safe" }; return () => undefined; }) as typeof assign.bind; assign.bind(Object, holder, body)(); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("allows sequential unsafe then safe direct assignments inside a returned callable", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown) { return () => { target.request = input as any; target.request = { workspaceId: "safe" }; }; }) as typeof assign.bind; assign.bind(Object, holder, body)(); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("keeps a direct unsafe binder assignment when the returned safe assignment is conditional", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown) { target.request = input as any; return () => { if (choose) target.request = { workspaceId: "safe" }; }; }) as typeof assign.bind; assign.bind(Object, holder, body)(); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("keeps a direct unsafe binder assignment before an early return", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown) { target.request = input as any; if (choose) return () => undefined; target.request = { workspaceId: "safe" }; return () => undefined; }) as typeof assign.bind; assign.bind(Object, holder, body)(); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("keeps a direct unsafe binder assignment when a returned callable can exit early", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown) { target.request = input as any; return () => { if (choose) return; target.request = { workspaceId: "safe" }; }; }) as typeof assign.bind; assign.bind(Object, holder, body)(); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("does not let a direct safe assignment to another receiver dominate", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, safeTarget: Holder, input: unknown) { target.request = input as any; return () => { safeTarget.request = { workspaceId: "safe" }; }; }) as typeof assign.bind; assign.bind(Object, holder, other, body)(); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, invocation] of [
    ["direct custom binder", "assign.bind(Object, holder, body)()();"],
    ["custom binder through call", "assign.bind.call(assign, Object, holder, body)()();"],
    ["custom binder through apply", "assign.bind.apply(assign, [Object, holder, body])()();"],
]) {
    test("allows a nested safe-final callable from " + label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown) { target.request = input as any; return () => () => { target.request = { workspaceId: "safe" }; }; }) as typeof assign.bind; ' +
                invocation +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.deepEqual(result.failures, []);
            },
        );
    });
}

for (const [label, invocation] of [
    ["direct custom binder", "assign.bind(Object, holder, body)()();"],
    ["custom binder through call", "assign.bind.call(assign, Object, holder, body)()();"],
    ["custom binder through apply", "assign.bind.apply(assign, [Object, holder, body])()();"],
]) {
    test("keeps a nested unsafe-final callable from " + label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown) { target.request = { workspaceId: "safe" }; return () => () => { target.request = input as any; }; }) as typeof assign.bind; ' +
                invocation +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

for (const [label, invocation] of [
    ["direct custom binder", "assign.bind(Object, holder, body, choose)()();"],
    ["custom binder through call", "assign.bind.call(assign, Object, holder, body, choose)()();"],
    [
        "custom binder through apply",
        "assign.bind.apply(assign, [Object, holder, body, choose])()();",
    ],
]) {
    test("keeps a nested conditional safe/noop callable from " + label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown, selectSafe: boolean) { target.request = input as any; return () => selectSafe ? () => { target.request = { workspaceId: "safe" }; } : () => undefined; }) as typeof assign.bind; ' +
                invocation +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

for (const [label, invocation] of [
    ["direct custom binder", "assign.bind(Object, holder, body)()();"],
    ["custom binder through call", "assign.bind.call(assign, Object, holder, body)()();"],
    ["custom binder through apply", "assign.bind.apply(assign, [Object, holder, body])()();"],
]) {
    test("keeps nested mutually exclusive " + label + " paths", async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (choose ? function (_thisArg: unknown, target: Holder, input: unknown) { target.request = input as any; return () => () => undefined; } : function (_thisArg: unknown, target: Holder, _input: unknown) { return () => () => { target.request = { workspaceId: "safe" }; }; }) as typeof assign.bind; ' +
                invocation +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("allows nested safe-final writes on every binder alternative", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (choose ? function (_thisArg: unknown, target: Holder, input: unknown) { target.request = input as any; return () => () => { target.request = { workspaceId: "safe" }; }; } : function (_thisArg: unknown, target: Holder, input: unknown) { Reflect.set(target, "request", input as any); return () => () => Reflect.set(target, "request", { workspaceId: "safe" }); }) as typeof assign.bind; assign.bind(Object, holder, body)()(); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("models an unsafe write through three nested returned callables", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown) { return () => () => () => { target.request = input as any; }; }) as typeof assign.bind; assign.bind(Object, holder, body)()()(); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("allows a safe-final write through three nested returned callables", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown) { target.request = input as any; return () => () => () => { target.request = { workspaceId: "safe" }; }; }) as typeof assign.bind; assign.bind(Object, holder, body)()()(); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not invoke a nested returned callable that is only returned", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, input: unknown) { return () => () => { target.request = input as any; }; }) as typeof assign.bind; assign.bind(Object, holder, body)(); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("fails closed when nested returned-callable alternatives exceed the cap", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder) { return () => choose ? () => { target.request = { workspaceId: "safe" }; } : () => undefined; }) as typeof assign.bind; assign.bind(Object, holder)()(); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({
                root,
                contract: zeroContract,
                analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 1000 },
            });
            assert.match(result.failures.join("\n"), /analysis limit exceeded.*alternatives.*1/i);
        },
    );
});

test("fails closed for an unresolved invoked nested returned callable", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, hidden: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (function (_thisArg: unknown) { return () => hidden as any; }) as typeof assign.bind; assign.bind(Object)()(); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(
                result.failures.join("\n"),
                /statically resolve.*nested returned callable/i,
            );
        },
    );
});

for (const [label, invocation] of [
    ["direct", "assign.bind(Object, holder, PATCH)()();"],
    ["call", "assign.bind.call(assign, Object, holder, PATCH)()();"],
    ["apply", "assign.bind.apply(assign, [Object, holder, PATCH])()();"],
    ["computed", 'assign["bind"](Object, holder, PATCH)()();'],
]) {
    test(`keeps the native mutation path beside a nested safe custom binder through ${label}`, async () => {
        await withFixture(
            generatedImports +
                'export async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder = Object.assign(() => undefined, { request: { workspaceId: "safe" } }); const assign = Object.assign; const safeBinder = (function (_thisArg: unknown, target: typeof holder, _patch: unknown) { return () => () => { target.request = { workspaceId: "safe" }; }; }) as typeof assign.bind; assign.bind = choose ? Function.prototype.bind : safeBinder; ' +
                invocation.replace("PATCH", "{ request: body as any }") +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });

    test(`allows all-safe native and nested custom binder paths through ${label}`, async () => {
        await withFixture(
            generatedImports +
                'export async function run(client: FixtureClient, choose: boolean) { const holder = Object.assign(() => undefined, { request: { workspaceId: "safe" } }); const assign = Object.assign; const safeBinder = (function (_thisArg: unknown, target: typeof holder, _patch: unknown) { return () => () => { target.request = { workspaceId: "safe" }; }; }) as typeof assign.bind; assign.bind = choose ? Function.prototype.bind : safeBinder; ' +
                invocation.replace("PATCH", '{ request: { workspaceId: "safe" } }') +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.deepEqual(result.failures, []);
            },
        );
    });
}

for (const [order, binder] of [
    [
        "unsafe-first",
        'choose ? function (_thisArg: unknown, target: Holder, input: unknown) { target.request = input as any; return () => undefined; } : function (_thisArg: unknown, target: Holder, _input: unknown) { target.request = { workspaceId: "safe" }; }',
    ],
    [
        "unsafe-last",
        'choose ? function (_thisArg: unknown, target: Holder, _input: unknown) { target.request = { workspaceId: "safe" }; } : function (_thisArg: unknown, target: Holder, input: unknown) { target.request = input as any; return () => undefined; }',
    ],
]) {
    for (const [label, invocation] of [
        ["direct", "assign.bind(Object, holder, body)();"],
        ["call", "assign.bind.call(assign, Object, holder, body)();"],
        ["apply", "assign.bind.apply(assign, [Object, holder, body])();"],
    ]) {
        test(`keeps ${order} custom-binder effects beside a non-returning ${label} branch`, async () => {
            await withFixture(
                generatedImports +
                    'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (' +
                    binder +
                    ") as typeof assign.bind; " +
                    invocation +
                    " return client.projects.create(holder.request); }\n",
                async (root) => {
                    const result = await validateConsumerCastGovernance({
                        root,
                        contract: zeroContract,
                    });
                    assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
                    assert.match(
                        result.failures.join("\n"),
                        /statically resolve.*custom binder return/i,
                    );
                },
            );
        });
    }
}

test("does not invoke an unsafe returned callable beside a non-returning binder branch", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; assign.bind = (choose ? function (_thisArg: unknown, target: Holder, input: unknown) { return () => { target.request = input as any; }; } : function (_thisArg: unknown, target: Holder, _input: unknown) { target.request = { workspaceId: "safe" }; }) as typeof assign.bind; const bound = assign.bind(Object, holder, body); void bound; return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

function helperChainFixture(length, terminalReturn, requestExpression = "helper0(body)") {
    const helpers = Array.from({ length }, (_unused, index) =>
        index === length - 1
            ? `function helper${index}(value: unknown) { return ${terminalReturn}; }`
            : `function helper${index}(value: unknown) { return helper${index + 1}(value); }`,
    ).join("\n");
    return `${generatedImports}${helpers}\nexport async function run(client: FixtureClient, body: unknown) { return client.projects.create(${requestExpression}); }\n`;
}

test("traces a below-limit unsafe helper chain", async () => {
    await withFixture(helperChainFixture(5, "value as any"), async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("allows a below-limit safe helper chain", async () => {
    await withFixture(helperChainFixture(5, '{ workspaceId: "safe" }'), async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, terminal] of [
    ["unsafe", "value as any"],
    ["safe but unresolved", '{ workspaceId: "safe" }'],
]) {
    test(`fails closed when a reachable ${label} helper chain exceeds trace depth`, async () => {
        await withFixture(helperChainFixture(40, terminal), async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(
                result.failures.join("\n"),
                /consumer cast analysis exceeded governed request trace depth 24/i,
            );
        });
    });
}

test("does not fail on an unreachable deep helper chain", async () => {
    await withFixture(
        helperChainFixture(40, "value as any", '{ workspaceId: "safe" }'),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not fail on a deep non-contributing helper argument to a safe request factory", async () => {
    const metadataHelpers = Array.from({ length: 40 }, (_unused, index) =>
        index === 39
            ? `function metadata${index}(value: unknown) { return value; }`
            : `function metadata${index}(value: unknown) { return metadata${index + 1}(value); }`,
    ).join("\n");
    await withFixture(
        `${generatedImports}${metadataHelpers}\nfunction safeRequest(_metadata: unknown) { return { workspaceId: "safe" }; }\nexport async function run(client: FixtureClient) { return client.projects.create(safeRequest(metadata0("Validated optional request fields"))); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("ignores a shallow any-cast metadata helper when the safe request factory discards it", async () => {
    await withFixture(
        generatedImports +
            'function metadata(value: unknown) { return value as any; }\nfunction safeRequest(_metadata: unknown) { return { workspaceId: "safe" }; }\nexport async function run(client: FixtureClient, body: unknown) { return client.projects.create(safeRequest(metadata(body))); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("ignores a deep any-cast metadata helper chain discarded by a safe request factory", async () => {
    const metadataHelpers = Array.from({ length: 40 }, (_unused, index) =>
        index === 39
            ? `function metadata${index}(value: unknown) { return value as any; }`
            : `function metadata${index}(value: unknown) { return metadata${index + 1}(value); }`,
    ).join("\n");
    await withFixture(
        `${generatedImports}${metadataHelpers}\nfunction safeRequest(_metadata: unknown) { return { workspaceId: "safe" }; }\nexport async function run(client: FixtureClient, body: unknown) { return client.projects.create(safeRequest(metadata0(body))); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("catches a shallow any-cast metadata value re-entering the returned request", async () => {
    await withFixture(
        generatedImports +
            "function metadata(value: unknown) { return value as any; }\nfunction requestFromMetadata(value: unknown) { return value; }\nexport async function run(client: FixtureClient, body: unknown) { return client.projects.create(requestFromMetadata(metadata(body))); }\n",
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, firstArgument, secondArgument, expected] of [
    ["ignored first", "metadata(body)", '{ workspaceId: "safe" }', null],
    ["contributing second", '"metadata"', "metadata(body)", /as any.*CreateProjectsRequest/i],
]) {
    test(`tracks only the returned parameter in mixed helper arguments: ${label}`, async () => {
        await withFixture(
            generatedImports +
                `function metadata(value: unknown) { return value as any; }\nfunction selectRequest(_ignored: unknown, request: unknown) { return request; }\nexport async function run(client: FixtureClient, body: unknown) { return client.projects.create(selectRequest(${firstArgument}, ${secondArgument})); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                if (expected) assert.match(result.failures.join("\n"), expected);
                else assert.deepEqual(result.failures, []);
            },
        );
    });
}

test("still governs a public generated-request assertion outside a request call", async () => {
    await withFixture(
        generatedImports +
            "export const publicRequest = {} as ClockifyApi.CreateProjectsRequest;\n",
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /generated request assertion/i);
        },
    );
});

test("keeps a legitimate non-request assertion clean in ignored metadata", async () => {
    await withFixture(
        generatedImports +
            'function safeRequest(_metadata: unknown) { return { workspaceId: "safe" }; }\nexport async function run(client: FixtureClient, body: unknown) { return client.projects.create(safeRequest(body as Record<string, unknown>)); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

function nestedIdentityFixture(length, terminal) {
    const helpers = Array.from(
        { length },
        (_unused, index) => `function identity${index}<T>(value: T) { return value; }`,
    ).join("\n");
    let expression = terminal;
    for (let index = length - 1; index >= 0; index -= 1) {
        expression = `identity${index}(${expression})`;
    }
    return `${generatedImports}${helpers}\nexport async function run(client: FixtureClient, body: unknown) { return client.projects.create(${expression}); }\n`;
}

test("catches a below-limit returned-parameter any cast", async () => {
    await withFixture(nestedIdentityFixture(5, "body as any"), async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, terminal] of [
    ["unsafe", "body as ClockifyApi.CreateProjectsRequest"],
    ["safe but unresolved", '{ workspaceId: "safe" }'],
]) {
    test(`fails closed once for an over-limit ${label} returned-parameter chain`, async () => {
        await withFixture(nestedIdentityFixture(40, terminal), async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            const depthFailures = result.failures.filter((failure) =>
                /consumer cast analysis exceeded governed request trace depth 24/i.test(failure),
            );
            assert.equal(depthFailures.length, 1);
        });
    });
}

function returnedMutationFixture(
    helperSource,
    invocation = "augment(request, body)",
    runArgs = "",
) {
    return (
        generatedImports +
        `${helperSource}\nexport async function run(client: FixtureClient, body: unknown${runArgs}) { const request: ClockifyApi.CreateProjectsRequest = { workspaceId: "safe" }; return client.projects.create(${invocation}); }\n`
    );
}

for (const [label, helperSource, invocation, runArgs] of [
    [
        "direct property assignment",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return request; }",
    ],
    [
        "known element assignment",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request["body"] = body as any; return request; }',
    ],
    [
        "unresolved computed assignment",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, key: string) { request[key] = body as any; return request; }",
        "augment(request, body, key)",
        ", key: string",
    ],
    [
        "returned local alias assignment",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const alias = request; alias.body = body as any; return request; }",
    ],
    [
        "direct Object.assign",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { Object.assign(request, { body: body as any }); return request; }",
    ],
    [
        "Object.assign.call",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { Object.assign.call(Object, request, { body: body as any }); return request; }",
    ],
    [
        "Object.assign.apply",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { Object.assign.apply(Object, [request, { body: body as any }]); return request; }",
    ],
    [
        "Reflect.set",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { Reflect.set(request, "body", body as any); return request; }',
    ],
    [
        "Object.defineProperty",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { Object.defineProperty(request, "body", { value: body as any }); return request; }',
    ],
    [
        "nested called helper",
        "function mutate(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; }\nfunction augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { mutate(request, body); return request; }",
    ],
    [
        "conditional returned-request assignment",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { if (choose) request.body = body as any; return request; }",
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
    [
        "returned alias alternative",
        "function augment(request: ClockifyApi.CreateProjectsRequest, other: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; return choose ? request : other; }",
        'augment(request, { workspaceId: "other" }, body, choose)',
        ", choose: boolean",
    ],
]) {
    test(`traces ${label} into a returned request alias`, async () => {
        await withFixture(
            returnedMutationFixture(helperSource, invocation, runArgs),
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("allows a definite safe-later overwrite on a returned request alias", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; request.body = "safe"; return request; }',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not trace a mutation on an unrelated receiver into the returned request", async () => {
    await withFixture(
        returnedMutationFixture(
            "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const unrelated: { body?: unknown } = {}; unrelated.body = body as any; return request; }",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("keeps discarded mutation metadata clean beside a returned request", async () => {
    await withFixture(
        returnedMutationFixture(
            "function metadata(value: unknown) { return value as any; }\nfunction augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { metadata(body); return request; }",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, helperSource] of [
    [
        "object-literal property projection",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const box = { request }; box.request.body = body as any; return request; }",
    ],
    [
        "returned object-literal property projection",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const box = { request }; box.request.body = body as any; return box.request; }",
    ],
    [
        "known computed object-literal property projection",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const key = "request" as const; const box = { request }; box[key].body = body as any; return request; }',
    ],
    [
        "destructured property alias",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const { request: alias } = { request }; alias.body = body as any; return request; }",
    ],
    [
        "nested destructured projection alias",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const box = { nested: { request } }; const { nested: { request: alias } } = box; alias.body = body as any; return request; }",
    ],
]) {
    test(`traces ${label} into a returned request alias`, async () => {
        await withFixture(returnedMutationFixture(helperSource), async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

for (const [label, helperSource] of [
    [
        "an unrelated object-literal property",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const other: ClockifyApi.CreateProjectsRequest = { workspaceId: "other" }; const box = { request, other }; box.other.body = body as any; return request; }',
    ],
    [
        "an unrelated destructured property alias",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const other: ClockifyApi.CreateProjectsRequest = { workspaceId: "other" }; const { other: alias } = { request, other }; alias.body = body as any; return request; }',
    ],
]) {
    test(`does not trace ${label} into a returned request alias`, async () => {
        await withFixture(returnedMutationFixture(helperSource), async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, helperSource] of [
    [
        "an unsafe write before an object-rest snapshot",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { workspaceId, ...rest } = request; return { workspaceId, ...rest }; }",
    ],
    [
        "an unsafe write before a nested object-rest snapshot",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const box = { request }; request.body = body as any; const { request: { workspaceId, ...rest } } = box; return { workspaceId, ...rest }; }",
    ],
]) {
    test(`traces ${label} into the returned snapshot`, async () => {
        await withFixture(returnedMutationFixture(helperSource), async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

for (const [label, helperSource] of [
    [
        "a later unsafe source write after an object-rest snapshot",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const { workspaceId, ...rest } = request; request.body = body as any; return { workspaceId, ...rest }; }",
    ],
    [
        "a later unsafe source write after a direct rest snapshot",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const { workspaceId: _workspaceId, ...rest } = request; request.body = body as any; return rest; }",
    ],
    [
        "an excluded unsafe field from an object-rest snapshot",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { body: _body, ...rest } = request; return rest; }",
    ],
    [
        "a later unsafe source write after a nested rest snapshot",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const box = { request }; const { request: { workspaceId, ...rest } } = box; request.body = body as any; return { workspaceId, ...rest }; }",
    ],
]) {
    test(`does not trace ${label} into the returned copy`, async () => {
        await withFixture(returnedMutationFixture(helperSource), async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, helperSource, shouldFail, invocation, runArgs] of [
    [
        "nested unsafe then direct safe",
        'function mutate(request: { body?: unknown }, body: unknown) { request.body = body as any; }\nfunction augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { mutate(request, body); request.body = "safe"; return request; }',
        false,
    ],
    [
        "direct unsafe then nested safe",
        'function makeSafe(request: { body?: unknown }) { request.body = "safe"; }\nfunction augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; makeSafe(request); return request; }',
        false,
    ],
    [
        "two-level nested unsafe then direct safe",
        'function mutate(request: { body?: unknown }, body: unknown) { request.body = body as any; }\nfunction forward(request: { body?: unknown }, body: unknown) { mutate(request, body); }\nfunction augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { forward(request, body); request.body = "safe"; return request; }',
        false,
    ],
    [
        "direct unsafe then two-level nested safe",
        'function makeSafe(request: { body?: unknown }) { request.body = "safe"; }\nfunction forward(request: { body?: unknown }) { makeSafe(request); }\nfunction augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; forward(request); return request; }',
        false,
    ],
    [
        "direct unsafe then conditional nested safe",
        'function maybeSafe(request: { body?: unknown }, choose: boolean) { if (choose) request.body = "safe"; }\nfunction augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; maybeSafe(request, choose); return request; }',
        true,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
    [
        "direct safe then nested unsafe",
        'function mutate(request: { body?: unknown }, body: unknown) { request.body = body as any; }\nfunction augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = "safe"; mutate(request, body); return request; }',
        true,
    ],
    [
        "nested unsafe on another receiver",
        'function mutate(request: { body?: unknown }, body: unknown) { request.body = body as any; }\nfunction augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const other: { body?: unknown } = {}; mutate(other, body); request.body = "safe"; return request; }',
        false,
    ],
]) {
    test(`${label} preserves returned-alias effect ordering`, async () => {
        await withFixture(
            returnedMutationFixture(helperSource, invocation, runArgs),
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                if (shouldFail) {
                    assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
                } else {
                    assert.deepEqual(result.failures, []);
                }
            },
        );
    });
}

for (const [label, helperSource, shouldFail, invocation, runArgs] of [
    [
        "rest safe-later write",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { workspaceId: _workspaceId, ...rest } = request; rest.body = "safe"; return rest; }',
        false,
    ],
    [
        "conditional rest safe-later write",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; const { workspaceId: _workspaceId, ...rest } = request; if (choose) rest.body = "safe"; return rest; }',
        true,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
    [
        "rest unsafe-last write",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const { workspaceId: _workspaceId, ...rest } = request; rest.body = "safe"; rest.body = body as any; return rest; }',
        true,
    ],
    [
        "safe-last returned rest spread",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { workspaceId: _workspaceId, ...rest } = request; return { ...rest, body: "safe" }; }',
        false,
    ],
    [
        "unsafe-last returned rest spread",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { workspaceId: _workspaceId, ...rest } = request; return { body: "safe", ...rest }; }',
        true,
    ],
    [
        "duplicate safe-last returned property",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const { workspaceId: _workspaceId, ...rest } = request; return { ...rest, body: body as any, body: "safe" }; }',
        false,
    ],
    [
        "conditional safe-later returned spread",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; const { workspaceId: _workspaceId, ...rest } = request; return { ...rest, ...(choose ? { body: "safe" } : {}) }; }',
        true,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
    [
        "all-path safe-later returned spread",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; const { workspaceId: _workspaceId, ...rest } = request; return { ...rest, ...(choose ? { body: "safe" } : { body: "also-safe" }) }; }',
        false,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
    [
        "nested rest safe-later write",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const box = { request }; request.body = body as any; const { request: { workspaceId: _workspaceId, ...rest } } = box; rest.body = "safe"; return rest; }',
        false,
    ],
    [
        "nested rest safe-last reconstruction",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const box = { request }; request.body = body as any; const { request: { workspaceId: _workspaceId, ...rest } } = box; return { ...rest, body: "safe" }; }',
        false,
    ],
    [
        "nested rest unsafe-last reconstruction",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const box = { request }; request.body = body as any; const { request: { workspaceId: _workspaceId, ...rest } } = box; return { body: "safe", ...rest }; }',
        true,
    ],
]) {
    test(`${label} preserves returned rest copy ordering`, async () => {
        await withFixture(
            returnedMutationFixture(helperSource, invocation, runArgs),
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                if (shouldFail) {
                    assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
                } else {
                    assert.deepEqual(result.failures, []);
                }
            },
        );
    });
}

for (const [label, reassignment, mutation, returned, shouldFail, invocation, runArgs] of [
    [
        "direct reassignment ignores the captured old alias",
        "box.request = other;",
        "alias.body = body as any;",
        "box.request",
        false,
    ],
    [
        "computed reassignment ignores the captured old alias",
        'box["request"] = other;',
        "alias.body = body as any;",
        'box["request"]',
        false,
    ],
    [
        "destructured reassignment ignores the captured old alias",
        "({ request: box.request } = { request: other });",
        "alias.body = body as any;",
        "box.request",
        false,
    ],
    [
        "direct reassignment keeps current-property unsafe writes",
        "box.request = other;",
        "box.request.body = body as any;",
        "box.request",
        true,
    ],
    [
        "computed reassignment keeps current-property unsafe writes",
        'box["request"] = other;',
        'box["request"].body = body as any;',
        'box["request"]',
        true,
    ],
    [
        "destructured reassignment keeps current-property unsafe writes",
        "({ request: box.request } = { request: other });",
        "box.request.body = body as any;",
        "box.request",
        true,
    ],
    [
        "direct reassignment preserves unsafe writes on the returned old alias",
        "box.request = other;",
        "alias.body = body as any;",
        "alias",
        true,
    ],
    [
        "current-property unsafe write does not taint the returned old alias",
        "box.request = other;",
        "box.request.body = body as any;",
        "alias",
        false,
    ],
    [
        "conditional reassignment keeps the old-alias path conservative",
        "if (choose) box.request = other;",
        "alias.body = body as any;",
        "box.request",
        true,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
]) {
    test(`${label} for a returned projected property`, async () => {
        const helperSource = `function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown${runArgs ?? ""}) { const other: ClockifyApi.CreateProjectsRequest = { workspaceId: "other" }; const box = { request }; const alias = box.request; ${reassignment} ${mutation} return ${returned}; }`;
        await withFixture(
            returnedMutationFixture(helperSource, invocation, runArgs),
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                if (shouldFail) {
                    assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
                } else {
                    assert.deepEqual(result.failures, []);
                }
            },
        );
    });
}

test("lets a definite safe write through an alias of a returned rest copy dominate", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { workspaceId: _workspaceId, ...rest } = request; const alias = rest; alias.body = "safe"; return rest; }',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("orders reconstruction through an alias of a returned rest copy", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { workspaceId: _workspaceId, ...rest } = request; const alias = rest; return { ...alias, body: "safe" }; }',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, helperSource, shouldFail, invocation, runArgs] of [
    [
        "multi-alias safe write",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const first = rest; const second = first; second.body = "safe"; return rest; }',
        false,
    ],
    [
        "destructured-alias safe write",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const { copy: alias } = { copy: rest }; alias.body = "safe"; return rest; }',
        false,
    ],
    [
        "conditional-alias safe write",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; const { ...rest } = request; const other: ClockifyApi.CreateProjectsRequest = { workspaceId: "other" }; const alias = choose ? rest : other; alias.body = "safe"; return rest; }',
        true,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
    [
        "unrelated-alias safe write",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const other: ClockifyApi.CreateProjectsRequest = { workspaceId: "other" }; const alias = other; alias.body = "safe"; return rest; }',
        true,
    ],
    [
        "unsafe-last alias write",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const { ...rest } = request; const alias = rest; alias.body = "safe"; alias.body = body as any; return rest; }',
        true,
    ],
]) {
    test(`${label} preserves returned rest-copy identity`, async () => {
        await withFixture(
            returnedMutationFixture(helperSource, invocation, runArgs),
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                if (shouldFail) {
                    assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
                } else {
                    assert.deepEqual(result.failures, []);
                }
            },
        );
    });
}

test("lets a statically recovered safe patch dominate a returned rest spread", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { workspaceId: _workspaceId, ...rest } = request; const safePatch = { body: "safe" }; return { ...rest, ...safePatch }; }',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, setup, returned, shouldFail, invocation, runArgs] of [
    [
        "aliased safe patch",
        'const safePatch = { body: "safe" }; const alias = safePatch;',
        "{ ...rest, ...alias }",
        false,
    ],
    [
        "factory-returned safe patch",
        'function safePatch() { return { body: "safe" }; }',
        "{ ...rest, ...safePatch() }",
        false,
    ],
    [
        "all-path conditional safe patch",
        'const safePatch = choose ? { body: "safe" } : { body: "also-safe" };',
        "{ ...rest, ...safePatch }",
        false,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
    [
        "mixed conditional patch",
        'const safePatch = choose ? { body: "safe" } : {};',
        "{ ...rest, ...safePatch }",
        true,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
    ["unknown final patch", "const safePatch = body as any;", "{ ...rest, ...safePatch }", true],
    [
        "unsafe-last recovered patch",
        "const unsafePatch = { body: body as any };",
        '{ ...rest, body: "safe", ...unsafePatch }',
        true,
    ],
    [
        "unsafe-last rest after safe patch",
        'const safePatch = { body: "safe" };',
        "{ ...safePatch, ...rest }",
        true,
    ],
]) {
    test(`${label} preserves bounded returned-rest patch ordering`, async () => {
        const helperSource = `function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown${runArgs ?? ""}) { request.body = body as any; const { ...rest } = request; ${setup} return ${returned}; }`;
        await withFixture(
            returnedMutationFixture(helperSource, invocation, runArgs),
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                if (shouldFail) {
                    assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
                } else {
                    assert.deepEqual(result.failures, []);
                }
            },
        );
    });
}

test("charges returned rest reconstruction paths to the common work cap", async () => {
    const flags = Array.from({ length: 12 }, (_, index) => `flag${index}`);
    const runArgs = flags.map((flag) => `, ${flag}: boolean`).join("");
    const spreads = flags
        .map(
            (flag, index) =>
                `...(${flag} ? { marker${index}: ${index} } : { alternate${index}: ${index} })`,
        )
        .join(", ");
    const helperSource = `function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown${runArgs}) { const { ...rest } = request; return { ...rest, ${spreads} }; }`;
    const invocation = `augment(request, body, ${flags.join(", ")})`;
    await withFixture(returnedMutationFixture(helperSource, invocation, runArgs), async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 10_000, maxInvocations: 256, maxWork: 50 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded.*work.*50/i);
        assert.deepEqual(result.analysisStats, { work: 50, exhausted: true });
    });
});

test("reports charged returned-rest reconstruction work below the cap", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const { ...rest } = request; return { ...rest, body: "safe" }; }',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({
                root,
                contract: zeroContract,
                analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 1_000 },
            });
            assert.deepEqual(result.failures, []);
            assert.equal(result.analysisStats.exhausted, false);
            assert.ok(result.analysisStats.work >= 4);
            assert.ok(result.analysisStats.work < 1_000);
        },
    );
});

test("fails closed when returned-rest reconstruction alternatives exceed the cap", async () => {
    await withFixture(
        returnedMutationFixture(
            "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, a: boolean, b: boolean, c: boolean) { const { ...rest } = request; return { ...rest, ...(a ? { a: 1 } : { aa: 1 }), ...(b ? { b: 1 } : { bb: 1 }), ...(c ? { c: 1 } : { cc: 1 }) }; }",
            "augment(request, body, a, b, c)",
            ", a: boolean, b: boolean, c: boolean",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({
                root,
                contract: zeroContract,
                analysisLimits: { maxAlternatives: 4, maxInvocations: 256, maxWork: 1_000 },
            });
            assert.match(result.failures.join("\n"), /analysis limit exceeded.*paths.*4/i);
            assert.equal(result.analysisStats.exhausted, false);
            assert.ok(result.analysisStats.work < 1_000);
        },
    );
});

test("keeps an unsafe conditional rest branch in last-spread reconstruction", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; const { ...rest } = request; const other = { body: "other" }; return { body: "safe", ...(choose ? rest : other) }; }',
            "augment(request, body, choose)",
            ", choose: boolean",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("keeps an unsafe aliased conditional rest branch in last-spread reconstruction", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; const { ...rest } = request; const other = { body: "other" }; const alias = choose ? rest : other; return { body: "safe", ...alias }; }',
            "augment(request, body, choose)",
            ", choose: boolean",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("orders a destructured alias of a returned rest copy", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const { copy: alias } = { copy: rest }; return { ...alias, body: "safe" }; }',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("keeps projected property rest provenance in unsafe-last reconstruction", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const box = { rest }; return { body: "safe", ...box.rest }; }',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("keeps projected element rest provenance in unsafe-last reconstruction", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const box = [rest]; return { body: "safe", ...box[0] }; }',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("keeps helper-returned rest provenance in unsafe-last reconstruction", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; function getRest() { return rest; } return { body: "safe", ...getRest() }; }',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("lets a projected safe patch dominate a returned rest spread", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const box = { patch: { body: "safe" } }; return { ...rest, ...box.patch }; }',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("lets a safe patch dominate an aliased reconstructed rest object", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const reconstructed = { ...rest }; const safePatch = { body: "safe" }; return { ...reconstructed, ...safePatch }; }',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, helperSource, shouldFail, invocation, runArgs] of [
    [
        "reversed conditional rest branch",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; const { ...rest } = request; const other = { body: "other" }; return { body: "safe", ...(choose ? other : rest) }; }',
        true,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
    [
        "conditional rest before a safe final property",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; const { ...rest } = request; const other = { body: "other" }; return { ...(choose ? rest : other), body: "safe" }; }',
        false,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
    [
        "all-safe conditional spread control",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; const left = { body: "left" }; const right = { body: "right" }; return { ...(choose ? left : right) }; }',
        false,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
]) {
    test(`${label} preserves conditional rest reconstruction paths`, async () => {
        await withFixture(
            returnedMutationFixture(helperSource, invocation, runArgs),
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                if (shouldFail) {
                    assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
                } else {
                    assert.deepEqual(result.failures, []);
                }
            },
        );
    });
}

for (const [label, aliasSetup, returned, shouldFail, invocation, runArgs] of [
    [
        "destructured alias unsafe-last",
        "const { copy: alias } = { copy: rest };",
        '{ body: "safe", ...alias }',
        true,
    ],
    [
        "nested destructured alias safe-last",
        "const { holder: { copy: alias } } = { holder: { copy: rest } };",
        '{ ...alias, body: "safe" }',
        false,
    ],
    [
        "array destructured alias safe-last",
        "const [alias] = [rest];",
        '{ ...alias, body: "safe" }',
        false,
    ],
    [
        "multi-hop destructured alias safe-last",
        "const { copy: first } = { copy: rest }; const [second] = [first];",
        '{ ...second, body: "safe" }',
        false,
    ],
    [
        "mixed conditional destructured alias unsafe-last",
        'const other = { body: "other" }; const { copy: alias } = { copy: choose ? rest : other };',
        '{ body: "safe", ...alias }',
        true,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
]) {
    test(`${label} keeps bounded rest-copy identity`, async () => {
        const helperSource = `function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown${runArgs ?? ""}) { request.body = body as any; const { ...rest } = request; ${aliasSetup} return ${returned}; }`;
        await withFixture(
            returnedMutationFixture(helperSource, invocation, runArgs),
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                if (shouldFail) {
                    assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
                } else {
                    assert.deepEqual(result.failures, []);
                }
            },
        );
    });
}

for (const [label, setup, returned, shouldFail, invocation, runArgs] of [
    [
        "projected property rest safe-last",
        "const box = { rest };",
        '{ ...box.rest, body: "safe" }',
        false,
    ],
    [
        "projected element rest safe-last",
        "const box = [rest];",
        '{ ...box[0], body: "safe" }',
        false,
    ],
    [
        "helper-returned rest safe-last",
        "function getRest() { return rest; }",
        '{ ...getRest(), body: "safe" }',
        false,
    ],
    [
        "all-path helper conditional rest unsafe-last",
        "function getRest() { return choose ? rest : rest; }",
        '{ body: "safe", ...getRest() }',
        true,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
    [
        "mixed helper conditional rest unsafe-last",
        'const other = { body: "other" }; function getRest() { return choose ? rest : other; }',
        '{ body: "safe", ...getRest() }',
        true,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
]) {
    test(`${label} preserves projected or returned rest provenance`, async () => {
        const helperSource = `function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown${runArgs ?? ""}) { request.body = body as any; const { ...rest } = request; ${setup} return ${returned}; }`;
        await withFixture(
            returnedMutationFixture(helperSource, invocation, runArgs),
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                if (shouldFail) {
                    assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
                } else {
                    assert.deepEqual(result.failures, []);
                }
            },
        );
    });
}

for (const [label, setup, returned, shouldFail, invocation, runArgs] of [
    [
        "projected element safe patch",
        'const box = [{ body: "safe" }];',
        "{ ...rest, ...box[0] }",
        false,
    ],
    [
        "projected unsafe patch after rest",
        "const box = { patch: { body: body as any } };",
        "{ ...rest, ...box.patch }",
        true,
    ],
    [
        "projected safe patch before rest",
        'const box = { patch: { body: "safe" } };',
        "{ ...box.patch, ...rest }",
        true,
    ],
    [
        "aliased projected safe patch",
        'const box = { patch: { body: "safe" } }; const alias = box.patch;',
        "{ ...rest, ...alias }",
        false,
    ],
    [
        "factory-projected safe patch",
        'function makeBox() { return { patch: { body: "safe" } }; }',
        "{ ...rest, ...makeBox().patch }",
        false,
    ],
    [
        "mixed projected conditional patch",
        'const box = { patch: choose ? { body: "safe" } : {} };',
        "{ ...rest, ...box.patch }",
        true,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
]) {
    test(`${label} preserves projected patch order`, async () => {
        const helperSource = `function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown${runArgs ?? ""}) { request.body = body as any; const { ...rest } = request; ${setup} return ${returned}; }`;
        await withFixture(
            returnedMutationFixture(helperSource, invocation, runArgs),
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                if (shouldFail) {
                    assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
                } else {
                    assert.deepEqual(result.failures, []);
                }
            },
        );
    });
}

for (const [label, setup, returned, shouldFail] of [
    [
        "reconstructed rest unsafe-last",
        'const reconstructed = { ...rest }; const safePatch = { body: "safe" };',
        "{ ...safePatch, ...reconstructed }",
        true,
    ],
    [
        "multi-hop reconstructed rest safe-last",
        'const reconstructed = { ...rest }; const alias = reconstructed; const safePatch = { body: "safe" };',
        "{ ...alias, ...safePatch }",
        false,
    ],
    [
        "ordinary non-rest spread control",
        'const ordinary = { marker: "safe" };',
        '{ ...ordinary, body: "safe" }',
        false,
    ],
]) {
    test(`${label} scopes reconstructed-rest handling`, async () => {
        const helperSource = `function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; ${setup} return ${returned}; }`;
        await withFixture(returnedMutationFixture(helperSource), async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail) {
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

test("keeps earlier rest provenance through a self-assignment cycle", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; let alias = rest; alias = alias; return { body: "safe", ...alias }; }',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("fails closed at the governed helper-return reconstruction depth", async () => {
    const helpers = Array.from({ length: 30 }, (_, index) =>
        index === 0
            ? "function getRest0() { return rest; }"
            : `function getRest${index}() { return getRest${index - 1}(); }`,
    ).join(" ");
    await withFixture(
        returnedMutationFixture(
            `function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; ${helpers} return { body: "safe", ...getRest29() }; }`,
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(
                result.failures.join("\n"),
                /analysis exceeded governed reconstruction depth 24/i,
            );
        },
    );
});

test("charges projected rest reconstruction traversal to the common work cap", async () => {
    const boxes = Array.from(
        { length: 12 },
        (_, index) =>
            `const box${index} = { rest: ${index === 0 ? "rest" : `box${index - 1}.rest`} };`,
    ).join(" ");
    await withFixture(
        returnedMutationFixture(
            `function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; ${boxes} return { body: "safe", ...box11.rest }; }`,
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({
                root,
                contract: zeroContract,
                analysisLimits: { maxAlternatives: 256, maxInvocations: 256, maxWork: 25 },
            });
            assert.match(result.failures.join("\n"), /analysis limit exceeded.*work.*25/i);
            assert.deepEqual(result.analysisStats, { work: 25, exhausted: true });
        },
    );
});

test("caps projected rest reconstruction alternatives before materialization", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; const { ...rest } = request; const boxes = choose ? { rest } : { rest }; return { body: "safe", ...boxes.rest }; }',
            "augment(request, body, choose)",
            ", choose: boolean",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({
                root,
                contract: zeroContract,
                analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 1_000 },
            });
            assert.match(result.failures.join("\n"), /analysis limit exceeded.*max 1/i);
            assert.equal(result.analysisStats.exhausted, false);
            assert.ok(result.analysisStats.work < 1_000);
        },
    );
});

test("keeps helper-local request writes for an inline literal argument", async () => {
    await withFixture(
        generatedImports +
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return request; }\nexport async function run(client: FixtureClient, body: unknown) { return client.projects.create(augment({ workspaceId: "w" }, body)); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("fails closed before a 500-layer reconstructed-rest chain reaches the JS stack", async () => {
    const chain = Array.from(
        { length: 500 },
        (_, index) => `const layer${index} = { ...${index === 0 ? "rest" : `layer${index - 1}`} };`,
    ).join(" ");
    await withFixture(
        returnedMutationFixture(
            `function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; ${chain} return { body: "safe", ...layer499 }; }`,
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(
                result.failures.join("\n"),
                /analysis (?:limit exceeded|exceeded governed reconstruction depth)/i,
            );
            assert.equal(result.analysisStats.exhausted, false);
        },
    );
});

test("recovers a static getter-projected safe patch after a returned rest spread", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const box = { get patch() { return { body: "safe" }; } }; return { ...rest, ...box.patch }; }',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not promote a nested stored rest copy into top-level request fields", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const ordinary = { nested: rest, workspaceId: "safe", body: "safe" }; return { ...ordinary }; }',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, helperSource, invocation, shouldFail, runArgs] of [
    [
        "conditional inline rest helper",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; const { ...rest } = request; if (choose) rest.body = "safe"; return rest; }',
        'augment({ workspaceId: "w" }, body, choose)',
        true,
        ", choose: boolean",
    ],
    [
        "nested inline helper",
        "function inner(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return request; } function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { return inner(request, body); }",
        'augment({ workspaceId: "w" }, body)',
        true,
    ],
    [
        "inline alias return",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const alias = request; alias.body = body as any; return alias; }",
        'augment({ workspaceId: "w" }, body)',
        true,
    ],
    [
        "inline safe-later overwrite",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; request.body = "safe"; return request; }',
        'augment({ workspaceId: "w" }, body)',
        false,
    ],
    [
        "inline unsafe-last overwrite",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = "safe"; request.body = body as any; return request; }',
        'augment({ workspaceId: "w" }, body)',
        true,
    ],
    [
        "inline all-path safe overwrite",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; if (choose) request.body = "left"; else request.body = "right"; return request; }',
        'augment({ workspaceId: "w" }, body, choose)',
        false,
        ", choose: boolean",
    ],
    [
        "inline partial-path safe overwrite",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; if (choose) request.body = "safe"; return request; }',
        'augment({ workspaceId: "w" }, body, choose)',
        true,
        ", choose: boolean",
    ],
    [
        "named typed request control",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return request; }",
        "augment(request, body)",
        true,
    ],
    [
        "inferred alias request control",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const inferred = request; inferred.body = body as any; return inferred; }",
        "augment(request, body)",
        true,
    ],
]) {
    test(`${label} preserves helper-local parameter state`, async () => {
        const source =
            generatedImports +
            `${helperSource}\nexport async function run(client: FixtureClient, body: unknown${runArgs ?? ""}) { const request: ClockifyApi.CreateProjectsRequest = { workspaceId: "named" }; return client.projects.create(${invocation}); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail) {
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

function reconstructedRestChainFixture(length) {
    const chain = Array.from(
        { length },
        (_, index) => `const layer${index} = { ...${index === 0 ? "rest" : `layer${index - 1}`} };`,
    ).join(" ");
    return returnedMutationFixture(
        `function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; ${chain} return { ...layer${length - 1}, body: "safe" }; }`,
    );
}

for (const [label, length, shouldFail] of [
    ["below-bound reconstructed rest", 11, false],
    ["exact-bound reconstructed rest", 12, false],
    ["above-bound reconstructed rest", 13, true],
]) {
    test(`${label} has deterministic provenance depth`, async () => {
        await withFixture(reconstructedRestChainFixture(length), async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail) {
                assert.match(
                    result.failures.join("\n"),
                    /analysis exceeded governed reconstruction depth 24/i,
                );
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

for (const [label, setup, returned, shouldFail, invocation, runArgs] of [
    [
        "getter-returned rest safe-last",
        "const box = { get copy() { return rest; } };",
        '{ ...box.copy, body: "safe" }',
        false,
    ],
    [
        "getter-returned rest unsafe-last",
        "const box = { get copy() { return rest; } };",
        '{ body: "safe", ...box.copy }',
        true,
    ],
    [
        "computed getter safe patch",
        'const box = { get ["patch"]() { return { body: "safe" }; } };',
        '{ ...rest, ...box["patch"] }',
        false,
    ],
    [
        "aliased getter safe patch",
        'const box = { get patch() { return { body: "safe" }; } }; const patch = box.patch;',
        "{ ...rest, ...patch }",
        false,
    ],
    [
        "conditional getter safe patch",
        'const box = { get patch() { return choose ? { body: "left" } : { body: "right" }; } };',
        "{ ...rest, ...box.patch }",
        false,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
    [
        "throwing getter",
        'const box = { get patch() { throw new Error("no"); } };',
        "{ ...rest, ...box.patch }",
        true,
    ],
    [
        "side-effectful getter",
        'function sideEffect() {} const box = { get patch() { sideEffect(); return { body: "safe" }; } };',
        "{ ...rest, ...box.patch }",
        true,
    ],
    [
        "unknown-call getter",
        'function makePatch() { return { body: "safe" }; } const box = { get patch() { return makePatch(); } };',
        "{ ...rest, ...box.patch }",
        true,
    ],
]) {
    test(`${label} keeps static getter projection conservative`, async () => {
        const helperSource = `function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown${runArgs ?? ""}) { request.body = body as any; const { ...rest } = request; ${setup} return ${returned}; }`;
        await withFixture(
            returnedMutationFixture(helperSource, invocation, runArgs),
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                if (shouldFail) {
                    assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
                } else {
                    assert.deepEqual(result.failures, []);
                }
            },
        );
    });
}

for (const [label, setup, returned, shouldFail] of [
    [
        "nested array storage",
        'const ordinary = { nested: [{ copy: rest }], workspaceId: "safe", body: "safe" };',
        "{ ...ordinary }",
        false,
    ],
    [
        "nested property later flattened",
        'const ordinary = { nested: rest, workspaceId: "safe", body: "safe" };',
        "{ ...ordinary.nested }",
        true,
    ],
    [
        "nested array later flattened",
        'const ordinary = { nested: [rest], workspaceId: "safe", body: "safe" };',
        "{ ...ordinary.nested[0] }",
        true,
    ],
    [
        "nested property flattened before safe final field",
        'const ordinary = { nested: rest, workspaceId: "safe", body: "safe" };',
        '{ ...ordinary.nested, body: "safe" }',
        false,
    ],
    [
        "unsafe recovered request field",
        'const ordinary = { nested: rest, workspaceId: "safe", body: body as any };',
        "{ ...ordinary }",
        true,
    ],
    [
        "ordinary nested object control",
        'const ordinary = { nested: { marker: "safe" }, workspaceId: "safe", body: "safe" };',
        "{ ...ordinary }",
        false,
    ],
]) {
    test(`${label} tracks only top-level spread contribution`, async () => {
        const helperSource = `function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; ${setup} return ${returned}; }`;
        await withFixture(returnedMutationFixture(helperSource), async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail) {
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

test("keeps an inline helper mutation through a shorthand return projection", async () => {
    await withFixture(
        returnedMutationFixture(
            "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return { request }; }",
            'augment({ workspaceId: "w" }, body).request',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("keeps a helper mutation through a materialized shorthand return projection", async () => {
    await withFixture(
        returnedMutationFixture(
            "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return { request }; }",
            "result.request",
        ).replace(
            "return client.projects.create(result.request);",
            'const result = augment({ workspaceId: "w" }, body); return client.projects.create(result.request);',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, helperSource, setup, invocation, shouldFail, runArgs] of [
    [
        "materialized named argument",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return { request }; }",
        "const result = augment(request, body);",
        "result.request",
        true,
    ],
    [
        "materialized array projection",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return [request]; }",
        'const result = augment({ workspaceId: "w" }, body);',
        "result[0]",
        true,
    ],
    [
        "materialized nested projection",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return { nested: { request } }; }",
        'const result = augment({ workspaceId: "w" }, body);',
        "result.nested.request",
        true,
    ],
    [
        "materialized alias chain",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return { request }; }",
        'const result = augment({ workspaceId: "w" }, body); const first = result; const second = first;',
        "second.request",
        true,
    ],
    [
        "materialized alias cycle",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return { request }; }",
        'const result = augment({ workspaceId: "w" }, body); let first = result; let second = first; first = second;',
        "first.request",
        true,
    ],
    [
        "materialized safe-later helper",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; request.body = "safe"; return { request }; }',
        'const result = augment({ workspaceId: "w" }, body);',
        "result.request",
        false,
    ],
    [
        "materialized unsafe-last helper",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = "safe"; request.body = body as any; return { request }; }',
        'const result = augment({ workspaceId: "w" }, body);',
        "result.request",
        true,
    ],
    [
        "materialized unknown computed projection",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return { request }; }",
        "const result = augment(request, body);",
        "result[key]",
        true,
        ", key: string",
    ],
]) {
    test(`${label} preserves helper-local provenance`, async () => {
        const source =
            generatedImports +
            `${helperSource}\nexport async function run(client: FixtureClient, body: unknown${runArgs ?? ""}) { const request: ClockifyApi.CreateProjectsRequest = { workspaceId: "safe" }; ${setup} return client.projects.create(${invocation}); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("keeps fresh getter parameter defaults distinct by call site", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; function make(): Registry { return { Ctor: Safe }; } const source = { get registry(): Registry | undefined { return void 0; } }; function read({ registry = make() }: typeof source) { return registry; } const old = read(source); const current = read(source); old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("fails closed when reachable getter defaults exceed the alternative cap", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, choose: boolean) { class Safe {} const fallback = { Ctor: Safe }; const source = { get registry(): { Ctor: typeof Safe } | undefined { return choose ? { Ctor: Safe } : void 0; } }; const { registry: current = fallback } = source; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 10_000 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded/i);
    });
});

test("fails closed when materialized result projection paths exceed the cap", async () => {
    const source =
        generatedImports +
        'function augment(request: ClockifyApi.CreateProjectsRequest) { return { request, other: request }; }\nexport async function run(client: FixtureClient, key: "request" | "other") { const result = augment({ workspaceId: "safe" }); return client.projects.create(result[key]); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 10_000 },
        });
        assert.match(result.failures.join("\n"), /result projection paths; max 1/i);
    });
});

test("lets an all-path safe write dominate a materialized conditional result projection", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, body: unknown, choose: boolean) { const request: ClockifyApi.CreateProjectsRequest = { workspaceId: "safe", body: body as any }; const result = choose ? { request } : { request: { workspaceId: "safe" } }; result.request.body = "safe"; return client.projects.create(result.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, resultSetup, mutation, invocation, shouldFail] of [
    [
        "array conditional projection",
        'const result = choose ? [request] : [{ workspaceId: "safe" }];',
        'result[0].body = "safe";',
        "result[0]",
        false,
    ],
    [
        "static computed conditional projection",
        'const key: "request" = "request"; const result = choose ? { request } : { request: { workspaceId: "safe" } };',
        'result[key].body = "safe";',
        "result[key]",
        false,
    ],
    [
        "aliased conditional projection",
        'const result = choose ? { request } : { request: { workspaceId: "safe" } }; const alias = result;',
        'alias.request.body = "safe";',
        "result.request",
        false,
    ],
    [
        "nested conditional projection",
        'const result = choose ? { payload: { request } } : { payload: { request: { workspaceId: "safe" } } };',
        'result.payload.request.body = "safe";',
        "result.payload.request",
        false,
    ],
    [
        "reversed all-safe conditional writes",
        'const result = choose ? { request } : { request: { workspaceId: "safe" } };',
        'if (choose) { result.request.body = "safe-a"; } else { result.request.body = "safe-b"; }',
        "result.request",
        false,
    ],
    [
        "partial conditional write",
        'const result = choose ? { request } : { request: { workspaceId: "safe" } };',
        'if (choose) result.request.body = "safe";',
        "result.request",
        true,
    ],
    [
        "mixed conditional writes",
        'const result = choose ? { request } : { request: { workspaceId: "safe" } };',
        'if (choose) { result.request.body = "safe"; } else { result.request.body = body as any; }',
        "result.request",
        true,
    ],
    [
        "unsafe-last projected write",
        'const result = choose ? { request } : { request: { workspaceId: "safe" } };',
        'result.request.body = "safe"; result.request.body = body as any;',
        "result.request",
        true,
    ],
    [
        "all-path Reflect.set projected write",
        'const result = choose ? { request } : { request: { workspaceId: "safe" } };',
        'Reflect.set(result.request, "body", "safe");',
        "result.request",
        false,
    ],
    [
        "all-path Object.assign projected write",
        'const result = choose ? { request } : { request: { workspaceId: "safe" } };',
        'Object.assign(result.request, { body: "safe" });',
        "result.request",
        false,
    ],
    [
        "aliased Reflect.set projected write",
        'const result = choose ? { request } : { request: { workspaceId: "safe" } }; const set = Reflect.set;',
        'set(result.request, "body", "safe");',
        "result.request",
        false,
    ],
    [
        "array Reflect.set projected write",
        'const result = choose ? [request] : [{ workspaceId: "safe" }];',
        'Reflect.set(result[0], "body", "safe");',
        "result[0]",
        false,
    ],
    [
        "nested Object.assign projected write",
        'const result = choose ? { payload: { request } } : { payload: { request: { workspaceId: "safe" } } };',
        'Object.assign(result.payload.request, { body: "safe" });',
        "result.payload.request",
        false,
    ],
    [
        "unsafe-last Reflect.set projected write",
        'const result = choose ? { request } : { request: { workspaceId: "safe" } };',
        'Reflect.set(result.request, "body", "safe"); Reflect.set(result.request, "body", body as any);',
        "result.request",
        true,
    ],
    [
        "partial Reflect.set projected write",
        'const result = choose ? { request } : { request: { workspaceId: "safe" } };',
        'if (choose) Reflect.set(result.request, "body", "safe");',
        "result.request",
        true,
    ],
]) {
    test(`${label} orders writes for every projected receiver alternative`, async () => {
        const source =
            generatedImports +
            `export async function run(client: FixtureClient, body: unknown, choose: boolean) { const request: ClockifyApi.CreateProjectsRequest = { workspaceId: "safe", body: body as any }; ${resultSetup} ${mutation} return client.projects.create(${invocation}); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, helperSource, invocation, shouldFail, runArgs] of [
    [
        "inline array projection",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return [request]; }",
        'augment({ workspaceId: "w" }, body)[0]',
        true,
    ],
    [
        "nested shorthand projection",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return { nested: { request } }; }",
        'augment({ workspaceId: "w" }, body).nested.request',
        true,
    ],
    [
        "aliased shorthand projection",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const wrapped = { request }; return wrapped; }",
        'augment({ workspaceId: "w" }, body).request',
        true,
    ],
    [
        "conditional shorthand projection",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; return choose ? { request } : { request }; }",
        'augment({ workspaceId: "w" }, body, choose).request',
        true,
        ", choose: boolean",
    ],
    [
        "safe-later shorthand projection",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; request.body = "safe"; return { request }; }',
        'augment({ workspaceId: "w" }, body).request',
        false,
    ],
    [
        "unsafe-last shorthand projection",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = "safe"; request.body = body as any; return { request }; }',
        'augment({ workspaceId: "w" }, body).request',
        true,
    ],
    [
        "named typed shorthand projection",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return { request }; }",
        "augment(request, body).request",
        true,
    ],
    [
        "inferred alias shorthand projection",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return { request }; } function forward(request: ClockifyApi.CreateProjectsRequest, body: unknown) { const inferred = request; return augment(inferred, body); }",
        "forward(request, body).request",
        true,
    ],
    [
        "unknown computed shorthand projection",
        "function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; return { request }; }",
        "augment(request, body)[key]",
        true,
        ", key: string",
    ],
]) {
    test(`${label} preserves helper return projection provenance`, async () => {
        await withFixture(
            returnedMutationFixture(helperSource, invocation, runArgs),
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                if (shouldFail) {
                    assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
                } else {
                    assert.deepEqual(result.failures, []);
                }
            },
        );
    });
}

test("ignores an uninvoked arrow write when resolving Reflect.apply", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; (() => { Reflect.apply = ((_target: unknown, _receiver: unknown, _args: unknown[]) => undefined) as typeof Reflect.apply; }); Reflect.apply(Reflect.set, Reflect, [holder, "request", body as any]); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, setup, shouldFail, runArgs] of [
    ["uninvoked function expression", "(function () { Reflect.apply = safeApply; });", true],
    [
        "uninvoked function declaration",
        "function configure() { Reflect.apply = safeApply; } void configure;",
        true,
    ],
    ["uninvoked class method", "(class { configure() { Reflect.apply = safeApply; } });", true],
    [
        "uninvoked class accessor",
        "(class { get configure() { Reflect.apply = safeApply; return 1; } });",
        true,
    ],
    ["executed class static block", "(class { static { Reflect.apply = safeApply; } });", false],
    [
        "executed class static field initializer",
        "(class { static configured = (Reflect.apply = safeApply); });",
        false,
    ],
    [
        "executed class declaration static block",
        "class Configured { static { Reflect.apply = safeApply; } }",
        false,
    ],
    [
        "unexecuted class instance field initializer",
        "(class { configured = (Reflect.apply = safeApply); });",
        true,
    ],
    [
        "executed computed static name",
        '(class { static [(() => { Reflect.apply = safeApply; return "configured"; })()] = 1; });',
        false,
    ],
    [
        "executed class heritage evaluation",
        "(class extends (() => { Reflect.apply = safeApply; return class {}; })() {});",
        false,
    ],
    [
        "uninvoked conditional arrow",
        "(choose ? (() => { Reflect.apply = safeApply; }) : (() => { Reflect.apply = safeApply; }));",
        true,
        ", choose: boolean",
    ],
    ["invoked arrow IIFE", "(() => { Reflect.apply = safeApply; })();", false],
    [
        "invoked function call adapter",
        "(function () { Reflect.apply = safeApply; }).call(undefined);",
        false,
    ],
    [
        "invoked arrow bind adapter",
        "(() => { Reflect.apply = safeApply; }).bind(undefined)();",
        false,
    ],
]) {
    test(`${label} respects execution boundaries for member writes`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown${runArgs ?? ""}) { const holder: Holder = { request: { workspaceId: "safe" } }; const safeApply = ((_target: unknown, _receiver: unknown, _args: unknown[]) => undefined) as typeof Reflect.apply; ${setup} Reflect.apply(Reflect.set, Reflect, [holder, "request", body as any]); return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail) {
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

for (const [label, setup, shouldFail, runArgs] of [
    [
        "static block native patch",
        '(class { static { Reflect.apply(Reflect.set, Reflect, [holder, "request", body as any]); } });',
        true,
    ],
    [
        "static field native patch",
        '(class { static configured = Reflect.apply(Reflect.set, Reflect, [holder, "request", body as any]); });',
        true,
    ],
    [
        "class declaration static native patch",
        'class Configured { static { Reflect.apply(Reflect.set, Reflect, [holder, "request", body as any]); } }',
        true,
    ],
    [
        "instance field native patch control",
        '(class { configured = Reflect.apply(Reflect.set, Reflect, [holder, "request", body as any]); });',
        false,
    ],
    [
        "method native patch control",
        '(class { configure() { Reflect.apply(Reflect.set, Reflect, [holder, "request", body as any]); } });',
        false,
    ],
]) {
    test(`${label} follows class evaluation effects`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown${runArgs ?? ""}) { const holder: Holder = { request: { workspaceId: "safe" } }; ${setup} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("accepts an all-path conditional class static overwrite", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const safeApply = ((_target: unknown, _receiver: unknown, _args: unknown[]) => undefined) as typeof Reflect.apply; (choose ? class { static { Reflect.apply = safeApply; } } : class { static { Reflect.apply = safeApply; } }); Reflect.apply(Reflect.set, Reflect, [holder, "request", body as any]); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("traces an unsafe projected patch written by a computed class name", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = "safe"; const { ...rest } = request; const box = { patch: { body: "safe" } }; (class { [(box.patch = { body: body as any }, "configured")]() {} }); return { ...rest, ...box.patch }; }',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("traces a native mutation in a computed class method name", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; (class { [Reflect.set(holder, "request", body as any) ? "configured" : "fallback"]() {} }); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, setup, shouldFail] of [
    [
        "computed unsafe then static safe",
        '(class { [(holder.request = body as any, "configured")]() {} static configured = (holder.request = { workspaceId: "safe" }); });',
        false,
    ],
    [
        "computed safe precedes earlier textual static unsafe",
        '(class { static configured = (holder.request = body as any); [(holder.request = { workspaceId: "safe" }, "method")]() {} });',
        true,
    ],
]) {
    test(`${label} preserves class evaluation phase ordering`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ${setup} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("keeps repeated runtime getter reads at one loop site conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const source = { get registry(): Registry { return { Ctor: Safe }; } }; let old: Registry | undefined; let current: Registry | undefined; for (const index of [0, 1]) { const value = source.registry; if (index === 0) old = value; else current = value; } old!.Ctor = Unsafe; new current!.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(
            result.failures.join("\n"),
            /(as any.*CreateProjectsRequest|could not statically resolve)/i,
        );
    });
});

test("fails closed for a recursive allocating getter", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { class Safe {} const source = { get registry(): { Ctor: typeof Safe } { return source.registry; } }; const current = source.registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /could not statically resolve/i);
    });
});

test("fails closed when allocating getter depth is exceeded", async () => {
    const getters = [
        "const source0 = { get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } };",
        ...Array.from(
            { length: 70 },
            (_, index) =>
                `const source${index + 1} = { get registry(): { Ctor: typeof Safe | typeof Unsafe } { return source${index}.registry; } };`,
        ),
    ].join("\n");
    const source =
        generatedImports +
        `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } ${getters} const old = source70.registry; const current = source70.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n`;
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /could not statically resolve/i);
    });
});

test("fails closed when allocating getter read contexts exceed the cap", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const source = { get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } }; const old = source.registry; const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 10_000 },
        });
        assert.match(result.failures.join("\n"), /receiver allocation invocation contexts; max 1/i);
    });
});

test("fails closed when allocating getter analysis exceeds the work cap", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { class Safe {} const source = { get registry(): { Ctor: typeof Safe } { return { Ctor: Safe }; } }; const current = source.registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded \(work; max 1\)/i);
    });
});

for (const [label, setup, shouldFail, runArgs] of [
    [
        "anonymous instantiated instance field Reflect.set",
        'new (class { configured = Reflect.set(holder, "request", body as any); })();',
        true,
    ],
    [
        "anonymous instantiated constructor direct write",
        "new (class { constructor() { holder.request = body as any; } })();",
        true,
    ],
    [
        "named instantiated instance field Object.assign",
        "class Configured { configured = Object.assign(holder, { request: body as any }); } new Configured();",
        true,
    ],
    [
        "named instantiated constructor Reflect.set",
        'class Configured { constructor() { Reflect.set(holder, "request", body as any); } } new Configured();',
        true,
    ],
    [
        "uninstantiated direct instance field",
        "(class { configured = (holder.request = body as any); });",
        false,
    ],
    [
        "uninstantiated instance field Reflect.set",
        '(class { configured = Reflect.set(holder, "request", body as any); });',
        false,
    ],
    [
        "instance field unsafe then constructor safe",
        'new (class { configured = (holder.request = body as any); constructor() { holder.request = { workspaceId: "safe" }; } })();',
        false,
    ],
    [
        "instance field safe then constructor unsafe",
        'new (class { configured = (holder.request = { workspaceId: "safe" }); constructor() { holder.request = body as any; } })();',
        true,
    ],
    [
        "multiple instance fields safe-last",
        'new (class { first = (holder.request = body as any); second = (holder.request = { workspaceId: "safe" }); })();',
        false,
    ],
    [
        "conditional instantiation remains reachable",
        "class Configured { configured = (holder.request = body as any); } choose ? new Configured() : undefined;",
        true,
        ", choose: boolean",
    ],
    [
        "uninstantiated static and instance separation",
        '(class { static configured = (holder.request = { workspaceId: "safe" }); instance = (holder.request = body as any); });',
        false,
    ],
    [
        "conditional class alias construction",
        'const Configured = choose ? class { configured = (holder.request = body as any); } : class { configured = (holder.request = { workspaceId: "safe" }); }; new Configured();',
        true,
        ", choose: boolean",
    ],
    [
        "all-safe conditional class alias construction",
        'const Configured = choose ? class { configured = (holder.request = { workspaceId: "left" }); } : class { configured = (holder.request = { workspaceId: "right" }); }; new Configured();',
        false,
        ", choose: boolean",
    ],
]) {
    test(`${label} models construction-only effects`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown${runArgs ?? ""}) { const holder: Holder = { request: { workspaceId: "safe" } }; ${setup} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, setup, shouldFail] of [
    [
        "inherited instance field",
        "class Base { configured = (holder.request = body as any); } class Derived extends Base {} new Derived();",
        true,
    ],
    [
        "inherited constructor",
        "class Base { constructor() { holder.request = body as any; } } class Derived extends Base {} new Derived();",
        true,
    ],
    [
        "derived field after inherited unsafe field",
        'class Base { configured = (holder.request = body as any); } class Derived extends Base { configured = (holder.request = { workspaceId: "safe" }); } new Derived();',
        false,
    ],
]) {
    test(`${label} preserves base-to-derived construction ordering`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ${setup} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("fails closed for an unresolved constructed class alternative", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, hidden: unknown, choose: boolean) { const Configured = choose ? class {} : hidden as any; new Configured(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /statically resolve.*constructed class/i);
    });
});

test("fails closed when constructed class alternatives exceed the cap", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, a: boolean, b: boolean) { const Configured = a ? class {} : b ? class {} : class {}; new Configured(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded.*alternatives.*1/i);
    });
});

test("does not activate construction effects through a false logical branch", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Configured { configured = (holder.request = body as any); } false && new Configured(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not activate construction effects through a false statement branch", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Configured { configured = (holder.request = body as any); } if (false) new Configured(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("constructs only the latest definite class alias assignment", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Unsafe { configured = (holder.request = body as any); } class Safe {} let Configured = Unsafe; Configured = Safe; new Configured(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("lifts construction effects through an active helper invocation", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Configured { configured = (holder.request = body as any); } function configure() { new Configured(); } configure(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("fails closed for a wholly unresolved constructed target", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, hidden: unknown) { new (hidden as any)(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /statically resolve.*constructed class/i);
    });
});

test("does not lift construction effects after an unconditional helper return", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Configured { configured = (holder.request = body as any); } function configure() { return; new Configured(); } configure(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("resolves a statically known class from a registry element", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Configured { configured = (holder.request = body as any); } const registry = { configured: Configured }; new registry["configured"](); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("resolves a statically known factory-returned class", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Configured { configured = (holder.request = body as any); } function configured() { return Configured; } new (configured())(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("fails closed for a getter-provided constructed class", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { class Configured {} const registry = { get configured() { return Configured; } }; new registry.configured(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /statically resolve.*constructed class/i);
    });
});

test("orders lifted construction effects at the active helper call", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Configured { configured = (holder.request = { workspaceId: "safe" }); } function configure() { new Configured(); } holder.request = body as any; configure(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, construction, shouldFail] of [
    ["true logical branch", "true && new Configured();", true],
    ["false ternary branch", "false ? new Configured() : undefined;", false],
    ["true ternary branch", "true ? new Configured() : undefined;", true],
    ["short-circuited logical-or branch", "true || new Configured();", false],
    ["true statement branch", "if (true) new Configured();", true],
]) {
    test(`${label} controls construction-effect reachability`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Configured { configured = (holder.request = body as any); } ${construction} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, assignments, shouldFail] of [
    ["safe then unsafe", "let Configured = Safe; Configured = Unsafe;", true],
    ["partial unsafe overwrite", "let Configured = Safe; if (choose) Configured = Unsafe;", true],
    [
        "all-path safe overwrite",
        "let Configured = Unsafe; if (choose) Configured = Safe; else Configured = AlsoSafe;",
        false,
    ],
]) {
    test(`${label} preserves reaching class alias assignments`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; class Unsafe { configured = (holder.request = body as any); } class Safe {} class AlsoSafe {} ${assignments} new Configured(); return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, invocation, shouldFail] of [
    ["uncalled helper", "function configure() { new Configured(); } void configure;", false],
    [
        "nested active helper",
        "function inner() { new Configured(); } function outer() { inner(); } outer();",
        true,
    ],
    ["active synchronous callback", "[1].forEach(() => new Configured());", true],
]) {
    test(`${label} controls lifted construction effects`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Configured { configured = (holder.request = body as any); } ${invocation} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("fails closed when active construction helper depth is exceeded", async () => {
    const helpers = ["function h0() { new Configured(); }"];
    for (let index = 1; index <= 40; index += 1) {
        helpers.push(`function h${index}() { h${index - 1}(); }`);
    }
    const source =
        generatedImports +
        `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Configured { configured = (holder.request = body as any); } ${helpers.join(" ")} h40(); return client.projects.create(holder.request); }\n`;
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /constructed helper invocation.*depth limit/i);
    });
});

test("resolves a destructured class alias before construction", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Configured { configured = (holder.request = body as any); } const { configured: Selected } = { configured: Configured }; new Selected(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, setup, expected] of [
    [
        "loop-carried class overwrite",
        "let Selected = Safe; for (const value of [1]) { void value; Selected = Unsafe; } new Selected();",
        "finding",
    ],
    [
        "unknown latest class overwrite",
        "let Selected = Safe; Selected = hidden as any; new Selected();",
        "resolution",
    ],
    [
        "cyclic class aliases",
        "let Selected: any; let Other: any; Selected = Other; Other = Selected; new Selected();",
        "resolution",
    ],
]) {
    test(`${label} remains conservative before construction`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, hidden: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Unsafe { configured = (holder.request = body as any); } class Safe {} ${setup} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (expected === "finding")
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.match(result.failures.join("\n"), /statically resolve.*constructed class/i);
        });
    });
}

for (const [label, factory, expected] of [
    ["safe factory", "function select() { return Safe; } new (select())();", "safe"],
    [
        "conditional factory",
        "function select() { return choose ? Unsafe : Safe; } new (select())();",
        "finding",
    ],
    [
        "static computed registry",
        'const selectedKey: "configured" = "configured"; const registry = { configured: Unsafe }; new registry[selectedKey]();',
        "finding",
    ],
    [
        "unknown computed registry",
        "const registry = { safe: Safe, unsafe: Unsafe }; new registry[key]();",
        "resolution",
    ],
]) {
    test(`${label} resolves constructed targets conservatively`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean, key: "safe" | "unsafe") { const holder: Holder = { request: { workspaceId: "safe" } }; class Unsafe { configured = (holder.request = body as any); } class Safe {} ${factory} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (expected === "safe") assert.deepEqual(result.failures, []);
            else if (expected === "finding")
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.match(result.failures.join("\n"), /statically resolve.*constructed class/i);
        });
    });
}

test("charges constructed class alternatives to the common work cap", async () => {
    const choices = Array.from({ length: 10 }, (_, index) => `choose${index}`);
    const runArgs = choices.map((choice) => `, ${choice}: boolean`).join("");
    const selected = choices.reduceRight(
        (rest, choice) => `${choice} ? Configured : (${rest})`,
        "Configured",
    );
    const source =
        generatedImports +
        `export async function run(client: FixtureClient${runArgs}) { class Configured {} const Selected = ${selected}; new Selected(); return client.projects.create({ workspaceId: "safe" }); }\n`;
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 256, maxInvocations: 256, maxWork: 10 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded.*work.*10/i);
        assert.deepEqual(result.analysisStats, { work: 10, exhausted: true });
    });
});

test("fails closed for a recursive active construction helper cycle", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Configured { configured = (holder.request = body as any); } function first() { new Configured(); second(); } function second() { first(); } first(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /constructed helper invocation.*cycle/i);
    });
});

test("keeps every synchronous callback class alternative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; class Unsafe { configured = (holder.request = body as any); } class Safe {} const configure = choose ? () => new Unsafe() : () => new Safe(); [1].forEach(configure); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("allows a statically safe registry class construction", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { class Configured {} const registry = { configured: Configured }; new registry.configured(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("fails closed for a recursive constructed-class factory", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { function select(): any { return select(); } new (select())(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /constructed class target.*depth limit/i);
    });
});

test("lifts construction effects through an invoked IIFE", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Configured { configured = (holder.request = body as any); } (() => new Configured())(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("caps synchronous callback class alternatives", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, choose: boolean) { class Left {} class Right {} const configure = choose ? () => new Left() : () => new Right(); [1].forEach(configure); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded.*max 1/i);
    });
});

test("uses a later unsafe assignment to a declared class binding", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Selected {} class Unsafe { configured = (holder.request = body as any); } Selected = Unsafe; new Selected(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("uses a later unsafe assignment to a registry class property", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const registry = { selected: Safe }; registry.selected = Unsafe; new registry.selected(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not activate construction effects in a statically false while loop", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Unsafe { configured = (holder.request = body as any); } while (false) { new Unsafe(); } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("allows a later safe assignment to dominate a registry class property", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const registry = { selected: Unsafe }; registry.selected = Safe; new registry.selected(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("fails closed after deleting a registry class property", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { class Selected {} const registry: { selected?: typeof Selected } = { selected: Selected }; delete registry.selected; new registry.selected!(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /statically resolve.*constructed class/i);
    });
});

for (const [label, statement, shouldFail] of [
    ["statically false for", "for (; false; ) { new Unsafe(); }", false],
    ["statically true while", "let done = false; while (true) { new Unsafe(); break; }", true],
    ["statically unknown while", "while (body) { new Unsafe(); break; }", true],
    ["do-while false", "do { new Unsafe(); } while (false);", true],
    [
        "continue before construction",
        "for (const value of [1]) { void value; continue; new Unsafe(); }",
        false,
    ],
    [
        "return before construction",
        "function configure() { return; new Unsafe(); } configure();",
        false,
    ],
    [
        "throw before construction",
        'function configure() { throw new Error("stop"); new Unsafe(); } void configure;',
        false,
    ],
]) {
    test(`${label} controls statically reachable construction indexing`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Unsafe { configured = (holder.request = body as any); } ${statement} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, switchBody, shouldFail] of [
    [
        "known unselected case",
        'switch ("safe") { case "unsafe": new Unsafe(); break; case "safe": break; }',
        false,
    ],
    [
        "known selected case",
        'switch ("unsafe") { case "unsafe": new Unsafe(); break; case "safe": break; }',
        true,
    ],
    [
        "selected fallthrough",
        'switch ("safe") { case "safe": void 0; case "unsafe": new Unsafe(); break; }',
        true,
    ],
    [
        "selected break before later case",
        'switch ("safe") { case "safe": break; case "unsafe": new Unsafe(); break; }',
        false,
    ],
    ["construction after break", 'switch ("safe") { case "safe": break; new Unsafe(); }', false],
    [
        "unknown discriminant",
        'switch (selected) { case "unsafe": new Unsafe(); break; case "safe": break; }',
        true,
    ],
]) {
    test(`${label} preserves switch construction reachability`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, selected: string) { const holder: Holder = { request: { workspaceId: "safe" } }; class Unsafe { configured = (holder.request = body as any); } ${switchBody} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, setup, expected] of [
    [
        "declared unsafe then safe",
        "class Selected { configured = (holder.request = body as any); } Selected = Safe; new Selected();",
        "safe",
    ],
    [
        "computed registry safe then unsafe",
        'const key: "selected" = "selected"; const registry = { selected: Safe }; registry[key] = Unsafe; new registry[key]();',
        "finding",
    ],
    [
        "aliased registry safe then unsafe",
        "const registry = { selected: Safe }; const alias = registry; alias.selected = Unsafe; new registry.selected();",
        "finding",
    ],
    [
        "destructured binding safe then unsafe",
        "const { selected: Selected } = { selected: Safe }; Selected = Unsafe; new Selected();",
        "finding",
    ],
    [
        "partial registry unsafe overwrite",
        "const registry = { selected: Safe }; if (choose) registry.selected = Unsafe; new registry.selected();",
        "finding",
    ],
    [
        "all-path registry safe overwrite",
        "const registry = { selected: Unsafe }; if (choose) registry.selected = Safe; else registry.selected = AlsoSafe; new registry.selected();",
        "safe",
    ],
    [
        "unknown registry overwrite",
        "const registry = { selected: Safe }; registry.selected = hidden as any; new registry.selected();",
        "resolution",
    ],
    [
        "delete then safe restoration",
        "const registry: { selected?: typeof Safe } = { selected: Unsafe }; delete registry.selected; registry.selected = Safe; new registry.selected!();",
        "safe",
    ],
    [
        "Object.assign unsafe overwrite",
        "const registry = { selected: Safe }; Object.assign(registry, { selected: Unsafe }); new registry.selected();",
        "finding",
    ],
    [
        "Object.assign safe overwrite",
        "const registry = { selected: Unsafe }; Object.assign(registry, { selected: Safe }); new registry.selected();",
        "safe",
    ],
    [
        "Reflect.set unsafe overwrite",
        'const registry = { selected: Safe }; Reflect.set(registry, "selected", Unsafe); new registry.selected();',
        "finding",
    ],
    [
        "defineProperty safe overwrite",
        'const registry = { selected: Unsafe }; Object.defineProperty(registry, "selected", { value: Safe }); new registry.selected();',
        "safe",
    ],
]) {
    test(`${label} orders constructor target writes`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean, hidden: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class AlsoSafe {} class Unsafe { configured = (holder.request = body as any); } ${setup} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (expected === "safe") assert.deepEqual(result.failures, []);
            else if (expected === "finding")
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.match(result.failures.join("\n"), /statically resolve.*constructed class/i);
        });
    });
}

test("uses a later safe numeric array-element constructor target", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const registry: Array<typeof Safe | typeof Unsafe> = [Unsafe]; registry[0] = Safe; new registry[0](); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("uses a later unsafe numeric array-element constructor target", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const registry: Array<typeof Safe | typeof Unsafe> = [Safe]; registry[0] = Unsafe; new registry[0](); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not activate construction effects in a statically empty for-of loop", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Unsafe { configured = (holder.request = body as any); } for (const value of []) { void value; new Unsafe(); } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps constructor registry allocations distinct across receiver rebinding", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const oldObject: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; const newSafe: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; let registry = oldObject; const old = registry; registry = newSafe; old.Ctor = Unsafe; new registry.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps Object.assign on an old constructor registry allocation distinct", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const oldObject: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; const newSafe: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; let registry = oldObject; const old = registry; registry = newSafe; Object.assign(old, { Ctor: Unsafe }); new registry.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps inline object allocation sites distinct across constructor registry rebinding", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } let registry: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; const old = registry; registry = { Ctor: Safe }; old.Ctor = Unsafe; new registry.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps Object.assign on an old inline object allocation distinct", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } let registry: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; const old = registry; registry = { Ctor: Safe }; Object.assign(old, { Ctor: Unsafe }); new registry.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps repeated allocating factory call sites distinct", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } function make(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } const old = make(); const current = make(); old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps Object.assign on an old allocating factory result distinct", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } function make(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } const old = make(); const current = make(); Object.assign(old, { Ctor: Unsafe }); new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps repeated shared-singleton factory calls aliased", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const singleton: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; function make() { return singleton; } const old = make(); const current = make(); old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("flags mutation of the current allocating factory result", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } function make(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } const old = make(); const current = make(); current.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("keeps repeated array factory call sites distinct", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } function make(): Array<typeof Safe | typeof Unsafe> { return [Safe]; } const old = make(); const current = make(); old[0] = Unsafe; new current[0](); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps repeated new-allocation factory call sites distinct", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } class Registry { Ctor: typeof Safe | typeof Unsafe = Safe; } function make() { return new Registry(); } const old = make(); const current = make(); old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps aliases of one allocating factory call on the same identity", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } function make(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } const current = make(); const alias = current; alias.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("keeps nested allocating factory invocation contexts distinct", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } function inner(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } function make() { return inner(); } const old = make(); const current = make(); old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps conditional factory rebinding conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } function make(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } const old = make(); const current = choose ? old : make(); old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("keeps repeated runtime allocations at one loop call site conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; function make(): Registry { return { Ctor: Safe }; } let old: Registry | undefined; let current: Registry | undefined; for (const index of [0, 1]) { const value = make(); if (index === 0) old = value; else current = value; } old!.Ctor = Unsafe; new current!.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(
            result.failures.join("\n"),
            /(as any.*CreateProjectsRequest|could not statically resolve)/i,
        );
    });
});

test("keeps repeated runtime allocations at one callback call site conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; function make(): Registry { return { Ctor: Safe }; } let old: Registry | undefined; let current: Registry | undefined; [0, 1].forEach((index) => { const value = make(); if (index === 0) old = value; else current = value; }); old!.Ctor = Unsafe; new current!.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(
            result.failures.join("\n"),
            /(as any.*CreateProjectsRequest|could not statically resolve)/i,
        );
    });
});

test("fails closed when receiver allocation invocation contexts exceed the cap", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } function make(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } const old = make(); const current = make(); old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 10_000 },
        });
        assert.match(result.failures.join("\n"), /receiver allocation invocation contexts; max 1/i);
    });
});

test("fails closed for a recursive receiver allocation factory", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, recurse: boolean) { class Safe {} function make(): { Ctor: typeof Safe } { return recurse ? make() : { Ctor: Safe }; } const current = make(); new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /could not statically resolve/i);
    });
});

test("fails closed when receiver allocation factory depth is exceeded", async () => {
    const helpers = [
        "function make0() { return { Ctor: Safe }; }",
        ...Array.from(
            { length: 70 },
            (_, index) => `function make${index + 1}() { return make${index}(); }`,
        ),
    ].join("\n");
    const source =
        generatedImports +
        `export async function run(client: FixtureClient) { class Safe {} ${helpers} const current = make70(); new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n`;
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /could not statically resolve/i);
    });
});

test("fails closed for an unknown receiver allocation factory", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, make: () => { Ctor: new () => unknown }) { const old = make(); const current = make(); old.Ctor = class {}; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /could not statically resolve/i);
    });
});

test("keeps Object.assign aliases from a shared-singleton factory", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const singleton: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; function make() { return singleton; } const old = make(); const current = make(); Object.assign(old, { Ctor: Unsafe }); new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("flags mutation of the current array factory result", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } function make(): Array<typeof Safe | typeof Unsafe> { return [Safe]; } const old = make(); const current = make(); current[0] = Unsafe; new current[0](); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("keeps fresh object-getter allocation reads distinct", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const source = { get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } }; const old = source.registry; const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps separate destructured fresh-getter allocation reads distinct", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const source = { get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } }; const { registry: old } = source; const { registry: current } = source; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, setup, shouldFail] of [
    [
        "Object.assign old result",
        "const { registry: old } = source; const { registry: current } = source; Object.assign(old, { Ctor: Unsafe }); new current.Ctor();",
        false,
    ],
    [
        "current result mutation",
        "const { registry: old } = source; const { registry: current } = source; current.Ctor = Unsafe; new current.Ctor();",
        true,
    ],
    [
        "destructuring assignment",
        "let old; let current; ({ registry: old } = source); ({ registry: current } = source); old.Ctor = Unsafe; new current.Ctor();",
        false,
    ],
]) {
    test(`${label} preserves destructured getter read identity`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const source = { get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } }; ${setup} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("keeps destructured singleton-returning getter reads aliased", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const singleton: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; const source = { get registry() { return singleton; } }; const { registry: old } = source; const { registry: current } = source; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("merges reachable singleton defaults with destructured getter origins", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const sharedSingleton: Registry = { Ctor: Safe }; const source = { get registry(): Registry | undefined { return choose ? { Ctor: Safe } : void 0; } }; const { registry: old = sharedSingleton } = source; const { registry: current = sharedSingleton } = source; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("uses only the latest reaching typed getter receiver write", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; interface Source { readonly registry: Registry } const singleton: Registry = { Ctor: Safe }; let source: Source = { get registry() { return singleton; } }; const old = source.registry; source = { get registry() { return { Ctor: Safe }; } }; const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("uses latest reaching values before a directly resolved accessor", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; let source = { get registry(): Registry { return singleton; } }; const old = source.registry; source = { get registry(): Registry { return { Ctor: Safe }; } }; const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("resolves local factory returns before a declared base accessor", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } let source: Base = new Base(); const old = source.registry; source = makeFresh(); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, factory, setup, shouldFail] of [
    [
        "reverse singleton factory",
        "function makeSingleton(): Base { return new Base(); }",
        "let source: Base = new Fresh(); const old = source.registry; source = makeSingleton(); const current = source.registry; current.Ctor = Unsafe; new current.Ctor();",
        true,
    ],
    [
        "interface object-literal factory",
        "function makeFresh(): Source { return { get registry() { return { Ctor: Safe }; } }; }",
        "let source: Source = { get registry() { return singleton; } }; const old = source.registry; source = makeFresh(); const current = source.registry; old.Ctor = Unsafe; new current.Ctor();",
        false,
    ],
    [
        "nested factory",
        "function inner(): Base { return new Fresh(); } function makeFresh(): Base { return inner(); }",
        "let source: Base = new Base(); const old = source.registry; source = makeFresh(); const current = source.registry; old.Ctor = Unsafe; new current.Ctor();",
        false,
    ],
    [
        "aliased factory",
        "function makeFresh(): Base { return new Fresh(); } const make = makeFresh;",
        "let source: Base = new Base(); const old = source.registry; source = make(); const current = source.registry; old.Ctor = Unsafe; new current.Ctor();",
        false,
    ],
    [
        "all-fresh conditional factory",
        "class OtherFresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(choose: boolean): Base { return choose ? new Fresh() : new OtherFresh(); }",
        "let source: Base = new Base(); const old = source.registry; source = makeFresh(choose); const current = source.registry; old.Ctor = Unsafe; new current.Ctor();",
        false,
    ],
    [
        "mixed conditional factory",
        "function makeMixed(choose: boolean): Base { return choose ? new Fresh() : new Base(); }",
        "let source: Base = new Base(); const old = source.registry; source = makeMixed(choose); const current = source.registry; old.Ctor = Unsafe; new current.Ctor();",
        true,
    ],
    [
        "local method factory",
        "const factory = { makeFresh(): Base { return new Fresh(); } };",
        "let source: Base = new Base(); const old = source.registry; source = factory.makeFresh(); const current = source.registry; old.Ctor = Unsafe; new current.Ctor();",
        false,
    ],
]) {
    test(`${label} resolves local getter factory returns`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; interface Source { readonly registry: Registry } const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } ${factory} ${setup} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(
                    result.failures.join("\n"),
                    /(as any.*CreateProjectsRequest|could not statically resolve)/i,
                );
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("keeps unresolved external getter factories conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, make: () => Base) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } let source = new Base(); const old = source.registry; source = make(); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(
            result.failures.join("\n"),
            /(as any.*CreateProjectsRequest|could not statically resolve)/i,
        );
    });
});

test("keeps imported getter factories conservative despite available source", async () => {
    const source =
        generatedImports +
        'import { Base, make } from "./helper.js";\ninterface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Unsafe { configured = (holder.request = body as any); } let source: Base = new Base(); const old = source.registry; source = make(); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        await writeFile(
            path.join(root, "cli/src/helper.ts"),
            "export type Registry = { Ctor: new () => unknown }; class Safe {} const singleton: Registry = { Ctor: Safe }; export class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } export function make(): Base { return new Fresh(); }\n",
        );
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not treat async getter factories as synchronous returns", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } async function makeFresh(): Promise<Base> { return new Fresh(); } let source = new Base(); const old = source.registry; source = await makeFresh(); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(
            result.failures.join("\n"),
            /(as any.*CreateProjectsRequest|could not statically resolve)/i,
        );
    });
});

test("substitutes generic local getter factory parameters", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function identity<T extends Base>(value: T): Base { return value; } let source: Base = new Base(); const old = source.registry; source = identity(new Fresh()); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps local getter factory allocations distinct at one call site", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; interface Source { readonly registry: Registry } function makeFresh(): Source { return { get registry() { return { Ctor: Safe }; } }; } function read() { return makeFresh().registry; } const old = read(); const current = read(); old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("fails closed for recursive local getter factories", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, recurse: boolean) { class Safe {} type Registry = { Ctor: typeof Safe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function make(value: boolean): Base { return value ? make(value) : new Fresh(); } const current = make(recurse).registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(
            result.failures.join("\n"),
            /(recursive receiver getter factory|governed reconstruction depth)/i,
        );
    });
});

test("fails closed when local getter factory returns exceed the alternatives cap", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, choose: boolean) { class Safe {} type Registry = { Ctor: typeof Safe }; class One { get registry(): Registry { return { Ctor: Safe }; } } class Two { get registry(): Registry { return { Ctor: Safe }; } } function make(): One | Two { return choose ? new One() : new Two(); } const current = make().registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 10_000 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded.*max 1/i);
    });
});

test("fails closed when local getter factory discovery exceeds the work cap", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { class Safe {} class Source { get registry() { return { Ctor: Safe }; } } function make(): Source { return new Source(); } const current = make().registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded \(work; max 1\)/i);
    });
});

test("fails closed when local getter factory resolution exceeds the depth limit", async () => {
    const factories = ["function make0(): Source { return new Source(); }"];
    for (let index = 1; index <= 70; index += 1) {
        factories.push(`function make${index}(): Source { return make${index - 1}(); }`);
    }
    const source =
        generatedImports +
        `export async function run(client: FixtureClient) { class Safe {} class Source { get registry() { return { Ctor: Safe }; } } ${factories.join(" ")} const current = make70().registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n`;
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /receiver getter factory depth limit/i);
    });
});

test("projects a concrete getter receiver from a declared-base local factory result", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeBox(): { source: Base } { return { source: new Fresh() }; } let source: Base = new Base(); const old = source.registry; source = makeBox().source; const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("projects a concrete getter receiver through factory destructuring assignment", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeBox(): { source: Base } { return { source: new Fresh() }; } let source: Base = new Base(); const old = source.registry; ({ source } = makeBox()); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, factory, assignment, shouldFail] of [
    [
        "element projection",
        "function makeBox(): { source: Base } { return { source: new Fresh() }; }",
        'source = makeBox()["source"];',
        false,
    ],
    [
        "nested projection",
        "function makeBox(): { nested: { source: Base } } { return { nested: { source: new Fresh() } }; }",
        "source = makeBox().nested.source;",
        false,
    ],
    [
        "reverse singleton projection",
        "function makeBox(): { source: Base } { return { source: new Base() }; }",
        "source = makeBox().source;",
        true,
    ],
    [
        "all-fresh conditional projection",
        "function makeBox(choose: boolean): { source: Base } { return choose ? { source: new Fresh() } : { source: new OtherFresh() }; }",
        "source = makeBox(choose).source;",
        false,
    ],
    [
        "mixed conditional projection",
        "function makeBox(choose: boolean): { source: Base } { return choose ? { source: new Fresh() } : { source: new Base() }; }",
        "source = makeBox(choose).source;",
        true,
    ],
    [
        "native call adapter",
        "function makeFresh(): Base { return new Fresh(); }",
        "source = makeFresh.call(undefined);",
        false,
    ],
    [
        "generic projected factory",
        "function makeBox<T extends Base>(value: T): { source: Base } { return { source: value }; }",
        "source = makeBox(new Fresh()).source;",
        false,
    ],
    [
        "native call argument substitution",
        "function identity<T extends Base>(value: T): Base { return value; }",
        "source = identity.call(undefined, new Fresh());",
        false,
    ],
    [
        "native apply adapter",
        "function makeFresh(): Base { return new Fresh(); }",
        "source = makeFresh.apply(undefined, []);",
        false,
    ],
    [
        "native Reflect.apply adapter",
        "function makeFresh(): Base { return new Fresh(); }",
        "source = Reflect.apply(makeFresh, undefined, []);",
        false,
    ],
    [
        "native bind immediate invocation",
        "function makeFresh(): Base { return new Fresh(); }",
        "source = makeFresh.bind(undefined)();",
        false,
    ],
    [
        "custom call adapter",
        "const adapter = { call(_receiver: unknown): Base { return new Base(); } };",
        "source = adapter.call(undefined);",
        true,
    ],
    [
        "custom apply adapter",
        "const adapter = { apply(_receiver: unknown, _args: []): Base { return new Base(); } };",
        "source = adapter.apply(undefined, []);",
        true,
    ],
    [
        "custom bind adapter",
        "const adapter = { bind(_receiver: unknown): () => Base { return () => new Base(); } };",
        "source = adapter.bind(undefined)();",
        true,
    ],
    [
        "custom Reflect apply adapter",
        "const Reflect = { apply(_target: unknown, _receiver: unknown, _args: []): Base { return new Base(); } }; function makeFresh(): Base { return new Fresh(); }",
        "source = Reflect.apply(makeFresh, undefined, []);",
        true,
    ],
]) {
    test(`${label} resolves projected or adapted local getter factories`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } class OtherFresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } ${factory} let source: Base = new Base(); const old = source.registry; ${assignment} const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(
                    result.failures.join("\n"),
                    /(as any.*CreateProjectsRequest|could not statically resolve)/i,
                );
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("keeps imported projected getter factories conservative", async () => {
    const source =
        generatedImports +
        'import { Base, makeBox } from "./helper.js";\ninterface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Unsafe { configured = (holder.request = body as any); } let source: Base = new Base(); const old = source.registry; source = makeBox().source; const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        await writeFile(
            path.join(root, "cli/src/helper.ts"),
            "export type Registry = { Ctor: new () => unknown }; class Safe {} const singleton: Registry = { Ctor: Safe }; export class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } export function makeBox(): { source: Base } { return { source: new Fresh() }; }\n",
        );
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("keeps async projected getter factories conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } async function makeBox(): Promise<{ source: Base }> { return { source: new Fresh() }; } let source: Base = new Base(); const old = source.registry; source = (await makeBox()).source; const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("keeps projected factory allocations distinct through one getter call site", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; class Base { get registry(): Registry { return { Ctor: Safe }; } } function makeBox(): { source: Base } { return { source: new Base() }; } function read() { return makeBox().source.registry; } const old = read(); const current = read(); old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("fails closed for recursive projected getter factories", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, recurse: boolean) { class Safe {} type Registry = { Ctor: typeof Safe }; class Base { get registry(): Registry { return { Ctor: Safe }; } } function makeBox(value: boolean): { source: Base } { return value ? makeBox(value) : { source: new Base() }; } const current = makeBox(recurse).source.registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(
            result.failures.join("\n"),
            /(recursive receiver getter factory|governed reconstruction depth)/i,
        );
    });
});

test("fails closed when projected getter factory returns exceed the alternatives cap", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, choose: boolean) { class Safe {} class One { get registry() { return { Ctor: Safe }; } } class Two { get registry() { return { Ctor: Safe }; } } function makeBox(): { source: One | Two } { return choose ? { source: new One() } : { source: new Two() }; } const current = makeBox().source.registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 10_000 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded.*max 1/i);
    });
});

test("fails closed when projected getter factory discovery exceeds the work cap", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { class Safe {} class Source { get registry() { return { Ctor: Safe }; } } function makeBox(): { source: Source } { return { source: new Source() }; } const current = makeBox().source.registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded \(work; max 1\)/i);
    });
});

test("fails closed when projected getter factory resolution exceeds the depth limit", async () => {
    const factories = ["function make0(): { source: Source } { return { source: new Source() }; }"];
    for (let index = 1; index <= 70; index += 1) {
        factories.push(
            `function make${index}(): { source: Source } { return { source: make${index - 1}().source }; }`,
        );
    }
    const source =
        generatedImports +
        `export async function run(client: FixtureClient) { class Safe {} class Source { get registry() { return { Ctor: Safe }; } } ${factories.join(" ")} const current = make70().source.registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n`;
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /receiver getter factory depth limit/i);
    });
});

test("resolves a concrete getter receiver through a sequence-wrapped local factory", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } let source: Base = new Base(); const old = source.registry; source = (void 0, makeFresh()); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("resolves a concrete getter receiver through optional projection and nullish fallback", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeBox(): { source: Base } { return { source: new Fresh() }; } let source: Base = new Base(); const old = source.registry; source = makeBox()?.source ?? new Fresh(); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, expression, shouldFail] of [
    ["parenthesized", "(makeFresh())", false],
    ["as assertion", "makeFresh() as Base", false],
    ["satisfies", "makeFresh() satisfies Base", false],
    ["non-null", "makeFresh()!", false],
    ["nested wrapper", "(void 0, (makeFresh() as Base)!)", false],
    ["truthy or pruning", "new Fresh() || new Base()", false],
    ["falsey or pruning", "null || makeFresh()", false],
    ["truthy and pruning", "new Base() && makeFresh()", false],
    ["nullish fallback pruning", "null ?? makeFresh()", false],
    ["nonnull nullish pruning", "new Fresh() ?? new Base()", false],
    ["true conditional pruning", "true ? makeFresh() : new Base()", false],
    ["false conditional pruning", "false ? new Base() : makeFresh()", false],
    ["adapted nested wrapper", "(void 0, makeFresh.call(undefined))", false],
    ["projected nested wrapper", "(void 0, makeBox().source)", false],
    ["aliased nested wrapper", "wrapped", false],
    ["sequence last singleton", "(makeFresh(), new Base())", true],
    ["truthy singleton or", "new Base() || makeFresh()", true],
    ["unknown or alternatives", "maybe || makeFresh()", true],
    ["unknown and alternatives", "maybe && makeFresh()", true],
    ["unknown nullish alternatives", "maybe ?? makeFresh()", true],
    ["unknown conditional alternatives", "choose ? makeFresh() : new Base()", true],
]) {
    test(`${label} preserves receiver wrapper value semantics`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } function makeBox(): { source: Base } { return { source: new Fresh() }; } const wrapped: Base = (void 0, makeFresh()); const maybe: Base = choose ? new Base() : new Fresh(); let source: Base = new Base(); const old = source.registry; source = ${expression}; const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(
                    result.failures.join("\n"),
                    /(as any.*CreateProjectsRequest|could not statically resolve)/i,
                );
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("keeps imported projected receiver wrappers conservative", async () => {
    const source =
        generatedImports +
        'import { Base, makeBox } from "./helper.js";\ninterface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Unsafe { configured = (holder.request = body as any); } let source: Base = new Base(); const old = source.registry; source = makeBox()?.source ?? new Base(); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        await writeFile(
            path.join(root, "cli/src/helper.ts"),
            "export type Registry = { Ctor: new () => unknown }; class Safe {} const singleton: Registry = { Ctor: Safe }; export class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } export function makeBox(): { source: Base } { return { source: new Fresh() }; }\n",
        );
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("keeps async receiver wrappers conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } async function makeFresh(): Promise<Base> { return new Fresh(); } let source: Base = new Base(); const old = source.registry; source = (void 0, await makeFresh()); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not treat a wrapped custom call adapter as native", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } const adapter = { call(_receiver: unknown): Base { return new Base(); } }; let source: Base = new Base(); const old = source.registry; source = (void 0, adapter.call(undefined)); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("fails closed when receiver wrapper alternatives exceed the cap", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, choose: boolean) { class Safe {} class One { get registry() { return { Ctor: Safe }; } } class Two { get registry() { return { Ctor: Safe }; } } const current = (choose ? new One() : new Two()).registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 10_000 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded.*max 1/i);
    });
});

test("fails closed when receiver wrapper discovery exceeds the work cap", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { class Safe {} class Fresh { get registry() { return { Ctor: Safe }; } } const current = (void 0, new Fresh()).registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded \(work; max 1\)/i);
    });
});

test("fails closed when receiver wrapper resolution exceeds the depth limit", async () => {
    let wrapped = "new Fresh()";
    for (let index = 0; index < 70; index += 1) wrapped = `(void 0, ${wrapped})`;
    const source =
        generatedImports +
        `export async function run(client: FixtureClient) { class Safe {} class Fresh { get registry() { return { Ctor: Safe }; } } const current = (${wrapped}).registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n`;
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /governed reconstruction depth/i);
    });
});

test("fails closed for cyclic receiver wrapper aliases", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } let source: Base = new Base(); const old = source.registry; let first = {} as Base; let second: Base = first; first = (void 0, second); second = (void 0, first); source = second; const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(
            result.failures.join("\n"),
            /(as any.*CreateProjectsRequest|could not statically resolve)/i,
        );
    });
});

test("resolves a concrete getter receiver through an assignment expression result", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } let source: Base = new Base(); let temp: Base = new Base(); const old = source.registry; source = (temp = makeFresh()); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("resolves a receiver read after an earlier assignment in the same sequence", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } let source: Base = new Base(); let temp: Base = new Base(); const old = source.registry; source = (temp = makeFresh(), temp); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("resolves a receiver self-read after its earlier assignment in the same sequence", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } let source: Base = new Base(); const old = source.registry; source = (source = makeFresh(), source); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("resolves a later receiver argument after an earlier argument assignment", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } function second(_first: Base, value: Base): Base { return value; } let source: Base = new Base(); let temp: Base = new Base(); const old = source.registry; source = second(temp = makeFresh(), temp); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not let a later argument assignment rewrite an earlier captured receiver", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } function first(value: Base, _second: Base): Base { return value; } let source: Base = new Base(); let temp: Base = new Base(); const old = source.registry; source = first(temp, temp = makeFresh()); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("resolves a later array receiver element after an earlier element assignment", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } let source: Base = new Base(); let temp: Base = new Base(); const old = source.registry; source = [temp = makeFresh(), temp][1]; const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not let a later array element assignment rewrite an earlier captured receiver", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } let source: Base = new Base(); let temp: Base = new Base(); const old = source.registry; source = [temp, temp = makeFresh()][0]; const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, expression, shouldFail] of [
    [
        "earlier property assignment reaches a later property read",
        "({ first: (temp = makeFresh()), value: temp }).value",
        false,
    ],
    [
        "later property assignment does not rewrite an earlier property snapshot",
        "({ value: temp, later: (temp = makeFresh()) }).value",
        true,
    ],
    [
        "earlier property assignment reaches a later spread property read",
        "({ first: (temp = makeFresh()), ...{ value: temp } }).value",
        false,
    ],
    [
        "later property assignment does not rewrite an earlier spread snapshot",
        "({ ...{ value: temp }, later: (temp = makeFresh()) }).value",
        true,
    ],
]) {
    test(`${label} in an ordered receiver object`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } let source: Base = new Base(); let temp: Base = new Base(); const old = source.registry; source = ${expression}; const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("carries an executed logical-left assignment into the right receiver read", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } let source: Base = new Base(); let temp: Base = new Base(); const old = source.registry; source = ((temp = makeFresh()) && temp); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("carries a conditional-test assignment only into its selected receiver branch", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } let source: Base = new Base(); let temp: Base = new Base(); const old = source.registry; source = ((temp = makeFresh()) ? temp : new Base()); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("carries an executed logical assignment into a later receiver read", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } let source: Base = new Base(); let temp: Base | undefined = new Base(); const old = source.registry; source = (temp = undefined, temp ??= makeFresh(), temp as Base); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("resolves a property receiver read after an earlier assignment in the same sequence", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } let source: Base = new Base(); const box: { value: Base } = { value: new Base() }; const old = source.registry; source = (box.value = makeFresh(), box.value); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("carries assignment-target evaluation effects into a later receiver read", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } let source: Base = new Base(); let temp: Base = new Base(); const box: Record<string, Base> = {}; const old = source.registry; source = (box[(temp = makeFresh(), "value")] = new Base(), temp); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("applies an invoked local helper write before a later receiver read", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Unsafe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } let temp: Base = new Fresh(); function selectUnsafe() { temp = new Base(); } (selectUnsafe(), new temp.registry.Ctor()); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, invocation, shouldFail] of [
    ["direct safe helper", "selectFresh()", false],
    ["invoked IIFE", "(() => { temp = new Base(); })()", true],
    ["nested invoked helper", "outer()", true],
    ["return before write", "returnBeforeWrite()", false],
    ["partial conditional write", "selectMaybe(true)", true],
    ["all-path safe write", "selectSafeEitherWay(true)", false],
    ["ordered unsafe then safe writes", "selectUnsafeThenSafe()", false],
    ["ordered safe then unsafe writes", "selectSafeThenUnsafe()", true],
    ["synchronous callback", "[0].forEach(() => { temp = new Base(); })", true],
    ["merely passed callback", "acceptCallback(() => { temp = new Base(); })", false],
    ["Function.call adapter", "selectUnsafe.call(undefined)", true],
    ["Function.apply adapter", "selectUnsafe.apply(undefined, [])", true],
    ["Reflect.apply adapter", "Reflect.apply(selectUnsafe, undefined, [])", true],
    ["bound adapter", "selectUnsafe.bind(undefined)()", true],
    ["uninvoked helper", "void selectUnsafe", false],
]) {
    test(`tracks expression-local invoked helper effects through ${label}`, async () => {
        const source =
            generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Unsafe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } let temp: Base = new Fresh(); function selectUnsafe() { temp = new Base(); } function selectFresh() { temp = new Fresh(); } function inner() { selectUnsafe(); } function outer() { inner(); } function returnBeforeWrite() { return; temp = new Base(); } function selectMaybe(value: boolean) { if (value) temp = new Base(); } function selectSafeEitherWay(value: boolean) { if (value) temp = new Fresh(); else temp = new Fresh(); } function selectUnsafeThenSafe() { temp = new Base(); temp = new Fresh(); } function selectSafeThenUnsafe() { temp = new Fresh(); temp = new Base(); } function acceptCallback(_callback: () => void) {} (' +
            invocation +
            ", new temp.registry.Ctor()); return client.projects.create(holder.request); }\n";
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail) {
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

test("models a synchronously invoked callback parameter effect", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function invoke(callback: () => void) { callback(); } invoke(() => { holder.request = body as any; }); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models a named callback passed through a local invoker", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function invoke(callback: () => void) { callback(); } function unsafeCallback() { holder.request = body as any; } invoke(unsafeCallback); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models a callback passed through nested local invokers", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function invoke(callback: () => void) { callback(); } function outer(callback: () => void) { invoke(callback); } outer(() => { holder.request = body as any; }); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models a factory-returned callback passed to a local invoker", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function invoke(callback: () => void) { callback(); } function makeCallback() { return () => { holder.request = body as any; }; } invoke(makeCallback()); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not invoke a callback that a local helper only returns", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function returnCallback(callback: () => void) { return callback; } void returnCallback(() => { holder.request = body as any; }); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("models callback effects before the first suspension of an async local invoker", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { callback(); } void invoke(() => { holder.request = body as any; }); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not claim an unawaited callback effect after async suspension", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("models a post-suspension callback effect after an unrelated outer await", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); await Promise.resolve(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not treat timer scheduling as an outer suspension", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); setTimeout(() => undefined, 0); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("models a post-suspension callback effect after awaiting local completion", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } await invoke(() => { holder.request = body as any; }); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models a post-suspension callback effect after awaiting a local promise alias", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects an awaited completion to an active local boundary helper call", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } function send() { return client.projects.create(holder.request); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects an awaited async IIFE post-suspension write to a local boundary helper", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send() { return client.projects.create(holder.request); } await (async () => { await Promise.resolve(); holder.request = body as any; })(); return send(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not project an unawaited async IIFE post-suspension write", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send() { return client.projects.create(holder.request); } void (async () => { await Promise.resolve(); holder.request = body as any; })(); return send(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, invocation] of [
    [
        "async function-expression IIFE",
        "await (async function () { await Promise.resolve(); holder.request = body as any; })();",
    ],
    [
        "aliased async IIFE",
        "const task = async () => { await Promise.resolve(); holder.request = body as any; }; await task();",
    ],
]) {
    test(`projects an awaited ${label} post-suspension write`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send() { return client.projects.create(holder.request); } ${invocation} return send(); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

test("projects an async IIFE pre-suspension write before a local boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send() { return client.projects.create(holder.request); } void (async () => { holder.request = body as any; await Promise.resolve(); })(); return send(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not project an awaited async IIFE write to an earlier boundary call", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send() { return client.projects.create(holder.request); } const response = send(); await (async () => { await Promise.resolve(); holder.request = body as any; })(); return response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, declaration, activation] of [
    [
        "module helper",
        "function send(client: FixtureClient, holder: Holder) { return client.projects.create(holder.request); }",
        "send(client, holder)",
    ],
    [
        "object method",
        "const sender = { send() { return client.projects.create(holder.request); } };",
        "sender.send()",
    ],
    [
        "object getter",
        "const sender = { get response() { return client.projects.create(holder.request); } };",
        "sender.response",
    ],
]) {
    test(`projects an awaited async IIFE write to an active ${label} boundary`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\n${label === "module helper" ? declaration : ""}\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ${label === "module helper" ? "" : declaration} await (async () => { await Promise.resolve(); holder.request = body as any; })(); return ${activation}; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

for (const [label, invocation, shouldFail] of [
    [
        "handled rejection catch write",
        'await (async () => { try { await Promise.reject("stop"); } catch { holder.request = body as any; } })();',
        true,
    ],
    [
        "handled rejection finally write",
        'await (async () => { try { await Promise.reject("stop"); } finally { holder.request = body as any; } })().catch(() => undefined);',
        true,
    ],
    [
        "unreachable post-rejection write",
        'try { await (async () => { await Promise.reject("stop"); holder.request = body as any; })(); } catch {}',
        false,
    ],
]) {
    test(`${shouldFail ? "projects" : "does not project"} an async IIFE ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send() { return client.projects.create(holder.request); } ${invocation} return send(); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail) {
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

test("fails closed when awaited async IIFE boundary projection exceeds the work cap", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send() { return client.projects.create(holder.request); } await (async () => { await Promise.resolve(); holder.request = body as any; })(); return send(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 32, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis (?:work )?limit exceeded.*max 1/i);
    });
});

test("projects an awaited second-order async IIFE alias", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send() { return client.projects.create(holder.request); } const task = async () => { await Promise.resolve(); holder.request = body as any; }; const alias = task; await alias(); return send(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("keeps an unsafe async IIFE alternative beside an unresolved alias", async () => {
    const source =
        generatedImports +
        'import { externalTask } from "./external.js";\ninterface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; function send() { return client.projects.create(holder.request); } const task = flag ? async () => { await Promise.resolve(); holder.request = body as any; } : externalTask; await task(); return send(); }\n';
    await withFixture(source, async (root) => {
        await writeFile(
            path.join(root, "cli/src/external.ts"),
            "export declare function externalTask(): Promise<void>;\n",
        );
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("fails closed when conditional member-rebind getter analysis exceeds the work cap", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const getterSender = { get response() { return client.projects.create(holder.request); } }; const box = { sender: getterSender }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; if (flag) box.sender = { response: client.projects.create({ workspaceId: "safe" }) }; const { response } = box.sender; return response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 32, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis (?:work )?limit exceeded.*max 1/i);
    });
});

test("fails closed when destructured true-rest alternatives exceed the cap", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; function send(...[{ request }]: [Holder]) { return client.projects.create(request); } const args = flag ? [holder] as const : [other] as const; return send(...args); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 10_000 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded.*max 1/i);
    });
});

test("fails closed when synthetic rest-array forwarding analysis exceeds the work cap", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; function sendOne(value: Holder) { return client.projects.create(value.request); } function send(...holders: Holder[]) { const [first] = holders; return sendOne(first); } holder.request = body as any; const args = flag ? [holder] as const : [other] as const; return send(...args); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 32, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis (?:work )?limit exceeded.*max 1/i);
    });
});

test("projects an awaited completion to an active module boundary helper call", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nfunction send(client: FixtureClient, holder: Holder) { return client.projects.create(holder.request); }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(client, holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects an awaited completion to an active imported boundary helper call", async () => {
    const source =
        generatedImports +
        'import { send, type Holder } from "./send.js";\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(client, holder); }\n';
    await withFixture(source, async (root) => {
        await writeFile(
            path.join(root, "cli/src/send.ts"),
            generatedImports +
                "export interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function send(client: FixtureClient, holder: Holder) { return client.projects.create(holder.request); }\n",
        );
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects an awaited completion to an active object method boundary call", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { send() { return client.projects.create(holder.request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.send(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("substitutes an active object method argument into its boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { send(h: Holder) { return client.projects.create(h.request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("substitutes an object-binding method parameter into its boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { send({ request }: Holder) { return client.projects.create(request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, parameter, argument, boundary] of [
    ["array", "[request]: [ClockifyApi.CreateProjectsRequest]", "[holder.request]", "request"],
    [
        "nested object",
        "{ nested: { request } }: { nested: Holder }",
        "{ nested: holder }",
        "request",
    ],
    ["defaulted binding", "{ request = { workspaceId: 'fallback' } }: Holder", "holder", "request"],
    ["object rest", "{ ...rest }: Holder", "holder", "rest.request"],
]) {
    test(`substitutes an active ${label} method parameter into its boundary`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { send(${parameter}) { return client.projects.create(${boundary}); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.send(${argument}); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

for (const argument of ["", "undefined"]) {
    test(`uses a parameter initializer for ${argument || "an absent argument"}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { send({ request }: Holder = holder) { return client.projects.create(request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.send(${argument}); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

test("uses a normal parameter initializer for an explicit undefined argument", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(value: Holder = holder) { return client.projects.create(value.request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(undefined); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("activates a getter parameter initializer for explicit undefined", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; function read({ response }: typeof sender = sender) { return response; } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return read(undefined); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("skips a nested binding default getter when the projected member is definitely defined", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const fallback = { get response() { return client.projects.create(holder.request); } }; const source = { nested: { response: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; const { nested: { response = fallback.response } } = source; return response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("drops a stale nested getter after a definite member rebind", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const getterSender = { get response() { return client.projects.create(holder.request); } }; const box = { sender: getterSender }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; box.sender = { response: client.projects.create({ workspaceId: "safe" }) }; const { response } = box.sender; return response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, sourceValue, shouldFail] of [
    ["definitely undefined declaration member", "undefined", true],
    ["unknown declaration member", 'flag ? "safe" : undefined', true],
]) {
    test(`${shouldFail ? "activates" : "skips"} a nested binding default for a ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const fallback = { get response() { return client.projects.create(holder.request); } }; const source = { nested: { response: ${sourceValue} } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; const { nested: { response = fallback.response } } = source; return response; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

test("skips a nested assignment default getter for a definitely defined member", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const fallback = { get response() { return client.projects.create(holder.request); } }; let response: unknown; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; ({ nested: { response = fallback.response } } = { nested: { response: "safe" } }); return response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("activates a nested assignment default getter for an undefined member", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const fallback = { get response() { return client.projects.create(holder.request); } }; let response: unknown; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; ({ nested: { response = fallback.response } } = { nested: { response: undefined } }); return response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, argument, shouldFail] of [
    ["defined", '{ nested: { response: "safe" } }', false],
    ["undefined", "{ nested: { response: undefined } }", true],
]) {
    test(`${shouldFail ? "activates" : "skips"} a nested parameter binding default for a ${label} member`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const fallback = { get response() { return client.projects.create(holder.request); } }; function read({ nested: { response = fallback.response } }: { nested: { response?: unknown } }) { return response; } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return read(${argument}); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail) assert.match(result.failures.join("\n"), /as any/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("preserves a stale nested getter alternative after a conditional member rebind", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const getterSender = { get response() { return client.projects.create(holder.request); } }; const box = { sender: getterSender }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; if (flag) box.sender = { response: client.projects.create({ workspaceId: "safe" }) }; const { response } = box.sender; return response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, write, read] of [
    [
        "nested member",
        'box.inner.sender = { response: client.projects.create({ workspaceId: "safe" }) };',
        "box.inner.sender",
    ],
    [
        "computed-known member",
        'const key = "sender" as const; box[key] = { response: client.projects.create({ workspaceId: "safe" }) };',
        "box.sender",
    ],
]) {
    test(`drops a stale getter after a definite ${label} rebind`, async () => {
        const nested = label === "nested member";
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const getterSender = { get response() { return client.projects.create(holder.request); } }; const box = ${nested ? "{ inner: { sender: getterSender } }" : "{ sender: getterSender }"}; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; ${write} const { response } = ${read}; return response; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, argument, shouldFail] of [
    ["unknown undefined union", "flag ? undefined : other", true],
    ["definitely defined argument", "other", false],
]) {
    test(`${shouldFail ? "keeps" : "skips"} a normal parameter initializer for a ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; function send(value: Holder = holder) { return client.projects.create(value.request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(${argument}); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail) {
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

test("does not project a destructured method parameter from an unrelated argument", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; const sender = { send({ request }: Holder) { return client.projects.create(request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.send(other); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("projects a delayed bound argument through a destructured parameter", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send({ request }: Holder) { return client.projects.create(request); } const bound = send.bind(undefined, holder); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return bound(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, setup, activation, shouldFail] of [
    ["direct call", "", "send(holder)", true],
    ["Function.call", "", "send.call(undefined, holder)", true],
    ["Function.apply", "", "send.apply(undefined, [holder])", true],
    ["uncalled delayed bind", "const bound = send.bind(undefined, holder);", "bound", false],
    [
        "wrong delayed bound argument",
        "const bound = send.bind(undefined, other);",
        "bound()",
        false,
    ],
]) {
    test(`${shouldFail ? "projects" : "does not project"} ${label} through a destructured parameter`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; function send({ request }: Holder) { return client.projects.create(request); } ${setup} async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return ${activation}; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail) {
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

test("projects an active argument through a true rest parameter", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...values: [Holder]) { return client.projects.create(values[0].request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects the second active argument through a true rest parameter", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; function send(...values: [Holder, Holder]) { return client.projects.create(values[1].request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(other, holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects an active argument through a destructured true-rest parameter", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...[{ request }]: [Holder]) { return client.projects.create(request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("activates a non-enumerable numeric getter through array binding rest", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const values: unknown[] = []; Object.defineProperty(values, "0", { enumerable: false, get() { return client.projects.create(holder.request); } }); values.length = 1; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; const [...copy] = values; return copy; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects a synthetic rest array through local array destructuring", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: Holder[]) { const [first] = holders; return client.projects.create(first.request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects a nested destructured true-rest parameter", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...[{ nested: { request } }]: [{ nested: Holder }]) { return client.projects.create(request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send({ nested: holder }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects a default inside a destructured true-rest parameter", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...[{ request = holder.request }]: [{ request?: ClockifyApi.CreateProjectsRequest }]) { return client.projects.create(request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send({ request: undefined }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects the second argument through a destructured true-rest parameter", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; function send(...[, { request }]: [Holder, Holder]) { return client.projects.create(request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(other, holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, call] of [
    ["unrelated argument", "send(other)"],
    ["zero arguments", "send()"],
]) {
    test(`does not project a destructured true-rest parameter from ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; function send(...[{ request }]: [Holder]) { return client.projects.create(request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return ${call}; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

test("activates a non-enumerable numeric getter through direct array binding", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const values: unknown[] = []; Object.defineProperty(values, "0", { enumerable: false, get() { return client.projects.create(holder.request); } }); values.length = 1; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; const [first] = values; return first; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("keeps a non-enumerable numeric getter inert through object rest", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const values: Record<string, unknown> = {}; Object.defineProperty(values, "0", { enumerable: false, get() { return client.projects.create(holder.request); } }); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; const { ...copy } = values; return copy; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not treat shadowed Object.defineProperty as an array getter definition", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const Object = { defineProperty(value: unknown[], _key: string, _descriptor: unknown) { return value; } }; const values: unknown[] = []; Object.defineProperty(values, "0", { get() { return client.projects.create(holder.request); } }); const [...copy] = values; return copy; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, declaration] of [
    ["safe data", 'const values = ["safe"];'],
    ["array hole", "const values = [,];"],
    ["unresolved external", 'const values = JSON.parse("[]") as unknown[];'],
]) {
    test(`does not invent an array-rest getter for ${label}`, async () => {
        const source =
            generatedImports +
            `export async function run(client: FixtureClient, body: unknown) { ${declaration} const [...copy] = values; return copy; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

test("projects a synthetic rest array through nested local destructuring", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: { nested: Holder }[]) { const [{ nested: { request } }] = holders; return client.projects.create(request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send({ nested: holder }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("forwards a synthetic rest array into a local boundary helper", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function sendOne(value: Holder) { return client.projects.create(value.request); } function send(...holders: Holder[]) { return sendOne(...holders); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects a synthetic rest array through a for-of binding", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: Holder[]) { for (const value of holders) return client.projects.create(value.request); } holder.request = body as any; return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("activates a runtime descriptor getter through Object.defineProperty.call", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: { response?: unknown } = {}; Object.defineProperty.call(Object, sender, "response", { get() { return client.projects.create(holder.request); } }); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("lets a later exact data descriptor suppress a runtime getter", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: { response?: unknown } = {}; Object.defineProperty(sender, "response", { configurable: true, get() { return client.projects.create(holder.request); } }); Object.defineProperty(sender, "response", { value: "safe" }); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("activates a source-backed aliased descriptor and getter function", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: { response?: unknown } = {}; const read = () => client.projects.create(holder.request); const descriptor = { get: read }; const alias = descriptor; Object.defineProperty(sender, "response", alias); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("activates an aliased getter descriptor through Object.defineProperties", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: { response?: unknown } = {}; const read = () => client.projects.create(holder.request); const descriptor = { get: read }; const descriptors = { response: descriptor }; Object.defineProperties(sender, descriptors); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("lets an exact receiver alias overwrite suppress a stale nested getter", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const getterSender = { get response() { return client.projects.create(holder.request); } }; const box = { sender: getterSender }; const alias = box; alias.sender = { response: "safe" }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return box.sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("activates a nested getter installed through an exact receiver alias", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const getterSender = { get response() { return client.projects.create(holder.request); } }; const box = { sender: { response: "safe" } }; const alias = box; alias.sender = getterSender; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return box.sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects a synthetic rest array through a synchronous array callback", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: Holder[]) { holders.forEach((value) => { client.projects.create(value.request); }); } holder.request = body as any; send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects a synthetic rest array through nested spread forwarding", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: Holder[]) { for (const value of holders) return client.projects.create(value.request); } function forward(...holders: Holder[]) { return send(...holders); } holder.request = body as any; return forward(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, declaration, call] of [
    [
        "Reflect.defineProperty.apply",
        "",
        'Reflect.defineProperty.apply(Reflect, [sender, "response", descriptor]);',
    ],
    [
        "immediate Object.defineProperty.bind",
        "",
        'Object.defineProperty.bind(Object, sender, "response")(descriptor);',
    ],
    [
        "delayed Reflect.defineProperty.bind",
        'const define = Reflect.defineProperty.bind(Reflect, sender, "response");',
        "define(descriptor);",
    ],
    [
        "prebound Object.defineProperty alias",
        'const defineProperty = Object.defineProperty; const define = defineProperty.bind(Object, sender, "response");',
        "define(descriptor);",
    ],
]) {
    test(`activates a runtime descriptor getter through ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: { response?: unknown } = {}; const descriptor = { get() { return client.projects.create(holder.request); } }; ${declaration} ${call} async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

for (const [label, setup] of [
    [
        "shadowed defineProperty",
        'const Object = { defineProperty(_target: unknown, _key: string, _descriptor: unknown) {} }; Object.defineProperty(sender, "response", descriptor);',
    ],
    [
        "overwritten defineProperty alias",
        'let define = Object.defineProperty; define = ((_target: unknown, _key: string, _descriptor: unknown) => undefined) as typeof Object.defineProperty; define(sender, "response", descriptor);',
    ],
    [
        "uncalled bound defineProperty",
        'const define = Object.defineProperty.bind(Object, sender, "response", descriptor); void define;',
    ],
]) {
    test(`does not activate a runtime descriptor getter through ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: { response?: unknown } = {}; const descriptor = { get() { return client.projects.create(holder.request); } }; ${setup} async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, definitions, shouldFail] of [
    [
        "later getter replacing data",
        'Object.defineProperty(sender, "response", { value: "safe" }); Object.defineProperty(sender, "response", { get() { return client.projects.create(holder.request); } });',
        true,
    ],
    [
        "later defineProperties data replacing getter",
        'Object.defineProperty(sender, "response", { configurable: true, get() { return client.projects.create(holder.request); } }); Object.defineProperties(sender, { response: { value: "safe" } });',
        false,
    ],
    [
        "conditional data preserving prior getter",
        'Object.defineProperty(sender, "response", { get() { return client.projects.create(holder.request); } }); if (flag) Object.defineProperty(sender, "response", { value: "safe" });',
        true,
    ],
    [
        "conditional getter beside prior data",
        'Object.defineProperty(sender, "response", { value: "safe" }); if (flag) Object.defineProperties(sender, { response: { get() { return client.projects.create(holder.request); } } });',
        true,
    ],
    [
        "different-key data not replacing getter",
        'Object.defineProperty(sender, "response", { get() { return client.projects.create(holder.request); } }); Object.defineProperty(sender, "other", { value: "safe" });',
        true,
    ],
    [
        "different-target data not replacing getter",
        'Object.defineProperty(sender, "response", { get() { return client.projects.create(holder.request); } }); Object.defineProperty(other, "response", { value: "safe" });',
        true,
    ],
]) {
    test(`${shouldFail ? "activates" : "suppresses"} descriptor supersession for ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: { response?: unknown, other?: unknown } = {}; const other: { response?: unknown } = {}; ${definitions} async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail) {
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

for (const [label, declaration, activation, shouldFail] of [
    [
        "object method for-of",
        "const sender = { send(...holders: Holder[]) { for (const value of holders) return client.projects.create(value.request); } };",
        "sender.send(holder)",
        true,
    ],
    [
        "class method callback",
        "class Sender { send(...holders: Holder[]) { return holders.map((value) => client.projects.create(value.request)); } } const sender = new Sender();",
        "sender.send(other, holder)",
        true,
    ],
    [
        "wrong rest value",
        "const sender = { send(...holders: Holder[]) { for (const value of holders) return client.projects.create(value.request); } };",
        "sender.send(other)",
        false,
    ],
    [
        "zero rest values",
        "const sender = { send(...holders: Holder[]) { for (const value of holders) return client.projects.create(value.request); } };",
        "sender.send()",
        false,
    ],
    [
        "uncalled rest method",
        "const sender = { send(...holders: Holder[]) { for (const value of holders) return client.projects.create(value.request); } }; void sender;",
        '"safe"',
        false,
    ],
]) {
    test(`${shouldFail ? "projects" : "does not project"} synthetic rest through ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; ${declaration} holder.request = body as any; return ${activation}; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail) {
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

for (const [label, write, shouldFail] of [
    ["conditional safe alias overwrite", 'if (flag) alias.sender = { response: "safe" };', true],
    [
        "reassigned alias writing another receiver",
        'alias = other; alias.sender = { response: "safe" };',
        true,
    ],
    [
        "conditional receiver alias safe overwrite",
        'const maybe = flag ? box : other; maybe.sender = { response: "safe" };',
        true,
    ],
]) {
    test(`${shouldFail ? "preserves" : "suppresses"} getter provenance for ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const getterSender = { get response() { return client.projects.create(holder.request); } }; const box = { sender: getterSender }; const other = { sender: { response: "other" } }; let alias = box; ${write} async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return box.sender.response; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

test("fails closed when synthetic rest iteration exceeds the work cap", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: Holder[]) { for (const value of holders) return client.projects.create(value.request); } holder.request = body as any; return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 32, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis (?:work )?limit exceeded.*max 1/i);
    });
});

test("fails closed when descriptor alias expansion exceeds the work cap", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: { response?: unknown } = {}; const descriptor = { get: () => client.projects.create(holder.request) }; Object.defineProperty(sender, "response", descriptor); return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 32, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis (?:work )?limit exceeded.*max 1/i);
    });
});

test("fails closed when member-alias precision exceeds the work cap", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const getterSender = { get response() { return client.projects.create(holder.request); } }; const box = { sender: getterSender }; const other = { sender: { response: "other" } }; const alias = flag ? box : other; alias.sender = { response: "safe" }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return box.sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 32, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis (?:work )?limit exceeded.*max 1/i);
    });
});

for (const [label, definition] of [
    ["wrong descriptor target", 'Object.defineProperty(other, "response", descriptor);'],
    ["wrong descriptor key", 'Object.defineProperty(sender, "other", descriptor);'],
]) {
    test(`does not activate a runtime getter for ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: { response?: unknown, other?: unknown } = {}; const other: { response?: unknown } = {}; const descriptor = { get() { return client.projects.create(holder.request); } }; ${definition} async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

test("does not interpret an external descriptor as a source-backed getter", async () => {
    const source =
        generatedImports +
        'import { descriptor } from "./external.js";\nexport function run() { const sender: { response?: unknown } = {}; Object.defineProperty(sender, "response", descriptor); return sender.response; }\n';
    await withFixture(source, async (root) => {
        await writeFile(
            path.join(root, "cli/src/external.ts"),
            "export declare const descriptor: PropertyDescriptor;\n",
        );
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("preserves a getter when a cyclic alias cannot prove the overwrite receiver", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const getterSender = { get response() { return client.projects.create(holder.request); } }; const box = { sender: getterSender }; let alias: typeof box | undefined; alias = alias; if (alias) alias.sender = { response: "safe" }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return box.sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects an exact synthetic rest element through Array.at", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: [Holder]) { return client.projects.create(holders.at(0)!.request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects synthetic rest through filter map and exact Array.at", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const safe: Holder = { request: { workspaceId: "safe" } }; const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: [Holder, Holder]) { return client.projects.create(holders.filter(() => true).map((value) => value).at(1)!.request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(safe, holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects synthetic rest through a for-in key lookup", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: [Holder]) { for (const key in holders) return client.projects.create(holders[key]!.request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("activates an enumerable runtime descriptor getter through Object.values", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: Record<string, unknown> = {}; Object.defineProperty(sender, "response", { enumerable: true, get() { return client.projects.create(holder.request); } }); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return Object.values(sender); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, enumerable] of [
    ["omitted", ""],
    ["false", "enumerable: false,"],
]) {
    test(`keeps an ${label} enumerable runtime getter inert through Object.values`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: Record<string, unknown> = {}; Object.defineProperty(sender, "response", { ${enumerable} get() { return client.projects.create(holder.request); } }); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return Object.values(sender); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

test("retains a synchronous synthetic rest callback that mutates request state", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function mutate(...holders: [Holder]) { holders.forEach((value) => { value.request = body as any; }); } mutate(holder); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects a synchronous rest callback mutation to the rest boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: [Holder]) { holders.forEach((value) => { value.request = body as any; }); return client.projects.create(holders.at(0)!.request); } return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not carry a runtime descriptor getter onto a rebound allocation", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; let sender: { response?: unknown } = {}; const old = sender; Object.defineProperty(sender, "response", { configurable: true, get() { return client.projects.create(holder.request); } }); sender = { response: "safe" }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; void old; return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not use a throwing non-configurable descriptor replacement as safe proof", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: { response?: unknown } = {}; Object.defineProperty(sender, "response", { get() { return client.projects.create(holder.request); } }); try { Object.defineProperty(sender, "response", { value: "safe" }); } catch {} async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, call, shouldFail] of [
    ["negative exact index", "send(safe, holder)", true],
    ["wrong exact index", "send(holder, safe)", false],
    ["zero values", "send()", false],
]) {
    test(`${shouldFail ? "projects" : "does not project"} synthetic rest through ${label} Array.at`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const safe: Holder = { request: { workspaceId: "safe" } }; function send(...holders: Holder[]) { const selected = holders.at(-1); return selected ? client.projects.create(selected.request) : undefined; } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return ${call}; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail) {
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

test("fails closed for an unresolved synthetic rest Array.at index", async () => {
    const source =
        generatedImports +
        "interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, holder: Holder, index: number) { function send(...holders: Holder[]) { const selected = holders.at(index); return selected ? client.projects.create(selected.request) : undefined; } return send(holder); }\n";
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(
            result.failures.join("\n"),
            /could not statically resolve synthetic rest.*at/i,
        );
    });
});

test("fails closed for an unresolved synthetic rest derived method", async () => {
    const source =
        generatedImports +
        "interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, holder: Holder) { function send(...holders: Holder[]) { return client.projects.create(holders.reverse().at(0)!.request); } return send(holder); }\n";
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(
            result.failures.join("\n"),
            /could not statically resolve synthetic rest derived method reverse/i,
        );
    });
});

for (const [label, consume] of [
    ["Object.entries", "Object.entries(sender)"],
    ["Object.assign", "Object.assign({}, sender)"],
    ["object spread", "({ ...sender })"],
    ["object rest", "((({ ...copy }) => copy)(sender))"],
]) {
    test(`activates an enumerable runtime descriptor getter through ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: Record<string, unknown> = {}; Object.defineProperty(sender, "response", { enumerable: true, get() { return client.projects.create(holder.request); } }); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return ${consume}; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

test("keeps a conditionally enumerable runtime descriptor getter conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: Record<string, unknown> = {}; Object.defineProperty(sender, "response", { enumerable: flag, get() { return client.projects.create(holder.request); } }); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return Object.values(sender); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("retains a helper-mediated synthetic rest callback mutation", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function write(value: Holder) { value.request = body as any; } function mutate(...holders: [Holder]) { holders.forEach((value) => write(value)); } mutate(holder); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, callback] of [
    ["safe mutation", '(value: Holder) => { value.request = { workspaceId: "safe" }; }'],
    [
        "async-late mutation",
        "async (value: Holder) => { await Promise.resolve(); value.request = body as any; }",
    ],
]) {
    test(`keeps ${label} through a synthetic rest callback inert`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function mutate(...holders: [Holder]) { holders.forEach(${callback}); } mutate(holder); return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

test("retains a runtime descriptor getter through its old allocation alias", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; let sender: { response?: unknown } = {}; const old = sender; Object.defineProperty(sender, "response", { configurable: true, get() { return client.projects.create(holder.request); } }); sender = { response: "safe" }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return old.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("keeps a conditional runtime descriptor receiver rebind conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; let sender: { response?: unknown } = {}; Object.defineProperty(sender, "response", { configurable: true, get() { return client.projects.create(holder.request); } }); if (flag) sender = { response: "safe" }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("lets a configurable safe getter replace an unsafe getter", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: { response?: unknown } = {}; Object.defineProperty(sender, "response", { configurable: true, get() { return client.projects.create(holder.request); } }); Object.defineProperty(sender, "response", { get() { return "safe"; } }); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps an unsafe getter when a non-configurable getter replacement throws", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: { response?: unknown } = {}; Object.defineProperty(sender, "response", { get() { return client.projects.create(holder.request); } }); try { Object.defineProperty(sender, "response", { get() { return "safe"; } }); } catch {} async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("locks production consumer-cast analysis below the correction headroom ceiling", async () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
    assert.equal(result.analysisStats.exhausted, false);
    assert.ok(result.analysisStats.work <= 8_500, `work ${result.analysisStats.work} > 8500`);
});

test("keeps a cyclic runtime descriptor receiver alias conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: { response?: unknown } = {}; let alias = sender; alias = flag ? alias : sender; Object.defineProperty(alias, "response", { get() { return client.projects.create(holder.request); } }); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects a materialized synthetic-rest map alias through Array.at", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: [Holder]) { const derived = holders.map((value) => value); return client.projects.create(derived.at(0)!.request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects a materialized synthetic-rest map alias through for-in", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: [Holder]) { const derived = holders.map((value) => value); for (const key in derived) return client.projects.create(derived[key]!.request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("keeps conditional materialized synthetic-rest aliases conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: [Holder]) { const mapped = holders.map((value) => value); const derived = flag ? mapped : holders; return client.projects.create(derived.at(0)!.request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("keeps a cyclic materialized synthetic-rest alias conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: [Holder]) { let derived = holders.map((value) => value); derived = flag ? derived : holders; return client.projects.create(derived.at(0)!.request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("keeps a cyclic runtime descriptor source conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: { response?: unknown } = {}; let descriptor = { get() { return client.projects.create(holder.request); } }; descriptor = flag ? descriptor : { get() { return client.projects.create({ workspaceId: "safe" }); } }; Object.defineProperty(sender, "response", descriptor); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(
            result.failures.join("\n"),
            /could not statically resolve (?:cyclic )?runtime descriptor/i,
        );
    });
});

test("fails closed when a materialized synthetic-rest alias exceeds the work cap", async () => {
    const source =
        generatedImports +
        "interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, holder: Holder) { function send(...holders: [Holder]) { const derived = holders.map((value) => value); return client.projects.create(derived.at(0)!.request); } return send(holder); }\n";
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 32, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis (?:work )?limit exceeded.*max 1/i);
    });
});

for (const [label, descriptor, shouldFail] of [
    [
        "descriptor GetAccessorDeclaration",
        "{ get get() { return () => client.projects.create(holder.request); } }",
        true,
    ],
    [
        "spread descriptor getter",
        "(() => { const base = { get() { return client.projects.create(holder.request); } }; return { ...base }; })()",
        true,
    ],
    ["noncallable descriptor get", '{ get: "not callable" }', false],
]) {
    test(`${shouldFail ? "activates" : "keeps inert"} ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: { response?: unknown } = {}; const descriptor = ${descriptor}; Object.defineProperty(sender, "response", descriptor); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, callback] of [
    [
        "local callback alias",
        "(value: Holder) => { const alias = value; alias.request = body as any; }",
    ],
    [
        "destructured callback parameter",
        "({ request }: Holder) => { request.workspaceId = body as any; }",
    ],
]) {
    test(`retains a synchronous synthetic-rest mutation through ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: [Holder]) { holders.forEach(${callback}); return client.projects.create(holders.at(0)!.request); } return send(holder); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

test("retains a synchronous mutation through a derived synthetic-rest callback receiver", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: [Holder]) { holders.map((value) => value).forEach((value) => { value.request = body as any; }); return client.projects.create(holders.at(0)!.request); } return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not project a synthetic-rest callback alias onto the wrong receiver", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "safe" } }; function send(...holders: [Holder]) { holders.forEach(() => { const alias = other; alias.request = body as any; }); return client.projects.create(holders.at(0)!.request); } return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps an async-late derived synthetic-rest callback mutation inert", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: [Holder]) { holders.map((value) => value).forEach(async (value) => { await Promise.resolve(); value.request = body as any; }); return client.projects.create(holders.at(0)!.request); } return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("inherits a getter when a partial descriptor makes it enumerable", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: Record<string, unknown> = {}; Object.defineProperty(sender, "0", { configurable: true, enumerable: false, get() { return client.projects.create(holder.request); } }); Object.defineProperty(sender, "0", { enumerable: true }); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return Object.values(sender); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("suppresses enumeration after a partial descriptor makes a getter non-enumerable", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: Record<string, unknown> = {}; Object.defineProperty(sender, "0", { configurable: true, enumerable: true, get() { return client.projects.create(holder.request); } }); Object.defineProperty(sender, "0", { enumerable: false }); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return Object.values(sender); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps a conditional partial descriptor redefinition conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: Record<string, unknown> = {}; Object.defineProperty(sender, "0", { configurable: true, enumerable: true, get() { return client.projects.create(holder.request); } }); if (flag) Object.defineProperty(sender, "0", { enumerable: false }); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return Object.values(sender); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, replacement, shouldFail] of [
    ["configurable data replacement", '{ value: "safe" }', false],
    [
        "configurable getter replacement",
        "{ get() { return client.projects.create(holder.request); } }",
        true,
    ],
    ["throwing non-configurable data replacement", '{ value: "safe" }', true],
]) {
    test(`${label} controls numeric array getter iteration`, async () => {
        const configurable = label.startsWith("configurable") ? "configurable: true," : "";
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const values: unknown[] = []; Object.defineProperty(values, "0", { ${configurable} enumerable: true, get() { return client.projects.create(holder.request); } }); try { Object.defineProperty(values, "0", ${replacement}); } catch {} async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; const [first] = values; return first; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, request, shouldFail] of [
    ["unsafe", "body as any", true],
    ["safe", '{ workspaceId: "safe" }', false],
]) {
    test(`keeps ${label} request-boundary tracing through an ordinary declaration-file fluent chain`, async () => {
        const source =
            generatedImports +
            `import { fluent } from "fluent-fixture";\nexport function run(body: unknown) { return fluent.step().submit(${request}); }\n`;
        await withFixture(source, async (root) => {
            await mkdir(path.join(root, "node_modules/fluent-fixture"), { recursive: true });
            await writeFile(
                path.join(root, "node_modules/fluent-fixture/package.json"),
                `${JSON.stringify({ name: "fluent-fixture", types: "index.d.ts" })}\n`,
            );
            await writeFile(
                path.join(root, "node_modules/fluent-fixture/index.d.ts"),
                'import type { ClockifyApi } from "clockify-sdk-ts-115/requests";\nexport interface Fluent { step(): Fluent; submit(request: ClockifyApi.CreateProjectsRequest): unknown; }\nexport const fluent: Fluent;\n',
            );
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail) {
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

for (const [label, index, shouldFail] of [
    ["exact index", "0", true],
    ["wrong index", "1", false],
    ["out-of-range index", "9", false],
]) {
    test(`${shouldFail ? "projects" : "does not project"} a materialized synthetic-rest alias through ${label} bracket access`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const safe: Holder = { request: { workspaceId: "safe" } }; function send(...holders: Holder[]) { const derived = holders.map((value) => value); const selected = derived[${index}]; return selected ? client.projects.create(selected.request) : undefined; } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(holder, safe); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("keeps conditional materialized synthetic-rest bracket aliases conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: [Holder]) { const mapped = holders.map((value) => value); const derived = flag ? mapped : holders; return client.projects.create(derived[0]!.request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, callback, shouldFail] of [
    [
        "nested object binding",
        "({ holder: value }: { holder: Holder }) => { value.request = body as any; }",
        true,
    ],
    ["nested array binding", "([value]: [Holder]) => { value.request = body as any; }", true],
    [
        "nested safe binding",
        '({ holder: value }: { holder: Holder }) => { value.request = { workspaceId: "safe" }; }',
        false,
    ],
    [
        "nested async-late binding",
        "async ({ holder: value }: { holder: Holder }) => { await Promise.resolve(); value.request = body as any; }",
        false,
    ],
]) {
    test(`${shouldFail ? "retains" : "keeps inert"} ${label} rest callback mutation`, async () => {
        const array = label.includes("array") ? "[[holder]]" : "[{ holder }]";
        const parameter = label.includes("array") ? "[Holder]" : "{ holder: Holder }";
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: ${parameter}[]) { holders.forEach(${callback}); } send(...${array}); return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, mutation, shouldFail] of [
    ["unsafe exact element overwrite", "mapped[0] = { request: body as any };", true],
    ["safe exact element overwrite", 'mapped[0] = { request: { workspaceId: "safe" } };', false],
    ["unsafe exact splice", "mapped.splice(0, 1, { request: body as any });", true],
]) {
    test(`${label} controls materialized derived-rest reads`, async () => {
        const initial = label.startsWith("safe") ? "{ request: body as any }" : "holder";
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function send(...holders: Holder[]) { const mapped = holders.map((value) => value); ${mutation} return client.projects.create(mapped.at(0)!.request); } return send(${initial}); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("fails closed for an unresolved derived-rest splice index", async () => {
    const source =
        generatedImports +
        "interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, holder: Holder, index: number) { function send(...holders: Holder[]) { const mapped = holders.map((value) => value); mapped.splice(index, 1); return client.projects.create(mapped.at(0)!.request); } return send(holder); }\n";
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(
            result.failures.join("\n"),
            /could not statically resolve synthetic rest.*splice/i,
        );
    });
});

for (const [label, read] of [
    ["exact bracket", "return client.projects.create(mapped[0]!.request);"],
    [
        "for-in",
        "for (const index in mapped) return client.projects.create(mapped[index]!.request);",
    ],
    [
        "array destructuring",
        "const [first] = mapped; return client.projects.create(first.request);",
    ],
    [
        "array-rest destructuring",
        "const [...copy] = mapped; return client.projects.create(copy[0]!.request);",
    ],
]) {
    test(`observes a later derived-rest element write through ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown, holder: Holder) { function send(...holders: Holder[]) { const mapped = holders.map((value) => value); mapped[0] = { request: body as any }; ${read} } return send(holder); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

test("retains both branches of a conditional later derived-rest element write", async () => {
    const source =
        generatedImports +
        "interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown, holder: Holder, flag: boolean) { function send(...holders: Holder[]) { const mapped = holders.map((value) => value); if (flag) mapped[0] = { request: body as any }; return client.projects.create(mapped[0]!.request); } return send(holder); }\n";
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("observes an aliased later derived-rest element write through for-in", async () => {
    const source =
        generatedImports +
        "interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown, holder: Holder) { function send(...holders: Holder[]) { const mapped = holders.map((value) => value); const bad: Holder = { request: body as any }; mapped[0] = bad; for (const key in mapped) return client.projects.create(mapped[key]!.request); } return send(holder); }\n";
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("lets a safe aliased later element overwrite suppress an unsafe derived-rest value", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: body as any }; function send(...holders: Holder[]) { const mapped = holders.map((value) => value); const safe: Holder = { request: { workspaceId: "safe" } }; mapped[0] = safe; for (const key in mapped) return client.projects.create(mapped[key]!.request); } return send(holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("retains a conditional aliased later element write through derived-rest for-in", async () => {
    const source =
        generatedImports +
        "interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown, holder: Holder, flag: boolean) { function send(...holders: Holder[]) { const mapped = holders.map((value) => value); const bad: Holder = { request: body as any }; if (flag) mapped[0] = bad; for (const key in mapped) return client.projects.create(mapped[key]!.request); } return send(holder); }\n";
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, writeIndex, read] of [
    ["wrong index", 1, "mapped[0]!.request"],
    ["out-of-range index", 9, "mapped.at(0)!.request"],
]) {
    test(`does not project an aliased ${label} derived-rest element write`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown, holder: Holder) { function send(...holders: Holder[]) { const mapped = holders.map((value) => value); const bad: Holder = { request: body as any }; mapped[${writeIndex}] = bad; return client.projects.create(${read}); } return send(holder); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

test("fails closed when aliased derived-rest for-in fallback exceeds the work cap", async () => {
    const source =
        generatedImports +
        "interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown, holder: Holder) { function send(...holders: Holder[]) { const mapped = holders.map((value) => value); const bad: Holder = { request: body as any }; mapped[0] = bad; for (const key in mapped) return client.projects.create(mapped[key]!.request); } return send(holder); }\n";
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 32, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis (?:work )?limit exceeded.*max 1/i);
    });
});

for (const [label, firstConfigurable, replacement, shouldFail] of [
    ["configurable writable true conversion", true, "{ writable: true }", false],
    ["configurable writable false conversion", true, "{ writable: false }", false],
    ["non-configurable writable conversion", false, "{ writable: true }", true],
    [
        "later getter after writable conversion",
        true,
        '{ writable: true }; Object.defineProperty(sender, "response", { get() { return client.projects.create(holder.request); } }',
        true,
    ],
]) {
    test(`${label} controls runtime descriptor activation`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: { response?: unknown } = {}; Object.defineProperty(sender, "response", { configurable: ${firstConfigurable}, enumerable: true, get() { return client.projects.create(holder.request); } }); try { Object.defineProperty(sender, "response", ${replacement}); } catch {} async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, source] of [
    [
        "synthetic rest derived paths",
        "interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, holder: Holder) { function send(...holders: [Holder]) { return client.projects.create(holders.map((value) => value).at(0)!.request); } return send(holder); }\n",
    ],
    [
        "synthetic rest bracket derived paths",
        "interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, holder: Holder) { function send(...holders: [Holder]) { const mapped = holders.map((value) => value); return client.projects.create(mapped[0]!.request); } return send(holder); }\n",
    ],
    [
        "enumerable runtime descriptors",
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, holder: Holder) { const sender = {}; Object.defineProperty(sender, "response", { enumerable: true, get() { return client.projects.create(holder.request); } }); return Object.values(sender); }\n',
    ],
    [
        "synthetic rest callback effects",
        "interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, body: unknown, holder: Holder) { function send(...holders: [Holder]) { holders.forEach((value) => { value.request = body as any; }); return client.projects.create(holders.at(0)!.request); } return send(holder); }\n",
    ],
    [
        "runtime descriptor receiver origins",
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, holder: Holder) { let sender: { response?: unknown } = {}; Object.defineProperty(sender, "response", { get() { return client.projects.create(holder.request); } }); return sender.response; }\n',
    ],
]) {
    test(`fails closed when ${label} exceed the work cap`, async () => {
        await withFixture(generatedImports + source, async (root) => {
            const result = await validateConsumerCastGovernance({
                root,
                contract: zeroContract,
                analysisLimits: { maxAlternatives: 32, maxInvocations: 256, maxWork: 1 },
            });
            assert.match(result.failures.join("\n"), /analysis (?:work )?limit exceeded.*max 1/i);
        });
    });
}

for (const [label, call, shouldFail] of [
    ["static spread", "send(...([other, holder] as const))", true],
    ["wrong indexed argument", "send(holder, other)", false],
    ["zero arguments", "send()", false],
]) {
    test(`${shouldFail ? "projects" : "does not project"} a ${label} through a true rest parameter`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; function send(...values: Holder[]) { return values[1] ? client.projects.create(values[1].request) : undefined; } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return ${call}; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail) {
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

test("fails closed when true rest parameter spread alternatives exceed the cap", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, flag: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; function send(...values: Holder[]) { return values[0] && client.projects.create(values[0].request); } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; const args = flag ? [holder] : [other]; return send(...args); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 10_000 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded.*max 1/i);
    });
});

test("fails closed when binding-parameter projection exceeds the work cap", async () => {
    const source =
        generatedImports +
        "interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport function run(client: FixtureClient, holder: Holder) { const sender = { send({ request }: Holder) { return client.projects.create(request); } }; return sender.send(holder); }\n";
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded \(work; max 1\)/i);
    });
});

test("does not substitute an unrelated object into an active method boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; const sender = { send(h: Holder) { return client.projects.create(h.request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.send(other); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, declaration, invocation] of [
    [
        "object this receiver",
        'const initial: ClockifyApi.CreateProjectsRequest = { workspaceId: "safe" }; const sender = { request: initial, send() { return client.projects.create(this.request); } };',
        "sender.send()",
    ],
    [
        "class this receiver",
        'class Sender { request: ClockifyApi.CreateProjectsRequest = { workspaceId: "safe" }; send() { return client.projects.create(this.request); } } const sender = new Sender();',
        "sender.send()",
    ],
    [
        "aliased method call",
        'const initial: ClockifyApi.CreateProjectsRequest = { workspaceId: "safe" }; const sender = { request: initial, send() { return client.projects.create(this.request); } }; const send = sender.send;',
        "send.call(sender)",
    ],
    [
        "method apply",
        'const initial: ClockifyApi.CreateProjectsRequest = { workspaceId: "safe" }; const sender = { request: initial, send() { return client.projects.create(this.request); } };',
        "sender.send.apply(sender, [])",
    ],
    [
        "method bind invocation",
        'const initial: ClockifyApi.CreateProjectsRequest = { workspaceId: "safe" }; const sender = { request: initial, send() { return client.projects.create(this.request); } };',
        "sender.send.bind(sender)()",
    ],
]) {
    test(`substitutes ${label} into an active boundary`, async () => {
        const source =
            generatedImports +
            `export async function run(client: FixtureClient, body: unknown) { ${declaration} async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { sender.request = body as any; }); await pending; return ${invocation}; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

test("does not substitute the wrong this receiver into an active method boundary", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, body: unknown) { const initial: ClockifyApi.CreateProjectsRequest = { workspaceId: "safe" }; const otherInitial: ClockifyApi.CreateProjectsRequest = { workspaceId: "other" }; const sender = { request: initial, send() { return client.projects.create(this.request); } }; const other = { request: otherInitial, send: sender.send }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { sender.request = body as any; }); await pending; return sender.send.call(other); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, tail, shouldFail] of [
    ["delayed bound method invocation", "return bound();", true],
    ["uncalled bound method", "void bound;", false],
]) {
    test(`${shouldFail ? "substitutes" : "does not activate"} a ${label}`, async () => {
        const source =
            generatedImports +
            `export async function run(client: FixtureClient, body: unknown) { const initial: ClockifyApi.CreateProjectsRequest = { workspaceId: "safe" }; const sender = { request: initial, send() { return client.projects.create(this.request); } }; const bound = sender.send.bind(sender); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { sender.request = body as any; }); await pending; ${tail} }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail) {
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

test("projects an awaited completion to an active object getter boundary read", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects an awaited completion to an active destructured getter boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; const { response } = sender; return response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects an awaited completion through getter destructuring assignment", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; let response: unknown; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; ({ response } = sender); return response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects an awaited completion through a destructured getter parameter", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; function read({ response }: typeof sender) { return response; } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return read(sender); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects an awaited completion through a for-of getter binding", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; for (const { response } of [sender]) { return response; } }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects an awaited completion through Reflect.get.call getter access", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return Reflect.get.call(Reflect, sender, "response"); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const method of ["values", "entries"]) {
    test(`projects an awaited completion through Object.${method} getter enumeration`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return Object.${method}(sender); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

test("activates a getter through a delayed bound Object.values call", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; const enumerate = Object.values.bind(Object, sender); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return enumerate(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("activates a getter through Reflect.get apply", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return Reflect.get.apply(undefined, [sender, "response"]); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, setup, activation] of [
    ["direct", "", 'Reflect.get(target, "response", receiver)'],
    ["call", "", 'Reflect.get.call(undefined, target, "response", receiver)'],
    ["apply", "", 'Reflect.get.apply(undefined, [target, "response", receiver])'],
    ["immediate bind", "", 'Reflect.get.bind(undefined, target, "response", receiver)()'],
    [
        "delayed bind",
        'const read = Reflect.get.bind(undefined, target, "response", receiver);',
        "read()",
    ],
    [
        "prebound target",
        "const read = Reflect.get.bind(undefined, target);",
        'read("response", receiver)',
    ],
]) {
    test(`uses the exact Reflect.get ${label} receiver for getter activation`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const safe: Holder = { request: { workspaceId: "safe" } }; const receiver: Holder = { request: { workspaceId: "other" } }; const target = { request: safe.request, get response() { return client.projects.create(this.request); } }; ${setup} async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { receiver.request = body as any; }); await pending; return ${activation}; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

for (const [label, setup, activation] of [
    [
        "shadowed Reflect",
        'const Reflect = { get(_target: unknown, _key: string) { return "safe"; } };',
        'Reflect.get(sender, "response")',
    ],
    [
        "overwritten alias",
        'let read = Reflect.get; read = () => "safe";',
        'read(sender, "response")',
    ],
    [
        "uncalled bound getter",
        'const read = Reflect.get.bind(undefined, sender, "response");',
        "read",
    ],
]) {
    test(`does not activate a getter through a ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; ${setup} async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return ${activation}; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

for (const [method, forms] of [
    [
        "values",
        [
            "const op = Object.values; return op(sender);",
            "return Object.values.call(Object, sender);",
            "return Object.values.apply(Object, [sender]);",
            "return Object.values.bind(Object, sender)();",
        ],
    ],
    [
        "entries",
        [
            "const op = Object.entries; return op(sender);",
            "return Object.entries.call(Object, sender);",
            "return Object.entries.apply(Object, [sender]);",
            "return Object.entries.bind(Object, sender)();",
        ],
    ],
    [
        "assign",
        [
            "const op = Object.assign; return op({}, sender);",
            "return Object.assign.call(Object, {}, sender);",
            "return Object.assign.apply(Object, [{}, sender]);",
            "return Object.assign.bind(Object, {}, sender)();",
        ],
    ],
]) {
    for (const [index, activation] of forms.entries()) {
        test(`activates a getter through Object.${method} normalized form ${index + 1}`, async () => {
            const source =
                generatedImports +
                `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; ${activation} }\n`;
            await withFixture(source, async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            });
        });
    }
}

for (const [label, setup, activation] of [
    [
        "overwritten alias",
        "let op = Object.values; op = (_value: unknown) => [];",
        "return op(sender);",
    ],
    ["uncalled bind", "const op = Object.values.bind(Object, sender);", "return op;"],
]) {
    test(`does not activate a getter through an ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; ${setup} async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; ${activation} }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

test("projects a destructured getter this receiver to its concrete source", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { holder, get response() { return client.projects.create(this.holder.request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; const { response } = sender; return response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("activates a concrete local getter hidden by an apparent interface type", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\ninterface View { readonly response: unknown }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender: View = { get response() { return client.projects.create(holder.request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; const copy = { ...sender }; void copy; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not activate a stale getter after a definite receiver rebind", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; let sender: { readonly response: unknown } = { get response() { return client.projects.create(holder.request); } }; sender = { response: "safe" }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; const copy = { ...sender }; void copy; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps a getter reachable through a conditional receiver rebind", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, safe: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; let sender: { readonly response: unknown } = { get response() { return client.projects.create(holder.request); } }; if (safe) sender = { response: "safe" }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; const copy = { ...sender }; void copy; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("reads a factory getter hidden by an annotated return type", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\ninterface View { readonly response: unknown }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function make(): View { return { get response() { return client.projects.create(holder.request); } }; } const sender = make(); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("activates a getter in a nested object binding declaration", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { nested: { get response() { return client.projects.create(holder.request); } } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; const { nested: { response } } = sender; return response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, activation] of [
    ["assignment", "let response: unknown; ({ nested: { response } } = sender); return response;"],
    [
        "parameter",
        "function read({ nested: { response } }: typeof sender) { return response; } return read(sender);",
    ],
    ["for-of", "for (const { nested: { response } } of [sender]) { return response; }"],
    [
        "defaulted declaration",
        "const { missing: { response } = sender.nested } = { missing: undefined }; return response;",
    ],
]) {
    test(`activates a getter in a nested object binding ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { nested: { get response() { return client.projects.create(holder.request); } } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; ${activation} }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

test("activates a getter in a nested array binding declaration", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = [[{ get response() { return client.projects.create(holder.request); } }]]; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; const [[{ response }]] = sender; return response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, activation] of [
    ["object rest", "const { ...copy } = sender; void copy;"],
    ["object spread", "const copy = { ...sender }; void copy;"],
    ["Object.assign", "const copy = Object.assign({}, sender); void copy;"],
    ["Reflect.get", 'void Reflect.get(sender, "response");'],
]) {
    test(`projects ${label} getter this receiver to its concrete source`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { holder, get response() { return client.projects.create(this.holder.request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; ${activation} }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

for (const [label, activation] of [
    ["object rest", "const { ...copy } = sender; void copy;"],
    ["object spread", "const copy = { ...sender }; void copy;"],
    ["Object.assign", "const copy = Object.assign({}, sender); void copy;"],
    ["Object.values", "void Object.values(sender);"],
    ["Object.entries", "void Object.entries(sender);"],
]) {
    test(`does not enumerate a class prototype getter through ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Sender { get response() { return client.projects.create(holder.request); } } const sender = new Sender(); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; ${activation} }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, activation] of [
    ["named destructuring", "const { response } = sender; return response;"],
    ["Reflect.get", 'return Reflect.get(sender, "response");'],
]) {
    test(`reads an inherited class getter through ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Sender { get response() { return client.projects.create(holder.request); } } const sender = new Sender(); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; ${activation} }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

for (const [label, activation] of [
    ["named destructuring", "const { response } = other; void response;"],
    ["object rest", "const { ...copy } = other; void copy;"],
    ["object spread", "const copy = { ...other }; void copy;"],
    ["Object.assign", "const copy = Object.assign({}, other); void copy;"],
    ["Reflect.get", 'void Reflect.get(other, "response");'],
]) {
    test(`does not project ${label} getter activation across receivers`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const otherHolder: Holder = { request: { workspaceId: "other" } }; function make(value: Holder) { return { holder: value, get response() { return client.projects.create(this.holder.request); } }; } const sender = make(holder); const other = make(otherHolder); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; ${activation} void sender; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, activation] of [
    [
        "computed-known destructuring",
        'const key = "response" as const; const { [key]: response } = sender; void response;',
    ],
    ["object rest destructuring", "const { ignored, ...rest } = sender; void rest;"],
    ["object spread", "const copy = { ...sender }; void copy;"],
    [
        "Object.assign source copying",
        "const copy = Object.assign({}, { safe: true }, sender); void copy;",
    ],
    ["Reflect.get exact-key access", 'void Reflect.get(sender, "response");'],
]) {
    test(`projects an awaited completion to ${label} of a getter boundary`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { ignored: true, get response() { return client.projects.create(holder.request); } }; const alias = sender; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; ${activation.replaceAll("sender", "alias")} }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

test("projects an awaited completion through a called helper containing implicit getter activation", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; function copy() { return { ...sender }; } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return copy(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, declarations, activation] of [
    [
        "shadow Object.assign",
        "const Object = { assign<T>(target: T, _source: unknown) { return target; } };",
        "Object.assign({}, sender);",
    ],
    [
        "shadow Reflect.get",
        "const Reflect = { get(_target: unknown, _key: string) { return undefined; } };",
        'Reflect.get(sender, "response");',
    ],
    [
        "shadow Object.values",
        "const Object = { values(_target: unknown) { return []; } };",
        "Object.values(sender);",
    ],
    [
        "shadow Reflect.get.call",
        "const Reflect = { get: { call(_self: unknown, _target: unknown, _key: string) { return undefined; } } };",
        'Reflect.get.call(Reflect, sender, "response");',
    ],
]) {
    test(`does not activate a getter through ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; ${declarations} async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; ${activation} }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

test("does not activate an implicit getter operation inside an uncalled helper", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; function copy() { return { ...sender }; } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; void copy; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, operation] of [
    ["object spread before awaited completion", "const early = { ...sender }; void early;"],
    [
        "statically skipped Object.assign source copy",
        "if (false) { const copy = Object.assign({}, sender); void copy; }",
    ],
]) {
    test(`does not project through ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; ${operation} async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

test("does not invent implicit getter activations for an unresolved external source", async () => {
    const source =
        generatedImports +
        'import { makeSender } from "unresolved-accessor";\ninterface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = makeSender(); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; const copy = { ...sender }; void copy; }\n';
    await withFixture(source, async (root) => {
        await writeFile(
            path.join(root, "unresolved-accessor.d.ts"),
            'declare module "unresolved-accessor" { export interface Sender { readonly response: unknown } export function makeSender(): Sender; }\n',
        );
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("projects an awaited completion to an active class getter boundary read", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Sender { get response() { return client.projects.create(holder.request); } } const sender = new Sender(); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects an awaited completion through aliased and nested getter reads", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; const alias = sender; function read() { return alias.response; } async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return read(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not project to a getter read before the awaited invocation", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; sender.response; const pending = (async () => { await Promise.resolve(); holder.request = body as any; })(); await pending; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not project to an uncalled getter boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; const pending = (async () => { await Promise.resolve(); holder.request = body as any; })(); await pending; void sender; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("projects to a conditionally active getter boundary read", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, enabled: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; if (enabled) return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not project to a statically skipped getter boundary read", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = { get response() { return client.projects.create(holder.request); } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; if (false) return sender.response; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not invoke an unresolved external accessor boundary", async () => {
    const source =
        generatedImports +
        'import { makeSender } from "unresolved-accessor";\ninterface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const sender = makeSender(); async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return sender.response; }\n';
    await withFixture(source, async (root) => {
        await writeFile(
            path.join(root, "unresolved-accessor.d.ts"),
            'declare module "unresolved-accessor" { export interface Sender { readonly response: unknown } export function makeSender(): Sender; }\n',
        );
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("allows a safe overwrite before an active module boundary helper call", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nfunction send(client: FixtureClient, holder: Holder) { return client.projects.create(holder.request); }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; holder.request = { workspaceId: "safe" }; return send(client, holder); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not invent a boundary inside an unresolved imported helper", async () => {
    const source =
        generatedImports +
        'import { send } from "unresolved-sender";\ninterface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(client, holder); }\n';
    await withFixture(source, async (root) => {
        await writeFile(
            path.join(root, "unresolved-sender.d.ts"),
            'declare module "unresolved-sender" { export function send(...args: unknown[]): unknown; }\n',
        );
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not project completion to a boundary helper called before invocation", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } function send() { return client.projects.create(holder.request); } const early = send(); const pending = invoke(() => { holder.request = body as any; }); await pending; return early; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not project completion to an uncalled local boundary helper", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } function send() { return client.projects.create(holder.request); } const pending = invoke(() => { holder.request = body as any; }); await pending; void send; return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [name, declaration, call] of [
    ["nested helpers", "function outer() { return send(); }", "outer()"],
    ["an alias", "const deliver = send;", "deliver()"],
    ["call", "", "send.call(undefined)"],
    ["apply", "", "send.apply(undefined, [])"],
    ["bind", "const deliver = send.bind(undefined);", "deliver()"],
]) {
    test(`projects completion through ${name} to an active boundary helper`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } function send() { return client.projects.create(holder.request); } ${declaration} const pending = invoke(() => { holder.request = body as any; }); await pending; return ${call}; }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

test("correlates multiple boundary helper call sites around the awaited invocation", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } function send() { return client.projects.create(holder.request); } send(); const pending = invoke(() => { holder.request = body as any; }); await pending; return send(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects a conditionally active boundary helper call conservatively", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, enabled: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } function send() { return client.projects.create(holder.request); } const pending = invoke(() => { holder.request = body as any; }); await pending; if (enabled) send(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not project a statically skipped boundary helper call", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } function send() { return client.projects.create(holder.request); } const pending = invoke(() => { holder.request = body as any; }); await pending; if (false) send(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("fails closed without unbounded recursion for a recursive boundary helper", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } function send(recur: boolean): unknown { if (recur) return send(false); return client.projects.create(holder.request); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(true); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /active boundary helper invocation \(cycle\)/i);
    });
});

test("fails closed when active boundary helper projection exceeds the depth limit", async () => {
    const helpers = Array.from(
        { length: 40 },
        (_, index) =>
            `function helper${index}() { return ${index === 39 ? "send()" : `helper${index + 1}()`}; }`,
    ).join(" ");
    const source =
        generatedImports +
        `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } function send() { return client.projects.create(holder.request); } ${helpers} const pending = invoke(() => { holder.request = body as any; }); await pending; return helper0(); }\n`;
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /active boundary helper invocation.*depth limit/i);
    });
});

test("caps active boundary helper invocation alternatives", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, enabled: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } function send() { return client.projects.create(holder.request); } const pending = invoke(() => { holder.request = body as any; }); await pending; if (enabled) send(); else send(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 10_000 },
        });
        assert.match(
            result.failures.join("\n"),
            /analysis limit exceeded.*active boundary helper invocation alternatives.*max 1/i,
        );
    });
});

test("charges active boundary helper projection to the common work cap", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } function send() { return client.projects.create(holder.request); } const pending = invoke(() => { holder.request = body as any; }); await pending; return send(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded.*work.*max 1/i);
    });
});

test("does not lift a post-suspension effect through an await after the request boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); const result = client.projects.create(holder.request); await pending; return result; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not lift an awaited Promise.all alias after the request boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = Promise.all([invoke(() => { holder.request = body as any; })]); const result = client.projects.create(holder.request); await pending; return result; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not lift an awaited property-held alias after the request boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const jobs = { pending: invoke(() => { holder.request = body as any; }) }; const result = client.projects.create(holder.request); await jobs.pending; return result; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not lift an awaited then-chain alias after the request boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }).then(() => undefined); const result = client.projects.create(holder.request); await pending; return result; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("uses a matching prior await when another matching await follows the boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; const result = client.projects.create(holder.request); await pending; return result; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("retains possible resumption at an unrelated prior await", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await Promise.resolve(); const result = client.projects.create(holder.request); await pending; return result; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not use a matching await captured by an uninvoked nested function", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); async function waitLater() { await pending; } void waitLater; return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("models a matching conditional await that can precede the request boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); if (choose) await pending; return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not match an await and request boundary on opposite branches", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); if (choose) { await pending; } else { return client.projects.create(holder.request); } return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not lift a branch-local await through an abrupt return to an outside boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); if (choose) { await pending; return client.projects.create({ workspaceId: "safe" }); } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not lift a branch-local await through an abrupt throw", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); if (choose) { await pending; throw new Error("done"); } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps an awaited else path that falls through to the outside boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); if (choose) { await pending; } else { return client.projects.create({ workspaceId: "safe" }); } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not lift an awaited nested branch whose path returns", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, first: boolean, second: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); if (first) { if (second) { await pending; return client.projects.create({ workspaceId: "safe" }); } } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not lift an awaited switch case whose path returns", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, mode: number) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); switch (mode) { case 1: await pending; return client.projects.create({ workspaceId: "safe" }); default: break; } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps an awaited switch case that falls through to the unsafe boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, mode: number) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); switch (mode) { case 1: await pending; case 2: return client.projects.create(holder.request); default: return client.projects.create({ workspaceId: "safe" }); } }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("keeps an awaited switch break path that reaches an outside boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, mode: number) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); switch (mode) { case 1: await pending; break; default: return client.projects.create({ workspaceId: "safe" }); } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not lift an awaited loop branch past continue to a later body boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); for (const item of [choose]) { if (item) { await pending; continue; } return client.projects.create(holder.request); } return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not lift an awaited loop branch past break to a later body boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); for (const item of [choose]) { if (item) { await pending; break; } return client.projects.create(holder.request); } return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps an awaited loop continue path that can reach an outside boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); for (const item of [1]) { void item; await pending; continue; } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not lift an awaited try path whose return survives finally", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); try { await pending; return client.projects.create({ workspaceId: "safe" }); } finally { void 0; } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not lift an awaited try path through an abrupt finally", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); try { await pending; } finally { return client.projects.create({ workspaceId: "safe" }); } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps an awaited try path that completes through finally", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); try { await pending; } finally { void 0; } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("keeps an awaited try return path visible to its finally boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); try { await pending; return client.projects.create({ workspaceId: "safe" }); } finally { void client.projects.create(holder.request); } }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models a possible post-suspension effect through an awaited conditional promise", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = choose ? invoke(() => { holder.request = body as any; }) : Promise.resolve(); await pending; return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not let a safe awaited alternative overwrite an unsafe completion path", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = choose ? invoke(() => { holder.request = body as any; }) : invoke(() => { holder.request = { workspaceId: "safe" }; }); await pending; return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("retains possible resumption after awaiting a reassigned promise alias", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } let pending = invoke(() => { holder.request = body as any; }); pending = Promise.resolve(); await pending; return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models completion through a property-held promise alias", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const jobs = { pending: invoke(() => { holder.request = body as any; }) }; await jobs.pending; return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("retains possible resumption after awaiting a reassigned property-held alias", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const jobs = { pending: invoke(() => { holder.request = body as any; }) }; jobs.pending = Promise.resolve(); await jobs.pending; return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models a possible completion through conditional property-held alternatives", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const jobs = { pending: Promise.resolve() }; jobs.pending = choose ? invoke(() => { holder.request = body as any; }) : Promise.resolve(); await jobs.pending; return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models completion through a destructured promise alias", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const { pending } = { pending: invoke(() => { holder.request = body as any; }) }; await pending; return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models a possible completion through conditional destructured alternatives", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const { pending } = choose ? { pending: invoke(() => { holder.request = body as any; }) } : { pending: Promise.resolve() }; await pending; return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models completion through awaited Promise.all", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } await Promise.all([invoke(() => { holder.request = body as any; }), Promise.resolve()]); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models possible completion through conditional Promise.all inputs", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } await Promise.all(choose ? [invoke(() => { holder.request = body as any; })] : [Promise.resolve()]); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models completion through awaited Promise.allSettled", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } await Promise.allSettled([invoke(() => { holder.request = body as any; }), Promise.resolve()]); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models completion through a single-input awaited Promise.race", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } await Promise.race([invoke(() => { holder.request = body as any; })]); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models Promise.race completion when every competing input never settles", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const never = new Promise<void>(() => undefined); await Promise.race([invoke(() => { holder.request = body as any; }), never]); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not complete an unrelated invocation through an empty Promise.race", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); await Promise.race([]); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not enter finally for an empty Promise.race that never settles", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); try { await Promise.race([]); } finally { return client.projects.create(holder.request); } }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not resume an unrelated invocation through an empty Promise.any", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); await Promise.any([]); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not resume an unrelated invocation through a definitely rejected await", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); await Promise.reject(new Error("stop")); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("retains rejected-await resumption at a matching finally boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); try { await Promise.reject(new Error("stop")); } finally { return client.projects.create(holder.request); } }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects rejected-await resumption to a boundary helper called in finally", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } function send() { return client.projects.create(holder.request); } void invoke(() => { holder.request = body as any; }); try { await Promise.reject(new Error("stop")); } finally { return send(); } }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects rejected-await resumption to a boundary helper called in catch", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } function send() { return client.projects.create(holder.request); } void invoke(() => { holder.request = body as any; }); try { await Promise.reject(new Error("stop")); } catch { return send(); } }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("projects rejected-await resumption to a boundary helper called after catch", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } function send() { return client.projects.create(holder.request); } void invoke(() => { holder.request = body as any; }); try { await Promise.reject(new Error("stop")); } catch { void 0; } return send(); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("resumes after a rejected await catch breaks out of its matching loop", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); for (const item of [1]) { try { await Promise.reject(new Error("stop")); } catch { break; } } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [name, control] of [
    [
        "switch break",
        'switch (1) { case 1: try { await Promise.reject(new Error("stop")); } catch { break; } }',
    ],
    [
        "labeled break",
        'outer: for (const item of [1]) { switch (item) { case 1: try { await Promise.reject(new Error("stop")); } catch { break outer; } } }',
    ],
    [
        "nested loop break",
        'for (const outer of [1]) { for (const inner of [1]) { try { await Promise.reject(new Error("stop")); } catch { break; } } }',
    ],
    [
        "normal finally preserving a catch break",
        'for (const item of [1]) { try { await Promise.reject(new Error("stop")); } catch { break; } finally { void 0; } }',
    ],
]) {
    test(`resumes after rejected await through ${name}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); ${control} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

test("resumes conservatively after a continue in a loop with unknown termination", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, active: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); while (active) { try { await Promise.reject(new Error("stop")); } catch { continue; } } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("resumes at a boundary in the next iteration after a labeled continue", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); outer: for (let index = 0; index < 2; index += 1) { if (index > 0) client.projects.create(holder.request); for (const inner of [1]) { try { await Promise.reject(new Error("stop")); } catch { continue outer; } } } }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not resume outside a statically infinite loop after continue", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); while (true) { try { await Promise.reject(new Error("stop")); } catch { continue; } } client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not treat a statically skipped break as terminating an infinite continue loop", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); while (true) { try { await Promise.reject(new Error("stop")); } catch { continue; } if (false) break; } client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not treat a break after an always-executed continue as loop termination", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); while (true) { try { await Promise.reject(new Error("stop")); } catch { continue; } break; } client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("preserves a reachable conditional break from an infinite rejected-await loop", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, stop: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); while (true) { try { await Promise.reject(new Error("stop")); } catch { if (stop) break; continue; } } client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("preserves a reachable labeled break from an infinite rejected-await loop", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, stop: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); outer: while (true) { try { await Promise.reject(new Error("stop")); } catch { if (stop) break outer; continue outer; } } client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not let a nested switch break terminate an infinite rejected-await loop", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); while (true) { try { await Promise.reject(new Error("stop")); } catch { switch (1) { case 1: break; } continue; } } client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("preserves a finally break that can override rejected-await continue", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, stop: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); while (true) { try { await Promise.reject(new Error("stop")); } catch { continue; } finally { if (stop) break; } } client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not resume when finally continue overrides a catch break", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); while (true) { try { await Promise.reject(new Error("stop")); } catch { break; } finally { continue; } } client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, finallyBody] of [
    ["a nested switch continue", "switch (1) { case 1: continue; }"],
    ["a nested infinite loop continue", "while (true) { continue; }"],
]) {
    test(`does not resume when finally contains ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); while (true) { try { await Promise.reject(new Error("stop")); } catch { break; } finally { ${finallyBody} } } client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

test("does not resume when a labeled finally block continues its loop", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); while (true) { try { await Promise.reject(new Error("stop")); } catch { break; } finally { label: { continue; } } } client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, finallyBody, shouldResume] of [
    ["labeled break", "label: { break label; }", true],
    ["labeled return", "label: { return; }", false],
    ["nested labeled continue", "first: second: { continue; }", false],
]) {
    test(`${shouldResume ? "resumes" : "does not resume"} through a ${label} in finally`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); while (true) { try { await Promise.reject(new Error("stop")); } catch { break; } finally { ${finallyBody} } } client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldResume) {
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

for (const [label, finallyBody, shouldResume] of [
    ["switch fallthrough to continue", "switch (0) { case 0: void 0; case 1: continue; }", false],
    ["switch-local break", "switch (1) { case 1: break; }", true],
    ["inner-loop break", "while (true) { break; }", true],
    ["labeled outer continue", "switch (1) { case 1: continue outer; }", false],
]) {
    test(`${shouldResume ? "resumes" : "does not resume"} through a finally ${label}`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); outer: while (true) { try { await Promise.reject(new Error("stop")); } catch { break; } finally { ${finallyBody} } } client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldResume) {
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            } else {
                assert.deepEqual(result.failures, []);
            }
        });
    });
}

test("does not resume through a break that occurs only before the rejected await", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, stop: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); while (true) { if (stop) break; try { await Promise.reject(new Error("stop")); } catch { continue; } } client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not let unreachable nested-loop breaks terminate an outer infinite loop", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); while (true) { while (true) { try { await Promise.reject(new Error("stop")); } catch { continue; } break; } break; } client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not resume after a finally return overrides a catch break", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); for (const item of [1]) { try { await Promise.reject(new Error("stop")); } catch { break; } finally { return; } } client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("retains empty Promise.any rejection resumption at a matching finally boundary", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); try { await Promise.any([]); } finally { return client.projects.create(holder.request); } }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("retains rejected-await resumption through a rethrow to an outer finally", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); try { try { await Promise.reject(new Error("stop")); } catch { throw new Error("again"); } } finally { return client.projects.create(holder.request); } }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("retains rejected-await resumption through a catch return to an outer finally", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); try { try { await Promise.reject(new Error("stop")); } catch { return client.projects.create({ workspaceId: "safe" }); } } finally { void client.projects.create(holder.request); } }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("retains a rejected-await boundary before an abrupt finally completion", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); try { await Promise.reject(new Error("stop")); } catch { void 0; } finally { void client.projects.create(holder.request); throw new Error("finally"); } }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not resume a rejected-await boundary after an abrupt finally", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); try { await Promise.reject(new Error("stop")); } catch { void 0; } finally { throw new Error("finally"); } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("retains rejected-await resumption through multiple nested finally blocks", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); try { try { await Promise.reject(new Error("stop")); } finally { void 0; } } finally { return client.projects.create(holder.request); } }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("fails closed when rejected-await unwinding exceeds the depth limit", async () => {
    let nested = 'await Promise.reject(new Error("stop"));';
    for (let index = 0; index < 29; index += 1) {
        nested = `try { ${nested} } finally { void ${index}; }`;
    }
    const source =
        generatedImports +
        `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); try { ${nested} } finally { return client.projects.create(holder.request); } }\n`;
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /rejected await unwinding.*depth limit/i);
    });
});

test("charges rejected-await unwinding to the common work cap", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); try { await Promise.reject(new Error("stop")); } finally { return client.projects.create(holder.request); } }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded.*work.*max 1/i);
    });
});

test("retains possible resumption when an unrelated rejected await is caught", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); try { await Promise.reject(new Error("stop")); } catch { void 0; } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not resume after a rejected await whose catch returns", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); try { await Promise.reject(new Error("stop")); } catch { return client.projects.create({ workspaceId: "safe" }); } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not resume after a rejected await whose catch rethrows", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); try { await Promise.reject(new Error("stop")); } catch { throw new Error("again"); } return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("retains a rejected-await boundary before its catch rethrows", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } void invoke(() => { holder.request = body as any; }); try { await Promise.reject(new Error("stop")); } catch { void client.projects.create(holder.request); throw new Error("again"); } }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("retains a possible completion through a competing Promise.race input", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } await Promise.race([invoke(() => { holder.request = body as any; }), Promise.resolve()]); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("retains a possible completion through a competing Promise.any input", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } await Promise.any([invoke(() => { holder.request = body as any; }), Promise.resolve()]); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models completion through a single-input awaited Promise.any", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } await Promise.any([invoke(() => { holder.request = body as any; })]); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models Promise.any completion when every competing input rejects", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const rejected = Promise.reject(new Error("expected")); await Promise.any([invoke(() => { holder.request = body as any; }), rejected]); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models completion through awaited Promise.resolve", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } await Promise.resolve(invoke(() => { holder.request = body as any; })); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models completion through an awaited then catch finally chain", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }).then(() => undefined).catch(() => undefined).finally(() => undefined); await pending; return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models completion through an awaited local identity wrapper", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } function identity<T>(value: T): T { return value; } await identity(invoke(() => { holder.request = body as any; })); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models completion through an awaited local async wrapper", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } async function waitFor<T>(value: Promise<T>) { await value; } await waitFor(invoke(() => { holder.request = body as any; })); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models completion through an awaited async IIFE wrapper", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } await (async <T>(value: Promise<T>) => { await value; })(invoke(() => { holder.request = body as any; })); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models completion through nested awaited local async wrappers", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } async function inner<T>(value: Promise<T>) { await value; } async function outer<T>(value: Promise<T>) { await inner(value); } await outer(invoke(() => { holder.request = body as any; })); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models completion through an aliased awaited local async wrapper", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } async function waitFor<T>(value: Promise<T>) { await value; } const wait = waitFor; await wait(invoke(() => { holder.request = body as any; })); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models possible completion through conditional local async wrappers", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } async function waitFor<T>(value: Promise<T>) { await value; } async function unrelated<T>(value: Promise<T>) { void value; await Promise.resolve(); } const wait = choose ? waitFor : unrelated; await wait(invoke(() => { holder.request = body as any; })); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not infer completion when a local async wrapper never awaits its parameter", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } async function unrelated<T>(value: Promise<T>) { void value; await Promise.resolve(); } await unrelated(invoke(() => { holder.request = body as any; })); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("fails closed for a recursive awaited local async wrapper", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } async function waitFor<T>(value: Promise<T>): Promise<void> { await waitFor(value); } await waitFor(invoke(() => { holder.request = body as any; })); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /awaited local completion.*cycle/i);
    });
});

test("fails closed when awaited local async wrappers exceed the depth limit", async () => {
    const wrappers = Array.from(
        { length: 30 },
        (_, index) =>
            `async function wait${index + 1}<T>(value: Promise<T>) { await wait${index}(value); }`,
    ).join(" ");
    const source =
        generatedImports +
        `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } async function wait0<T>(value: Promise<T>) { await value; } ${wrappers} await wait30(invoke(() => { holder.request = body as any; })); return client.projects.create(holder.request); }\n`;
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /awaited local completion.*depth limit/i);
    });
});

test("charges awaited local async wrapper tracing to the common work cap", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } async function waitFor<T>(value: Promise<T>) { await value; } await waitFor(invoke(() => { holder.request = body as any; })); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded.*work.*max 1/i);
    });
});

test("does not infer completion through an awaited external wrapper", async () => {
    const source =
        generatedImports +
        'declare function externalWrap<T>(value: Promise<T>): Promise<T>;\ninterface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } await externalWrap(invoke(() => { holder.request = body as any; })); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not infer completion from an unawaited Promise.all alias", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = Promise.all([invoke(() => { holder.request = body as any; })]); void pending; return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("fails closed for a cyclic awaited completion alias", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } let pending = invoke(() => { holder.request = body as any; }); pending = pending; await pending; return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /awaited local completion.*cycle/i);
    });
});

test("fails closed when awaited completion wrappers exceed the depth limit", async () => {
    const aliases = Array.from(
        { length: 30 },
        (_, index) => `const pending${index + 1} = pending${index};`,
    ).join(" ");
    const source =
        generatedImports +
        `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending0 = invoke(() => { holder.request = body as any; }); ${aliases} await pending30; return client.projects.create(holder.request); }\n`;
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(
            result.failures.join("\n"),
            /awaited local completion.*depth limit|governed reconstruction depth/i,
        );
    });
});

test("charges awaited completion tracing to the common work cap", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = invoke(() => { holder.request = body as any; }); await pending; return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded.*work.*max 1/i);
    });
});

test("fails closed when awaited completion alternatives exceed the cap", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => void) { await Promise.resolve(); callback(); } const pending = choose ? invoke(() => { holder.request = body as any; }) : Promise.resolve(); await pending; return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 10_000 },
        });
        assert.match(
            result.failures.join("\n"),
            /analysis limit exceeded.*conditional values.*max 1/i,
        );
    });
});

test("does not claim a post-suspension write from an unawaited async callback", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function invoke(callback: () => void) { callback(); } invoke(async () => { await Promise.resolve(); holder.request = body as any; }); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("models a pre-suspension write from an unawaited async callback", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function invoke(callback: () => void) { callback(); } invoke(async () => { holder.request = body as any; await Promise.resolve(); }); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models a completed post-suspension async callback after awaiting the chain", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; async function invoke(callback: () => Promise<void>) { await callback(); } await invoke(async () => { await Promise.resolve(); holder.request = body as any; }); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models a callback parameter invoked through native Function.call", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function invoke(callback: () => void) { callback.call(undefined); } invoke(() => { holder.request = body as any; }); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models a callback parameter invoked through native Function.apply", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function invoke(callback: () => void) { callback.apply(undefined, []); } invoke(() => { holder.request = body as any; }); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("models an immediately invoked native bind of a callback parameter", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function invoke(callback: () => void) { callback.bind(undefined)(); } invoke(() => { holder.request = body as any; }); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("dispatches an overridden Function.call member to its custom implementation", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function nominalSafe() {} Object.defineProperty(nominalSafe, "call", { value: function customCall() { holder.request = body as any; } }); nominalSafe.call(undefined); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("dispatches an overridden Function.apply member to its custom implementation", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function nominalSafe() {} Object.defineProperty(nominalSafe, "apply", { value: function customApply() { holder.request = body as any; } }); nominalSafe.apply(undefined, []); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("invokes the function returned by an overridden Function.bind member", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function nominalSafe() {} Object.defineProperty(nominalSafe, "bind", { value: function customBind() { return () => { holder.request = body as any; }; } }); nominalSafe.bind(undefined)(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not invoke the nominal target through a safe overridden Function.call", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function nominalUnsafe() { holder.request = body as any; } Object.defineProperty(nominalUnsafe, "call", { value: function customCall() { holder.request = { workspaceId: "safe" }; } }); nominalUnsafe.call(undefined); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("re-enables nominal dispatch after restoring Function.prototype.call", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function nominalUnsafe() { holder.request = body as any; } Object.defineProperty(nominalUnsafe, "call", { value: function customCall() { holder.request = { workspaceId: "safe" }; }, writable: true }); nominalUnsafe.call = Function.prototype.call; nominalUnsafe.call(undefined); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("preserves callback order across multiple local invoker parameters", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function invokeBoth(first: () => void, second: () => void) { first(); second(); } invokeBoth(() => { holder.request = body as any; }, () => { holder.request = { workspaceId: "safe" }; }); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps a conditionally invoked unsafe callback conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, condition: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; function invokeMaybe(callback: () => void, value: boolean) { if (value) callback(); } invokeMaybe(() => { holder.request = body as any; }, condition); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not claim callback effects deferred through timers or promises", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function defer(callback: () => void) { setTimeout(callback, 0); Promise.resolve().then(callback); } defer(() => { holder.request = body as any; }); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("dispatches an assigned computed call override", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function nominalSafe() {} const key = "call" as const; nominalSafe[key] = function customCall() { holder.request = body as any; }; nominalSafe[key](undefined); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("correlates a callback argument with its concrete outer invocation", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; function invoke(callback: () => void) { callback(); } function unsafeCallback() { holder.request = body as any; } function safeCallback() { holder.request = { workspaceId: "safe" }; } invoke(unsafeCallback); const boundary = client.projects.create(holder.request); invoke(safeCallback); return boundary; }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, setup, expression, shouldFail] of [
    [
        "comma chain",
        "let temp: Base = new Base();",
        "(void 0, temp = makeFresh(), void 0, temp)",
        false,
    ],
    [
        "assignment RHS sequence",
        "let temp: Base = new Base();",
        "(temp = (void 0, makeFresh()), temp)",
        false,
    ],
    [
        "unsafe last assignment",
        "let temp: Base = new Base();",
        "(temp = makeFresh(), temp = new Base(), temp)",
        true,
    ],
    [
        "executed or sibling",
        "let temp: Base = new Base();",
        "(false || (temp = makeFresh()), temp)",
        false,
    ],
    [
        "short-circuited or sibling",
        "let temp: Base = new Base();",
        "(true || (temp = makeFresh()), temp)",
        true,
    ],
    [
        "unknown or sibling",
        "let temp: Base = new Base();",
        "(choose || (temp = makeFresh()), temp)",
        true,
    ],
    [
        "selected conditional branch",
        "let temp: Base = new Base();",
        "(true ? (temp = makeFresh()) : void 0, temp)",
        false,
    ],
    [
        "unknown conditional branch",
        "let temp: Base = new Base();",
        "(choose ? (temp = makeFresh()) : void 0, temp)",
        true,
    ],
    [
        "short-circuited logical assignment",
        "let temp: Base = new Base();",
        "(temp ||= makeFresh(), temp)",
        true,
    ],
    [
        "element target",
        "const box: { value: Base } = { value: new Base() };",
        '(box["value"] = makeFresh(), box["value"])',
        false,
    ],
    [
        "element target unsafe last write",
        "const box: { value: Base } = { value: new Base() };",
        '(box["value"] = makeFresh(), box.value = new Base(), box["value"])',
        true,
    ],
]) {
    test(`${label} preserves intra-expression receiver order`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } ${setup} let source: Base = new Base(); const old = source.registry; source = ${expression}; const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(
                    result.failures.join("\n"),
                    /(as any.*CreateProjectsRequest|could not statically resolve)/i,
                );
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("fails closed when intra-expression environments exceed the alternative cap", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, choose: boolean) { class Safe {} class One { get registry() { return { Ctor: Safe }; } } class Two { get registry() { return { Ctor: Safe }; } } let temp: One | Two = new One(); const current = (choose ? (temp = new One()) : (temp = new Two()), temp).registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 10_000 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded.*max 1/i);
    });
});

test("fails closed when intra-expression environment discovery exceeds the work cap", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { class Safe {} class Fresh { get registry() { return { Ctor: Safe }; } } let temp = new Fresh(); const current = (temp = new Fresh(), temp).registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded \(work; max 1\)/i);
    });
});

test("fails closed when intra-expression sequencing exceeds the depth limit", async () => {
    let expression = "temp";
    for (let index = 0; index < 70; index += 1) expression = `(void 0, ${expression})`;
    const source =
        generatedImports +
        `export async function run(client: FixtureClient) { class Safe {} class Fresh { get registry() { return { Ctor: Safe }; } } let temp = new Fresh(); const current = (temp = new Fresh(), ${expression}).registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n`;
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /governed reconstruction depth/i);
    });
});

test("keeps cyclic intra-expression receiver aliases conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } let source: Base = new Base(); let first: Base = source; let second: Base = first; const old = source.registry; source = (first = second, second = first, first); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(
            result.failures.join("\n"),
            /(as any.*CreateProjectsRequest|could not statically resolve)/i,
        );
    });
});

test("resolves a concrete getter receiver through chained assignment results", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } let source: Base = new Base(); let first: Base = new Base(); let second: Base = new Base(); const old = source.registry; source = (first = second = makeFresh()); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, setup, expression, shouldFail] of [
    ["truthy or-assignment", "let temp: Base = new Base();", "temp ||= makeFresh()", true],
    ["truthy and-assignment", "let temp: Base = new Base();", "temp &&= makeFresh()", false],
    ["nonnull nullish-assignment", "let temp: Base = new Base();", "temp ??= makeFresh()", true],
    [
        "falsey or-assignment",
        "let temp: Base | undefined = undefined;",
        "(temp ||= makeFresh()) as Base",
        false,
    ],
    [
        "nullish nullish-assignment",
        "let temp: Base | undefined = undefined;",
        "(temp ??= makeFresh()) as Base",
        false,
    ],
    ["fresh or-assignment pruning", "let temp: Base = new Fresh();", "temp ||= new Base()", false],
    [
        "fresh nullish-assignment pruning",
        "let temp: Base = new Fresh();",
        "temp ??= new Base()",
        false,
    ],
    [
        "uncertain or-assignment alternatives",
        "let temp: Base = choose ? new Base() : new Fresh();",
        "temp ||= makeFresh()",
        true,
    ],
    [
        "uncertain and-assignment truthy paths",
        "let temp: Base = choose ? new Base() : new Fresh();",
        "temp &&= makeFresh()",
        false,
    ],
    [
        "property assignment result",
        "const box: { value: Base } = { value: new Base() };",
        "box.value = makeFresh()",
        false,
    ],
    [
        "element assignment result",
        "const box: { value: Base } = { value: new Base() };",
        'box["value"] = makeFresh()',
        false,
    ],
    [
        "property assignment singleton inverse",
        "const box: { value: Base } = { value: new Fresh() };",
        "box.value = new Base()",
        true,
    ],
    [
        "property logical assignment",
        "const box: { value: Base } = { value: new Base() };",
        "box.value &&= makeFresh()",
        false,
    ],
    [
        "element or-assignment pruning",
        "const box: { value: Base } = { value: new Fresh() };",
        'box["value"] ||= new Base()',
        false,
    ],
    [
        "property nullish-assignment",
        "const box: { value: Base | undefined } = { value: undefined };",
        "(box.value ??= makeFresh()) as Base",
        false,
    ],
    [
        "property nullish singleton inverse",
        "const box: { value: Base | undefined } = { value: undefined };",
        "(box.value ??= new Base()) as Base",
        true,
    ],
    [
        "nested assignment wrapper adapter",
        "let temp: Base = new Base();",
        "temp = (void 0, choose ? makeFresh.call(undefined) : new Fresh())",
        false,
    ],
]) {
    test(`${label} preserves assignment result value semantics`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } ${setup} let source: Base = new Base(); const old = source.registry; source = (${expression}); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(
                    result.failures.join("\n"),
                    /(as any.*CreateProjectsRequest|could not statically resolve)/i,
                );
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("uses the whole destructuring assignment result before projecting a receiver", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeBox(): { value: Base } { return { value: new Fresh() }; } let temp: Base = new Base(); let source: Base = new Base(); const old = source.registry; source = (({ value: temp } = makeBox()).value); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("does not treat a destructured target as the whole assignment result", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeBox(): { value: Base } { return { value: new Fresh() }; } let temp: Base = new Base(); let source: Base = new Base(); const old = source.registry; source = (({ value: temp } = makeBox()) as unknown as Base); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("does not treat compound arithmetic as a receiver assignment value", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } let source: Base = new Base(); let counter = 0; const old = source.registry; source = ((counter += 1) as unknown as Base); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, expression, shouldFail] of [
    ["inner singleton overwritten by fresh result", "(source = new Base(), makeFresh())", false],
    ["inner fresh overwritten by singleton result", "(source = makeFresh(), new Base())", true],
]) {
    test(`${label} preserves assignment evaluation order`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } function makeFresh(): Base { return new Fresh(); } let source: Base = new Base(); const old = source.registry; source = (${expression}); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("fails closed when assignment result alternatives exceed the cap", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, choose: boolean) { class Safe {} class One { get registry() { return { Ctor: Safe }; } } class Two { get registry() { return { Ctor: Safe }; } } let temp: One | Two = new One(); const current = (temp = choose ? new One() : new Two()).registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 10_000 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded.*max 1/i);
    });
});

test("fails closed when assignment result discovery exceeds the work cap", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { class Safe {} class Fresh { get registry() { return { Ctor: Safe }; } } let temp = new Fresh(); const current = (temp = new Fresh()).registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded \(work; max 1\)/i);
    });
});

test("fails closed when assignment result resolution exceeds the depth limit", async () => {
    let assignment = "new Fresh()";
    for (let index = 0; index < 70; index += 1) assignment = `(temp = ${assignment})`;
    const source =
        generatedImports +
        `export async function run(client: FixtureClient) { class Safe {} class Fresh { get registry() { return { Ctor: Safe }; } } let temp = new Fresh(); const current = (${assignment}).registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n`;
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /governed reconstruction depth/i);
    });
});

test("fails closed for cyclic assignment result aliases", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } let source: Base = new Base(); const old = source.registry; let first = {} as Base; let second: Base = first; source = (first = second = first); const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(
            result.failures.join("\n"),
            /(as any.*CreateProjectsRequest|could not statically resolve)/i,
        );
    });
});

for (const [label, setup, shouldFail] of [
    [
        "definite subclass override",
        "let source: Base = new Base(); const old = source.registry; source = new Fresh(); const current = source.registry; old.Ctor = Unsafe; new current.Ctor();",
        false,
    ],
    [
        "current base singleton accessor",
        "let source: Base = new Fresh(); const old = source.registry; source = new Base(); const current = source.registry; current.Ctor = Unsafe; new current.Ctor();",
        true,
    ],
    [
        "conditional subclass override",
        "let source: Base = new Base(); const old = source.registry; if (choose) source = new Fresh(); const current = source.registry; old.Ctor = Unsafe; new current.Ctor();",
        true,
    ],
    [
        "loop subclass override",
        "let source: Base = new Base(); const old = source.registry; for (const enabled of [choose]) { if (enabled) source = new Fresh(); } const current = source.registry; old.Ctor = Unsafe; new current.Ctor();",
        true,
    ],
]) {
    test(`${label} resolves accessors from reaching instance values`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; class Base { get registry(): Registry { return singleton; } } class Fresh extends Base { override get registry(): Registry { return { Ctor: Safe }; } } ${setup} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(
                    result.failures.join("\n"),
                    /(as any.*CreateProjectsRequest|could not statically resolve)/i,
                );
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("keeps static accessor reads direct", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } class Source { static get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } } const old = Source.registry; const current = Source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("fails closed when reaching accessor alternatives exceed the cap", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient, choose: boolean) { class Safe {} class One { get registry() { return { Ctor: Safe }; } } class Two { get registry() { return { Ctor: Safe }; } } const source = choose ? new One() : new Two(); const current = source.registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 10_000 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded/i);
    });
});

test("fails closed for cyclic reaching accessor receivers", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { class Safe {} interface Source { readonly registry: { Ctor: typeof Safe } } let first = {} as Source; let second = first; first = second; second = first; const current = first.registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /could not statically resolve/i);
    });
});

test("fails closed when reaching accessor discovery exceeds the work cap", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { class Safe {} const source = { get registry() { return { Ctor: Safe }; } }; const current = source.registry; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded \(work; max 1\)/i);
    });
});

test("uses latest reaching typed getter writes through a receiver alias", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; interface Source { readonly registry: Registry } const singleton: Registry = { Ctor: Safe }; let source: Source = { get registry() { return singleton; } }; const old = source.registry; source = { get registry() { return { Ctor: Safe }; } }; const alias = source; const current = alias.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("merges reachable defaults in getter parameter destructuring", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const singleton: Registry = { Ctor: Safe }; const source = { get registry(): Registry | undefined { return choose ? { Ctor: Safe } : void 0; } }; function read({ registry = singleton }: typeof source) { return registry; } const old = read(source); const current = read(source); old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, setup, shouldFail] of [
    [
        "fresh default factories",
        "function make(): Registry { return { Ctor: Safe }; } const source = { get registry(): Registry | undefined { return void 0; } }; const { registry: old = make() } = source; const { registry: current = make() } = source; old.Ctor = Unsafe; new current.Ctor();",
        false,
    ],
    [
        "definitely nonundefined getter",
        "const singleton: Registry = { Ctor: Safe }; const source = { get registry(): Registry { return { Ctor: Safe }; } }; const { registry: old = singleton } = source; const { registry: current = singleton } = source; old.Ctor = Unsafe; new current.Ctor();",
        false,
    ],
    [
        "definitely undefined getter",
        "const singleton: Registry = { Ctor: Safe }; const source = { get registry(): Registry | undefined { return void 0; } }; const { registry: old = singleton } = source; const { registry: current = singleton } = source; old.Ctor = Unsafe; new current.Ctor();",
        true,
    ],
    [
        "conditional assignment defaults",
        "const singleton: Registry = { Ctor: Safe }; const source = { get registry(): Registry | undefined { return choose ? { Ctor: Safe } : void 0; } }; let old; let current; ({ registry: old = singleton } = source); ({ registry: current = singleton } = source); old.Ctor = Unsafe; new current.Ctor();",
        true,
    ],
    [
        "nested conditional defaults",
        "const singleton: Registry = { Ctor: Safe }; const nested = { get registry(): Registry | undefined { return choose ? { Ctor: Safe } : void 0; } }; const source = { nested }; const { nested: { registry: old = singleton } } = source; const { nested: { registry: current = singleton } } = source; old.Ctor = Unsafe; new current.Ctor();",
        true,
    ],
]) {
    test(`${label} preserves reachable getter default identity`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; ${setup} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(
                    result.failures.join("\n"),
                    label === "nested conditional defaults"
                        ? /(as any.*CreateProjectsRequest|could not statically resolve)/i
                        : /as any.*CreateProjectsRequest/i,
                );
            else assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, setup, shouldFail] of [
    [
        "current singleton getter",
        "let source: Source = { get registry() { return { Ctor: Safe }; } }; const old = source.registry; source = { get registry() { return singleton; } }; const current = source.registry; current.Ctor = Unsafe; new current.Ctor();",
        true,
    ],
    [
        "conditional receiver rebind",
        "let source: Source = { get registry() { return singleton; } }; const old = source.registry; if (choose) source = { get registry() { return { Ctor: Safe }; } }; const current = source.registry; old.Ctor = Unsafe; new current.Ctor();",
        true,
    ],
    [
        "loop receiver rebind",
        "let source: Source = { get registry() { return singleton; } }; const old = source.registry; for (const enabled of [choose]) { if (enabled) source = { get registry() { return { Ctor: Safe }; } }; } const current = source.registry; old.Ctor = Unsafe; new current.Ctor();",
        true,
    ],
]) {
    test(`${label} preserves reaching typed getter writes`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; interface Source { readonly registry: Registry } const singleton: Registry = { Ctor: Safe }; ${setup} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(
                    result.failures.join("\n"),
                    /(as any.*CreateProjectsRequest|could not statically resolve)/i,
                );
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("keeps nested destructured fresh-getter reads distinct", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const inner = { get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } }; const source = { nested: inner }; const { nested: { registry: old } } = source; const { nested: { registry: current } } = source; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

for (const [label, setup] of [
    [
        "same-pattern properties",
        "const source = { get first(): Registry { return { Ctor: Safe }; }, get second(): Registry { return { Ctor: Safe }; } }; const { first: old, second: current } = source;",
    ],
    [
        "aliased receiver",
        "const source = { get registry(): Registry { return { Ctor: Safe }; } }; const alias = source; const { registry: old } = source; const { registry: current } = alias;",
    ],
    [
        "binding defaults",
        "const fallback: Registry = { Ctor: Safe }; const source = { get registry(): Registry { return { Ctor: Safe }; } }; const { registry: old = fallback } = source; const { registry: current = fallback } = source;",
    ],
]) {
    test(`${label} preserves allocating getter binding identity`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; ${setup} old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        });
    });
}

test("preserves allocating getter identity through parameter destructuring calls", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const source = { get registry(): Registry { return { Ctor: Safe }; } }; function read({ registry }: typeof source) { return registry; } const old = read(source); const current = read(source); old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps repeated destructured getter reads at one loop site conservative", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } type Registry = { Ctor: typeof Safe | typeof Unsafe }; const source = { get registry(): Registry { return { Ctor: Safe }; } }; let old: Registry | undefined; let current: Registry | undefined; for (const index of [0, 1]) { const { registry } = source; if (index === 0) old = registry; else current = registry; } old!.Ctor = Unsafe; new current!.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(
            result.failures.join("\n"),
            /(as any.*CreateProjectsRequest|could not statically resolve)/i,
        );
    });
});

test("fails closed for computed getter binding names", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { class Safe {} const key = "registry" as const; const source = { get registry(): { Ctor: typeof Safe } { return { Ctor: Safe }; } }; const { [key]: current } = source; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /could not statically resolve/i);
    });
});

test("fails closed for custom-iterable array destructuring", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { class Safe {} const source = { *[Symbol.iterator]() { yield { Ctor: Safe }; } }; const [current] = source; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /could not statically resolve/i);
    });
});

test("keeps object-rest getter snapshots distinct", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const source = { get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } }; const { ...oldRest } = source; const { ...currentRest } = source; oldRest.registry.Ctor = Unsafe; new currentRest.registry.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("keeps object-rest singleton getter snapshots aliased", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const singleton: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; const source = { get registry() { return singleton; } }; const { ...oldRest } = source; const { ...currentRest } = source; oldRest.registry.Ctor = Unsafe; new currentRest.registry.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("fails closed for a recursive destructured allocating getter", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { class Safe {} const source = { get registry(): { Ctor: typeof Safe } { return source.registry; } }; const { registry: current } = source; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /could not statically resolve/i);
    });
});

test("fails closed when destructured allocating getter depth is exceeded", async () => {
    const getters = [
        "const source0 = { get registry(): { Ctor: typeof Safe } { return { Ctor: Safe }; } };",
        ...Array.from(
            { length: 70 },
            (_, index) =>
                `const source${index + 1} = { get registry(): { Ctor: typeof Safe } { return source${index}.registry; } };`,
        ),
    ].join("\n");
    const source =
        generatedImports +
        `export async function run(client: FixtureClient) { class Safe {} ${getters} const { registry: current } = source70; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n`;
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /could not statically resolve/i);
    });
});

test("fails closed when destructured getter read contexts exceed the cap", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const source = { get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } }; const { registry: old } = source; const { registry: current } = source; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 1, maxInvocations: 256, maxWork: 10_000 },
        });
        assert.match(result.failures.join("\n"), /receiver allocation invocation contexts; max 1/i);
    });
});

test("fails closed when destructured getter analysis exceeds the work cap", async () => {
    const source =
        generatedImports +
        'export async function run(client: FixtureClient) { class Safe {} const source = { get registry(): { Ctor: typeof Safe } { return { Ctor: Safe }; } }; const { registry: current } = source; new current.Ctor(); return client.projects.create({ workspaceId: "safe" }); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({
            root,
            contract: zeroContract,
            analysisLimits: { maxAlternatives: 64, maxInvocations: 256, maxWork: 1 },
        });
        assert.match(result.failures.join("\n"), /analysis limit exceeded \(work; max 1\)/i);
    });
});

test("keeps Object.assign on an old fresh-getter result distinct", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const source = { get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } }; const old = source.registry; const current = source.registry; Object.assign(old, { Ctor: Unsafe }); new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("flags mutation of the current fresh-getter result", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const source = { get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } }; const old = source.registry; const current = source.registry; current.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

test("keeps singleton-returning getter reads aliased", async () => {
    const source =
        generatedImports +
        'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const singleton: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; const source = { get registry() { return singleton; } }; const old = source.registry; const current = source.registry; old.Ctor = Unsafe; new current.Ctor(); return client.projects.create(holder.request); }\n';
    await withFixture(source, async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
    });
});

for (const [label, setup, shouldFail] of [
    [
        "class static object getter",
        "class Source { static get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } } const old = Source.registry; const current = Source.registry; old.Ctor = Unsafe; new current.Ctor();",
        false,
    ],
    [
        "class instance array getter",
        "class Source { get registry(): Array<typeof Safe | typeof Unsafe> { return [Safe]; } } const source = new Source(); const old = source.registry; const current = source.registry; old[0] = Unsafe; new current[0]();",
        false,
    ],
    [
        "class static new-allocation getter",
        "class Registry { Ctor: typeof Safe | typeof Unsafe = Safe; } class Source { static get registry() { return new Registry(); } } const old = Source.registry; const current = Source.registry; old.Ctor = Unsafe; new current.Ctor();",
        false,
    ],
    [
        "object element-access getter",
        'const source = { get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } }; const old = source["registry"]; const current = source["registry"]; old.Ctor = Unsafe; new current.Ctor();',
        false,
    ],
    [
        "object computed getter",
        'const key = "registry" as const; const source = { get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } }; const old = source[key]; const current = source[key]; old.Ctor = Unsafe; new current.Ctor();',
        false,
    ],
    [
        "aliased getter receiver",
        "const source = { get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } }; const alias = source; const old = source.registry; const current = alias.registry; old.Ctor = Unsafe; new current.Ctor();",
        false,
    ],
    [
        "optional getter read",
        "const source: { readonly registry: { Ctor: typeof Safe | typeof Unsafe } } | undefined = { get registry() { return { Ctor: Safe }; } }; const old = source?.registry; const current = source?.registry; old!.Ctor = Unsafe; new current!.Ctor();",
        false,
    ],
    [
        "nested getter read",
        "const inner = { get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } }; const outer = { get registry() { return inner.registry; } }; const old = outer.registry; const current = outer.registry; old.Ctor = Unsafe; new current.Ctor();",
        false,
    ],
    [
        "conditional getter read",
        "const source = { get registry(): { Ctor: typeof Safe | typeof Unsafe } { return { Ctor: Safe }; } }; const old = source.registry; const current = choose ? old : source.registry; old.Ctor = Unsafe; new current.Ctor();",
        true,
    ],
    [
        "current array getter mutation",
        "const source = { get registry(): Array<typeof Safe | typeof Unsafe> { return [Safe]; } }; const old = source.registry; const current = source.registry; current[0] = Unsafe; new current[0]();",
        true,
    ],
]) {
    test(`${label} preserves allocating getter read identity`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } ${setup} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, setup, shouldFail] of [
    [
        "old inline array direct mutation",
        "let registry: Array<typeof Safe | typeof Unsafe> = [Safe]; const old = registry; registry = [Safe]; old[0] = Unsafe; new registry[0]();",
        false,
    ],
    [
        "old inline array Object.assign mutation",
        "let registry: Array<typeof Safe | typeof Unsafe> = [Safe]; const old = registry; registry = [Safe]; Object.assign(old, { 0: Unsafe }); new registry[0]();",
        false,
    ],
    [
        "current inline object mutation",
        "let registry: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; registry = { Ctor: Safe }; registry.Ctor = Unsafe; new registry.Ctor();",
        true,
    ],
    [
        "current inline array alias mutation",
        "let registry: Array<typeof Safe | typeof Unsafe> = [Safe]; registry = [Safe]; const current = registry; current[0] = Unsafe; new registry[0]();",
        true,
    ],
    [
        "conditional inline object rebind",
        "let registry: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; const old = registry; registry = choose ? old : { Ctor: Safe }; old.Ctor = Unsafe; new registry.Ctor();",
        true,
    ],
    [
        "nested inline object allocation",
        "let holder: { registry: { Ctor: typeof Safe | typeof Unsafe } } = { registry: { Ctor: Safe } }; const old = holder.registry; holder = { registry: { Ctor: Safe } }; old.Ctor = Unsafe; new holder.registry.Ctor();",
        false,
    ],
    [
        "destructured old inline allocation",
        "let holder: { registry: { Ctor: typeof Safe | typeof Unsafe } } = { registry: { Ctor: Safe } }; const { registry: old } = holder; holder = { registry: { Ctor: Safe } }; old.Ctor = Unsafe; new holder.registry.Ctor();",
        false,
    ],
    [
        "old inline allocation alias chain",
        "let registry: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; const old = registry; const older = old; registry = { Ctor: Safe }; older.Ctor = Unsafe; new registry.Ctor();",
        false,
    ],
    [
        "old inline allocation alias cycle",
        "let registry: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; let old = registry; let older = old; old = older; registry = { Ctor: Safe }; old.Ctor = Unsafe; new registry.Ctor();",
        false,
    ],
    [
        "old inline class-expression allocation",
        "let registry: { Ctor: typeof Safe | typeof Unsafe } = class { static Ctor: typeof Safe | typeof Unsafe = Safe; }; const old = registry; registry = class { static Ctor: typeof Safe | typeof Unsafe = Safe; }; old.Ctor = Unsafe; new registry.Ctor();",
        false,
    ],
]) {
    test(`${label} preserves inline constructor allocation identity`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const requestHolder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (requestHolder.request = body as any); } ${setup} return client.projects.create(requestHolder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, setup, expected] of [
    [
        "computed unsafe array element overwrite",
        "const key: 0 = 0; const registry: Array<typeof Safe | typeof Unsafe> = [Safe]; registry[key] = Unsafe; new registry[key]();",
        "finding",
    ],
    [
        "aliased safe array element overwrite",
        "const registry: Array<typeof Safe | typeof Unsafe> = [Unsafe]; const alias = registry; alias[0] = Safe; new registry[0]();",
        "safe",
    ],
    [
        "destructured safe array element selection",
        "const registry: Array<typeof Safe | typeof Unsafe> = [Unsafe]; registry[0] = Safe; const [Selected] = registry; new Selected();",
        "safe",
    ],
    [
        "all-path safe array element overwrite",
        "const registry: Array<typeof Safe | typeof Unsafe> = [Unsafe]; if (choose) registry[0] = Safe; else registry[0] = AlsoSafe; new registry[0]();",
        "safe",
    ],
    [
        "partial unsafe array element overwrite",
        "const registry: Array<typeof Safe | typeof Unsafe> = [Safe]; if (choose) registry[0] = Unsafe; new registry[0]();",
        "finding",
    ],
    [
        "Object.assign safe array element overwrite",
        "const registry: Array<typeof Safe | typeof Unsafe> = [Unsafe]; Object.assign(registry, { 0: Safe }); new registry[0]();",
        "safe",
    ],
    [
        "Reflect.set unsafe array element overwrite",
        "const registry: Array<typeof Safe | typeof Unsafe> = [Safe]; Reflect.set(registry, 0, Unsafe); new registry[0]();",
        "finding",
    ],
    [
        "unknown array index overwrite",
        "const registry: Array<typeof Safe | typeof Unsafe> = [Safe]; registry[index] = Unsafe; new registry[0]();",
        "finding",
    ],
]) {
    test(`${label} preserves array constructor registry ordering`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean, index: number) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class AlsoSafe {} class Unsafe { configured = (holder.request = body as any); } ${setup} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (expected === "safe") assert.deepEqual(result.failures, []);
            else assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        });
    });
}

for (const [label, statement, shouldFail] of [
    [
        "empty readonly tuple alias",
        "const empty = [] as const; for (const value of empty) { void value; new Unsafe(); }",
        false,
    ],
    [
        "all-path empty conditional iterable",
        "for (const value of (body ? [] : [])) { void value; new Unsafe(); }",
        false,
    ],
    ["nonempty array", "for (const value of [1]) { void value; new Unsafe(); }", true],
    ["unknown iterable", "for (const value of values) { void value; new Unsafe(); }", true],
    ["empty for-in object", "for (const key in {}) { void key; new Unsafe(); }", false],
    [
        "spread iterable",
        "const empty = [] as const; for (const value of [...empty]) { void value; new Unsafe(); }",
        true,
    ],
    ["called iterable", "for (const value of Array.from([])) { void value; new Unsafe(); }", true],
    [
        "getter-bearing for-in object",
        "for (const key in { get value() { return 1; } }) { void key; new Unsafe(); }",
        true,
    ],
    [
        "break before construction",
        "for (const value of [1]) { void value; break; new Unsafe(); }",
        false,
    ],
]) {
    test(`${label} preserves static collection-loop reachability`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, values: Iterable<unknown>) { const holder: Holder = { request: { workspaceId: "safe" } }; class Unsafe { configured = (holder.request = body as any); } ${statement} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

for (const [label, setup, shouldFail] of [
    [
        "current allocation direct mutation",
        "let registry = oldObject; registry = newSafe; registry.Ctor = Unsafe; new registry.Ctor();",
        true,
    ],
    [
        "current allocation alias mutation",
        "let registry = oldObject; registry = newSafe; const current = registry; current.Ctor = Unsafe; new registry.Ctor();",
        true,
    ],
    [
        "conditional allocation rebind",
        "let registry = oldObject; const old = registry; registry = choose ? oldObject : newSafe; old.Ctor = Unsafe; new registry.Ctor();",
        true,
    ],
]) {
    test(`${label} preserves constructor registry allocation identity`, async () => {
        const source =
            generatedImports +
            `interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; class Safe {} class Unsafe { configured = (holder.request = body as any); } const oldObject: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; const newSafe: { Ctor: typeof Safe | typeof Unsafe } = { Ctor: Safe }; ${setup} return client.projects.create(holder.request); }\n`;
        await withFixture(source, async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            if (shouldFail)
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            else assert.deepEqual(result.failures, []);
        });
    });
}

test("uses the latest projected patch property write in rest reconstruction", async () => {
    await withFixture(
        returnedMutationFixture(
            'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const box = { patch: { body: "safe" } }; box.patch = { body: body as any }; return { ...rest, ...box.patch }; }',
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, helperSource, shouldFail, invocation, runArgs] of [
    [
        "unsafe initializer then safe direct write",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const box = { patch: { body: body as any } }; box.patch = { body: "safe" }; return { ...rest, ...box.patch }; }',
        false,
    ],
    [
        "safe initializer then unsafe computed write",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const box = { patch: { body: "safe" } }; box["patch"] = { body: body as any }; return { ...rest, ...box.patch }; }',
        true,
    ],
    [
        "safe initializer then unsafe alias write",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const box = { patch: { body: "safe" } }; const alias = box; alias.patch = { body: body as any }; return { ...rest, ...box.patch }; }',
        true,
    ],
    [
        "unsafe initializer then all-path safe writes",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; const { ...rest } = request; const box = { patch: { body: body as any } }; if (choose) box.patch = { body: "left" }; else box.patch = { body: "right" }; return { ...rest, ...box.patch }; }',
        false,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
    [
        "unsafe initializer then partial safe write",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, choose: boolean) { request.body = body as any; const { ...rest } = request; const box = { patch: { body: body as any } }; if (choose) box.patch = { body: "safe" }; return { ...rest, ...box.patch }; }',
        true,
        "augment(request, body, choose)",
        ", choose: boolean",
    ],
    [
        "unsafe initializer then compound safe write",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const box: { patch?: { body?: unknown } } = { patch: { body: body as any } }; box.patch ||= { body: "safe" }; return { ...rest, ...box.patch }; }',
        true,
    ],
    [
        "safe initializer then delete",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const box: { patch?: { body?: unknown } } = { patch: { body: "safe" } }; delete box.patch; return { ...rest, ...box.patch }; }',
        true,
    ],
    [
        "safe initializer then unsafe defineProperty",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const box = { patch: { body: "safe" } }; Object.defineProperty(box, "patch", { value: { body: body as any } }); return { ...rest, ...box.patch }; }',
        true,
    ],
    [
        "unsafe initializer then safe defineProperty",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const box = { patch: { body: body as any } }; Object.defineProperty(box, "patch", { value: { body: "safe" } }); return { ...rest, ...box.patch }; }',
        false,
    ],
    [
        "safe initializer then unsafe Reflect.set",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown) { request.body = body as any; const { ...rest } = request; const box = { patch: { body: "safe" } }; Reflect.set(box, "patch", { body: body as any }); return { ...rest, ...box.patch }; }',
        true,
    ],
    [
        "safe initializer then unknown computed write",
        'function augment(request: ClockifyApi.CreateProjectsRequest, body: unknown, key: string) { request.body = body as any; const { ...rest } = request; const box: Record<string, { body?: unknown }> = { patch: { body: "safe" } }; box[key] = { body: body as any }; return { ...rest, ...box.patch }; }',
        true,
        "augment(request, body, key)",
        ", key: string",
    ],
]) {
    test(`${label} honors projected property last-write semantics`, async () => {
        await withFixture(
            returnedMutationFixture(helperSource, invocation, runArgs),
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                if (shouldFail) {
                    assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
                } else {
                    assert.deepEqual(result.failures, []);
                }
            },
        );
    });
}

test("keeps mutually exclusive descriptor paths through Object.defineProperty.call", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; Object.defineProperty.call(Object, holder, "request", choose ? { value: body as any } : { value: { workspaceId: "safe" } }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("lets a later normalized safe effect dominate an unsafe normalized effect", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; Object.assign.call(Object, holder, { request: body as any }); Reflect.set.call(Reflect, holder, "request", { workspaceId: "safe" }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("keeps an unsafe-last normalized apply effect", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; Reflect.set.call(Reflect, holder, "request", { workspaceId: "safe" }); Object.assign.apply(Object, [holder, { request: body as any }]); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("does not spread a normalized call effect across receivers", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; Object.assign.call(Object, other, { request: body as any }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("retains an unsafe bound effect beside a reachable local callable", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const local = (_patch: unknown) => undefined; let mutate = local; if (choose) mutate = Object.assign.bind(Object, holder); mutate({ request: body as any }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("does not let a mixed local and safe bound path dominate a prior unsafe effect", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; Object.assign(holder, { request: body as any }); const local = (_value: unknown) => undefined; let set = local; if (choose) set = Reflect.set.bind(Reflect, holder, "request") as typeof local; set({ workspaceId: "safe" }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("lets all equivalent safe bound paths dominate a prior unsafe effect", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; Object.assign(holder, { request: body as any }); let set: (value: ClockifyApi.CreateProjectsRequest) => boolean; if (choose) set = Reflect.set.bind(Reflect, holder, "request"); else set = Reflect.set.bind(Reflect, holder, "request"); set({ workspaceId: "safe" }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("retains a prior unsafe effect after a bound alias is overwritten locally", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; Object.assign(holder, { request: body as any }); let set = Reflect.set.bind(Reflect, holder, "request"); set = ((_value: unknown) => true) as typeof set; set({ workspaceId: "safe" }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, setup, invocation] of [
    [
        "inline static apply spread",
        "",
        "Object.assign.apply(Object, [holder, ...[{ request: body as any }]]);",
    ],
    [
        "aliased tuple apply spread",
        "const tail = [{ request: body as any }] as const; const args = [holder, ...tail] as const;",
        "Object.assign.apply(Object, args);",
    ],
]) {
    test("models an unsafe " + label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ' +
                setup +
                " " +
                invocation +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("preserves safe-later ordering through a static apply spread", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const tail = [{ request: body as any }, { request: { workspaceId: "safe" } }] as const; Object.assign.apply(Object, [holder, ...tail]); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("fails closed for an unknown spread in governed apply arguments", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const tail = body as any; Object.assign.apply(Object, [holder, ...tail]); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /statically resolve.*apply argument list/i);
        },
    );
});

test("fails closed when static apply-spread alternatives exceed the cap", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, a: boolean, b: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const first = a ? [{ request: body as any }] : [{ request: { workspaceId: "safe" } }]; const second = b ? [{ marker: 1 }] : [{ marker: 2 }]; Object.assign.apply(Object, [holder, ...first, ...second]); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({
                root,
                contract: zeroContract,
                analysisLimits: { maxAlternatives: 2, maxInvocations: 256, maxWork: 1000 },
            });
            assert.match(result.failures.join("\n"), /analysis limit exceeded.*alternatives.*2/i);
        },
    );
});

for (const [label, setup, invocation] of [
    [
        "bind.call",
        "",
        "Object.assign.bind.call(Object.assign, Object, holder)({ request: body as any });",
    ],
    [
        "bind.apply",
        "",
        "Object.assign.bind.apply(Object.assign, [Object, holder])({ request: body as any });",
    ],
    [
        "aliased computed bind.call",
        'const binder = Object.assign["bind"];',
        "binder.call(Object.assign, Object, holder)({ request: body as any });",
    ],
]) {
    test("models an invoked recursive " + label + " adapter", async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ' +
                setup +
                " " +
                invocation +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("does not model an uninvoked recursive bind.call adapter", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; Object.assign.bind.call(Object.assign, Object, holder, { request: body as any }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not model a shadow recursive bind.call adapter", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const local = { assign(target: Holder) { return target; } }; local.assign.bind.call(local.assign, local, holder)({ request: body as any }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not model a local bind-named method through recursive call", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const local = { bind(_thisArg: unknown, _holder: Holder) { return (_patch: unknown) => undefined; } }; local.bind.call(Object.assign, Object, holder)({ request: body as any }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, setup, invocation] of [
    [
        "Object.assign",
        "",
        "Reflect.apply(Object.assign, Object, [holder, { request: body as any }]);",
    ],
    [
        "aliased Reflect.set",
        "const apply = Reflect.apply; const set = Reflect.set;",
        'apply(set, Reflect, [holder, "request", body as any]);',
    ],
    [
        "computed Object.defineProperty",
        "",
        'Reflect["apply"](Object["defineProperty"], Object, [holder, "request", { value: body as any }]);',
    ],
    [
        "const-key Object.defineProperties",
        'const applyKey = "apply" as const;',
        "Reflect[applyKey](Object.defineProperties, Object, [holder, { request: { value: body as any } }]);",
    ],
    [
        "aliased computed Reflect.defineProperty",
        'const define = Reflect["defineProperty"];',
        'Reflect.apply(define, Reflect, [holder, "request", { get() { return body as any; } }]);',
    ],
]) {
    test("models Reflect.apply for " + label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ' +
                setup +
                " " +
                invocation +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("flattens a static spread in Reflect.apply arguments", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const tail = [{ request: body as any }] as const; Reflect.apply(Object.assign, Object, [holder, ...tail]); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("fails closed for unresolved governed Reflect.apply arguments", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; Reflect.apply(Object.assign, Object, body as any); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(
                result.failures.join("\n"),
                /statically resolve Object\.assign Reflect\.apply argument list/i,
            );
        },
    );
});

test("fails closed when Reflect.apply argument alternatives exceed the cap", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, a: boolean, b: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const first = a ? [{ request: body as any }] : [{ request: { workspaceId: "safe" } }]; const second = b ? [{ marker: 1 }] : [{ marker: 2 }]; Reflect.apply(Object.assign, Object, [holder, ...first, ...second]); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({
                root,
                contract: zeroContract,
                analysisLimits: { maxAlternatives: 2, maxInvocations: 256, maxWork: 1000 },
            });
            assert.match(result.failures.join("\n"), /analysis limit exceeded.*alternatives.*2/i);
        },
    );
});

test("does not model a shadow Reflect.apply", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const Reflect = { apply(_target: unknown, _receiver: unknown, _args: unknown[]) { return undefined; } }; Reflect.apply(Object.assign, Object, [holder, { request: body as any }]); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not model Reflect.apply for an unrelated target", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const local = (_target: Holder, _patch: unknown) => undefined; Reflect.apply(local, undefined, [holder, { request: body as any }]); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, setup, invocation] of [
    [
        "direct custom bind",
        "const assign = Object.assign; assign.bind = ((_thisArg: unknown, _holder: Holder) => (_patch: unknown) => undefined) as typeof assign.bind;",
        "assign.bind(Object, holder)({ request: body as any });",
    ],
    [
        "custom bind through call",
        "const assign = Object.assign; assign.bind = ((_thisArg: unknown, _holder: Holder) => (_patch: unknown) => undefined) as typeof assign.bind;",
        "assign.bind.call(assign, Object, holder)({ request: body as any });",
    ],
    [
        "custom bind through apply",
        "const assign = Object.assign; assign.bind = ((_thisArg: unknown, _holder: Holder) => (_patch: unknown) => undefined) as typeof assign.bind;",
        "assign.bind.apply(assign, [Object, holder])({ request: body as any });",
    ],
    [
        "computed overwritten custom bind",
        'const assign = Object.assign; const bindKey = "bind" as const; assign[bindKey] = ((_thisArg: unknown, _holder: Holder) => (_patch: unknown) => undefined) as typeof assign.bind;',
        "assign[bindKey].call(assign, Object, holder)({ request: body as any });",
    ],
]) {
    test("does not model " + label + " as native Function.bind", async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ' +
                setup +
                " " +
                invocation +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.deepEqual(result.failures, []);
            },
        );
    });
}

test("preserves native computed bind.call normalization", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const bindKey = "bind" as const; Object.assign[bindKey].call(Object.assign, Object, holder)({ request: body as any }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("does not let another callable bind overwrite suppress native bind", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const keys = Object.keys; keys.bind = ((_thisArg: unknown) => () => []) as typeof keys.bind; Object.assign.bind(Object, holder)({ request: body as any }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("models native bind restored after a custom bind assignment", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; const nativeBind = assign.bind; assign.bind = ((_thisArg: unknown) => (_patch: unknown) => undefined) as typeof assign.bind; assign.bind = nativeBind; assign.bind(Object, holder)({ request: body as any }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("keeps conditional native and custom bind paths", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; if (choose) assign.bind = ((_thisArg: unknown) => (_patch: unknown) => undefined) as typeof assign.bind; assign.bind(Object, holder)({ request: body as any }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, setup, invocation] of [
    [
        "direct custom binder",
        "const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder) { return (patch: unknown) => Object.assign(target, patch); }) as typeof assign.bind;",
        "assign.bind(Object, holder)({ request: body as any });",
    ],
    [
        "custom binder through call",
        "const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder) { return (patch: unknown) => Object.assign(target, patch); }) as typeof assign.bind;",
        "assign.bind.call(assign, Object, holder)({ request: body as any });",
    ],
    [
        "custom binder through apply",
        "const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder) { return (patch: unknown) => Object.assign(target, patch); }) as typeof assign.bind;",
        "assign.bind.apply(assign, [Object, holder])({ request: body as any });",
    ],
    [
        "conditional custom binder return",
        "const assign = Object.assign; assign.bind = (function (_thisArg: unknown, target: Holder, choose: boolean) { return choose ? (patch: unknown) => Object.assign(target, patch) : (_patch: unknown) => undefined; }) as typeof assign.bind;",
        "assign.bind(Object, holder, true)({ request: body as any });",
    ],
]) {
    test("models unsafe effects from " + label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ' +
                setup +
                " " +
                invocation +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

for (const [label, overwrite] of [
    [
        "Object.defineProperty",
        'Object.defineProperty(assign, "bind", { value: (_thisArg: unknown) => (_patch: unknown) => undefined });',
    ],
    [
        "Reflect.defineProperty",
        'Reflect.defineProperty(assign, "bind", { value: (_thisArg: unknown) => (_patch: unknown) => undefined });',
    ],
    [
        "Reflect.set",
        'Reflect.set(assign, "bind", (_thisArg: unknown) => (_patch: unknown) => undefined);',
    ],
    [
        "Object.assign",
        "Object.assign(assign, { bind: (_thisArg: unknown) => (_patch: unknown) => undefined });",
    ],
]) {
    test("recognizes a custom bind property written by " + label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; ' +
                overwrite +
                " assign.bind(Object, holder)({ request: body as any }); return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.deepEqual(result.failures, []);
            },
        );
    });
}

test("models a native bind restored through Reflect.set", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const assign = Object.assign; const nativeBind = assign.bind; assign.bind = ((_thisArg: unknown) => (_patch: unknown) => undefined) as typeof assign.bind; Reflect.set(assign, "bind", nativeBind); assign.bind(Object, holder)({ request: body as any }); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, overwrite] of [
    [
        "assignment",
        "Reflect.apply = ((_target: unknown, _receiver: unknown, _args: unknown[]) => undefined) as typeof Reflect.apply;",
    ],
    [
        "Object.defineProperty",
        'Object.defineProperty(Reflect, "apply", { value: (_target: unknown, _receiver: unknown, _args: unknown[]) => undefined });',
    ],
    [
        "Reflect.defineProperty",
        'Reflect.defineProperty(Reflect, "apply", { value: (_target: unknown, _receiver: unknown, _args: unknown[]) => undefined });',
    ],
    [
        "Reflect.set",
        'Reflect.set(Reflect, "apply", (_target: unknown, _receiver: unknown, _args: unknown[]) => undefined);',
    ],
    [
        "Object.assign",
        "Object.assign(Reflect, { apply: (_target: unknown, _receiver: unknown, _args: unknown[]) => undefined });",
    ],
]) {
    test("does not model Reflect.apply after " + label + " overwrite", async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ' +
                overwrite +
                " Reflect.apply(Object.assign, Object, [holder, { request: body as any }]); return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.deepEqual(result.failures, []);
            },
        );
    });
}

test("models Reflect.apply restored to a captured native value", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const nativeApply = Reflect.apply; Reflect.apply = ((_target: unknown, _receiver: unknown, _args: unknown[]) => undefined) as typeof Reflect.apply; Reflect.apply = nativeApply; Reflect.apply(Object.assign, Object, [holder, { request: body as any }]); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("keeps a captured native Reflect.apply alias after property overwrite", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const apply = Reflect.apply; Reflect.apply = ((_target: unknown, _receiver: unknown, _args: unknown[]) => undefined) as typeof Reflect.apply; apply(Object.assign, Object, [holder, { request: body as any }]); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("keeps conditional native and overwritten Reflect.apply paths", async () => {
    await withFixture(
        generatedImports +
            'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown, choose: boolean) { const holder: Holder = { request: { workspaceId: "safe" } }; if (choose) Reflect.apply = ((_target: unknown, _receiver: unknown, _args: unknown[]) => undefined) as typeof Reflect.apply; Reflect.apply(Object.assign, Object, [holder, { request: body as any }]); return client.projects.create(holder.request); }\n',
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, source] of [
    [
        "shadow Object.call",
        "const Object = { assign(target: Holder, _patch: unknown) { return target; } }; Object.assign.call(Object, holder, { request: body as any });",
    ],
    [
        "unrelated local function.call",
        "function assign(_target: Holder, _patch: unknown) {} assign.call(undefined, holder, { request: body as any });",
    ],
    [
        "overwritten builtin alias.call",
        "let assign: (target: Holder, patch: unknown) => Holder = Object.assign; assign = (target) => target; assign.call(Object, holder, { request: body as any });",
    ],
    [
        "overwritten computed key.call",
        'let member: keyof typeof Object = "assign"; member = "keys"; Object[member].call(Object, holder, { request: body as any });',
    ],
    [
        "uninvoked Object.assign.bind",
        "Object.assign.bind(Object, holder, { request: body as any });",
    ],
]) {
    test("does not model " + label, async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ' +
                source +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.deepEqual(result.failures, []);
            },
        );
    });
}

for (const [label, source] of [
    ["unknown", "Object.assign.apply(Object, body as any);"],
    ["non-array", 'Object.assign.apply(Object, "not-an-array" as any);'],
]) {
    test("fails closed for " + label + " governed apply arguments", async () => {
        await withFixture(
            generatedImports +
                'interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ' +
                source +
                " return client.projects.create(holder.request); }\n",
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(
                    result.failures.join("\n"),
                    /statically resolve Object\.assign apply argument list/i,
                );
            },
        );
    });
}

test("keeps an unsafe-last effect across sequential Object.assign calls", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "initial" } }; Object.assign(holder, { request: { workspaceId: "safe" } }); Object.assign(holder, { request: body as any }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

test("lets a later exact source dominate an unresolved direct Object.assign source", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "initial" } }; Object.assign(holder, body as any, { request: { workspaceId: "safe" } }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("governs an unresolved direct Object.assign source when it is last", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "initial" } }; Object.assign(holder, { request: { workspaceId: "safe" } }, body as any); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
        },
    );
});

for (const [label, setup, invocation] of [
    ["Object.assign", "const { assign } = Object;", "assign(holder, { request: body as any });"],
    [
        "renamed Object.assign",
        "const { assign: merge } = Object;",
        "merge(holder, { request: body as any });",
    ],
    ["Reflect.set", "const { set } = Reflect;", 'set(holder, "request", body as any);'],
]) {
    test(`models a destructured ${label} alias`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; ${setup} ${invocation} return client.projects.create(holder.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("does not retain overwritten destructured Object.assign provenance", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; let { assign } = Object; assign = ((target: Holder) => target) as typeof Object.assign; assign(holder, { request: body as any }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not treat a destructured shadow assign as Object.assign", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const local = { assign: (target: Holder) => target }; const { assign } = local; assign(holder, { request: body as any }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("fails closed when static spread alternatives exceed the deterministic cap", async () => {
    const spreads = Array.from(
        { length: 7 },
        (_, index) => `...(${`flag${index}`} ? { p${index}: ${index} } : { q${index}: ${index} })`,
    ).join(", ");
    const flags = Array.from({ length: 7 }, (_, index) => `flag${index}: boolean`).join(", ");
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, ${flags}) { const holder = { request: { workspaceId: "safe" } }; Object.assign(holder, { ${spreads} }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /analysis limit exceeded.*alternatives.*64/i);
        },
    );
});

test("accepts a normal static spread alternative product below the deterministic cap", async () => {
    const spreads = Array.from(
        { length: 5 },
        (_, index) => `...(${`flag${index}`} ? { p${index}: ${index} } : { q${index}: ${index} })`,
    ).join(", ");
    const flags = Array.from({ length: 5 }, (_, index) => `flag${index}: boolean`).join(", ");
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, ${flags}) { const holder = { request: { workspaceId: "safe" } }; Object.assign(holder, { ${spreads} }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

for (const [label, assignment] of [
    [
        "direct multi-source safe-later overwrite",
        'Object.assign(holder, { request: body as any }, { request: { workspaceId: "safe" } });',
    ],
    [
        "spread then explicit safe-later overwrite",
        'const patch = { request: body as any }; Object.assign(holder, { ...patch, request: { workspaceId: "safe" } });',
    ],
    [
        "aliased factory safe-later overwrite",
        'const assign = Object.assign; function patch() { return { request: body as any }; } assign(holder, patch(), { request: { workspaceId: "safe" } });',
    ],
    [
        "unresolved computed then explicit safe-later overwrite",
        'const key: string = "request"; Object.assign(holder, { [key]: body as any, request: { workspaceId: "safe" } });',
    ],
    [
        "unresolved spread then explicit safe-later overwrite",
        'const patch = body as any; Object.assign(holder, { ...patch, request: { workspaceId: "safe" } });',
    ],
]) {
    test(`honors Object.assign order for a ${label}`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "initial" } }; ${assignment} return client.projects.create(holder.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.deepEqual(result.failures, []);
            },
        );
    });
}

for (const [label, assignment] of [
    [
        "direct multi-source unsafe-last overwrite",
        'Object.assign(holder, { request: { workspaceId: "safe" } }, { request: body as any });',
    ],
    [
        "explicit then spread unsafe-last overwrite",
        'const patch = { request: body as any }; Object.assign(holder, { request: { workspaceId: "safe" }, ...patch });',
    ],
    [
        "aliased factory unsafe-last overwrite",
        'const assign = Object.assign; function patch() { return { request: body as any }; } assign(holder, { request: { workspaceId: "safe" } }, patch());',
    ],
    [
        "unresolved computed unsafe-last overwrite",
        'const key: string = "request"; Object.assign(holder, { request: { workspaceId: "safe" }, [key]: body as any });',
    ],
    [
        "unresolved spread unsafe-last overwrite",
        'const patch = body as any; Object.assign(holder, { request: { workspaceId: "safe" }, ...patch });',
    ],
]) {
    test(`keeps Object.assign order conservative for a ${label}`, async () => {
        await withFixture(
            `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "initial" } }; ${assignment} return client.projects.create(holder.request); }\n`,
            async (root) => {
                const result = await validateConsumerCastGovernance({
                    root,
                    contract: zeroContract,
                });
                assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
            },
        );
    });
}

test("does not model asynchronous callback effects before the request", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; setTimeout(() => { holder.request = body as any; }, 0); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("does not spread Object.assign effects across receivers", async () => {
    await withFixture(
        `${generatedImports}interface Holder { request: ClockifyApi.CreateProjectsRequest }\nexport async function run(client: FixtureClient, body: unknown) { const holder: Holder = { request: { workspaceId: "safe" } }; const other: Holder = { request: { workspaceId: "other" } }; Object.assign(other, { request: body as any }); return client.projects.create(holder.request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.deepEqual(result.failures, []);
        },
    );
});

test("rejects an imported wireBody helper outside configured source roots", async () => {
    await withFixture(
        `${generatedImports}import { wireBody } from "../../shared/helper.js";\nexport async function run(client: FixtureClient, body: unknown) { return client.projects.create(wireBody(body)); }\n`,
        async (root) => {
            await mkdir(path.join(root, "shared"), { recursive: true });
            await writeFile(
                path.join(root, "shared/helper.ts"),
                "export const wireBody = <T>(value: T): T => value;\n",
            );
            const contract = structuredClone(zeroContract);
            contract.forbiddenRequestEscape = structuredClone(
                CANONICAL_CONSUMER_CAST_CONTRACT.forbiddenRequestEscape,
            );
            const result = await validateConsumerCastGovernance({ root, contract });
            assert.match(
                result.failures.join("\n"),
                /forbidden request escape.*shared\/helper\.ts/i,
            );
        },
    );
});

test("rejects an exception whose generated request type differs from the matched finding", async () => {
    await withFixture(requestFixture("body as ClockifyApi.CreateProjectsRequest"), async (root) => {
        await writeGovernanceReferences(root);
        const exception = completeException();
        exception.generatedRequestType = "UpdateProjectsRequest";
        const result = await validateConsumerCastGovernance({
            root,
            contract: exceptionContract(exception),
        });
        assert.match(
            result.failures.join("\n"),
            /generatedRequestType must exactly equal.*CreateProjectsRequest/i,
        );
    });
});

test("rejects substring-only Make target ownership", async () => {
    await withFixture(requestFixture("body as ClockifyApi.CreateProjectsRequest"), async (root) => {
        await writeGovernanceReferences(root);
        await writeFile(
            path.join(root, "docs/risk-register.json"),
            `${JSON.stringify({ risks: [{ id: "generated-request-gap", status: "open", closureGate: "make consumer-cast-budget-extra" }] })}\n`,
        );
        await writeFile(
            path.join(root, "Makefile"),
            "consumer-cast-budget:\n\t@true\nconsumer-cast-budget-extra:\n\t@true\n",
        );
        const result = await validateConsumerCastGovernance({
            root,
            contract: exceptionContract(completeException()),
        });
        assert.match(result.failures.join("\n"), /not an exact Make target owned/i);
    });
});

for (const [label, mutate] of [
    ["altered source root", (contract) => (contract.requestCastGovernance.sourceRoots.cli = "cli")],
    ["empty source root", (contract) => (contract.requestCastGovernance.sourceRoots.mcp = "")],
    ["empty forbidden roots", (contract) => (contract.forbiddenRequestEscape.roots = [])],
    ["incomplete forbidden roots", (contract) => contract.forbiddenRequestEscape.roots.pop()],
    [
        "altered forbidden root",
        (contract) => (contract.forbiddenRequestEscape.roots[0] = "wrapper"),
    ],
    [
        "disabled wrapper root",
        (contract) => (contract.forbiddenRequestEscape.wrapperRootTypeScript = false),
    ],
    [
        "disabled import closure",
        (contract) => (contract.forbiddenRequestEscape.importClosure = false),
    ],
    ["redirected public proof", (contract) => (contract.publicNoAnyProof.path = "docs/fake.ts")],
    ["empty proof markers", (contract) => (contract.publicNoAnyProof.contains = [])],
    [
        "altered proof marker",
        (contract) => (contract.publicNoAnyProof.contains[0] = "_CommentOnly"),
    ],
    [
        "redirected proof target",
        (contract) => (contract.publicNoAnyProof.compilerGate = "breaking-change-review"),
    ],
    [
        "redirected proof command",
        (contract) => (contract.publicNoAnyProof.compilerCommand = "true"),
    ],
]) {
    test(`rejects canonical contract tampering: ${label}`, () => {
        const contract = structuredClone(canonicalContract);
        mutate(contract);
        assert.notDeepEqual(validateCanonicalConsumerCastContract(contract), []);
    });
}

test("rejects local structural counterfeit adapter aliases", async () => {
    const source = await readFile(
        path.join(repoRoot, CANONICAL_CONSUMER_CAST_CONTRACT.publicNoAnyProof.path),
        "utf8",
    );
    const counterfeit = source
        .replace(
            "type Adapter = ArchiveThenDeleteAdapter<CurrentClient>;",
            "type Adapter = { getCurrent(input: unknown): unknown; archive(input: unknown): unknown; delete(input: unknown): unknown };",
        )
        .replace(
            "type RootAdapter = RootArchiveThenDeleteAdapter<CurrentClient>;",
            "type RootAdapter = Adapter;",
        );
    assert.notDeepEqual(validatePublicNoAnyProofSource(counterfeit), []);
});

test("rejects a compiler-green counterfeit no-any fixture without public import provenance", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "clockify-counterfeit-proof-"));
    try {
        const fixture = path.join(root, "counterfeit.ts");
        const source = [
            "type IsAny<T> = 0 extends 1 & T ? true : false;",
            "type AssertFalse<T extends false> = T;",
            "interface CurrentClient { marker: number }",
            "type Adapter = { getCurrent(input: unknown): unknown; archive(input: unknown): unknown; delete(input: unknown): unknown };",
            "type RootAdapter = Adapter;",
            'type _GetInputIsNotAny = AssertFalse<IsAny<Parameters<Adapter["getCurrent"]>[0]>>;',
            'type _ArchiveInputIsNotAny = AssertFalse<IsAny<Parameters<Adapter["archive"]>[0]>>;',
            'type _DeleteInputIsNotAny = AssertFalse<IsAny<Parameters<Adapter["delete"]>[0]>>;',
            'type _RootGetInputIsNotAny = AssertFalse<IsAny<Parameters<RootAdapter["getCurrent"]>[0]>>;',
            'type _RootArchiveInputIsNotAny = AssertFalse<IsAny<Parameters<RootAdapter["archive"]>[0]>>;',
            'type _RootDeleteInputIsNotAny = AssertFalse<IsAny<Parameters<RootAdapter["delete"]>[0]>>;',
            "",
        ].join("\n");
        await writeFile(fixture, source);
        const program = ts.createProgram({
            rootNames: [fixture],
            options: { noEmit: true, strict: true, skipLibCheck: true },
        });
        assert.deepEqual(ts.getPreEmitDiagnostics(program), []);
        assert.notDeepEqual(validatePublicNoAnyProofSource(source), []);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("rejects local shadowing of the Parameters built-in used by the public proof", async () => {
    const source = await readFile(
        path.join(repoRoot, CANONICAL_CONSUMER_CAST_CONTRACT.publicNoAnyProof.path),
        "utf8",
    );
    const shadowed = source.replace(
        "type IsAny<T> = 0 extends 1 & T ? true : false;",
        "type Parameters<T> = [unknown];\ntype IsAny<T> = 0 extends 1 & T ? true : false;",
    );
    assert.notDeepEqual(validatePublicNoAnyProofSource(shadowed), []);
});

test("rejects a compiler-green public fixture with a shadowed Parameters built-in", async () => {
    const source = await readFile(
        path.join(repoRoot, CANONICAL_CONSUMER_CAST_CONTRACT.publicNoAnyProof.path),
        "utf8",
    );
    const shadowed = source.replace(
        "type IsAny<T> = 0 extends 1 & T ? true : false;",
        "type Parameters<T> = [unknown];\ntype IsAny<T> = 0 extends 1 & T ? true : false;",
    );
    const root = await mkdtemp(path.join(repoRoot, "wrapper/tests/types/.cast-proof-parameters-"));
    try {
        const fixture = path.join(root, "shadowed.test-d.ts");
        await writeFile(fixture, shadowed);
        const program = ts.createProgram({
            rootNames: [fixture],
            options: {
                module: ts.ModuleKind.ESNext,
                moduleResolution: ts.ModuleResolutionKind.Bundler,
                noEmit: true,
                skipLibCheck: true,
                strict: true,
                target: ts.ScriptTarget.ES2022,
            },
        });
        assert.deepEqual(ts.getPreEmitDiagnostics(program), []);
        assert.notDeepEqual(validatePublicNoAnyProofSource(shadowed), []);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("rejects compiler-green default-import shadowing of the Parameters built-in", async () => {
    const source = await readFile(
        path.join(repoRoot, CANONICAL_CONSUMER_CAST_CONTRACT.publicNoAnyProof.path),
        "utf8",
    );
    const shadowed = `import type Parameters from "./fake-parameters.js";\n${source}`;
    const root = await mkdtemp(
        path.join(repoRoot, "wrapper/tests/types/.cast-proof-default-parameters-"),
    );
    try {
        await writeFile(
            path.join(root, "fake-parameters.d.ts"),
            "type FakeParameters<T> = [unknown];\nexport default FakeParameters;\n",
        );
        const fixture = path.join(root, "shadowed.test-d.ts");
        await writeFile(fixture, shadowed);
        const program = ts.createProgram({
            rootNames: [fixture],
            options: {
                module: ts.ModuleKind.ESNext,
                moduleResolution: ts.ModuleResolutionKind.Bundler,
                noEmit: true,
                skipLibCheck: true,
                strict: true,
                target: ts.ScriptTarget.ES2022,
            },
        });
        assert.deepEqual(ts.getPreEmitDiagnostics(program), []);
        assert.notDeepEqual(validatePublicNoAnyProofSource(shadowed), []);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("rejects compiler-green namespace-import shadowing of the Parameters built-in", async () => {
    const source = await readFile(
        path.join(repoRoot, CANONICAL_CONSUMER_CAST_CONTRACT.publicNoAnyProof.path),
        "utf8",
    );
    const shadowed = `import type * as Parameters from "./fake-parameters.js";\n${source}`;
    const root = await mkdtemp(
        path.join(repoRoot, "wrapper/tests/types/.cast-proof-namespace-parameters-"),
    );
    try {
        await writeFile(path.join(root, "fake-parameters.d.ts"), "export type Item = unknown;\n");
        const fixture = path.join(root, "shadowed.test-d.ts");
        await writeFile(fixture, shadowed);
        const program = ts.createProgram({
            rootNames: [fixture],
            options: {
                module: ts.ModuleKind.ESNext,
                moduleResolution: ts.ModuleResolutionKind.Bundler,
                noEmit: true,
                skipLibCheck: true,
                strict: true,
                target: ts.ScriptTarget.ES2022,
            },
        });
        assert.deepEqual(ts.getPreEmitDiagnostics(program), []);
        assert.notDeepEqual(validatePublicNoAnyProofSource(shadowed), []);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("does not flag a discarded unsafe comma-expression operand", async () => {
    await withFixture(requestFixture('(body as never, { workspaceId: "safe" })'), async (root) => {
        const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
        assert.deepEqual(result.failures, []);
    });
});

test("still rejects the contributing branch of a conditional request expression", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown, unsafe: boolean) { return client.projects.create(unsafe ? body as never : { workspaceId: "safe" }); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as never.*CreateProjectsRequest/i);
        },
    );
});

test("rejects proof markers that exist only in comments", () => {
    const comments = CANONICAL_CONSUMER_CAST_CONTRACT.publicNoAnyProof.contains
        .map((marker) => `// type ${marker} = AssertFalse<IsAny<unknown>>;`)
        .join("\n");
    assert.equal(
        validatePublicNoAnyProofSource(comments).length,
        CANONICAL_CONSUMER_CAST_CONTRACT.publicNoAnyProof.contains.length +
            Object.keys(CANONICAL_CONSUMER_CAST_CONTRACT.publicNoAnyProof.adapterAliases).length +
            2,
    );
});

for (const [label, mutate] of [
    [
        "string operand",
        (source) => source.replace('Parameters<Adapter["getCurrent"]>[0]', "string"),
    ],
    [
        "unknown operand",
        (source) => source.replace('Parameters<RootAdapter["archive"]>[0]', "unknown"),
    ],
    ["hollow IsAny", (source) => source.replace("0 extends 1 & T ? true : false", "false")],
]) {
    test(`rejects a hollow public no-any proof: ${label}`, async () => {
        const source = await readFile(
            path.join(repoRoot, CANONICAL_CONSUMER_CAST_CONTRACT.publicNoAnyProof.path),
            "utf8",
        );
        assert.notDeepEqual(validatePublicNoAnyProofSource(mutate(source)), []);
    });
}

test("pins the compiler-owned public no-any proof into the consumer cast Make target", async () => {
    const makefile = await readFile(path.join(repoRoot, "Makefile"), "utf8");
    assert.deepEqual(validateConsumerCastMakeWiring(makefile), []);
});

test("rejects sdk-wrapper-build mentioned only in a Make comment", async () => {
    const makefile = await readFile(path.join(repoRoot, "Makefile"), "utf8");
    const tampered = makefile.replace(
        "consumer-cast-budget: sdk-wrapper-build",
        "consumer-cast-budget: # sdk-wrapper-build",
    );
    assert.match(validateConsumerCastMakeWiring(tampered).join("\n"), /sdk-wrapper-build/);
});

for (const command of [
    "node --test scripts/check-consumer-cast-budget.test.mjs",
    "node scripts/check-consumer-cast-budget.mjs",
    "npm run type-check:breaking -w clockify-sdk-ts-115",
]) {
    test(`rejects a required Make recipe mentioned only in a comment: ${command}`, async () => {
        const makefile = await readFile(path.join(repoRoot, "Makefile"), "utf8");
        const tampered = makefile.replaceAll(`\t${command}`, `\t# ${command}`);
        assert.match(validateConsumerCastMakeWiring(tampered).join("\n"), /must execute/);
    });
}

test("rejects a chained unknown assertion to a generated request", async () => {
    await withFixture(
        requestFixture("body as unknown as ClockifyApi.CreateProjectsRequest"),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(
                result.failures.join("\n"),
                /CreateProjectsRequest.*cli\/src\/fixture\.ts:2/i,
            );
        },
    );
});

for (const [label, assertion] of [
    ["direct", "body as ClockifyApi.CreateProjectsRequest"],
    ["angle-bracket", "<ClockifyApi.CreateProjectsRequest>body"],
]) {
    test(`rejects a ${label} generated-request assertion`, async () => {
        await withFixture(requestFixture(assertion), async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /CreateProjectsRequest/);
        });
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
        requestFixture(
            "castRequest(body)",
            "function castRequest<T>(value: unknown): T { return value as T; }\n",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /helper.*cli\/src\/fixture\.ts:2/i);
        },
    );
});

test("rejects a blanket request helper imported from another governed file", async () => {
    await withFixture(
        `${generatedImports}import { castRequest } from './helper.js';\nexport async function run(client: FixtureClient, body: unknown) { return client.projects.create(castRequest(body)); }\n`,
        async (root) => {
            await writeFile(
                path.join(root, "cli/src/helper.ts"),
                "export function castRequest<T>(value: unknown): T { return value as T; }\n",
            );
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /helper.*cli\/src\/helper\.ts:1/i);
        },
    );
});

test("rejects an any-typed request adapter", async () => {
    await withFixture(
        requestFixture(
            "requestAdapter(body)",
            "export function requestAdapter(value: any): any { return value; }\n",
        ),
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(
                result.failures.join("\n"),
                /any.*requestAdapter.*cli\/src\/fixture\.ts:2/i,
            );
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
            requestFixture("body as ClockifyApi.CreateProjectsRequest"),
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
    [
        "missing discrepancy",
        (entry) => (entry.discrepancyId = "missing.discrepancy"),
        /discrepancyId.*does not exist/i,
    ],
    [
        "missing risk",
        (entry) => (entry.openRiskId = "missing-risk"),
        /openRiskId.*existing open risk/i,
    ],
    [
        "missing evidence",
        (entry) => (entry.evidence.path = "docs/evidence/missing.md"),
        /evidence\.path.*does not exist/i,
    ],
    [
        "missing evidence anchor",
        (entry) => (entry.evidence.anchor = "missing-anchor"),
        /evidence\.anchor.*does not exist/i,
    ],
    [
        "missing closure target",
        (entry) => (entry.exactClosureGate = "missing-gate"),
        /exactClosureGate.*(?:open risk|Makefile)/i,
    ],
    ["stale code marker", (entry) => (entry.codeMarker = "stale marker"), /codeMarker.*found 0/i],
]) {
    test(`rejects an exception with a ${label}`, async () => {
        await withFixture(
            requestFixture("body as ClockifyApi.CreateProjectsRequest"),
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
    await withFixture(requestFixture("body as ClockifyApi.CreateProjectsRequest"), async (root) => {
        await writeGovernanceReferences(root);
        const result = await validateConsumerCastGovernance({
            root,
            contract: exceptionContract(completeException()),
        });
        assert.deepEqual(result.failures, []);
    });
});

test("accepts an exact file/range instead of a stable code marker", async () => {
    await withFixture(requestFixture("body as ClockifyApi.CreateProjectsRequest"), async (root) => {
        await writeGovernanceReferences(root);
        const exception = completeException();
        delete exception.codeMarker;
        exception.range = { startLine: 2, endLine: 2 };
        const result = await validateConsumerCastGovernance({
            root,
            contract: exceptionContract(exception),
        });
        assert.deepEqual(result.failures, []);
    });
});

test("rejects an orphaned exception whose marker exists without a request cast", async () => {
    await withFixture(
        "export const marker = 'body as ClockifyApi.CreateProjectsRequest';\n",
        async (root) => {
            await writeGovernanceReferences(root);
            const result = await validateConsumerCastGovernance({
                root,
                contract: exceptionContract(completeException()),
            });
            assert.match(result.failures.join("\n"), /stale or orphaned.*found 0/i);
        },
    );
});

test("rejects non-empty exceptions in the canonical zero baseline", async () => {
    await withFixture(requestFixture("body as ClockifyApi.CreateProjectsRequest"), async (root) => {
        await writeGovernanceReferences(root);
        const result = await validateConsumerCastGovernance({
            root,
            contract: exceptionContract(completeException(), true),
        });
        assert.match(
            result.failures.join("\n"),
            /exceptions\.cli must stay empty.*canonical zero baseline/i,
        );
    });
});

test("rejects duplicate exception ids and duplicate cast ownership", async () => {
    await withFixture(requestFixture("body as ClockifyApi.CreateProjectsRequest"), async (root) => {
        await writeGovernanceReferences(root);
        const first = completeException();
        const second = structuredClone(first);
        const contract = exceptionContract(first);
        contract.requestCastGovernance.exceptions.cli.push(second);
        const result = await validateConsumerCastGovernance({ root, contract });
        assert.match(result.failures.join("\n"), /exception id.*must be unique/i);
        assert.match(result.failures.join("\n"), /duplicates cli\/src\/fixture\.ts:2/i);
    });
});
