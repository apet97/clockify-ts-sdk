import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

test("rejects request escapes flowing through object binding elements", async () => {
    await withFixture(
        `${generatedImports}export async function run(client: FixtureClient, body: unknown) { const { request } = { request: body as any }; return client.projects.create(request); }\n`,
        async (root) => {
            const result = await validateConsumerCastGovernance({ root, contract: zeroContract });
            assert.match(result.failures.join("\n"), /as any.*CreateProjectsRequest/i);
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

test("rejects proof markers that exist only in comments", () => {
    const comments = CANONICAL_CONSUMER_CAST_CONTRACT.publicNoAnyProof.contains
        .map((marker) => `// type ${marker} = AssertFalse<IsAny<unknown>>;`)
        .join("\n");
    assert.equal(
        validatePublicNoAnyProofSource(comments).length,
        CANONICAL_CONSUMER_CAST_CONTRACT.publicNoAnyProof.contains.length + 2,
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
