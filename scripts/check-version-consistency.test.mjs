import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/check-version-consistency.mjs");
const generateCommand = "node ../scripts/generate-package-versions.mjs && ";

const packageVersions = {
    wrapper: "0.12.0",
    cli: "0.3.0",
    mcp: "0.6.0",
};

const packageNames = {
    wrapper: "clockify-sdk-ts-115",
    cli: "@apet97/clockify-cli-115",
    mcp: "@apet97/clockify-mcp-115",
};

const runtimeVersionFiles = {
    wrapper: "wrapper/generated/version.ts",
    cli: "cli/src/generated/version.ts",
    mcp: "mcp/src/generated/version.ts",
};

const packages = [
    {
        id: "wrapper",
        manifest: "wrapper/package.json",
        packageName: packageNames.wrapper,
        runtimeVersionFile: runtimeVersionFiles.wrapper,
    },
    {
        id: "cli",
        manifest: "cli/package.json",
        packageName: packageNames.cli,
        runtimeVersionFile: runtimeVersionFiles.cli,
        peerDependencies: { "clockify-sdk-ts-115": ">=0.12.0 <1" },
    },
    {
        id: "mcp",
        manifest: "mcp/package.json",
        packageName: packageNames.mcp,
        runtimeVersionFile: runtimeVersionFiles.mcp,
        peerDependencies: { "clockify-sdk-ts-115": ">=0.12.0 <1" },
        additionalVersionManifests: ["mcp/manifest.json"],
    },
];

const versionPolicy = {
    versionConsistency: {
        releasePleaseManifest: ".release-please-manifest.json",
        releasePleaseConfig: "release-please-config.json",
        packages,
    },
};

test("standalone version and package entrypoints generate ignored runtime constants", async () => {
    const makefile = await readFile(path.join(root, "Makefile"), "utf8");
    assert.match(
        makefile,
        /version-consistency:\n\tnode scripts\/generate-package-versions\.mjs\n\tnode scripts\/check-version-consistency\.mjs/,
    );

    const requiredScripts = {
        wrapper: [
            "docs",
            "test",
            "test:coverage",
            "test:watch",
            "test:types",
            "type-check",
            "build",
        ],
        cli: ["dev", "test", "test:coverage", "test:watch", "type-check", "build"],
        mcp: ["dev", "test", "test:coverage", "test:watch", "type-check", "build"],
    };
    for (const [pkg, scriptNames] of Object.entries(requiredScripts)) {
        const manifest = JSON.parse(await readFile(path.join(root, pkg, "package.json"), "utf8"));
        for (const scriptName of scriptNames) {
            assert.ok(
                manifest.scripts?.[scriptName]?.startsWith(generateCommand),
                `${pkg} ${scriptName} must generate the manifest-derived runtime version first`,
            );
        }
    }
});

function runStagedScript(stagedRoot) {
    return new Promise((resolve) => {
        execFile(
            process.execPath,
            [path.join(stagedRoot, "scripts/check-version-consistency.mjs")],
            (error, stdout, stderr) => {
                resolve({
                    code: error && typeof error.code === "number" ? error.code : 0,
                    stdout,
                    stderr,
                });
            },
        );
    });
}

async function writeJson(stagedRoot, relativePath, value) {
    const absolutePath = path.join(stagedRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function mutateJson(stagedRoot, relativePath, mutate) {
    const absolutePath = path.join(stagedRoot, relativePath);
    const value = JSON.parse(await readFile(absolutePath, "utf8"));
    mutate(value);
    await writeJson(stagedRoot, relativePath, value);
}

async function stageRoot() {
    const stagedRoot = await mkdtemp(path.join(os.tmpdir(), "clockify-vc-test-"));
    await mkdir(path.join(stagedRoot, "scripts"), { recursive: true });
    await copyFile(script, path.join(stagedRoot, "scripts/check-version-consistency.mjs"));
    await writeJson(stagedRoot, "docs/version-policy.json", versionPolicy);
    await writeJson(stagedRoot, ".release-please-manifest.json", packageVersions);
    await writeJson(stagedRoot, "release-please-config.json", {
        packages: Object.fromEntries(
            Object.entries(packageNames).map(([id, packageName]) => [
                id,
                { "package-name": packageName },
            ]),
        ),
    });

    for (const id of Object.keys(packageVersions)) {
        const manifest = {
            name: packageNames[id],
            version: packageVersions[id],
            ...(id === "wrapper"
                ? {}
                : { peerDependencies: { "clockify-sdk-ts-115": ">=0.12.0 <1" } }),
        };
        await writeJson(stagedRoot, `${id}/package.json`, manifest);
        const runtimePath = path.join(stagedRoot, runtimeVersionFiles[id]);
        await mkdir(path.dirname(runtimePath), { recursive: true });
        await writeFile(
            runtimePath,
            `// Generated from ${id}/package.json. Do not edit.\n` +
                `export const PACKAGE_VERSION = "${packageVersions[id]}" as const;\n`,
        );
    }
    await writeJson(stagedRoot, "mcp/manifest.json", { version: packageVersions.mcp });
    return stagedRoot;
}

async function expectFailure(stagedRoot, pattern) {
    const result = await runStagedScript(stagedRoot);
    assert.equal(result.code, 1);
    assert.match(result.stderr, pattern);
}

test("passes when every package, release, peer, manifest, and runtime version agrees", async () => {
    const stagedRoot = await stageRoot();
    try {
        const result = await runStagedScript(stagedRoot);
        assert.equal(result.code, 0, result.stderr);
        assert.match(result.stdout, /release-please manifest and config in sync/);
    } finally {
        await rm(stagedRoot, { recursive: true, force: true });
    }
});

for (const id of Object.keys(packageVersions)) {
    test(`fails when the ${id} release-manifest version is missing`, async () => {
        const stagedRoot = await stageRoot();
        try {
            await mutateJson(stagedRoot, ".release-please-manifest.json", (manifest) => {
                delete manifest[id];
            });
            await expectFailure(stagedRoot, new RegExp(`missing tracked key "${id}"`));
        } finally {
            await rm(stagedRoot, { recursive: true, force: true });
        }
    });

    test(`fails when the ${id} release-manifest version is stale`, async () => {
        const stagedRoot = await stageRoot();
        try {
            await mutateJson(stagedRoot, ".release-please-manifest.json", (manifest) => {
                manifest[id] = "9.9.9";
            });
            await expectFailure(
                stagedRoot,
                new RegExp(`tracks ${id}=9\\.9\\.9 .* ${id}/package\\.json is ${packageVersions[id].replaceAll(".", "\\.")}`),
            );
        } finally {
            await rm(stagedRoot, { recursive: true, force: true });
        }
    });
}

for (const id of ["cli", "mcp"]) {
    test(`fails when the ${id} SDK peer range is missing`, async () => {
        const stagedRoot = await stageRoot();
        try {
            await mutateJson(stagedRoot, `${id}/package.json`, (manifest) => {
                delete manifest.peerDependencies["clockify-sdk-ts-115"];
            });
            await expectFailure(stagedRoot, new RegExp(`${id}.*peer dependency.*missing`, "i"));
        } finally {
            await rm(stagedRoot, { recursive: true, force: true });
        }
    });

    test(`fails when the ${id} SDK peer range is stale`, async () => {
        const stagedRoot = await stageRoot();
        try {
            await mutateJson(stagedRoot, `${id}/package.json`, (manifest) => {
                manifest.peerDependencies["clockify-sdk-ts-115"] = ">=0.11.0 <1";
            });
            await expectFailure(stagedRoot, new RegExp(`${id}.*>=0\\.11\\.0 <1.*>=0\\.12\\.0 <1`));
        } finally {
            await rm(stagedRoot, { recursive: true, force: true });
        }
    });
}

test("fails when the MCP secondary manifest version is missing", async () => {
    const stagedRoot = await stageRoot();
    try {
        await mutateJson(stagedRoot, "mcp/manifest.json", (manifest) => {
            delete manifest.version;
        });
        await expectFailure(stagedRoot, /mcp\/manifest\.json.*version.*missing/i);
    } finally {
        await rm(stagedRoot, { recursive: true, force: true });
    }
});

test("fails when the MCP secondary manifest version is stale", async () => {
    const stagedRoot = await stageRoot();
    try {
        await mutateJson(stagedRoot, "mcp/manifest.json", (manifest) => {
            manifest.version = "0.5.0";
        });
        await expectFailure(stagedRoot, /mcp\/manifest\.json.*0\.5\.0.*mcp\/package\.json.*0\.6\.0/);
    } finally {
        await rm(stagedRoot, { recursive: true, force: true });
    }
});

for (const id of Object.keys(packageVersions)) {
    test(`fails when the ${id} generated runtime version is missing`, async () => {
        const stagedRoot = await stageRoot();
        try {
            await unlink(path.join(stagedRoot, runtimeVersionFiles[id]));
            await expectFailure(stagedRoot, new RegExp(`${runtimeVersionFiles[id]} is missing`));
        } finally {
            await rm(stagedRoot, { recursive: true, force: true });
        }
    });

    test(`fails when the ${id} generated runtime version is stale`, async () => {
        const stagedRoot = await stageRoot();
        try {
            await writeFile(
                path.join(stagedRoot, runtimeVersionFiles[id]),
                'export const PACKAGE_VERSION = "9.9.9" as const;\n',
            );
            await expectFailure(
                stagedRoot,
                new RegExp(`${runtimeVersionFiles[id]}.*9\\.9\\.9.*${packageVersions[id].replaceAll(".", "\\.")}`),
            );
        } finally {
            await rm(stagedRoot, { recursive: true, force: true });
        }
    });
}

for (const id of Object.keys(packageVersions)) {
    test(`fails when the ${id} release-please package identity is missing`, async () => {
        const stagedRoot = await stageRoot();
        try {
            await mutateJson(stagedRoot, "release-please-config.json", (config) => {
                delete config.packages[id]["package-name"];
            });
            await expectFailure(
                stagedRoot,
                new RegExp(`release-please.*${id}.*package-name.*missing`, "i"),
            );
        } finally {
            await rm(stagedRoot, { recursive: true, force: true });
        }
    });

    test(`fails when the ${id} release-please package identity is stale`, async () => {
        const stagedRoot = await stageRoot();
        try {
            await mutateJson(stagedRoot, "release-please-config.json", (config) => {
                config.packages[id]["package-name"] = "stale-package-name";
            });
            await expectFailure(
                stagedRoot,
                new RegExp(`release-please.*${id}.*stale-package-name.*${packageNames[id].replaceAll("/", "\\/")}`),
            );
        } finally {
            await rm(stagedRoot, { recursive: true, force: true });
        }
    });
}
