import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { copyGeneratedTree, syncTreeAtomically, validateStagedTree } from "../wrapper/scripts/sync-sdk.mjs";

async function withTempDir(run) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "clockify-sync-sdk-atomic-"));
    try {
        await run(dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

async function makeCompleteSource(source) {
    await mkdir(source, { recursive: true });
    for (const f of ["index.ts", "Client.ts", "BaseClient.ts"]) {
        await writeFile(path.join(source, f), `// ${f}`);
    }
}

test("copyGeneratedTree copies TypeScript files and skips excluded package metadata", async () => {
    await withTempDir(async (dir) => {
        const source = path.join(dir, "source");
        await makeCompleteSource(source);
        await writeFile(path.join(source, "package.json"), "{}");
        await writeFile(path.join(source, "tsconfig.esm.json"), "{}");
        await writeFile(path.join(source, "codegen-receipt.json"), "{}");
        await mkdir(path.join(source, "node_modules", "x"), { recursive: true });
        await writeFile(path.join(source, "node_modules", "x", "y.ts"), "export {};");
        await mkdir(path.join(source, "api"), { recursive: true });
        await writeFile(path.join(source, "api", "types.ts"), "export {};");

        const dest = path.join(dir, "dest");
        const result = await copyGeneratedTree(source, dest);

        assert.equal(fs.existsSync(path.join(dest, "index.ts")), true);
        assert.equal(fs.existsSync(path.join(dest, "api", "types.ts")), true);
        assert.equal(fs.existsSync(path.join(dest, "package.json")), false);
        assert.equal(fs.existsSync(path.join(dest, "tsconfig.esm.json")), false);
        assert.equal(fs.existsSync(path.join(dest, "codegen-receipt.json")), false);
        assert.equal(fs.existsSync(path.join(dest, "node_modules")), false);
        assert.equal(result.fileCount, 4);
    });
});

test("copyGeneratedTree reports (not follows) symlinks as unexpected", async () => {
    await withTempDir(async (dir) => {
        const source = path.join(dir, "source");
        await makeCompleteSource(source);
        const target = path.join(dir, "outside.ts");
        await writeFile(target, "export {};");
        fs.symlinkSync(target, path.join(source, "linked.ts"));

        const dest = path.join(dir, "dest");
        const result = await copyGeneratedTree(source, dest);

        assert.deepEqual(result.unexpectedSymlinks, ["linked.ts"]);
        assert.equal(fs.existsSync(path.join(dest, "linked.ts")), false);
    });
});

test("validateStagedTree requires index.ts, Client.ts, BaseClient.ts and a positive TypeScript file count", async () => {
    await withTempDir(async (dir) => {
        const staging = path.join(dir, "staging");
        await mkdir(staging, { recursive: true });

        const incomplete = validateStagedTree(staging, { unexpectedSymlinks: [] });
        assert.equal(incomplete.ok, false);
        assert.ok(incomplete.reasons.some((r) => r.includes("index.ts")), JSON.stringify(incomplete.reasons));

        await makeCompleteSource(staging);
        const complete = validateStagedTree(staging, { unexpectedSymlinks: [] });
        assert.equal(complete.ok, true, JSON.stringify(complete));
        assert.equal(complete.fileCount, 3);
    });
});

test("validateStagedTree rejects excluded package metadata leaking into the staged tree", async () => {
    await withTempDir(async (dir) => {
        const staging = path.join(dir, "staging");
        await makeCompleteSource(staging);
        await writeFile(path.join(staging, "package.json"), "{}");

        const result = validateStagedTree(staging, { unexpectedSymlinks: [] });
        assert.equal(result.ok, false);
        assert.ok(result.reasons.some((r) => r.includes("package.json")), JSON.stringify(result.reasons));
    });
});

test("validateStagedTree surfaces reported unexpected symlinks", async () => {
    await withTempDir(async (dir) => {
        const staging = path.join(dir, "staging");
        await makeCompleteSource(staging);

        const result = validateStagedTree(staging, { unexpectedSymlinks: ["weird.ts"] });
        assert.equal(result.ok, false);
        assert.ok(result.reasons.some((r) => r.includes("weird.ts")), JSON.stringify(result.reasons));
    });
});

test("a copy/validation failure preserves the existing destination sentinel", async () => {
    await withTempDir(async (dir) => {
        const source = path.join(dir, "source");
        await makeCompleteSource(source);

        const dest = path.join(dir, "dest");
        await mkdir(dest, { recursive: true });
        await writeFile(path.join(dest, "old-sentinel.ts"), "old");

        await assert.rejects(
            syncTreeAtomically({ sourceDir: source, destDir: dest, injectFailure: { afterCopy: true } }),
        );

        assert.equal(await readFile(path.join(dest, "old-sentinel.ts"), "utf8"), "old");
        const leftovers = fs.readdirSync(dir);
        assert.deepEqual(leftovers.sort(), ["dest", "source"], `no staging/backup directories should remain: ${leftovers}`);
    });
});

test("a validation failure (incomplete source) preserves the existing destination sentinel", async () => {
    await withTempDir(async (dir) => {
        const source = path.join(dir, "source");
        await mkdir(source, { recursive: true });
        await writeFile(path.join(source, "index.ts"), "// incomplete, missing Client.ts/BaseClient.ts");

        const dest = path.join(dir, "dest");
        await mkdir(dest, { recursive: true });
        await writeFile(path.join(dest, "old-sentinel.ts"), "old");

        await assert.rejects(
            syncTreeAtomically({ sourceDir: source, destDir: dest }),
            /staged sync tree failed validation/,
        );

        assert.equal(await readFile(path.join(dest, "old-sentinel.ts"), "utf8"), "old");
    });
});

test("a successful sync fully replaces the destination, removing stale files not present in the new source", async () => {
    await withTempDir(async (dir) => {
        const source = path.join(dir, "source");
        await makeCompleteSource(source);

        const dest = path.join(dir, "dest");
        await mkdir(dest, { recursive: true });
        await writeFile(path.join(dest, "stale-resource.ts"), "no longer generated");

        const result = await syncTreeAtomically({ sourceDir: source, destDir: dest });

        assert.equal(result.fileCount, 3);
        assert.equal(fs.existsSync(path.join(dest, "index.ts")), true);
        assert.equal(fs.existsSync(path.join(dest, "stale-resource.ts")), false);
        const leftovers = fs.readdirSync(dir);
        assert.deepEqual(leftovers.sort(), ["dest", "source"], `no staging/backup directories should remain: ${leftovers}`);
    });
});
