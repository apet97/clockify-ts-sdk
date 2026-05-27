#!/usr/bin/env node
// enterprise-goal-status: no-network active-goal status report.
// Run make final-proof-preflight, make enterprise-audit, make perfect-fast, make performance-receipt, make perfect-full, make perfect-live in that order to close blockers.
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { budgetFingerprint } from "./budget-fingerprint.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

function usage() {
    return [
        "Usage: node scripts/enterprise-goal-status.mjs [--format <markdown|json>]",
        "",
        "Prints a no-network status report for the enterprise SDK/CLI/MCP hardening goal.",
        "Does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls.",
        "This report is not proof; it only summarizes current file-state signals and remaining proof work.",
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
    if (!["markdown", "json"].includes(options.format)) throw new Error(`Unknown format: ${options.format}`);
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

async function readJsonOptional(relPath, fallback) {
    try {
        return JSON.parse(await readFile(path.join(root, relPath), "utf8"));
    } catch {
        return fallback;
    }
}

async function readJsonState(relPath) {
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

function statusFromBoolean(condition, good, bad) {
    return condition ? good : bad;
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

function readFirstFencedBlockAfter(text, marker) {
    const markerIndex = text.indexOf(marker);
    if (markerIndex === -1) return "";
    const afterMarker = text.slice(markerIndex + marker.length);
    const fenceStart = afterMarker.indexOf("```");
    if (fenceStart === -1) return "";
    const contentStart = afterMarker.indexOf("\n", fenceStart);
    if (contentStart === -1) return "";
    const fenceEnd = afterMarker.indexOf("```", contentStart + 1);
    if (fenceEnd === -1) return "";
    return afterMarker.slice(contentStart + 1, fenceEnd);
}

function readSection(text, startMarker, endMarker) {
    const start = text.indexOf(startMarker);
    if (start === -1) return "";
    const end = text.indexOf(endMarker, start + startMarker.length);
    return end === -1 ? text.slice(start) : text.slice(start, end);
}

function readReceiptSection(text, orderedSections, sectionMarker) {
    const start = text.indexOf(sectionMarker);
    if (start === -1) return "";
    const nextStarts = (orderedSections ?? [])
        .filter((candidate) => candidate !== sectionMarker)
        .map((candidate) => text.indexOf(candidate, start + sectionMarker.length))
        .filter((index) => index > start)
        .sort((left, right) => left - right);
    const end = nextStarts[0] ?? text.length;
    return text.slice(start, end);
}

function countPattern(text, patternSource) {
    if (!patternSource) return 0;
    return [...text.matchAll(new RegExp(patternSource, "gi"))].length;
}

function readListField(text, prefix) {
    const line = text.split("\n").find((candidate) => candidate.startsWith(prefix));
    if (!line) return undefined;
    const value = line.slice(prefix.length).trim();
    return value.length > 0 ? value : undefined;
}

export async function buildReport() {
    const tempContextExists = await exists("docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md");
    const finalReceiptExists = await exists("docs/final-proof-receipt.md");
    const performanceBudgets = await readJsonOptional("docs/performance-budgets.json", {});
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
    const finalProofManifest = await readJsonOptional("docs/final-proof-receipt-manifest.json", {});
    const riskRegister = await readJsonOptional("docs/risk-register.json", { risks: [] });
    const tempContext = await readOptional("docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md");
    const finalReceipt = await readOptional("docs/final-proof-receipt.md");
    const finalReceiptPresenceSignal = finalReceiptPresenceStatus(finalReceiptExists, finalReceipt);

    const openRisks = (riskRegister.risks ?? []).filter((risk) => risk.status === "open");
    const provisionalRisks = (riskRegister.risks ?? []).filter((risk) => risk.status === "provisional");
    const blockingRiskIds = [...openRisks, ...provisionalRisks]
        .filter((risk) => risk.finalReadinessBlocking !== false)
        .map((risk) => risk.id);
    const finalReceiptHasRiskRegisterClear = blockingRiskIds.length === 0;
    const calibrationStatus = performanceBudgets.calibrationPolicy?.status ?? "unknown";
    const liveProofSection = readSection(
        finalReceipt,
        finalProofManifest.liveProof?.sectionStart ?? "## Live sandbox proof",
        finalProofManifest.liveProof?.sectionEnd ?? "## Temporary context cleanup",
    );
    const liveProofStatus = readListField(liveProofSection, finalProofManifest.liveProof?.field ?? "- Live proof status:");
    const finalReceiptHasCompletedLiveProof = liveProofStatus === "completed";
    const finalReceiptHasDeferredLiveProof = liveProofStatus === "deferred";
    const finalReceiptHasFailedLiveProof = liveProofStatus === "failed";
    const requiredCleanupPrefixes = finalProofManifest.liveProof?.completedCleanupRequiredPrefixes ?? [];
    const cleanupReceipt = readFirstFencedBlockAfter(
        liveProofSection,
        finalProofManifest.liveProof?.cleanupReceiptMarker ?? "Sandbox cleanup receipt:",
    );
    const finalReceiptHasCompletedCleanupProof =
        cleanupReceipt.length > 0 &&
        /"prefixes"\s*:/.test(cleanupReceipt) &&
        /"total"\s*:\s*0/.test(cleanupReceipt) &&
        /"leftovers"\s*:/.test(cleanupReceipt) &&
        requiredCleanupPrefixes.every((prefix) => cleanupReceipt.includes(prefix));
    const finalReceiptHasDeferredCleanupProof = (
        finalProofManifest.liveProof?.deferredCleanupRequiredMarkers ?? []
    ).every((marker) => liveProofSection.includes(marker));
    const finalReceiptHasLiveCleanupProof =
        (finalReceiptHasCompletedLiveProof && finalReceiptHasCompletedCleanupProof) ||
        (finalReceiptHasDeferredLiveProof && finalReceiptHasDeferredCleanupProof);
    const finalReceiptHasFinalLiveProofStatus =
        liveProofStatus === finalProofManifest.liveProof?.finalRequiredStatus;
    const requiredPerformanceRuns = performanceBudgets.calibrationPolicy?.requiredSuccessfulRuns;
    const performanceRequiredRunsPolicyValid =
        Number.isInteger(requiredPerformanceRuns) && requiredPerformanceRuns > 0;
    const performanceSection = readSection(
        finalReceipt,
        finalProofManifest.budget?.section ?? "## Performance receipts",
        "## Full generation and pack proof",
    );
    const finalReceiptHasTightenedBudget =
        readListField(performanceSection, finalProofManifest.budget?.field ?? "- Budget status:") ===
        finalProofManifest.budget?.requiredReceiptValue;
    const finalReceiptHasPerformanceProof =
        performanceRequiredRunsPolicyValid &&
        countPattern(performanceSection, finalProofManifest.budget?.receiptHeadingPattern) >=
            requiredPerformanceRuns &&
        countPattern(performanceSection, finalProofManifest.budget?.receiptPassPattern) >=
            requiredPerformanceRuns &&
        countPattern(performanceSection, finalProofManifest.budget?.receiptExitZeroPattern) >=
            requiredPerformanceRuns;
    const finalReceiptHasFailureMarkers = (finalProofManifest.successSectionFailureForbiddenPatterns ?? []).some(
        (patternSource) => new RegExp(patternSource, "i").test(finalReceipt),
    );
    const successSectionRequiredPatterns = finalProofManifest.successSectionRequiredPatterns ?? [];
    const finalReceiptHasRequiredSuccessSectionEvidence =
        (finalProofManifest.successSections ?? []).length > 0 &&
        successSectionRequiredPatterns.length > 0 &&
        (finalProofManifest.successSections ?? []).every((section) => {
            const sectionText = readReceiptSection(finalReceipt, finalProofManifest.orderedSections ?? [], section);
            return (
                sectionText.length > 0 &&
                successSectionRequiredPatterns.every((patternSource) =>
                    new RegExp(patternSource, "i").test(sectionText),
                )
            );
        });
    const finalAuditCommandSection = (finalProofManifest.commandSections ?? []).find((entry) =>
        (entry.commands ?? []).includes("make enterprise-audit-final"),
    );
    const finalAuditSectionText =
        finalAuditCommandSection == null
            ? ""
            : readReceiptSection(
                  finalReceipt,
                  finalProofManifest.orderedSections ?? [],
                  finalAuditCommandSection.section,
              );
    const finalReceiptHasFinalAuditCommand =
        finalAuditCommandSection != null &&
        (finalAuditCommandSection.commands ?? []).every((command) => finalAuditSectionText.includes(command));
    const residualRiskSection = readSection(
        finalReceipt,
        finalProofManifest.residualRisk?.section ?? "## Residual risk",
        "__END_OF_RECEIPT__",
    );
    const residualRiskStatus = readListField(
        residualRiskSection,
        finalProofManifest.residualRisk?.statusField ?? "- Residual risk status:",
    );
    const finalReceiptHasResidualRiskDecision =
        finalProofManifest.residualRisk?.allowedStatuses?.includes(residualRiskStatus) === true &&
        (residualRiskStatus === "none"
            ? residualRiskSection.includes(finalProofManifest.residualRisk.noneRequiredMarker) &&
              (finalProofManifest.residualRisk.noneForbiddenPatterns ?? []).every(
                  (patternSource) => !new RegExp(patternSource, "i").test(residualRiskSection),
              )
            : (finalProofManifest.residualRisk.carriedRequiredPatterns ?? []).every((patternSource) =>
                  new RegExp(patternSource, "i").test(residualRiskSection),
              ));
    const finalReceiptHasFinalResidualRiskStatus =
        residualRiskStatus === finalProofManifest.residualRisk?.finalRequiredStatus;
    const finalReceiptFilled =
        finalReceiptExists &&
        !tempContextExists &&
        finalReceiptHasTightenedBudget &&
        finalReceiptHasPerformanceProof &&
        (finalReceiptHasCompletedLiveProof || finalReceiptHasDeferredLiveProof) &&
        finalReceiptHasFinalLiveProofStatus &&
        finalReceiptHasLiveCleanupProof &&
        finalReceiptHasFinalAuditCommand &&
        !finalReceipt.includes("PASTE OUTPUT HERE") &&
        !finalReceipt.includes("PASTE CLEANUP RECEIPT HERE") &&
        !finalReceiptHasFailureMarkers &&
        finalReceiptHasRequiredSuccessSectionEvidence &&
        finalReceiptHasResidualRiskDecision &&
        finalReceiptHasFinalResidualRiskStatus &&
        finalReceiptHasRiskRegisterClear &&
        !finalReceipt.includes("NOT COMPLETE:") &&
        !finalReceipt.includes("Run after removing the temporary context file.");

    const finalProofCommandOrder = [
        "preflight",
        "enterpriseAudit",
        "axiomsContract",
        "perfectFast",
        "performanceReceipt",
        "perfectFull",
        "perfectLive",
        "draft",
        "receiptCheck",
        "final",
    ];
    const finalProofCommands = {
        preflight: "make final-proof-preflight",
        enterpriseAudit: "make enterprise-audit",
        axiomsContract: "make axioms-contract",
        perfectFast: "make perfect-fast",
        performanceReceipt: "make performance-receipt",
        perfectFull: "make perfect-full",
        perfectLive: "make perfect-live",
        draft:
            'LIVE=1 make final-proof-draft or DEFER_LIVE_REASON="..." make final-proof-draft',
        receiptCheck: "make final-proof-receipt-check",
        final: "make final-proof-final",
    };

    const signals = [
        {
            id: "temporary-context",
            status: tempContextExists ? "open" : "removed",
            detail: "docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md",
        },
        {
            id: "final-proof-receipt",
            status: finalReceiptPresenceSignal.status,
            detail: finalReceiptPresenceSignal.detail,
        },
        {
            id: "final-proof-receipt-filled",
            status: statusFromBoolean(finalReceiptFilled, "filled", "not-filled"),
            detail: "Requires temporary context removal, tightened budgets, performance proof, final live completed status, cleanup proof, final audit output, no template paste markers, and no NOT COMPLETE runner placeholders.",
        },
        {
            id: "live-cleanup-proof",
            status: statusFromBoolean(finalReceiptHasLiveCleanupProof, "present", "missing"),
            detail:
                'Completed live proof requires Sandbox cleanup receipt with "prefixes", "total": 0, "leftovers", and every known prefix; deferred live proof requires the no-live-objects marker; failed live proof must be rerun successfully.',
        },
        {
            id: "live-proof-final-status",
            status: statusFromBoolean(finalReceiptHasFinalLiveProofStatus, "completed", "blocking"),
            detail:
                "Final acceptance requires Live proof status: completed; failed live proof must be rerun successfully, and deferred live proof is a draft blocker that still needs a deferral reason and no-live-objects cleanup marker.",
        },
        {
            id: "performance-baseline",
            status: performanceBaselineSignal.status,
            detail: performanceBaselineSignal.detail,
        },
        {
            id: "performance-calibration",
            status: calibrationStatus,
            detail: "docs/performance-budgets.json calibrationPolicy.status",
        },
        {
            id: "final-receipt-budget-status",
            status: statusFromBoolean(finalReceiptHasTightenedBudget, "tightened", "blocking"),
            detail: "Final receipt Performance receipts section must state Budget status: tightened.",
        },
        {
            id: "performance-required-runs-policy",
            status: statusFromBoolean(performanceRequiredRunsPolicyValid, "valid", "blocking"),
            detail: "docs/performance-budgets.json calibrationPolicy.requiredSuccessfulRuns must be a positive integer.",
        },
        {
            id: "performance-proof",
            status: statusFromBoolean(finalReceiptHasPerformanceProof, "present", "missing"),
            detail:
                "Final receipt must include requiredSuccessfulRuns performance receipt headings, passed results, and zero exit statuses.",
        },
        {
            id: "final-proof-failure-markers",
            status: statusFromBoolean(finalReceiptHasFailureMarkers, "blocking", "absent"),
            detail: "Final receipt must not contain Result: failed or non-zero exit-status markers.",
        },
        {
            id: "success-section-evidence",
            status: statusFromBoolean(finalReceiptHasRequiredSuccessSectionEvidence, "present", "missing"),
            detail:
                "Every final success section must include manifest-required success evidence such as Exit status: 0 and Result: passed.",
        },
        {
            id: "final-audit-command-evidence",
            status: statusFromBoolean(finalReceiptHasFinalAuditCommand, "present", "missing"),
            detail:
                "Final receipt Temporary context cleanup section must include make enterprise-audit-final command evidence.",
        },
        {
            id: "residual-risk-decision",
            status: statusFromBoolean(finalReceiptHasResidualRiskDecision, "present", "missing"),
            detail: "Final receipt must state residual risk status none or carried with required details.",
        },
        {
            id: "residual-risk-final-status",
            status: statusFromBoolean(finalReceiptHasFinalResidualRiskStatus, "none", "blocking"),
            detail: "Final acceptance requires Residual risk status: none; carried risks are draft blockers.",
        },
        {
            id: "risk-register-final-status",
            status: statusFromBoolean(finalReceiptHasRiskRegisterClear, "clear", "blocking"),
            detail:
                `Final acceptance requires no final-blocking open/provisional risk-register entries. Blocking: ${blockingRiskIds.join(", ") || "none"}.`,
        },
        {
            id: "final-proof-preflight-command",
            status: "available",
            detail: `Use ${finalProofCommands.preflight} before expensive proof gates to print no-network blocker reports.`,
        },
        {
            id: "enterprise-audit-command",
            status: "available",
            detail: `Use ${finalProofCommands.enterpriseAudit} as the artifact-level completion check before the full gate stack.`,
        },
        {
            id: "axioms-contract-command",
            status: "available",
            detail: `Use ${finalProofCommands.axiomsContract} to prove the SDK/CLI/MCP/OpenAPI rulebook before aggregate proof gates.`,
        },
        {
            id: "perfect-fast-command",
            status: "available",
            detail: `Use ${finalProofCommands.perfectFast} for deterministic local proof before slower generation/live gates.`,
        },
        {
            id: "performance-receipt-command",
            status: "available",
            detail: `Use ${finalProofCommands.performanceReceipt} after package builds so the latest performance JSON receipt is current.`,
        },
        {
            id: "perfect-full-command",
            status: "available",
            detail: `Use ${finalProofCommands.perfectFull} for full generation, package, and packed-consumer proof.`,
        },
        {
            id: "perfect-live-command",
            status: "available",
            detail: `Use ${finalProofCommands.perfectLive} for explicit sandbox/live cleanup proof before final receipt completion.`,
        },
        {
            id: "final-proof-draft-command",
            status: "available",
            detail: 'Use LIVE=1 make final-proof-draft, or DEFER_LIVE_REASON="..." make final-proof-draft, to generate a draft receipt from command output.',
        },
        {
            id: "final-proof-receipt-check-command",
            status: "available",
            detail: "Use make final-proof-receipt-check after manually completing docs/final-proof-receipt.md.",
        },
        {
            id: "final-proof-acceptance-command",
            status: "available",
            detail: "Use make final-proof-final only after manual receipt completion and temporary context removal.",
        },
        {
            id: "open-risks",
            status: String(openRisks.length),
            detail: openRisks.map((risk) => risk.id).join(", ") || "none",
        },
        {
            id: "provisional-risks",
            status: String(provisionalRisks.length),
            detail: provisionalRisks.map((risk) => risk.id).join(", ") || "none",
        },
    ];

    const finalBlockingSignalIds = signals
        .filter((signal) => ["open", "missing", "blocking"].includes(signal.status))
        .map((signal) => signal.id);
    const finalBlockingRiskIds = blockingRiskIds;

    const remaining = [];
    if (calibrationStatus !== "calibrated") {
        remaining.push("Run performance receipts after builds and tighten docs/performance-budgets.json to calibrated.");
    }
    if (!finalReceiptHasTightenedBudget) {
        remaining.push("Set Budget status: tightened in the final receipt Performance receipts section.");
    }
    if (!performanceRequiredRunsPolicyValid) {
        remaining.push("Set docs/performance-budgets.json calibrationPolicy.requiredSuccessfulRuns to a positive integer.");
    }
    if (!finalReceiptHasPerformanceProof) {
        remaining.push("Add requiredSuccessfulRuns successful performance receipts to docs/final-proof-receipt.md.");
    }
    if (!finalReceiptHasFinalLiveProofStatus) {
        remaining.push("Replace failed or deferred live proof with completed sacrificial-sandbox live proof before final acceptance.");
    }
    if (finalReceiptHasFailedLiveProof) {
        remaining.push("Rerun make perfect-live successfully and replace failed live proof output in docs/final-proof-receipt.md.");
    }
    if (!finalReceiptHasLiveCleanupProof) {
        remaining.push("Paste the completed live cleanup receipt JSON with required prefixes, total: 0, and leftovers.");
    }
    if (finalReceiptHasFailureMarkers) {
        remaining.push("Replace failed command output in the final receipt with successful rerun output.");
    }
    if (!finalReceiptHasRequiredSuccessSectionEvidence) {
        remaining.push("Add Exit status: 0 and Result: passed evidence to every final proof success section.");
    }
    if (!finalReceiptHasFinalAuditCommand) {
        remaining.push("Add make enterprise-audit-final command evidence to the Temporary context cleanup section.");
    }
    if (!finalReceiptHasResidualRiskDecision) {
        remaining.push("Add a structured residual-risk decision to the final receipt.");
    } else if (!finalReceiptHasFinalResidualRiskStatus) {
        remaining.push("Resolve carried residual risks; final acceptance requires Residual risk status: none.");
    }
    if (!finalReceiptFilled) {
        remaining.push("Generate a draft docs/final-proof-receipt.md from real command output with make final-proof-draft.");
        remaining.push("Manually complete the receipt, remove every NOT COMPLETE marker, then run make final-proof-final.");
    }
    if (tempContextExists) {
        remaining.push("Keep the temporary context file until final proof is complete; remove it only before final-proof-final.");
    }
    if (blockingRiskIds.length > 0) {
        remaining.push("Close final-blocking open/provisional risk-register entries with their closure gates.");
    }
    remaining.push("Run make final-proof-preflight, make enterprise-audit, make axioms-contract, make perfect-fast, make performance-receipt, make perfect-full, make perfect-live, then make final-proof-draft; live deferral is draft-only and must be replaced before make final-proof-final.");

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        network: "none",
        commandsExecuted: [],
        envValuesCaptured: false,
        reportScope: "enterprise-sdk-hardening-goal",
        goalComplete: false,
        warning: "This report is not proof. It does not run gates and must not be used to mark the goal complete.",
        tempContextLineCount: tempContext ? tempContext.split("\n").length : 0,
        signals,
        finalBlockingSignalIds,
        finalBlockingRiskIds,
        finalProofCommandOrder,
        finalProofCommands,
        remaining,
    };
}

function renderMarkdown(report) {
    const lines = ["# Enterprise SDK Hardening Goal Status", ""];
    lines.push("This report is not proof. It does not run commands.");
    lines.push("");
    lines.push(`Generated at: ${report.generatedAt}`);
    lines.push(`Goal complete: ${report.goalComplete ? "yes" : "no"}`);
    lines.push("");
    lines.push("## Signals");
    lines.push("");
    for (const signal of report.signals) {
        lines.push(`- ${signal.id}: ${signal.status} (${signal.detail})`);
    }
    lines.push("");
    lines.push("## Final blockers");
    lines.push("");
    lines.push(
        `- Blocking signals: ${
            report.finalBlockingSignalIds.length > 0 ? report.finalBlockingSignalIds.join(", ") : "none"
        }`,
    );
    lines.push(
        `- Blocking risks: ${
            report.finalBlockingRiskIds.length > 0 ? report.finalBlockingRiskIds.join(", ") : "none"
        }`,
    );
    lines.push("");
    lines.push("## Final proof commands");
    lines.push("");
    const commandLabels = {
        preflight: "Preflight",
        enterpriseAudit: "Enterprise audit",
        axiomsContract: "Axioms contract",
        perfectFast: "Perfect fast",
        performanceReceipt: "Performance receipt",
        perfectFull: "Perfect full",
        perfectLive: "Perfect live",
        draft: "Draft receipt",
        receiptCheck: "Receipt check",
        final: "Final acceptance",
    };
    for (const key of report.finalProofCommandOrder ?? Object.keys(report.finalProofCommands)) {
        lines.push(`- ${commandLabels[key] ?? key}: \`${report.finalProofCommands[key]}\``);
    }
    lines.push("");
    lines.push("## Remaining work");
    lines.push("");
    for (const item of report.remaining) lines.push(`- ${item}`);
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
