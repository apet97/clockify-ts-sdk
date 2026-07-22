function same(actual, expected) {
    return JSON.stringify(actual) === JSON.stringify(expected);
}

function requireEqual(failures, label, actual, expected) {
    if (!same(actual, expected)) failures.push(`${label}: must equal canonical remote-mutation proof record`);
}

function requireMarker(failures, label, text, marker) {
    if (typeof text !== "string" || !text.includes(marker)) {
        failures.push(`${label}: missing canonical evidence marker ${JSON.stringify(marker)}`);
    }
}

const RECEIPT_START = "<!-- task18-canonical-evidence:start -->";
const RECEIPT_END = "<!-- task18-canonical-evidence:end -->";

function countOccurrences(text, marker) {
    return typeof text === "string" ? text.split(marker).length - 1 : 0;
}

export function renderCanonicalReceiptEvidence(record) {
    const lines = [
        RECEIPT_START,
        "## Canonical live evidence",
        "",
        `- Proof commit: \`${record.proofCommit}\``,
        `- Workflow: \`${record.workflow.path}\` (\`${record.workflow.name}\`, \`${record.workflow.event}\`)`,
        `- Run: [${record.run.id}](${record.run.url}), attempt \`${record.run.attempt}\`, target \`${record.run.target}\`, conclusion \`${record.run.conclusion}\``,
        `- Aggregate job: \`${record.job.id}\`, \`${record.job.name}\`, attempt \`${record.job.attempt}\`, conclusion \`${record.job.conclusion}\``,
        `- Run timestamps: created \`${record.run.createdAt}\`; started \`${record.run.startedAt}\`; completed \`${record.run.completedAt}\``,
        `- Artifact: \`${record.artifact.id}\`, \`${record.artifact.name}\`, ${record.artifact.sizeBytes.toLocaleString("en-US")} bytes`,
        `- Artifact state: created \`${record.artifact.createdAt}\`; expires \`${record.artifact.expiresAt}\`; expired \`${record.artifact.expired}\` at verification`,
        `- Archive SHA-256: \`${record.artifact.archiveSha256}\``,
        `- Verified at: \`${record.verifiedAt}\``,
        `- Canonical no-local-mutation assertion: \`${record.noLocalMutationCommandRan}\`.`,
        "",
        "### Report SHA-256",
        "",
        "| Report path | SHA-256 |",
        "|---|---|",
    ];
    for (const reportPath of record.reportPaths) lines.push(`| \`${reportPath}\` | \`${record.artifact.reportSha256[reportPath]}\` |`);
    lines.push("", "### Scores", "", "| Package | Global score | Floor |", "|---|---:|---:|");
    for (const target of record.approvedTargets) {
        const measurement = record.measurements[target];
        lines.push(`| ${target} | ${measurement.global.score} | ${measurement.global.floor} |`);
    }
    lines.push("", "### Governed module scores/floors", "");
    for (const target of record.approvedTargets) {
        lines.push(`#### ${target}`);
        for (const [sourcePath, module] of Object.entries(record.measurements[target].modules)) {
            lines.push(`- \`${sourcePath}\`: ${module.score}/${module.floor}`);
        }
        lines.push("");
    }
    lines.push(RECEIPT_END);
    return lines.join("\n");
}

function validateVerifiedReceipt(failures, receipt, record) {
    const startCount = countOccurrences(receipt, RECEIPT_START);
    const endCount = countOccurrences(receipt, RECEIPT_END);
    if (startCount !== 1 || endCount !== 1) {
        failures.push("receipt: requires exactly one canonical evidence block");
        return;
    }
    const start = receipt.indexOf(RECEIPT_START);
    const end = receipt.indexOf(RECEIPT_END, start);
    const block = receipt.slice(start, end + RECEIPT_END.length);
    const expected = renderCanonicalReceiptEvidence(record);
    if (block !== expected) failures.push("receipt: canonical evidence block differs from the proof record");
    const outside = `${receipt.slice(0, start)}${receipt.slice(end + RECEIPT_END.length)}`;
    const forbiddenOutside = [
        "- Proof commit:", "- Workflow:", "- Run:", "- Aggregate job:", "- Run timestamps:", "- Artifact:",
        "- Artifact state:", "- Archive SHA-256:", "- Verified at:", "- Canonical no-local-mutation assertion:",
        "### Report SHA-256", "| Report path | SHA-256 |", "| wrapper |", "| mcp |", "| cli |", "- `wrapper/", "- `mcp/", "- `cli/",
    ];
    for (const reportPath of record.reportPaths) forbiddenOutside.push(reportPath);
    for (const digest of Object.values(record.artifact.reportSha256)) forbiddenOutside.push(digest);
    for (const marker of forbiddenOutside) {
        if (outside.includes(marker)) failures.push(`receipt: canonical evidence marker ${JSON.stringify(marker)} appears outside its block`);
    }
}

function pendingRisk(riskRegister) {
    return riskRegister?.risks?.find((risk) => risk?.id === "remote-mutation-proof-pending");
}

function validatePendingBindings({ record, roadmapStatus, receipt, roadmap, riskRegister }) {
    const failures = [];
    const aggregate = roadmapStatus?.remoteMutationProof;
    const task18 = roadmapStatus?.task18;
    if (aggregate?.status !== "pending-live-evidence" || aggregate?.aggregateApprovedTargetProofComplete !== false || aggregate?.aggregateProof !== null) {
        failures.push("roadmapStatus.remoteMutationProof: must be pending without aggregate proof");
    }
    if (task18?.status !== "implemented-awaiting-live-evidence" || task18?.aggregateProofRunId !== null || task18?.aggregateProofArtifactId !== null) {
        failures.push("roadmapStatus.task18: must be awaiting live evidence without aggregate identifiers");
    }
    if (typeof receipt !== "string" || !receipt.includes("Task 18 pending live evidence; no aggregate run, job, artifact, report, or score is recorded.")) {
        failures.push("receipt: must state the pending nonproof boundary");
    }
    if (receipt?.includes(RECEIPT_START) || receipt?.includes(RECEIPT_END) || /verified/i.test(receipt ?? "")) {
        failures.push("receipt: pending template must not contain verified canonical evidence");
    }
    if (typeof roadmap !== "string" || !roadmap.includes("Task 18 pending live evidence")) {
        failures.push("roadmap: must state Task 18 pending live evidence");
    }
    const risk = pendingRisk(riskRegister);
    if (risk?.status !== "open" || risk?.finalReadinessBlocking !== true || !risk?.summary?.includes("pending live evidence")) {
        failures.push("riskRegister.remote-mutation-proof-pending: must remain open and blocking pending live evidence");
    }
    return failures;
}

/**
 * Cross-binds every Task 18 duplicate to the one canonical proof record.
 * This is deliberately offline: it prevents a status/receipt substitution
 * from silently changing which previously live-verified run is claimed.
 */
export function validateRemoteMutationProofBindings({ record, roadmapStatus, receipt, roadmap, riskRegister }) {
    const failures = [];
    // The pending template deliberately carries no run/artifact/measurement
    // evidence. Its structural validity is checked by the record validator;
    // there is nothing truthful for a duplicate-evidence binding to compare.
    if (record?.status === "pending-live-evidence") return validatePendingBindings({ record, roadmapStatus, receipt, roadmap, riskRegister });
    if (record?.status !== "verified") return ["record.status: must be pending-live-evidence or verified"];

    const aggregate = roadmapStatus?.remoteMutationProof?.aggregateProof;
    const aggregateStatus = roadmapStatus?.remoteMutationProof;
    const task18 = roadmapStatus?.task18;
    if (aggregateStatus?.status !== "verified-aggregate-approved-target-proof-recorded" || aggregateStatus?.aggregateApprovedTargetProofComplete !== true) {
        failures.push("roadmapStatus.remoteMutationProof: must record verified aggregate approved-target proof completion");
    }
    if (aggregate == null || typeof aggregate !== "object") {
        failures.push("roadmapStatus.remoteMutationProof.aggregateProof: missing");
    } else {
        const expected = {
            record: "docs/remote-mutation-proof-contract.json",
            runUrl: record.run.url,
            runId: record.run.id,
            runAttempt: record.run.attempt,
            jobId: record.job.id,
            jobName: record.job.name,
            target: record.run.target,
            headSha: record.proofCommit,
            workflowPath: record.run.workflowPath,
            branch: record.branch,
            conclusion: record.run.conclusion,
            runCreatedAt: record.run.createdAt,
            runStartedAt: record.run.startedAt,
            runCompletedAt: record.run.completedAt,
            artifactId: record.artifact.id,
            artifactName: record.artifact.name,
            artifactSizeBytes: record.artifact.sizeBytes,
            artifactCreatedAt: record.artifact.createdAt,
            artifactExpiresAt: record.artifact.expiresAt,
            artifactExpired: record.artifact.expired,
            artifactSha256: record.artifact.archiveSha256,
            reportSha256: record.artifact.reportSha256,
            verifiedAt: record.verifiedAt,
        };
        for (const [field, value] of Object.entries(expected)) {
            requireEqual(failures, `roadmapStatus.remoteMutationProof.aggregateProof.${field}`, aggregate[field], value);
        }
    }
    if (task18 == null || typeof task18 !== "object") {
        failures.push("roadmapStatus.task18: missing");
    } else {
        requireEqual(failures, "roadmapStatus.task18.taskBase", task18.taskBase, record.proofCommit);
        requireEqual(failures, "roadmapStatus.task18.aggregateProofRunId", task18.aggregateProofRunId, record.run.id);
        requireEqual(failures, "roadmapStatus.task18.aggregateProofArtifactId", task18.aggregateProofArtifactId, record.artifact.id);
        requireEqual(failures, "roadmapStatus.task18.noLocalMutationCommandRan", task18.noLocalMutationCommandRan, record.noLocalMutationCommandRan);
        if (task18.requiredIndependentApprovals !== 2) failures.push("roadmapStatus.task18.requiredIndependentApprovals: must be 2");
        if (task18.status === "implemented-awaiting-independent-approvals") {
            if (task18.recordedIndependentApprovals !== 0) failures.push("roadmapStatus.task18: awaiting approval lifecycle must remain 0/2");
        } else if (task18.status === "complete") {
            if (task18.recordedIndependentApprovals !== 2) failures.push("roadmapStatus.task18: complete lifecycle requires 2/2 approvals");
            if (typeof task18.reviewedHead !== "string" || !/^[0-9a-f]{40}$/.test(task18.reviewedHead)) {
                failures.push("roadmapStatus.task18.reviewedHead: complete lifecycle requires a full SHA");
            }
            if (task18.reviewedRange !== `${task18.taskBase}..${task18.reviewedHead}`) {
                failures.push("roadmapStatus.task18.reviewedRange: complete lifecycle must span taskBase..reviewedHead");
            }
        } else {
            failures.push("roadmapStatus.task18.status: must be implemented-awaiting-independent-approvals or complete after verified proof");
        }
    }

    validateVerifiedReceipt(failures, receipt, record);
    for (const marker of ['GITHUB_TOKEN="$(gh auth token)" node scripts/verify-remote-mutation-proof.mjs', "ephemeral process environment", "does not print or persist"]) {
        requireMarker(failures, "receipt", receipt, marker);
    }

    for (const marker of [String(record.run.id), record.proofCommit, `target=${record.run.target}`, "remote-mutation-proof-pending` accepted"]) {
        requireMarker(failures, "roadmap", roadmap, marker);
    }
    const risk = pendingRisk(riskRegister);
    if (risk?.status !== "accepted" || risk?.finalReadinessBlocking !== false || !risk?.summary?.includes("accepted and non-blocking")) {
        failures.push("riskRegister.remote-mutation-proof-pending: must be accepted and non-blocking after verified evidence");
    }
    return failures;
}
