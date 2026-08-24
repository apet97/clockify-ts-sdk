#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { proveAdminCli } from "./remote-proof-admin.mjs";
import { proveAuthenticationAndHttp } from "./remote-proof-auth.mjs";
import { proveBackupRestore, proveMigrations } from "./remote-proof-database.mjs";
import {
    createProofProcessRunner,
    safeFailureDetail,
    withDeadline,
} from "./remote-proof-process.mjs";
import { proveRuntimeRole } from "./remote-proof-runtime-role.mjs";
import { proveStorageAndEncryption } from "./remote-proof-storage.mjs";

const POSTGRES_IMAGE =
    "postgres:17.11-bookworm@sha256:84560e3b9c6874893fc4e2854f5dc3e7c1a37bc9d1dfd7a8c641310ae22ba5ad";
const ISSUER = "https://issuer.proof.invalid/";
const RESOURCE = new URL("https://mcp.proof.invalid/mcp");
const PROOF_WORKSPACE_ID = "00000000000000000000c115";

const proofId = `${process.pid}_${randomBytes(5).toString("hex")}`;
const containerName = `clockify_mcp_proof_${proofId}`;
const volumeName = `${containerName}_data`;
const databaseName = `clockify_mcp_${proofId}`;
const databaseUser = "clockify_mcp_proof";
const databasePassword = randomBytes(32).toString("base64url");
let directory;
let pool;
let containerAttempted = false;
let phase = "bootstrap";
let interruptedSignal;
let proofReceipt;
let proofFailure;
let proofFailurePhase;
const processRunner = createProofProcessRunner();
const { run, runCaptured } = processRunner;
let createClockifyMcpHttpHandler;
let HybridClockifyTokenVerifier;
let PostgresConfirmationStore;
let createPostgresContextResolver;
let PostgresCredentialStore;
let AesGcmKeyring;
let PostgresEncryptionService;
let migrateDatabase;
let verifyDatabaseMigrations;
let PostgresPool;

const signalHandlers = new Map();
for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = () => {
        interruptedSignal ??= signal;
        processRunner.terminateAll();
    };
    signalHandlers.set(signal, handler);
    process.once(signal, handler);
}

try {
    phase = "candidate-build";
    await run("npm", ["run", "build", "-w", "@apet97/clockify-mcp-115"]);
    await loadCandidate();
    phase = "temporary-files";
    directory = await mkdtemp(join(tmpdir(), "clockify-mcp-remote-proof-"));
    phase = "container-start";
    const platform = await dockerPlatform();
    await run("docker", ["pull", "--platform", platform, POSTGRES_IMAGE]);
    const envFile = join(directory, "postgres.env");
    await writeFile(
        envFile,
        `POSTGRES_USER=${databaseUser}\nPOSTGRES_PASSWORD=${databasePassword}\nPOSTGRES_DB=${databaseName}\n`,
        { mode: 0o600 },
    );
    await run("docker", [
        "volume",
        "create",
        "--label",
        `io.apet97.clockify115.mcp-remote-proof=${proofId}`,
        volumeName,
    ]);
    containerAttempted = true;
    await run("docker", [
        "run",
        "--detach",
        "--name",
        containerName,
        "--platform",
        platform,
        "--env-file",
        envFile,
        "--publish",
        "127.0.0.1::5432",
        "--mount",
        `type=volume,source=${volumeName},destination=/var/lib/postgresql/data`,
        POSTGRES_IMAGE,
    ]);
    await waitForPostgres();
    const portOutput = await run("docker", ["port", containerName, "5432/tcp"]);
    const port = requireMappedPort(portOutput);
    pool = PostgresPool.fromConnectionString(
        `postgresql://${databaseUser}:${encodeURIComponent(databasePassword)}@127.0.0.1:${port}/${databaseName}?sslmode=disable`,
    );

    phase = "migrations";
    await proveMigrations({
        database: pool,
        directory,
        modules: { migrateDatabase, verifyDatabaseMigrations },
        setPhase: (nextPhase) => {
            phase = nextPhase;
        },
        assertNotInterrupted,
    });
    assertNotInterrupted();
    phase = "storage-encryption";
    const storage = await proveStorageAndEncryption({
        database: pool,
        issuer: ISSUER,
        workspaceId: PROOF_WORKSPACE_ID,
        modules: {
            AesGcmKeyring,
            PostgresConfirmationStore,
            PostgresCredentialStore,
            PostgresEncryptionService,
        },
        setPhase: (nextPhase) => {
            phase = nextPhase;
        },
        assertNotInterrupted,
    });
    assertNotInterrupted();
    phase = "backup-restore";
    const recovery = await proveBackupRestore({
        port,
        storage,
        proofId,
        containerName,
        databaseName,
        databaseUser,
        databasePassword,
        issuer: ISSUER,
        modules: {
            PostgresPool,
            verifyDatabaseMigrations,
            PostgresEncryptionService,
            PostgresCredentialStore,
        },
        run,
        withDeadline,
    });
    assertNotInterrupted();
    phase = "runtime-role";
    await proveRuntimeRole({ database: pool, databaseName, storage, issuer: ISSUER,
        modules: { PostgresConfirmationStore, PostgresCredentialStore, PostgresEncryptionService,
            verifyDatabaseMigrations } });
    assertNotInterrupted();
    phase = "authentication-http";
    await proveAuthenticationAndHttp({
        database: pool,
        storage,
        directory,
        issuer: ISSUER,
        resource: RESOURCE,
        workspaceId: PROOF_WORKSPACE_ID,
        HybridClockifyTokenVerifier,
        createClockifyMcpHttpHandler,
        createPostgresContextResolver,
        PostgresCredentialStore,
    });
    assertNotInterrupted();
    phase = "node-ingress";
    await proveNodeIngress();
    assertNotInterrupted();
    phase = "admin-cli";
    await proveAdminCli({
        run,
        runCaptured,
        port,
        storage,
        database: pool,
        directory,
        databaseUser,
        databasePassword,
        databaseName,
        issuer: ISSUER,
        workspaceId: PROOF_WORKSPACE_ID,
    });
    assertNotInterrupted();
    proofReceipt = {
        ok: true,
        postgres: "17.11-bookworm",
        migrations: "checksum-verified",
        authentication: ["jwt", "opaque"],
        remoteTools: { clockify_status: ["jwt", "opaque"] },
        admin: "stdin-credential-lifecycle",
        confirmations: "atomic-and-isolated",
        encryption: "rotated-and-retireable",
        recovery,
    };
} catch (error) {
    proofFailure = error;
    proofFailurePhase = phase;
}

phase = "cleanup";
let cleanupFailure;
try {
    await cleanup();
} catch (error) {
    cleanupFailure = error;
}
for (const [signal, handler] of signalHandlers) process.off(signal, handler);
if (!proofFailure && interruptedSignal) {
    proofFailure = new Error(`remote proof interrupted by ${interruptedSignal}`);
    proofFailurePhase = phase;
}
if (proofFailure || cleanupFailure) {
    const error = proofFailure ?? cleanupFailure;
    const failureCode =
        error && typeof error === "object" && typeof error.code === "string"
            ? error.code
            : "unclassified";
    process.stderr.write(
        `${JSON.stringify({
            ok: false,
            error: proofFailure ? "remote_proof_failed" : "remote_proof_cleanup_failed",
            phase: proofFailure ? proofFailurePhase : "cleanup",
            failureCode,
            ...(proofFailure && cleanupFailure ? { cleanup: "failed" } : {}),
            detail: safeFailureDetail(error),
        })}\n`,
    );
    process.exitCode = cleanupFailure
        ? 1
        : interruptedSignal === "SIGINT"
          ? 130
          : interruptedSignal
            ? 143
            : 1;
} else {
    process.stdout.write(`${JSON.stringify(proofReceipt)}\n`);
}

async function loadCandidate() {
    const [http, auth, confirmations, context, credentials, crypto, encryption, migrations, postgres] =
        await Promise.all([
            import("../dist/http.js"),
            import("../dist/remote/auth.js"),
            import("../dist/remote/confirmations.js"),
            import("../dist/remote/context.js"),
            import("../dist/remote/credentials.js"),
            import("../dist/remote/crypto.js"),
            import("../dist/remote/encryption.js"),
            import("../dist/remote/migrations.js"),
            import("../dist/remote/postgres.js"),
        ]);
    createClockifyMcpHttpHandler = http.createClockifyMcpHttpHandler;
    HybridClockifyTokenVerifier = auth.HybridClockifyTokenVerifier;
    PostgresConfirmationStore = confirmations.PostgresConfirmationStore;
    createPostgresContextResolver = context.createPostgresContextResolver;
    PostgresCredentialStore = credentials.PostgresCredentialStore;
    AesGcmKeyring = crypto.AesGcmKeyring;
    PostgresEncryptionService = encryption.PostgresEncryptionService;
    migrateDatabase = migrations.migrateDatabase;
    verifyDatabaseMigrations = migrations.verifyDatabaseMigrations;
    PostgresPool = postgres.PostgresPool;
}

async function proveNodeIngress() {
    const result = await run(process.execPath, [
        new URL("./remote-proof-ingress.mjs", import.meta.url).pathname,
    ]);
    const receipt = JSON.parse(result);
    assert(receipt.ok === true && receipt.ingress === "bounded-admitted-and-abort-safe",
        "Node ingress proof failed");
}

async function dockerPlatform() {
    const architecture = (await run("docker", ["info", "--format", "{{.Architecture}}"])).trim();
    let platform;
    if (architecture === "aarch64" || architecture === "arm64") platform = "linux/arm64";
    else if (architecture === "x86_64" || architecture === "amd64") platform = "linux/amd64";
    else throw new Error("unsupported Docker architecture");
    const index = JSON.parse(
        await run("docker", ["manifest", "inspect", POSTGRES_IMAGE]),
    );
    const [os, arch] = platform.split("/");
    assert(
        Array.isArray(index.manifests) &&
            index.manifests.some(
                (entry) => entry?.platform?.os === os && entry.platform.architecture === arch,
            ),
        "pinned PostgreSQL index does not contain the local platform",
    );
    return platform;
}

async function waitForPostgres() {
    let lastPrimary = "unavailable";
    for (let attempt = 0; attempt < 60; attempt += 1) {
        assertNotInterrupted();
        const processes = await run(
            "docker",
            ["exec", containerName, "cat", "/proc/1/comm"],
            true,
        );
        const primary = processes?.trim();
        lastPrimary = primary ?? "unavailable";
        if (primary !== "postgres") {
            await new Promise((resolve) => setTimeout(resolve, 250));
            continue;
        }
        const result = await run(
            "docker",
            ["exec", containerName, "pg_isready", "-U", databaseUser, "-d", databaseName],
            true,
        );
        if (result !== undefined) return;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`PostgreSQL did not become ready (${lastPrimary})`);
}

function requireMappedPort(output) {
    const match = output.trim().match(/:(\d+)$/u);
    if (!match) throw new Error("Docker did not publish PostgreSQL");
    return Number(match[1]);
}

async function cleanup() {
    processRunner.beginCleanup();
    let failure;
    const database = pool;
    pool = undefined;
    if (database) {
        try {
            await withDeadline(
                database.end(),
                10_000,
                "PostgreSQL pool did not close during cleanup",
            );
        } catch (error) {
            failure = error;
        }
    }
    if (containerAttempted) {
        try {
            for (let attempt = 0; attempt < 5; attempt += 1) {
                await run("docker", ["rm", "--force", "--volumes", containerName], true);
                const remaining = await containerNames();
                if (!remaining.trim()) {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    if (!(await containerNames()).trim()) break;
                }
                if (attempt === 4) {
                    throw new Error("proof PostgreSQL container remains after cleanup");
                }
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
        } catch (error) {
            failure ??= error;
        }
    }
    try {
        await run("docker", ["volume", "rm", "--force", volumeName], true);
        if ((await proofVolumeNames()).trim()) {
            throw new Error("proof PostgreSQL volume remains after cleanup");
        }
    } catch (error) {
        failure ??= error;
    }
    if (directory) {
        const temporaryDirectory = directory;
        directory = undefined;
        try {
            await rm(temporaryDirectory, { recursive: true, force: true });
        } catch (error) {
            failure ??= error;
        }
    }
    if (failure !== undefined) throw failure;
}

async function containerNames() {
    return await run("docker", [
        "ps",
        "--all",
        "--filter",
        `name=^/${containerName}$`,
        "--format",
        "{{.Names}}",
    ]);
}

async function proofVolumeNames() {
    return await run("docker", ["volume", "ls", "--filter", `name=^${volumeName}$`, "--format", "{{.Name}}"]);
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function assertNotInterrupted() {
    if (interruptedSignal) throw new Error("remote proof interrupted");
}
