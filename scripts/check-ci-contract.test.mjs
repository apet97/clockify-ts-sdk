import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import YAML from "yaml";

// Every assertion here failed to exist before 2026-07-28: check-ci-contract.mjs
// never opened docs/ci-contract.json, so `policyDocument`, `workflows[]` and
// `supportingDocs[]` could drift arbitrarily while the gate stayed green. Each
// test below pins one drift the old script would have waved through.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/check-ci-contract.mjs");
const releaseCiContract = JSON.parse(readFileSync(path.join(root, "docs/ci-contract.json"), "utf8"));
const releaseCiPolicy = readFileSync(path.join(root, "docs/ci-policy.md"), "utf8");

const PIN = "a".repeat(40);

const baseContract = () => ({
    schemaVersion: 1,
    purpose: "fixture",
    policyDocument: {
        path: "docs/ci-policy.md",
        mustContain: ["CI safety rules"],
        forbiddenMarkers: ["TODO"],
    },
    workflows: [
        {
            path: ".github/workflows/ci.yml",
            mustContain: ["name: Workspace CI", "persist-credentials: false"],
            semantic: {
                requireWorkflowDispatch: true,
                topLevelPermissions: { contents: "read" },
                forbiddenRunPatterns: ["\\bnpm\\s+publish\\b"],
                forbiddenWorkflowPatterns: ["NODE_AUTH_TOKEN", "NPM_TOKEN", "secrets.CLOCKIFY_"],
                jobStepOrder: [
                    {
                        job: "check",
                        require: ["make sdk-codegen", "make contract-gates"],
                        reason: "fixture",
                    },
                ],
            },
        },
    ],
    retiredWorkflows: [
        { path: ".github/workflows/ci-cli.yml", reason: "consolidated into ci.yml" },
    ],
    actionPinning: {
        purpose: "fixture",
        enforcedFor: [".github/workflows/ci.yml"],
        knownUnpinned: [
            {
                path: ".github/workflows/gap.yml",
                unpinnedUses: ["actions/setup-node@v5"],
                openRisk: "moving tag",
                closureTarget: "pin to SHA",
                discoveredBy: "fixture",
            },
        ],
    },
    supportingDocs: [{ path: "AGENTS.md", mustContain: ["Never run `npm publish`"] }],
    wiring: { makeTarget: "ci-contract", checker: "scripts/check-ci-contract.mjs" },
});

const baseFiles = () => ({
    ".github/workflows/ci.yml": [
        "name: Workspace CI",
        "on:",
        "  workflow_dispatch: {}",
        "permissions:",
        "  contents: read",
        "jobs:",
        "  check:",
        "    steps:",
        `      - uses: actions/checkout@${PIN} # v7.0.1`,
        "        with:",
        "          persist-credentials: false",
        "      - run: make sdk-codegen",
        "      - run: make contract-gates",
        "      - run: node scripts/check-ci-contract.mjs",
        "",
    ].join("\n"),
    ".github/workflows/gap.yml": "      - uses: actions/setup-node@v5\n",
    "docs/ci-policy.md": "CI safety rules\n",
    "AGENTS.md": "Never run `npm publish` from a laptop.\n",
    "scripts/check-ci-contract.mjs": "// placeholder for the wiring.checker existence check\n",
    Makefile: [
        "contract-gates: ci-contract",
        "perfect-fast: ci-contract",
        "perfect-full: ci-contract",
        "ci-contract:",
        "\tnode scripts/check-ci-contract.mjs",
        "",
    ].join("\n"),
});

/** Materialise a fixture repo and run the real checker against it. */
async function run({ contract = baseContract(), files = baseFiles() } = {}) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ci-contract-"));
    try {
        const all = { ...files, "docs/ci-contract.json": JSON.stringify(contract, null, 2) };
        for (const [relative, content] of Object.entries(all)) {
            if (content === null) continue;
            const absolute = path.join(dir, relative);
            await mkdir(path.dirname(absolute), { recursive: true });
            await writeFile(absolute, content);
        }
        return await new Promise((resolve) => {
            execFile("node", [script], { cwd: dir }, (error, stdout, stderr) => {
                resolve({ code: error?.code ?? 0, stdout, stderr });
            });
        });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

test("a consistent contract passes", async () => {
    const { code, stdout } = await run();
    assert.equal(code, 0, stdout);
    assert.match(stdout, /CI contract passed/);
});

test("CI policy pins tag-only exact-artifact release receipt markers", () => {
    for (const marker of [
        "scripts/release-state.mjs",
        "scripts/registry-smoke.mjs",
        "publish-capable workflows are tag-only",
        "manual proof surface",
        "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
        "$GITHUB_STEP_SUMMARY",
    ]) {
        assert.ok(releaseCiContract.policyDocument.mustContain.includes(marker), `contract missing ${marker}`);
        assert.ok(releaseCiPolicy.includes(marker), `policy missing ${marker}`);
    }
});

test("a stale workflow marker fails", async () => {
    // The exact drift that shipped: the contract demanded `name: CI` long after
    // the workflow was renamed `Workspace CI`, and nothing noticed.
    const contract = baseContract();
    contract.workflows[0].mustContain = ["name: CI"];
    const { code, stderr } = await run({ contract });
    assert.equal(code, 1);
    assert.match(stderr, /must contain "name: CI"/);
});

test("a workflow listed as both live and retired fails", async () => {
    // The contract shipped `ci-cli.yml` in workflows[] while the checker
    // separately asserted that file must not exist.
    const contract = baseContract();
    contract.workflows.push({ path: ".github/workflows/ci-cli.yml", mustContain: [] });
    const { code, stderr } = await run({ contract });
    assert.equal(code, 1);
    assert.match(stderr, /listed as a live workflow but also as retired/);
});

test("a retired workflow that still exists fails", async () => {
    const files = baseFiles();
    files[".github/workflows/ci-cli.yml"] = "name: CI (cli)\n";
    const { code, stderr } = await run({ files });
    assert.equal(code, 1);
    assert.match(stderr, /was retired but still exists/);
});

test("a workflow governed by neither pin list fails", async () => {
    // Pin coverage is total, so a newly added workflow cannot escape review by
    // simply not being mentioned in the contract.
    const files = baseFiles();
    files[".github/workflows/brand-new.yml"] = "      - uses: actions/checkout@v5\n";
    const { code, stderr } = await run({ files });
    assert.equal(code, 1);
    assert.match(stderr, /brand-new\.yml exists but is in neither enforcedFor nor knownUnpinned/);
});

test("an unpinned action in an enforced workflow fails", async () => {
    const files = baseFiles();
    files[".github/workflows/ci.yml"] = files[".github/workflows/ci.yml"].replace(
        `actions/checkout@${PIN} # v7.0.1`,
        "actions/checkout@v5",
    );
    const { code, stderr } = await run({ files });
    assert.equal(code, 1);
    assert.match(stderr, /is not SHA pinned/);
});

test("a recorded pin gap that is now pinned must be promoted", async () => {
    // The ratchet: knownUnpinned is a tracked gap, not a standing exemption.
    const files = baseFiles();
    files[".github/workflows/gap.yml"] = `      - uses: actions/setup-node@${PIN} # v5\n`;
    const { code, stderr } = await run({ files });
    assert.equal(code, 1);
    assert.match(stderr, /move it from knownUnpinned to enforcedFor/);
});

test("a pin gap missing its risk record fails", async () => {
    const contract = baseContract();
    delete contract.actionPinning.knownUnpinned[0].closureTarget;
    const { code, stderr } = await run({ contract });
    assert.equal(code, 1);
    assert.match(stderr, /must record closureTarget/);
});

test("a forbidden marker in the policy document fails", async () => {
    const files = baseFiles();
    files["docs/ci-policy.md"] = "CI safety rules\nTODO: finish this\n";
    const { code, stderr } = await run({ files });
    assert.equal(code, 1);
    assert.match(stderr, /must not contain "TODO"/);
});

test("a supporting doc that drops its marker fails", async () => {
    const files = baseFiles();
    files["AGENTS.md"] = "publish freely\n";
    const { code, stderr } = await run({ files });
    assert.equal(code, 1);
    assert.match(stderr, /supportingDocs: AGENTS\.md must contain/);
});

test("a contract entry naming a missing file fails", async () => {
    const contract = baseContract();
    contract.supportingDocs.push({ path: "docs/nope.md", mustContain: ["anything"] });
    const { code, stderr } = await run({ contract });
    assert.equal(code, 1);
    assert.match(stderr, /named by docs\/ci-contract\.json but does not exist/);
});

test("dropping ci-contract from an aggregate fails", async () => {
    const files = baseFiles();
    files.Makefile = files.Makefile.replace("perfect-fast: ci-contract", "perfect-fast:");
    const { code, stderr } = await run({ files });
    assert.equal(code, 1);
    assert.match(stderr, /perfect-fast cannot reach ci-contract/);
});

test("the parsed checker rejects a missing manual dispatch trigger", async () => {
    const files = baseFiles();
    files[".github/workflows/ci.yml"] = files[".github/workflows/ci.yml"].replace(
        "  workflow_dispatch: {}",
        "  push: {}",
    );
    const { code, stderr } = await run({ files });
    assert.equal(code, 1);
    assert.match(stderr, /must define workflow_dispatch: \{\}/);
});

test("a job whose steps run out of the required order fails", async () => {
    // mustContain proves presence, not sequence: swap the two run lines and a
    // pure substring check stays green even though the reordered job would
    // run contract-gates before the codegen it depends on (T9's gap).
    const files = baseFiles();
    files[".github/workflows/ci.yml"] = files[".github/workflows/ci.yml"].replace(
        "      - run: make sdk-codegen\n      - run: make contract-gates\n",
        "      - run: make contract-gates\n      - run: make sdk-codegen\n",
    );
    const { code, stderr } = await run({ files });
    assert.equal(code, 1);
    assert.match(stderr, /job "check" must run "make contract-gates" after "make sdk-codegen"/);
});

test("a job step missing entirely fails with the right marker named", async () => {
    const files = baseFiles();
    files[".github/workflows/ci.yml"] = files[".github/workflows/ci.yml"].replace(
        "      - run: make sdk-codegen\n",
        "",
    );
    const { code, stderr } = await run({ files });
    assert.equal(code, 1);
    assert.match(stderr, /job "check" must run "make sdk-codegen"/);
});

test("jobStepOrder naming a job that does not exist fails", async () => {
    const contract = baseContract();
    contract.workflows[0].semantic.jobStepOrder[0].job = "missing-job";
    const { code, stderr } = await run({ contract });
    assert.equal(code, 1);
    assert.match(stderr, /jobStepOrder names job "missing-job" which does not exist/);
});

test("the parsed checker rejects publication and secret surfaces", async () => {
    const files = baseFiles();
    files[".github/workflows/ci.yml"] = files[".github/workflows/ci.yml"].replace(
        "node scripts/check-ci-contract.mjs",
        "npm publish\n      - run: echo $NPM_TOKEN",
    );
    const { code, stderr } = await run({ files });
    assert.equal(code, 1);
    assert.match(stderr, /step run must not match/);
    assert.match(stderr, /must not contain \"NPM_TOKEN\"/);
});

test("Workspace CI has a safe parsed manual-dispatch contract", async () => {
    const workflow = YAML.parse(
        await readFile(path.join(root, ".github/workflows/ci.yml"), "utf8"),
    );
    const trigger = workflow.on;
    assert.deepEqual(trigger?.workflow_dispatch, {});
    assert.equal(workflow.permissions?.contents, "read");

    const scalarStrings = [];
    const collectStrings = (value) => {
        if (typeof value === "string") {
            scalarStrings.push(value);
            return;
        }
        if (Array.isArray(value)) {
            for (const item of value) collectStrings(item);
            return;
        }
        if (value && typeof value === "object") {
            for (const item of Object.values(value)) collectStrings(item);
        }
    };
    collectStrings(workflow);
    const scalarText = scalarStrings.join("\n");
    assert.doesNotMatch(scalarText, /\bnpm\s+publish\b/);
    assert.doesNotMatch(scalarText, /NODE_AUTH_TOKEN|NPM_TOKEN/);
    assert.doesNotMatch(scalarText, /secrets\.CLOCKIFY_(?:API_KEY|WORKSPACE_ID)/);
});

test("the real ci.yml contracts job actually runs sdk-codegen before contract-gates/governance-audit", async () => {
    // Proves the jobStepOrder entry is wired to the real workflow, not just a
    // fixture: parses the live file and re-derives the same ordering the
    // checker enforces (T9).
    const workflow = YAML.parse(
        await readFile(path.join(root, ".github/workflows/ci.yml"), "utf8"),
    );
    const semantic = releaseCiContract.workflows.find(
        (entry) => entry.path === ".github/workflows/ci.yml",
    )?.semantic;
    const orderEntry = semantic?.jobStepOrder?.find((entry) => entry.job === "contracts");
    assert.ok(orderEntry, "docs/ci-contract.json must define jobStepOrder for the contracts job");

    const steps = workflow.jobs?.contracts?.steps ?? [];
    const runText = steps.map((step) => (typeof step.run === "string" ? step.run : "")).join("\n");
    let cursor = -1;
    for (const marker of orderEntry.require) {
        const index = runText.indexOf(marker, cursor + 1);
        assert.ok(index > cursor, `expected ${JSON.stringify(marker)} after position ${cursor} in contracts job`);
        cursor = index;
    }
});
