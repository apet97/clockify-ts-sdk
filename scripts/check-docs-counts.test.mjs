import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "check-docs-counts.mjs");

async function createFixture() {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "clockify-doc-counts-"));
    const contract = JSON.parse(await readFile(path.join(root, "docs", "docs-counts-contract.json"), "utf8"));
    const files = new Set([
        "docs/docs-counts-contract.json",
        "docs/openapi-operations.json",
        "docs/operation-parity.json",
        "docs/operation-dispositions.json",
        "docs/mcp-tools.json",
        "docs/product-surface.json",
        "docs/cli-commands.json",
        "docs/sdk-public-api.json",
        "spec/corrected/clockify.corrected.openapi.yaml",
        "docs/README.md",
        "docs/quality-gates.md",
        "docs/contract-inventory.json",
        "docs/enterprise-hardening-audit.json",
        "docs/risk-register.json",
        ...(contract.proseDocs ?? []),
        ...((contract.liveSuccessProse?.mustAppearIn ?? []).map((file) => file)),
    ]);
    for (const relative of files) {
        const source = path.join(root, relative);
        const target = path.join(fixtureRoot, relative);
        await mkdir(path.dirname(target), { recursive: true });
        await cp(source, target);
    }
    await writeFile(
        path.join(fixtureRoot, "Makefile"),
        "governance-audit: docs-counts\ndocs-counts:\n\tnode scripts/check-docs-counts.mjs\n",
    );
    return fixtureRoot;
}

async function runFixture(fixtureRoot) {
    return new Promise((resolve) => {
        execFile("node", [script, "--root", fixtureRoot], { cwd: fixtureRoot }, (error, stdout, stderr) => {
            resolve({ code: error?.code ?? 0, stdout, stderr });
        });
    });
}

async function withFixture(mutator) {
    const fixtureRoot = await createFixture();
    try {
        await mutator(fixtureRoot);
        return await runFixture(fixtureRoot);
    } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
    }
}

test("docs-counts accepts the current derived active claims", async () => {
    const result = await withFixture(async () => {});
    assert.equal(result.code, 0, result.stderr);
});

test("docs-counts rejects a stale README operation count", async () => {
    const result = await withFixture(async (fixtureRoot) => {
        const file = path.join(fixtureRoot, "docs/README.md");
        const text = await readFile(file, "utf8");
        await writeFile(file, text.replace("All 168 operations", "All 174 operations").replace("168-row", "174-row"));
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /stale count string|derived current claim/);
});

test("docs-counts rejects a stale risk-register operation count", async () => {
    const result = await withFixture(async (fixtureRoot) => {
        const file = path.join(fixtureRoot, "docs/risk-register.md");
        const text = await readFile(file, "utf8");
        await writeFile(file, text.replace("All 168 operations", "All 174 operations"));
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /stale count string|derived current claim/);
});

test("docs-counts rejects a stale evidence-inventory operation count", async () => {
    const result = await withFixture(async (fixtureRoot) => {
        const file = path.join(fixtureRoot, "docs/operation-evidence-anchor-inventory.json");
        const text = await readFile(file, "utf8");
        await writeFile(file, text.replace("current 168-operation", "current 174-operation"));
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /stale count string|derived current claim/);
});
