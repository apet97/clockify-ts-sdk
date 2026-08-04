#!/usr/bin/env node
// Governed full-dependency npm audit gate. Runs `npm audit --json` and
// fails closed on every advisory that is not covered by a current, justified,
// expiring exception in docs/npm-audit-exceptions.json. Exceptions expire, must name
// upstream tracking, and go stale-red the moment the advisory disappears.
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { evaluateAuditCommand } from "./lib/npm-audit-exceptions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const register = JSON.parse(readFileSync(path.join(root, "docs", "npm-audit-exceptions.json"), "utf8"));

const result = spawnSync("npm", ["audit", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
});
const { failures, observed, diagnostics } = evaluateAuditCommand(result, register);
for (const advisory of observed) {
    console.log(
        `npm audit gate: observed ${advisory.id ?? "unidentified"} (${advisory.module}, ${advisory.severity})`,
    );
}
if (failures.length > 0) {
    console.error("npm audit gate failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(`npm audit gate diagnostics: ${JSON.stringify(diagnostics)}`);
    process.exit(1);
}
console.log(
    `npm audit gate passed (${observed.length} advisory(ies) observed, all governed; ${register.exceptions.length} exception(s) current)`,
);
