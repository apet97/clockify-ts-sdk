#!/usr/bin/env node
// Asserts that the CLI and MCP release workflows never publish (or run the
// version-verify gate) on a workflow_dispatch event: both `if:` conditions
// must require `github.event_name == 'push'` in addition to the tag ref check.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  ".github/workflows/ci-cli-release.yml",
  ".github/workflows/ci-mcp-release.yml",
];

const wanted = "if: github.event_name == 'push' && github.ref_type == 'tag'";
const forbidden = "if: github.ref_type == 'tag'";

const failures = [];
for (const rel of files) {
  const text = readFileSync(join(repoRoot, rel), "utf8");
  // Every `if:` that gates on ref_type must be the full push+tag form.
  const refTypeGuards = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("if:") && line.includes("github.ref_type == 'tag'"));
  if (refTypeGuards.length !== 2) {
    failures.push(`${rel}: expected exactly 2 ref_type gates, found ${refTypeGuards.length}`);
  }
  for (const guard of refTypeGuards) {
    if (guard !== wanted) {
      failures.push(`${rel}: gate "${guard}" is missing the github.event_name == 'push' clause`);
    }
  }
  if (text.includes(`\n        ${forbidden}\n`)) {
    failures.push(`${rel}: still contains a bare "${forbidden}" gate`);
  }
}

if (failures.length > 0) {
  console.error("Release dispatch-guard check FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("Release dispatch-guard check passed: CLI + MCP publish gates require event_name == 'push'.");
