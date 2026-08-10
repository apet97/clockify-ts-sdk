#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { checkAllowedDiffs, checkRequiredFlags, discoverTsconfigs } from "./lib/tsconfig-parity.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runChecker() {
    return spawnSync(process.execPath, ["scripts/check-tsconfig-parity.mjs"], {
        cwd: root,
        encoding: "utf8",
    });
}

// --- lib/tsconfig-parity.mjs: pure structural helpers -------------------

test("checkRequiredFlags reports every package whose value diverges", () => {
    const configs = {
        a: { compilerOptions: { strict: true, isolatedModules: true } },
        b: { compilerOptions: { strict: true, isolatedModules: false } },
        c: { compilerOptions: { strict: true } },
    };
    const mismatches = checkRequiredFlags(configs, { strict: true, isolatedModules: true });
    assert.equal(mismatches.length, 2);
    assert.deepEqual(
        mismatches.map((m) => m.packageName).sort(),
        ["b", "c"],
    );
});

test("checkAllowedDiffs flags a declared value that no longer matches the real file", () => {
    const configs = {
        wrapper: { compilerOptions: { module: "NodeNext" } },
        cli: { compilerOptions: { module: "CommonJS" } },
    };
    const mismatches = checkAllowedDiffs(configs, {
        module: { values: { wrapper: "NodeNext", cli: "ESNext" } },
    });
    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0].packageName, "cli");
    assert.equal(mismatches[0].actual, "CommonJS");
});

test("checkAllowedDiffs ignores packages the declaration does not mention", () => {
    const configs = { wrapper: { compilerOptions: { module: "NodeNext" } }, mcp: { compilerOptions: {} } };
    const mismatches = checkAllowedDiffs(configs, { module: { values: { wrapper: "NodeNext" } } });
    assert.equal(mismatches.length, 0);
});

test("discoverTsconfigs finds every tsconfig*.json file in the given package directories", async () => {
    const found = await discoverTsconfigs(root, ["wrapper", "cli", "mcp"]);
    assert.ok(found.includes("wrapper/tsconfig.json"));
    assert.ok(found.includes("wrapper/tsconfig.cjs.json"));
    assert.ok(found.includes("cli/tsconfig.build.json"));
    assert.ok(found.includes("mcp/tsconfig.lint.json"));
    assert.ok(found.every((relativePath) => /^tsconfig.*\.json$/.test(path.basename(relativePath))));
});

// --- scripts/check-tsconfig-parity.mjs: real-repo integration -----------

test("tsconfig parity check passes against the real repo's three packages", () => {
    const result = runChecker();
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /tsconfig parity check passed \(3 packages/);
});

test("tsconfig parity check reds when a required flag is dropped", async () => {
    const testPath = path.join(root, "wrapper", "tsconfig.json");
    const original = await readFile(testPath, "utf8");
    const config = JSON.parse(original);
    assert.equal(config.compilerOptions.isolatedModules, true);
    delete config.compilerOptions.isolatedModules;
    const mutated = `${JSON.stringify(config, null, 2)}\n`;

    try {
        await writeFile(testPath, mutated);
        const result = runChecker();
        assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(result.stdout + result.stderr, /wrapper: compilerOptions\.isolatedModules expected true/);
    } finally {
        await writeFile(testPath, original);
    }
});

test("tsconfig parity check reds when verbatimModuleSyntax is enabled anywhere", async () => {
    const testPath = path.join(root, "cli", "tsconfig.json");
    const original = await readFile(testPath, "utf8");
    const config = JSON.parse(original);
    config.compilerOptions.verbatimModuleSyntax = true;
    const mutated = `${JSON.stringify(config, null, 4)}\n`;

    try {
        await writeFile(testPath, mutated);
        const result = runChecker();
        assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(result.stdout + result.stderr, /verbatimModuleSyntax must not be true/);
    } finally {
        await writeFile(testPath, original);
    }
});

test("tsconfig parity check reds when the CJS variant's explicit verbatimModuleSyntax:false pin is removed", async () => {
    const testPath = path.join(root, "wrapper", "tsconfig.cjs.json");
    const original = await readFile(testPath, "utf8");
    const config = JSON.parse(original);
    assert.equal(config.compilerOptions.verbatimModuleSyntax, false);
    delete config.compilerOptions.verbatimModuleSyntax;
    const mutated = `${JSON.stringify(config, null, 2)}\n`;

    try {
        await writeFile(testPath, mutated);
        const result = runChecker();
        assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(result.stdout + result.stderr, /must explicitly pin verbatimModuleSyntax: false/);
    } finally {
        await writeFile(testPath, original);
    }
});
