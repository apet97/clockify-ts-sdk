import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    artifactPaths,
    createBuildReceipt,
    createMinimalServerEnvironment,
    findStaleArtifacts,
    validateArchiveEntries,
    validateArchiveFileContents,
    validateBuildReceipt,
    validateProtocolSurface,
    validateSpdxDocument,
    zipInfoLineIsSymlink,
} from "./mcpb-artifacts.mjs";

test("derives exact manifest-versioned MCPB and SPDX paths", () => {
    assert.deepEqual(artifactPaths("/repo", "0.6.0"), {
        bundle: "/repo/mcp/clockify115-mcp-0.6.0.mcpb",
        sbom: "/repo/mcp/clockify115-mcp-0.6.0.spdx.json",
        receipt: "/repo/mcp/clockify115-mcp-0.6.0.build.json",
    });
});

test("rejects stale wildcard-family artifacts instead of selecting one", () => {
    assert.deepEqual(
        findStaleArtifacts(
            [
                "clockify115-mcp-0.5.0.mcpb",
                "clockify115-mcp-0.6.0.mcpb",
                "clockify115-mcp-0.6.0.spdx.json",
                "README.md",
            ],
            "0.6.0",
        ),
        ["clockify115-mcp-0.5.0.mcpb"],
    );
});

test("accepts only the governed MCPB payload allowlist", () => {
    assert.doesNotThrow(() =>
        validateArchiveEntries([
            "manifest.json",
            "package.json",
            "README.md",
            "LICENSE",
            "dist/index.js",
            "node_modules/clockify-sdk-ts-115/dist/esm/src/index.js",
            "node_modules/zod/package.json",
        ]),
    );
});

for (const entry of [
    "/absolute",
    "../escape",
    "dist/../../escape",
    "dist\\escape.js",
    "C:/escape",
    ".env",
    "node_modules/pkg/.npmrc",
    "node_modules/pkg/.github/workflows/publish.yml",
    "src/index.ts",
    "node_modules/pkg/src/index.js",
    "node_modules/pkg/dist/index.js.map",
    "tests/server.test.js",
    "dist/debug.log",
    "package-lock.json",
    "node_modules/.package-lock.json",
    "dist/private.pem",
    "dist/nested.zip",
    "unexpected.txt",
]) {
    test(`rejects unsafe archive entry ${entry}`, () => {
        assert.throws(() => validateArchiveEntries([entry]), /archive entry/i);
    });
}

test("recognizes symlink mode metadata before extraction", () => {
    assert.equal(zipInfoLineIsSymlink("lrwxr-xr-x  3.0 unx  10 bx stor 01-Jan-80 link"), true);
    assert.equal(zipInfoLineIsSymlink("-rw-r--r--  3.0 unx  10 tx defN 01-Jan-80 dist/index.js"), false);
});

test("launches the extracted server with only allowlisted host variables and blank Clockify state", () => {
    assert.deepEqual(
        createMinimalServerEnvironment({
            PATH: "/usr/bin:/bin",
            TMPDIR: "/tmp/safe",
            LANG: "en_US.UTF-8",
            HOME: "/Users/operator",
            CUSTOM_SECRET: "do-not-inherit",
            NPM_TOKEN: "do-not-inherit",
            CLOCKIFY_API_KEY: "do-not-inherit",
            CLOCKIFY_WORKSPACE_ID: "do-not-inherit",
        }),
        {
            PATH: "/usr/bin:/bin",
            TMPDIR: "/tmp/safe",
            LANG: "en_US.UTF-8",
            CLOCKIFY_API_KEY: "",
            CLOCKIFY_ADDON_TOKEN: "",
            CLOCKIFY_WORKSPACE_ID: "",
            CLOCKIFY_BASE_URL: "",
            CLOCKIFY_LIVE_WORKSPACE_CONFIRM: "",
        },
    );
});

test("rejects complete PEM private keys by content without including their content in the error", () => {
    const pem = [
        "ordinary prefix",
        "-----BEGIN PRIVATE KEY-----",
        "c3VwZXItc2VjcmV0",
        "-----END PRIVATE KEY-----",
    ].join("\n");
    assert.throws(
        () => validateArchiveFileContents([{ relative: "dist/index.js", content: Buffer.from(pem) }]),
        (error) => {
            assert.match(error.message, /private key.*dist\/index\.js/i);
            assert.doesNotMatch(error.message, /c3VwZXItc2VjcmV0/);
            return true;
        },
    );
});

for (const content of [
    "//registry.npmjs.org/:_authToken=npm_not_a_real_token",
    "_auth=bnBtOm5vdC1hLXJlYWwtdG9rZW4=",
    "_password=bnBtX3Bhc3N3b3Jk",
    'NPM_TOKEN="npm_not_a_real_token"',
    '"NODE_AUTH_TOKEN": "npm_not_a_real_token"',
    'npmAuthToken: "npm_not_a_real_token"',
]) {
    test(`rejects npm credential assignment content: ${content.split(/[=:]/, 1)[0]}`, () => {
        assert.throws(
            () =>
                validateArchiveFileContents([
                    { relative: "node_modules/pkg/README.md", content: Buffer.from(content) },
                ]),
            /npm credential.*README\.md/i,
        );
    });
}

test("allows documentation that only names npm environment variables", () => {
    assert.doesNotThrow(() =>
        validateArchiveFileContents([
            {
                relative: "README.md",
                content: Buffer.from("Configure NPM_TOKEN in CI; source reads process.env.NODE_AUTH_TOKEN."),
            },
        ]),
    );
});

test("validates SPDX identity and package version", () => {
    const valid = {
        spdxVersion: "SPDX-2.3",
        SPDXID: "SPDXRef-DOCUMENT",
        name: "clockify115-mcp@0.6.0",
        documentNamespace:
            "http://spdx.org/spdxdocs/clockify115-mcp-0.6.0-11111111-1111-4111-8111-111111111111",
        creationInfo: {
            created: "2026-07-12T00:00:00.000Z",
            creators: ["Tool: npm/cli-11.12.1"],
        },
        dataLicense: "CC0-1.0",
        packages: [
            {
                SPDXID: "SPDXRef-Package-clockify115-mcp",
                name: "clockify115-mcp",
                versionInfo: "0.6.0",
            },
        ],
    };
    assert.doesNotThrow(() => validateSpdxDocument(valid, "0.6.0"));
    assert.throws(
        () => validateSpdxDocument({ ...valid, packages: [{ ...valid.packages[0], versionInfo: "0.5.0" }] }, "0.6.0"),
        /SPDX/i,
    );
});

for (const [label, mutate] of [
    ["SPDX 2.3 version", (value) => ({ ...value, spdxVersion: "SPDX-2.2" })],
    ["document name", (value) => ({ ...value, name: "clockify115-mcp" })],
    ["document namespace", (value) => ({ ...value, documentNamespace: "not-a-url" })],
    ["creation info", (value) => ({ ...value, creationInfo: { created: "invalid", creators: [] } })],
    ["data license", (value) => ({ ...value, dataLicense: "NOASSERTION" })],
    ["packages", (value) => ({ ...value, packages: [] })],
]) {
    test(`requires strict SPDX 2.3 ${label}`, () => {
        const valid = {
            spdxVersion: "SPDX-2.3",
            SPDXID: "SPDXRef-DOCUMENT",
            name: "clockify115-mcp@0.6.0",
            documentNamespace:
                "http://spdx.org/spdxdocs/clockify115-mcp-0.6.0-11111111-1111-4111-8111-111111111111",
            creationInfo: {
                created: "2026-07-12T00:00:00.000Z",
                creators: ["Tool: npm/cli-11.12.1"],
            },
            dataLicense: "CC0-1.0",
            packages: [
                {
                    SPDXID: "SPDXRef-Package-clockify115-mcp",
                    name: "clockify115-mcp",
                    versionInfo: "0.6.0",
                },
            ],
        };
        assert.throws(() => validateSpdxDocument(mutate(valid), "0.6.0"), /SPDX/i);
    });
}

test("rejects temporary build paths anywhere in SPDX metadata", () => {
    const document = {
        spdxVersion: "SPDX-2.3",
        SPDXID: "SPDXRef-DOCUMENT",
        name: "clockify115-mcp@0.6.0",
        documentNamespace:
            "http://spdx.org/spdxdocs/clockify115-mcp-0.6.0-11111111-1111-4111-8111-111111111111",
        creationInfo: {
            created: "2026-07-12T00:00:00.000Z",
            creators: ["Tool: npm/cli-11.12.1"],
            comment: "built at /private/tmp/clockify115-mcpb-secret/bundle",
        },
        dataLicense: "CC0-1.0",
        packages: [
            {
                SPDXID: "SPDXRef-Package-clockify115-mcp",
                name: "clockify115-mcp",
                versionInfo: "0.6.0",
            },
        ],
    };
    assert.throws(() => validateSpdxDocument(document, "0.6.0"), /temporary path/i);
});

test("rejects macOS temporary staging paths without the /private prefix", () => {
    const document = {
        spdxVersion: "SPDX-2.3",
        SPDXID: "SPDXRef-DOCUMENT",
        name: "clockify115-mcp@0.6.0",
        documentNamespace:
            "http://spdx.org/spdxdocs/clockify115-mcp-0.6.0-11111111-1111-4111-8111-111111111111",
        creationInfo: {
            created: "2026-07-12T00:00:00.000Z",
            creators: ["Tool: npm/cli-11.12.1"],
            comment: "built at /var/folders/aa/bb/T/clockify115-mcpb-stage",
        },
        dataLicense: "CC0-1.0",
        packages: [
            {
                SPDXID: "SPDXRef-Package-clockify115-mcp",
                name: "clockify115-mcp",
                versionInfo: "0.6.0",
            },
        ],
    };
    assert.throws(() => validateSpdxDocument(document, "0.6.0"), /temporary path/i);
});

test("creates and validates a deterministic exact-artifact build receipt", () => {
    const actual = {
        mcpb: { file: "clockify115-mcp-0.6.0.mcpb", bytes: 123, sha256: "a".repeat(64) },
        spdx: { file: "clockify115-mcp-0.6.0.spdx.json", bytes: 456, sha256: "b".repeat(64) },
    };
    const first = createBuildReceipt("0.6.0", actual);
    const second = createBuildReceipt("0.6.0", actual);
    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.doesNotThrow(() => validateBuildReceipt(first, "0.6.0", actual));
    assert.throws(
        () =>
            validateBuildReceipt(first, "0.6.0", {
                ...actual,
                mcpb: { ...actual.mcpb, sha256: "c".repeat(64) },
            }),
        /receipt.*mcpb.*sha256/i,
    );
    assert.throws(
        () => validateBuildReceipt({ ...first, generatedAt: "2026-07-12T00:00:00Z" }, "0.6.0", actual),
        /receipt.*deterministic/i,
    );
    assert.doesNotMatch(JSON.stringify(first), /created|timestamp|tmp/i);
});

test("make mcpb and mcpb-smoke both execute the artifact unit tests", () => {
    const makefile = readFileSync(new URL("../Makefile", import.meta.url), "utf8");
    const mcpbTarget = makefile.slice(makefile.indexOf("mcpb:"), makefile.indexOf("\nmcpb-validate:"));
    const smokeTarget = makefile.slice(
        makefile.indexOf("mcpb-smoke:"),
        makefile.indexOf("\ngoclmcp-drift:"),
    );
    assert.match(mcpbTarget, /mcpb:\s+mcpb-validate/);
    assert.match(smokeTarget, /mcpb-smoke:\s+mcpb(?:\s+mcpb-validate)?/);
});

test("requires the exact tool names and six resources/two prompts", () => {
    assert.doesNotThrow(() =>
        validateProtocolSurface({
            actualTools: ["a", "b"],
            expectedTools: ["b", "a"],
            resourceCount: 6,
            promptCount: 2,
        }),
    );
    assert.throws(
        () =>
            validateProtocolSurface({
                actualTools: ["a", "c"],
                expectedTools: ["a", "b"],
                resourceCount: 6,
                promptCount: 2,
            }),
        /tool names/i,
    );
    assert.throws(
        () =>
            validateProtocolSurface({
                actualTools: ["a", "b"],
                expectedTools: ["a", "b"],
                resourceCount: 5,
                promptCount: 2,
            }),
        /resources/i,
    );
});
