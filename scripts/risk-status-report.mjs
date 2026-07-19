// Planner module: risk status report.
// Invoked via `node scripts/plan.mjs risk-status [--status <open|provisional|blocked-upstream|accepted|all>]`.
// Does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls.
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { budgetFingerprint } from "./budget-fingerprint.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const VALID_STATUSES = new Set(["open", "provisional", "blocked-upstream", "accepted", "all"]);

async function exists(relPath) {
    try {
        await access(path.join(root, relPath));
        return true;
    } catch {
        return false;
    }
}

async function readJson(relPath) {
    const absolutePath = path.isAbsolute(relPath) ? relPath : path.join(root, relPath);
    return JSON.parse(await readFile(absolutePath, "utf8"));
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

export async function buildReport(options = { status: "all" }) {
    const status = options.status ?? "all";
    if (!VALID_STATUSES.has(status)) {
        throw new Error(`Unknown status: ${status}`);
    }
    const register = await readJson(options.registerPath ?? "docs/risk-register.json");
    const risks = status === "all" ? register.risks : register.risks.filter((risk) => risk.status === status);

    const performanceBudgets = await readJsonOptional("docs/performance-budgets.json", {});
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

    const fileSignals = {
        temporaryContext: tempContextExists ? "present" : "removed",
        performanceBaselineLatest: performanceBaselineSignal.status,
        performanceCalibration: performanceBudgets.calibrationPolicy?.status === "calibrated"
            ? "calibrated"
            : "not-calibrated",
    };
    const fileSignalDetails = {
        performanceBaselineLatest: performanceBaselineSignal.detail,
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
              ]
            : [
                  "No final-readiness blocking open or provisional risks in the selected view; still run make risk-register before any readiness claim.",
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
        reportScope: status,
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

export function renderMarkdown(report) {
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
