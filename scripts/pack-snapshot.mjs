#!/usr/bin/env node
// Generate or verify <pkg>/.packsnapshot — the sorted `npm pack --dry-run`
// file list. Run `node scripts/pack-snapshot.mjs --pkg=wrapper|cli|mcp`
// after a package's public surface or generated file names change (build
// first); `--check` verifies the committed baseline still matches the built
// tarball.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packages = new Set(["wrapper", "cli", "mcp"]);
const args = process.argv.slice(2);
const pkgArg = args.find((arg) => arg.startsWith("--pkg="));
const pkg = pkgArg?.slice("--pkg=".length) || "wrapper";
const check = args.includes("--check");

if (!packages.has(pkg)) {
    console.error(`pack-snapshot: unknown --pkg=${pkg}. Expected one of ${[...packages].join(", ")}.`);
    process.exit(1);
}

const packageDir = path.join(root, pkg);
const snapshotPath = path.join(packageDir, ".packsnapshot");

const stdout = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
});
const files = JSON.parse(stdout)[0].files.map((file) => file.path).sort();
const content = files.join("\n") + "\n";

if (check) {
    let current = "";
    try {
        current = readFileSync(snapshotPath, "utf8");
    } catch {
        console.error(
            `pack-snapshot: ${pkg}/.packsnapshot is missing. Run \`node scripts/pack-snapshot.mjs --pkg=${pkg}\`.`,
        );
        process.exit(1);
    }
    if (current !== content) {
        const before = new Set(current.split("\n").filter(Boolean));
        const after = new Set(files);
        const added = files.filter((file) => !before.has(file));
        const removed = [...before].filter((file) => !after.has(file));
        console.error(`pack-snapshot: tarball drifted from ${pkg}/.packsnapshot.`);
        if (added.length > 0) console.error(`  + ${added.length} added (e.g. ${added.slice(0, 3).join(", ")})`);
        if (removed.length > 0) console.error(`  - ${removed.length} removed (e.g. ${removed.slice(0, 3).join(", ")})`);
        console.error(
            `Rebuild ${pkg}, then run \`node scripts/pack-snapshot.mjs --pkg=${pkg}\` and commit the result.`,
        );
        process.exit(1);
    }
    console.log(`pack snapshot matches baseline (${files.length} entries) [${pkg}].`);
} else {
    writeFileSync(snapshotPath, content);
    console.log(`wrote ${pkg}/.packsnapshot (${files.length} entries).`);
}
