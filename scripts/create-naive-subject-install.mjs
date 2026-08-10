#!/usr/bin/env node
// create-naive-subject-install: H1 (campaign backlog) -- pack the three
// published packages, install ALL THREE together into ONE fresh scratch npm
// project, print its path, and stop. The installed directory is D4/D5's raw
// material: hand it, plus a task's text, to a FRESH session that has no
// repo context and no memory of how any of this was built, then measure
// what it does. This script does not spawn that session or grade anything
// -- that stays entirely with D4/D5, per the campaign backlog and per an
// explicit scope decision made while building this: no eval subagents, no
// grading infrastructure, here.
//
// Invocable directly: `node scripts/create-naive-subject-install.mjs`.
// Prints the installed project directory's absolute path on the LAST line
// of stdout and exits 0. The directory is deliberately NOT cleaned up by
// this script -- the caller (an operator, or D4/D5) owns its lifecycle and
// deletes it when done.
//
// Why this doesn't reuse scripts/pack-consumer-smoke.mjs's pack()/
// tempProject()/install() directly: that script's
// docs/pack-consumer-smoke-contract.json requiredScriptMarkers check reads
// `fileURLToPath(import.meta.url)` and greps ITS OWN running file's source
// text for a fixed marker list (e.g. "packed consumer smoke passed",
// "clockify-sdk-ts-115/iter") -- a self-referential check, not an
// import-graph check. Extracting those functions into a shared lib would
// silently move markers out of pack-consumer-smoke.mjs's own source and
// red that gate. So H1 packs and installs independently, in its own file,
// using the SAME technique (npm pack --json, mkdtemp + npm init -y, npm
// install <tgz...>) -- not the same code. It also deliberately installs all
// three packages into ONE combined project rather than
// pack-consumer-smoke.mjs's three separate per-surface projects: those
// exist for release proof (each proves only the imports its own surface
// needs); a naive subject exploring the real, combined product surface
// needs the realistic install every real consumer gets.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PACKAGES = [
    { id: "wrapper", packageDir: "wrapper", npmName: "clockify-sdk-ts-115" },
    { id: "cli", packageDir: "cli", npmName: "@apet97/clockify-cli-115" },
    { id: "mcp", packageDir: "mcp", npmName: "@apet97/clockify-mcp-115" },
];

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: options.cwd ?? root,
        encoding: "utf8",
        env: { ...process.env, ...(options.env ?? {}) },
    });
    if (result.status !== 0) {
        const detail = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`;
        throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
    }
    return result.stdout ?? "";
}

/** `npm pack --silent --json` each package's own directory. Returns the
 *  absolute .tgz paths, in PACKAGES order. */
function packAll() {
    const tarballs = [];
    for (const pkg of PACKAGES) {
        const cwd = path.join(root, pkg.packageDir);
        const output = run("npm", ["pack", "--silent", "--json"], { cwd });
        const parsed = JSON.parse(output.trim());
        const file = path.resolve(cwd, parsed[0].filename);
        console.error(`packed ${pkg.npmName}: ${parsed[0].filename}`);
        tarballs.push(file);
    }
    return tarballs;
}

/** mkdtempSync + npm init -y: a fresh, empty npm project. */
function createScratchProject() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clockify-naive-subject-"));
    run("npm", ["init", "-y"], { cwd: dir });
    return dir;
}

/** Install every tarball into `dir` in one `npm install` call, so the
 *  resulting node_modules is exactly what a real "npm install all three"
 *  consumer would get -- no separate per-surface node_modules trees. */
function installAll(dir, tarballs) {
    run("npm", ["install", "--silent", ...tarballs], { cwd: dir });
}

function deleteTarballs(tarballs) {
    for (const file of tarballs) {
        try {
            fs.unlinkSync(file);
        } catch {
            // best-effort; the packed source directories are not the deliverable
        }
    }
}

export async function createNaiveSubjectInstall() {
    const tarballs = packAll();
    const dir = createScratchProject();
    installAll(dir, tarballs);
    deleteTarballs(tarballs);
    return { dir, packages: PACKAGES.map((pkg) => pkg.npmName) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const { dir, packages } = await createNaiveSubjectInstall();
    console.error(`installed ${packages.join(", ")} into a fresh scratch project.`);
    console.error("This directory is NOT cleaned up automatically -- delete it yourself when done:");
    console.error(`  rm -rf ${dir}`);
    // The path is the one line a caller should parse; everything else above
    // is human-readable progress on stderr.
    console.log(dir);
}
