#!/usr/bin/env node
// Guards against the "pack-snapshot CI verification defeated" regression: every
// CI workflow runs `make sdk-codegen`, which rewrites <pkg>/.packsnapshot in
// WRITE mode, so each "Pack snapshot verification" step MUST restore the
// committed baseline (`git checkout -- .packsnapshot`) before diffing/--check.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const cases = [
  {
    file: ".github/workflows/ci.yml",
    verifyMarker: "> .packsnapshot.actual",
  },
  {
    file: ".github/workflows/ci-cli.yml",
    verifyMarker: "--pkg=cli --check",
  },
  {
    file: ".github/workflows/ci-mcp.yml",
    verifyMarker: "--pkg=mcp --check",
  },
];

const restoreMarker = "git checkout -- .packsnapshot";
const failures = [];

for (const { file, verifyMarker } of cases) {
  const text = readFileSync(path.join(root, file), "utf8");
  const verifyIdx = text.indexOf(verifyMarker);
  const restoreIdx = text.indexOf(restoreMarker);
  if (verifyIdx === -1) {
    failures.push(`${file}: expected verification marker not found: ${verifyMarker}`);
    continue;
  }
  if (restoreIdx === -1) {
    failures.push(`${file}: missing baseline restore (\`${restoreMarker}\`) before pack-snapshot verification`);
    continue;
  }
  if (restoreIdx > verifyIdx) {
    failures.push(`${file}: baseline restore must precede the pack-snapshot verification step`);
  }
}

if (failures.length > 0) {
  console.error("pack-snapshot CI guard FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("pack-snapshot CI guard OK: all 3 workflows restore the committed baseline before verifying.");
