// Unit proof for the shared path-traversal guard. Written fail-first: each
// rejection case below fails against a deliberately weakened copy that skips
// the `..`-segment or absolute-path check, which is exactly the weakening a
// private 42-copy fix could miss in one file.
import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSafeRelativePath } from "./contract-io.mjs";

test("accepts and normalizes ordinary repo-relative paths", () => {
    assert.deepEqual(normalizeSafeRelativePath("docs/mcp-contract.json"), {
        path: "docs/mcp-contract.json",
    });
    assert.deepEqual(normalizeSafeRelativePath("docs//nested/./file.md"), {
        path: "docs/nested/file.md",
    });
    assert.deepEqual(normalizeSafeRelativePath("docs\\win\\file.md"), {
        path: "docs/win/file.md",
    });
});

test("rejects empty and non-string values", () => {
    for (const value of ["", "   ", null, undefined, 7, ["docs"]]) {
        const result = normalizeSafeRelativePath(value);
        assert.equal(result.path, undefined, JSON.stringify(value));
        assert.match(result.error, /non-empty repo-relative/);
    }
});

test("rejects absolute paths and every ..-escape spelling", () => {
    for (const value of [
        "/etc/passwd",
        "../outside.md",
        "docs/../../outside.md",
        "docs/..",
        "..\\outside.md",
        "docs\\..\\..\\outside.md",
    ]) {
        const result = normalizeSafeRelativePath(value);
        assert.equal(result.path, undefined, value);
        assert.match(result.error, /must not escape/, value);
    }
});

test("does not treat dotfiles or two-dot names as traversal", () => {
    assert.deepEqual(normalizeSafeRelativePath(".gitleaksignore"), {
        path: ".gitleaksignore",
    });
    assert.deepEqual(normalizeSafeRelativePath("docs/a..b.md"), { path: "docs/a..b.md" });
});
