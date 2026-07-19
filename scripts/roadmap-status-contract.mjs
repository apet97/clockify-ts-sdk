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

export function validateRoadmapTask3Status(roadmapStatus) {
    if (roadmapStatus?.task3 == null || typeof roadmapStatus.task3 !== "object" || Array.isArray(roadmapStatus.task3)) {
        return ["task3: missing machine-readable Task 3 status"];
    }

    const failures = [];
    for (const [field, expected] of Object.entries(task3Contract)) {
        const actual = roadmapStatus.task3[field];
        if (actual !== expected) {
            failures.push(`task3.${field}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
        }
    }
    return failures;
}
