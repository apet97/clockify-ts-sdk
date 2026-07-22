const task3Contract = Object.freeze({
    status: "complete",
    lifecycleState: "complete",
    requiredIndependentApprovals: 2,
    recordedIndependentApprovals: 2,
    reviewedHead: "af5cbdc90c0459c5124a8cbc80734ae2f7fe3777",
    reviewedRange:
        "0f96f4472293fad07b3556a622d8cce7aff62626..af5cbdc90c0459c5124a8cbc80734ae2f7fe3777",
    upstreamReviewedRange: "a246a6f..bf8f72814c6fe7044bd78b86b27674ef1eb2a666",
    approvalResult:
        "Two independent reviewers approved both the upstream and downstream frozen ranges with no blocking findings.",
    receipt: "docs/roadmap-1.0-receipts/task-03-expense-update-schema.md",
    upstreamCommit: "bf8f72814c6fe7044bd78b86b27674ef1eb2a666",
    downstreamReviewedRange:
        "0f96f4472293fad07b3556a622d8cce7aff62626..db0111413306683fbf6fa33cbf3723e2ff006512",
    downstreamReviewedHead: "db0111413306683fbf6fa33cbf3723e2ff006512",
    downstreamImplementationState: "complete",
    openApiChanged: true,
    openApiTruthChange:
        "ExpenseUpdateRequest.file is optional; ExpenseCreateRequest.required remains amount, categoryId, date, userId.",
});

const task15Contract = Object.freeze({
    status: "complete",
    receipt: "docs/roadmap-1.0-receipts/task-15-wrapper-replacement-mutation.md",
    taskBase: "afdcac212def82209fbc3a0dfb1e92ab6e5e6eee",
    finalImplementationCommit: "e65ec4da4c11a1e2d1bd91ac13a73f19908c4343",
    requiredIndependentApprovals: 2,
    recordedIndependentApprovals: 2,
    reviewedHead: "ed8baa188e88ed65faf24a49374491cf373aa9b2",
    reviewedRange:
        "afdcac212def82209fbc3a0dfb1e92ab6e5e6eee..ed8baa188e88ed65faf24a49374491cf373aa9b2",
    approvalResult:
        "Two independent reviewers approved the corrected frozen range with no remaining Critical, Important, or Minor findings.",
    closeoutCommitPolicy:
        "The commit that records these approvals is evidence-only and is not part of the substantive reviewed implementation range.",
    wrapperGlobalFloor: 82,
    replacementModuleFloors: {
        "wrapper/ensure.ts": 94,
        "wrapper/invoice-body.ts": 93,
    },
});

const task16Contract = Object.freeze({
    status: "complete",
    receipt: "docs/roadmap-1.0-receipts/task-16-mcp-mutation.md",
    taskBase: "96b674539d2fd286456cf44c5fc7433f87fc3d6d",
    focusedTestCommit: "803164268f798aa88fcc9d7ada8dd7a6167bb568",
    floorRatchetCommit: "56b7cbba149b5a4bf9477e7aeb6036167aedd87d",
    finalImplementationCommit: "56b7cbba149b5a4bf9477e7aeb6036167aedd87d",
    requiredIndependentApprovals: 2,
    recordedIndependentApprovals: 2,
    reviewedHead: "a9e02532c1e6327bc3c5cdbb1ace158716ea1354",
    reviewedRange: "96b674539d2fd286456cf44c5fc7433f87fc3d6d..a9e02532c1e6327bc3c5cdbb1ace158716ea1354",
    approvalResult: "Two independent reviewers approved the corrected frozen range with no remaining Critical, Important, or Minor findings.",
    closeoutCommitPolicy: "The commit that records these approvals is evidence-only and is not part of the substantive reviewed implementation range.",
    mcpGlobalFloor: 85,
    mcpSafetyModuleFloors: {
        "mcp/src/orchestration/confirmation.ts": 86,
        "mcp/src/result.ts": 85,
        "mcp/src/tool-risk.ts": 90,
    },
    positiveMutationSources: [
        "mcp/src/orchestration/confirmation.ts",
        "mcp/src/result.ts",
        "mcp/src/tool-risk.ts",
    ],
    remoteProof: {
        runUrl: "https://github.com/apet97/clockify-ts-sdk/actions/runs/29909385573",
        runId: 29909385573,
        runAttempt: 1,
        target: "mcp",
        branch: "codex/clockify-1-0-truth",
        headSha: "56b7cbba149b5a4bf9477e7aeb6036167aedd87d",
        conclusion: "success",
        jobId: 88888400468,
        jobStartedAt: "2026-07-22T09:47:50Z",
        jobCompletedAt: "2026-07-22T09:49:25Z",
        artifactId: 8525238264,
        artifactName: "mutation-reports-mcp-1",
        artifactSizeBytes: 28152,
        artifactCreatedAt: "2026-07-22T09:49:23Z",
        retentionDays: 14,
        expiresAt: "2026-08-05T09:49:23Z",
        expired: false,
        downloadedReportSizeBytes: 205751,
        downloadedReportSha256: "2e02418aa787b8e567f6110389d23eed0150fb6d121fdb63071c528263d85c1b",
        coveredMutationScore: 85.76388888888889,
        measurements: {
            global: {
                noCoverage: 7,
                killed: 247,
                survived: 41,
                timeout: 0,
                ignored: 0,
                covered: 288,
                passing: 247,
                score: 85.76388888888889,
                floor: 85,
            },
            modules: {
                "mcp/src/orchestration/confirmation.ts": {
                    noCoverage: 6,
                    killed: 76,
                    survived: 12,
                    timeout: 0,
                    ignored: 0,
                    covered: 88,
                    passing: 76,
                    score: 86.36363636363636,
                    floor: 86,
                },
                "mcp/src/result.ts": {
                    noCoverage: 1,
                    killed: 153,
                    survived: 27,
                    timeout: 0,
                    ignored: 0,
                    covered: 180,
                    passing: 153,
                    score: 85,
                    floor: 85,
                },
                "mcp/src/tool-risk.ts": {
                    noCoverage: 0,
                    killed: 18,
                    survived: 2,
                    timeout: 0,
                    ignored: 0,
                    covered: 20,
                    passing: 18,
                    score: 90,
                    floor: 90,
                },
            },
        },
    },
});

const task17Contract = Object.freeze({
    status: "complete",
    receipt: "docs/roadmap-1.0-receipts/task-17-cli-mutation.md",
    taskBase: "37c3138a0fa66b7626572972c1fdad2efc44b06c",
    focusedTestCommit: "fe6d4cda88f6cd7d97a11c9c9ce4f4178a978ed2",
    floorRatchetCommit: "9dfc3bfa0c204cc3118efba9eea15f109cf0874b",
    finalImplementationCommit: "9dfc3bfa0c204cc3118efba9eea15f109cf0874b",
    positiveMutationSources: [
        "cli/src/commands/leaf-command.ts",
        "cli/src/commands/resolve-refs.ts",
        "cli/src/receipt.ts",
    ],
    pinnedTests: [
        "cli/tests/command-risk.test.ts",
        "cli/tests/mutation-leaves.test.ts",
        "cli/tests/receipt.test.ts",
        "cli/tests/resolve-refs.test.ts",
    ],
    globalFloor: 96,
    moduleFloors: {
        "cli/src/commands/leaf-command.ts": 95,
        "cli/src/commands/resolve-refs.ts": 95,
        "cli/src/receipt.ts": 100,
    },
    remoteProofRecorded: true,
    requiredIndependentApprovals: 2,
    recordedIndependentApprovals: 2,
    reviewedHead: "3fdf27913470b09a79149fc4e2518e7837164c90",
    reviewedRange: "37c3138a0fa66b7626572972c1fdad2efc44b06c..3fdf27913470b09a79149fc4e2518e7837164c90",
    approvalResult: "Two independent reviewers approved the corrected frozen range with no remaining Critical, Important, or Minor findings.",
    closeoutCommitPolicy: "The commit that records these approvals is evidence-only and is not part of the substantive reviewed implementation range.",
    next: "Task 17 is complete; Task 18 has aggregate proof and awaits its own independent approvals.",
    calibrationRun: {
        runId: 29912033512,
        target: "cli",
        headSha: "35256b9530dc75a6ac3575e8844118620fe24e61",
        artifactId: 8526287362,
        artifactName: "mutation-reports-cli-1",
        downloadedReportSha256: "1b5b88ed04ef98bf68534527e409c8e9c1b882da436d716d38be69517954f87f",
        authority: "calibration-only",
    },
    remoteMeasurement: {
        runUrl: "https://github.com/apet97/clockify-ts-sdk/actions/runs/29912616222",
        runId: 29912616222,
        runAttempt: 1,
        target: "cli",
        headSha: "fe6d4cda88f6cd7d97a11c9c9ce4f4178a978ed2",
        conclusion: "success",
        jobId: 88898887959,
        jobStartedAt: "2026-07-22T10:37:30Z",
        jobCompletedAt: "2026-07-22T10:38:24Z",
        artifactId: 8526521499,
        artifactName: "mutation-reports-cli-1",
        artifactSizeBytes: 18074,
        artifactCreatedAt: "2026-07-22T10:38:21Z",
        expiresAt: "2026-08-05T10:38:21Z",
        expired: false,
        downloadedReportSizeBytes: 123286,
        downloadedReportSha256: "c7f86dac902c29d3ed746f592178e801625421ca67b3a1af67b8e4436ba0f1b1",
        measurements: {
            global: {
                noCoverage: 4,
                killed: 121,
                survived: 5,
                timeout: 0,
                ignored: 0,
                covered: 126,
                passing: 121,
                score: 96.03174603174604,
                floor: 96,
            },
            modules: {
                "cli/src/commands/leaf-command.ts": {
                    noCoverage: 2,
                    killed: 47,
                    survived: 2,
                    timeout: 0,
                    ignored: 0,
                    covered: 49,
                    passing: 47,
                    score: 95.91836734693877,
                    floor: 95,
                },
                "cli/src/commands/resolve-refs.ts": {
                    noCoverage: 2,
                    killed: 57,
                    survived: 3,
                    timeout: 0,
                    ignored: 0,
                    covered: 60,
                    passing: 57,
                    score: 95,
                    floor: 95,
                },
                "cli/src/receipt.ts": {
                    noCoverage: 0,
                    killed: 17,
                    survived: 0,
                    timeout: 0,
                    ignored: 0,
                    covered: 17,
                    passing: 17,
                    score: 100,
                    floor: 100,
                },
            },
        },
    },
    remoteProof: {
        runUrl: "https://github.com/apet97/clockify-ts-sdk/actions/runs/29913220026",
        runId: 29913220026,
        runAttempt: 1,
        target: "cli",
        branch: "codex/clockify-1-0-truth",
        headSha: "9dfc3bfa0c204cc3118efba9eea15f109cf0874b",
        conclusion: "success",
        jobId: 88900864671,
        jobStartedAt: "2026-07-22T10:47:03Z",
        jobCompletedAt: "2026-07-22T10:48:03Z",
        artifactId: 8526772929,
        artifactName: "mutation-reports-cli-1",
        artifactSizeBytes: 18058,
        artifactCreatedAt: "2026-07-22T10:47:59Z",
        expiresAt: "2026-08-05T10:47:58Z",
        expired: false,
        downloadedReportSizeBytes: 123286,
        downloadedReportSha256: "5b9422e3ff3f77dc6abe39a1ab1ae082923eb70f11ea1efcedf9fb300dee5be8",
        historyRevisionsChecked: 26,
        measurements: {
            global: {
                noCoverage: 4,
                killed: 121,
                survived: 5,
                timeout: 0,
                ignored: 0,
                covered: 126,
                passing: 121,
                score: 96.03174603174604,
                floor: 96,
            },
            modules: {
                "cli/src/commands/leaf-command.ts": {
                    noCoverage: 2,
                    killed: 47,
                    survived: 2,
                    timeout: 0,
                    ignored: 0,
                    covered: 49,
                    passing: 47,
                    score: 95.91836734693877,
                    floor: 95,
                },
                "cli/src/commands/resolve-refs.ts": {
                    noCoverage: 2,
                    killed: 57,
                    survived: 3,
                    timeout: 0,
                    ignored: 0,
                    covered: 60,
                    passing: 57,
                    score: 95,
                    floor: 95,
                },
                "cli/src/receipt.ts": {
                    noCoverage: 0,
                    killed: 17,
                    survived: 0,
                    timeout: 0,
                    ignored: 0,
                    covered: 17,
                    passing: 17,
                    score: 100,
                    floor: 100,
                },
            },
        },
    },
});

const remoteMutationProofContract = Object.freeze({
    status: "verified-aggregate-approved-target-proof-recorded",
    currentTargets: ["all", "wrapper", "mcp", "cli"],
    retainedRuns: [
        {
            task: 14,
            scope: "wrapper-authentication",
            runUrl: "https://github.com/apet97/clockify-ts-sdk/actions/runs/29890732492",
            headSha: "af35cf59800f401d04fd293480ae1a06ab3e055c",
            artifactName: "mutation-reports-wrapper-1",
        },
        {
            task: 15,
            scope: "wrapper-replacement",
            runUrl: "https://github.com/apet97/clockify-ts-sdk/actions/runs/29900533134",
            headSha: "e65ec4da4c11a1e2d1bd91ac13a73f19908c4343",
            artifactName: "mutation-reports-wrapper-1",
        },
        {
            task: 16,
            scope: "mcp-safety",
            runUrl: "https://github.com/apet97/clockify-ts-sdk/actions/runs/29909385573",
            headSha: "56b7cbba149b5a4bf9477e7aeb6036167aedd87d",
            artifactName: "mutation-reports-mcp-1",
        },
        {
            task: 17,
            scope: "cli-command-safety",
            runUrl: "https://github.com/apet97/clockify-ts-sdk/actions/runs/29913220026",
            headSha: "9dfc3bfa0c204cc3118efba9eea15f109cf0874b",
            artifactName: "mutation-reports-cli-1",
        },
    ],
    aggregateApprovedTargetProofComplete: true,
    aggregateProof: {
        record: "docs/remote-mutation-proof-contract.json",
        runUrl: "https://github.com/apet97/clockify-ts-sdk/actions/runs/29914969280",
        runId: 29914969280,
        runAttempt: 1,
        jobId: 88906585019,
        jobName: "Stryker mutation (all)",
        target: "all",
        headSha: "1f3e4de98ebd6445dde5280c23ce825f0719cfb3",
        workflowPath: ".github/workflows/mutation.yml",
        branch: "codex/clockify-1-0-truth",
        conclusion: "success",
        runCreatedAt: "2026-07-22T11:14:45Z",
        runStartedAt: "2026-07-22T11:14:45Z",
        runCompletedAt: "2026-07-22T12:02:19Z",
        artifactId: 8528690403,
        artifactName: "mutation-reports-all-1",
        artifactSizeBytes: 247047,
        artifactCreatedAt: "2026-07-22T12:02:15Z",
        artifactExpiresAt: "2026-08-05T12:02:14Z",
        artifactExpired: false,
        artifactSha256: "877a785c5f79a57e9449315dc527f0336d3198d898c4acf078f3463903e864ae",
        reportSha256: {
            "wrapper/reports/mutation/mutation.json": "aa7522e2ac00296dbe61ffa3b11361c6b0b6c14dd63725d796043eb3e393a418",
            "mcp/reports/mutation/mutation.json": "a13c0d015e1ad0f64852e8c99b9ff8528e748ed4aa6a3c8f7ab2571643424bcf",
            "cli/reports/mutation/mutation.json": "4dc192a3accc90c7d0eb58efea2edfb8b1a3ac8966641a3a96c5c861d0c5bb9d",
        },
        verifiedAt: "2026-07-22T12:03:07Z",
    },
});

const task18Contract = Object.freeze({
    status: "complete",
    receipt: "docs/roadmap-1.0-receipts/task-18-remote-mutation.md",
    taskBase: "1f3e4de98ebd6445dde5280c23ce825f0719cfb3",
    proofRecord: "docs/remote-mutation-proof-contract.json",
    requiredIndependentApprovals: 2,
    recordedIndependentApprovals: 2,
    aggregateProofRunId: 29914969280,
    aggregateProofArtifactId: 8528690403,
    noLocalMutationCommandRan: true,
    reviewedHead: "f6e86cc369dac2b2b210b9fa36dd748780cd28b2",
    reviewedRange: "1f3e4de98ebd6445dde5280c23ce825f0719cfb3..f6e86cc369dac2b2b210b9fa36dd748780cd28b2",
    approvalResult: "Two independent reviewers approved the corrected frozen range with no remaining Critical, Important, or Minor findings.",
    closeoutCommitPolicy: "The commit that records these approvals is evidence-only and is not part of the substantive reviewed implementation range.",
    next: "Task 18 is complete; this approval closeout does not close Task 1 or the roadmap.",
});

const task19Contract = Object.freeze({
    status: "complete",
    receipt: "docs/roadmap-1.0-receipts/task-19-aggregate-gates.md",
    taskBase: "2a31932b65e2ec94d5b29aac85dd4004b6ec7538",
    aggregateContract: "docs/aggregate-gates-contract.json",
    canonicalVerifyPlan: "scripts/lib/verify-plan.mjs",
    executionCounts: {
        perfectFast: 31,
        perfectFull: 45,
        contractGates: 89,
    },
    duplicateRemovals: ["generator-comparison", "mutation-ci"],
    performanceLast: ["perfect-fast", "perfect-full"],
    standaloneVerifyExactlyOnce: ["generator-comparison", "mutation-ci"],
    noLocalMutationCommandRan: true,
    contractGatesExit: 0,
    perfectFastExit: 0,
    perfectFullExit: 0,
    requiredIndependentApprovals: 2,
    recordedIndependentApprovals: 2,
    reviewedHead: "17d6c55e896620d4240e374f8c8653739a341d7a",
    reviewedRange:
        "2a31932b65e2ec94d5b29aac85dd4004b6ec7538..17d6c55e896620d4240e374f8c8653739a341d7a",
    approvalResult:
        "Two independent reviewers approved specification compliance and code quality for the corrected frozen range with no remaining findings.",
    closeoutCommitPolicy:
        "The commit that records these approvals is evidence-only and is not part of the substantive reviewed implementation range.",
    next: "Task 19 is complete; Task 20 may start. Task 1 and the roadmap remain open.",
});

function sameValue(actual, expected) {
    return JSON.stringify(actual) === JSON.stringify(expected);
}

export function validateRoadmapTask3Status(roadmapStatus, proofRecord = null) {
    if (
        roadmapStatus?.task3 == null ||
        typeof roadmapStatus.task3 !== "object" ||
        Array.isArray(roadmapStatus.task3)
    ) {
        return ["task3: missing machine-readable Task 3 status"];
    }

    const failures = [];
    for (const [field, expected] of Object.entries(task3Contract)) {
        const actual = roadmapStatus.task3[field];
        if (!sameValue(actual, expected)) {
            failures.push(
                `task3.${field}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
            );
        }
    }
    if (
        roadmapStatus.task15 == null ||
        typeof roadmapStatus.task15 !== "object" ||
        Array.isArray(roadmapStatus.task15)
    ) {
        failures.push("task15: missing machine-readable Task 15 status");
    } else {
        for (const [field, expected] of Object.entries(task15Contract)) {
            const actual = roadmapStatus.task15[field];
            if (!sameValue(actual, expected)) {
                failures.push(
                    `task15.${field}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
                );
            }
        }
    }
    if (
        roadmapStatus.task16 == null ||
        typeof roadmapStatus.task16 !== "object" ||
        Array.isArray(roadmapStatus.task16)
    ) {
        failures.push("task16: missing machine-readable Task 16 status");
    } else {
        for (const [field, expected] of Object.entries(task16Contract)) {
            const actual = roadmapStatus.task16[field];
            if (!sameValue(actual, expected)) {
                failures.push(
                    `task16.${field}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
                );
            }
        }
    }
    if (
        roadmapStatus.task17 == null ||
        typeof roadmapStatus.task17 !== "object" ||
        Array.isArray(roadmapStatus.task17)
    ) {
        failures.push("task17: missing machine-readable Task 17 calibration status");
    } else {
        for (const [field, expected] of Object.entries(task17Contract)) {
            const actual = roadmapStatus.task17[field];
            if (!sameValue(actual, expected)) {
                failures.push(
                    `task17.${field}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
                );
            }
        }
    }
    if (
        roadmapStatus.remoteMutationProof == null ||
        typeof roadmapStatus.remoteMutationProof !== "object" ||
        Array.isArray(roadmapStatus.remoteMutationProof)
    ) {
        failures.push("remoteMutationProof: missing machine-readable remote mutation proof status");
        return failures;
    }
    for (const [field, expected] of Object.entries(remoteMutationProofContract)) {
        const actual = roadmapStatus.remoteMutationProof[field];
        if (!sameValue(actual, expected)) {
            failures.push(
                `remoteMutationProof.${field}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
            );
        }
    }
    if (roadmapStatus.task18 == null || typeof roadmapStatus.task18 !== "object" || Array.isArray(roadmapStatus.task18)) {
        failures.push("task18: missing machine-readable Task 18 status");
    } else {
        for (const [field, expected] of Object.entries(task18Contract)) {
            const actual = roadmapStatus.task18[field];
            if (!sameValue(actual, expected)) {
                failures.push(`task18.${field}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
            }
        }
    }
    if (roadmapStatus.task19 == null || typeof roadmapStatus.task19 !== "object" || Array.isArray(roadmapStatus.task19)) {
        failures.push("task19: missing machine-readable Task 19 status");
    } else {
        for (const [field, expected] of Object.entries(task19Contract)) {
            const actual = roadmapStatus.task19[field];
            if (!sameValue(actual, expected)) {
                failures.push(`task19.${field}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
            }
        }
    }
    if (proofRecord != null) {
        const aggregate = roadmapStatus.remoteMutationProof?.aggregateProof;
        const expected = {
            runId: proofRecord.run?.id,
            runAttempt: proofRecord.run?.attempt,
            jobId: proofRecord.job?.id,
            jobName: proofRecord.job?.name,
            target: proofRecord.run?.target,
            headSha: proofRecord.proofCommit,
            artifactId: proofRecord.artifact?.id,
            artifactName: proofRecord.artifact?.name,
            artifactSizeBytes: proofRecord.artifact?.sizeBytes,
            artifactSha256: proofRecord.artifact?.archiveSha256,
            reportSha256: proofRecord.artifact?.reportSha256,
            verifiedAt: proofRecord.verifiedAt,
        };
        for (const [field, value] of Object.entries(expected)) {
            if (!sameValue(aggregate?.[field], value)) failures.push(`remoteMutationProof.aggregateProof.${field}: must equal proof record`);
        }
        if (!sameValue(roadmapStatus.task18?.taskBase, proofRecord.proofCommit)) failures.push("task18.taskBase: must equal proof record");
    }
    return failures;
}
