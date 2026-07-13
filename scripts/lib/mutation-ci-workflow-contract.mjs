import YAML from "yaml";

import { perfectFullRunsLocalMutation } from "./perfect-full-prereqs.mjs";

const ACTIONS = Object.freeze({
    checkout: "actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd",
    setupNode: "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444",
    uploadArtifact: "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
});

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

export function validateMutationCiContract({ workflow, makefile, wrapperStryker, mcpStryker }) {
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
    if (!sameValues(target?.options, ["all", "wrapper", "mcp"])) {
        failures.push("target options must be exactly all, wrapper, mcp");
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

    const upload = namedStep(steps, "Upload mutation reports", failures);
    requireStep(
        upload,
        { if: "always()", uses: ACTIONS.uploadArtifact },
        "mutation report upload",
        failures,
    );
    if (upload?.with?.["if-no-files-found"] !== "error") {
        failures.push("if-no-files-found must error when a mutation report is missing");
    }
    if (upload?.with?.["retention-days"] !== 14) {
        failures.push("mutation report retention must be exactly 14 days");
    }
    for (const reportPath of ["wrapper/reports/mutation/**", "mcp/reports/mutation/**"]) {
        if (!upload?.with?.path?.split("\n").includes(reportPath)) {
            failures.push(`mutation report upload must include ${reportPath}`);
        }
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
    for (const marker of [
        "mutation-ci:",
        "node --test scripts/check-mutation-ci-workflow.test.mjs",
        "node scripts/check-mutation-ci-workflow.mjs",
        "npm run mutation -w clockify-sdk-ts-115",
        "npm run mutation -w @apet97/clockify-mcp-115",
        "node scripts/check-mutation-score.mjs",
    ]) {
        if (!makefile.includes(marker)) failures.push(`Makefile missing ${JSON.stringify(marker)}`);
    }

    for (const [label, text] of [
        ["wrapper", wrapperStryker],
        ["MCP", mcpStryker],
    ]) {
        const config = parseJson(text, `${label} Stryker config`, failures);
        if (config != null && config.concurrency !== 2) {
            failures.push(`${label} Stryker concurrency must remain 2`);
        }
        if (config != null && config.inPlace !== true) {
            failures.push(
                `${label} Stryker must run in place so Vitest resolves the instrumented module on Node 22`,
            );
        }
    }

    return failures;
}
