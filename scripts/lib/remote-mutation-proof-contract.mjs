const APPROVED_TARGETS = Object.freeze(["wrapper", "mcp", "cli"]);
const REPORT_PATHS = Object.freeze([
    "wrapper/reports/mutation/mutation.json",
    "mcp/reports/mutation/mutation.json",
    "cli/reports/mutation/mutation.json",
]);

function sameValues(actual, expected) {
    return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function isPlainObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function isSha(value) {
    return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isCommit(value) {
    return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function timestamp(value) {
    if (typeof value !== "string" || value.trim() === "") return null;
    const result = Date.parse(value);
    return Number.isNaN(result) ? null : result;
}

function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
}

function nonnegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

function required(value, label, failures, predicate, message) {
    if (!predicate(value)) failures.push(`${label}: ${message}`);
}

export function expectedArtifactName(target, attempt) {
    return `mutation-reports-${target}-${attempt}`;
}

function validateMeasurements(record, failures) {
    if (!isPlainObject(record.measurements)) {
        failures.push("measurements: must be an object keyed by wrapper, mcp, cli");
        return;
    }
    const packages = record.scoreContract?.packages;
    if (!Array.isArray(packages) || packages.length !== APPROVED_TARGETS.length) {
        failures.push("scoreContract.packages: must pin wrapper, mcp, cli score floors");
        return;
    }
    const byId = new Map(packages.map((pkg) => [pkg?.id, pkg]));
    for (const target of APPROVED_TARGETS) {
        const expected = byId.get(target);
        const measured = record.measurements[target];
        if (!isPlainObject(expected)) {
            failures.push(`scoreContract.packages: missing ${target}`);
            continue;
        }
        if (!isPlainObject(measured)) {
            failures.push(`measurements.${target}: missing package measurement`);
            continue;
        }
        const global = measured.global;
        if (!isPlainObject(global)) {
            failures.push(`measurements.${target}.global: missing global score counts`);
        } else {
            for (const name of ["noCoverage", "killed", "survived", "timeout", "ignored", "covered", "passing"]) {
                required(global[name], `measurements.${target}.global.${name}`, failures, nonnegativeInteger, "must be a nonnegative integer");
            }
            required(global.score, `measurements.${target}.global.score`, failures, Number.isFinite, "must be finite");
            required(global.floor, `measurements.${target}.global.floor`, failures, Number.isFinite, "must be finite");
            if (global.covered !== global.killed + global.survived + global.timeout) {
                failures.push(`measurements.${target}.global.covered: must equal killed + survived + timeout`);
            }
            if (global.passing !== global.killed + global.timeout) {
                failures.push(`measurements.${target}.global.passing: must equal killed + timeout`);
            }
            if (global.covered === 0 || Math.abs(global.score - (100 * global.passing) / global.covered) > 1e-9) {
                failures.push(`measurements.${target}.global.score: must match covered mutation counts`);
            }
            if (global.floor !== expected.globalFloor || global.score < global.floor) {
                failures.push(`measurements.${target}.global: must meet the proof-SHA global floor`);
            }
        }
        if (!isPlainObject(expected.moduleFloors) || !isPlainObject(measured.modules)) {
            failures.push(`measurements.${target}.modules: must cover every proof-SHA module floor`);
            continue;
        }
        if (!sameValues(Object.keys(measured.modules).sort(), Object.keys(expected.moduleFloors).sort())) {
            failures.push(`measurements.${target}.modules: must exactly cover proof-SHA module floors`);
            continue;
        }
        for (const [sourcePath, floor] of Object.entries(expected.moduleFloors)) {
            const module = measured.modules[sourcePath];
            if (!isPlainObject(module)) {
                failures.push(`measurements.${target}.modules.${sourcePath}: missing`);
                continue;
            }
            if (module.floor !== floor || !Number.isFinite(module.score) || module.score < floor) {
                failures.push(`measurements.${target}.modules.${sourcePath}: must meet the proof-SHA module floor`);
            }
        }
    }
}

/**
 * The pending state is intentionally valid as a non-proof template. It lets
 * deterministic gates require the exact static contract without pretending a
 * still-running Actions job has produced evidence. Only `verified` is a proof.
 */
export function validateRemoteMutationProofRecord(record) {
    const failures = [];
    if (!isPlainObject(record)) return ["record: must be a JSON object"];

    if (record.schemaVersion !== 1) failures.push("schemaVersion: must be 1");
    if (!new Set(["pending-live-evidence", "verified"]).has(record.status)) {
        failures.push('status: must be "pending-live-evidence" or "verified"');
    }
    if (record.owner !== "apet97" || record.repository !== "clockify-ts-sdk") {
        failures.push("owner/repository: must pin apet97/clockify-ts-sdk");
    }
    if (
        record.workflow?.path !== ".github/workflows/mutation.yml" ||
        record.workflow?.name !== "Mutation" ||
        record.workflow?.event !== "workflow_dispatch"
    ) {
        failures.push("workflow: must pin the dispatch-only Mutation workflow");
    }
    if (!sameValues(record.approvedTargets, APPROVED_TARGETS)) failures.push("approvedTargets: must be wrapper, mcp, cli");
    if (record.aggregateTarget !== "all") failures.push('aggregateTarget: must be "all"');
    if (record.retentionDays !== 14) failures.push("retentionDays: must be 14");
    if (!sameValues(record.reportPaths, REPORT_PATHS)) failures.push("reportPaths: must be the exact three aggregate reports");
    if (!isCommit(record.proofCommit)) failures.push("proofCommit: must be a full 40-hex SHA");
    if (typeof record.branch !== "string" || record.branch.trim() === "") failures.push("branch: must be non-empty");
    if (record.noLocalMutationCommandRan !== true) failures.push("noLocalMutationCommandRan: must be true");

    if (record.status === "pending-live-evidence") {
        for (const field of ["run", "artifact", "measurements", "verifiedAt"]) {
            if (record[field] !== null) failures.push(`${field}: pending template must remain null until live verification`);
        }
        if (!isPlainObject(record.scoreContract) || record.scoreContract.path !== "docs/mutation-score-contract.json") {
            failures.push("scoreContract.path: pending template must pin docs/mutation-score-contract.json");
        } else {
            required(record.scoreContract.sha256, "scoreContract.sha256", failures, isSha, "must be a lowercase SHA-256");
        }
        return failures;
    }

    const run = record.run;
    if (!isPlainObject(run)) {
        failures.push("run: must be an object");
    } else {
        required(run.id, "run.id", failures, positiveInteger, "must be a positive integer");
        required(run.attempt, "run.attempt", failures, positiveInteger, "must be a positive integer");
        if (run.url !== `https://github.com/${record.owner}/${record.repository}/actions/runs/${run.id}`) {
            failures.push("run.url: must be the canonical URL for run.id");
        }
        if (run.conclusion !== "success") failures.push('run.conclusion: must be "success"');
        if (run.headSha !== record.proofCommit) failures.push("run.headSha: must equal proofCommit");
        for (const field of ["headSha", "createdAt", "startedAt", "completedAt"]) {
            required(run[field], `run.${field}`, failures, field === "headSha" ? isCommit : (value) => timestamp(value) != null, field === "headSha" ? "must be a full 40-hex SHA" : "must be an ISO timestamp");
        }
        if (timestamp(run.createdAt) > timestamp(run.startedAt) || timestamp(run.startedAt) > timestamp(run.completedAt)) {
            failures.push("run timestamps: must be createdAt <= startedAt <= completedAt");
        }
    }
    const artifact = record.artifact;
    if (!isPlainObject(artifact)) {
        failures.push("artifact: must be an object");
    } else {
        required(artifact.id, "artifact.id", failures, positiveInteger, "must be a positive integer");
        required(artifact.sizeBytes, "artifact.sizeBytes", failures, nonnegativeInteger, "must be a nonnegative integer");
        if (artifact.name !== expectedArtifactName(record.aggregateTarget, run?.attempt)) {
            failures.push(`artifact.name: must be ${expectedArtifactName(record.aggregateTarget, run?.attempt)}`);
        }
        if (artifact.expired !== false) failures.push("artifact.expired: must be false");
        for (const field of ["createdAt", "expiresAt"]) {
            required(artifact[field], `artifact.${field}`, failures, (value) => timestamp(value) != null, "must be an ISO timestamp");
        }
        if (timestamp(artifact.createdAt) > timestamp(artifact.expiresAt)) failures.push("artifact timestamps: must be createdAt <= expiresAt");
        if (timestamp(artifact.expiresAt) - timestamp(artifact.createdAt) !== record.retentionDays * 24 * 60 * 60 * 1000) {
            failures.push("artifact timestamps: must encode the pinned retentionDays exactly");
        }
        for (const field of ["archiveSha256", "reportSha256"]) {
            required(artifact[field], `artifact.${field}`, failures, isSha, "must be a lowercase SHA-256");
        }
    }
    if (!isPlainObject(record.scoreContract) || record.scoreContract.path !== "docs/mutation-score-contract.json") {
        failures.push("scoreContract.path: must pin docs/mutation-score-contract.json");
    } else {
        required(record.scoreContract.sha256, "scoreContract.sha256", failures, isSha, "must be a lowercase SHA-256");
    }
    required(record.verifiedAt, "verifiedAt", failures, (value) => timestamp(value) != null, "must be a non-empty ISO timestamp");
    if (timestamp(record.verifiedAt) != null && timestamp(run?.completedAt) != null && timestamp(record.verifiedAt) < timestamp(run.completedAt)) {
        failures.push("verifiedAt: must not predate run completion");
    }
    validateMeasurements(record, failures);
    return failures;
}

export const remoteMutationProofContract = Object.freeze({
    approvedTargets: APPROVED_TARGETS,
    reportPaths: REPORT_PATHS,
});
