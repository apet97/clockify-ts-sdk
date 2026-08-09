import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateMutationCiContract } from "./lib/mutation-ci-workflow-contract.mjs";
import { commandsForPhase } from "./lib/verify-plan.mjs";

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
const cliStryker = readFileSync(new URL("../cli/stryker.conf.json", import.meta.url), "utf8");
const wrapperPackage = JSON.parse(
    readFileSync(new URL("../wrapper/package.json", import.meta.url), "utf8"),
);
const mcpPackage = JSON.parse(
    readFileSync(new URL("../mcp/package.json", import.meta.url), "utf8"),
);
const cliPackage = JSON.parse(
    readFileSync(new URL("../cli/package.json", import.meta.url), "utf8"),
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
        cliStryker,
        wrapperPackage,
        mcpPackage,
        cliPackage,
        verifyFullCommands: commandsForPhase("full"),
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

test("the checker rejects triggers beyond dispatch and the weekly schedule", () => {
    expectFailure(
        {
            workflow: workflow.replace(
                "on:\n  workflow_dispatch:",
                "on:\n  push:\n    branches: [main]\n  workflow_dispatch:",
            ),
        },
        /dispatch|trigger/i,
    );
});

test("the checker rejects a workflow with no weekly schedule (TST-2)", () => {
    // Dispatch-only was the TST-2 defect: mutation proof ran only when a
    // human asked, so a regression stayed invisible between requests.
    const withoutSchedule = workflow.replace(/^  schedule:\n(?:    .*\n)+/m, "");
    assert.notEqual(withoutSchedule, workflow, "expected a schedule block to remove");
    expectFailure({ workflow: withoutSchedule }, /schedule/i);
});

test("the checker rejects a drifted schedule cadence", () => {
    const drifted = workflow.replace(/cron: "[^"]+"/, 'cron: "0 5 1 * *"');
    assert.notEqual(drifted, workflow, "expected a cron line to rewrite");
    expectFailure({ workflow: drifted }, /schedule|cron/i);
});

test("scheduled runs resolve the missing dispatch input to the all target", () => {
    // On a schedule event `inputs.target` is empty, so every consumer must go
    // through the resolved MUTATION_TARGET env, which falls back to "all".
    const unresolved = workflow.replace(
        "MUTATION_TARGET: ${{ inputs.target || 'all' }}",
        "MUTATION_TARGET: ${{ inputs.target }}",
    );
    assert.notEqual(unresolved, workflow, "expected the resolved-target env to rewrite");
    expectFailure({ workflow: unresolved }, /MUTATION_TARGET/);
});

test("the checker rejects a floating action reference", () => {
    // Match whatever SHA is pinned, not a literal. Hardcoding it made this
    // self-defeating on every action bump: replace() found nothing, so the
    // "floating" workflow was still SHA-pinned and the checker correctly
    // passed, failing the test for an unrelated reason. Same defect as
    // check-mcp-release-workflow.test.mjs had.
    const floating = workflow.replace(/actions\/checkout@[0-9a-f]{40}/, "actions/checkout@v7");
    assert.notEqual(floating, workflow, "expected a SHA-pinned actions/checkout to rewrite");
    expectFailure({ workflow: floating }, /immutable|SHA/i);
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
                "if: ${{ env.MUTATION_TARGET == 'wrapper' }}",
                "if: ${{ env.MUTATION_TARGET == 'all' }}",
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
        /missing.*report|report.*missing|if-no-files-found/i,
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
                /^perfect-full:[^\n]*/m,
                (line) => `${line} mutation`,
            ),
        },
        /perfect-full.*local mutation|local mutation.*perfect-full/i,
    );
});

test("the local mutation guard runs before any generated-tree write", () => {
    const start = makefile.indexOf("mutation:\n");
    const end = makefile.indexOf("\n\nmutation-ci:", start);
    assert.ok(start >= 0 && end > start, "expected the mutation recipe");
    const recipe = makefile.slice(start, end);
    const guard = recipe.indexOf('test "$$GITHUB_ACTIONS" = \'true\'');
    const generation = recipe.indexOf("$(MAKE) --no-print-directory sdk-codegen");
    assert.ok(guard >= 0, "mutation must have a GitHub Actions guard");
    assert.ok(generation > guard, "the guard must precede SDK generation");
    assert.doesNotMatch(makefile, /^mutation:\s+sdk-codegen$/m);
});

test("the checker rejects loss or duplication of mutation-ci in the full plan", () => {
    const full = commandsForPhase("full");
    expectFailure(
        {
            verifyFullCommands: full.filter(
                (entry) => !(entry.command === "make" && entry.args.includes("mutation-ci")),
            ),
        },
        /full.*mutation-ci.*exactly once/i,
    );
    expectFailure(
        { verifyFullCommands: [...full, { command: "make", args: ["mutation-ci"] }] },
        /full.*mutation-ci.*exactly once/i,
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

test("the checker pins the exact CLI mutation scope and test inventory", () => {
    const config = JSON.parse(cliStryker);
    assert.deepEqual(config.mutate.filter((entry) => !entry.startsWith("!")), [
        "cli/src/commands/leaf-command.ts",
        "cli/src/commands/resolve-refs.ts",
        "cli/src/receipt.ts",
    ]);
    assert.deepEqual(config.testFiles, [
        "cli/tests/command-risk.test.ts",
        "cli/tests/mutation-leaves.test.ts",
        "cli/tests/receipt.test.ts",
        "cli/tests/resolve-refs.test.ts",
    ]);
});

test("the workflow exposes CLI as an exact guarded target", () => {
    assert.match(workflow, /options:\n          - all\n          - wrapper\n          - mcp\n          - cli/);
    assert.match(
        workflow,
        /- name: Run CLI mutation\n        if: \$\{\{ env\.MUTATION_TARGET == 'cli' \}\}\n        run: npm run mutation -w @apet97\/clockify-cli-115/,
    );
    assert.match(
        workflow,
        /- name: Check CLI mutation floor\n        if: \$\{\{ env\.MUTATION_TARGET == 'cli' \}\}\n        run: node scripts\/check-mutation-score\.mjs --package cli/,
    );
});

test("the checker rejects a missing, duplicate, or wrong CLI target choice", () => {
    expectFailure(
        { workflow: workflow.replace("          - cli\n", "") },
        /target options.*cli/i,
    );
    expectFailure(
        { workflow: workflow.replace("          - cli\n", "          - mcp\n          - cli\n") },
        /target options.*exactly/i,
    );
    expectFailure(
        { workflow: workflow.replace("          - cli\n", "          - unknown\n") },
        /target options.*cli/i,
    );
});

test("the checker rejects a CLI command or score checker attached to the wrong target", () => {
    expectFailure(
        {
            workflow: workflow.replace(
                "if: ${{ env.MUTATION_TARGET == 'cli' }}\n        run: npm run mutation -w @apet97/clockify-cli-115",
                "if: ${{ env.MUTATION_TARGET == 'all' }}\n        run: npm run mutation -w @apet97/clockify-cli-115",
            ),
        },
        /CLI mutation condition/i,
    );
    expectFailure(
        {
            workflow: workflow.replace(
                "node scripts/check-mutation-score.mjs --package cli",
                "node scripts/check-mutation-score.mjs --package mcp",
            ),
        },
        /CLI floor condition/i,
    );
});

test("the checker rejects incomplete target-aware artifact verification and non-unique names", () => {
    expectFailure(
        {
            workflow: workflow.replace(
                "cli/reports/mutation/mutation.json'\n              ;;",
                "cli/reports/mutation/missing.json'\n              ;;",
            ),
        },
        /report assignment.*all.*exact/i,
    );
    expectFailure(
        {
            workflow: workflow.replace(
                "name: mutation-reports-${{ env.MUTATION_TARGET }}-${{ github.run_attempt }}",
                "name: mutation-reports-${{ github.run_attempt }}",
            ),
        },
        /artifact name.*target.*run attempt/i,
    );
});

test("the checker rejects extra reports from aggregate and focused artifact path sets", () => {
    expectFailure(
        {
            workflow: workflow.replace(
                "cli/reports/mutation/mutation.json'\n              ;;\n            wrapper)",
                "cli/reports/mutation/mutation.json\\nspurious/reports/mutation/mutation.json'\n              ;;\n            wrapper)",
            ),
        },
        /all.*exact.*report|report.*all.*exact/i,
    );
    expectFailure(
        {
            workflow: workflow.replace(
                "reports='cli/reports/mutation/mutation.json'",
                "reports='cli/reports/mutation/mutation.json\\nspurious/reports/mutation/mutation.json'",
            ),
        },
        /cli.*exact.*report|report.*cli.*exact/i,
    );
});

test("the checker rejects a later verifier-output override", () => {
    expectFailure(
        {
            workflow: workflow.replace(
                '          done <<< "$reports"\n',
                '          done <<< "$reports"\n          echo "paths=docs/README.md" >> "$GITHUB_OUTPUT"\n',
            ),
        },
        /canonical.*verifier|verifier.*canonical|GITHUB_OUTPUT/i,
    );
});

test("the checker rejects a wrong CLI Stryker scope, test runner, reporter, or runtime limit", () => {
    for (const [replacement, pattern] of [
        [
            cliStryker.replace("cli/src/receipt.ts", "cli/src/receipt-copy.ts"),
            /CLI Stryker mutate/i,
        ],
        [
            cliStryker.replace("cli/vitest.config.ts", "mcp/vitest.config.ts"),
            /CLI Stryker vitest/i,
        ],
        [
            cliStryker.replace('"clear-text"', '"html"'),
            /CLI Stryker reporters/i,
        ],
        [
            cliStryker.replace('"timeoutMS": 60000', '"timeoutMS": 30000'),
            /CLI Stryker timeoutMS/i,
        ],
    ]) {
        expectFailure({ cliStryker: replacement }, pattern);
    }
});

test("the checker parses the mutation recipe instead of accepting a stray CLI command", () => {
    expectFailure(
        {
            makefile: makefile
                .replace(
                    "\tCLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm run mutation -w @apet97/clockify-cli-115\n",
                    "",
                )
                .concat("\nstray-cli-mutation:\n\tnpm run mutation -w @apet97/clockify-cli-115\n"),
        },
        /mutation Makefile recipe.*wrapper, MCP, CLI/i,
    );
});

test("mutation entrypoints generate ignored runtime versions before Stryker", () => {
    const generator = "node ../scripts/generate-package-versions.mjs && ";
    for (const [label, manifest] of [
        ["wrapper", wrapperPackage],
        ["MCP", mcpPackage],
        ["CLI", cliPackage],
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
    assert.match(
        cliPackage.scripts.mutation,
        /generate-package-versions\.mjs && npm run build -w clockify-sdk-ts-115 && cd \.\. && CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' stryker run cli\/stryker\.conf\.json$/,
        "CLI mutation must build its SDK workspace dependency before Vitest discovery",
    );
});

test("CI contracts document the hardened GitHub-only mutation proof", () => {
    const entry = ciContract.workflows.find(
        (candidate) => candidate.path === ".github/workflows/mutation.yml",
    );
    assert.ok(entry);
    for (const marker of [
        'node-version: "22.13.0"',
        "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
        "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
        "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
        "if-no-files-found: error",
        "retention-days: 14",
        "fetch-depth: 0",
        "npm run mutation -w @apet97/clockify-cli-115",
        "node scripts/check-mutation-score.mjs --package cli",
        "Verify expected mutation reports",
        "cli/reports/mutation/mutation.json",
    ]) {
        assert.ok(entry.mustContain.includes(marker), `CI contract is missing: ${marker}`);
    }

    assert.match(ciPolicy, /mutation\.yml[^\n]*weekly-scheduled[^\n]*dispatch-capable[^\n]*CLI[^\n]*Node 22\.13\.0/i);
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
