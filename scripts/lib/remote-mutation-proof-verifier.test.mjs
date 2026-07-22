import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { scoreReports, verifyRemoteMutationProof } from "./remote-mutation-proof-verifier.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const reports = {
    "wrapper/reports/mutation/mutation.json": { schemaVersion: "1", files: { "wrapper/a.ts": { mutants: [{ status: "Killed" }] } } },
    "mcp/reports/mutation/mutation.json": { schemaVersion: "1", files: { "mcp/a.ts": { mutants: [{ status: "Killed" }] } } },
    "cli/reports/mutation/mutation.json": { schemaVersion: "1", files: { "cli/a.ts": { mutants: [{ status: "Killed" }] } } },
};
const contract = {
    packages: [
        { id: "wrapper", report: "wrapper/reports/mutation/mutation.json", globalFloor: 1, moduleFloors: { "wrapper/a.ts": 1 } },
        { id: "mcp", report: "mcp/reports/mutation/mutation.json", globalFloor: 1, moduleFloors: { "mcp/a.ts": 1 } },
        { id: "cli", report: "cli/reports/mutation/mutation.json", globalFloor: 1, moduleFloors: { "cli/a.ts": 1 } },
    ],
};
const source = JSON.stringify(contract);
const reportHashes = Object.fromEntries(Object.entries(reports).map(([reportPath, report]) => [reportPath, sha256(JSON.stringify(report))]));

function record() {
    return {
        schemaVersion: 1, status: "verified", owner: "apet97", repository: "clockify-ts-sdk",
        workflow: { path: ".github/workflows/mutation.yml", name: "Mutation", event: "workflow_dispatch" },
        approvedTargets: ["wrapper", "mcp", "cli"], aggregateTarget: "all", retentionDays: 14,
        reportPaths: Object.keys(reports), proofCommit: "1f3e4de98ebd6445dde5280c23ce825f0719cfb3",
        branch: "codex/clockify-1-0-truth", noLocalMutationCommandRan: true,
        run: { id: 11, attempt: 1, target: "all", url: "https://github.com/apet97/clockify-ts-sdk/actions/runs/11", htmlUrl: "https://github.com/apet97/clockify-ts-sdk/actions/runs/11", workflowPath: ".github/workflows/mutation.yml", conclusion: "success", headSha: "1f3e4de98ebd6445dde5280c23ce825f0719cfb3", createdAt: "2026-07-22T10:00:00Z", startedAt: "2026-07-22T10:01:00Z", completedAt: "2026-07-22T10:02:00Z" },
        job: { id: 33, name: "Stryker mutation (all)", attempt: 1, conclusion: "success" },
        artifact: { id: 22, name: "mutation-reports-all-1", sizeBytes: 7, createdAt: "2026-07-22T10:02:00Z", expiresAt: "2026-08-05T10:02:00Z", expired: false, archiveSha256: sha256("archive"), reportSha256: structuredClone(reportHashes) },
        scoreContract: { path: "docs/mutation-score-contract.json", sha256: sha256(source), packages: contract.packages.map(({ id, globalFloor, moduleFloors }) => ({ id, globalFloor, moduleFloors })) },
        measurements: {
            wrapper: { global: { noCoverage: 0, killed: 1, survived: 0, timeout: 0, ignored: 0, covered: 1, passing: 1, score: 100, floor: 1 }, modules: { "wrapper/a.ts": { noCoverage: 0, killed: 1, survived: 0, timeout: 0, ignored: 0, covered: 1, passing: 1, score: 100, floor: 1 } } },
            mcp: { global: { noCoverage: 0, killed: 1, survived: 0, timeout: 0, ignored: 0, covered: 1, passing: 1, score: 100, floor: 1 }, modules: { "mcp/a.ts": { noCoverage: 0, killed: 1, survived: 0, timeout: 0, ignored: 0, covered: 1, passing: 1, score: 100, floor: 1 } } },
            cli: { global: { noCoverage: 0, killed: 1, survived: 0, timeout: 0, ignored: 0, covered: 1, passing: 1, score: 100, floor: 1 }, modules: { "cli/a.ts": { noCoverage: 0, killed: 1, survived: 0, timeout: 0, ignored: 0, covered: 1, passing: 1, score: 100, floor: 1 } } },
        }, verifiedAt: "2026-07-22T10:03:00Z",
    };
}

function fixtureBoundary() {
    return {
        getRun: async () => ({ id: 11, html_url: "https://github.com/apet97/clockify-ts-sdk/actions/runs/11", path: ".github/workflows/mutation.yml", name: "Mutation", event: "workflow_dispatch", head_branch: "codex/clockify-1-0-truth", head_sha: "1f3e4de98ebd6445dde5280c23ce825f0719cfb3", conclusion: "success", run_attempt: 1, created_at: "2026-07-22T10:00:00Z", run_started_at: "2026-07-22T10:01:00Z", updated_at: "2026-07-22T10:02:00Z" }),
        listJobs: async () => [{ id: 33, name: "Stryker mutation (all)", run_attempt: 1, conclusion: "success" }],
        listArtifacts: async () => [{ id: 22, name: "mutation-reports-all-1", size_in_bytes: 7, expired: false, created_at: "2026-07-22T10:02:00Z", expires_at: "2026-08-05T10:02:00Z" }],
        downloadArtifact: async ({ destination }) => writeFile(destination, "archive"),
    };
}

async function extractFixture({ destination }) {
    for (const [reportPath, report] of Object.entries(reports)) {
        const target = path.join(destination, reportPath);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, JSON.stringify(report));
    }
}

test("live verifier accepts injected Actions and archive evidence then removes its temporary directory", async () => {
    let tempDirectory;
    let removed = false;
    const result = await verifyRemoteMutationProof({
        record: record(), root: process.cwd(), github: fixtureBoundary(), now: Date.parse("2026-07-23T00:00:00Z"),
        makeTemp: async () => (tempDirectory = await mkdtemp(path.join(tmpdir(), "remote-mutation-test-"))),
        removeTemp: async (directory) => { removed = true; await rm(directory, { recursive: true, force: true }); },
        extractArchive: extractFixture, readProofContract: () => source,
    });
    assert.equal(result.artifactId, 22);
    assert.equal(removed, true);
    await assert.rejects(readFile(tempDirectory));
});

test("live verifier rejects a missing governed report with no GitHub call outside the injected fixture", async () => {
    const badReports = structuredClone(reports);
    delete badReports["cli/reports/mutation/mutation.json"];
    await assert.rejects(
        verifyRemoteMutationProof({
            record: record(), root: process.cwd(), github: fixtureBoundary(), now: Date.parse("2026-07-23T00:00:00Z"),
            extractArchive: async ({ destination }) => {
                for (const [reportPath, report] of Object.entries(badReports)) {
                    const target = path.join(destination, reportPath);
                    await mkdir(path.dirname(target), { recursive: true });
                    await writeFile(target, JSON.stringify(report));
                }
            }, readProofContract: () => source,
        }),
        /missing or extra governed report paths/i,
    );
});

test("live verifier rejects remote artifact identity drift, expiry, extra reports, and below-floor reports", async () => {
    const cases = [
        ["artifact id", (github) => { github.listArtifacts = async () => [{ id: 23, name: "mutation-reports-all-1", size_in_bytes: 7, expired: false, created_at: "2026-07-22T10:02:00Z", expires_at: "2026-08-05T10:02:00Z" }]; }, extractFixture, /artifact id mismatch/i],
        ["expired", (github) => { github.listArtifacts = async () => [{ id: 22, name: "mutation-reports-all-1", size_in_bytes: 7, expired: true, created_at: "2026-07-22T10:02:00Z", expires_at: "2026-08-05T10:02:00Z" }]; }, extractFixture, /artifact expired mismatch/i],
        ["extra report", () => {}, async ({ destination }) => { await extractFixture({ destination }); await writeFile(path.join(destination, "extra.json"), "{}"); }, /missing or extra governed report paths/i],
        ["tampered report", () => {}, async ({ destination }) => {
            const below = structuredClone(reports); below["cli/reports/mutation/mutation.json"].files["cli/a.ts"].mutants = [{ status: "Survived" }];
            for (const [reportPath, report] of Object.entries(below)) { const target = path.join(destination, reportPath); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, JSON.stringify(report)); }
        }, /report SHA-256 mismatch/i],
    ];
    for (const [name, mutateGithub, extractArchive, expected] of cases) {
        const github = fixtureBoundary();
        mutateGithub(github);
        await assert.rejects(verifyRemoteMutationProof({ record: record(), root: process.cwd(), github, now: Date.parse("2026-07-23T00:00:00Z"), extractArchive, readProofContract: () => source }), expected, name);
    }
});

test("score recomputation rejects a current global or module floor regression", () => {
    const below = structuredClone(reports);
    below["cli/reports/mutation/mutation.json"].files["cli/a.ts"].mutants = [{ status: "Survived" }];
    assert.throws(
        () => scoreReports({ contract, reports: new Map(Object.entries(below)) }),
        /global score 0 below floor 1/i,
    );
});

test("score recomputation rejects a module-only floor regression even when the package global passes", () => {
    const moduleContract = {
        packages: [{
            id: "cli",
            report: "cli/reports/mutation/mutation.json",
            globalFloor: 50,
            moduleFloors: { "cli/a.ts": 100, "cli/b.ts": 0 },
        }],
    };
    const moduleReports = new Map([["cli/reports/mutation/mutation.json", {
        schemaVersion: "1",
        files: {
            "cli/a.ts": { mutants: [{ status: "Survived" }] },
            "cli/b.ts": { mutants: Array.from({ length: 9 }, () => ({ status: "Killed" })) },
        },
    }]]);
    assert.throws(
        () => scoreReports({ contract: moduleContract, reports: moduleReports }),
        /cli\/a\.ts score 0 below floor 100/i,
    );
});

test("live verifier rejects a substituted run response id", async () => {
    const github = fixtureBoundary();
    github.getRun = async () => ({
        id: 12, name: "Mutation", event: "workflow_dispatch", head_branch: "codex/clockify-1-0-truth",
        head_sha: "1f3e4de98ebd6445dde5280c23ce825f0719cfb3", conclusion: "success", run_attempt: 1,
        created_at: "2026-07-22T10:00:00Z", run_started_at: "2026-07-22T10:01:00Z", updated_at: "2026-07-22T10:02:00Z",
    });
    await assert.rejects(
        verifyRemoteMutationProof({ record: record(), root: process.cwd(), github, now: Date.parse("2026-07-23T00:00:00Z"), extractArchive: extractFixture, readProofContract: () => source }),
        /run id mismatch/i,
    );
});

test("live verifier binds aggregate run path, target job, and the sole artifact", async () => {
    const cases = [
        ["run URL", (github) => { github.getRun = async () => ({ ...await fixtureBoundary().getRun(), html_url: "https://example.invalid/run" }); }, /html_url mismatch/i],
        ["run SHA", (github) => { github.getRun = async () => ({ ...await fixtureBoundary().getRun(), head_sha: "0".repeat(40) }); }, /head_sha mismatch/i],
        ["run attempt", (github) => { github.getRun = async () => ({ ...await fixtureBoundary().getRun(), run_attempt: 2 }); }, /run_attempt mismatch/i],
        ["workflow path", (github) => { github.getRun = async () => ({ ...await fixtureBoundary().getRun(), path: ".github/workflows/other.yml" }); }, /path mismatch/i],
        ["wrong job", (github) => { github.listJobs = async () => [{ name: "Stryker mutation (wrapper)", run_attempt: 1, conclusion: "success" }]; }, /exactly one Stryker mutation \(all\) job/i],
        ["job id", (github) => { github.listJobs = async () => [{ id: 34, name: "Stryker mutation (all)", run_attempt: 1, conclusion: "success" }]; }, /job id\/attempt\/conclusion mismatch/i],
        ["job attempt", (github) => { github.listJobs = async () => [{ id: 33, name: "Stryker mutation (all)", run_attempt: 2, conclusion: "success" }]; }, /job id\/attempt\/conclusion mismatch/i],
        ["artifact size", (github) => { github.listArtifacts = async () => [{ id: 22, name: "mutation-reports-all-1", size_in_bytes: 8, expired: false, created_at: "2026-07-22T10:02:00Z", expires_at: "2026-08-05T10:02:00Z" }]; }, /artifact size_in_bytes mismatch/i],
        ["extra artifact", (github) => { github.listArtifacts = async () => [...await fixtureBoundary().listArtifacts(), { id: 23, name: "other", size_in_bytes: 1, expired: false, created_at: "2026-07-22T10:02:00Z", expires_at: "2026-08-05T10:02:00Z" }]; }, /exactly one total governed mutation artifact/i],
    ];
    for (const [name, mutate, expected] of cases) {
        const github = fixtureBoundary();
        mutate(github);
        await assert.rejects(verifyRemoteMutationProof({ record: record(), root: process.cwd(), github, now: Date.parse("2026-07-23T00:00:00Z"), extractArchive: extractFixture, readProofContract: () => source }), expected, name);
    }
});

test("record validation rejects per-report hash, package, module-count, timing, and retention drift", async () => {
    const cases = [
        ["per-report hash", (value) => { value.artifact.reportSha256["cli/reports/mutation/mutation.json"] = "0".repeat(64); }, /report SHA-256 mismatch for cli/i],
        ["extra measurement package", (value) => { value.measurements.extra = {}; }, /measurements: must contain exactly/i],
        ["module count incoherence", (value) => { value.measurements.cli.modules["cli/a.ts"].covered = 2; }, /modules\.cli\/a\.ts\.covered/i],
        ["verified after expiry", (value) => { value.verifiedAt = "2026-08-06T10:02:00Z"; }, /verifiedAt: must not postdate/i],
        ["run timestamp ordering", (value) => { value.run.startedAt = "2026-07-22T09:59:00Z"; }, /run timestamps/i],
        ["artifact timestamp ordering", (value) => { value.artifact.expiresAt = "2026-07-22T10:01:00Z"; }, /artifact timestamps/i],
        ["retention beyond tolerance", (value) => { value.artifact.expiresAt = "2026-08-04T10:02:00Z"; }, /retentionDays within/i],
    ];
    for (const [name, mutate, expected] of cases) {
        const value = record();
        mutate(value);
        await assert.rejects(verifyRemoteMutationProof({ record: value, root: process.cwd(), github: fixtureBoundary(), now: Date.parse("2026-07-23T00:00:00Z"), extractArchive: extractFixture, readProofContract: () => source }), expected, name);
    }
});

test("score recomputation rejects unknown Stryker mutant statuses", () => {
    const malformed = structuredClone(reports);
    malformed["wrapper/reports/mutation/mutation.json"].files["wrapper/a.ts"].mutants = [{ status: "Unknown" }];
    assert.throws(() => scoreReports({ contract, reports: new Map(Object.entries(malformed)) }), /unknown Stryker mutant status/i);
});

test("a one-second GitHub retention-boundary drift remains valid", async () => {
    const value = record();
    value.artifact.expiresAt = "2026-08-05T10:01:59Z";
    const github = fixtureBoundary();
    github.listArtifacts = async () => [{ id: 22, name: "mutation-reports-all-1", size_in_bytes: 7, expired: false, created_at: "2026-07-22T10:02:00Z", expires_at: "2026-08-05T10:01:59Z" }];
    await assert.doesNotReject(verifyRemoteMutationProof({ record: value, root: process.cwd(), github, now: Date.parse("2026-07-23T00:00:00Z"), extractArchive: extractFixture, readProofContract: () => source }));
});

test("live verifier rejects a record verified after its injected current time", async () => {
    const value = record();
    value.verifiedAt = "2026-07-24T10:03:00Z";
    await assert.rejects(
        verifyRemoteMutationProof({
            record: value,
            root: process.cwd(),
            github: fixtureBoundary(),
            now: Date.parse("2026-07-23T00:00:00Z"),
            extractArchive: extractFixture,
            readProofContract: () => source,
        }),
        /verifiedAt.*future/i,
    );
});
