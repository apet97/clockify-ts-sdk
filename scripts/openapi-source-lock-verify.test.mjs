import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { verifyOpenApiSourceLock } from "./lib/openapi-source-lock-verify.mjs";

const SOURCE_BYTES = Buffer.from("openapi: 3.1.0\ninfo:\n  title: fixture\n");
const COMPOSER_BYTES = Buffer.from("#!/usr/bin/env ruby\nputs 'fixture composer'\n");

const LOCK = Object.freeze({
    repositoryUrl: "https://github.com/example-org/example-openapi",
    commit: "a".repeat(40),
    sourcePath: "docs/openapi/clockify-openapi.yaml",
    sourceBytes: SOURCE_BYTES.length,
    sourceSha256: createHash("sha256").update(SOURCE_BYTES).digest("hex"),
    composerPath: "scripts/gen-clockify-openapi",
    composerSha256: createHash("sha256").update(COMPOSER_BYTES).digest("hex"),
    approvedBy: "Jane Reviewer",
    approvedAt: "2026-07-26T00:00:00Z",
});

function okResponse(body) {
    return {
        ok: true,
        status: 200,
        redirected: false,
        arrayBuffer: async () => Buffer.isBuffer(body) ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : body,
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
        arrayBuffer: async () => Buffer.isBuffer(body) ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : body,
        json: async () => body,
    };
}

function makeHappyPathFetcher() {
    return async (url) => {
        if (url.includes("api.github.com")) return okResponse({ sha: LOCK.commit });
        if (url.endsWith(LOCK.sourcePath)) return okResponse(SOURCE_BYTES);
        if (url.endsWith(LOCK.composerPath)) return okResponse(COMPOSER_BYTES);
        throw new Error(`unexpected fetch url in test: ${url}`);
    };
}

test("verifies a well-formed lock end to end (happy path)", async () => {
    const result = await verifyOpenApiSourceLock(LOCK, { fetchImpl: makeHappyPathFetcher() });
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
    assert.ok(result.checks.every((check) => check.ok === true));
});

test("rejects a malformed lock before ever fetching", async () => {
    const fetcher = async () => {
        throw new Error("must not be called for a malformed lock");
    };
    const result = await verifyOpenApiSourceLock({ ...LOCK, commit: "not-a-sha" }, { fetchImpl: fetcher });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((message) => message.startsWith("commit:")));
    assert.deepEqual(result.checks, []);
});

test("rejects when the source fetch returns different bytes than locked", async () => {
    const fetcher = async (url) => {
        if (url.includes("api.github.com")) return okResponse({ sha: LOCK.commit });
        if (url.endsWith(LOCK.sourcePath)) return okResponse(Buffer.from("totally different content\n"));
        if (url.endsWith(LOCK.composerPath)) return okResponse(COMPOSER_BYTES);
        throw new Error(`unexpected fetch url in test: ${url}`);
    };
    const result = await verifyOpenApiSourceLock(LOCK, { fetchImpl: fetcher });
    assert.equal(result.ok, false);
    assert.ok(
        result.errors.some((message) => message.startsWith("source:") && message.includes("sha256 mismatch")),
        `expected source hash-mismatch error, got: ${JSON.stringify(result.errors)}`,
    );
});

test("rejects a redirected repository/path fetch", async () => {
    const fetcher = async (url) => {
        if (url.includes("api.github.com")) return okResponse({ sha: LOCK.commit });
        if (url.endsWith(LOCK.sourcePath)) return redirectedResponse(SOURCE_BYTES);
        if (url.endsWith(LOCK.composerPath)) return okResponse(COMPOSER_BYTES);
        throw new Error(`unexpected fetch url in test: ${url}`);
    };
    const result = await verifyOpenApiSourceLock(LOCK, { fetchImpl: fetcher });
    assert.equal(result.ok, false);
    assert.ok(
        result.errors.some((message) => message.startsWith("source:") && message.includes("redirected")),
        `expected source redirect error, got: ${JSON.stringify(result.errors)}`,
    );
});

test("rejects an unavailable (404) commit", async () => {
    const fetcher = async (url) => {
        if (url.includes("api.github.com")) return notOkResponse(404);
        if (url.endsWith(LOCK.sourcePath)) return okResponse(SOURCE_BYTES);
        if (url.endsWith(LOCK.composerPath)) return okResponse(COMPOSER_BYTES);
        throw new Error(`unexpected fetch url in test: ${url}`);
    };
    const result = await verifyOpenApiSourceLock(LOCK, { fetchImpl: fetcher });
    assert.equal(result.ok, false);
    assert.ok(
        result.errors.some((message) => message.startsWith("commit:") && message.includes("404")),
        `expected commit-unavailable error, got: ${JSON.stringify(result.errors)}`,
    );
});

test("rejects a wrong composer hash", async () => {
    const fetcher = async (url) => {
        if (url.includes("api.github.com")) return okResponse({ sha: LOCK.commit });
        if (url.endsWith(LOCK.sourcePath)) return okResponse(SOURCE_BYTES);
        if (url.endsWith(LOCK.composerPath)) return okResponse(Buffer.from("a different composer script\n"));
        throw new Error(`unexpected fetch url in test: ${url}`);
    };
    const result = await verifyOpenApiSourceLock(LOCK, { fetchImpl: fetcher });
    assert.equal(result.ok, false);
    assert.ok(
        result.errors.some((message) => message.startsWith("composer:") && message.includes("sha256 mismatch")),
        `expected composer hash-mismatch error, got: ${JSON.stringify(result.errors)}`,
    );
});

test("rejects a network fetch failure with an explicit, non-thrown error", async () => {
    const fetcher = async (url) => {
        if (url.includes("api.github.com")) return okResponse({ sha: LOCK.commit });
        if (url.endsWith(LOCK.sourcePath)) throw new Error("simulated network failure");
        if (url.endsWith(LOCK.composerPath)) return okResponse(COMPOSER_BYTES);
        throw new Error(`unexpected fetch url in test: ${url}`);
    };
    const result = await verifyOpenApiSourceLock(LOCK, { fetchImpl: fetcher });
    assert.equal(result.ok, false);
    assert.ok(
        result.errors.some((message) => message.startsWith("source:") && message.includes("fetch failed")),
        `expected source fetch-failure error, got: ${JSON.stringify(result.errors)}`,
    );
});

test("verifies the composerVersion (declarative, non-hash) pin form without hash comparison", async () => {
    const versionLock = { ...LOCK, composerVersion: "1.4.0" };
    delete versionLock.composerSha256;
    const fetcher = async (url) => {
        if (url.includes("api.github.com")) return okResponse({ sha: versionLock.commit });
        if (url.endsWith(versionLock.sourcePath)) return okResponse(SOURCE_BYTES);
        if (url.endsWith(versionLock.composerPath)) return okResponse(Buffer.from("any bytes at all\n"));
        throw new Error(`unexpected fetch url in test: ${url}`);
    };
    const result = await verifyOpenApiSourceLock(versionLock, { fetchImpl: fetcher });
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
});
