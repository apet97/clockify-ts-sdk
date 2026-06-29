#!/usr/bin/env node
// Guards that the three token-bearing release workflows pin actions/checkout and
// actions/setup-node to immutable 40-hex commit SHAs (not mutable major tags).
// See finding ci-rel-3 / CVE-2025-30066.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflows = [
  ".github/workflows/release.yml",
  ".github/workflows/ci-cli-release.yml",
  ".github/workflows/ci-mcp-release.yml",
];
const pinnedActions = ["actions/checkout", "actions/setup-node"];

const failures = [];
for (const rel of workflows) {
  const text = readFileSync(join(repoRoot, rel), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/uses:\s*(actions\/[\w-]+)@(\S+)/);
    if (!m) continue;
    const [, action, ref] = m;
    if (!pinnedActions.includes(action)) continue;
    if (!/^[0-9a-f]{40}$/.test(ref)) {
      failures.push(`${rel}: ${action} is pinned to '${ref}', expected a 40-hex commit SHA`);
    }
  }
}

if (failures.length > 0) {
  console.error("Unpinned actions found:\n" + failures.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
console.log("OK: all token-bearing release workflows pin actions/checkout and actions/setup-node to commit SHAs");
