#!/usr/bin/env node
// Build the self-contained one-click MCP install bundle (mcp/*.mcpb).
//
// `mcpb pack` does NOT install dependencies, and the repo satisfies the MCP
// server's `clockify-sdk-ts-115` peer via a workspace symlink that does not
// survive bundling. A naive `mcpb pack mcp` therefore ships a dependency-less
// bundle that crashes with ERR_MODULE_NOT_FOUND on launch. To avoid that, this
// script stages a real production install in the OS tmpdir:
//
//   1. npm pack the wrapper (zero runtime deps) into a tarball.
//   2. Copy mcp/dist + manifest/README/LICENSE into a staging bundle dir.
//   3. Write a minimal package.json whose deps include a `file:` pointer to the
//      wrapper tarball alongside the real @modelcontextprotocol/sdk + zod ranges.
//   4. Install real production copies, then require a governed production audit
//      (scripts/check-npm-audit.mjs / docs/npm-audit-exceptions.json).
//   5. Generate npm's SPDX JSON, normalise temporary file-dependency metadata,
//      and prune source/tests/symlinks/locks from the distributable tree.
//   6. Pack to the exact manifest-derived .mcpb path and report both artifact
//      sizes and SHA-256 hashes.
//
// Run via `make mcpb` (which builds the wrapper + MCP first). Needs network for
// the install + the pinned `npx @anthropic-ai/mcpb` invocation.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    cpSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    artifactPaths,
    createBuildReceipt,
    findStaleArtifacts,
    validateArchiveEntries,
    validateSpdxDocument,
} from "./mcpb-artifacts.mjs";
import { evaluateAudit } from "./lib/npm-audit-exceptions.mjs";

const MCPB = "@anthropic-ai/mcpb@2.1.2";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mcpDir = path.join(root, "mcp");

// Throw (not process.exit) so cleanup in the `finally` below always runs.
function fail(message) {
    throw new Error(message);
}

function runJson(command, args, cwd) {
    const result = spawnSync(command, args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) fail(`${command} failed to start`);
    let parsed;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        fail(`${command} returned invalid JSON`);
    }
    return { status: result.status, value: parsed };
}

function sha256(file) {
    return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function pruneProductionTree(directory, relative = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
        const absolute = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
            rmSync(absolute, { recursive: true, force: true });
            continue;
        }
        if (entry.isDirectory()) {
            const lower = entry.name.toLowerCase();
            const parentSegments = relative.toLowerCase().split("/");
            const sourceOutsideDist = lower === "src" && !parentSegments.includes("dist");
            if (
                sourceOutsideDist ||
                ["test", "tests", "__tests__", ".bin"].includes(lower)
            ) {
                rmSync(absolute, { recursive: true, force: true });
            } else {
                pruneProductionTree(absolute, childRelative);
            }
            continue;
        }
        if (!entry.isFile()) fail("staged dependency tree contains an unsupported entry");
        try {
            validateArchiveEntries([childRelative]);
        } catch {
            rmSync(absolute, { force: true });
        }
    }
}

let stageRoot;
try {
    // 1. Preconditions: both packages must be built before bundling.
    if (!existsSync(path.join(mcpDir, "dist", "index.js"))) {
        fail("mcp/dist/index.js is missing. Build first: npm run build -w @apet97/clockify-mcp-115");
    }
    if (!existsSync(path.join(root, "wrapper", "dist"))) {
        fail("wrapper/dist is missing. Build first: npm run build -w clockify-sdk-ts-115");
    }

    const mcpPkg = JSON.parse(readFileSync(path.join(mcpDir, "package.json"), "utf8"));
    const wrapperPkg = JSON.parse(readFileSync(path.join(root, "wrapper", "package.json"), "utf8"));
    const version = mcpPkg.version;
    const mcpManifest = JSON.parse(readFileSync(path.join(mcpDir, "manifest.json"), "utf8"));
    if (mcpManifest.version !== version) {
        fail(`mcp/manifest.json ${mcpManifest.version} does not match mcp/package.json ${version}`);
    }

    stageRoot = mkdtempSync(path.join(tmpdir(), "clockify115-mcpb-"));
    const bundleDir = path.join(stageRoot, "bundle");
    const artifacts = artifactPaths(root, version);
    const staleArtifacts = findStaleArtifacts(readdirSync(mcpDir), version);
    if (staleArtifacts.length > 0) {
        fail(`stale MCPB artifacts must be removed before build (${staleArtifacts.length} found)`);
    }
    rmSync(artifacts.bundle, { force: true });
    rmSync(artifacts.sbom, { force: true });
    rmSync(artifacts.receipt, { force: true });

    // 2. Pack the wrapper into the staging dir; capture the produced tarball name.
    const packJson = execFileSync(
        "npm",
        ["pack", "-w", "clockify-sdk-ts-115", "--pack-destination", stageRoot, "--json"],
        { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 64 * 1024 * 1024 },
    );
    const wrapperTarball = JSON.parse(packJson)[0].filename;
    const wrapperTarballPath = path.join(stageRoot, wrapperTarball);
    if (!existsSync(wrapperTarballPath)) {
        fail(`expected wrapper tarball at ${wrapperTarballPath} but it was not produced`);
    }

    // 3. Stage the bundle contents.
    mkdirSync(bundleDir, { recursive: true });
    cpSync(path.join(mcpDir, "dist"), path.join(bundleDir, "dist"), { recursive: true });
    for (const file of ["manifest.json", "README.md", "LICENSE"]) {
        copyFileSync(path.join(mcpDir, file), path.join(bundleDir, file));
    }

    // 4. Minimal production package.json with a file: dep on the wrapper tarball.
    const stagePkg = {
        name: "clockify115-mcp",
        version,
        type: "module",
        bin: { "clockify115-mcp": "dist/index.js" },
        dependencies: {
            "@modelcontextprotocol/sdk": mcpPkg.dependencies["@modelcontextprotocol/sdk"],
            zod: mcpPkg.dependencies.zod,
            [wrapperPkg.name]: `file:../${wrapperTarball}`,
        },
        engines: { node: ">=22.13.0" },
    };
    const bundlePkgPath = path.join(bundleDir, "package.json");
    writeFileSync(bundlePkgPath, `${JSON.stringify(stagePkg, null, 2)}\n`);

    // 5. Real production install. Keep the generated lock long enough for the
    //    production audit and npm's SPDX generator, then remove it from the
    //    distributable stage.
    execFileSync(
        "npm",
        ["install", "--omit=dev", "--install-links", "--ignore-scripts"],
        { cwd: bundleDir, stdio: "inherit" },
    );

    const audit = runJson("npm", ["audit", "--omit=dev", "--json"], bundleDir);
    const register = JSON.parse(
        readFileSync(path.join(root, "docs", "npm-audit-exceptions.json"), "utf8"),
    );
    const { failures, observed } = evaluateAudit(audit.value ?? {}, register);
    if (failures.length > 0) {
        fail(`staged production dependency audit failed:\n- ${failures.join("\n- ")}`);
    }
    for (const advisory of observed) {
        console.log(
            `build-mcpb: governed advisory ${advisory.id} (${advisory.module}, ${advisory.severity})`,
        );
    }

    // Replace the temporary file dependency in both package metadata sources
    // before npm derives the SBOM. The dependency is already materialized, so
    // this changes provenance metadata only and keeps staging paths out of the
    // document and archive.
    const installedPkg = JSON.parse(readFileSync(bundlePkgPath, "utf8"));
    installedPkg.dependencies[wrapperPkg.name] = wrapperPkg.version;
    writeFileSync(bundlePkgPath, `${JSON.stringify(installedPkg, null, 2)}\n`);
    const lockPath = path.join(bundleDir, "package-lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    if (lock.packages?.[""]?.dependencies != null) {
        lock.packages[""].dependencies[wrapperPkg.name] = wrapperPkg.version;
    }
    const wrapperLock = lock.packages?.[`node_modules/${wrapperPkg.name}`];
    if (wrapperLock != null) {
        wrapperLock.version = wrapperPkg.version;
        delete wrapperLock.resolved;
        delete wrapperLock.integrity;
    }
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    rmSync(path.join(bundleDir, "node_modules", ".package-lock.json"), { force: true });

    const sbom = runJson(
        "npm",
        ["sbom", "--omit=dev", "--sbom-format", "spdx", "--sbom-type", "application"],
        bundleDir,
    );
    if (sbom.status !== 0) fail("npm sbom failed for the staged production install");
    validateSpdxDocument(sbom.value, version);
    if (JSON.stringify(sbom.value).includes(stageRoot)) {
        fail("generated SPDX document contains the temporary staging path");
    }
    writeFileSync(artifacts.sbom, `${JSON.stringify(sbom.value, null, 2)}\n`, { mode: 0o600 });

    // 6. Locks are build evidence, not distributable content. The materialized
    //    production dependency tree remains self-contained.
    rmSync(lockPath, { force: true });
    pruneProductionTree(bundleDir);

    // 7. Pack to an explicit output path (the default would be mcp.mcpb).
    execFileSync("npx", ["--yes", MCPB, "pack", bundleDir, artifacts.bundle], {
        stdio: "inherit",
    });

    const bundleBytes = statSync(artifacts.bundle).size;
    const sbomBytes = statSync(artifacts.sbom).size;
    if (bundleBytes <= 0 || sbomBytes <= 0) {
        fail("produced MCPB or SPDX artifact is empty");
    }
    const receipt = createBuildReceipt(version, {
        mcpb: {
            file: path.basename(artifacts.bundle),
            bytes: bundleBytes,
            sha256: sha256(artifacts.bundle),
        },
        spdx: {
            file: path.basename(artifacts.sbom),
            bytes: sbomBytes,
            sha256: sha256(artifacts.sbom),
        },
    });
    writeFileSync(artifacts.receipt, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    console.log(
        JSON.stringify({
            ok: true,
            ...receipt,
            productionAuditObserved: observed.length,
            productionAuditGoverned: true,
        }),
    );
} catch (err) {
    console.error(`build-mcpb: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
} finally {
    if (stageRoot) {
        rmSync(stageRoot, { recursive: true, force: true });
    }
}
