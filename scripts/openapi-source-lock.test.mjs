import assert from "node:assert/strict";
import { test } from "node:test";

import { validateOpenApiSourceLockShape } from "./lib/openapi-source-lock.mjs";

const VALID_LOCK = Object.freeze({
    repositoryUrl: "https://github.com/example-org/example-openapi",
    commit: "0".repeat(40),
    sourcePath: "openapi/clockify.yaml",
    sourceBytes: 12345,
    sourceSha256: "1".repeat(64),
    composerPath: "tools/gen-openapi.rb",
    composerSha256: "2".repeat(64),
    approvedBy: "Jane Reviewer",
    approvedAt: "2026-07-26T00:00:00Z",
});

function withField(overrides) {
    const clone = { ...VALID_LOCK, ...overrides };
    for (const key of Object.keys(overrides)) {
        if (overrides[key] === undefined) delete clone[key];
    }
    return clone;
}

test("accepts a well-formed shape (composerSha256 form)", () => {
    assert.deepEqual(validateOpenApiSourceLockShape(VALID_LOCK), []);
});

test("accepts a well-formed shape (composerVersion form)", () => {
    const candidate = withField({
        composerSha256: undefined,
        composerVersion: "1.4.0",
    });
    assert.deepEqual(validateOpenApiSourceLockShape(candidate), []);
});

test("rejects a missing composerPath", () => {
    const candidate = withField({ composerPath: undefined });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.includes("missing required field: composerPath"),
        `expected missing-field error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects an absolute composerPath", () => {
    const candidate = withField({ composerPath: "/etc/passwd" });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("composerPath:")),
        `expected composerPath error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a missing repository URL", () => {
    const candidate = withField({ repositoryUrl: undefined });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.includes("missing required field: repositoryUrl"),
        `expected missing-field error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a non-HTTPS-GitHub repository URL", () => {
    const candidate = withField({ repositoryUrl: "git@github.com:example-org/example-openapi.git" });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("repositoryUrl:")),
        `expected repositoryUrl error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a local-path repository URL", () => {
    const candidate = withField({ repositoryUrl: "/Users/15x/Downloads/WORKING/addons-me/GOCLMCP" });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("repositoryUrl:")),
        `expected repositoryUrl error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects the branch name main as a commit", () => {
    const candidate = withField({ commit: "main" });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("commit:")),
        `expected commit error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a short SHA as a commit", () => {
    const candidate = withField({ commit: "0123abcd" });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("commit:")),
        `expected commit error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a tag-shaped commit", () => {
    const candidate = withField({ commit: "v1.2.3" });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("commit:")),
        `expected commit error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects an absolute source path", () => {
    const candidate = withField({ sourcePath: "/etc/passwd" });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("sourcePath:")),
        `expected sourcePath error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a parent-traversal source path", () => {
    const candidate = withField({ sourcePath: "../../etc/passwd" });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("sourcePath:")),
        `expected sourcePath error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a wrong-length source SHA-256", () => {
    const candidate = withField({ sourceSha256: "abcd" });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("sourceSha256:")),
        `expected sourceSha256 error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a non-hex source SHA-256", () => {
    const candidate = withField({ sourceSha256: "z".repeat(64) });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("sourceSha256:")),
        `expected sourceSha256 error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a zero byte count", () => {
    const candidate = withField({ sourceBytes: 0 });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("sourceBytes:")),
        `expected sourceBytes error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a negative byte count", () => {
    const candidate = withField({ sourceBytes: -12 });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("sourceBytes:")),
        `expected sourceBytes error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a non-integer byte count", () => {
    const candidate = withField({ sourceBytes: 12.5 });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("sourceBytes:")),
        `expected sourceBytes error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a placeholder commit value", () => {
    const candidate = withField({ commit: "TODO-fill-in-real-commit-sha-please-40chars" });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("commit:")),
        `expected commit error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a placeholder approvedBy value", () => {
    const candidate = withField({ approvedBy: "CHANGEME" });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("approvedBy:")),
        `expected approvedBy error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a placeholder-bracketed source path", () => {
    const candidate = withField({ sourcePath: "<paste-real-path-here>" });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("sourcePath:")),
        `expected sourcePath error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects supplying both composer pin forms at once", () => {
    const candidate = withField({ composerVersion: "1.0.0" }); // VALID_LOCK already has composerSha256
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("composer:")),
        `expected composer conflict error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects supplying neither composer form", () => {
    const candidate = withField({ composerSha256: undefined });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("composer:")),
        `expected composer conflict error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects an unknown field", () => {
    const candidate = { ...VALID_LOCK, extraField: "unexpected" };
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.includes("unknown field: extraField"),
        `expected unknown-field error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a non-object candidate", () => {
    assert.deepEqual(validateOpenApiSourceLockShape("not-an-object"), ["lock must be a JSON object"]);
    assert.deepEqual(validateOpenApiSourceLockShape(null), ["lock must be a JSON object"]);
    assert.deepEqual(validateOpenApiSourceLockShape([1, 2, 3]), ["lock must be a JSON object"]);
});

test("rejects an unparseable approvedAt", () => {
    const candidate = withField({ approvedAt: "not-a-date" });
    const errors = validateOpenApiSourceLockShape(candidate);
    assert.ok(
        errors.some((message) => message.startsWith("approvedAt:")),
        `expected approvedAt error, got: ${JSON.stringify(errors)}`,
    );
});

test("the example file matches the schema shape (documentation only, not a real lock)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const example = JSON.parse(fs.readFileSync(path.join(root, "docs", "openapi-source-lock.example.json"), "utf8"));
    assert.deepEqual(validateOpenApiSourceLockShape(example), []);
});
