#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { budgetFingerprint } from "./budget-fingerprint.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

const requiredPreflight = [
    {
        id: "final-proof-preflight",
        command: "make final-proof-preflight",
        purpose:
            "Print active hardening-goal blockers and release-readiness file-state signals without running proof gates; includes the enterprise-goal-status report.",
    },
];

const requiredProof = [
    {
        id: "enterprise-audit",
        command: "make enterprise-audit",
        proves: "Artifact evidence map is wired before final proof.",
    },
    {
        id: "axioms-contract",
        command: "make axioms-contract",
        proves: "SDK/CLI/MCP/OpenAPI axioms are still tied to concrete gates and evidence.",
    },
    {
        id: "perfect-fast",
        command: "make perfect-fast",
        proves: "Deterministic local SDK/CLI/MCP/OpenAPI contracts and package gates pass.",
    },
    {
        id: "performance-receipt",
        command: "make performance-receipt",
        proves: "Built artifact size/startup measurements were recorded for budget calibration.",
    },
    {
        id: "perfect-full",
        command: "make perfect-full",
        proves: "GOCLMCP drift, Fern generation, package gates, and packed consumer proof pass.",
    },
    {
        id: "perfect-live",
        command: "make perfect-live",
        proves: "Sandbox-only live proof and cleanup pass for SDK, CLI, MCP, and GOCLMCP.",
    },
    {
        id: "final-proof-draft",
        command: 'LIVE=1 make final-proof-draft or DEFER_LIVE_REASON="..." make final-proof-draft',
        proves: "Draft final proof receipt is written from command output; live deferral is draft-only and must be replaced before final-proof-final.",
    },
    {
        id: "final-proof-receipt-check",
        command: "make final-proof-receipt-check",
        proves: "Final proof receipt is filled and not copied empty from the template.",
    },
    {
        id: "final-proof-final",
        command: "make final-proof-final",
        proves: "Final proof receipt check and final artifact audit both pass after temporary context removal.",
    },
];

const requiredFinalProofCommandOrder = [
    "final-proof-preflight",
    "enterprise-audit",
    "axioms-contract",
    "perfect-fast",
    "performance-receipt",
    "perfect-full",
    "perfect-live",
    "final-proof-draft",
    "final-proof-receipt-check",
    "final-proof-final",
];

function usage() {
    return [
        "Usage: node scripts/release-readiness-report.mjs [--format <markdown|json>]",
        "",
        "Prints a no-network readiness preflight report.",
        "Does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls.",
        "This report is not release proof; it only lists required evidence and current file-state signals.",
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

function lineStatus(condition) {
    return condition ? "present" : "missing";
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
    const finalReceiptExists = await exists("docs/final-proof-receipt.md");
    const tempContextExists = await exists("docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md");
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
    const budgetCalibrated = performanceBudgets.calibrationPolicy?.status === "calibrated";

    const finalReceipt = await readOptional("docs/final-proof-receipt.md");
    const finalReceiptPresenceSignal = finalReceiptPresenceStatus(finalReceiptExists, finalReceipt);
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
    const blockingRiskIds = (riskRegister.risks ?? [])
        .filter((risk) => ["open", "provisional"].includes(risk.status))
        .filter((risk) => risk.finalReadinessBlocking !== false)
        .map((risk) => risk.id);
    const finalReceiptHasRiskRegisterClear = blockingRiskIds.length === 0;
    const finalReceiptLooksFilled =
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
        !finalReceipt.includes("NOT COMPLETE:");

    const signals = [
        {
            id: "temporary-context",
            status: tempContextExists ? "open" : "closed",
            detail: tempContextExists
                ? "Temporary context file still exists; final audit must not pass yet."
                : "Temporary context file has been removed.",
        },
        {
            id: "final-proof-receipt",
            status: finalReceiptPresenceSignal.status,
            detail: finalReceiptPresenceSignal.detail,
        },
        {
            id: "final-proof-receipt-filled",
            status: finalReceiptLooksFilled ? "present" : "missing",
            detail: "Receipt must follow temporary context removal and contain tightened budgets, performance proof, final live completion, live cleanup proof, final audit evidence, and no placeholders.",
        },
        {
            id: "live-cleanup-proof",
            status: finalReceiptHasLiveCleanupProof ? "present" : "missing",
            detail:
                'Completed live proof requires Sandbox cleanup receipt with "prefixes", "total": 0, "leftovers", and every known prefix; deferred live proof requires the no-live-objects marker; failed live proof must be rerun successfully.',
        },
        {
            id: "live-proof-final-status",
            status: finalReceiptHasFinalLiveProofStatus ? "completed" : "blocking",
            detail:
                "Final acceptance requires Live proof status: completed; failed live proof must be rerun successfully, and deferred live proof is a draft blocker that still needs a deferral reason and no-live-objects cleanup marker.",
        },
        {
            id: "performance-baseline",
            status: performanceBaselineSignal.status,
            detail: performanceBaselineSignal.detail,
        },
        {
            id: "performance-budget-calibration",
            status: budgetCalibrated ? "calibrated" : "not-calibrated",
            detail: "docs/performance-budgets.json calibrationPolicy.status",
        },
        {
            id: "final-receipt-budget-status",
            status: finalReceiptHasTightenedBudget ? "tightened" : "blocking",
            detail: "Final receipt Performance receipts section must state Budget status: tightened.",
        },
        {
            id: "performance-required-runs-policy",
            status: performanceRequiredRunsPolicyValid ? "valid" : "blocking",
            detail: "docs/performance-budgets.json calibrationPolicy.requiredSuccessfulRuns must be a positive integer.",
        },
        {
            id: "performance-proof",
            status: finalReceiptHasPerformanceProof ? "present" : "missing",
            detail:
                "Final receipt must include requiredSuccessfulRuns performance receipt headings, passed results, and zero exit statuses.",
        },
        {
            id: "final-proof-failure-markers",
            status: finalReceiptHasFailureMarkers ? "blocking" : "absent",
            detail: "Final receipt must not contain Result: failed or non-zero exit-status markers.",
        },
        {
            id: "success-section-evidence",
            status: finalReceiptHasRequiredSuccessSectionEvidence ? "present" : "missing",
            detail:
                "Every final success section must include manifest-required success evidence such as Exit status: 0 and Result: passed.",
        },
        {
            id: "final-audit-command-evidence",
            status: finalReceiptHasFinalAuditCommand ? "present" : "missing",
            detail:
                "Final receipt Temporary context cleanup section must include make enterprise-audit-final command evidence.",
        },
        {
            id: "residual-risk-decision",
            status: finalReceiptHasResidualRiskDecision ? "present" : "missing",
            detail: "Final receipt must state residual risk status none or carried with required details.",
        },
        {
            id: "residual-risk-final-status",
            status: finalReceiptHasFinalResidualRiskStatus ? "none" : "blocking",
            detail: "Final acceptance requires Residual risk status: none; carried risks are draft blockers.",
        },
        {
            id: "risk-register-final-status",
            status: finalReceiptHasRiskRegisterClear ? "clear" : "blocking",
            detail:
                `Final acceptance requires no final-blocking open/provisional risk-register entries. Blocking: ${blockingRiskIds.join(", ") || "none"}.`,
        },
    ];

    const blockingSignals = signals.filter((signal) =>
        ["open", "missing", "not-calibrated", "blocking"].includes(signal.status),
    );

    const blockingDetails = blockingSignals.map((signal) => `${signal.id}: ${signal.status}`);
    const blockingSignalIds = blockingSignals.map((signal) => signal.id);
    const blockingRiskIdsForReport = blockingRiskIds;

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        network: "none",
        commandsExecuted: [],
        envValuesCaptured: false,
        releaseReady: false,
        reportScope: "preflight-only",
        warning: "This report does not run proof gates and must not be used as release approval.",
        requiredPreflight,
        requiredProof,
        requiredFinalProofCommandOrder,
        signals,
        blockingSignalIds,
        blockingRiskIds: blockingRiskIdsForReport,
        next:
            blockingSignals.length > 0
                ? [
                      `Resolve blocking file-state signals: ${blockingDetails.join(", ")}.`,
                      "Run the required proof commands when validation is allowed.",
                      "Fill docs/final-proof-receipt.md from real command output.",
                      "Remove docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md only after final proof.",
                  ]
                : [
                      "Current file-state signals look closed; run make final-proof-final before any completion claim.",
                  ],
    };
}

function renderMarkdown(report) {
    const lines = ["# Release Readiness Preflight Report", ""];
    lines.push("This report is not release proof. It does not run commands.");
    lines.push("");
    lines.push(`Generated at: ${report.generatedAt}`);
    lines.push(`Release ready: ${report.releaseReady ? "yes" : "no"}`);
    lines.push("");
    lines.push("## Required preflight");
    lines.push("");
    for (const item of report.requiredPreflight) {
        lines.push(`- \`${item.command}\` - ${item.purpose}`);
    }
    lines.push("");
    lines.push("## Required proof");
    lines.push("");
    for (const item of report.requiredProof) {
        lines.push(`- \`${item.command}\` - ${item.proves}`);
    }
    lines.push("");
    lines.push("## Full final proof order");
    lines.push("");
    const proofById = new Map(
        [...report.requiredPreflight, ...report.requiredProof].map((item) => [item.id, item]),
    );
    for (const id of report.requiredFinalProofCommandOrder) {
        const item = proofById.get(id);
        lines.push(`- ${id}: \`${item?.command ?? "(missing command)"}\``);
    }
    lines.push("");
    lines.push("## Current file-state signals");
    lines.push("");
    for (const signal of report.signals) {
        lines.push(`- ${signal.id}: ${signal.status} (${signal.detail})`);
    }
    lines.push("");
    lines.push("## Blocking file-state summary");
    lines.push("");
    lines.push(
        `- Blocking signals: ${report.blockingSignalIds.length > 0 ? report.blockingSignalIds.join(", ") : "none"}`,
    );
    lines.push(
        `- Blocking risks: ${report.blockingRiskIds.length > 0 ? report.blockingRiskIds.join(", ") : "none"}`,
    );
    lines.push("");
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
