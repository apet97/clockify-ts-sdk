import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
    REQUIRED_BREAKING_CHANGE_MAPPINGS,
    validateRequiredBreakingChanges,
} from "./lib/breaking-change-mappings.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function validMappings() {
    return REQUIRED_BREAKING_CHANGE_MAPPINGS.map((mapping) => ({ ...mapping }));
}

for (const required of REQUIRED_BREAKING_CHANGE_MAPPINGS) {
    test(`rejects omission of removed symbol ${required.removed}`, () => {
        const failures = validateRequiredBreakingChanges(
            validMappings().filter((mapping) => mapping.removed !== required.removed),
        );
        assert.match(failures.join("\n"), new RegExp(`missing.*${required.removed}`, "i"));
    });

    test(`rejects omission of replacement for ${required.removed}`, () => {
        const mappings = validMappings();
        const mapping = mappings.find((candidate) => candidate.removed === required.removed);
        assert.ok(mapping);
        delete mapping.replacement;
        const failures = validateRequiredBreakingChanges(mappings);
        assert.match(failures.join("\n"), new RegExp(`${required.removed}.*replacement`, "i"));
    });
}

test("accepts the exact Task 6 migration mapping", () => {
    assert.deepEqual(validateRequiredBreakingChanges(validMappings()), []);
});

test("the named closure gate builds before compiling the public breaking-change fixtures", () => {
    const dryRun = execFileSync("make", ["-n", "breaking-change-review"], {
        cwd: root,
        encoding: "utf8",
    });
    const codegen = "node scripts/generate-sdk-from-openapi.mjs --write";
    const sync = "cd wrapper && npm run sync";
    const build = "npm run build -w clockify-sdk-ts-115";
    const compile = "npm run type-check:breaking -w clockify-sdk-ts-115";
    const checker = "node scripts/check-breaking-change-review.mjs";

    assert.ok(dryRun.includes(codegen), `missing deterministic SDK generation: ${dryRun}`);
    assert.ok(dryRun.includes(sync), `missing deterministic wrapper sync: ${dryRun}`);
    assert.ok(dryRun.includes(build), `missing deterministic wrapper build: ${dryRun}`);
    assert.ok(dryRun.includes(compile), `missing compiler-owned breaking-change proof: ${dryRun}`);
    assert.ok(dryRun.indexOf(codegen) < dryRun.indexOf(sync), "codegen must precede sync");
    assert.ok(dryRun.indexOf(sync) < dryRun.indexOf(build), "sync must precede wrapper build");
    assert.ok(dryRun.indexOf(build) < dryRun.indexOf(compile), "wrapper build must precede compile");
    assert.ok(dryRun.indexOf(compile) < dryRun.indexOf(checker), "compile must precede checker");
});

test("the compiler command owns both module modes and both adapter migration examples", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "wrapper/package.json"), "utf8"));
    assert.equal(
        manifest.scripts["type-check:breaking"],
        "tsc -p tsconfig.types-bundler.json && tsc -p tsconfig.types-public-package.json",
    );

    for (const configName of [
        "tsconfig.types-bundler.json",
        "tsconfig.types-public-package.json",
    ]) {
        const config = JSON.parse(
            fs.readFileSync(path.join(root, "wrapper", configName), "utf8"),
        );
        assert.ok(config.include.includes("tests/types/breaking-changes.test-d.ts"));
        assert.ok(config.include.includes("examples/archive-then-delete-adapter.ts"));
        assert.ok(config.include.includes("examples/archive-then-delete-client-adapter.ts"));
    }
});
