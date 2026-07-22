import YAML from "yaml";

import { perfectFullRunsLocalMutation } from "./perfect-full-prereqs.mjs";

const ACTIONS = Object.freeze({
    checkout: "actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0",
    setupNode: "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444",
    uploadArtifact: "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
});

const MCP_MUTATION_TEST_FILES = Object.freeze([
    "mcp/tests/confirmation-store.test.ts",
    "mcp/tests/result.test.ts",
    "mcp/tests/tool-registration.test.ts",
    "mcp/tests/tool-risk.test.ts",
]);

const CLI_MUTATION_TEST_FILES = Object.freeze([
    "cli/tests/command-risk.test.ts",
    "cli/tests/mutation-leaves.test.ts",
    "cli/tests/receipt.test.ts",
    "cli/tests/resolve-refs.test.ts",
]);

const CLI_MUTATION_SOURCES = Object.freeze([
    "cli/src/commands/leaf-command.ts",
    "cli/src/commands/resolve-refs.ts",
    "cli/src/receipt.ts",
    "!cli/dist/**",
    "!cli/*.config.*",
    "!cli/tests/**",
    "!cli/scripts/**",
]);

const MUTATION_REPORT_PATHS_BY_TARGET = Object.freeze({
    all: Object.freeze([
        "wrapper/reports/mutation/mutation.json",
        "mcp/reports/mutation/mutation.json",
        "cli/reports/mutation/mutation.json",
    ]),
    wrapper: Object.freeze(["wrapper/reports/mutation/mutation.json"]),
    mcp: Object.freeze(["mcp/reports/mutation/mutation.json"]),
    cli: Object.freeze(["cli/reports/mutation/mutation.json"]),
});

const CANONICAL_MUTATION_REPORT_VERIFIER_SCRIPT = [
    'case "${{ inputs.target }}" in',
    "  all)",
    "    reports=$'wrapper/reports/mutation/mutation.json\\nmcp/reports/mutation/mutation.json\\ncli/reports/mutation/mutation.json'",
    "    ;;",
    "  wrapper)",
    "    reports='wrapper/reports/mutation/mutation.json'",
    "    ;;",
    "  mcp)",
    "    reports='mcp/reports/mutation/mutation.json'",
    "    ;;",
    "  cli)",
    "    reports='cli/reports/mutation/mutation.json'",
    "    ;;",
    "  *)",
    '    echo "Unsupported mutation target: ${{ inputs.target }}" >&2',
    "    exit 1",
    "    ;;",
    "esac",
    "{",
    "  echo 'paths<<EOF'",
    '  echo "$reports"',
    "  echo EOF",
    '} >> "$GITHUB_OUTPUT"',
    "while IFS= read -r report; do",
    '  test -f "$report"',
    'done <<< "$reports"',
].join("\n");

function parseJson(text, label, failures) {
    try {
        return JSON.parse(text);
    } catch (error) {
        failures.push(`${label} must be valid JSON: ${error.message}`);
        return null;
    }
}

function sameValues(actual, expected) {
    return (
        Array.isArray(actual) &&
        actual.length === expected.length &&
        actual.every((value, index) => value === expected[index])
    );
}

function namedStep(steps, name, failures) {
    const matches = steps.filter((step) => step?.name === name);
    if (matches.length !== 1) {
        failures.push(`workflow must define exactly one ${JSON.stringify(name)} step`);
        return null;
    }
    return matches[0];
}

function requireStep(step, expected, label, failures) {
    if (step == null) return;
    for (const [key, value] of Object.entries(expected)) {
        if (step[key] !== value) {
            failures.push(`${label} ${key} must be ${JSON.stringify(value)}`);
        }
    }
}

function requireExactConfig(configText, label, expected, failures) {
    const config = parseJson(configText, `${label} Stryker config`, failures);
    if (config == null) return;
    for (const [key, value] of Object.entries(expected)) {
        if (JSON.stringify(config[key]) !== JSON.stringify(value)) {
            failures.push(`${label} Stryker ${key} must be ${JSON.stringify(value)}`);
        }
    }
}

function reportPathsForTarget(run, target) {
    const match = run?.match(
        new RegExp(
            String.raw`(?:^|\n)\s*${target}\)\s*\n\s*reports=(?:\$'([^']*)'|'([^']*)')`,
            "m",
        ),
    );
    if (match == null) return null;
    return (match[1] ?? match[2]).split("\\n");
}

function normalizeVerifierScript(value) {
    return typeof value === "string" ? value.replaceAll("\r\n", "\n").trimEnd() : null;
}

function mutationRecipe(makefile) {
    const lines = makefile.split("\n");
    const start = lines.findIndex((line) => line === "mutation: sdk-codegen");
    if (start < 0) return null;
    const recipe = [];
    for (const line of lines.slice(start + 1)) {
        if (!line.startsWith("\t")) break;
        recipe.push(line.slice(1));
    }
    return recipe;
}

export function validateMutationCiContract({
    workflow,
    makefile,
    wrapperStryker,
    mcpStryker,
    cliStryker,
    wrapperPackage,
    mcpPackage,
    cliPackage,
}) {
    const failures = [];
    let parsed;
    try {
        parsed = YAML.parse(workflow);
    } catch (error) {
        return [`workflow must be valid YAML: ${error.message}`];
    }

    if (parsed?.name !== "Mutation") failures.push('workflow name must be "Mutation"');

    const triggers = parsed?.on;
    if (
        triggers == null ||
        typeof triggers !== "object" ||
        !sameValues(Object.keys(triggers), ["workflow_dispatch"])
    ) {
        failures.push("Mutation must remain dispatch-only with no additional trigger");
    }

    const target = triggers?.workflow_dispatch?.inputs?.target;
    if (target?.required !== true) failures.push("target input must be required");
    if (target?.default !== "all") failures.push('target input must default to "all"');
    if (target?.type !== "choice") failures.push('target input type must be "choice"');
    if (!sameValues(target?.options, ["all", "wrapper", "mcp", "cli"])) {
        failures.push("target options must be exactly all, wrapper, mcp, cli");
    }

    for (const name of ["CLOCKIFY_API_KEY", "CLOCKIFY_WORKSPACE_ID"]) {
        if (parsed?.env?.[name] !== "") failures.push(`${name} must remain blank`);
    }

    const job = parsed?.jobs?.mutation;
    if (job == null || typeof job !== "object") {
        failures.push("workflow must define the mutation job");
        return failures;
    }
    if (job["runs-on"] !== "ubuntu-latest") failures.push("mutation job must run on ubuntu-latest");
    if (job["timeout-minutes"] !== 90) failures.push("mutation job timeout must remain 90 minutes");
    if (
        job.permissions?.contents !== "read" ||
        Object.keys(job.permissions ?? {}).some((permission) => permission !== "contents")
    ) {
        failures.push("mutation job permissions must be read-only contents");
    }

    const steps = Array.isArray(job.steps) ? job.steps : [];
    if (steps.length === 0) failures.push("mutation job must define steps");

    const checkout = namedStep(steps, "Checkout", failures);
    requireStep(checkout, { uses: ACTIONS.checkout }, "Checkout", failures);
    if (checkout?.with?.["persist-credentials"] !== false) {
        failures.push("Checkout persist-credentials must be false");
    }
    if (checkout?.with?.["fetch-depth"] !== 0) {
        failures.push(
            "Checkout fetch-depth must be 0 so the ratchet can prove complete first-parent contract history",
        );
    }

    const setup = namedStep(steps, "Setup Node.js 22.13.0", failures);
    requireStep(setup, { uses: ACTIONS.setupNode }, "Setup Node.js", failures);
    if (setup?.with?.["node-version"] !== "22.13.0") {
        failures.push("Mutation must use exact Node 22.13.0");
    }

    requireStep(
        namedStep(steps, "Install workspaces (root)", failures),
        { run: "npm ci" },
        "Install workspaces",
        failures,
    );
    requireStep(
        namedStep(steps, "Generate + sync TS SDK (local generator)", failures),
        { run: "make sdk-codegen" },
        "SDK generation",
        failures,
    );
    requireStep(
        namedStep(steps, "Run full mutation gate", failures),
        { if: "${{ inputs.target == 'all' }}", run: "make mutation" },
        "all target",
        failures,
    );
    requireStep(
        namedStep(steps, "Run wrapper mutation", failures),
        {
            if: "${{ inputs.target == 'wrapper' }}",
            run: "npm run mutation -w clockify-sdk-ts-115",
        },
        "wrapper mutation condition",
        failures,
    );
    requireStep(
        namedStep(steps, "Check wrapper mutation floor", failures),
        {
            if: "${{ inputs.target == 'wrapper' }}",
            run: "node scripts/check-mutation-score.mjs --package wrapper",
        },
        "wrapper floor condition",
        failures,
    );
    requireStep(
        namedStep(steps, "Run MCP mutation", failures),
        {
            if: "${{ inputs.target == 'mcp' }}",
            run: "npm run mutation -w @apet97/clockify-mcp-115",
        },
        "MCP mutation condition",
        failures,
    );
    requireStep(
        namedStep(steps, "Check MCP mutation floor", failures),
        {
            if: "${{ inputs.target == 'mcp' }}",
            run: "node scripts/check-mutation-score.mjs --package mcp",
        },
        "MCP floor condition",
        failures,
    );
    requireStep(
        namedStep(steps, "Run CLI mutation", failures),
        {
            if: "${{ inputs.target == 'cli' }}",
            run: "npm run mutation -w @apet97/clockify-cli-115",
        },
        "CLI mutation condition",
        failures,
    );
    requireStep(
        namedStep(steps, "Check CLI mutation floor", failures),
        {
            if: "${{ inputs.target == 'cli' }}",
            run: "node scripts/check-mutation-score.mjs --package cli",
        },
        "CLI floor condition",
        failures,
    );

    const verifyReports = namedStep(steps, "Verify expected mutation reports", failures);
    requireStep(
        verifyReports,
        { id: "mutation-reports", if: "always()", shell: "bash" },
        "target-aware mutation report verification",
        failures,
    );
    if (normalizeVerifierScript(verifyReports?.run) !== CANONICAL_MUTATION_REPORT_VERIFIER_SCRIPT) {
        failures.push(
            "target-aware mutation report verifier must equal the canonical script with exactly one GITHUB_OUTPUT write",
        );
    }
    const expectedReportVerification = [
        "all)",
        "wrapper/reports/mutation/mutation.json",
        "mcp/reports/mutation/mutation.json",
        "cli/reports/mutation/mutation.json",
        "wrapper)",
        "mcp)",
        "cli)",
        "test -f \"$report\"",
        "Unsupported mutation target",
    ];
    for (const marker of expectedReportVerification) {
        if (!verifyReports?.run?.includes(marker)) {
            failures.push(`target-aware mutation report verification must include ${JSON.stringify(marker)}`);
        }
    }
    for (const [targetName, expectedPaths] of Object.entries(MUTATION_REPORT_PATHS_BY_TARGET)) {
        const actualPaths = reportPathsForTarget(verifyReports?.run, targetName);
        if (!sameValues(actualPaths, expectedPaths)) {
            failures.push(
                `target-aware mutation report assignment for ${targetName} must equal the exact expected report path set`,
            );
        }
    }
    const outputBlocks = verifyReports?.run?.match(
        /\{\s*\n\s*echo 'paths<<EOF'\s*\n\s*echo "\$reports"\s*\n\s*echo EOF\s*\n\s*\} >> "\$GITHUB_OUTPUT"/g,
    );
    if (outputBlocks?.length !== 1) {
        failures.push("target-aware mutation report verification must emit exactly one selected report path set");
    }
    const upload = namedStep(steps, "Upload mutation reports", failures);
    requireStep(
        upload,
        { if: "always()", uses: ACTIONS.uploadArtifact },
        "mutation report upload",
        failures,
    );
    if (upload?.with?.name !== "mutation-reports-${{ inputs.target }}-${{ github.run_attempt }}") {
        failures.push("mutation report artifact name must preserve target and run attempt");
    }
    if (upload?.with?.["if-no-files-found"] !== "error") {
        failures.push("mutation report upload must error when a mutation report is missing");
    }
    if (upload?.with?.["retention-days"] !== 14) {
        failures.push("mutation report retention must be exactly 14 days");
    }
    if (upload?.with?.path !== "${{ steps.mutation-reports.outputs.paths }}") {
        failures.push("mutation report upload must use the verified target-aware path set");
    }
    if (steps.filter((step) => step?.uses === ACTIONS.uploadArtifact).length !== 1) {
        failures.push("Mutation workflow must define exactly one aggregate target-aware report upload");
    }

    for (const step of steps.filter((candidate) => typeof candidate?.uses === "string")) {
        if (!/@[0-9a-f]{40}$/.test(step.uses)) {
            failures.push(
                `${step.name ?? "unnamed action"} must use an immutable 40-character SHA`,
            );
        }
    }

    const perfectFullLine =
        makefile.split("\n").find((line) => line.startsWith("perfect-full:")) ?? "";
    if (!perfectFullLine.includes("mutation-ci"))
        failures.push("perfect-full must include mutation-ci");
    if (perfectFullRunsLocalMutation(perfectFullLine)) {
        failures.push("perfect-full must not run local mutation");
    }
    const recipe = mutationRecipe(makefile);
    const expectedRecipe = [
        "CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm run mutation -w clockify-sdk-ts-115",
        "CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm run mutation -w @apet97/clockify-mcp-115",
        "CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm run mutation -w @apet97/clockify-cli-115",
        "node scripts/check-mutation-score.mjs",
    ];
    if (!sameValues(recipe, expectedRecipe)) {
        failures.push("mutation Makefile recipe must run wrapper, MCP, CLI, then the shared checker exactly");
    }

    requireExactConfig(
        wrapperStryker,
        "wrapper",
        { concurrency: 2 },
        failures,
    );
    requireExactConfig(
        mcpStryker,
        "MCP",
        { concurrency: 2, testFiles: MCP_MUTATION_TEST_FILES },
        failures,
    );
    requireExactConfig(
        cliStryker,
        "CLI",
        {
            packageManager: "npm",
            testRunner: "vitest",
            vitest: { configFile: "cli/vitest.config.ts", dir: "cli", related: false },
            coverageAnalysis: "perTest",
            testFiles: CLI_MUTATION_TEST_FILES,
            mutate: CLI_MUTATION_SOURCES,
            reporters: ["json", "clear-text"],
            jsonReporter: { fileName: "cli/reports/mutation/mutation.json" },
            timeoutMS: 60000,
            concurrency: 2,
            tempDirName: "cli/.stryker-tmp",
        },
        failures,
    );
    for (const [label, manifest] of [["wrapper", wrapperPackage], ["MCP", mcpPackage], ["CLI", cliPackage]]) {
        if (!manifest?.scripts?.mutation?.startsWith("node ../scripts/generate-package-versions.mjs && ")) {
            failures.push(`${label} mutation entrypoint must generate manifest-derived runtime versions first`);
        }
    }
    for (const [label, manifest] of [["MCP", mcpPackage], ["CLI", cliPackage]]) {
        if (!/generate-package-versions\.mjs && npm run build -w clockify-sdk-ts-115 &&/.test(manifest?.scripts?.mutation ?? "")) {
            failures.push(`${label} mutation entrypoint must build its SDK workspace dependency before Vitest discovery`);
        }
    }

    return failures;
}
