import assert from "node:assert/strict";
import test from "node:test";

import { validatePlanLifecycle } from "./lib/plan-lifecycle-contract.mjs";

function fixture() {
    return {
        contract: {
            states: ["pending", "in_progress", "implemented", "evidence_captured", "complete", "archived"],
            transitions: {
                pending: ["in_progress", "implemented"],
                in_progress: ["implemented"],
                implemented: ["evidence_captured"],
                evidence_captured: ["complete"],
                complete: ["archived"],
                archived: [],
            },
            receiptRoot: "docs/roadmap-1.0-receipts",
            successfulClosureResult: "exit 0",
            task1ApprovalPolicy: {
                rangeStart: "ec68c61",
                initialImplementationCommit: "e0f44a40de3059c9c2618f56440c0b428702361c",
                minimumApprovals: 2,
                reviewModel: "pre_close_range_evidence_only_closeout",
                dependencySemantics: "final_release_acceptance_blocker",
            },
            evidenceOnlyCloseout: {
                allowedPathsByTask: {
                    1: [
                        "docs/roadmap-1.0-receipts/task-01-approvals.md",
                        "docs/roadmap-1.0.md",
                        "docs/roadmap-1.0-status.json",
                        "docs/risk-register.json",
                    ],
                },
            },
        },
        tasks: [
            {
                id: 1,
                state: "implemented",
                dependsOn: [],
                receipt: null,
                closureCommand: "make first",
                closureResult: null,
                remainingBlockers: ["two independent approvals"],
                requiredIndependentApprovals: 2,
                recordedIndependentApprovals: 0,
            },
            {
                id: 2,
                state: "pending",
                dependsOn: [1],
                dependencyMode: "final_acceptance",
                receipt: null,
                closureCommand: "make second",
                closureResult: null,
                remainingBlockers: ["implementation and closure evidence"],
                requiredIndependentApprovals: 0,
                recordedIndependentApprovals: 0,
            },
        ],
        files: new Set(),
    };
}

test("accepts the closed lifecycle vocabulary and rejects an unknown state", () => {
    const valid = fixture();
    assert.deepEqual(validatePlanLifecycle(valid), []);

    const invalid = fixture();
    invalid.tasks[1].state = "done";
    assert.match(validatePlanLifecycle(invalid).join("\n"), /task 2 state.*unknown/i);
});

test("rejects a lifecycle transition that skips evidence capture", () => {
    const invalid = fixture();
    invalid.contract.transitions.implemented = ["complete"];
    assert.match(validatePlanLifecycle(invalid).join("\n"), /transition.*implemented.*complete.*not allowed/i);
});

test("rejects duplicate task ids and self, missing, cyclic, or incomplete dependencies", () => {
    const duplicate = fixture();
    duplicate.tasks[1].id = 1;
    assert.match(validatePlanLifecycle(duplicate).join("\n"), /duplicate task id 1/i);

    const self = fixture();
    self.tasks[1].dependsOn = [2];
    assert.match(validatePlanLifecycle(self).join("\n"), /task 2 dependency.*itself/i);

    const missing = fixture();
    missing.tasks[1].dependsOn = [99];
    assert.match(validatePlanLifecycle(missing).join("\n"), /task 2 dependency 99.*missing/i);

    const cyclic = fixture();
    cyclic.tasks[0].dependsOn = [2];
    assert.match(validatePlanLifecycle(cyclic).join("\n"), /dependency cycle.*1.*2/i);

    const incomplete = fixture();
    incomplete.tasks[1].state = "implemented";
    incomplete.tasks[1].dependencyMode = "execution";
    assert.match(
        validatePlanLifecycle(incomplete).join("\n"),
        /task 2 dependency 1.*receipt.*closure result/i,
    );
});

function completedFixture() {
    const value = fixture();
    const task = value.tasks[0];
    task.state = "complete";
    task.receipt = "docs/roadmap-1.0-receipts/task-01-baseline.md";
    task.closureResult = "exit 0";
    task.remainingBlockers = [];
    task.recordedIndependentApprovals = 2;
    value.files.add(task.receipt);
    value.task1ApprovalRecord = validTask1Approval(task.receipt);
    value.closeout = validTask1Closeout(value.task1ApprovalRecord);
    value.gitEvidence = validGitEvidence(value.task1ApprovalRecord);
    return value;
}

test("rejects complete without every closure and independent-approval condition", () => {
    for (const [field, value, expected] of [
        ["receipt", null, /task 1 complete.*tracked receipt/i],
        ["closureCommand", "", /task 1 complete.*exact closure command/i],
        ["closureResult", null, /task 1 complete.*successful closure result/i],
        ["recordedIndependentApprovals", 1, /task 1 complete.*approval counts must match/i],
    ]) {
        const invalid = completedFixture();
        invalid.tasks[0][field] = value;
        assert.match(validatePlanLifecycle(invalid).join("\n"), expected);
    }
});

test("requires complete tasks to declare positive, exactly matched approval counts", () => {
    for (const [mutate, expected] of [
        [(task) => delete task.requiredIndependentApprovals, /requiredIndependentApprovals.*positive/i],
        [(task) => (task.requiredIndependentApprovals = 0), /requiredIndependentApprovals.*positive/i],
        [(task) => delete task.recordedIndependentApprovals, /recordedIndependentApprovals.*integer/i],
        [(task) => (task.recordedIndependentApprovals = 3), /approval counts.*must match/i],
    ]) {
        const invalid = completedFixture();
        mutate(invalid.tasks[0]);
        assert.match(validatePlanLifecycle(invalid).join("\n"), expected);
    }
});

test("requires concrete Task 1 approvals and a git-derived SELF closeout only when Task 1 is complete", () => {
    const incomplete = fixture();
    assert.deepEqual(validatePlanLifecycle(incomplete), []);

    for (const [field, expected] of [
        ["task1ApprovalRecord", /Task 1 complete.*currentTask1ApprovalRecord/i],
        ["closeout", /Task 1 complete.*currentEvidenceOnlyCloseout/i],
        ["gitEvidence", /SELF.*git-derived/i],
    ]) {
        const invalid = completedFixture();
        delete invalid[field];
        assert.match(validatePlanLifecycle(invalid).join("\n"), expected);
    }

    const wrongTask = completedFixture();
    wrongTask.closeout.taskId = 21;
    assert.match(validatePlanLifecycle(wrongTask).join("\n"), /Task 1 complete.*closeout.*taskId 1/i);
});

test("rejects implemented or evidence-captured tasks without a remaining blocker", () => {
    for (const state of ["implemented", "evidence_captured"]) {
        const invalid = fixture();
        const task = invalid.tasks[0];
        task.state = state;
        task.remainingBlockers = [];
        if (state === "evidence_captured") {
            task.receipt = "docs/roadmap-1.0-receipts/task-01-baseline.md";
            task.closureResult = "exit 0";
            invalid.files.add(task.receipt);
        }
        assert.match(validatePlanLifecycle(invalid).join("\n"), /task 1.*remaining blocker/i);
    }
});

test("rejects unsafe, absent, or wrong-task receipt paths", () => {
    for (const [receipt, expected] of [
        ["/tmp/task-01.md", /receipt.*repo-relative/i],
        ["docs/roadmap-1.0-receipts/../../task-01.md", /receipt.*escape/i],
        ["docs/roadmap-1.0-receipts/task-01-baseline.md", /receipt.*does not exist/i],
        ["docs/roadmap-1.0-receipts/task-02-follow-up.md", /receipt.*wrong task/i],
    ]) {
        const invalid = fixture();
        invalid.tasks[0].receipt = receipt;
        assert.match(validatePlanLifecycle(invalid).join("\n"), expected);
    }
});

function validTask1Approval(receipt = "docs/roadmap-1.0-receipts/task-01-baseline.md") {
    const preCloseHead = "1234567890abcdef1234567890abcdef12345678";
    const reviewedRange = `ec68c61..${preCloseHead}`;
    return {
        receipt,
        currentPreCloseHead: preCloseHead,
        reviewedHead: preCloseHead,
        reviewedRange,
        approvals: [
            { identity: "reviewer-a", receipt, reviewedHead: preCloseHead, reviewedRange },
            { identity: "reviewer-b", receipt, reviewedHead: preCloseHead, reviewedRange },
        ],
    };
}

function validTask1Closeout(record) {
    return {
        taskId: 1,
        closeoutCommit: "SELF",
        reviewedHead: record.reviewedHead,
        reviewedRange: record.reviewedRange,
        correction: false,
    };
}

function validGitEvidence(record) {
    return {
        head: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
        parent: record.reviewedHead,
        changedPaths: ["docs/roadmap-1.0-receipts/task-01-approvals.md"],
        diff: "diff --git a/docs/roadmap-1.0-receipts/task-01-approvals.md b/docs/roadmap-1.0-receipts/task-01-approvals.md",
    };
}

test("rejects stale, partial, initial-only, short, or under-approved Task 1 review records", () => {
    const cases = [
        [
            (record) => {
                record.reviewedHead = "e0f44a40de3059c9c2618f56440c0b428702361c";
            },
            /Task 1 approval.*initial implementation commit/i,
        ],
        [(record) => (record.reviewedHead = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), /Task 1 approval.*stale head/i],
        [(record) => (record.reviewedRange = `ec68c61..${"b".repeat(40)}`), /Task 1 approval.*full pre-close range/i],
        [(record) => (record.reviewedRange = `deadbeef..${record.reviewedHead}`), /Task 1 approval.*begin at ec68c61/i],
        [(record) => record.approvals.pop(), /Task 1 approval.*at least 2 independent approvals/i],
        [(record) => (record.approvals[1].identity = record.approvals[0].identity), /independent approval identities/i],
        [(record) => (record.approvals[0].receipt = "docs/roadmap-1.0-receipts/task-99.md"), /approval.*receipt.*match/i],
    ];
    for (const [mutate, expected] of cases) {
        const invalid = fixture();
        invalid.task1ApprovalRecord = validTask1Approval();
        mutate(invalid.task1ApprovalRecord);
        assert.match(validatePlanLifecycle(invalid).join("\n"), expected);
    }
});

test("uses git-derived SELF evidence and rejects a later substantive commit despite benign declarations", () => {
    const invalid = completedFixture();
    invalid.closeout.changedPaths = [];
    invalid.closeout.behaviorChanged = false;
    invalid.closeout.taskSemanticsChanged = false;
    invalid.gitEvidence.parent = "f".repeat(40);
    invalid.gitEvidence.changedPaths = ["wrapper/create-client.ts"];
    invalid.gitEvidence.diff = "diff --git a/wrapper/create-client.ts b/wrapper/create-client.ts";

    const failures = validatePlanLifecycle(invalid).join("\n");
    assert.match(failures, /SELF.*parent.*reviewedHead/i);
    assert.match(failures, /git-derived.*wrapper\/create-client\.ts.*not allowed/i);
});

test("rejects semantic or readiness drift inside an allowlisted evidence-only diff", () => {
    for (const [path, before, after, expected] of [
        [
            "docs/roadmap-1.0-status.json",
            '  "dependencySemantics": "final_release_acceptance_blocker",',
            '  "dependencySemantics": "execution",',
            /git-derived diff.*dependencySemantics.*protected/i,
        ],
        [
            "docs/risk-register.json",
            '  "finalReadinessBlocking": true,',
            '  "finalReadinessBlocking": false,',
            /git-derived diff.*finalReadinessBlocking.*protected/i,
        ],
        [
            "docs/roadmap-1.0.md",
            "| 1. Truthful readiness baseline | — | implemented | old evidence | make close | Yes |",
            "| 1. Truthful readiness baseline | 27 | complete | approvals | make close | Yes |",
            /git-derived diff.*roadmap dependency.*protected/i,
        ],
    ]) {
        const invalid = completedFixture();
        invalid.closeout.behaviorChanged = false;
        invalid.closeout.taskSemanticsChanged = false;
        invalid.gitEvidence.changedPaths = [path];
        invalid.gitEvidence.diff = [
            `diff --git a/${path} b/${path}`,
            `--- a/${path}`,
            `+++ b/${path}`,
            "@@ -1 +1 @@",
            `-${before}`,
            `+${after}`,
        ].join("\n");
        assert.match(validatePlanLifecycle(invalid).join("\n"), expected);
    }
});

test("accepts an allowlisted diff that only records approval evidence", () => {
    const valid = completedFixture();
    const path = "docs/roadmap-1.0-status.json";
    valid.gitEvidence.changedPaths = [path];
    valid.gitEvidence.diff = [
        `diff --git a/${path} b/${path}`,
        `--- a/${path}`,
        `+++ b/${path}`,
        "@@ -1 +1 @@",
        '-  "recordedIndependentApprovals": 0,',
        '+  "recordedIndependentApprovals": 2,',
    ].join("\n");
    assert.deepEqual(validatePlanLifecycle(valid), []);
});

test("accepts a governed SELF correction naming the prior concrete closeout and rejects changed evidence", () => {
    const valid = completedFixture();
    const priorCloseoutCommit = "d".repeat(40);
    valid.closeout = {
        ...valid.closeout,
        correction: true,
        priorCloseoutCommit,
        reviewedEvidenceChanged: false,
    };
    valid.gitEvidence = {
        ...valid.gitEvidence,
        parent: priorCloseoutCommit,
        priorCloseout: {
            commit: priorCloseoutCommit,
            parent: valid.task1ApprovalRecord.reviewedHead,
            changedPaths: ["docs/roadmap-1.0-receipts/task-01-approvals.md"],
            diff: "diff --git a/docs/roadmap-1.0-receipts/task-01-approvals.md b/docs/roadmap-1.0-receipts/task-01-approvals.md",
        },
    };
    assert.deepEqual(validatePlanLifecycle(valid), []);

    valid.closeout.reviewedEvidenceChanged = true;
    assert.match(validatePlanLifecycle(valid).join("\n"), /correction.*changed evidence.*invalidates/i);
});

test("rejects evidence-only closeout commits that change behavior or reviewed semantics", () => {
    const invalid = completedFixture();
    invalid.closeout.behaviorChanged = true;
    invalid.closeout.taskSemanticsChanged = true;
    invalid.gitEvidence.changedPaths = ["wrapper/create-client.ts"];
    invalid.gitEvidence.diff = "diff --git a/wrapper/create-client.ts b/wrapper/create-client.ts";
    const failures = validatePlanLifecycle(invalid).join("\n");
    assert.match(failures, /evidence-only closeout.*git-derived wrapper\/create-client\.ts.*not allowed/i);
    assert.match(failures, /evidence-only closeout.*behavior/i);
    assert.match(failures, /evidence-only closeout.*task semantics/i);
});

test("requires an evidence-only correction to state whether reviewed evidence changes", () => {
    const invalid = fixture();
    invalid.closeout = {
        taskId: 1,
        changedPaths: ["docs/roadmap-1.0-receipts/task-01-approvals.md"],
        behaviorChanged: false,
        taskSemanticsChanged: false,
        correction: true,
    };
    assert.match(validatePlanLifecycle(invalid).join("\n"), /correction.*reviewed evidence changes/i);
});

function validPacket() {
    const path = "docs/agent-tasks/execute-roadmap-task.md";
    return {
        path,
        contractPackets: [path],
        indexText: "[execute-roadmap-task.md](./execute-roadmap-task.md)",
        requiredSections: [
            "## Files to read first",
            "## Files you may edit",
            "## Files you must NOT edit",
            "## Required tests / gates",
            "## Required docs / changelog updates",
            "## Completion checklist",
        ],
        text: [
            "## Files to read first",
            "docs/plan-lifecycle-policy.md",
            "## Files you may edit",
            "## Files you must NOT edit",
            "## Required tests / gates",
            "Run the exact closure command and capture its exit code.",
            "## Required docs / changelog updates",
            "Track the task receipt and name every remaining blocker.",
            "## Completion checklist",
            "Stop without claiming complete when any lifecycle condition remains open.",
        ].join("\n"),
    };
}

test("rejects an unindexed, uncontracted, incomplete, placeholder, or unsafe lifecycle packet", () => {
    const cases = [
        [(packet) => (packet.indexText = ""), /packet.*absent from index/i],
        [(packet) => (packet.contractPackets = []), /packet.*absent from contract/i],
        [(packet) => (packet.text = packet.text.replace("## Completion checklist", "## Finish")), /missing.*Completion checklist/i],
        [(packet) => (packet.text += "\nTODO fill this in"), /placeholder marker.*TODO/i],
        [(packet) => (packet.text = packet.text.replace("Stop without claiming complete", "Continue")), /packet.*lifecycle\/stop rule/i],
    ];
    for (const [mutate, expected] of cases) {
        const invalid = fixture();
        invalid.packet = validPacket();
        mutate(invalid.packet);
        assert.match(validatePlanLifecycle(invalid).join("\n"), expected);
    }
});

test("rejects guidance that discards context early or claims completion from static memory", () => {
    for (const text of [
        "Remove temporary context before evidence capture.",
        "Declare the task done from chat memory.",
        "The task is complete from a static marker.",
        "Declare completion from a status row.",
    ]) {
        const invalid = fixture();
        invalid.guidance = [{ path: "docs/guide.md", text }];
        assert.match(validatePlanLifecycle(invalid).join("\n"), /guidance.*forbidden completion rule/i);
    }
});

test("accepts guidance that prohibits early context removal or weak-evidence completion", () => {
    for (const text of [
        "Never declare completion from chat memory, a static marker, or a status row.",
        "Do not remove temporary context before evidence capture.",
        "A task is never complete from a status row.",
        "Keep temporary handoff context through evidence capture; remove it only immediately before final acceptance.",
    ]) {
        const valid = fixture();
        valid.guidance = [{ path: "docs/agent-tasks/execute-roadmap-task.md", text }];
        assert.deepEqual(validatePlanLifecycle(valid), []);
    }
});

test("does not let an unrelated earlier negated sentence authorize completion from memory", () => {
    const invalid = fixture();
    invalid.guidance = [
        {
            path: "docs/guide.md",
            text: "Do not. Complete from chat memory.",
        },
    ];
    assert.match(validatePlanLifecycle(invalid).join("\n"), /guidance.*forbidden completion rule/i);
});

test("does not treat without in the weak-evidence object as negating an affirmative completion verb", () => {
    const invalid = fixture();
    invalid.guidance = [
        {
            path: "docs/guide.md",
            text: "Mark the task complete without evidence from chat memory.",
        },
    ];
    assert.match(validatePlanLifecycle(invalid).join("\n"), /guidance.*forbidden completion rule/i);
});

test("rejects conflicting canonical lifecycle terminology across active surfaces", () => {
    const invalid = fixture();
    invalid.terminology = [
        {
            taskId: 21,
            surfaces: [
                { path: "docs/roadmap-1.0.md", state: "implemented" },
                { path: "docs/roadmap-1.0-status.json", state: "evidence_captured" },
                { path: "docs/plan-lifecycle-policy.md", state: "implemented" },
                { path: "docs/agent-handoff-policy.md", state: "implemented" },
                { path: "docs/agent-tasks/execute-roadmap-task.md", state: "implemented" },
            ],
        },
    ];
    assert.match(validatePlanLifecycle(invalid).join("\n"), /task 21 terminology.*conflicting/i);
});

function canonicalSources() {
    return {
        roadmapText: [
            "| Task | Depends on | Status | Evidence now | Exact closure command and required artifact | Release-blocking |",
            "|---|---|---|---|---|---|",
            "| 1. Truthful readiness baseline | — | implemented (0/2 approvals) | none | make first | Yes |",
            "| 2. Follow-up | 1 (final acceptance only) | pending | none | make second | No |",
        ].join("\n"),
        roadmapStatus: {
            task1: { status: "implemented-awaiting-independent-approvals", lifecycleState: "implemented" },
            task2: { status: "pending" },
        },
        statusBindings: [
            { key: "task1", taskIds: [1] },
            { key: "task2", taskIds: [2] },
        ],
        uniqueClaimInventory: {
            claims: [
                {
                    kind: "roadmap",
                    status: "implemented",
                    projection: { taskNumber: 1, dependsOn: [], stateText: "implemented (0/2 approvals)" },
                },
                {
                    kind: "roadmap",
                    status: "pending",
                    projection: { taskNumber: 2, dependsOn: [1], stateText: "pending" },
                },
            ],
        },
        terminologyDocuments: [
            "docs/plan-lifecycle-policy.md",
            "docs/agent-handoff-policy.md",
            "docs/agent-tasks/execute-roadmap-task.md",
        ].map((path) => ({
            path,
            text: "`pending`, `in_progress`, `implemented`, `evidence_captured`, `complete`, and `archived`",
        })),
    };
}

test("compares every roadmap task across roadmap, status overlays, unique claims, and guidance vocabularies", () => {
    const valid = fixture();
    valid.canonicalSources = canonicalSources();
    assert.deepEqual(validatePlanLifecycle(valid), []);

    const statusDrift = fixture();
    statusDrift.canonicalSources = canonicalSources();
    statusDrift.canonicalSources.roadmapStatus.task2.status = "implemented";
    assert.match(validatePlanLifecycle(statusDrift).join("\n"), /task 2.*roadmap\/status.*drift/i);

    const omittedStatus = fixture();
    omittedStatus.canonicalSources = canonicalSources();
    omittedStatus.canonicalSources.statusBindings.pop();
    assert.match(validatePlanLifecycle(omittedStatus).join("\n"), /status overlay coverage.*task2/i);

    const uniqueDrift = fixture();
    uniqueDrift.canonicalSources = canonicalSources();
    uniqueDrift.canonicalSources.uniqueClaimInventory.claims[1].projection.dependsOn = [];
    assert.match(validatePlanLifecycle(uniqueDrift).join("\n"), /task 2.*unique.*dependency.*drift/i);

    const terminologyDrift = fixture();
    terminologyDrift.canonicalSources = canonicalSources();
    terminologyDrift.canonicalSources.terminologyDocuments[2].text = "`pending`, `complete`";
    assert.match(validatePlanLifecycle(terminologyDrift).join("\n"), /execute-roadmap-task.*vocabulary.*drift/i);
});
