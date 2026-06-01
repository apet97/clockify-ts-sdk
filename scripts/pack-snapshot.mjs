#!/usr/bin/env node
// Generate or verify wrapper/.packsnapshot — the sorted `npm pack --dry-run`
// file list. Run `node scripts/pack-snapshot.mjs` to regenerate after the SDK
// public surface or generated file names change (build the wrapper first);
// `--check` verifies the committed baseline still matches the built tarball.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrapper = path.join(root, "wrapper");
const snapshotPath = path.join(wrapper, ".packsnapshot");

const stdout = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: wrapper,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
});
const files = JSON.parse(stdout)[0].files.map((file) => file.path).sort();
const content = files.join("\n") + "\n";

if (process.argv.includes("--check")) {
    let current = "";
    try {
        current = readFileSync(snapshotPath, "utf8");
    } catch {
        console.error("pack-snapshot: wrapper/.packsnapshot is missing. Run `node scripts/pack-snapshot.mjs`.");
        process.exit(1);
    }
    if (current !== content) {
        const before = new Set(current.split("\n").filter(Boolean));
        const after = new Set(files);
        const added = files.filter((file) => !before.has(file));
        const removed = [...before].filter((file) => !after.has(file));
        console.error("pack-snapshot: tarball drifted from wrapper/.packsnapshot.");
        if (added.length > 0) console.error(`  + ${added.length} added (e.g. ${added.slice(0, 3).join(", ")})`);
        if (removed.length > 0) console.error(`  - ${removed.length} removed (e.g. ${removed.slice(0, 3).join(", ")})`);
        console.error("Rebuild the wrapper, then run `node scripts/pack-snapshot.mjs` and commit the result.");
        process.exit(1);
    }
    console.log(`pack snapshot matches baseline (${files.length} entries).`);
} else {
    writeFileSync(snapshotPath, content);
    console.log(`wrote wrapper/.packsnapshot (${files.length} entries).`);
}
