#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { budgetFingerprint } from "./budget-fingerprint.mjs";
import { buildReport as buildPerformanceCalibrationPlan } from "./performance-calibration-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const budgets = JSON.parse(fs.readFileSync(path.join(root, "docs", "performance-budgets.json"), "utf8"));
// Tool-count single source of truth: derive the expected MCP tool count from
// the canonical docs/mcp-tools.json summary so this smoke can never disagree
// with the contract (the value is interpolated into the in-process smoke below).
const EXPECTED_TOOLS = JSON.parse(fs.readFileSync(path.join(root, "docs", "mcp-tools.json"), "utf8")).summary.totalTools;
let failures = [];
const measurements = [];
const writeReceipt = process.argv.includes("--write-receipt");
const receiptArg = process.argv.find((arg) => arg.startsWith("--receipt="));
const measuredAt = new Date().toISOString();

function fail(message) {
    failures.push(message);
}

function budgetRelativePath(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(`${label}: must be a non-empty string`);
        return null;
    }
    const normalized = path.normalize(value);
    if (path.isAbsolute(value) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        fail(`${label}: must be a repo-relative path without parent traversal`);
        return null;
    }
    return normalized;
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(`${label}: must be a non-empty string`);
    }
}

function assertPositiveInteger(label, value) {
    if (!Number.isInteger(value) || value < 1) {
        fail(`${label}: must be a positive integer`);
    }
}

function assertNonEmptyArray(label, values) {
    if (!Array.isArray(values) || values.length === 0) {
        fail(`${label}: must be a non-empty array`);
    }
}

function assertStringArray(label, values, { allowEmpty = true } = {}) {
    if (!Array.isArray(values)) {
        fail(`${label}: must be an array`);
        return [];
    }
    if (!allowEmpty && values.length === 0) {
        fail(`${label}: must be a non-empty array`);
    }
    for (const value of values) {
        if (typeof value !== "string" || value.trim().length === 0) {
            fail(`${label}: contains non-string or empty entry`);
        }
    }
    return values.filter((value) => typeof value === "string" && value.trim().length > 0);
}

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) fail(`${label}: duplicate ${value}`);
        seen.add(value);
    }
}

function assertExactFields(report, fields, label) {
    for (const [field, expected] of Object.entries(fields ?? {})) {
        const actual = report[field];
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            fail(`${label}: ${field} expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
        }
    }
}

function assertStepIds(steps, ids, label) {
    const actual = new Set((steps ?? []).map((step) => step.id));
    for (const id of ids ?? []) {
        if (!actual.has(id)) fail(`${label}: missing step ${id}`);
    }
}

function assertKeys(object, keys, label) {
    for (const key of keys ?? []) {
        if (!Object.prototype.hasOwnProperty.call(object ?? {}, key)) {
            fail(`${label}: missing key ${key}`);
        }
    }
}

function validateBudgetsShape() {
    if (budgets.schemaVersion !== 2) fail("schemaVersion: must be 2");
    assertNonEmptyString("purpose", budgets.purpose);

    if (budgets.wiring == null || typeof budgets.wiring !== "object" || Array.isArray(budgets.wiring)) {
        fail("wiring: must be an object");
    } else {
        if (budgets.wiring.makeTarget !== "performance-budgets") {
            fail(`wiring.makeTarget: must be performance-budgets, got ${budgets.wiring.makeTarget ?? "(missing)"}`);
        }
        if (budgets.wiring.enterpriseAuditId !== "performance-budgets") {
            fail(`wiring.enterpriseAuditId: must be performance-budgets, got ${budgets.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        const checker = budgetRelativePath("wiring.checker", budgets.wiring.checker);
        if (checker !== "scripts/check-performance-budgets.mjs") {
            fail(`wiring.checker: must be scripts/check-performance-budgets.mjs, got ${budgets.wiring.checker ?? "(missing)"}`);
        }
    }

    const policy = budgets.calibrationPolicy ?? {};
    if (policy == null || typeof policy !== "object" || Array.isArray(policy)) {
        fail("calibrationPolicy: must be an object");
    }
    assertNonEmptyString("calibrationPolicy.status", policy.status);
    assertNonEmptyString("calibrationPolicy.finalStatus", policy.finalStatus);
    assertPositiveInteger("calibrationPolicy.requiredSuccessfulRuns", policy.requiredSuccessfulRuns);
    budgetRelativePath("calibrationPolicy.receiptPath", policy.receiptPath);
    assertNonEmptyString("calibrationPolicy.tighteningRule", policy.tighteningRule);

    const planContract = budgets.calibrationPlanContract ?? {};
    if (planContract == null || typeof planContract !== "object" || Array.isArray(planContract)) {
        fail("calibrationPlanContract: must be an object");
    }
    if (
        planContract.exactFields == null ||
        typeof planContract.exactFields !== "object" ||
        Array.isArray(planContract.exactFields)
    ) {
        fail("calibrationPlanContract.exactFields: must be an object");
    }
    if (planContract.requiresPositiveRequiredSuccessfulRuns !== true) {
        fail("calibrationPlanContract.requiresPositiveRequiredSuccessfulRuns: must be true");
    }
    const stepIds = assertStringArray("calibrationPlanContract.requiredStepIds", planContract.requiredStepIds, {
        allowEmpty: false,
    });
    assertUnique("calibrationPlanContract.requiredStepIds", stepIds);
    assertStringArray("calibrationPlanContract.requiredLatestReceiptKeys", planContract.requiredLatestReceiptKeys, {
        allowEmpty: false,
    });
    if (
        planContract.requiredReceiptStep == null ||
        typeof planContract.requiredReceiptStep !== "object" ||
        Array.isArray(planContract.requiredReceiptStep)
    ) {
        fail("calibrationPlanContract.requiredReceiptStep: must be an object");
    } else {
        assertNonEmptyString("calibrationPlanContract.requiredReceiptStep.id", planContract.requiredReceiptStep.id);
        assertNonEmptyString(
            "calibrationPlanContract.requiredReceiptStep.command",
            planContract.requiredReceiptStep.command,
        );
    }

    assertNonEmptyArray("fileSize", budgets.fileSize);
    assertUnique("fileSize.path", (budgets.fileSize ?? []).map((budget) => budget?.path).filter(Boolean));
    for (const [index, budget] of (budgets.fileSize ?? []).entries()) {
        const label = `fileSize[${index}]`;
        if (budget == null || typeof budget !== "object" || Array.isArray(budget)) {
            fail(`${label}: must be an object`);
            continue;
        }
        budgetRelativePath(`${label}.path`, budget.path);
        assertPositiveInteger(`${label}.maxBytes`, budget.maxBytes);
        assertNonEmptyString(`${label}.rationale`, budget.rationale);
    }

    assertNonEmptyArray("timing", budgets.timing);
    assertUnique("timing.name", (budgets.timing ?? []).map((budget) => budget?.name).filter(Boolean));
    for (const [index, budget] of (budgets.timing ?? []).entries()) {
        const label = `timing[${index}]`;
        if (budget == null || typeof budget !== "object" || Array.isArray(budget)) {
            fail(`${label}: must be an object`);
            continue;
        }
        assertNonEmptyString(`${label}.name`, budget.name);
        assertPositiveInteger(`${label}.maxMs`, budget.maxMs);
        assertNonEmptyString(`${label}.rationale`, budget.rationale);
    }
}

validateBudgetsShape();

if (failures.length > 0) {
    console.error("performance budgets contract shape failed");
    for (const failure of failures) console.error(failure);
    process.exit(1);
}

failures = [];

const receiptPath =
    budgetRelativePath(
        "receipt path",
        receiptArg?.slice("--receipt=".length) ||
            budgets.calibrationPolicy?.receiptPath ||
            "docs/performance-baseline-latest.json",
    ) ?? "docs/performance-baseline-latest.json";

async function checkCalibrationPlanContract() {
    const contract = budgets.calibrationPlanContract ?? {};
    const report = await buildPerformanceCalibrationPlan();
    assertExactFields(report, contract.exactFields, "calibrationPlanContract");
    assertKeys(report, contract.requiredReportKeys ?? [], "calibrationPlanContract");
    if (report.budgetSchemaVersion !== budgets.schemaVersion) {
        fail("calibrationPlanContract: budgetSchemaVersion must mirror performance-budgets schemaVersion");
    }
    if (report.budgetFingerprint !== budgetFingerprint(budgets)) {
        fail("calibrationPlanContract: budgetFingerprint must mirror current performance-budgets content fingerprint");
    }
    if (report.requiredSuccessfulRuns !== budgets.calibrationPolicy?.requiredSuccessfulRuns) {
        fail(
            `calibrationPlanContract: requiredSuccessfulRuns ${report.requiredSuccessfulRuns} does not match calibrationPolicy.requiredSuccessfulRuns ${budgets.calibrationPolicy?.requiredSuccessfulRuns}`,
        );
    }
    if (
        contract.requiresPositiveRequiredSuccessfulRuns &&
        (!Number.isInteger(report.requiredSuccessfulRuns) || report.requiredSuccessfulRuns < 1)
    ) {
        fail("calibrationPlanContract: requiredSuccessfulRuns must be a positive integer from calibrationPolicy");
    }
    if (report.receiptPath !== budgets.calibrationPolicy?.receiptPath) {
        fail(
            `calibrationPlanContract: receiptPath ${JSON.stringify(report.receiptPath)} does not match calibrationPolicy.receiptPath ${JSON.stringify(budgets.calibrationPolicy?.receiptPath)}`,
        );
    }
    if (report.calibrationPolicyStatus !== budgets.calibrationPolicy?.status) {
        fail("calibrationPlanContract: calibrationPolicyStatus must mirror calibrationPolicy.status");
    }
    if (report.calibrationPolicyFinalStatus !== budgets.calibrationPolicy?.finalStatus) {
        fail("calibrationPlanContract: calibrationPolicyFinalStatus must mirror calibrationPolicy.finalStatus");
    }
    if (report.latestReceipt?.path !== budgets.calibrationPolicy?.receiptPath) {
        fail("calibrationPlanContract: latestReceipt.path must mirror calibrationPolicy.receiptPath");
    }
    assertKeys(report.latestReceipt, contract.requiredLatestReceiptKeys, "calibrationPlanContract.latestReceipt");
    assertStepIds(report.calibrationSteps, contract.requiredStepIds, "calibrationPlanContract");
    const receiptStep = report.calibrationSteps.find((step) => step.id === contract.requiredReceiptStep?.id);
    if (!receiptStep) {
        fail(`calibrationPlanContract: missing receipt step ${contract.requiredReceiptStep?.id}`);
    } else {
        const receiptCommands = receiptStep.commands.filter(
            (command) => command === contract.requiredReceiptStep.command,
        );
        if (receiptCommands.length !== budgets.calibrationPolicy?.requiredSuccessfulRuns) {
            fail(
                `calibrationPlanContract: receipt step must contain ${budgets.calibrationPolicy?.requiredSuccessfulRuns} ${contract.requiredReceiptStep.command} commands but got ${receiptCommands.length}`,
            );
        }
        if (!receiptStep.title.includes(String(budgets.calibrationPolicy?.requiredSuccessfulRuns))) {
            fail("calibrationPlanContract: receipt step title must include calibrationPolicy.requiredSuccessfulRuns");
        }
    }
}

function record(measurement) {
    measurements.push({ ...measurement, measuredAt });
}

await checkCalibrationPlanContract();

if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
}

for (const budget of budgets.fileSize ?? []) {
    const file = path.join(root, budget.path);
    if (!fs.existsSync(file)) {
        fail(`${budget.path}: missing; run package build gates before performance-budgets`);
        record({
            kind: "fileSize",
            path: budget.path,
            maxBytes: budget.maxBytes,
            ok: false,
            error: "missing",
        });
        continue;
    }
    const size = fs.statSync(file).size;
    const ok = size <= budget.maxBytes;
    record({
        kind: "fileSize",
        path: budget.path,
        actualBytes: size,
        maxBytes: budget.maxBytes,
        ok,
    });
    if (!ok) fail(`${budget.path}: ${size} bytes exceeds ${budget.maxBytes}`);
    else console.log(`${budget.path}: ${size}/${budget.maxBytes} bytes`);
}

// Set CLOCKIFY_PERF_TIMING=0 to keep running each startup smoke (so a crash or
// a wrong tool count still reds) while suppressing the wall-clock comparison.
// Shared CI runners show large per-run startup variance under contention, which
// would otherwise red the canonical proof on noise rather than a real
// regression. File-size ceilings and the in-smoke count assertion stay fatal.
const ENFORCE_TIMING = process.env.CLOCKIFY_PERF_TIMING !== "0";

function recordTiming(name, maxMs, elapsed, failureCountBefore) {
    const overBudget = elapsed > maxMs;
    record({
        kind: "timing",
        name,
        actualMs: elapsed,
        maxMs,
        timingEnforced: ENFORCE_TIMING,
        ok: failures.length === failureCountBefore && (!ENFORCE_TIMING || !overBudget),
    });
    if (overBudget && ENFORCE_TIMING) {
        fail(`${name}: ${elapsed}ms exceeds ${maxMs}ms`);
    } else if (overBudget) {
        console.log(`${name}: ${elapsed}/${maxMs}ms (over budget; timing not enforced, CLOCKIFY_PERF_TIMING=0)`);
    } else {
        console.log(`${name}: ${elapsed}/${maxMs}ms`);
    }
}

// Startup-time budgets are noise-sensitive on shared CI runners and on a dev
// laptop under load. Sample the spawn a few times, keep the crash/exit-status
// check fatal on EVERY run, and compare the BEST (minimum) elapsed to the
// budget: a real regression slows every sample, whereas contention only inflates
// some — so the minimum is the truest signal and won't false-red on one noisy
// spawn. Only a single sample is taken when timing is not enforced (the run then
// exists solely for the crash / exit-status check).
const TIMING_SAMPLES = ENFORCE_TIMING ? 3 : 1;

function runNode(name, maxMs, args, options = {}) {
    const failureCountBefore = failures.length;
    const samples = [];
    for (let attempt = 0; attempt < TIMING_SAMPLES; attempt++) {
        const start = Date.now();
        const result = spawnSync(process.execPath, args, {
            cwd: options.cwd ?? root,
            encoding: "utf8",
            stdio: options.capture ? "pipe" : "ignore",
            env: { ...process.env, ...(options.env ?? {}) },
        });
        samples.push(Date.now() - start);
        if (result.status !== 0) {
            fail(`${name}: command exited ${result.status}${result.stderr ? `: ${result.stderr.trim()}` : ""}`);
            break;
        }
    }
    recordTiming(name, maxMs, Math.min(...samples), failureCountBefore);
}

const timing = Object.fromEntries((budgets.timing ?? []).map((item) => [item.name, item.maxMs]));

runNode("sdk-esm-import", timing["sdk-esm-import"] ?? 1500, ["--input-type=module", "-e", "await import('./wrapper/dist/esm/index.js')"]);
runNode("cli-version", timing["cli-version"] ?? 1500, ["cli/dist/index.js", "--version"], { capture: true });

const mcpSmoke = `
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const root = ${JSON.stringify(root)};
const mcpRequire = createRequire(pathToFileURL(root + '/mcp/package.json'));
const [{ Client }, { InMemoryTransport }, { buildServer }] = await Promise.all([
  import(pathToFileURL(mcpRequire.resolve('@modelcontextprotocol/sdk/client/index.js'))),
  import(pathToFileURL(mcpRequire.resolve('@modelcontextprotocol/sdk/inMemory.js'))),
  import(pathToFileURL(root + '/mcp/dist/server.js')),
]);
const fakeUser = { id: 'u1', email: 'mock@example.com', name: 'Mock' };
const ctx = {
  workspaceId: 'ws1',
  client: {
    users: { getCurrentUser: async () => fakeUser, findWorkspaceUsers: async () => [fakeUser] },
    timeEntries: { listInProgress: async () => [], listForUser: async () => [], create: async (x) => x, stopTimer: async () => ({}), delete: async () => ({}) },
    projects: { list: async () => [], create: async (x) => x, get: async () => ({}), update: async (x) => x, delete: async () => ({}) },
    clients: { list: async () => [], create: async (x) => x, get: async () => ({}), update: async (x) => x, delete: async () => ({}) },
    tasks: { list: async () => [], create: async (x) => x, get: async () => ({}), update: async (x) => x, delete: async () => ({}) },
    tags: { list: async () => [], create: async (x) => x, get: async () => ({}), update: async (x) => x, delete: async () => ({}) },
    invoices: { list: async () => ({ invoices: [] }), create: async (x) => x },
    expenses: { create: async (x) => x },
    expenseCategories: { list: async () => [] },
    timeOffPolicies: { list: async () => [] },
    timeOff: { submit: async (x) => x },
    scheduling: { create: async (x) => x, list: async () => [] },
    webhooks: { create: async (x) => x, list: async () => ({ webhooks: [] }) },
  },
};
const server = buildServer(ctx);
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: 'budget-smoke', version: '0.0.0' });
await client.connect(clientTransport);
const tools = await client.listTools();
if (tools.tools.length !== ${EXPECTED_TOOLS}) throw new Error('expected ${EXPECTED_TOOLS} tools, got ' + tools.tools.length);
await client.close();
await server.close();
`;
runNode("mcp-tools-list", timing["mcp-tools-list"] ?? 3000, ["--input-type=module", "-e", mcpSmoke], { capture: true });

if (writeReceipt) {
    const resolvedReceiptPath = path.join(root, receiptPath);
    fs.mkdirSync(path.dirname(resolvedReceiptPath), { recursive: true });
    fs.writeFileSync(
        resolvedReceiptPath,
        `${JSON.stringify(
            {
                schemaVersion: 1,
                measuredAt,
                source: "scripts/check-performance-budgets.mjs",
                budgetsSchemaVersion: budgets.schemaVersion,
                budgetFingerprint: budgetFingerprint(budgets),
                calibrationPolicy: budgets.calibrationPolicy,
                measurements,
                failures,
            },
            null,
            2,
        )}\n`,
    );
    console.log(`performance receipt written to ${receiptPath}`);
}

if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
}
console.log("performance budgets passed");
