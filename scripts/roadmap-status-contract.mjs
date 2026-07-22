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
    status: "implemented-awaiting-independent-approvals",
    receipt: "docs/roadmap-1.0-receipts/task-15-wrapper-replacement-mutation.md",
    taskBase: "afdcac212def82209fbc3a0dfb1e92ab6e5e6eee",
    finalImplementationCommit: "e65ec4da4c11a1e2d1bd91ac13a73f19908c4343",
    requiredIndependentApprovals: 2,
    recordedIndependentApprovals: 0,
    reviewedHead: null,
    reviewedRange: null,
    wrapperGlobalFloor: 82,
    replacementModuleFloors: {
        "wrapper/ensure.ts": 94,
        "wrapper/invoice-body.ts": 93,
    },
});

const remoteMutationProofContract = Object.freeze({
    status: "partial-wrapper-authentication-and-replacement-proofs-recorded-aggregate-approved-target-proof-incomplete",
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
