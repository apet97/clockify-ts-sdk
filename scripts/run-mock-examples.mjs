#!/usr/bin/env node
// run-mock-examples: H2 (campaign backlog) -- run the mock-safe subset of
// wrapper/examples/*.ts with cassette-style mandatory assertions (does the
// example's actual stdout match what its own header comment documents?),
// so a regression in an example is caught before a user hits it, not after.
//
// Invocable directly: `node scripts/run-mock-examples.mjs`. `make
// examples-run` (campaign item E1, Phase D) calls this; perfect-full tier
// only -- it builds the SDK and spawns real child processes, so it never
// runs under perfect-fast.
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
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createMockClockifyServer } from "./mock-clockify-server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrapperDistIndex = path.join(root, "wrapper", "dist", "esm", "index.js");

// Cold-start guard: wrapper/examples/*.ts import "clockify-sdk-ts-115" by
// package name, resolved through the npm workspace symlink to the wrapper's
// BUILT dist/. Self-heals here (promise-cached, concurrency-safe) rather
// than adding a new sdk-wrapper-build Make prerequisite -- that target is
// already reached from product-contracts via mcp-tool-manifest-drift, and a
// second edge to it within the same aggregate reds check-aggregate-gates.mjs
// as topology drift (see Q3's identical fix on verify-dual-build.test.mjs).
let ensureWrapperBuiltPromise = null;
function ensureWrapperBuilt() {
    if (ensureWrapperBuiltPromise == null) {
        ensureWrapperBuiltPromise = (async () => {
            const alreadyBuilt = await readFile(wrapperDistIndex, "utf8").catch(() => null);
            if (alreadyBuilt == null) {
                const result = spawnSync("npm", ["run", "build", "-w", "clockify-sdk-ts-115"], {
                    cwd: root,
                    encoding: "utf8",
                    stdio: "inherit",
                });
                if (result.status !== 0) {
                    throw new Error("npm run build -w clockify-sdk-ts-115 failed");
                }
            }
        })();
    }
    return ensureWrapperBuiltPromise;
}

// Hang guard for the runOne() child. Real examples finish in well under a
// second against a local mock server; this only fires if an example (or the
// spawn wiring itself) genuinely hangs, so the gate fails loud instead of
// blocking a run forever.
const CHILD_TIMEOUT_MS = 20_000;

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
    {
        id: "quickstart",
        file: "wrapper/examples/quickstart.ts",
        expectedStdoutIncludes: [
            "Quickstart: local diagnostics computed",
            "Quickstart: health check passed.",
        ],
        expectExitCode: 0,
    },
];

// Runs the example as a genuinely async child (node:child_process spawn, not
// spawnSync). This matters here specifically: runMockExamples() hosts the
// mock HTTP server in THIS process. spawnSync blocks this process's entire
// event loop until the child exits, so any example that makes a real
// request back to that mock server -- as opposed to handle-rate-limit.ts,
// which only defines the wiring and never calls it -- would deadlock: the
// server can never accept the child's connection while the parent is frozen
// inside spawnSync waiting for the child. quickstart.ts's health() probe is
// the first ALLOWLIST entry that actually fires a request, and it hung
// under the old spawnSync implementation until this fix.
function runOne(entry, env) {
    const filePath = path.join(root, entry.file);
    return new Promise((resolve) => {
        const child = spawn(process.execPath, ["--import", "tsx", filePath], {
            cwd: root,
            env: { ...process.env, ...env },
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
        }, CHILD_TIMEOUT_MS);
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        child.on("close", (status) => {
            clearTimeout(timer);
            const failures = [];
            if (timedOut) {
                failures.push(`timed out after ${CHILD_TIMEOUT_MS}ms and was killed`);
            } else if (status !== entry.expectExitCode) {
                failures.push(`exit code ${status} !== expected ${entry.expectExitCode}`);
            }
            for (const needle of entry.expectedStdoutIncludes) {
                if (!stdout.includes(needle)) {
                    failures.push(`stdout does not include ${JSON.stringify(needle)}`);
                }
            }
            resolve({ id: entry.id, ok: failures.length === 0, failures, stdout, stderr });
        });
    });
}

/**
 * Run every ALLOWLIST entry against a single shared mock Clockify server
 * (CLOCKIFY_BASE_URL points at it; none of the current allowlist entries
 * dial out, but future mock-runnable examples will). Returns
 * { ok, results }.
 */
export async function runMockExamples() {
    await ensureWrapperBuilt();
    const mock = createMockClockifyServer();
    const baseUrl = await mock.listen();
    try {
        const env = {
            // Explicit, not inherited: this repo's documented local-proof
            // convention runs gates with CLOCKIFY_API_KEY='' (an EMPTY
            // STRING, not unset) to force live sandbox.test.ts suites to
            // self-skip. Examples that fall back with `?? "demo-key"` only
            // trigger that fallback on null/undefined, not '' -- inheriting
            // process.env under that convention left apiKey as '', which
            // createClockifyClient treats as neither apiKey nor addonToken
            // supplied and throws. Set it here so the mock run is correct
            // regardless of the ambient (blank or unset) environment.
            CLOCKIFY_API_KEY: "mock-safe-demo-key",
            CLOCKIFY_BASE_URL: baseUrl,
            CLOCKIFY_WORKSPACE_ID: mock.workspaceId,
        };
        const results = await Promise.all(ALLOWLIST.map((entry) => runOne(entry, env)));
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
