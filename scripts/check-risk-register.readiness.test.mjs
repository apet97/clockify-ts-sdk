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

test("Task 14, Task 15, and Task 16 individual proofs are pinned while aggregate proof remains incomplete", async () => {
    const [roadmapStatusText, riskRegisterText, releaseContractText] = await Promise.all([
        readFile(roadmapStatusPath, "utf8"),
        readFile(riskRegisterPath, "utf8"),
        readFile(releaseContractPath, "utf8"),
    ]);
    const roadmapStatus = JSON.parse(roadmapStatusText);
    const riskRegister = JSON.parse(riskRegisterText);
    const partialStatus =
        "partial-wrapper-and-mcp-individual-proofs-recorded-cli-and-aggregate-approved-target-proof-incomplete";
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
    ];

    assert.equal(roadmapStatus.remoteMutationProof.status, partialStatus);
    assert.deepEqual(roadmapStatus.remoteMutationProof.retainedRuns, retainedRuns);
    assert.equal(roadmapStatus.remoteMutationProof.aggregateApprovedTargetProofComplete, false);
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
    assert.equal(roadmapStatus.task16.status, "implemented-awaiting-independent-approvals");
    assert.equal(roadmapStatus.task16.recordedIndependentApprovals, 0);
    assert.equal(roadmapStatus.task16.requiredIndependentApprovals, 2);
    assert.equal(roadmapStatus.task16.finalImplementationCommit, "56b7cbba149b5a4bf9477e7aeb6036167aedd87d");
    assert.equal(roadmapStatus.task16.remoteProof.runId, 29909385573);
    assert.equal(roadmapStatus.task16.remoteProof.artifactName, "mutation-reports-mcp-1");
    assert.deepEqual(validateRoadmapTask3Status(roadmapStatus), []);

    const risk = riskRegister.risks.find((entry) => entry.id === "remote-mutation-proof-pending");
    assert.ok(risk);
    assert.match(
        risk.summary,
        /Tasks 14 and 15.*independently approved.*Task 16.*MCP safety.*0\/2.*CLI.*aggregate.*Task 18.*incomplete/i,
    );
    assert.match(risk.impact, /remotely and independently approved.*Task 18 receipt/i);
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
                /remoteMutationProof\.status.*partial-wrapper-and-mcp-individual-proofs-recorded/i,
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
            name: "stale-task16-run-url",
            mutate(fixture) {
                fixture.remoteMutationProof.retainedRuns.find((entry) => entry.task === 16).runUrl =
                    "https://github.com/apet97/clockify-ts-sdk/actions/runs/29908983968";
            },
            expected: /remoteMutationProof\.retainedRuns.*29909385573/i,
        },
        {
            name: "premature-task16-approval",
            mutate(fixture) {
                fixture.task16.recordedIndependentApprovals = 2;
                fixture.task16.status = "complete";
            },
            expected: /task16\.status.*implemented-awaiting-independent-approvals/i,
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
