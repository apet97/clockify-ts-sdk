const task3Contract = Object.freeze({
    status: "implemented",
    receipt: "docs/roadmap-1.0-receipts/task-03-expense-update-schema.md",
    upstreamCommit: "bf8f72814c6fe7044bd78b86b27674ef1eb2a666",
    downstreamReviewedRange:
        "0f96f4472293fad07b3556a622d8cce7aff62626..db0111413306683fbf6fa33cbf3723e2ff006512",
    downstreamReviewedHead: "db0111413306683fbf6fa33cbf3723e2ff006512",
    downstreamImplementationState: "implemented",
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
    status: "implemented-awaiting-github-calibration",
    taskBase: "37c3138a0fa66b7626572972c1fdad2efc44b06c",
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
    globalFloor: 0,
    globalCalibrationPending: true,
    moduleFloors: {
        "cli/src/commands/leaf-command.ts": 0,
        "cli/src/commands/resolve-refs.ts": 0,
        "cli/src/receipt.ts": 0,
    },
    calibrationPending: [
        "cli/src/commands/leaf-command.ts",
        "cli/src/commands/resolve-refs.ts",
        "cli/src/receipt.ts",
    ],
    remoteProofRecorded: false,
    requiredIndependentApprovals: 2,
    recordedIndependentApprovals: 0,
    next: "Controller must push this calibration-ready scope and dispatch Mutation target=cli; measured floors, receipt, approvals, and Task 18 aggregate proof remain pending.",
});

const remoteMutationProofContract = Object.freeze({
    status: "partial-wrapper-and-mcp-individual-proofs-recorded-cli-calibration-pending-and-aggregate-approved-target-proof-incomplete",
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
    ],
    aggregateApprovedTargetProofComplete: false,
});

function sameValue(actual, expected) {
    return JSON.stringify(actual) === JSON.stringify(expected);
}

export function validateRoadmapTask3Status(roadmapStatus) {
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
    return failures;
}
