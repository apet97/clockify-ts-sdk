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
//   4. `npm install --omit=dev --install-links --no-package-lock` so every
//      runtime dep (including the wrapper) lands as a real copy under
//      node_modules, not a symlink.
//   5. Normalise the staged metadata so the shipped package.json carries a
//      stable wrapper version (not the absolute tmp tarball path) and drop the
//      hidden node_modules/.package-lock.json (also tmp-path-bearing).
//   6. `mcpb pack <stage> <repo>/mcp/clockify115-mcp-<ver>.mcpb`.
//
// Run via `make mcpb` (which builds the wrapper + MCP first). Needs network for
// the install + the pinned `npx @anthropic-ai/mcpb` invocation.
import { execFileSync } from "node:child_process";
import {
    cpSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MCPB = "@anthropic-ai/mcpb@2.1.2";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mcpDir = path.join(root, "mcp");

// Throw (not process.exit) so cleanup in the `finally` below always runs.
function fail(message) {
    throw new Error(message);
}

let stageRoot;
try {
    // 1. Preconditions: both packages must be built before bundling.
    if (!existsSync(path.join(mcpDir, "dist", "index.js"))) {
        fail("mcp/dist/index.js is missing. Build first: npm run build -w @clockify115/mcp-server");
    }
    if (!existsSync(path.join(root, "wrapper", "dist"))) {
        fail("wrapper/dist is missing. Build first: npm run build -w clockify-sdk-ts-115");
    }

    const mcpPkg = JSON.parse(readFileSync(path.join(mcpDir, "package.json"), "utf8"));
    const wrapperPkg = JSON.parse(readFileSync(path.join(root, "wrapper", "package.json"), "utf8"));
    const version = mcpPkg.version;

    stageRoot = mkdtempSync(path.join(tmpdir(), "clockify115-mcpb-"));
    const bundleDir = path.join(stageRoot, "bundle");
    const outPath = path.join(mcpDir, `clockify115-mcp-${version}.mcpb`);

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
            [wrapperPkg.name]: `file:${wrapperTarballPath}`,
        },
    };
    const bundlePkgPath = path.join(bundleDir, "package.json");
    writeFileSync(bundlePkgPath, `${JSON.stringify(stagePkg, null, 2)}\n`);

    // 5. Real production install (--install-links forces the file: dep to a copy).
    execFileSync(
        "npm",
        ["install", "--omit=dev", "--install-links", "--no-package-lock"],
        { cwd: bundleDir, stdio: "inherit" },
    );

    // 6. Normalise shipped metadata: the wrapper dep and the hidden lock both
    //    carry the absolute tmp tarball path post-install (a non-deterministic
    //    info leak that has no effect on the extract-and-run path but would
    //    confuse a stray `npm install` on the unpacked bundle). Pin the wrapper
    //    to its real version and drop the lock; the materialised node_modules
    //    copy is untouched, so launch stays self-contained.
    const installedPkg = JSON.parse(readFileSync(bundlePkgPath, "utf8"));
    installedPkg.dependencies[wrapperPkg.name] = wrapperPkg.version;
    writeFileSync(bundlePkgPath, `${JSON.stringify(installedPkg, null, 2)}\n`);
    rmSync(path.join(bundleDir, "node_modules", ".package-lock.json"), { force: true });

    // 7. Pack to an explicit output path (the default would be mcp.mcpb).
    execFileSync("npx", ["--yes", MCPB, "pack", bundleDir, outPath], { stdio: "inherit" });

    const size = statSync(outPath).size;
    if (size <= 0) {
        fail(`produced bundle ${outPath} is empty`);
    }
    console.log(`build-mcpb: wrote ${outPath} (${size} bytes)`);
} catch (err) {
    console.error(`build-mcpb: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
} finally {
    if (stageRoot) {
        rmSync(stageRoot, { recursive: true, force: true });
    }
}
