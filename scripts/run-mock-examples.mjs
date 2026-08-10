#!/usr/bin/env node
// run-mock-examples: H2 (campaign backlog) -- run the mock-safe subset of
// wrapper/examples/*.ts with cassette-style mandatory assertions (does the
// example's actual stdout match what its own header comment documents?),
// so a regression in an example is caught before a user hits it, not after.
//
// Invocable directly: `node scripts/run-mock-examples.mjs`. `make
// examples-run` (campaign item E1, Phase D) will call this once it lands.
//
// ALLOWLIST is derived from wrapper/examples/*.ts's own "Mode: mock-safe"
// header marker (6 files carry a "Mode:" marker; see the campaign backlog
// for the survey), NOT invented here -- but derivation stopped at "does the
// marker's file actually run clean": every candidate was run for real
// before being added.
//
//   - wrapper/examples/first-health-check.ts and list-all-projects.ts claim
//     "Mode: live-only (or mock-safe via CLOCKIFY_BASE_URL pointing at the
//     mock server)" -- verified false: neither the example nor
//     createClockifyClient reads CLOCKIFY_BASE_URL (only
//     wrapper/diagnostics.ts does), so pointing them at this mock still
//     hits the real API. Filed as H2-followup-mode-comment-false-claim.
//   - wrapper/examples/invoice-client.ts crashes (its fixture is missing
//     invoiceUpdateBodyFromExisting's required dueDate/issuedDate fields).
//     Filed as H2-followup-invoice-client-example-crashes.
//   - wrapper/examples/webhook-express.ts's own "valid signature" demo case
//     fails signature verification (the handler's and the smoke's default
//     token fallbacks are two different literals). Filed as
//     H2-followup-webhook-express-example-wrong-output.
//
// Do not fold those fixes in here -- this script's job is to run and
// assert, not to edit examples (that scope stayed with H3's identical
// "don't extend the thing under test" rule for the mock server). Once each
// is fixed, add it back to ALLOWLIST in its own commit.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createMockClockifyServer } from "./mock-clockify-server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const ALLOWLIST = [
    {
        id: "handle-rate-limit",
        file: "wrapper/examples/handle-rate-limit.ts",
        // The example's "Expected output" documents a second, conditional
        // line ("(on a real 429) rate limited; ...") that only prints when a
        // real 429 actually surfaces -- never true in a clean run, so it is
        // deliberately NOT asserted here.
        expectedStdoutIncludes: ["Client constructed with retry-on-429 policy."],
        expectExitCode: 0,
    },
];

function runOne(entry, env) {
    const filePath = path.join(root, entry.file);
    const result = spawnSync(process.execPath, ["--import", "tsx", filePath], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...env },
    });
    const stdout = result.stdout ?? "";
    const failures = [];
    if (result.status !== entry.expectExitCode) {
        failures.push(`exit code ${result.status} !== expected ${entry.expectExitCode}`);
    }
    for (const needle of entry.expectedStdoutIncludes) {
        if (!stdout.includes(needle)) {
            failures.push(`stdout does not include ${JSON.stringify(needle)}`);
        }
    }
    return { id: entry.id, ok: failures.length === 0, failures, stdout, stderr: result.stderr ?? "" };
}

/**
 * Run every ALLOWLIST entry against a single shared mock Clockify server
 * (CLOCKIFY_BASE_URL points at it; none of the current allowlist entries
 * dial out, but future mock-runnable examples will). Returns
 * { ok, results }.
 */
export async function runMockExamples() {
    const mock = createMockClockifyServer();
    const baseUrl = await mock.listen();
    try {
        const env = {
            CLOCKIFY_BASE_URL: baseUrl,
            CLOCKIFY_WORKSPACE_ID: mock.workspaceId,
        };
        const results = ALLOWLIST.map((entry) => runOne(entry, env));
        return { ok: results.every((r) => r.ok), results };
    } finally {
        await mock.close();
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const { ok, results } = await runMockExamples();
    for (const r of results) {
        if (r.ok) {
            console.log(`ok: ${r.id}`);
        } else {
            console.error(`FAIL: ${r.id}`);
            for (const f of r.failures) console.error(`  - ${f}`);
            if (r.stderr) console.error(`  stderr: ${r.stderr.trim()}`);
        }
    }
    console.log(`${results.filter((r) => r.ok).length}/${results.length} mock-safe examples passed.`);
    process.exit(ok ? 0 : 1);
}
