// Tests for scripts/lib/published-artifact.mjs. Every case injects
// npmViewImpl/fetchImpl/unpackImpl -- no real registry or filesystem tar is
// touched, so this suite stays offline and deterministic.
//
// Wiring note: this file is NOT yet named in Makefile (adding that line
// would touch a live-evidence-currentness governed input, see
// docs/live-evidence-currentness-contract.json's governedInputs: Makefile).
// It is deliberately exempted in docs/test-wiring-contract.json's
// unwiredTests with a disposition to land its own `node --test` line in the
// Phase D governed batch, mirroring the existing
// check-agent-handoff.skills-parity.test.mjs precedent -- see that entry.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { fetchPublishedArtifact, PublishedArtifactError } from "./published-artifact.mjs";

const TARBALL_URL = "https://registry.npmjs.org/example-pkg/-/example-pkg-1.0.0.tgz";

function integrityOf(bytes) {
    return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

function okView(bytes) {
    return async () => ({ ok: true, tarball: TARBALL_URL, integrity: integrityOf(bytes) });
}

function okFetch(bytes) {
    return async (url) => {
        assert.equal(url, TARBALL_URL);
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
}

test("throws PublishedArtifactError when npm view fails (offline / registry unreachable)", async () => {
    await assert.rejects(
        fetchPublishedArtifact("example-pkg@1.0.0", {
            npmViewImpl: async () => ({ ok: false, detail: "getaddrinfo ENOTFOUND registry.npmjs.org" }),
            fetchImpl: async () => {
                throw new Error("fetch must not run when npm view already failed");
            },
            unpackImpl: () => {
                throw new Error("unpack must not run when npm view already failed");
            },
        }),
        (err) => {
            assert.ok(err instanceof PublishedArtifactError);
            assert.equal(err.code, "registry-unreachable");
            assert.match(err.message, /registry access/);
            assert.match(err.message, /ENOTFOUND/);
            return true;
        },
    );
});

test("throws PublishedArtifactError when npm view omits dist.tarball or dist.integrity", async () => {
    await assert.rejects(
        fetchPublishedArtifact("example-pkg@1.0.0", {
            npmViewImpl: async () => ({ ok: true, tarball: TARBALL_URL, integrity: undefined }),
            fetchImpl: async () => {
                throw new Error("fetch must not run without both dist fields");
            },
            unpackImpl: () => {
                throw new Error("unpack must not run without both dist fields");
            },
        }),
        (err) => {
            assert.ok(err instanceof PublishedArtifactError);
            assert.equal(err.code, "missing-dist-metadata");
            return true;
        },
    );
});

test("throws PublishedArtifactError when the download rejects", async () => {
    await assert.rejects(
        fetchPublishedArtifact("example-pkg@1.0.0", {
            npmViewImpl: okView(Buffer.from("irrelevant")),
            fetchImpl: async () => {
                throw new Error("ECONNRESET");
            },
            unpackImpl: () => {
                throw new Error("unpack must not run when the download failed");
            },
        }),
        (err) => {
            assert.ok(err instanceof PublishedArtifactError);
            assert.equal(err.code, "download-failed");
            assert.match(err.message, /ECONNRESET/);
            return true;
        },
    );
});

test("throws PublishedArtifactError when the download returns a non-OK HTTP status", async () => {
    await assert.rejects(
        fetchPublishedArtifact("example-pkg@1.0.0", {
            npmViewImpl: okView(Buffer.from("irrelevant")),
            fetchImpl: async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
            unpackImpl: () => {
                throw new Error("unpack must not run on a non-OK download");
            },
        }),
        (err) => {
            assert.ok(err instanceof PublishedArtifactError);
            assert.equal(err.code, "download-failed");
            assert.match(err.message, /404/);
            return true;
        },
    );
});

test("throws PublishedArtifactError and never unpacks when the downloaded bytes fail sha512 verification (tampered/corrupted download)", async () => {
    const claimedBytes = Buffer.from("this is what the registry says the tarball hashes to");
    const actualBytes = Buffer.from("but the bytes that actually arrived are different");
    let unpackCalled = false;
    await assert.rejects(
        fetchPublishedArtifact("example-pkg@1.0.0", {
            npmViewImpl: okView(claimedBytes),
            fetchImpl: okFetch(actualBytes),
            unpackImpl: () => {
                unpackCalled = true;
                return { ok: true };
            },
        }),
        (err) => {
            assert.ok(err instanceof PublishedArtifactError);
            assert.equal(err.code, "integrity-mismatch");
            assert.match(err.message, /Refusing to unpack/);
            return true;
        },
    );
    assert.equal(unpackCalled, false, "unpack must never run on bytes that fail integrity verification");
});

test("throws PublishedArtifactError when unpacking itself fails", async () => {
    const bytes = Buffer.from("valid, matching bytes");
    await assert.rejects(
        fetchPublishedArtifact("example-pkg@1.0.0", {
            npmViewImpl: okView(bytes),
            fetchImpl: okFetch(bytes),
            unpackImpl: () => ({ ok: false, detail: "tar: unexpected end of file" }),
        }),
        (err) => {
            assert.ok(err instanceof PublishedArtifactError);
            assert.equal(err.code, "unpack-failed");
            assert.match(err.message, /unexpected end of file/);
            return true;
        },
    );
});

test("throws PublishedArtifactError on an empty or non-string spec", async () => {
    for (const bad of ["", "   ", undefined, null]) {
        await assert.rejects(
            fetchPublishedArtifact(bad, {
                npmViewImpl: () => {
                    throw new Error("npm view must not run on an invalid spec");
                },
            }),
            (err) => {
                assert.ok(err instanceof PublishedArtifactError);
                assert.equal(err.code, "invalid-spec");
                return true;
            },
        );
    }
});

test("resolves with unpackedDir/packageDir/tarballPath/integrity when everything verifies (happy path)", async () => {
    const bytes = Buffer.from("valid, matching bytes for the happy path");
    let capturedTarballPath;
    let capturedDestDir;
    const result = await fetchPublishedArtifact("example-pkg@1.0.0", {
        npmViewImpl: okView(bytes),
        fetchImpl: okFetch(bytes),
        unpackImpl: (tarballPath, destDir) => {
            capturedTarballPath = tarballPath;
            capturedDestDir = destDir;
            return { ok: true };
        },
    });
    try {
        assert.equal(result.tarballUrl, TARBALL_URL);
        assert.equal(result.integrity, integrityOf(bytes));
        assert.equal(result.tarballPath, capturedTarballPath);
        assert.equal(result.unpackedDir, capturedDestDir);
        assert.equal(result.packageDir, `${result.unpackedDir}/package`);
        assert.ok(fs.existsSync(result.tarballPath), "the verified tarball bytes must be written to disk before unpack runs");
        assert.deepEqual(fs.readFileSync(result.tarballPath), bytes);
    } finally {
        fs.rmSync(result.unpackedDir, { recursive: true, force: true });
    }
});
