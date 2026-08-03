import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/check-issue-intake.mjs");

const contract = () => ({
    schemaVersion: 1,
    purpose: "fixture",
    policyDocument: {
        path: "docs/issue-intake-policy.md",
        mustContain: ["Intake surfaces", "Bug report fields", "make issue-intake"],
        forbiddenMarkers: ["TODO"],
    },
    templates: [
        {
            path: ".github/ISSUE_TEMPLATE/bug_report.yml",
            mustContain: ["Affected surface", "No secrets or customer data"],
            requiredBodyIds: ["affected-surface", "what-happened", "expected", "repro"],
            optionalBodyIds: ["package-version", "notes"],
            requiredCheckboxIds: ["agreements"],
            forbiddenDuplicateIds: true,
        },
    ],
    supportingEvidence: [
        { path: "docs/support.md", mustContain: ["support evidence"] },
    ],
    readinessContextFields: ["readinessContext"],
    quickstartDiagnosticsFields: ["diagnostic surface"],
    wiring: {
        makeTarget: "issue-intake",
        docsIndex: ["issue-intake-policy.md", "issue-intake-contract.json"],
        qualityGate: "make issue-intake",
        supportBundleCommand: "node scripts/create-support-bundle.mjs",
        inventoryId: "issue-intake",
        auditId: "issue-intake",
    },
});

const form = () => ({
    name: "Bug report",
    description: "Describe a reproducible problem with readinessContext and diagnostic surface",
    body: [
        {
            type: "input",
            id: "affected-surface",
            attributes: { label: "Affected surface" },
            validations: { required: true },
        },
        {
            type: "textarea",
            id: "what-happened",
            attributes: { label: "What happened?" },
            validations: { required: true },
        },
        {
            type: "textarea",
            id: "expected",
            attributes: { label: "Expected behavior" },
            validations: { required: true },
        },
        {
            type: "textarea",
            id: "repro",
            attributes: { label: "Minimal reproducer" },
            validations: { required: true },
        },
        {
            type: "input",
            id: "package-version",
            attributes: { label: "Package and version (optional)" },
        },
        {
            type: "textarea",
            id: "notes",
            attributes: { label: "Additional notes" },
        },
        {
            type: "checkboxes",
            id: "agreements",
            attributes: {
                label: "Pre-submission checks",
                options: [{ label: "No secrets or customer data", required: true }],
            },
        },
    ],
});

const fixtureFiles = (formSource) => ({
    ".github/ISSUE_TEMPLATE/bug_report.yml": formSource,
    "docs/issue-intake-contract.json": JSON.stringify(contract(), null, 2),
    "docs/issue-intake-policy.md": [
        "Intake surfaces",
        "Bug report fields",
        "make issue-intake",
        "readinessContext",
        "diagnostic surface",
        "node scripts/create-support-bundle.mjs",
    ].join("\n"),
    "docs/support.md": "support evidence\n",
    "docs/README.md": "./issue-intake-policy.md\n./issue-intake-contract.json\n",
    "docs/quality-gates.md": "make issue-intake\n",
    "docs/contract-inventory.json": '{"id": "issue-intake"}\n',
    "docs/enterprise-hardening-audit.json": '{"id": "issue-intake"}\n',
    ".github/pull_request_template.md": "readinessContext\ndiagnostic surface\n",
    Makefile: "contract-gates: issue-intake\nissue-intake:\n\tnode scripts/check-issue-intake.mjs\n",
});

async function runFixture(formSource) {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "issue-intake-"));
    try {
        for (const [relative, content] of Object.entries(fixtureFiles(formSource))) {
            const absolute = path.join(fixtureRoot, relative);
            await mkdir(path.dirname(absolute), { recursive: true });
            await writeFile(absolute, content);
        }
        return await new Promise((resolve) => {
            execFile(
                "node",
                [script, "--root", fixtureRoot],
                { cwd: fixtureRoot },
                (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }),
            );
        });
    } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
    }
}

async function runForm(mutator) {
    const candidate = form();
    mutator(candidate);
    return runFixture(YAML.stringify(candidate));
}

test("rejects malformed YAML before marker checks", async () => {
    const result = await runFixture("description: bad: value\nbody: []\n");
    assert.equal(result.code, 1);
    assert.match(result.stderr, /invalid YAML/);
});

test("rejects duplicate body IDs", async () => {
    const result = await runForm((candidate) => {
        candidate.body.push({ type: "input", id: "what-happened", attributes: { label: "Duplicate" } });
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /duplicate body id what-happened/);
});

test("rejects a missing required body ID", async () => {
    const result = await runForm((candidate) => {
        candidate.body = candidate.body.filter((item) => item.id !== "what-happened");
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /required body id what-happened is missing/);
});

test("rejects a required field made optional", async () => {
    const result = await runForm((candidate) => {
        candidate.body[0].validations.required = false;
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /required body id affected-surface must have validations.required: true/);
});

test("rejects an optional field made required", async () => {
    const result = await runForm((candidate) => {
        candidate.body.find((item) => item.id === "notes").validations = { required: true };
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /optional body id notes must not be required/);
});

test("rejects optional package context made required", async () => {
    const result = await runForm((candidate) => {
        candidate.body.find((item) => item.id === "package-version").validations = { required: true };
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /optional body id package-version must not be required/);
});

test("rejects duplicate checkbox IDs", async () => {
    const result = await runForm((candidate) => {
        candidate.body.push({
            type: "checkboxes",
            id: "agreements",
            attributes: { label: "Duplicate", options: [{ label: "Another", required: false }] },
        });
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /duplicate body id agreements/);
});

test("rejects a missing required secret-redaction checkbox", async () => {
    const result = await runForm((candidate) => {
        candidate.body.find((item) => item.id === "agreements").attributes.options = [];
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /missing marker \"No secrets or customer data\"/);
});

test("does not accept a required marker that exists only in a comment", async () => {
    const candidate = form();
    candidate.body[0].attributes.label = "Different label";
    const result = await runFixture(`# Affected surface\n${YAML.stringify(candidate)}`);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /missing marker \"Affected surface\"/);
});

test("accepts a correct form", async () => {
    const result = await runForm(() => {});
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Issue intake contract passed/);
});
