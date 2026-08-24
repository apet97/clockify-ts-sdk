import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "check-docs-counts.mjs");
const footerModulePath = path.join(root, "scripts", "lib", "gate-failure-footer.mjs");

// scripts/lib/gate-failure-footer.mjs has no dedicated sibling test file on
// purpose (R2): wiring a new .test.mjs file into `make docs-counts` would
// touch the Makefile, and the Makefile is a governed live-evidence-campaign
// input -- a change that alone reds live-evidence-currentness and forces a
// second human-approved campaign (the recorded S3 lesson). docs-counts is
// this shared module's first adopter, its own test file is already wired,
// so the module's unit proof lives here instead.
function runFooterModuleInline(code) {
    try {
        const stdout = execFileSync("node", ["--input-type=module", "-e", code], { encoding: "utf8" });
        return { code: 0, stdout, stderr: "" };
    } catch (error) {
        return {
            code: error.status,
            stdout: error.stdout?.toString() ?? "",
            stderr: error.stderr?.toString() ?? "",
        };
    }
}

test("gate-failure-footer: reportGateFailure prints defects, a re-run hint, and the contract path, then exits 1", () => {
    const result = runFooterModuleInline(`
        import { reportGateFailure } from ${JSON.stringify(footerModulePath)};
        reportGateFailure({
            label: "example contract",
            failures: ["thing one is wrong", "thing two is wrong"],
            makeTarget: "example-target",
            contractPath: "docs/example-contract.json",
        });
    `);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /example contract failed:/);
    assert.match(result.stderr, /- thing one is wrong/);
    assert.match(result.stderr, /- thing two is wrong/);
    assert.match(result.stderr, /re-run: make example-target/);
    assert.match(result.stderr, /contract: docs\/example-contract\.json/);
});

test("gate-failure-footer: reportGateFailure omits the contract line when no contractPath is given", () => {
    const result = runFooterModuleInline(`
        import { reportGateFailure } from ${JSON.stringify(footerModulePath)};
        reportGateFailure({ label: "example", failures: ["x"], makeTarget: "example-target" });
    `);
    assert.equal(result.code, 1);
    assert.doesNotMatch(result.stderr, /contract:/);
});

test("gate-failure-footer: reportGateSuccess prints the count, zero failures, and the re-run target", () => {
    const result = runFooterModuleInline(`
        import { reportGateSuccess } from ${JSON.stringify(footerModulePath)};
        reportGateSuccess({ checksExecuted: 12, makeTarget: "example-target" });
    `);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /^12 checks executed, 0 failures -- re-run: make example-target$/m);
});

test("gate-failure-footer: reportGateSuccess appends optional extra detail in parentheses", () => {
    const result = runFooterModuleInline(`
        import { reportGateSuccess } from ${JSON.stringify(footerModulePath)};
        reportGateSuccess({ checksExecuted: 3, makeTarget: "example-target", extra: "7 rows" });
    `);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /3 checks executed, 0 failures \(7 rows\) -- re-run: make example-target/);
});

// Every fixture below works by rewriting a real count into a stale one. If the
// search string stops matching — because the surface moved and this file was
// not updated with it — `String.replace` silently returns the text unchanged,
// no forbidden string is planted, the checker correctly exits 0, and the
// assertion fails with a bare `0 !== 1` that says nothing about the cause.
// That is a false-green fixture: the test still reds, but for the wrong reason
// and with no clue. Fail loudly on the no-op instead.
function stale(text, from, to) {
    const next = text.replaceAll(from, to);
    assert.notEqual(
        next,
        text,
        `fixture string ${JSON.stringify(from)} no longer appears in the corpus. ` +
            "The surface count moved; update this fixture to the current value.",
    );
    return next;
}

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
        ...(contract.derivedClaims ?? []).map((entry) => entry.path),
        ...((contract.liveSuccessProse?.mustAppearIn ?? []).map((file) => file)),
    ]);
    for (const relative of files) {
        const source = path.join(root, relative);
        const target = path.join(fixtureRoot, relative);
        await mkdir(path.dirname(target), { recursive: true });
        await cp(source, target);
    }
    for (const entry of contract.derivedClaims ?? []) {
        for (const claim of entry.claims ?? []) {
            if (typeof claim.sourceDir !== "string") continue;
            await cp(path.join(root, claim.sourceDir), path.join(fixtureRoot, claim.sourceDir), { recursive: true });
        }
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

test("docs-counts prints the shared success footer (R2)", async () => {
    const result = await withFixture(async () => {});
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /\d+ checks executed, 0 failures.*-- re-run: make docs-counts/);
});

test("docs-counts prints the shared failure footer with a re-run hint and contract path (R2)", async () => {
    const result = await withFixture(async (fixtureRoot) => {
        const file = path.join(fixtureRoot, "docs/README.md");
        const text = await readFile(file, "utf8");
        await writeFile(file, stale(stale(text, "All 168 operations", "All 174 operations"), "168-row", "174-row"));
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /re-run: make docs-counts/);
    assert.match(result.stderr, /contract: docs\/docs-counts-contract\.json/);
});

test("docs-counts rejects a stale README operation count", async () => {
    const result = await withFixture(async (fixtureRoot) => {
        const file = path.join(fixtureRoot, "docs/README.md");
        const text = await readFile(file, "utf8");
        await writeFile(file, stale(stale(text, "All 168 operations", "All 174 operations"), "168-row", "174-row"));
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /stale count string|derived current claim/);
});

test("docs-counts rejects a stale risk-register operation count", async () => {
    const result = await withFixture(async (fixtureRoot) => {
        const file = path.join(fixtureRoot, "docs/risk-register.md");
        const text = await readFile(file, "utf8");
        await writeFile(file, stale(text, "All 168 operations", "All 174 operations"));
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /stale count string|derived current claim/);
});

test("docs-counts rejects a stale evidence-inventory operation count", async () => {
    const result = await withFixture(async (fixtureRoot) => {
        const file = path.join(fixtureRoot, "docs/operation-evidence-anchor-inventory.json");
        const text = await readFile(file, "utf8");
        await writeFile(file, stale(text, "current 168-operation", "current 174-operation"));
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /stale count string|derived current claim/);
});

// The 146-tool regression: both headline README tables were hand-written and
// only one carried the current count, so the reactive denylist could not see
// the other. Each surface README now also carries a derived claim.
test("docs-counts rejects a stale README tool count", async () => {
    const result = await withFixture(async (fixtureRoot) => {
        const file = path.join(fixtureRoot, "README.md");
        const text = await readFile(file, "utf8");
        await writeFile(
            file,
            stale(text, "163 tools, local stdio", "146 tools, local stdio"),
        );
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /stale count string|derived current claim/);
});

test("docs-counts rejects a stale mcp/README tool count", async () => {
    const result = await withFixture(async (fixtureRoot) => {
        const file = path.join(fixtureRoot, "mcp/README.md");
        const text = await readFile(file, "utf8");
        await writeFile(file, stale(text, "| Tools | 163 |", "| Tools | 146 |"));
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /stale count string|derived current claim/);
});

test("docs-counts rejects a stale wrapper/README operation split", async () => {
    const result = await withFixture(async (fixtureRoot) => {
        const file = path.join(fixtureRoot, "wrapper/README.md");
        const text = await readFile(file, "utf8");
        await writeFile(file, stale(text, "19 governed", "14 governed"));
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /stale count string|derived current claim/);
});

test("docs-counts rejects a wrong CLAUDE.md gotcha-file count", async () => {
    const result = await withFixture(async (fixtureRoot) => {
        const file = path.join(fixtureRoot, "CLAUDE.md");
        const text = await readFile(file, "utf8");
        await writeFile(file, stale(text, "9 topic files under", "12 topic files under"));
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /derived current claim "9 topic files under"/);
});

// The count is derived from the directory, not pinned: removing a gotcha
// file must red the prose claim until CLAUDE.md follows the new count.
test("docs-counts derives the gotcha count from docs/gotchas", async () => {
    const result = await withFixture(async (fixtureRoot) => {
        await rm(path.join(fixtureRoot, "docs/gotchas/operator-docs-and-index-drift.md"));
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /derived current claim "8 topic files under"/);
});

test("docs-counts rejects a stale wrapper/README public-name count", async () => {
    const result = await withFixture(async (fixtureRoot) => {
        const file = path.join(fixtureRoot, "wrapper/README.md");
        const text = await readFile(file, "utf8");
        await writeFile(file, stale(text, "95 governed root names", "92 governed root names"));
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /stale count string|derived current claim/);
});
