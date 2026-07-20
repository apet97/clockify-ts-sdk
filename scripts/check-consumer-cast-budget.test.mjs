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
