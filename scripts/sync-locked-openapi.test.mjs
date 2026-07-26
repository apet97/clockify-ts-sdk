import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { compareSiblingDeveloperConvenienceOnly, syncLockedOpenApi } from "./sync-locked-openapi.mjs";

const SOURCE_BYTES = Buffer.from("openapi: 3.1.0\ninfo:\n  title: fixture\n");

const LOCK = Object.freeze({
    repositoryUrl: "https://github.com/example-org/example-openapi",
    commit: "a".repeat(40),
    sourcePath: "docs/openapi/clockify-openapi.yaml",
    sourceBytes: SOURCE_BYTES.length,
    sourceSha256: createHash("sha256").update(SOURCE_BYTES).digest("hex"),
    composerPath: "scripts/gen-clockify-openapi",
    composerVersion: "1.0.0",
    approvedBy: "Jane Reviewer",
    approvedAt: "2026-07-26T00:00:00Z",
});

function okResponse(body) {
    return {
        ok: true,
        status: 200,
        redirected: false,
        arrayBuffer: async () =>
            Buffer.isBuffer(body) ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : body,
        json: async () => body,
    };
}

function notOkResponse(status) {
    return { ok: false, status, redirected: false, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}) };
}

function redirectedResponse(body) {
    return {
        ok: true,
        status: 200,
        redirected: true,
        arrayBuffer: async () =>
            Buffer.isBuffer(body) ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : body,
        json: async () => body,
    };
}

function makeHappyPathFetcher(bytes = SOURCE_BYTES) {
    return async (url) => {
        if (url.includes("api.github.com")) return okResponse({ sha: LOCK.commit });
        if (url.endsWith(LOCK.sourcePath)) return okResponse(bytes);
        throw new Error(`unexpected fetch url in test: ${url}`);
    };
}

function makeTempTarget() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-locked-openapi-test-"));
    return { dir, targetPath: path.join(dir, "clockify.corrected.openapi.yaml") };
}

test("writes the target file on a first sync (happy path)", async () => {
    const { dir, targetPath } = makeTempTarget();
    try {
        const result = await syncLockedOpenApi({ lock: LOCK, targetPath, fetchImpl: makeHappyPathFetcher() });
        assert.equal(result.ok, true);
        assert.equal(result.changed, true);
        assert.ok(fs.readFileSync(targetPath).equals(SOURCE_BYTES));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("is a no-op when the target already matches the locked bytes", async () => {
    const { dir, targetPath } = makeTempTarget();
    try {
        fs.writeFileSync(targetPath, SOURCE_BYTES);
        const before = fs.statSync(targetPath).mtimeNs;
        const result = await syncLockedOpenApi({ lock: LOCK, targetPath, fetchImpl: makeHappyPathFetcher() });
        assert.equal(result.ok, true);
        assert.equal(result.changed, false);
        assert.equal(fs.statSync(targetPath).mtimeNs, before, "unchanged file must not be rewritten");
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("refuses to write when lock verification fails (byte/hash mismatch)", async () => {
    const { dir, targetPath } = makeTempTarget();
    try {
        const fetcher = makeHappyPathFetcher(Buffer.from("totally different content\n"));
        const result = await syncLockedOpenApi({ lock: LOCK, targetPath, fetchImpl: fetcher });
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((message) => message.startsWith("source:")));
        assert.equal(fs.existsSync(targetPath), false, "verification failure must not create the target file");
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("refuses to write when lock verification fails and leaves an existing target untouched", async () => {
    const { dir, targetPath } = makeTempTarget();
    try {
        const staleBytes = Buffer.from("stale previous content\n");
        fs.writeFileSync(targetPath, staleBytes);
        const fetcher = makeHappyPathFetcher(Buffer.from("totally different content\n"));
        const result = await syncLockedOpenApi({ lock: LOCK, targetPath, fetchImpl: fetcher });
        assert.equal(result.ok, false);
        assert.ok(fs.readFileSync(targetPath).equals(staleBytes), "existing target must remain untouched on failure");
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("refuses to write on an unavailable (404) commit", async () => {
    const { dir, targetPath } = makeTempTarget();
    try {
        const fetcher = async (url) => (url.includes("api.github.com") ? notOkResponse(404) : okResponse(SOURCE_BYTES));
        const result = await syncLockedOpenApi({ lock: LOCK, targetPath, fetchImpl: fetcher });
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((message) => message.startsWith("commit:") && message.includes("404")));
        assert.equal(fs.existsSync(targetPath), false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("refuses to write on a redirected source fetch", async () => {
    const { dir, targetPath } = makeTempTarget();
    try {
        const fetcher = async (url) =>
            url.includes("api.github.com") ? okResponse({ sha: LOCK.commit }) : redirectedResponse(SOURCE_BYTES);
        const result = await syncLockedOpenApi({ lock: LOCK, targetPath, fetchImpl: fetcher });
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((message) => message.includes("redirected")));
        assert.equal(fs.existsSync(targetPath), false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("rejects a malformed lock before ever fetching", async () => {
    const { dir, targetPath } = makeTempTarget();
    try {
        const fetcher = async () => {
            throw new Error("must not be called for a malformed lock");
        };
        const result = await syncLockedOpenApi({ lock: { ...LOCK, commit: "not-a-sha" }, targetPath, fetchImpl: fetcher });
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((message) => message.startsWith("commit:")));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("an ambient sibling with different bytes cannot affect the synchronized output", async () => {
    const { dir, targetPath } = makeTempTarget();
    const siblingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fake-goclmcp-sibling-"));
    try {
        // Place a sibling checkout at the conventional relative location with
        // DIFFERENT content, and even chdir next to it, to prove the sync
        // never reads it: only the injected fetcher's response can end up
        // in the written file.
        const siblingSourceDir = path.join(siblingRoot, "docs", "openapi");
        fs.mkdirSync(siblingSourceDir, { recursive: true });
        fs.writeFileSync(path.join(siblingSourceDir, "clockify-openapi.yaml"), "sibling has completely different bytes\n");

        const previousCwd = process.cwd();
        process.chdir(path.dirname(siblingRoot));
        try {
            const result = await syncLockedOpenApi({ lock: LOCK, targetPath, fetchImpl: makeHappyPathFetcher() });
            assert.equal(result.ok, true);
            assert.ok(
                fs.readFileSync(targetPath).equals(SOURCE_BYTES),
                "target must match the fetcher's bytes, never the sibling's",
            );
        } finally {
            process.chdir(previousCwd);
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(siblingRoot, { recursive: true, force: true });
    }
});

test("the developer-only sibling comparison is clearly labeled and never called by sync", async () => {
    const siblingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fake-goclmcp-sibling-"));
    try {
        const siblingSourceDir = path.join(siblingRoot, "docs", "openapi");
        fs.mkdirSync(siblingSourceDir, { recursive: true });
        fs.writeFileSync(path.join(siblingSourceDir, "clockify-openapi.yaml"), SOURCE_BYTES);

        const comparison = compareSiblingDeveloperConvenienceOnly(LOCK, siblingRoot);
        assert.equal(comparison.note, "developer convenience; not release proof");
        assert.equal(comparison.ok, true);
    } finally {
        fs.rmSync(siblingRoot, { recursive: true, force: true });
    }
});

test("the developer-only sibling comparison reports a mismatch honestly", () => {
    const siblingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fake-goclmcp-sibling-"));
    try {
        const siblingSourceDir = path.join(siblingRoot, "docs", "openapi");
        fs.mkdirSync(siblingSourceDir, { recursive: true });
        fs.writeFileSync(path.join(siblingSourceDir, "clockify-openapi.yaml"), "different\n");

        const comparison = compareSiblingDeveloperConvenienceOnly(LOCK, siblingRoot);
        assert.equal(comparison.note, "developer convenience; not release proof");
        assert.equal(comparison.ok, false);
    } finally {
        fs.rmSync(siblingRoot, { recursive: true, force: true });
    }
});
