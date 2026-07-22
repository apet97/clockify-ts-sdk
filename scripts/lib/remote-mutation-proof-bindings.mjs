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

/**
 * Cross-binds every Task 18 duplicate to the one canonical proof record.
 * This is deliberately offline: it prevents a status/receipt substitution
 * from silently changing which previously live-verified run is claimed.
 */
export function validateRemoteMutationProofBindings({ record, roadmapStatus, receipt, roadmap }) {
    const failures = [];
    // The pending template deliberately carries no run/artifact/measurement
    // evidence. Its structural validity is checked by the record validator;
    // there is nothing truthful for a duplicate-evidence binding to compare.
    if (record?.status === "pending-live-evidence") return failures;
    if (record?.status !== "verified") return ["record.status: must be pending-live-evidence or verified"];

    const aggregate = roadmapStatus?.remoteMutationProof?.aggregateProof;
    const task18 = roadmapStatus?.task18;
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
    }

    const receiptMarkers = [
        record.proofCommit,
        record.run.url,
        `attempt \`${record.run.attempt}\``,
        `target \`${record.run.target}\``,
        `Aggregate job: \`${record.job.id}\`, \`${record.job.name}\``,
        record.run.createdAt,
        record.run.startedAt,
        record.run.completedAt,
        `Artifact \`${record.artifact.id}\`, \`${record.artifact.name}\`, ${record.artifact.sizeBytes.toLocaleString("en-US")} bytes`,
        record.artifact.createdAt,
        record.artifact.expiresAt,
        `expired \`${record.artifact.expired}\` at verification`,
        record.artifact.archiveSha256,
        record.verifiedAt,
        `Canonical no-local-mutation assertion: \`${record.noLocalMutationCommandRan}\`.`,
        'GITHUB_TOKEN="$(gh auth token)" node scripts/verify-remote-mutation-proof.mjs',
        "ephemeral process environment",
        "does not print or persist",
    ];
    for (const [reportPath, digest] of Object.entries(record.artifact.reportSha256)) {
        receiptMarkers.push(reportPath, digest);
    }
    for (const target of record.approvedTargets) {
        const measurement = record.measurements[target];
        receiptMarkers.push(`| ${target} | ${measurement.global.score} | ${measurement.global.floor} |`);
        for (const [sourcePath, module] of Object.entries(measurement.modules)) {
            const label = sourcePath.split("/").at(-1).replace(/\.ts$/, "");
            receiptMarkers.push(`\`${label}\` ${module.score}/${module.floor}`);
        }
    }
    for (const marker of receiptMarkers) requireMarker(failures, "receipt", receipt, marker);

    for (const marker of [String(record.run.id), record.proofCommit, `target=${record.run.target}`, "remote-mutation-proof-pending` accepted"]) {
        requireMarker(failures, "roadmap", roadmap, marker);
    }
    return failures;
}
