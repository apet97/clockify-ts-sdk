#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { budgetFingerprint } from "./budget-fingerprint.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

function calibrationSteps(requiredSuccessfulRuns) {
    return [
    {
        id: "prepare-built-tree",
        title: "Prepare a clean built tree",
        commands: [
            "make wrapper-gates",
            "make cli-gates",
            "make mcp-gates",
        ],
        evidence: [
            "SDK, CLI, and MCP dist files exist before measuring.",
            "Package gates pass before performance numbers are trusted.",
        ],
        stopConditions: [
            "Any package gate fails.",
            "Generated paths changed unexpectedly.",
        ],
    },
    {
        id: "record-required-receipts",
        title: `Record ${requiredSuccessfulRuns} successful local receipt(s)`,
        commands: Array.from({ length: requiredSuccessfulRuns }, () => "make performance-receipt"),
        evidence: [
            "Each run writes a successful receipt to docs/performance-baseline-latest.json.",
            "Each measurement stays under the current provisional ceiling.",
        ],
        stopConditions: [
            "A timing or size result exceeds its ceiling.",
            "A receipt comes from a dirty, partially built, or failed package tree.",
        ],
    },
    {
        id: "tighten-ceilings",
        title: "Tighten budgets from real measurements",
        commands: [
            "Edit docs/performance-budgets.json from measured values.",
            "Set calibrationPolicy.status to calibrated.",
            "Keep calibrationPolicy.finalStatus as calibrated.",
        ],
        evidence: [
            "Each ceiling follows the tightening rule in docs/performance-budgets.json.",
            "The final proof receipt states Budget status: tightened.",
        ],
        stopConditions: [
            `Fewer than ${requiredSuccessfulRuns} successful baseline receipts exist.`,
            "A ceiling is loosened without a risk-register note and maintainer reason.",
        ],
    },
    {
        id: "prove-calibrated-state",
        title: "Prove calibrated state during final proof",
        commands: [
            "make performance-budgets",
            "make final-proof-receipt-check",
            "make final-proof-final",
        ],
        evidence: [
            "Performance budgets pass after tightening.",
            "Final proof receipt is filled from real command output.",
            "Temporary context file is removed after receipt completion and immediately before final-proof-final.",
        ],
        stopConditions: [
            "docs/performance-budgets.json still says provisional.",
            "docs/final-proof-receipt.md lacks real command output.",
        ],
    },
];
}

function usage() {
    return [
        "Usage: node scripts/performance-calibration-plan.mjs [--format <markdown|json>]",
        "",
        "Prints a no-network performance budget calibration plan.",
        "Does not run Git, npm, Docker, Fern, tests, builds, Clockify API calls, or performance measurements.",
        "This plan is not proof and does not calibrate budgets by itself.",
    ].join("\n");
}

function parseArgs(argv) {
    const options = { format: "markdown" };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--help" || arg === "-h") {
            console.log(usage());
            process.exit(0);
        }
        if (arg === "--format") {
            options.format = argv[i + 1] ?? "";
            i += 1;
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    if (!["markdown", "json"].includes(options.format)) {
        throw new Error(`Unknown format: ${options.format}`);
    }
    return options;
}

async function readBudgets() {
    return JSON.parse(await readFile(path.join(root, "docs", "performance-budgets.json"), "utf8"));
}

async function readOptionalJson(relPath) {
    try {
        return {
            exists: true,
            value: JSON.parse(await readFile(path.join(root, relPath), "utf8")),
            parseError: null,
        };
    } catch (error) {
        if (error?.code === "ENOENT") {
            return { exists: false, value: null, parseError: null };
        }
        return {
            exists: true,
            value: null,
            parseError: error instanceof Error ? error.message : String(error),
        };
    }
}

function summarizeLatestReceipt(receiptPath, receiptState) {
    if (!receiptState.exists) {
        return {
            path: receiptPath,
            status: "missing",
            successfulReceiptPresent: false,
            measuredAt: null,
            source: null,
            budgetsSchemaVersion: null,
            budgetFingerprint: null,
            calibrationPolicyStatus: null,
            calibrationPolicyFinalStatus: null,
            measurementCount: 0,
            failedMeasurementCount: 0,
            failureCount: 0,
            parseError: null,
        };
    }
    if (receiptState.parseError || !receiptState.value || typeof receiptState.value !== "object") {
        return {
            path: receiptPath,
            status: "invalid-json",
            successfulReceiptPresent: false,
            measuredAt: null,
            source: null,
            budgetsSchemaVersion: null,
            budgetFingerprint: null,
            calibrationPolicyStatus: null,
            calibrationPolicyFinalStatus: null,
            measurementCount: 0,
            failedMeasurementCount: 0,
            failureCount: 0,
            parseError: receiptState.parseError ?? "receipt is not a JSON object",
        };
    }

    const receipt = receiptState.value;
    const measurements = Array.isArray(receipt.measurements) ? receipt.measurements : [];
    const failures = Array.isArray(receipt.failures) ? receipt.failures : [];
    const failedMeasurements = measurements.filter((measurement) => measurement.ok !== true);
    const passed = measurements.length > 0 && failures.length === 0 && failedMeasurements.length === 0;

    return {
        path: receiptPath,
        status: passed ? "passed" : "failed",
        successfulReceiptPresent: passed,
        measuredAt: typeof receipt.measuredAt === "string" ? receipt.measuredAt : null,
        source: typeof receipt.source === "string" ? receipt.source : null,
        budgetsSchemaVersion: receipt.budgetsSchemaVersion ?? null,
        budgetFingerprint: receipt.budgetFingerprint ?? null,
        calibrationPolicyStatus: receipt.calibrationPolicy?.status ?? null,
        calibrationPolicyFinalStatus: receipt.calibrationPolicy?.finalStatus ?? null,
        measurementCount: measurements.length,
        failedMeasurementCount: failedMeasurements.length,
        failureCount: failures.length,
        parseError: null,
    };
}

export async function buildReport() {
    const budgets = await readBudgets();
    const calibrationPolicy = budgets.calibrationPolicy ?? {};
    const requiredSuccessfulRuns =
        Number.isInteger(calibrationPolicy.requiredSuccessfulRuns) && calibrationPolicy.requiredSuccessfulRuns > 0
            ? calibrationPolicy.requiredSuccessfulRuns
            : 0;
    const receiptPath = calibrationPolicy.receiptPath ?? "docs/performance-baseline-latest.json";
    const budgetPath = "docs/performance-budgets.json";
    const currentBudgetFingerprint = budgetFingerprint(budgets);
    const latestReceipt = summarizeLatestReceipt(receiptPath, await readOptionalJson(receiptPath));
    const next = [
        "Run package gates before recording performance receipts.",
        `Record ${requiredSuccessfulRuns} successful receipt(s) on a clean built tree.`,
        "Tighten docs/performance-budgets.json from actual measurements.",
        "Set calibrationPolicy.status to calibrated only after tightening.",
        "Use final proof to record the calibrated budget evidence.",
    ];
    if (!latestReceipt.successfulReceiptPresent) {
        next.unshift(`Create a passing latest receipt at ${receiptPath} with make performance-receipt after package builds.`);
    }
    if (
        latestReceipt.successfulReceiptPresent &&
        latestReceipt.budgetFingerprint !== currentBudgetFingerprint
    ) {
        next.unshift(
            `Run make performance-receipt again so ${receiptPath} embeds the current budgetFingerprint.`,
        );
    }
    if (
        latestReceipt.successfulReceiptPresent &&
        latestReceipt.budgetsSchemaVersion !== budgets.schemaVersion
    ) {
        next.unshift(
            `Run make performance-receipt again so ${receiptPath} embeds budgetsSchemaVersion: ${budgets.schemaVersion}.`,
        );
    }
    if (
        latestReceipt.successfulReceiptPresent &&
        calibrationPolicy.status === calibrationPolicy.finalStatus &&
        latestReceipt.calibrationPolicyStatus !== calibrationPolicy.finalStatus
    ) {
        next.unshift(
            `Run make performance-receipt again after calibration so ${receiptPath} embeds calibrationPolicy.status: ${calibrationPolicy.finalStatus}.`,
        );
    }
    if (requiredSuccessfulRuns === 0) {
        next.unshift("Fix docs/performance-budgets.json calibrationPolicy.requiredSuccessfulRuns before using this plan.");
    }

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        network: "none",
        commandsExecuted: [],
        envValuesCaptured: false,
        reportScope: "performance-calibration-plan",
        status: "preflight-only",
        warning:
            "This plan is not proof. It does not run Git, npm, Docker, Fern, tests, builds, Clockify API calls, or performance measurements.",
        trackedRiskId: "performance-budgets-provisional",
        requiredSuccessfulRuns,
        receiptPath,
        budgetPath,
        budgetSchemaVersion: budgets.schemaVersion ?? null,
        budgetFingerprint: currentBudgetFingerprint,
        finalProofMarker: "Budget status: tightened",
        calibrationPolicyStatus: calibrationPolicy.status ?? "unknown",
        calibrationPolicyFinalStatus: calibrationPolicy.finalStatus ?? "unknown",
        latestReceipt,
        calibrationSteps: calibrationSteps(requiredSuccessfulRuns),
        next,
    };
}

function addCommandList(lines, label, items) {
    lines.push(`${label}:`);
    for (const item of items) lines.push(`- \`${item}\``);
    lines.push("");
}

function addTextList(lines, label, items) {
    lines.push(`${label}:`);
    for (const item of items) lines.push(`- ${item}`);
    lines.push("");
}

function renderMarkdown(report) {
    const lines = ["# Performance Calibration Plan", ""];
    lines.push("This plan is not proof and does not calibrate budgets by itself.");
    lines.push("");
    lines.push(`Generated at: ${report.generatedAt}`);
    lines.push(`Tracked risk: \`${report.trackedRiskId}\``);
    lines.push(`Required successful runs: ${report.requiredSuccessfulRuns}`);
    lines.push(`Receipt path: \`${report.receiptPath}\``);
    lines.push(`Budget path: \`${report.budgetPath}\``);
    lines.push(`Budget schema version: ${report.budgetSchemaVersion ?? "missing"}`);
    lines.push(`Budget fingerprint: ${report.budgetFingerprint ?? "missing"}`);
    lines.push(`Final proof marker: \`${report.finalProofMarker}\``);
    lines.push("");
    lines.push("## Latest receipt readiness");
    lines.push("");
    lines.push(`Receipt status: ${report.latestReceipt.status}`);
    lines.push(`Successful latest receipt present: ${report.latestReceipt.successfulReceiptPresent ? "yes" : "no"}`);
    lines.push(`Latest receipt budget schema version: ${report.latestReceipt.budgetsSchemaVersion ?? "missing"}`);
    lines.push(`Latest receipt budget fingerprint: ${report.latestReceipt.budgetFingerprint ?? "missing"}`);
    lines.push(`Embedded calibration status: ${report.latestReceipt.calibrationPolicyStatus ?? "missing"}`);
    lines.push(`Embedded calibration final status: ${report.latestReceipt.calibrationPolicyFinalStatus ?? "missing"}`);
    lines.push(`Measurement count: ${report.latestReceipt.measurementCount}`);
    lines.push(`Failed measurement count: ${report.latestReceipt.failedMeasurementCount}`);
    lines.push(`Failure count: ${report.latestReceipt.failureCount}`);
    if (report.latestReceipt.parseError) lines.push(`Parse error: ${report.latestReceipt.parseError}`);
    lines.push("");
    for (const step of report.calibrationSteps) {
        lines.push(`## ${step.title}`);
        lines.push("");
        lines.push(`Step id: \`${step.id}\``);
        lines.push("");
        addCommandList(lines, "Commands to run when validation is allowed", step.commands);
        addTextList(lines, "Evidence required", step.evidence);
        addTextList(lines, "Stop conditions", step.stopConditions);
    }
    lines.push("## Next");
    lines.push("");
    for (const item of report.next) lines.push(`- ${item}`);
    return `${lines.join("\n")}\n`;
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    const report = await buildReport();
    if (options.format === "json") {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(renderMarkdown(report));
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        console.error(usage());
        process.exit(2);
    });
}
