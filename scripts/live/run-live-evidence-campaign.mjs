#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateLiveEvidenceManifest } from "../check-live-evidence-manifest.mjs";
import {
    canonicalJsonBytes,
    hashArtifactTree,
    hashRelativeFiles,
    isDirectInvocation,
    sha256Hex,
    validateCampaignReceipt,
    writeFileAtomic,
} from "./live-evidence-attestation.mjs";
import {
    LIVE_CAMPAIGN_CLEANUP_GRACE_MS,
    validateLiveEnvironment,
} from "./orchestrator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const contract = JSON.parse(
    fs.readFileSync(path.join(root, "docs/live-evidence-currentness-contract.json"), "utf8"),
);
const WORKER_TIMEOUT_MS = 45 * 60_000;
const WORKER_OUTPUT_LIMIT_BYTES = 8 * 1024 * 1024;

function gitBytes(commit, relativePath) {
    return execFileSync("git", ["show", `${commit}:${relativePath}`], {
        cwd: root,
        encoding: null,
        maxBuffer: 32 * 1024 * 1024,
    });
}

export function sameHashes(left, right) {
    return (
        left?.fingerprint === right?.fingerprint &&
        JSON.stringify(left?.hashes) === JSON.stringify(right?.hashes)
    );
}

export function sameArtifact(left, right) {
    return (
        left?.root === right?.root &&
        left?.sha256 === right?.sha256 &&
        left?.fileCount === right?.fileCount
    );
}

export function captureCampaignInputSnapshot(rootDir, relativePaths) {
    const bytes = new Map(
        relativePaths.map((relativePath) => [
            relativePath,
            fs.readFileSync(path.join(rootDir, relativePath)),
        ]),
    );
    return {
        bytes,
        hashes: hashRelativeFiles(relativePaths, (relativePath) => bytes.get(relativePath)),
    };
}

export function buildVerifiedSdkArtifact({ captureInputs, build, hashArtifact }) {
    const beforeBuild = captureInputs();
    build();
    const afterBuild = captureInputs();
    if (!sameHashes(beforeBuild.hashes, afterBuild.hashes)) {
        throw Object.assign(new Error("campaign inputs changed while building the SDK artifact"), {
            code: "live_campaign_inputs_changed_during_build",
        });
    }
    return {
        campaignInputBytes: afterBuild.bytes,
        inputBefore: afterBuild.hashes,
        artifactBefore: hashArtifact(),
    };
}

export function writeByteSnapshot(snapshotRoot, bytesByPath) {
    const resolvedRoot = path.resolve(snapshotRoot);
    for (const [relativePath, bytes] of bytesByPath) {
        const destination = path.resolve(resolvedRoot, relativePath);
        if (!destination.startsWith(`${resolvedRoot}${path.sep}`) || !Buffer.isBuffer(bytes)) {
            throw Object.assign(new Error("unsafe live campaign snapshot input"), {
                code: "live_campaign_snapshot_input_invalid",
            });
        }
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, bytes, { flag: "wx" });
    }
}

function copyCampaignSnapshot(snapshotRoot, campaignInputBytes, previousManifestBytes) {
    const snapshotBytes = new Map(campaignInputBytes);
    if (snapshotBytes.has(contract.manifestPath)) {
        if (!snapshotBytes.get(contract.manifestPath).equals(previousManifestBytes)) {
            throw Object.assign(new Error("campaign manifest snapshot conflicts with baseline"), {
                code: "live_campaign_snapshot_manifest_conflict",
            });
        }
    } else {
        snapshotBytes.set(contract.manifestPath, previousManifestBytes);
    }
    writeByteSnapshot(snapshotRoot, snapshotBytes);
    fs.cpSync(
        path.join(root, "wrapper/dist"),
        path.join(snapshotRoot, "wrapper/dist"),
        { recursive: true },
    );
}

export function sanitizedOutput(value, secrets) {
    let output = String(value ?? "");
    for (const secret of secrets) {
        if (secret) output = output.replaceAll(secret, "[REDACTED]");
    }
    return output;
}

export function runChildWithGracefulTermination(
    command,
    args,
    {
        cwd,
        env,
        timeoutMs = WORKER_TIMEOUT_MS,
        cleanupGraceMs = LIVE_CAMPAIGN_CLEANUP_GRACE_MS,
        maxBufferBytes = WORKER_OUTPUT_LIMIT_BYTES,
        forwardSignals = true,
    } = {},
) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            env,
            detached: process.platform !== "win32",
            stdio: ["ignore", "pipe", "pipe"],
        });
        const stdout = [];
        const stderr = [];
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let outputExceeded = false;
        let terminationReason;
        let interruptionSignal;
        let forced = false;
        let spawnError;
        let cleanupTimer;

        const requestTermination = (reason, signal = "SIGTERM") => {
            if (terminationReason !== undefined) return;
            terminationReason = reason;
            if (reason === "signal") interruptionSignal = signal;
            if (child.exitCode === null && child.signalCode === null) child.kill(signal);
            cleanupTimer = setTimeout(() => {
                if (child.exitCode === null && child.signalCode === null) {
                    forced = true;
                    child.kill("SIGKILL");
                }
            }, cleanupGraceMs);
        };

        const appendOutput = (chunks, chunk, byteCount, setByteCount) => {
            const remaining = maxBufferBytes - byteCount;
            if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
            setByteCount(byteCount + chunk.length);
            if (chunk.length > remaining) {
                outputExceeded = true;
                requestTermination("output_limit");
            }
        };
        child.stdout.on("data", (chunk) =>
            appendOutput(stdout, chunk, stdoutBytes, (count) => {
                stdoutBytes = count;
            }),
        );
        child.stderr.on("data", (chunk) =>
            appendOutput(stderr, chunk, stderrBytes, (count) => {
                stderrBytes = count;
            }),
        );

        const signalHandlers = new Map(
            ["SIGINT", "SIGTERM"].map((signal) => [
                signal,
                () => requestTermination("signal", signal),
            ]),
        );
        if (forwardSignals) {
            for (const [signal, handler] of signalHandlers) process.on(signal, handler);
        }
        const timeout = setTimeout(() => requestTermination("timeout"), timeoutMs);

        child.once("error", (error) => {
            spawnError = error;
        });
        child.once("close", (status, signal) => {
            clearTimeout(timeout);
            clearTimeout(cleanupTimer);
            if (forwardSignals) {
                for (const [name, handler] of signalHandlers) process.off(name, handler);
            }
            if (spawnError) {
                reject(spawnError);
                return;
            }
            resolve({
                status,
                signal,
                stdout: Buffer.concat(stdout).toString("utf8"),
                stderr: Buffer.concat(stderr).toString("utf8"),
                timedOut: terminationReason === "timeout",
                interruptionSignal,
                outputExceeded,
                forced,
            });
        });
    });
}

function validateTrackedBaseline(baseCommit, targetBytes) {
    const trackedBytes = gitBytes(baseCommit, contract.manifestPath);
    if (!trackedBytes.equals(targetBytes)) {
        throw Object.assign(new Error("live manifest differs from the tracked campaign baseline"), {
            code: "live_previous_manifest_not_tracked",
        });
    }
    const trackedManifest = JSON.parse(trackedBytes.toString("utf8"));
    const trackedSourceLock = JSON.parse(
        gitBytes(baseCommit, "docs/openapi-source-lock.json").toString("utf8"),
    );
    const trackedOperations = JSON.parse(
        gitBytes(baseCommit, "docs/openapi-operations.json").toString("utf8"),
    ).operations;
    const errors = validateLiveEvidenceManifest(trackedManifest, {
        sourceLock: trackedSourceLock,
        operationInventory: trackedOperations,
    });
    if (errors.length > 0) {
        throw Object.assign(new Error(`tracked live baseline is invalid: ${errors.join("; ")}`), {
            code: "live_previous_manifest_invalid",
        });
    }
}

function buildSdkArtifact() {
    execFileSync(
        "make",
        ["sdk-wrapper-build", "sdk-codegen-drift", "sdk-codegen-test"],
        {
            cwd: root,
            env: {
                ...process.env,
                CLOCKIFY_API_KEY: "",
                CLOCKIFY_ADDON_TOKEN: "",
                CLOCKIFY_WORKSPACE_ID: "",
            },
            stdio: "inherit",
        },
    );
}

async function main() {
    const { apiKey, workspaceId } = validateLiveEnvironment(process.env);
    const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
    }).trim();
    const manifestPath = path.join(root, contract.manifestPath);
    const previousManifestBytes = fs.readFileSync(manifestPath);
    validateTrackedBaseline(baseCommit, previousManifestBytes);

    const { campaignInputBytes, inputBefore, artifactBefore } = buildVerifiedSdkArtifact({
        captureInputs: () => captureCampaignInputSnapshot(root, contract.campaignInputs),
        build: buildSdkArtifact,
        hashArtifact: () => hashArtifactTree(path.join(root, "wrapper/dist")),
    });
    const previousManifestSha256 = sha256Hex(previousManifestBytes);

    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clockify115-live-campaign-"));
    const snapshotRoot = path.join(temporaryRoot, "repo");
    try {
        copyCampaignSnapshot(snapshotRoot, campaignInputBytes, previousManifestBytes);
        const snapshotArtifact = hashArtifactTree(path.join(snapshotRoot, "wrapper/dist"));
        if (!sameArtifact(artifactBefore, snapshotArtifact)) {
            throw Object.assign(new Error("SDK artifact changed while creating the snapshot"), {
                code: "live_campaign_artifact_snapshot_changed",
            });
        }
        const worker = await runChildWithGracefulTermination(
            process.execPath,
            [path.join(snapshotRoot, "scripts/live/generate-live-evidence-manifest.mjs")],
            {
                cwd: snapshotRoot,
                env: {
                    ...process.env,
                    CLOCKIFY_LIVE_EVIDENCE_WORKER: "1",
                    CLOCKIFY_LIVE_BASE_COMMIT: baseCommit,
                },
                timeoutMs: WORKER_TIMEOUT_MS,
                cleanupGraceMs: LIVE_CAMPAIGN_CLEANUP_GRACE_MS,
                maxBufferBytes: WORKER_OUTPUT_LIMIT_BYTES,
            },
        );
        const safeStdout = sanitizedOutput(worker.stdout, [apiKey, workspaceId]);
        const safeStderr = sanitizedOutput(worker.stderr, [apiKey, workspaceId]);
        if (safeStdout) process.stdout.write(safeStdout);
        if (safeStderr) process.stderr.write(safeStderr);
        if (
            worker.status !== 0 ||
            worker.forced ||
            worker.timedOut ||
            worker.interruptionSignal ||
            worker.outputExceeded
        ) {
            const code = worker.forced
                ? "live_campaign_cleanup_timeout"
                : worker.timedOut
                  ? "live_campaign_timeout"
                  : worker.interruptionSignal
                    ? "live_campaign_interrupted"
                    : worker.outputExceeded
                      ? "live_campaign_output_limit"
                      : "live_campaign_failed";
            throw Object.assign(new Error("isolated live-evidence worker failed"), {
                code,
            });
        }

        const inputAfter = hashRelativeFiles(contract.campaignInputs, (relativePath) =>
            fs.readFileSync(path.join(root, relativePath)),
        );
        const artifactAfter = hashArtifactTree(path.join(root, "wrapper/dist"));
        const currentManifestBytes = fs.readFileSync(manifestPath);
        if (!sameHashes(inputBefore, inputAfter) || !sameArtifact(artifactBefore, artifactAfter)) {
            throw Object.assign(new Error("campaign inputs or SDK artifact changed during proof"), {
                code: "live_campaign_snapshot_changed",
            });
        }
        if (sha256Hex(currentManifestBytes) !== previousManifestSha256) {
            throw Object.assign(new Error("live manifest changed during proof"), {
                code: "live_previous_manifest_changed",
            });
        }

        const candidateDirectory = path.join(snapshotRoot, "scripts/live/.manifest-work");
        const requiredCandidates = [
            "live-evidence-manifest.candidate.json",
            "live-evidence-campaign-receipt.candidate.json",
        ];
        if (
            requiredCandidates.some(
                (candidate) => !fs.existsSync(path.join(candidateDirectory, candidate)),
            )
        ) {
            throw Object.assign(new Error("isolated worker did not emit both candidate artifacts"), {
                code: "live_campaign_candidates_missing",
            });
        }
        const manifestCandidate = fs.readFileSync(
            path.join(candidateDirectory, "live-evidence-manifest.candidate.json"),
        );
        const receiptCandidate = fs.readFileSync(
            path.join(candidateDirectory, "live-evidence-campaign-receipt.candidate.json"),
        );
        const manifest = JSON.parse(manifestCandidate.toString("utf8"));
        const receipt = JSON.parse(receiptCandidate.toString("utf8"));
        const sourceLock = JSON.parse(
            campaignInputBytes.get("docs/openapi-source-lock.json").toString("utf8"),
        );
        const operationInventory = JSON.parse(
            campaignInputBytes.get("docs/openapi-operations.json").toString("utf8"),
        ).operations;
        const validationErrors = [
            ...validateLiveEvidenceManifest(manifest, { sourceLock, operationInventory }),
            ...validateCampaignReceipt(receipt, {
                manifest,
                manifestSha256: sha256Hex(manifestCandidate),
                campaignInputs: contract.campaignInputs,
                campaignInputHashes: inputBefore.hashes,
                sdkArtifact: artifactBefore,
                baseCommitExists: (commit) => commit === baseCommit,
            }),
        ];
        if (
            validationErrors.length > 0 ||
            !manifestCandidate.equals(canonicalJsonBytes(manifest)) ||
            !receiptCandidate.equals(canonicalJsonBytes(receipt)) ||
            receipt.previousManifestSha256 !== previousManifestSha256
        ) {
            throw Object.assign(
                new Error(`isolated campaign artifact rejected: ${validationErrors.join("; ")}`),
                { code: "live_campaign_artifact_invalid" },
            );
        }

        const outputDirectory = path.join(root, "scripts/live/.manifest-work");
        writeFileAtomic(
            path.join(outputDirectory, "live-evidence-campaign-receipt.candidate.json"),
            receiptCandidate,
        );
        writeFileAtomic(
            path.join(outputDirectory, "live-evidence-manifest.candidate.json"),
            manifestCandidate,
        );
        console.log(
            `Isolated candidates copied to ${path.relative(root, outputDirectory)} (base ${baseCommit}).`,
        );
    } finally {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
}

if (isDirectInvocation(process.argv[1], import.meta.filename)) {
    main().catch((error) => {
        const code = typeof error?.code === "string" ? error.code : "live_campaign_launcher_failed";
        console.error(`[campaign-launcher-failed] ${code}`);
        process.exitCode = 1;
    });
}
