#!/usr/bin/env node
// Governed production npm audit gate. Runs `npm audit --omit=dev --json` and
// fails closed on every advisory that is not covered by a current, justified,
// expiring exception in docs/npm-audit-exceptions.json. Strictly stronger
// governance than a bare `npm audit --omit=dev`: exceptions expire, must name
// upstream tracking, and go stale-red the moment the advisory disappears.
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { evaluateAudit } from "./lib/npm-audit-exceptions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const register = JSON.parse(readFileSync(path.join(root, "docs", "npm-audit-exceptions.json"), "utf8"));

const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
});
// npm audit exits non-zero when advisories exist; the JSON body is the truth.
let report;
try {
    report = JSON.parse(result.stdout);
} catch {
    console.error("npm audit gate: could not parse `npm audit --omit=dev --json` output");
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(1);
}

const { failures, observed } = evaluateAudit(report, register);
for (const advisory of observed) {
    console.log(
        `npm audit gate: observed ${advisory.id ?? "unidentified"} (${advisory.module}, ${advisory.severity})`,
    );
}
if (failures.length > 0) {
    console.error("npm audit gate failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}
console.log(
    `npm audit gate passed (${observed.length} advisory(ies) observed, all governed; ${register.exceptions.length} exception(s) current)`,
);
