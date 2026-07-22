#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { validateRoadmapTask3Status } from "./roadmap-status-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const riskRegisterPath = path.join(root, "docs", "risk-register.json");
const releaseContractPath = path.join(root, "docs", "release-readiness-contract.json");
const roadmapStatusPath = path.join(root, "docs", "roadmap-1.0-status.json");
const roadmapPath = path.join(root, "docs", "roadmap-1.0.md");

function requiredBlockers(register) {
    return register.reportGenerator.generatedReport.requiredReadinessBlockingRiskIds;
}

function openFinalReadinessBlockers(register) {
    return register.risks
        .filter((risk) => risk.status === "open" && risk.finalReadinessBlocking === true)
        .map((risk) => risk.id)
        .sort();
}

function runCommand(command, args = [], env = process.env) {
    return spawnSync(process.execPath, [command, ...args], { cwd: root, encoding: "utf8", env });
}

function testFixtureArgs(registerPath, releaseContractPath) {
    return ["--test-readiness-fixtures", registerPath, releaseContractPath];
}

async function writeFixture(pathname, value) {
    await writeFile(pathname, `${JSON.stringify(value, null, 2)}\n`);
}

test("Task 3 roadmap status is pinned and rejects omission or stale implementation truth", async () => {
    const [roadmapStatusText, riskRegisterText, releaseContractText] = await Promise.all([
        readFile(roadmapStatusPath, "utf8"),
        readFile(riskRegisterPath, "utf8"),
        readFile(releaseContractPath, "utf8"),
    ]);
    const roadmapStatus = JSON.parse(roadmapStatusText);

    assert.deepEqual(validateRoadmapTask3Status(roadmapStatus), []);

    const cases = [
        {
            name: "omitted",
            mutate(fixture) {
                delete fixture.task3;
            },
            expected: /task3.*missing/i,
        },
        {
            name: "stale-status",
            mutate(fixture) {
                fixture.task3.status = "pending";
            },
            expected: /task3\.status.*implemented/,
        },
        {
            name: "stale-openapi-truth",
            mutate(fixture) {
                fixture.task3.openApiChanged = false;
                fixture.task3.upstreamCommit = "a246a6fbbef69024df500417f14442152d9d1569";
            },
            expected: /task3\.openApiChanged.*true/,
        },
    ];

    const fixtureDirectory = await mkdtemp(path.join(tmpdir(), "clockify-roadmap-status-"));
    try {
        for (const testCase of cases) {
            const fixture = structuredClone(roadmapStatus);
            testCase.mutate(fixture);
            const fixtureRegisterPath = path.join(fixtureDirectory, `${testCase.name}-risk.json`);
            const fixtureReleasePath = path.join(fixtureDirectory, `${testCase.name}-release.json`);
            const fixtureRoadmapPath = path.join(fixtureDirectory, `${testCase.name}-roadmap.json`);
            await Promise.all([
                writeFile(fixtureRegisterPath, riskRegisterText),
                writeFile(fixtureReleasePath, releaseContractText),
                writeFixture(fixtureRoadmapPath, fixture),
            ]);

            const result = runCommand(
                "scripts/check-risk-register.mjs",
                [
                    "--test-readiness-fixtures",
                    fixtureRegisterPath,
                    fixtureReleasePath,
                    fixtureRoadmapPath,
                ],
                { ...process.env, NODE_ENV: "test" },
            );
            assert.notEqual(result.status, 0, `checker accepted ${testCase.name} Task 3 status`);
            assert.match(result.stderr, testCase.expected);
        }
    } finally {
        await rm(fixtureDirectory, { recursive: true, force: true });
    }
});

test("Tasks 14-17 proofs stay pinned while Task 17 approvals and aggregate proof remain incomplete", async () => {
    const [roadmapStatusText, riskRegisterText, releaseContractText] = await Promise.all([
        readFile(roadmapStatusPath, "utf8"),
        readFile(riskRegisterPath, "utf8"),
        readFile(releaseContractPath, "utf8"),
    ]);
    const roadmapStatus = JSON.parse(roadmapStatusText);
    const riskRegister = JSON.parse(riskRegisterText);
    const partialStatus =
        "partial-wrapper-mcp-and-cli-individual-proofs-recorded-aggregate-approved-target-proof-incomplete";
    const retainedRuns = [
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
    ];
    const staleTask16RemoteProofCases = [
        ["run-url", (proof) => (proof.runUrl = "https://example.invalid/run")],
        ["run-id", (proof) => (proof.runId = 29909385572)],
        ["run-attempt", (proof) => (proof.runAttempt = 2)],
        ["target", (proof) => (proof.target = "wrapper")],
        ["branch", (proof) => (proof.branch = "main")],
        ["head-sha", (proof) => (proof.headSha = "0".repeat(40))],
        ["conclusion", (proof) => (proof.conclusion = "failure")],
        ["job-id", (proof) => (proof.jobId = 88888400467)],
        ["job-started-at", (proof) => (proof.jobStartedAt = "2026-07-22T09:47:49Z")],
        ["job-completed-at", (proof) => (proof.jobCompletedAt = "2026-07-22T09:49:24Z")],
        ["artifact-id", (proof) => (proof.artifactId = 8525238263)],
        ["artifact-name", (proof) => (proof.artifactName = "mutation-reports-mcp-2")],
        ["artifact-size", (proof) => (proof.artifactSizeBytes = 28151)],
        ["artifact-created-at", (proof) => (proof.artifactCreatedAt = "2026-07-22T09:49:22Z")],
        ["retention", (proof) => (proof.retentionDays = 13)],
        ["expires-at", (proof) => (proof.expiresAt = "2026-08-05T09:49:22Z")],
        ["expired", (proof) => (proof.expired = true)],
        ["report-size", (proof) => (proof.downloadedReportSizeBytes = 205750)],
        ["report-hash", (proof) => (proof.downloadedReportSha256 = "0".repeat(64))],
        ["covered-score", (proof) => (proof.coveredMutationScore = 85)],
        ["global-count", (proof) => (proof.measurements.global.killed = 246)],
        ["global-score", (proof) => (proof.measurements.global.score = 85)],
        ["global-floor", (proof) => (proof.measurements.global.floor = 84)],
        [
            "module-count",
            (proof) => (proof.measurements.modules["mcp/src/result.ts"].survived = 26),
        ],
        [
            "module-score",
            (proof) => (proof.measurements.modules["mcp/src/result.ts"].score = 84),
        ],
        [
            "module-floor",
            (proof) => (proof.measurements.modules["mcp/src/result.ts"].floor = 84),
        ],
    ].map(([name, mutate]) => ({
        name: `stale-task16-proof-${name}`,
        mutate(fixture) {
            mutate(fixture.task16.remoteProof);
        },
        expected: /task16\.remoteProof/i,
    }));
    const staleTask17RemoteProofCases = [
        ["run-url", (proof) => (proof.runUrl = "https://example.invalid/run")],
        ["run-id", (proof) => (proof.runId = 29913220025)],
        ["run-attempt", (proof) => (proof.runAttempt = 2)],
        ["target", (proof) => (proof.target = "mcp")],
        ["branch", (proof) => (proof.branch = "main")],
        ["head-sha", (proof) => (proof.headSha = "0".repeat(40))],
        ["conclusion", (proof) => (proof.conclusion = "failure")],
        ["job-id", (proof) => (proof.jobId = 88900864670)],
        ["job-started-at", (proof) => (proof.jobStartedAt = "2026-07-22T10:47:02Z")],
        ["job-completed-at", (proof) => (proof.jobCompletedAt = "2026-07-22T10:48:02Z")],
        ["artifact-id", (proof) => (proof.artifactId = 8526772928)],
        ["artifact-name", (proof) => (proof.artifactName = "mutation-reports-cli-2")],
        ["artifact-size", (proof) => (proof.artifactSizeBytes = 18057)],
        ["artifact-created-at", (proof) => (proof.artifactCreatedAt = "2026-07-22T10:47:58Z")],
        ["expires-at", (proof) => (proof.expiresAt = "2026-08-05T10:47:57Z")],
        ["expired", (proof) => (proof.expired = true)],
        ["report-size", (proof) => (proof.downloadedReportSizeBytes = 123285)],
        ["report-hash", (proof) => (proof.downloadedReportSha256 = "0".repeat(64))],
        ["history", (proof) => (proof.historyRevisionsChecked = 25)],
        ["global-count", (proof) => (proof.measurements.global.killed = 120)],
        ["global-score", (proof) => (proof.measurements.global.score = 96)],
        ["global-floor", (proof) => (proof.measurements.global.floor = 95)],
        [
            "module-count",
            (proof) => (proof.measurements.modules["cli/src/commands/resolve-refs.ts"].survived = 2),
        ],
        [
            "module-score",
            (proof) => (proof.measurements.modules["cli/src/commands/leaf-command.ts"].score = 95),
        ],
        [
            "module-floor",
            (proof) => (proof.measurements.modules["cli/src/receipt.ts"].floor = 99),
        ],
    ].map(([name, mutate]) => ({
        name: `stale-task17-proof-${name}`,
        mutate(fixture) {
            mutate(fixture.task17.remoteProof);
        },
        expected: /task17\.remoteProof/i,
    }));

    assert.equal(roadmapStatus.remoteMutationProof.status, partialStatus);
    assert.deepEqual(roadmapStatus.remoteMutationProof.retainedRuns, retainedRuns);
    assert.equal(roadmapStatus.remoteMutationProof.aggregateApprovedTargetProofComplete, false);
    assert.deepEqual(roadmapStatus.remoteMutationProof.currentTargets, ["all", "wrapper", "mcp", "cli"]);
    assert.equal(roadmapStatus.task15.status, "complete");
    assert.equal(roadmapStatus.task15.recordedIndependentApprovals, 2);
    assert.equal(roadmapStatus.task15.requiredIndependentApprovals, 2);
    assert.equal(roadmapStatus.task15.reviewedHead, "ed8baa188e88ed65faf24a49374491cf373aa9b2");
    assert.equal(
        roadmapStatus.task15.reviewedRange,
        "afdcac212def82209fbc3a0dfb1e92ab6e5e6eee..ed8baa188e88ed65faf24a49374491cf373aa9b2",
    );
    assert.equal(
        roadmapStatus.task15.approvalResult,
        "Two independent reviewers approved the corrected frozen range with no remaining Critical, Important, or Minor findings.",
    );
    assert.match(roadmapStatus.task15.closeoutCommitPolicy, /evidence-only.*not part.*reviewed/i);
    assert.equal(roadmapStatus.task16.status, "complete");
    assert.equal(roadmapStatus.task16.recordedIndependentApprovals, 2);
    assert.equal(roadmapStatus.task16.requiredIndependentApprovals, 2);
    assert.equal(roadmapStatus.task16.reviewedHead, "a9e02532c1e6327bc3c5cdbb1ace158716ea1354");
    assert.equal(
        roadmapStatus.task16.reviewedRange,
        "96b674539d2fd286456cf44c5fc7433f87fc3d6d..a9e02532c1e6327bc3c5cdbb1ace158716ea1354",
    );
    assert.equal(
        roadmapStatus.task16.approvalResult,
        "Two independent reviewers approved the corrected frozen range with no remaining Critical, Important, or Minor findings.",
    );
    assert.match(roadmapStatus.task16.closeoutCommitPolicy, /evidence-only.*not part.*reviewed/i);
    assert.equal(roadmapStatus.task16.finalImplementationCommit, "56b7cbba149b5a4bf9477e7aeb6036167aedd87d");
    assert.equal(roadmapStatus.task16.remoteProof.runId, 29909385573);
    assert.equal(roadmapStatus.task16.remoteProof.artifactName, "mutation-reports-mcp-1");
    assert.equal(roadmapStatus.task16.remoteProof.measurements.global.killed, 247);
    assert.equal(
        roadmapStatus.task16.remoteProof.measurements.modules["mcp/src/tool-risk.ts"].floor,
        90,
    );
    assert.equal(roadmapStatus.task17.status, "implemented-awaiting-independent-approvals");
    assert.equal(roadmapStatus.task17.globalFloor, 96);
    assert.deepEqual(roadmapStatus.task17.moduleFloors, {
        "cli/src/commands/leaf-command.ts": 95,
        "cli/src/commands/resolve-refs.ts": 95,
        "cli/src/receipt.ts": 100,
    });
    assert.equal(Object.hasOwn(roadmapStatus.task17, "globalCalibrationPending"), false);
    assert.equal(Object.hasOwn(roadmapStatus.task17, "calibrationPending"), false);
    assert.equal(roadmapStatus.task17.remoteMeasurement.runId, 29912616222);
    assert.equal(roadmapStatus.task17.remoteMeasurement.artifactName, "mutation-reports-cli-1");
    assert.equal(roadmapStatus.task17.remoteMeasurement.measurements.global.floor, 96);
    assert.equal(roadmapStatus.task17.calibrationRun.runId, 29912033512);
    assert.equal(roadmapStatus.task17.calibrationRun.authority, "calibration-only");
    assert.equal(roadmapStatus.task17.remoteProofRecorded, true);
    assert.equal(roadmapStatus.task17.remoteProof.runId, 29913220026);
    assert.equal(roadmapStatus.task17.remoteProof.artifactName, "mutation-reports-cli-1");
    assert.equal(roadmapStatus.task17.remoteProof.historyRevisionsChecked, 26);
    assert.equal(roadmapStatus.task17.remoteProof.measurements.global.killed, 121);
    assert.equal(roadmapStatus.task17.remoteProof.measurements.modules["cli/src/receipt.ts"].floor, 100);
    assert.deepEqual(validateRoadmapTask3Status(roadmapStatus), []);

    const risk = riskRegister.risks.find((entry) => entry.id === "remote-mutation-proof-pending");
    assert.ok(risk);
    assert.match(
        risk.summary,
        /Tasks 14 and 15.*independently approved.*Task 16.*independently approved.*MCP safety.*Task 17.*retained CLI proof.*two independent approvals.*aggregate.*Task 18.*incomplete/i,
    );
    assert.match(risk.impact, /CLI floor-bearing scope.*proven remotely.*Task 17 approval.*Task 18 receipt/i);
    assert.ok(
        risk.evidence.some(
            (entry) =>
                entry.path === "docs/roadmap-1.0-status.json" && entry.contains === partialStatus,
        ),
    );

    const cases = [
        {
            name: "stale-no-run-status",
            mutate(fixture) {
                fixture.remoteMutationProof.status = "no-retained-github-mutation-run-recorded";
            },
            expected:
                /remoteMutationProof\.status.*partial-wrapper-mcp-and-cli-individual-proofs-recorded/i,
        },
        {
            name: "missing-task14-run",
            mutate(fixture) {
                fixture.remoteMutationProof.retainedRuns =
                    fixture.remoteMutationProof.retainedRuns.filter((entry) => entry.task !== 14);
            },
            expected: /remoteMutationProof\.retainedRuns.*29890732492/i,
        },
        {
            name: "stale-task15-run-url",
            mutate(fixture) {
                fixture.remoteMutationProof.retainedRuns.find((entry) => entry.task === 15).runUrl =
                    "https://github.com/apet97/clockify-ts-sdk/actions/runs/29897495482";
            },
            expected: /remoteMutationProof\.retainedRuns.*29900533134/i,
        },
        {
            name: "stale-task16-retained-run-url",
            mutate(fixture) {
                fixture.remoteMutationProof.retainedRuns.find((entry) => entry.task === 16).runUrl =
                    "https://github.com/apet97/clockify-ts-sdk/actions/runs/29908983968";
            },
            expected: /remoteMutationProof\.retainedRuns.*29909385573/i,
        },
        ...staleTask16RemoteProofCases,
        {
            name: "stale-task17-retained-run-url",
            mutate(fixture) {
                fixture.remoteMutationProof.retainedRuns.find((entry) => entry.task === 17).runUrl =
                    "https://github.com/apet97/clockify-ts-sdk/actions/runs/29912616222";
            },
            expected: /remoteMutationProof\.retainedRuns.*29913220026/i,
        },
        ...staleTask17RemoteProofCases,
        {
            name: "stale-task16-approval-closeout",
            mutate(fixture) {
                fixture.task16.recordedIndependentApprovals = 0;
                fixture.task16.status = "implemented-awaiting-independent-approvals";
                fixture.task16.reviewedHead = null;
                fixture.task16.reviewedRange = null;
            },
            expected: /task16\.status.*complete/i,
        },
        {
            name: "stale-task15-approval-closeout",
            mutate(fixture) {
                fixture.task15.recordedIndependentApprovals = 0;
                fixture.task15.status = "implemented-awaiting-independent-approvals";
            },
            expected: /task15\.status.*complete/i,
        },
        {
            name: "missing-task17-remote-proof",
            mutate(fixture) {
                fixture.task17.remoteProofRecorded = false;
            },
            expected: /task17\.remoteProofRecorded.*true/i,
        },
        {
            name: "premature-aggregate-completion",
            mutate(fixture) {
                fixture.remoteMutationProof.aggregateApprovedTargetProofComplete = true;
            },
            expected: /remoteMutationProof\.aggregateApprovedTargetProofComplete.*false/i,
        },
    ];

    const fixtureDirectory = await mkdtemp(path.join(tmpdir(), "clockify-task15-remote-proof-"));
    try {
        for (const testCase of cases) {
            const fixture = structuredClone(roadmapStatus);
            testCase.mutate(fixture);
            const fixtureRegisterPath = path.join(fixtureDirectory, `${testCase.name}-risk.json`);
            const fixtureReleasePath = path.join(fixtureDirectory, `${testCase.name}-release.json`);
            const fixtureRoadmapPath = path.join(fixtureDirectory, `${testCase.name}-roadmap.json`);
            await Promise.all([
                writeFile(fixtureRegisterPath, riskRegisterText),
                writeFile(fixtureReleasePath, releaseContractText),
                writeFixture(fixtureRoadmapPath, fixture),
            ]);

            const result = runCommand(
                "scripts/check-risk-register.mjs",
                [
                    "--test-readiness-fixtures",
                    fixtureRegisterPath,
                    fixtureReleasePath,
                    fixtureRoadmapPath,
                ],
                { ...process.env, NODE_ENV: "test" },
            );
            assert.notEqual(result.status, 0, `checker accepted ${testCase.name}`);
            assert.match(result.stderr, testCase.expected);
        }
    } finally {
        await rm(fixtureDirectory, { recursive: true, force: true });
    }
});

test("removing any blocker from either readiness contract fails both validators without mutating tracked docs", async () => {
    const [originalRegister, originalReleaseContract] = await Promise.all([
        readFile(riskRegisterPath, "utf8"),
        readFile(releaseContractPath, "utf8"),
    ]);
    const register = JSON.parse(originalRegister);
    const releaseContract = JSON.parse(originalReleaseContract);
    const blockers = requiredBlockers(register);

    assert.deepEqual(blockers, releaseContract.riskRegister.requiredOpenFinalReadinessBlockingIds);
    assert.equal(blockers.length, 1);

    const fixtureDirectory = await mkdtemp(path.join(tmpdir(), "clockify-risk-register-"));
    try {
        for (const contractName of ["risk-register", "release-readiness"]) {
            for (const blocker of blockers) {
                const fixtureRegister = structuredClone(register);
                const fixtureReleaseContract = structuredClone(releaseContract);
                if (contractName === "risk-register") {
                    fixtureRegister.reportGenerator.generatedReport.requiredReadinessBlockingRiskIds =
                        requiredBlockers(fixtureRegister).filter((id) => id !== blocker);
                } else {
                    fixtureReleaseContract.riskRegister.requiredOpenFinalReadinessBlockingIds =
                        fixtureReleaseContract.riskRegister.requiredOpenFinalReadinessBlockingIds.filter(
                            (id) => id !== blocker,
                        );
                }

                const fixtureRegisterPath = path.join(
                    fixtureDirectory,
                    `${contractName}-${blocker}-risk.json`,
                );
                const fixtureReleasePath = path.join(
                    fixtureDirectory,
                    `${contractName}-${blocker}-release.json`,
                );
                await Promise.all([
                    writeFixture(fixtureRegisterPath, fixtureRegister),
                    writeFixture(fixtureReleasePath, fixtureReleaseContract),
                ]);
                const env = {
                    ...process.env,
                    NODE_ENV: "test",
                };
                const args = testFixtureArgs(fixtureRegisterPath, fixtureReleasePath);

                // Removing the last remaining blocker empties the fixture
                // list, which the validators reject with the non-empty-array
                // shape failure before they can name the missing id. Both
                // messages prove the same fail-closed property.
                const expectedFailure =
                    fixtureRegister.reportGenerator.generatedReport.requiredReadinessBlockingRiskIds
                        .length === 0 ||
                    fixtureReleaseContract.riskRegister.requiredOpenFinalReadinessBlockingIds
                        .length === 0
                        ? new RegExp(`${blocker}|must be a non-empty array`)
                        : new RegExp(blocker);
                for (const checker of [
                    "scripts/check-risk-register.mjs",
                    "scripts/check-release-readiness.mjs",
                ]) {
                    const result = runCommand(checker, args, env);
                    assert.notEqual(
                        result.status,
                        0,
                        `${checker} accepted ${contractName} without ${blocker}: ${result.stdout}${result.stderr}`,
                    );
                    assert.match(
                        result.stderr,
                        expectedFailure,
                        `${checker} must fail closed on the missing ${blocker}: ${result.stderr}`,
                    );
                }
            }
        }
    } finally {
        await rm(fixtureDirectory, { recursive: true, force: true });
    }

    assert.equal(await readFile(riskRegisterPath, "utf8"), originalRegister);
    assert.equal(await readFile(releaseContractPath, "utf8"), originalReleaseContract);
});

test("roadmap readiness blockers match the canonical open blocking risks", async () => {
    const [roadmap, registerText] = await Promise.all([
        readFile(roadmapPath, "utf8"),
        readFile(riskRegisterPath, "utf8"),
    ]);
    const register = JSON.parse(registerText);
    const section = roadmap.match(
        /The .*?open readiness blockers in `docs\/risk-register\.json`[\s\S]*?(?=Use `make risk-status-report`)/,
    )?.[0];
    assert.ok(section, "roadmap must publish its current open readiness blockers");
    const documented = [...section.matchAll(/^- `([^`]+)`$/gm)].map((match) => match[1]).sort();
    assert.deepEqual(documented, openFinalReadinessBlockers(register));
});

test("ambient CLOCKIFY fixture paths cannot redirect canonical readiness commands", async () => {
    const [originalRegister, originalReleaseContract] = await Promise.all([
        readFile(riskRegisterPath, "utf8"),
        readFile(releaseContractPath, "utf8"),
    ]);
    const register = JSON.parse(originalRegister);
    const releaseContract = JSON.parse(originalReleaseContract);
    const redirectedRegister = structuredClone(register);
    const redirectedReleaseContract = structuredClone(releaseContract);
    redirectedRegister.risks.find((risk) => risk.id === "expense-date-filter-contract").status =
        "accepted";
    redirectedReleaseContract.riskRegister.requiredOpenFinalReadinessBlockingIds.push(
        "not-a-real-risk",
    );

    const fixtureDirectory = await mkdtemp(path.join(tmpdir(), "clockify-risk-register-ambient-"));
    try {
        const fixtureRegisterPath = path.join(fixtureDirectory, "risk-register.json");
        const fixtureReleasePath = path.join(fixtureDirectory, "release-readiness-contract.json");
        await Promise.all([
            writeFixture(fixtureRegisterPath, redirectedRegister),
            writeFixture(fixtureReleasePath, redirectedReleaseContract),
        ]);
        const ambientFixtureEnvironment = {
            ...process.env,
            CLOCKIFY_RISK_REGISTER_PATH: fixtureRegisterPath,
            CLOCKIFY_RELEASE_READINESS_CONTRACT_PATH: fixtureReleasePath,
        };

        for (const checker of [
            "scripts/check-risk-register.mjs",
            "scripts/check-release-readiness.mjs",
        ]) {
            const result = runCommand(checker, [], ambientFixtureEnvironment);
            assert.equal(
                result.status,
                0,
                `${checker} must ignore ambient fixture paths: ${result.stdout}${result.stderr}`,
            );
        }

        const planner = runCommand("scripts/plan.mjs", ["risk-status"], ambientFixtureEnvironment);
        assert.equal(
            planner.status,
            0,
            `risk-status planner must ignore ambient fixture paths: ${planner.stderr}`,
        );
        assert.match(planner.stdout, /expense-date-filter-contract/);
    } finally {
        await rm(fixtureDirectory, { recursive: true, force: true });
    }
});
