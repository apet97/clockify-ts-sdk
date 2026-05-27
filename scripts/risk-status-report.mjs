#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { budgetFingerprint } from "./budget-fingerprint.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

function usage() {
    return [
        "Usage: node scripts/risk-status-report.mjs [--format <markdown|json>] [--status <open|provisional|blocked-upstream|accepted|all>]",
        "",
        "Prints a no-network risk status report from docs/risk-register.json.",
        "Does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls.",
        "This report is not proof; it summarizes current risk metadata and file-state signals.",
    ].join("\n");
}

function parseArgs(argv) {
    const options = { format: "markdown", status: "all" };
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
        if (arg === "--status") {
            options.status = argv[i + 1] ?? "";
            i += 1;
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    if (!["markdown", "json"].includes(options.format)) throw new Error(`Unknown format: ${options.format}`);
    if (!["open", "provisional", "blocked-upstream", "accepted", "all"].includes(options.status)) {
        throw new Error(`Unknown status: ${options.status}`);
    }
    return options;
}

async function exists(relPath) {
    try {
        await access(path.join(root, relPath));
        return true;
    } catch {
        return false;
    }
}

async function readOptional(relPath) {
    try {
        return await readFile(path.join(root, relPath), "utf8");
    } catch {
        return "";
    }
}

async function readJson(relPath) {
    return JSON.parse(await readFile(path.join(root, relPath), "utf8"));
}

async function readJsonOptional(relPath, fallback) {
    try {
        return await readJson(relPath);
    } catch {
        return fallback;
    }
}

async function readJsonState(relPath) {
    try {
        return {
            exists: true,
            value: await readJson(relPath),
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

function readSection(text, startMarker, endMarker) {
    const start = text.indexOf(startMarker);
    if (start === -1) return "";
    const end = text.indexOf(endMarker, start + startMarker.length);
    return end === -1 ? text.slice(start) : text.slice(start, end);
}

function readListField(text, prefix) {
    const line = text.split("\n").find((candidate) => candidate.startsWith(prefix));
    if (!line) return undefined;
    const value = line.slice(prefix.length).trim();
    return value.length > 0 ? value : undefined;
}

function countByStatus(risks) {
    return risks.reduce(
        (acc, risk) => {
            acc[risk.status] = (acc[risk.status] ?? 0) + 1;
            return acc;
        },
        { open: 0, provisional: 0, "blocked-upstream": 0, accepted: 0 },
    );
}

function performanceReceiptStatus(receiptState, expectedCalibrationStatus, expectedBudgetSchemaVersion, expectedBudgetFingerprint) {
    if (!receiptState.exists) {
        return {
            status: "missing",
            detail: "docs/performance-baseline-latest.json",
        };
    }
    if (receiptState.parseError || receiptState.value == null) {
        return {
            status: "blocking",
            detail: `docs/performance-baseline-latest.json exists but is not valid receipt JSON: ${receiptState.parseError ?? "not a JSON object"}.`,
        };
    }
    const receipt = receiptState.value;
    if (receipt == null || typeof receipt !== "object" || Array.isArray(receipt)) {
        return {
            status: "blocking",
            detail: "docs/performance-baseline-latest.json exists but could not be parsed as a receipt object.",
        };
    }
    const measurements = Array.isArray(receipt.measurements) ? receipt.measurements : [];
    const failures = Array.isArray(receipt.failures) ? receipt.failures : [];
    const failedMeasurements = measurements.filter((measurement) => measurement?.ok !== true);
    const receiptCalibrationStatus = receipt.calibrationPolicy?.status ?? "missing";
    const receiptBudgetSchemaVersion = receipt.budgetsSchemaVersion ?? "missing";
    const receiptBudgetFingerprint = receipt.budgetFingerprint ?? "missing";
    if (measurements.length > 0 && failures.length === 0 && failedMeasurements.length === 0) {
        if (
            typeof expectedCalibrationStatus === "string" &&
            expectedCalibrationStatus.length > 0 &&
            receiptCalibrationStatus !== expectedCalibrationStatus
        ) {
            return {
                status: "blocking",
                detail: `docs/performance-baseline-latest.json has passing measurements but embedded calibrationPolicy.status is ${receiptCalibrationStatus}; expected ${expectedCalibrationStatus}.`,
            };
        }
        if (
            Number.isInteger(expectedBudgetSchemaVersion) &&
            receiptBudgetSchemaVersion !== expectedBudgetSchemaVersion
        ) {
            return {
                status: "blocking",
                detail: `docs/performance-baseline-latest.json has passing measurements but budgetsSchemaVersion is ${receiptBudgetSchemaVersion}; expected ${expectedBudgetSchemaVersion}.`,
            };
        }
        if (
            typeof expectedBudgetFingerprint === "string" &&
            expectedBudgetFingerprint.length > 0 &&
            receiptBudgetFingerprint !== expectedBudgetFingerprint
        ) {
            return {
                status: "blocking",
                detail: `docs/performance-baseline-latest.json has passing measurements but budgetFingerprint is ${receiptBudgetFingerprint}; expected ${expectedBudgetFingerprint}.`,
            };
        }
        return {
            status: "passed",
            detail: `docs/performance-baseline-latest.json has a successful latest receipt with embedded calibrationPolicy.status: ${receiptCalibrationStatus}, budgetsSchemaVersion: ${receiptBudgetSchemaVersion}, and budgetFingerprint: ${receiptBudgetFingerprint}.`,
        };
    }
    return {
        status: "blocking",
        detail: `docs/performance-baseline-latest.json has ${failures.length} failure(s) and ${failedMeasurements.length} failed measurement(s).`,
    };
}

function finalReceiptPresenceStatus(receiptExists, receiptText) {
    if (!receiptExists) {
        return {
            status: "missing",
            detail: "docs/final-proof-receipt.md",
        };
    }
    const failedDraftMarkers = [
        { label: "NOT COMPLETE", pattern: /\bNOT COMPLETE:/i },
        { label: "Result: failed", pattern: /\bResult:\s*failed\b/i },
        { label: "non-zero Exit status", pattern: /\bExit status:\s*[1-9]\d*\b/i },
        { label: "draft blocker", pattern: /\bdraft blocker\b/i },
        { label: "empty output placeholder", pattern: /PASTE OUTPUT HERE/i },
        { label: "empty cleanup placeholder", pattern: /PASTE CLEANUP RECEIPT HERE/i },
    ];
    const matches = failedDraftMarkers
        .filter((marker) => marker.pattern.test(receiptText))
        .map((marker) => marker.label);
    if (matches.length > 0) {
        return {
            status: "blocking",
            detail: `docs/final-proof-receipt.md exists but contains failed-draft marker(s): ${matches.join(", ")}.`,
        };
    }
    return {
        status: "present",
        detail: "docs/final-proof-receipt.md",
    };
}

function liveProofStatusDetail(liveProofStatus) {
    if (liveProofStatus === "completed") {
        return "Final receipt records completed sacrificial-sandbox live proof.";
    }
    if (liveProofStatus === "failed") {
        return "Final receipt records failed live proof; rerun make perfect-live successfully before final acceptance.";
    }
    if (liveProofStatus === "deferred") {
        return "Final receipt records deferred live proof; deferral is draft-only and must be replaced before final acceptance.";
    }
    return "Final receipt does not contain a recognized live proof status.";
}

export async function buildReport(options = { status: "all" }) {
    const register = await readJson("docs/risk-register.json");
    const risks =
        options.status === "all"
            ? register.risks
            : register.risks.filter((risk) => risk.status === options.status);

    const performanceBudgets = await readJsonOptional("docs/performance-budgets.json", {});
    const finalProofManifest = await readJsonOptional("docs/final-proof-receipt-manifest.json", {});
    const finalReceipt = await readOptional("docs/final-proof-receipt.md");
    const finalReceiptExists = await exists("docs/final-proof-receipt.md");
    const finalReceiptSignal = finalReceiptPresenceStatus(finalReceiptExists, finalReceipt);
    const tempContextExists = await exists("docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md");
    const expectedPerformanceReceiptCalibrationStatus =
        performanceBudgets.calibrationPolicy?.status === performanceBudgets.calibrationPolicy?.finalStatus
            ? performanceBudgets.calibrationPolicy?.finalStatus
            : undefined;
    const performanceBaseline = await readJsonState("docs/performance-baseline-latest.json");
    const performanceBaselineSignal = performanceReceiptStatus(
        performanceBaseline,
        expectedPerformanceReceiptCalibrationStatus,
        performanceBudgets.schemaVersion,
        budgetFingerprint(performanceBudgets),
    );
    const liveProofSection = readSection(
        finalReceipt,
        finalProofManifest.liveProof?.sectionStart ?? "## Live sandbox proof",
        finalProofManifest.liveProof?.sectionEnd ?? "## Temporary context cleanup",
    );
    const liveProofStatus = readListField(liveProofSection, finalProofManifest.liveProof?.field ?? "- Live proof status:");
    const allowedLiveProofStatuses = finalProofManifest.liveProof?.allowedStatuses ?? ["completed", "failed", "deferred"];

    const fileSignals = {
        temporaryContext: tempContextExists ? "present" : "removed",
        finalProofReceipt: finalReceiptSignal.status,
        performanceBaselineLatest: performanceBaselineSignal.status,
        performanceCalibration: performanceBudgets.calibrationPolicy?.status === "calibrated"
            ? "calibrated"
            : "not-calibrated",
        finalReceiptLiveStatus: allowedLiveProofStatuses.includes(liveProofStatus)
            ? liveProofStatus
            : "missing",
    };
    const fileSignalDetails = {
        finalProofReceipt: finalReceiptSignal.detail,
        performanceBaselineLatest: performanceBaselineSignal.detail,
        finalReceiptLiveStatus: liveProofStatusDetail(fileSignals.finalReceiptLiveStatus),
    };

    const readinessBlocking = risks
        .filter((risk) => ["open", "provisional"].includes(risk.status))
        .filter((risk) => risk.finalReadinessBlocking !== false);
    const nonBlockingOpenOrProvisional = risks
        .filter((risk) => ["open", "provisional"].includes(risk.status))
        .filter((risk) => risk.finalReadinessBlocking === false);
    const riskRoutingSummary = {
        finalReadinessRiskStatus: readinessBlocking.length > 0 ? "blocked" : "clear",
        readinessBlockingRiskCount: readinessBlocking.length,
        nonBlockingOpenOrProvisionalRiskCount: nonBlockingOpenOrProvisional.length,
        blockedUpstreamRiskCount: risks.filter((risk) => risk.status === "blocked-upstream").length,
        acceptedRiskCount: risks.filter((risk) => risk.status === "accepted").length,
    };
    const next =
        readinessBlocking.length > 0
            ? [
                  "Close final-readiness blocking open and provisional risks only with their closure gates.",
                  "Keep blocked-upstream and accepted risks visible unless their upstream or policy condition changes.",
                  "Keep docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md through evidence capture; remove it only after receipt completion and immediately before final-proof-final.",
              ]
            : [
                  "No final-readiness blocking open or provisional risks in the selected view; still run make risk-register and final proof gates before any readiness claim.",
              ];
    if (nonBlockingOpenOrProvisional.length > 0) {
        next.push(
            `Visible non-blocking open/provisional risks: ${nonBlockingOpenOrProvisional.map((risk) => risk.id).join(", ")}.`,
        );
    }

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        network: "none",
        commandsExecuted: [],
        envValuesCaptured: false,
        reportScope: options.status,
        warning: "This report is not proof. Run closure gates before changing risk status or claiming readiness.",
        counts: countByStatus(register.risks),
        fileSignals,
        fileSignalDetails,
        riskRoutingSummary,
        risks: risks.map((risk) => ({
            id: risk.id,
            status: risk.status,
            surface: risk.surface,
            summary: risk.summary,
            impact: risk.impact,
            mitigation: risk.mitigation,
            closureGate: risk.closureGate,
            finalReadinessBlocking: risk.finalReadinessBlocking ?? !["accepted", "blocked-upstream"].includes(risk.status),
        })),
        readinessBlockingRiskIds: readinessBlocking.map((risk) => risk.id),
        nonBlockingOpenOrProvisionalRiskIds: nonBlockingOpenOrProvisional.map((risk) => risk.id),
        next,
    };
}

function renderMarkdown(report) {
    const lines = ["# Risk Status Report", ""];
    lines.push("This report is not proof. It does not run commands.");
    lines.push("");
    lines.push(`Generated at: ${report.generatedAt}`);
    lines.push(`Scope: ${report.reportScope}`);
    lines.push("");
    lines.push("## Counts");
    lines.push("");
    for (const [status, count] of Object.entries(report.counts)) {
        lines.push(`- ${status}: ${count}`);
    }
    lines.push("");
    lines.push("## File-state signals");
    lines.push("");
    for (const [id, status] of Object.entries(report.fileSignals)) {
        const detail = report.fileSignalDetails?.[id];
        lines.push(`- ${id}: ${status}${detail ? ` (${detail})` : ""}`);
    }
    lines.push("");
    lines.push("## Final-readiness risk routing");
    lines.push("");
    lines.push(`- Final-readiness risk status: ${report.riskRoutingSummary.finalReadinessRiskStatus}`);
    lines.push(`- Blocking risk count: ${report.riskRoutingSummary.readinessBlockingRiskCount}`);
    lines.push(
        `- Visible non-blocking open/provisional risk count: ${report.riskRoutingSummary.nonBlockingOpenOrProvisionalRiskCount}`,
    );
    lines.push(
        `- Blocking open/provisional risks: ${report.readinessBlockingRiskIds.length > 0 ? report.readinessBlockingRiskIds.join(", ") : "none"}`,
    );
    lines.push(
        `- Visible non-blocking open/provisional risks: ${
            report.nonBlockingOpenOrProvisionalRiskIds.length > 0
                ? report.nonBlockingOpenOrProvisionalRiskIds.join(", ")
                : "none"
        }`,
    );
    lines.push("");
    lines.push("## Risks");
    lines.push("");
    for (const risk of report.risks) {
        lines.push(`### ${risk.id}`);
        lines.push("");
        lines.push(`Status: ${risk.status}`);
        lines.push(`Final-readiness blocking: ${risk.finalReadinessBlocking ? "yes" : "no"}`);
        lines.push(`Surface: ${risk.surface}`);
        lines.push(`Summary: ${risk.summary}`);
        lines.push(`Closure gate: ${risk.closureGate}`);
        lines.push("");
    }
    lines.push("## Next");
    lines.push("");
    for (const item of report.next) lines.push(`- ${item}`);
    return `${lines.join("\n")}\n`;
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    const report = await buildReport(options);
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
