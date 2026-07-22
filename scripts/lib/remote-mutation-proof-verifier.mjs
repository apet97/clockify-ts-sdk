import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { coveredMutationScore } from "./mutation-score.mjs";
import { expectedArtifactName, remoteMutationProofContract, validateRemoteMutationProofRecord } from "./remote-mutation-proof-contract.mjs";

const { approvedTargets, reportPaths } = remoteMutationProofContract;

function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}

function timestamp(value) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
}

function count(mutants) {
    const counts = { noCoverage: 0, killed: 0, survived: 0, timeout: 0, ignored: 0 };
    for (const mutant of mutants) {
        const status = mutant?.status;
        if (status === "NoCoverage") counts.noCoverage += 1;
        else if (status === "Ignored") counts.ignored += 1;
        else if (status === "Killed") counts.killed += 1;
        else if (status === "Timeout") counts.timeout += 1;
        else if (status === "Survived") counts.survived += 1;
        else throw new Error(`unknown Stryker mutant status ${JSON.stringify(status)}`);
    }
    const covered = counts.killed + counts.survived + counts.timeout;
    return { ...counts, covered, passing: counts.killed + counts.timeout, score: coveredMutationScore(mutants) };
}

function scoreReports({ contract, reports }) {
    const measurements = {};
    for (const pkg of contract.packages ?? []) {
        const report = reports.get(pkg.report);
        if (report?.schemaVersion == null || typeof report.files !== "object") {
            throw new Error(`${pkg.id}: invalid Stryker report`);
        }
        const all = Object.values(report.files).flatMap((file) => Array.isArray(file?.mutants) ? file.mutants : []);
        const global = { ...count(all), floor: pkg.globalFloor };
        if (global.score < global.floor) throw new Error(`${pkg.id}: global score ${global.score} below floor ${global.floor}`);
        const modules = {};
        for (const [source, floor] of Object.entries(pkg.moduleFloors ?? {})) {
            const mutants = report.files[source]?.mutants;
            if (!Array.isArray(mutants)) throw new Error(`${pkg.id}: missing governed report ${source}`);
            const measured = { ...count(mutants), floor };
            if (measured.score < floor) throw new Error(`${pkg.id}: ${source} score ${measured.score} below floor ${floor}`);
            modules[source] = measured;
        }
        measurements[pkg.id] = { global, modules };
    }
    return measurements;
}

async function recursiveFiles(root, relative = "") {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const child = path.join(relative, entry.name);
        if (entry.isDirectory()) files.push(...(await recursiveFiles(root, child)));
        else if (entry.isFile()) files.push(child.replaceAll(path.sep, "/"));
        else throw new Error(`artifact contains unsupported entry ${child}`);
    }
    return files.sort();
}

export function createGitHubBoundary({ fetchImpl = fetch, token = process.env.GITHUB_TOKEN } = {}) {
    async function request(url) {
        const response = await fetchImpl(url, {
            headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        });
        if (!response.ok) throw new Error(`GitHub request failed: HTTP ${response.status}`);
        return response;
    }
    return {
        async getRun({ owner, repository, runId }) {
            return (await request(`https://api.github.com/repos/${owner}/${repository}/actions/runs/${runId}`)).json();
        },
        async listArtifacts({ owner, repository, runId }) {
            const result = await (await request(`https://api.github.com/repos/${owner}/${repository}/actions/runs/${runId}/artifacts?per_page=100`)).json();
            return result.artifacts;
        },
        async listJobs({ owner, repository, runId }) {
            const result = await (await request(`https://api.github.com/repos/${owner}/${repository}/actions/runs/${runId}/jobs?per_page=100`)).json();
            return result.jobs;
        },
        async downloadArtifact({ owner, repository, artifactId, destination }) {
            const response = await request(`https://api.github.com/repos/${owner}/${repository}/actions/artifacts/${artifactId}/zip`);
            await writeFile(destination, Buffer.from(await response.arrayBuffer()));
        },
    };
}

async function defaultExtractArchive({ archivePath, destination }) {
    const result = spawnSync("unzip", ["-qq", archivePath, "-d", destination], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`cannot extract mutation artifact: ${result.stderr.trim() || "unzip failed"}`);
}

function defaultReadProofContract({ root, proofCommit, sourcePath }) {
    const result = spawnSync("git", ["show", `${proofCommit}:${sourcePath}`], { cwd: root, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`cannot read proof-SHA mutation score contract: ${result.stderr.trim()}`);
    return result.stdout;
}

/** Live-only verifier. Every network/file-system edge is injectable for offline fixtures. */
export async function verifyRemoteMutationProof({
    record,
    root,
    github,
    now = Date.now(),
    makeTemp = () => mkdtemp(path.join(tmpdir(), "clockify-remote-mutation-")),
    removeTemp = (directory) => rm(directory, { recursive: true, force: true }),
    extractArchive = defaultExtractArchive,
    readProofContract = defaultReadProofContract,
} = {}) {
    if (record?.status !== "verified") throw new Error("remote mutation proof is pending live evidence; refusing live verification");
    const staticFailures = validateRemoteMutationProofRecord(record);
    if (staticFailures.length) throw new Error(`remote mutation proof record invalid:\n- ${staticFailures.join("\n- ")}`);
    if (timestamp(record.verifiedAt) > now) throw new Error("record.verifiedAt is in the future relative to live verification time");
    if (github == null) throw new Error("GitHub boundary is required");

    const directory = await makeTemp();
    try {
        const run = await github.getRun({ owner: record.owner, repository: record.repository, runId: record.run.id });
        for (const [field, expected] of [["id", record.run.id], ["html_url", record.run.htmlUrl], ["path", record.run.workflowPath], ["name", record.workflow.name], ["event", record.workflow.event], ["head_branch", record.branch], ["head_sha", record.proofCommit], ["conclusion", "success"], ["run_attempt", record.run.attempt], ["created_at", record.run.createdAt], ["run_started_at", record.run.startedAt], ["updated_at", record.run.completedAt]]) {
            if (run?.[field] !== expected) throw new Error(`GitHub run ${field} mismatch`);
        }
        const jobs = await github.listJobs({ owner: record.owner, repository: record.repository, runId: record.run.id });
        const aggregateJobs = (jobs ?? []).filter((job) => job?.name === `Stryker mutation (${record.aggregateTarget})`);
        if (aggregateJobs.length !== 1) throw new Error(`expected exactly one Stryker mutation (${record.aggregateTarget}) job`);
        if (aggregateJobs[0].id !== record.job.id || aggregateJobs[0].run_attempt !== record.job.attempt || aggregateJobs[0].conclusion !== record.job.conclusion) {
            throw new Error("GitHub aggregate mutation job attempt/conclusion mismatch");
        }
        const artifacts = await github.listArtifacts({ owner: record.owner, repository: record.repository, runId: record.run.id });
        if (!Array.isArray(artifacts) || artifacts.length !== 1) throw new Error("expected exactly one total governed mutation artifact");
        const expectedName = expectedArtifactName(record.aggregateTarget, record.run.attempt);
        const matches = (artifacts ?? []).filter((artifact) => artifact?.name === expectedName);
        if (matches.length !== 1) throw new Error(`expected exactly one ${expectedName} artifact`);
        const artifact = matches[0];
        for (const [field, expected] of [["id", record.artifact.id], ["size_in_bytes", record.artifact.sizeBytes], ["expired", false], ["created_at", record.artifact.createdAt], ["expires_at", record.artifact.expiresAt]]) {
            if (artifact?.[field] !== expected) throw new Error(`GitHub artifact ${field} mismatch`);
        }
        if (timestamp(artifact.expires_at) == null || timestamp(artifact.expires_at) <= now) throw new Error("GitHub artifact is expired now");
        const archivePath = path.join(directory, "mutation-reports.zip");
        const extracted = path.join(directory, "reports");
        await github.downloadArtifact({ owner: record.owner, repository: record.repository, artifactId: artifact.id, destination: archivePath });
        const archive = await readFile(archivePath);
        if (sha256(archive) !== record.artifact.archiveSha256) throw new Error("downloaded archive SHA-256 mismatch");
        await extractArchive({ archivePath, destination: extracted });
        const files = await recursiveFiles(extracted);
        if (JSON.stringify(files) !== JSON.stringify([...reportPaths].sort())) throw new Error("artifact has missing or extra governed report paths");
        const reports = new Map();
        for (const reportPath of reportPaths) {
            const content = await readFile(path.join(extracted, reportPath));
            if (sha256(content) !== record.artifact.reportSha256[reportPath]) {
                throw new Error(`downloaded report SHA-256 mismatch for ${reportPath}`);
            }
            reports.set(reportPath, JSON.parse(content));
        }
        const source = readProofContract({ root, proofCommit: record.proofCommit, sourcePath: record.scoreContract.path });
        if (sha256(source) !== record.scoreContract.sha256) throw new Error("proof-SHA mutation score contract SHA-256 mismatch");
        const measurements = scoreReports({ contract: JSON.parse(source), reports });
        if (JSON.stringify(measurements) !== JSON.stringify(record.measurements)) throw new Error("recorded mutation measurements differ from downloaded reports");
        return { runId: record.run.id, artifactId: artifact.id, measurements };
    } finally {
        await removeTemp(directory);
    }
}

export { scoreReports };
