#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("CLI write-safety proof ignores nested checkout tests", async () => {
    const nestedCheckout = await mkdtemp(path.join(root, ".tmp-cli-write-safety-"));
    const decoyDir = path.join(nestedCheckout, "cli", "tests");
    const decoyMessage = "nested CLI decoy should never be discovered";

    try {
        await mkdir(decoyDir, { recursive: true });
        await writeFile(
            path.join(decoyDir, "command-risk.test.ts"),
            `throw new Error(${JSON.stringify(decoyMessage)});\n`,
        );

        const result = spawnSync(process.execPath, ["scripts/check-cli-write-safety.mjs"], {
            cwd: root,
            encoding: "utf8",
            env: { ...process.env, CLOCKIFY_API_KEY: "", CLOCKIFY_WORKSPACE_ID: "" },
        });
        const output = `${result.stdout}\n${result.stderr}`;

        assert.equal(result.status, 0, output);
        assert.equal(output.includes(decoyMessage), false, output);
    } finally {
        await rm(nestedCheckout, { recursive: true, force: true });
    }
});
