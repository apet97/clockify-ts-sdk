#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registerPath = path.join(root, "docs", "risk-register.json");
const requiredReadinessBlockers = [
    "expense-date-filter-contract",
    "expense-update-file-schema",
    "operation-parity-generated-reachability",
    "consumer-request-casts",
    "cross-package-release-proof-asymmetry",
    "remote-mutation-proof-pending",
];

test("missing required readiness blockers fail both readiness checkers", async () => {
    const original = await readFile(registerPath, "utf8");
    const register = JSON.parse(original);

    assert.deepEqual(
        register.reportGenerator.generatedReport.requiredReadinessBlockingRiskIds,
        requiredReadinessBlockers,
    );

    const missingBlocker = requiredReadinessBlockers[0];
    await writeFile(
        registerPath,
        `${JSON.stringify(
            {
                ...register,
                risks: register.risks.filter((risk) => risk.id !== missingBlocker),
            },
            null,
            2,
        )}\n`,
    );

    try {
        for (const checker of ["scripts/check-risk-register.mjs", "scripts/check-release-readiness.mjs"]) {
            const result = spawnSync(process.execPath, [checker], {
                cwd: root,
                encoding: "utf8",
            });

            assert.notEqual(result.status, 0, `a missing required blocker must fail ${checker}`);
            assert.match(result.stderr, new RegExp(`missing (risk )?${missingBlocker}`));
        }
    } finally {
        await writeFile(registerPath, original);
    }
});
