import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checker = path.join(root, "scripts/check-aggregate-gates.mjs");

async function fixtureRepository({ sibling = "absent" } = {}) {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), "aggregate-gates-external-"));
    const repo = path.join(fixtureRoot, "repo");
    await mkdir(repo, { recursive: true });
    for (const relativePath of [
        "Makefile",
        "package.json",
        "wrapper/package.json",
        "cli/package.json",
        "mcp/package.json",
        "docs/aggregate-gates-contract.json",
        "docs/aggregate-gates-goclmcp.Makefile",
        "docs/README.md",
        "docs/quality-gates.md",
        "docs/contract-inventory.json",
        "docs/enterprise-hardening-audit.json",
    ]) {
        const destination = path.join(repo, relativePath);
        await mkdir(path.dirname(destination), { recursive: true });
        await cp(path.join(root, relativePath), destination);
    }
    if (sibling === "present-without-makefile") {
        await mkdir(path.join(fixtureRoot, "GOCLMCP"));
    } else if (sibling === "present-with-malformed-makefile") {
        await mkdir(path.join(fixtureRoot, "GOCLMCP"));
        await writeFile(path.join(fixtureRoot, "GOCLMCP/Makefile"), "not a make graph\n");
    } else if (sibling === "present-with-nonfile-makefile") {
        await mkdir(path.join(fixtureRoot, "GOCLMCP/Makefile"), { recursive: true });
    }
    return repo;
}

function runChecker(cwd) {
    return spawnSync(process.execPath, [checker], {
        cwd,
        encoding: "utf8",
        env: { ...process.env, CLOCKIFY_API_KEY: "", CLOCKIFY_WORKSPACE_ID: "" },
    });
}

test("production checker accepts a clean single-repository checkout with no sibling directory", async () => {
    const repo = await fixtureRepository();
    const result = runChecker(repo);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /aggregate gates contract passed/);
});

test("production checker rejects a present sibling directory whose Makefile is missing", async () => {
    const repo = await fixtureRepository({ sibling: "present-without-makefile" });
    const result = runChecker(repo);
    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /GOCLMCP.*present.*Makefile.*unavailable/i);
});

test("production checker rejects present malformed and non-file sibling Makefiles", async () => {
    for (const sibling of ["present-with-malformed-makefile", "present-with-nonfile-makefile"]) {
        const repo = await fixtureRepository({ sibling });
        const result = runChecker(repo);
        assert.notEqual(result.status, 0, `${sibling}\n${result.stdout}\n${result.stderr}`);
        assert.match(result.stderr, /GOCLMCP|unknown target|not a regular file/i);
    }
});
