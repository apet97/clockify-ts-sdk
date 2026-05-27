#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "docs", "final-proof-receipt-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const args = process.argv.slice(2);
const live = args.includes("--live");
const deferLiveArg = args.find((arg) => arg.startsWith("--defer-live="));
const deferLiveReason = deferLiveArg?.slice("--defer-live=".length).trim();
const performanceRunsArg = args.find((arg) => arg.startsWith("--performance-runs="));
const requestedPerformanceRuns =
    performanceRunsArg == null ? undefined : Number.parseInt(performanceRunsArg.slice("--performance-runs=".length), 10);

if (live === Boolean(deferLiveReason)) {
    usage("Choose exactly one of --live or --defer-live=<reason>.");
}

if (requestedPerformanceRuns != null && (!Number.isFinite(requestedPerformanceRuns) || requestedPerformanceRuns < 1)) {
    usage("--performance-runs must be a positive integer.");
}

if (deferLiveReason != null && deferLiveReason.length < manifest.liveProof.minDeferralReasonLength) {
    usage(`--defer-live reason must be at least ${manifest.liveProof.minDeferralReasonLength} characters.`);
}

const receiptPath = path.join(root, manifest.receiptPath);
const budgetPath = path.join(root, manifest.budgetPath);
const budgetConfig = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
const requiredPerformanceRuns = budgetConfig.calibrationPolicy?.requiredSuccessfulRuns;
if (!Number.isInteger(requiredPerformanceRuns) || requiredPerformanceRuns < 1) {
    console.error(`${manifest.budgetPath} calibrationPolicy.requiredSuccessfulRuns must be a positive integer.`);
    process.exit(2);
}
const performanceRuns = requestedPerformanceRuns ?? requiredPerformanceRuns;
if (performanceRuns < requiredPerformanceRuns) {
    usage(`--performance-runs must be at least ${requiredPerformanceRuns} for final proof.`);
}
const budgetStatus =
    budgetConfig.calibrationPolicy?.status === manifest.budget.requiredCalibrationStatus
        ? manifest.budget.requiredReceiptValue
        : "provisional";
const temporaryContextExists = fs.existsSync(path.join(root, manifest.temporaryContextPath));
const sections = [];
const failures = [];
const draftBlockers = [];

function usage(message) {
    if (message) console.error(message);
    console.error(
        "Usage: node scripts/run-final-proof.mjs (--live | --defer-live=<reason>) [--performance-runs=<count>]",
    );
    console.error("When omitted, --performance-runs defaults to docs/performance-budgets.json requiredSuccessfulRuns.");
    process.exit(2);
}

function runMake(target) {
    const startedAt = new Date().toISOString();
    const result = spawnSync("make", [target], {
        cwd: root,
        encoding: "utf8",
        stdio: "pipe",
        env: process.env,
    });
    const finishedAt = new Date().toISOString();
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd();
    const receipt = {
        command: `make ${target}`,
        startedAt,
        finishedAt,
        status: result.status,
        ok: result.status === 0,
        output,
    };
    if (result.status !== 0) failures.push(`make ${target} exited ${result.status}`);
    return receipt;
}

function fenced(text) {
    return `\`\`\`text\n${text || "(no output)"}\n\`\`\``;
}

function commandBlock(command) {
    return `\`\`\`bash\n${command}\n\`\`\``;
}

function receiptBlock(receipt) {
    return [
        `Started: ${receipt.startedAt}`,
        `Finished: ${receipt.finishedAt}`,
        `Exit status: ${receipt.status}`,
        `Result: ${receipt.ok ? "passed" : "failed"}`,
        "",
        fenced(receipt.output),
    ].join("\n");
}

function carriedRiskLine(reason) {
    return `- Owner: final proof operator; Reason: ${reason}; Closure gate: resolve before make final-proof-final.`;
}

function extractCleanupReceipt(output, requiredPrefixes = []) {
    let fallback;
    for (let start = output.indexOf("{"); start !== -1; start = output.indexOf("{", start + 1)) {
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let index = start; index < output.length; index += 1) {
            const char = output[index];
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (char === "\\") {
                    escaped = true;
                } else if (char === "\"") {
                    inString = false;
                }
                continue;
            }
            if (char === "\"") {
                inString = true;
                continue;
            }
            if (char === "{") depth += 1;
            if (char === "}") depth -= 1;
            if (depth === 0) {
                const candidate = output.slice(start, index + 1);
                try {
                    const parsed = JSON.parse(candidate);
                    if (
                        Array.isArray(parsed?.prefixes) &&
                        typeof parsed?.total === "number" &&
                        parsed?.leftovers &&
                        typeof parsed.leftovers === "object"
                    ) {
                        const missingPrefixes = requiredPrefixes.filter((prefix) => !parsed.prefixes.includes(prefix));
                        const receipt = {
                            parsed,
                            text: JSON.stringify(parsed, null, 2),
                            missingPrefixes,
                        };
                        if (missingPrefixes.length === 0) return receipt;
                        fallback ??= receipt;
                    }
                } catch {
                    break;
                }
                break;
            }
        }
    }
    return fallback;
}

const preflight = runMake("final-proof-preflight");
sections.push({
    title: "No-network preflight",
    body: [commandBlock("make final-proof-preflight"), receiptBlock(preflight)].join("\n\n"),
});

const artifactAudit = runMake("enterprise-audit");
sections.push({
    title: "Artifact audit",
    body: [commandBlock("make enterprise-audit"), receiptBlock(artifactAudit)].join("\n\n"),
});

const axiomsProof = runMake("axioms-contract");
sections.push({
    title: "Axioms contract proof",
    body: [commandBlock("make axioms-contract"), receiptBlock(axiomsProof)].join("\n\n"),
});

const fastProof = runMake("perfect-fast");
sections.push({
    title: "Deterministic local proof",
    body: [commandBlock("make perfect-fast"), receiptBlock(fastProof)].join("\n\n"),
});

const performanceReceipts = [];
for (let index = 0; index < performanceRuns; index += 1) {
    performanceReceipts.push(runMake("performance-receipt"));
}
sections.push({
    title: "Performance receipts",
    body: [
        `${manifest.budget.field} ${budgetStatus}`,
        "",
        "Commands:",
        "",
        commandBlock("make performance-receipt"),
        "",
        "Receipts:",
        "",
        ...performanceReceipts.map((receipt, index) => [
            `### Receipt ${index + 1}`,
            "",
            receiptBlock(receipt),
        ].join("\n")),
        "",
        "Budget tightening performed:",
        "",
        fenced(
            budgetStatus === manifest.budget.requiredReceiptValue
                ? `${manifest.budgetPath} calibrationPolicy.status is ${manifest.budget.requiredCalibrationStatus}.`
                : `NOT COMPLETE: ${manifest.budgetPath} calibrationPolicy.status is still provisional.`,
        ),
    ].join("\n"),
});

const fullProof = runMake("perfect-full");
sections.push({
    title: "Full generation and pack proof",
    body: [commandBlock("make perfect-full"), receiptBlock(fullProof)].join("\n\n"),
});

let liveBody;
if (live) {
    const liveProof = runMake("perfect-live");
    const requiredCleanupPrefixes = manifest.liveProof.completedCleanupRequiredPrefixes ?? [];
    const cleanupReceipt = extractCleanupReceipt(liveProof.output, requiredCleanupPrefixes);
    let liveProofStatus = "completed";
    if (!liveProof.ok) {
        liveProofStatus = "failed";
        failures.push("make perfect-live failed; live proof cannot be marked completed");
    }
    if (cleanupReceipt == null) {
        liveProofStatus = "failed";
        failures.push("make perfect-live did not emit assert-clean-prefixes cleanup JSON");
    } else {
        if (cleanupReceipt.parsed.total !== 0) {
            liveProofStatus = "failed";
            failures.push(`make perfect-live cleanup JSON reported ${cleanupReceipt.parsed.total} leftovers`);
        }
        if (cleanupReceipt.missingPrefixes.length > 0) {
            liveProofStatus = "failed";
            failures.push(
                `make perfect-live cleanup JSON is missing required prefixes: ${cleanupReceipt.missingPrefixes.join(", ")}`,
            );
        }
    }
    liveBody = [
        `${manifest.liveProof.field} ${liveProofStatus}`,
        manifest.liveProof.deferralReasonField,
        "",
        "Command:",
        "",
        commandBlock("make perfect-live"),
        "",
        "Result:",
        "",
        receiptBlock(liveProof),
        "",
        "Sandbox cleanup receipt:",
        "",
        fenced(
            cleanupReceipt?.text ??
                "NOT COMPLETE: make perfect-live output did not include cleanup JSON with prefixes, total, and leftovers.",
        ),
    ].join("\n");
} else {
    // Live proof status: deferred — the runner emits a draft block, marks the
    // receipt as deferred, and pushes a draft blocker that must be cleared
    // before final acceptance.
    draftBlockers.push(`live proof deferred: ${deferLiveReason}`);
    liveBody = [
        `${manifest.liveProof.field} deferred`,
        `${manifest.liveProof.deferralReasonField} ${deferLiveReason}`,
        "",
        "Command:",
        "",
        commandBlock("make perfect-live"),
        "",
        "Result:",
        "",
        fenced("NOT RUN: live proof was explicitly deferred."),
        "",
        "Sandbox cleanup receipt:",
        "",
        fenced("NOT RUN: no live objects were created by this proof runner."),
    ].join("\n");
}
sections.push({ title: "Live sandbox proof", body: liveBody });

sections.push({
    title: "Temporary context cleanup",
    body: [
        "Removed:",
        "",
        fenced(
            temporaryContextExists
                ? `NOT COMPLETE: ${manifest.temporaryContextPath} still exists.`
                : manifest.temporaryContextPath,
        ),
        "",
        "Final audit:",
        "",
        commandBlock("make enterprise-audit-final"),
        "",
        "Result:",
        "",
        fenced(
            [
                "NOT COMPLETE: final audit output cannot be generated by this runner in the same pass.",
                `After all previous receipt evidence is final, remove ${manifest.temporaryContextPath},`,
                "run make enterprise-audit-final manually, and paste the exact output here.",
            ].join("\n"),
        ),
    ].join("\n"),
});

draftBlockers.push("manual make enterprise-audit-final output must be pasted into the final receipt after temporary context removal");
if (temporaryContextExists) {
    draftBlockers.push(`${manifest.temporaryContextPath} still exists; remove it only after final proof evidence is complete`);
}

sections.push({
    title: "Residual risk",
    body:
        [...failures, ...draftBlockers].length > 0 || budgetStatus !== manifest.budget.requiredReceiptValue
            ? [
                  `${manifest.residualRisk.statusField} carried`,
                  ...[
                      ...failures,
                      ...draftBlockers,
                      ...(budgetStatus === manifest.budget.requiredReceiptValue
                          ? []
                          : ["performance budgets remain provisional"]),
                  ].map(carriedRiskLine),
              ].join("\n")
            : [
                  `${manifest.residualRisk.statusField} none`,
                  `- ${manifest.residualRisk.noneRequiredMarker}`,
              ].join("\n"),
});

const receipt = [
    "# Final Proof Receipt",
    "",
    "## Summary",
    "",
    `- Date: ${new Date().toISOString()}`,
    "- Operator: final proof runner",
    `- Branch or checkout: ${path.basename(root)}`,
    "- Goal: Implement enterprise SDK/CLI/MCP/OpenAPI hardening objective.",
    "",
    ...sections.flatMap((section) => [`## ${section.title}`, "", section.body, ""]),
].join("\n");

fs.writeFileSync(receiptPath, receipt);
console.log(`final proof receipt written to ${manifest.receiptPath}`);

if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
}

if (budgetStatus !== manifest.budget.requiredReceiptValue) {
    console.error(
        `performance budgets are still provisional; set calibrationPolicy.status to ${manifest.budget.requiredCalibrationStatus} after tightening ceilings.`,
    );
    process.exit(1);
}

if (draftBlockers.length > 0) {
    for (const blocker of draftBlockers) console.error(`draft blocker: ${blocker}`);
    console.error(`draft receipt written; run make final-proof-final only after resolving every draft blocker.`);
    process.exit(1);
}
