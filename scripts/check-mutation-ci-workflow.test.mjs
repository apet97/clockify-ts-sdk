import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateMutationCiContract } from "./lib/mutation-ci-workflow-contract.mjs";

const workflow = readFileSync(
    new URL("../.github/workflows/mutation.yml", import.meta.url),
    "utf8",
);
const makefile = readFileSync(new URL("../Makefile", import.meta.url), "utf8");
const wrapperStryker = readFileSync(
    new URL("../wrapper/stryker.conf.json", import.meta.url),
    "utf8",
);
const mcpStryker = readFileSync(new URL("../mcp/stryker.conf.json", import.meta.url), "utf8");
const wrapperPackage = JSON.parse(
    readFileSync(new URL("../wrapper/package.json", import.meta.url), "utf8"),
);
const mcpPackage = JSON.parse(
    readFileSync(new URL("../mcp/package.json", import.meta.url), "utf8"),
);
const ciContract = JSON.parse(
    readFileSync(new URL("../docs/ci-contract.json", import.meta.url), "utf8"),
);
const ciPolicy = readFileSync(new URL("../docs/ci-policy.md", import.meta.url), "utf8");
const qualityGates = readFileSync(new URL("../docs/quality-gates.md", import.meta.url), "utf8");
const docsReadme = readFileSync(new URL("../docs/README.md", import.meta.url), "utf8");

function validate(overrides = {}) {
    return validateMutationCiContract({
        workflow,
        makefile,
        wrapperStryker,
        mcpStryker,
        ...overrides,
    });
}

function expectFailure(overrides, pattern) {
    const failures = validate(overrides);
    assert.ok(
        failures.some((failure) => pattern.test(failure)),
        failures.join("\n"),
    );
}

test("the committed Mutation workflow satisfies the complete structural contract", () => {
    assert.deepEqual(validate(), []);
});

test("the checker rejects triggers other than manual dispatch", () => {
    expectFailure(
        {
            workflow: workflow.replace(
                "on:\n  workflow_dispatch:",
                "on:\n  push:\n    branches: [main]\n  workflow_dispatch:",
            ),
        },
        /dispatch-only|trigger/i,
    );
});

test("the checker rejects a floating action reference", () => {
    expectFailure(
        {
            workflow: workflow.replace(
                "actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0",
                "actions/checkout@v7",
            ),
        },
        /immutable|SHA/i,
    );
});

test("the mutation-floor checker receives complete first-parent history", () => {
    expectFailure(
        { workflow: workflow.replace("fetch-depth: 0", "fetch-depth: 2") },
        /fetch-depth.*0|complete first-parent contract history/i,
    );
});

test("the checker rejects a floating Node runtime", () => {
    expectFailure(
        { workflow: workflow.replace('node-version: "22.13.0"', 'node-version: "22"') },
        /22\.13\.0/,
    );
});

test("the checker rejects mutation commands attached to the wrong target", () => {
    expectFailure(
        {
            workflow: workflow.replace(
                "if: ${{ inputs.target == 'wrapper' }}",
                "if: ${{ inputs.target == 'all' }}",
            ),
        },
        /wrapper.*condition|condition.*wrapper/i,
    );
});

test("the checker rejects nonblank Clockify credentials", () => {
    expectFailure(
        { workflow: workflow.replace('CLOCKIFY_API_KEY: ""', 'CLOCKIFY_API_KEY: "secret"') },
        /CLOCKIFY_API_KEY|blank/i,
    );
});

test("the checker rejects an upload step that is not guaranteed to run", () => {
    expectFailure(
        { workflow: workflow.replace("if: always()", "if: success()") },
        /always|report/i,
    );
});

test("the checker rejects missing mutation reports and excessive retention", () => {
    expectFailure(
        { workflow: workflow.replace("if-no-files-found: error", "if-no-files-found: warn") },
        /missing.*report|if-no-files-found/i,
    );
    expectFailure(
        { workflow: workflow.replace("retention-days: 14", "retention-days: 90") },
        /retention|14 days/i,
    );
});

test("the checker rejects local Stryker execution from perfect-full", () => {
    expectFailure(
        {
            makefile: makefile.replace(
                "perfect-full: official-openapi-drift",
                "perfect-full: mutation official-openapi-drift",
            ),
        },
        /perfect-full.*local mutation|local mutation.*perfect-full/i,
    );
});

test("the checker retains the laptop-safe Stryker concurrency cap", () => {
    expectFailure(
        { wrapperStryker: wrapperStryker.replace('"concurrency": 2', '"concurrency": 8') },
        /wrapper.*concurrency|concurrency.*wrapper/i,
    );
    expectFailure(
        { mcpStryker: mcpStryker.replace('"concurrency": 2', '"concurrency": 8') },
        /MCP.*concurrency|concurrency.*MCP/i,
    );
});

test("the checker pins every dedicated MCP mutation test file", () => {
    expectFailure(
        {
            mcpStryker: mcpStryker.replace(
                '"concurrency": 2',
                '"testFiles": ["mcp/tests/confirmation-store.test.ts"],\n    "concurrency": 2',
            ),
        },
        /MCP.*testFiles/i,
    );
});

test("mutation entrypoints generate ignored runtime versions before Stryker", () => {
    const generator = "node ../scripts/generate-package-versions.mjs && ";
    for (const [label, manifest] of [
        ["wrapper", wrapperPackage],
        ["MCP", mcpPackage],
    ]) {
        assert.ok(
            manifest.scripts?.mutation?.startsWith(generator),
            `${label} mutation must generate manifest-derived runtime versions first`,
        );
    }
    assert.match(
        mcpPackage.scripts.mutation,
        /generate-package-versions\.mjs && npm run build -w clockify-sdk-ts-115 &&/,
        "MCP mutation must build its SDK workspace dependency before Vitest discovery",
    );
});

test("CI contracts document the hardened GitHub-only mutation proof", () => {
    const entry = ciContract.workflows.find(
        (candidate) => candidate.path === ".github/workflows/mutation.yml",
    );
    assert.ok(entry);
    for (const marker of [
        'node-version: "22.13.0"',
        "actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0",
        "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444",
        "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
        "if-no-files-found: error",
        "retention-days: 14",
        "fetch-depth: 0",
    ]) {
        assert.ok(entry.mustContain.includes(marker), `CI contract is missing: ${marker}`);
    }

    assert.match(ciPolicy, /mutation\.yml[^\n]*dispatch-only[^\n]*Node 22\.13\.0/i);
    assert.match(ciPolicy, /mutation\.yml[^\n]*complete history[^\n]*first-parent/i);
    assert.match(ciPolicy, /shallow history fails closed/i);
    assert.match(ciPolicy, /ci\.yml[^\n]*workspace[^\n]*Node 22\.13[^\n]*24/i);
    assert.doesNotMatch(ciPolicy, /\.github\/workflows\/ci-(?:cli|mcp)\.yml/);
    for (const document of [qualityGates, docsReadme]) {
        assert.match(document, /Mutation workflow[^\n]*exact Node 22\.13\.0/i);
        assert.match(document, /SHA-pinned[^\n]*14-day/i);
        assert.match(document, /historical maximum|maximum-floor/i);
        assert.match(document, /governed-(?:path|package\/module).*union/i);
    }
});
