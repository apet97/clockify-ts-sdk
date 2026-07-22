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
    if (record?.status !== "verified") return ["record.status: verified proof is required before duplicate evidence can bind"];

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
        record.artifact.archiveSha256,
        record.verifiedAt,
        'GITHUB_TOKEN="$(gh auth token)" node scripts/verify-remote-mutation-proof.mjs',
        "ephemeral process environment",
        "does not print or persist",
    ];
    for (const [reportPath, digest] of Object.entries(record.artifact.reportSha256)) {
        receiptMarkers.push(reportPath, digest);
    }
    for (const marker of receiptMarkers) requireMarker(failures, "receipt", receipt, marker);

    for (const marker of [String(record.run.id), record.proofCommit, `target=${record.run.target}`, "remote-mutation-proof-pending` accepted"]) {
        requireMarker(failures, "roadmap", roadmap, marker);
    }
    return failures;
}
