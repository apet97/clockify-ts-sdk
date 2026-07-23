import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateMcpReleaseWorkflow } from "./check-release-dispatch-guard.mjs";

const workflow = readFileSync(
    new URL("../.github/workflows/ci-mcp-release.yml", import.meta.url),
    "utf8",
);
const makefile = readFileSync(new URL("../Makefile", import.meta.url), "utf8");
const ciContract = JSON.parse(readFileSync(new URL("../docs/ci-contract.json", import.meta.url), "utf8"));
const ciPolicy = readFileSync(new URL("../docs/ci-policy.md", import.meta.url), "utf8");

function requireInOrder(text, needles) {
    let previous = -1;
    for (const needle of needles) {
        const index = text.indexOf(needle);
        assert.notEqual(index, -1, `missing workflow proof: ${needle}`);
        assert.ok(index > previous, `workflow proof is out of order: ${needle}`);
        previous = index;
    }
}

test("MCP release uses exact Node 22.13.0 and immutable action SHAs", () => {
    assert.match(workflow, /node-version:\s*["']22\.13\.0["']/);
    for (const line of workflow.split("\n").filter((entry) => entry.trim().startsWith("uses:"))) {
        assert.match(line, /@[0-9a-f]{40}(?:\s+#\s+v[^\s]+)?\s*$/);
    }
});

test("manual dispatch runs proof while publish and GitHub release remain tag-only", () => {
    assert.match(workflow, /workflow_dispatch:\s*\{\}/);
    const tagOnlyGuard = "if: github.event_name == 'push' && github.ref_type == 'tag'";
    assert.equal(workflow.split(tagOnlyGuard).length - 1, 2);
    assert.match(workflow, /name: Publish to npm/);
    assert.match(workflow, /name: Create or update GitHub release/);
});

test("version, peer, generation, MCP, audit, MCPB, secret, and SBOM proofs precede publish", () => {
    requireInOrder(workflow, [
        "npm ci",
        "name: Verify package, manifest, tag, and SDK peer",
        "npm view \"clockify-sdk-ts-115@${SDK_VERSION}\" version",
        "make sdk-codegen",
        "make sdk-codegen-drift sdk-codegen-test",
        "npm run lint -w @apet97/clockify-mcp-115",
        "npm run type-check -w @apet97/clockify-mcp-115",
        "npm test -w @apet97/clockify-mcp-115",
        "npm run build -w @apet97/clockify-mcp-115",
        "make mcp-tool-manifest-drift mcp-write-safety mcp-contract",
        "npm pack --dry-run -w @apet97/clockify-mcp-115",
        "node scripts/check-npm-audit.mjs",
        "make mcpb-validate",
        "make mcpb-smoke",
        "make secret-hygiene",
        "mcp/clockify115-mcp-${MCP_VERSION}.spdx.json",
        "name: Publish to npm",
        "name: Create or update GitHub release",
    ]);
});

test("release uploads only the two explicit manifest-derived assets", () => {
    assert.match(workflow, /mcp\/clockify115-mcp-\$\{MCP_VERSION\}\.mcpb/);
    assert.match(workflow, /mcp\/clockify115-mcp-\$\{MCP_VERSION\}\.spdx\.json/);
    assert.doesNotMatch(workflow, /mcp\/clockify115-mcp-[*?]/);
    assert.match(workflow, /gh release upload[\s\S]*--clobber/);
});

test("release dispatch checker exposes a reusable MCP workflow validator", () => {
    assert.equal(typeof validateMcpReleaseWorkflow, "function");
    assert.deepEqual(validateMcpReleaseWorkflow(workflow), []);
});

function expectContractFailure(mutatedWorkflow, pattern) {
    const failures = validateMcpReleaseWorkflow(mutatedWorkflow);
    assert.ok(failures.some((failure) => pattern.test(failure)), failures.join("\n"));
}

test("checker rejects a missing manual-dispatch external-write guard", () => {
    expectContractFailure(
        workflow.replace(
            "if: github.event_name == 'push' && github.ref_type == 'tag'",
            "if: github.ref_type == 'tag'",
        ),
        /pushed tag|tag-only/i,
    );
});

test("checker rejects a floating Node runtime", () => {
    expectContractFailure(workflow.replace('node-version: "22.13.0"', 'node-version: "22"'), /22\.13\.0/);
});

test("checker rejects a floating action reference", () => {
    expectContractFailure(
        workflow.replace(
            "actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0",
            "actions/checkout@v7",
        ),
        /SHA|immutable/i,
    );
});

test("checker rejects wildcard MCPB artifact selection", () => {
    expectContractFailure(
        workflow.replace(
            "mcp/clockify115-mcp-${MCP_VERSION}.mcpb",
            "mcp/clockify115-mcp-*.mcpb",
        ),
        /wildcard/i,
    );
});

test("checker rejects publish before the proof chain completes", () => {
    expectContractFailure(
        workflow.replace("name: Run full MCP gates", "name: Publish to npm\n      - name: Run full MCP gates"),
        /order|precedes/i,
    );
});

test("checker rejects a missing published SDK peer check", () => {
    expectContractFailure(
        workflow.replace('npm view "clockify-sdk-ts-115@${SDK_VERSION}" version > /dev/null', "true"),
        /SDK peer|npm view/i,
    );
});

test("checker rejects a missing explicit SPDX release asset", () => {
    expectContractFailure(
        workflow.replaceAll(
            "mcp/clockify115-mcp-${MCP_VERSION}.spdx.json",
            "mcp/clockify115-mcp-${MCP_VERSION}.json",
        ),
        /SPDX|explicit asset/i,
    );
});

test("publish is recoverable when the exact npm package version already exists", () => {
    assert.match(workflow, /npm pack -w @apet97\/clockify-mcp-115 --json/);
    assert.match(workflow, /dist\.integrity/);
    assert.match(workflow, /LOCAL_INTEGRITY/);
    assert.match(workflow, /REMOTE_INTEGRITY/);
    assert.match(workflow, /does not match the already-published npm artifact/);
});

test("checker rejects a tag guard nested under env instead of attached to the step", () => {
    const misplaced = workflow.replace(
        "      - name: Publish to npm\n        if: github.event_name == 'push' && github.ref_type == 'tag'\n        env:",
        "      - name: Publish to npm\n        env:\n          if: github.event_name == 'push' && github.ref_type == 'tag'",
    );
    expectContractFailure(misplaced, /step-level|pushed tag/i);
});

test("checker ignores required commands that appear only in shell comments", () => {
    expectContractFailure(
        workflow.replace(
            '          npm view "clockify-sdk-ts-115@${SDK_VERSION}" version > /dev/null',
            '          # npm view "clockify-sdk-ts-115@${SDK_VERSION}" version > /dev/null',
        ),
        /SDK peer|npm view/i,
    );
});

test("checker ignores required commands after an inline shell comment", () => {
    expectContractFailure(
        workflow.replace(
            '          npm view "clockify-sdk-ts-115@${SDK_VERSION}" version > /dev/null',
            '          true # npm view "clockify-sdk-ts-115@${SDK_VERSION}" version > /dev/null',
        ),
        /SDK peer|npm view/i,
    );
});

test("make ci-contract runs the release workflow checker and its regression tests", () => {
    const start = makefile.indexOf("ci-contract:");
    const end = makefile.indexOf("\n\nlive-safety:", start);
    const target = makefile.slice(start, end);
    assert.match(target, /node --test scripts\/check-mcp-release-workflow\.test\.mjs/);
    assert.match(target, /node scripts\/check-release-dispatch-guard\.mjs/);
    assert.match(target, /node scripts\/test-release-workflow-sha-pins\.mjs/);
});

test("CI contract and policy document the proof-only MCP release posture", () => {
    const entry = ciContract.workflows.find(
        (candidate) => candidate.path === ".github/workflows/ci-mcp-release.yml",
    );
    assert.ok(entry);
    for (const marker of [
        'node-version: "22.13.0"',
        "Verify package, manifest, tag, and SDK peer",
        "node scripts/check-npm-audit.mjs",
        "make mcpb-validate",
        "make mcpb-smoke",
        "mcp/clockify115-mcp-${MCP_VERSION}.mcpb",
        "mcp/clockify115-mcp-${MCP_VERSION}.spdx.json",
        "Create or update GitHub release",
        "dist.integrity",
        'npm publish "$PACKAGE_TARBALL" --access public --provenance',
    ]) {
        assert.ok(entry.mustContain.includes(marker), `CI contract is missing: ${marker}`);
    }
    assert.match(ciPolicy, /workflow_dispatch[^\n]*full proof[^\n]*never publishes/i);
    assert.match(ciPolicy, /explicit[^\n]*MCPB[^\n]*SPDX/i);
});
