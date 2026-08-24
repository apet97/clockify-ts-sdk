#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    requireDigestImageReference,
    verifyRemoteImage,
} from "../mcp/scripts/container-service-proof-image.mjs";
import { createProofProcessRunner } from "../mcp/scripts/container-service-proof-process.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NODE_IMAGE = requireDigestImageReference(
    process.env.CLOCKIFY_MCP_NODE_IMAGE ??
        "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
    "CLOCKIFY_MCP_NODE_IMAGE",
);
const proofId = `${process.pid}-${randomBytes(5).toString("hex")}`;
const label = `io.apet97.clockify115.container-smoke=${proofId}`;
const names = {
    image: `clockify115-mcp-remote-proof:${proofId}`,
    canaryImage: `clockify115-mcp-context-canary:${proofId}`,
    help: `clockify-mcp-smoke-help-${proofId}`,
    adminHelp: `clockify-mcp-smoke-admin-${proofId}`,
    versions: `clockify-mcp-smoke-versions-${proofId}`,
};
const ownedContainerNames = new Set([names.help, names.adminHelp, names.versions]);
const processRunner = createProofProcessRunner({
    cwd: REPOSITORY_ROOT,
    ownedContainerNames,
});
const run = processRunner.run;
let candidateImageId;
let canaryImageId;
let temporaryDirectory;
let nodePresentBefore;
let failure;

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => processRunner.interrupt(signal));
}

try {
    await smokeContainer();
} catch (error) {
    failure = error;
}

try {
    await cleanup();
} catch (error) {
    failure ??= error;
}

if (processRunner.interruptedSignal) {
    failure ??= new Error(`smoke interrupted by ${processRunner.interruptedSignal}`);
}

if (failure) {
    process.stderr.write(`MCP remote container smoke failed: ${safeFailureDetail(failure)}\n`);
    process.exitCode =
        processRunner.interruptedSignal === "SIGINT"
            ? 130
            : processRunner.interruptedSignal
              ? 143
              : 1;
} else {
    process.stdout.write("MCP remote container smoke passed\n");
}

async function smokeContainer() {
    await run("docker", ["version", "--format", "{{.Server.Version}}"], {
        timeoutMs: 15_000,
    });
    nodePresentBefore = await imageExists(NODE_IMAGE);
    const lock = JSON.parse(await readFile(join(REPOSITORY_ROOT, "package-lock.json"), "utf8"));
    const mcpVersion = lock.packages?.["mcp"]?.version;
    if (typeof mcpVersion !== "string" || !mcpVersion) {
        throw new Error("MCP package version is missing from package-lock.json");
    }
    await assertBuildContextAllowlist();
    await run(
        "docker",
        [
            "build",
            "--file",
            "mcp/Dockerfile.remote",
            "--label",
            label,
            "--build-arg",
            `NODE_IMAGE=${NODE_IMAGE}`,
            "--build-arg",
            "SOURCE_REVISION=container-smoke",
            "--build-arg",
            `IMAGE_VERSION=${mcpVersion}`,
            "--tag",
            names.image,
            ".",
        ],
        { timeoutMs: 20 * 60_000 },
    );

    candidateImageId = (
        await run("docker", ["image", "inspect", "--format", "{{.Id}}", names.image], {
            timeoutMs: 15_000,
        })
    ).trim();
    await verifyRemoteImage({
        run,
        imageId: candidateImageId,
        containerName: names.versions,
        label,
        packageLock: lock,
        expectedRevision: "container-smoke",
        expectedVersion: mcpVersion,
    });

    const help = await runCandidateContainer(names.help, [], ["--help"]);
    if (!/usage|clockify115-mcp-http/iu.test(help)) {
        throw new Error("remote image --help output is missing its usage marker");
    }
    const adminHelp = await runCandidateContainer(
        names.adminHelp,
        ["--entrypoint", "node"],
        ["/srv/clockify-mcp/mcp/dist/admin.js", "--help"],
    );
    if (!adminHelp.includes("clockify115-mcp-admin")) {
        throw new Error("remote image admin entrypoint is not executable");
    }
}

async function assertBuildContextAllowlist() {
    const readme = await stat(join(REPOSITORY_ROOT, "README.md"));
    if (!readme.isFile()) throw new Error("Docker context canary README.md is not a regular file");
    const dockerignore = await readFile(join(REPOSITORY_ROOT, ".dockerignore"), "utf8");
    const firstRule = dockerignore
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith("#"));
    if (firstRule !== "**") {
        throw new Error("Docker build context does not start with the fail-closed ** rule");
    }
    temporaryDirectory = await mkdtemp(join(tmpdir(), "clockify-mcp-context-"));
    const dockerfile = join(temporaryDirectory, "Dockerfile");
    await writeFile(dockerfile, "FROM scratch\nCOPY README.md /unexpected\n", {
        mode: 0o600,
    });
    const result = await run(
        "docker",
        [
            "build",
            "--progress",
            "plain",
            "--file",
            dockerfile,
            "--label",
            label,
            "--tag",
            names.canaryImage,
            ".",
        ],
        { allowFailure: true, timeoutMs: 5 * 60_000 },
    );
    if (result.code === 0) {
        canaryImageId = (
            await run("docker", ["image", "inspect", "--format", "{{.Id}}", names.canaryImage], {
                timeoutMs: 15_000,
            })
        ).trim();
        throw new Error("Docker build context included an unallowlisted root file");
    }
    const diagnostic = `${result.stdout}\n${result.stderr}`.replace(
        // eslint-disable-next-line no-control-regex
        /\x1b\[[0-9;]*m/gu,
        "",
    );
    const identifiesCopy = diagnostic.includes("COPY README.md /unexpected");
    const identifiesMissingContext =
        diagnostic.includes('"/README.md": not found') ||
        (diagnostic.includes("file not found in build context or excluded by .dockerignore") &&
            diagnostic.includes("README.md"));
    if (!identifiesCopy || !identifiesMissingContext) {
        throw new Error("Docker context canary failed without the expected README exclusion");
    }
}

async function runCandidateContainer(containerName, dockerOptions, command) {
    if (!candidateImageId) throw new Error("remote candidate image id is unavailable");
    return await run(
        "docker",
        [
            "run",
            "--rm",
            "--name",
            containerName,
            "--label",
            label,
            "--network",
            "none",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges:true",
            ...dockerOptions,
            candidateImageId,
            ...command,
        ],
        { containerName, timeoutMs: 2 * 60_000 },
    );
}

async function imageExists(image) {
    const result = await run("docker", ["image", "inspect", image], {
        allowFailure: true,
        timeoutMs: 15_000,
    });
    if (result.code === 0) return true;
    if (result.stderr.includes("No such image:")) return false;
    throw new Error("Docker image presence check failed");
}

async function cleanup() {
    processRunner.beginCleanup();
    let cleanupFailure;
    const attempt = async (operation) => {
        try {
            return await operation();
        } catch (error) {
            cleanupFailure ??= error;
            return undefined;
        }
    };

    try {
        for (const container of ownedContainerNames) {
            await attempt(() =>
                run("docker", ["container", "rm", "--force", container], {
                    allowFailure: true,
                    timeoutMs: 30_000,
                }),
            );
        }
        const labeledContainers = await attempt(() =>
            run("docker", ["container", "ls", "--all", "--quiet", "--filter", `label=${label}`], {
                timeoutMs: 15_000,
            }),
        );
        if (typeof labeledContainers === "string") {
            for (const containerId of labeledContainers.trim().split(/\s+/u).filter(Boolean)) {
                await attempt(() =>
                    run("docker", ["container", "rm", "--force", containerId], {
                        allowFailure: true,
                        timeoutMs: 30_000,
                    }),
                );
            }
        }
        for (const image of new Set(
            [names.image, candidateImageId, names.canaryImage, canaryImageId].filter(Boolean),
        )) {
            await attempt(() =>
                run("docker", ["image", "rm", "--force", image], {
                    allowFailure: true,
                    timeoutMs: 2 * 60_000,
                }),
            );
        }
        if (nodePresentBefore === false) {
            await attempt(() =>
                run("docker", ["image", "rm", NODE_IMAGE], {
                    allowFailure: true,
                    timeoutMs: 2 * 60_000,
                }),
            );
        }
        await attempt(assertNoOwnedResources);
        if (nodePresentBefore === false) {
            const nodeRemains = await attempt(() => imageExists(NODE_IMAGE));
            if (nodeRemains === true) {
                cleanupFailure ??= new Error("smoke-pulled Node image remains");
            }
        }
    } finally {
        if (temporaryDirectory) {
            try {
                await rm(temporaryDirectory, { recursive: true, force: true });
            } catch (error) {
                cleanupFailure ??= error;
            }
        }
    }

    if (cleanupFailure) throw cleanupFailure;
}

async function assertNoOwnedResources() {
    for (const args of [
        ["container", "ls", "--all", "--quiet", "--filter", `label=${label}`],
        ["image", "ls", "--quiet", "--filter", `label=${label}`],
    ]) {
        const output = await run("docker", args, { timeoutMs: 15_000 });
        if (output.trim()) throw new Error(`owned Docker ${args[0]} resources remain`);
    }
    for (const container of ownedContainerNames) {
        const result = await run("docker", ["container", "inspect", container], {
            allowFailure: true,
            timeoutMs: 5_000,
        });
        if (result.code === 0) throw new Error(`owned Docker container ${container} remains`);
        if (!result.stderr.includes("No such container:")) {
            throw new Error("Docker container absence check failed");
        }
    }
    for (const image of new Set(
        [names.image, candidateImageId, names.canaryImage, canaryImageId].filter(Boolean),
    )) {
        if (await imageExists(image)) throw new Error(`owned Docker image ${image} remains`);
    }
}

function safeFailureDetail(error) {
    if (error instanceof Error) return error.message.replace(/[\r\n]+/gu, " ").slice(0, 240);
    return "unknown failure";
}
