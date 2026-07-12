#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const tagOnlyGuard = "if: github.event_name == 'push' && github.ref_type == 'tag'";

function validateTagOnlyGuards(workflow, label) {
    const failures = [];
    const refTypeGuards = workflow
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("if:") && line.includes("github.ref_type == 'tag'"));

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
        if (line !== tagOnlyGuard) {
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
            !["Publish to npm", "Create or update GitHub release"].includes(step.name)
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
        ["Audit all dependencies", ["npm audit --json"]],
        ["Audit production dependencies", ["npm audit --omit=dev --json"]],
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
            "Publish to npm",
            [
                "npm pack -w @apet97/clockify-mcp-115 --json",
                "LOCAL_INTEGRITY",
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
        ["npm audit --json", "MCP release must run the full npm audit"],
        ["npm audit --omit=dev --json", "MCP release must run the production npm audit"],
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
        "Audit all dependencies",
        "Audit production dependencies",
        "Build and validate MCPB and SPDX assets",
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

    return failures;
}

function main() {
    const failures = [];
    const cliPath = ".github/workflows/ci-cli-release.yml";
    const mcpPath = ".github/workflows/ci-mcp-release.yml";
    const cliWorkflow = readFileSync(join(repoRoot, cliPath), "utf8");
    const mcpWorkflow = readFileSync(join(repoRoot, mcpPath), "utf8");

    failures.push(...validateTagOnlyGuards(cliWorkflow, cliPath));
    failures.push(...validateMcpReleaseWorkflow(mcpWorkflow));

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
