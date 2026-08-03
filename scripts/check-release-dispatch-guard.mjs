#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const tagOnlyGuard = "if: github.event_name == 'push' && github.ref_type == 'tag'";
const releaseStateScript = "scripts/release-state.mjs";
const registrySmokeScript = "scripts/registry-smoke.mjs";
const uploadArtifactSha = "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a";

function activeRun(step) {
    return typeof step?.run === "string"
        ? step.run
              .split("\n")
              .map((line) => line.replace(/\s+#.*$/, "").trim())
              .filter((line) => line !== "" && !line.startsWith("#"))
              .join("\n")
        : "";
}

function parsedReleaseSteps(workflow, label, failures) {
    try {
        const parsed = YAML.parse(workflow);
        const jobs = parsed?.jobs;
        const job = jobs && typeof jobs === "object" ? Object.values(jobs).find((candidate) => Array.isArray(candidate?.steps)) : null;
        if (!job) {
            failures.push(`${label}: strict release contract requires a job with steps`);
            return [];
        }
        return job.steps;
    } catch (error) {
        failures.push(`${label}: strict release workflow is invalid YAML: ${error.message}`);
        return [];
    }
}

function strictTagGuard(step) {
    return step?.if === tagOnlyGuard.slice(4);
}

/**
 * Validate the exact-artifact release contract. The function is exported so
 * the regression suites can exercise each failure against small fixtures; the
 * workflow-specific validators below opt into it when a release workflow
 * declares the state engine.
 */
export function validateReleaseWorkflowInvariants(workflow, { label = "release workflow", requireDispatch = true } = {}) {
    const failures = [];
    const steps = parsedReleaseSteps(workflow, label, failures);
    const activeSteps = steps.map((step) => ({ step, run: activeRun(step) }));
    const allRunText = activeSteps.map(({ run }) => run).join("\n");
    const externalWrite = ({ run }) => /\bnpm\s+publish\b|\bgh\s+release\s+(?:create|edit|upload|delete)\b|\bgit\s+(?:tag|push)\b|\bnpm\s+dist-tag\b/.test(run);
    const externalSteps = activeSteps.filter(externalWrite);

    if (requireDispatch && !workflow.includes("workflow_dispatch: {}") && !/workflow_dispatch:\s*\{\}/.test(workflow)) {
        failures.push(`${label}: strict release workflow must support proof-only workflow_dispatch`);
    }
    if (!workflow.includes(releaseStateScript)) failures.push(`${label}: release state engine is missing`);
    if (!workflow.includes(registrySmokeScript)) failures.push(`${label}: shared registry smoke harness is missing`);
    const requiredMarkers = ["published_now", "already_present_matching", "integrity_mismatch", "LOCAL_INTEGRITY", "REMOTE_INTEGRITY", "dist.integrity", "$GITHUB_STEP_SUMMARY"];
    if (requireDispatch) requiredMarkers.unshift("proof_only");
    for (const marker of requiredMarkers) {
        if (!allRunText.includes(marker) && !workflow.includes(marker)) failures.push(`${label}: release contract is missing ${marker}`);
    }
    if (requireDispatch && !allRunText.includes("proof-only")) {
        failures.push(`${label}: dispatch path must execute the proof-only state transition`);
    }

    const nonDryPacks = (allRunText.match(/\bnpm\s+pack\b(?![^\n]*--dry-run)/g) ?? []).length;
    if (nonDryPacks !== 1) failures.push(`${label}: exact artifact must be packed exactly once (found ${nonDryPacks})`);
    const packStep = activeSteps.find(({ run }) => /\bnpm\s+pack\b(?![^\n]*--dry-run)/.test(run));
    if (!packStep?.run.includes("PACKAGE_TARBALL") && !allRunText.includes("PACKAGE_TARBALL")) {
        failures.push(`${label}: exact pack path must be recorded as PACKAGE_TARBALL`);
    }
    const localIntegrityIndex = allRunText.indexOf("LOCAL_INTEGRITY");
    const remoteIntegrityIndex = allRunText.indexOf("REMOTE_INTEGRITY");
    if (localIntegrityIndex < 0 || remoteIntegrityIndex < 0 || remoteIntegrityIndex < localIntegrityIndex) {
        failures.push(`${label}: local integrity must be recorded before the remote integrity comparison`);
    }
    if (!/LOCAL_INTEGRITY[\s\S]*REMOTE_INTEGRITY|REMOTE_INTEGRITY[\s\S]*LOCAL_INTEGRITY/.test(allRunText) || !/does not match|integrity_mismatch/.test(allRunText)) {
        failures.push(`${label}: local/remote mismatch must be an explicit fatal path`);
    }

    const smokeText = allRunText.slice(allRunText.indexOf(registrySmokeScript));
    if (!smokeText.includes("--timeout-ms")) failures.push(`${label}: registry smoke must have an explicit timeout`);
    if (/registry-smoke\.mjs[^\n]*(?:GITHUB_REF_NAME|github\.ref_name)/.test(allRunText)) {
        failures.push(`${label}: registry smoke must use the manifest version, not the branch/tag ref`);
    }

    for (const { step } of activeSteps) {
        const run = activeRun(step);
        const rootHelper = /(?:^|\n)(?:make\s+|node\s+scripts\/|npm\s+(?:ci|pack\b|run\s+[^\n]*\s+-w|test\s+[^\n]*\s+-w))/.test(run);
        if (rootHelper && step["working-directory"] !== ".") {
            failures.push(`${label}: root helper step ${step.name ?? "unnamed"} must set working-directory: .`);
        }
        if (strictTagGuard(step) === false && step.if !== undefined && /always\(\)/.test(String(step.if)) && !["Finalize release receipt", "Upload release receipt"].includes(step.name)) {
            failures.push(`${label}: arbitrary if: always() step is not allowed: ${step.name ?? "unnamed"}`);
        }
    }
    for (const { step } of externalSteps) {
        if (!strictTagGuard(step)) failures.push(`${label}: external write step ${step.name ?? "unnamed"} must be pushed-tag-only`);
    }
    if (externalSteps.length === 0) failures.push(`${label}: strict release workflow must declare an external-write step`);
    if (allRunText.includes("git tag") || allRunText.includes("git push")) failures.push(`${label}: release workflow must not move tags`);
    if (/CLOCKIFY_API_KEY|CLOCKIFY_WORKSPACE_ID|secrets\.CLOCKIFY_/.test(workflow)) failures.push(`${label}: release workflow must not use live Clockify credentials`);

    for (const { step, run } of activeSteps.filter((entry) => entry.run.includes("release-state.mjs"))) {
        if (run.includes(" publish") && !strictTagGuard(step)) failures.push(`${label}: publication state transition is not tag-only`);
        if (run.includes("published_now") && !strictTagGuard(step)) failures.push(`${label}: branch dispatch cannot claim published_now`);
    }
    const uploads = steps.filter((step) => typeof step?.uses === "string" && step.uses.startsWith("actions/upload-artifact@"));
    if (uploads.length === 0) failures.push(`${label}: release receipt must be uploaded`);
    for (const step of uploads) {
        if (step.uses !== uploadArtifactSha) failures.push(`${label}: receipt upload action must use the pinned SHA`);
        if (step.name !== "Upload release receipt") failures.push(`${label}: receipt upload must use the named finalizer step`);
    }
    if (!steps.some((step) => step?.name === "Finalize release receipt" && /always\(\)/.test(String(step.if)))) {
        failures.push(`${label}: release receipt needs a named always-run finalizer`);
    }
    return failures;
}

export function validateWrapperReleaseWorkflow(workflow) {
    return workflow.includes(releaseStateScript)
        ? validateReleaseWorkflowInvariants(workflow, { label: ".github/workflows/release.yml", requireDispatch: false })
        : [];
}

function validateTagOnlyGuards(workflow, label) {
    const failures = [];
    const refTypeGuards = workflow
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line === tagOnlyGuard);

    if (refTypeGuards.length !== 2) {
        failures.push(`${label}: expected exactly 2 tag-only external-write guards, found ${refTypeGuards.length}`);
    }
    for (const guard of refTypeGuards) {
        if (guard !== tagOnlyGuard) {
            failures.push(`${label}: gate "${guard}" must require a pushed tag`);
        }
    }
    return failures;
}

export function validateCliReleaseWorkflow(workflow) {
    const label = ".github/workflows/ci-cli-release.yml";
    const failures = validateTagOnlyGuards(workflow, label);
    let steps = [];

    try {
        const parsed = YAML.parse(workflow);
        const job = parsed?.jobs?.publish;
        if (!job || !Array.isArray(job.steps)) {
            failures.push("CLI release must define the publish job with steps");
        } else {
            steps = job.steps;
        }
    } catch (error) {
        failures.push(`CLI release workflow is invalid YAML: ${error.message}`);
    }

    const stepNamed = (name) => steps.find((step) => step?.name === name);
    const setupStep = stepNamed("Setup Node.js 22.13.0");
    if (setupStep?.with?.["node-version"] !== "22.13.0") {
        failures.push("CLI release setup-node step must use exact Node 22.13.0");
    }

    for (const step of steps.filter((candidate) => typeof candidate?.uses === "string")) {
        const reference = step.uses.match(/@([^\s#]+)/)?.[1];
        if (!reference || !/^[0-9a-f]{40}$/.test(reference)) {
            failures.push(`CLI release action must use an immutable 40-character SHA: ${step.uses}`);
        }
    }

    const sdkStep = stepNamed("Generate + sync TS SDK (local generator)");
    const sdkCommands = typeof sdkStep?.run === "string" ? sdkStep.run : "";
    for (const command of ["make sdk-codegen", "npm run build -w clockify-sdk-ts-115"]) {
        if (!sdkCommands.includes(command)) {
            failures.push(`CLI release SDK dependency proof is missing: ${command}`);
        }
    }

    const publishStep = stepNamed("Publish to npm (with provenance from publishConfig)");
    if (publishStep?.if !== "github.event_name == 'push' && github.ref_type == 'tag'") {
        failures.push("CLI npm publish step must use a step-level pushed tag-only guard");
    }

    if (workflow.includes(releaseStateScript)) {
        failures.push(...validateReleaseWorkflowInvariants(workflow, { label }));
    }

    return failures;
}

export function validateMcpReleaseWorkflow(workflow) {
    const failures = validateTagOnlyGuards(workflow, ".github/workflows/ci-mcp-release.yml");
    const requireText = (text, message) => {
        if (!workflow.includes(text)) failures.push(message);
    };

    requireText("workflow_dispatch: {}", "MCP release must support proof-only workflow_dispatch");
    requireText('node-version: "22.13.0"', "MCP release must use exact Node 22.13.0");

    let steps = [];
    try {
        const parsed = YAML.parse(workflow);
        const job = parsed?.jobs?.["proof-and-release"];
        if (!job || !Array.isArray(job.steps)) {
            failures.push("MCP release must define the proof-and-release job with steps");
        } else {
            steps = job.steps;
        }
    } catch (error) {
        failures.push(`MCP release workflow is invalid YAML: ${error.message}`);
    }

    const stepNamed = (name) => steps.find((step) => step?.name === name);
    const activeRun = (step) =>
        typeof step?.run === "string"
            ? step.run
                  .split("\n")
                  .map((line) => line.replace(/\s+#.*$/, "").trim())
                  .filter((line) => line !== "" && !line.startsWith("#"))
                  .join("\n")
            : "";

    const setupStep = stepNamed("Setup Node.js 22.13.0");
    if (setupStep?.with?.["node-version"] !== "22.13.0") {
        failures.push("MCP release setup-node step must use exact Node 22.13.0");
    }

    for (const step of steps.filter((candidate) => typeof candidate?.uses === "string")) {
        const reference = step.uses.match(/@([^\s#]+)/)?.[1];
        if (!reference || !/^[0-9a-f]{40}$/.test(reference)) {
            failures.push(`MCP release action must use an immutable 40-character SHA: ${step.uses}`);
        }
    }

    const ifLines = workflow
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("if:"));
    for (const line of ifLines) {
        const allowedConditionalLines = new Set([
            tagOnlyGuard,
            "if: always()",
            "if: github.event_name == 'push' && github.ref_type == 'tag' || (github.event_name == 'workflow_dispatch' && inputs.registry_version != '')",
        ]);
        if (!allowedConditionalLines.has(line)) {
            failures.push(`manual dispatch must run all proof; external writes need a pushed tag guard: ${line}`);
        }
    }

    for (const [stepName, label] of [
        ["Publish to npm", "npm publish"],
        ["Create or update GitHub release", "GitHub release"],
    ]) {
        const step = stepNamed(stepName);
        if (step?.if !== "github.event_name == 'push' && github.ref_type == 'tag'") {
            failures.push(`${label} step must use a step-level pushed tag-only guard`);
        }
    }
    for (const step of steps) {
        if (
            step?.if !== undefined &&
            ![
                "Publish to npm",
                "Create or update GitHub release",
                "Finalize release receipt",
                "Upload release receipt",
                "Registry smoke",
                "Post-publish smoke install",
            ].includes(step.name)
        ) {
            failures.push(`manual dispatch must not skip proof step: ${step.name ?? "unnamed step"}`);
        }
    }

    const requiredStepCommands = new Map([
        ["Install workspaces", ["npm ci"]],
        [
            "Verify package, manifest, tag, and SDK peer",
            [
                "MCP_PACKAGE_NAME=",
                "MANIFEST_NAME=",
                "MANIFEST_VERSION=",
                "TAG_VERSION=",
                'npm view "clockify-sdk-ts-115@${SDK_VERSION}" version',
            ],
        ],
        [
            "Generate and verify the SDK",
            ["make sdk-codegen", "make sdk-codegen-drift sdk-codegen-test", "npm run build -w clockify-sdk-ts-115"],
        ],
        [
            "Run full MCP gates",
            [
                "npm run lint -w @apet97/clockify-mcp-115",
                "npm run type-check -w @apet97/clockify-mcp-115",
                "npm test -w @apet97/clockify-mcp-115",
                "npm run build -w @apet97/clockify-mcp-115",
                "make mcp-tool-manifest-drift mcp-write-safety mcp-contract",
                "npm pack --dry-run -w @apet97/clockify-mcp-115",
            ],
        ],
        [
            "Audit production dependencies (governed exceptions)",
            [
                "node --test scripts/check-npm-audit.test.mjs",
                "node scripts/check-npm-audit.mjs",
            ],
        ],
        [
            "Build and validate MCPB and SPDX assets",
            [
                "make mcpb-validate",
                "make mcpb-smoke",
                "make secret-hygiene",
                "mcp/clockify115-mcp-${MCP_VERSION}.mcpb",
                "mcp/clockify115-mcp-${MCP_VERSION}.spdx.json",
            ],
        ],
        [
            "Pack exact artifact",
            [
                "npm pack -w @apet97/clockify-mcp-115 --json",
                "PACKAGE_TARBALL",
                "LOCAL_INTEGRITY",
                "node scripts/release-state.mjs set-artifact",
            ],
        ],
        [
            "Publish to npm",
            [
                "REMOTE_INTEGRITY",
                "dist.integrity",
                'npm publish "$PACKAGE_TARBALL" --access public --provenance',
            ],
        ],
        [
            "Create or update GitHub release",
            [
                "gh release view",
                "gh release edit",
                "gh release create",
                "gh release upload",
                "mcp/clockify115-mcp-${MCP_VERSION}.mcpb",
                "mcp/clockify115-mcp-${MCP_VERSION}.spdx.json",
                "--clobber",
            ],
        ],
    ]);
    for (const [stepName, commands] of requiredStepCommands) {
        const run = activeRun(stepNamed(stepName));
        if (run === "") {
            failures.push(`MCP release is missing executable step: ${stepName}`);
            continue;
        }
        for (const command of commands) {
            if (!run.includes(command)) failures.push(`${stepName} must actively run: ${command}`);
        }
    }

    for (const [text, message] of [
        ["MCP_PACKAGE_NAME=", "MCP release must verify the package name"],
        ["MANIFEST_NAME=", "MCP release must verify the MCPB manifest name"],
        ["MANIFEST_VERSION=", "MCP release must read the MCPB manifest version"],
        ['"$MCP_VERSION" != "$MANIFEST_VERSION"', "MCP release must compare package and manifest versions"],
        ["TAG_VERSION=", "MCP release must verify the pushed tag version"],
        [
            'npm view "clockify-sdk-ts-115@${SDK_VERSION}" version',
            "MCP release must verify the required SDK peer exists with npm view",
        ],
        ["make sdk-codegen", "MCP release must generate the SDK"],
        ["make sdk-codegen-drift sdk-codegen-test", "MCP release must run SDK drift and fixture proof"],
        ["npm run lint -w @apet97/clockify-mcp-115", "MCP release must lint the MCP package"],
        ["npm run type-check -w @apet97/clockify-mcp-115", "MCP release must type-check the MCP package"],
        ["npm test -w @apet97/clockify-mcp-115", "MCP release must test the MCP package"],
        ["npm run build -w @apet97/clockify-mcp-115", "MCP release must build the MCP package"],
        [
            "make mcp-tool-manifest-drift mcp-write-safety mcp-contract",
            "MCP release must run manifest, write-safety, and MCP contract gates",
        ],
        ["npm pack --dry-run -w @apet97/clockify-mcp-115", "MCP release must dry-run the npm pack"],
        ["node scripts/check-npm-audit.mjs", "MCP release must run the governed production npm audit"],
        ["make mcpb-validate", "MCP release must run the MCPB artifact unit tests"],
        ["make mcpb-smoke", "MCP release must build and validate exact MCPB and SPDX artifacts"],
        ["make secret-hygiene", "MCP release must run the repository secret scan"],
        [
            "mcp/clockify115-mcp-${MCP_VERSION}.mcpb",
            "MCP release must use the explicit manifest-derived MCPB asset",
        ],
        [
            "mcp/clockify115-mcp-${MCP_VERSION}.spdx.json",
            "MCP release must use the explicit manifest-derived SPDX asset",
        ],
        ["gh release view", "GitHub release creation must be idempotent"],
        ["gh release edit", "An existing GitHub release must be updated"],
        ["gh release create", "A missing GitHub release must be created"],
        ["gh release upload", "GitHub release assets must be uploaded"],
        ["--clobber", "GitHub release asset upload must be idempotent"],
        ["LOCAL_INTEGRITY", "Reruns must compute the local npm tarball integrity"],
        ["REMOTE_INTEGRITY", "Reruns must read the published npm tarball integrity"],
        ["PACKAGE_TARBALL", "The exact npm tarball path must be retained in the release receipt"],
        ["node scripts/release-state.mjs set-artifact", "The exact artifact must be recorded in release state"],
        ["dist.integrity", "Reruns must compare against npm registry integrity"],
        [
            "does not match the already-published npm artifact",
            "Reruns must fail if the published npm artifact does not match",
        ],
    ]) {
        requireText(text, message);
    }

    if (/mcp\/clockify115-mcp-[^\n"']*[*?][^\n"']*/.test(workflow)) {
        failures.push("MCP release must reject wildcard artifact selection");
    }

    const releaseStep = activeRun(stepNamed("Create or update GitHub release"));
    for (const [asset, label] of [
        ["mcp/clockify115-mcp-${MCP_VERSION}.mcpb", "MCPB"],
        ["mcp/clockify115-mcp-${MCP_VERSION}.spdx.json", "SPDX"],
    ]) {
        if (!releaseStep.includes(asset)) failures.push(`GitHub release is missing the explicit ${label} asset`);
    }

    const orderedProof = [
        "Install workspaces",
        "Verify package, manifest, tag, and SDK peer",
        "Generate and verify the SDK",
        "Run full MCP gates",
        "Audit production dependencies (governed exceptions)",
        "Build and validate MCPB and SPDX assets",
        "Pack exact artifact",
        "Publish to npm",
        "Create or update GitHub release",
    ];
    let previous = -1;
    for (const marker of orderedProof) {
        const index = steps.findIndex((step) => step?.name === marker);
        if (index < 0) {
            failures.push(`MCP release is missing required step: ${marker}`);
            continue;
        }
        if (index <= previous) failures.push(`MCP release proof order is invalid at: ${marker}`);
        previous = index;
    }

    if (workflow.includes(releaseStateScript)) {
        failures.push(...validateReleaseWorkflowInvariants(workflow, { label: ".github/workflows/ci-mcp-release.yml" }));
    }

    return failures;
}

function main() {
    const failures = [];
    const cliPath = ".github/workflows/ci-cli-release.yml";
    const mcpPath = ".github/workflows/ci-mcp-release.yml";
    const wrapperPath = ".github/workflows/release.yml";
    const cliWorkflow = readFileSync(join(repoRoot, cliPath), "utf8");
    const mcpWorkflow = readFileSync(join(repoRoot, mcpPath), "utf8");
    const wrapperWorkflow = readFileSync(join(repoRoot, wrapperPath), "utf8");

    failures.push(...validateCliReleaseWorkflow(cliWorkflow));
    failures.push(...validateMcpReleaseWorkflow(mcpWorkflow));
    failures.push(...validateWrapperReleaseWorkflow(wrapperWorkflow));

    if (failures.length > 0) {
        console.error("Release workflow contract FAILED:");
        for (const failure of failures) console.error(`  - ${failure}`);
        process.exit(1);
    }
    console.log("Release workflow contract passed: manual runs are proof-only and MCP release proof is complete.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
