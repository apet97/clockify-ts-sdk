#!/usr/bin/env node
// ensure-generated-sdk: make a fresh clone able to run wrapper tests and
// type-checks with no extra step (SDK-7). wrapper/src/** is generated and
// gitignored, but wrapper/index.ts re-exports from it, so `npm test` and
// `npm run type-check` failed on a fresh clone until someone knew to run
// `make sdk-codegen`. Wired as `pretest` / `pretype-check` in
// wrapper/package.json.
//
// When the generated tree is already present this is a no-op, so warm runs
// pay one existsSync and aggregate gates never see a mid-run diff. When it
// is absent, the same codegen+sync pipeline `make sdk-codegen` runs is
// invoked (offline; it reads the committed corrected spec).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcMarker = path.join(root, "wrapper", "src", "index.ts");
// Tests import the package by name (e.g. `clockify-sdk-ts-115/ensure` from
// the compile-checked examples), and every package export maps into dist/,
// so a fresh clone needs the dual build too — this was the PR #78 session's
// second fresh-clone failure after the missing src tree.
const distMarker = path.join(root, "wrapper", "dist", "esm", "index.js");

if (!fs.existsSync(srcMarker)) {
    console.error(
        "wrapper/src/ is generated and absent (fresh clone?). Running the sdk-codegen pipeline once...",
    );
    try {
        execFileSync(process.execPath, ["scripts/generate-sdk-from-openapi.mjs", "--write"], {
            cwd: root,
            stdio: "inherit",
        });
        execFileSync("npm", ["run", "sync"], {
            cwd: path.join(root, "wrapper"),
            stdio: "inherit",
        });
    } catch {
        console.error(
            "ensure-generated-sdk: automatic generation failed. Run `make sdk-codegen` from the repo root, then retry.",
        );
        process.exit(1);
    }
    if (!fs.existsSync(srcMarker)) {
        console.error(
            "ensure-generated-sdk: codegen completed but wrapper/src/index.ts is still missing. Run `make sdk-codegen` and inspect its output.",
        );
        process.exit(1);
    }
}

if (!fs.existsSync(distMarker)) {
    console.error(
        "wrapper/dist/ is absent (fresh clone?). Building the dual ESM/CJS output once...",
    );
    try {
        execFileSync("npm", ["run", "build"], {
            cwd: path.join(root, "wrapper"),
            stdio: "inherit",
        });
    } catch {
        console.error(
            "ensure-generated-sdk: build failed. Run `npm run build -w clockify-sdk-ts-115` and inspect its output.",
        );
        process.exit(1);
    }
    if (!fs.existsSync(distMarker)) {
        console.error(
            "ensure-generated-sdk: build completed but wrapper/dist/esm/index.js is still missing.",
        );
        process.exit(1);
    }
}
