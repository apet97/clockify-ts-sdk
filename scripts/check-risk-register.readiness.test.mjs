#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const riskRegisterPath = path.join(root, "docs", "risk-register.json");
const releaseContractPath = path.join(root, "docs", "release-readiness-contract.json");

function requiredBlockers(register) {
    return register.reportGenerator.generatedReport.requiredReadinessBlockingRiskIds;
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

test("removing any blocker from either readiness contract fails both validators without mutating tracked docs", async () => {
    const [originalRegister, originalReleaseContract] = await Promise.all([
        readFile(riskRegisterPath, "utf8"),
        readFile(releaseContractPath, "utf8"),
    ]);
    const register = JSON.parse(originalRegister);
    const releaseContract = JSON.parse(originalReleaseContract);
    const blockers = requiredBlockers(register);

    assert.deepEqual(blockers, releaseContract.riskRegister.requiredOpenFinalReadinessBlockingIds);
    assert.equal(blockers.length, 6);

    const fixtureDirectory = await mkdtemp(path.join(tmpdir(), "clockify-risk-register-"));
    try {
        for (const contractName of ["risk-register", "release-readiness"]) {
            for (const blocker of blockers) {
                const fixtureRegister = structuredClone(register);
                const fixtureReleaseContract = structuredClone(releaseContract);
                if (contractName === "risk-register") {
                    fixtureRegister.reportGenerator.generatedReport.requiredReadinessBlockingRiskIds = requiredBlockers(
                        fixtureRegister,
                    ).filter((id) => id !== blocker);
                } else {
                    fixtureReleaseContract.riskRegister.requiredOpenFinalReadinessBlockingIds =
                        fixtureReleaseContract.riskRegister.requiredOpenFinalReadinessBlockingIds.filter(
                            (id) => id !== blocker,
                        );
                }

                const fixtureRegisterPath = path.join(fixtureDirectory, `${contractName}-${blocker}-risk.json`);
                const fixtureReleasePath = path.join(fixtureDirectory, `${contractName}-${blocker}-release.json`);
                await Promise.all([
                    writeFixture(fixtureRegisterPath, fixtureRegister),
                    writeFixture(fixtureReleasePath, fixtureReleaseContract),
                ]);
                const env = {
                    ...process.env,
                    NODE_ENV: "test",
                };
                const args = testFixtureArgs(fixtureRegisterPath, fixtureReleasePath);

                for (const checker of ["scripts/check-risk-register.mjs", "scripts/check-release-readiness.mjs"]) {
                    const result = runCommand(checker, args, env);
                    assert.notEqual(
                        result.status,
                        0,
                        `${checker} accepted ${contractName} without ${blocker}: ${result.stdout}${result.stderr}`,
                    );
                    assert.match(
                        result.stderr,
                        new RegExp(blocker),
                        `${checker} must identify the missing ${blocker}: ${result.stderr}`,
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

test("ambient CLOCKIFY fixture paths cannot redirect canonical readiness commands", async () => {
    const [originalRegister, originalReleaseContract] = await Promise.all([
        readFile(riskRegisterPath, "utf8"),
        readFile(releaseContractPath, "utf8"),
    ]);
    const register = JSON.parse(originalRegister);
    const releaseContract = JSON.parse(originalReleaseContract);
    const redirectedRegister = structuredClone(register);
    const redirectedReleaseContract = structuredClone(releaseContract);
    redirectedRegister.risks.find((risk) => risk.id === "expense-date-filter-contract").status = "accepted";
    redirectedReleaseContract.riskRegister.requiredOpenFinalReadinessBlockingIds.push("not-a-real-risk");

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

        for (const checker of ["scripts/check-risk-register.mjs", "scripts/check-release-readiness.mjs"]) {
            const result = runCommand(checker, [], ambientFixtureEnvironment);
            assert.equal(result.status, 0, `${checker} must ignore ambient fixture paths: ${result.stdout}${result.stderr}`);
        }

        const planner = runCommand("scripts/plan.mjs", ["risk-status"], ambientFixtureEnvironment);
        assert.equal(planner.status, 0, `risk-status planner must ignore ambient fixture paths: ${planner.stderr}`);
        assert.match(planner.stdout, /expense-date-filter-contract/);
    } finally {
        await rm(fixtureDirectory, { recursive: true, force: true });
    }
});
