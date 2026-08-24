#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { exportJWK, generateKeyPair, SignJWT } from "jose";

import {
    requireDigestImageReference,
    verifyRemoteImage,
} from "./container-service-proof-image.mjs";
import { createProofProcessRunner } from "./container-service-proof-process.mjs";
import {
    mappedPort,
    proveReplicaRuntime,
    proveStartupFailureSignalRace,
    readContainerLogs,
    waitForServiceReady,
} from "./container-service-proof-runtime.mjs";

const POSTGRES_IMAGE = requireDigestImageReference(
    process.env.CLOCKIFY_MCP_POSTGRES_IMAGE ??
        "postgres:17.11-bookworm@sha256:84560e3b9c6874893fc4e2854f5dc3e7c1a37bc9d1dfd7a8c641310ae22ba5ad",
    "CLOCKIFY_MCP_POSTGRES_IMAGE",
);
const NODE_IMAGE = requireDigestImageReference(
    process.env.CLOCKIFY_MCP_NODE_IMAGE ??
        "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
    "CLOCKIFY_MCP_NODE_IMAGE",
);
const PUBLIC_URL = new URL("https://mcp.proof.invalid/mcp");
const PUBLIC_HOST = PUBLIC_URL.host;
const OAUTH_CLIENT_ID = "clockify-container-proof";
const OAUTH_ISSUER = "https://oauth-proof:8443/";
const WORKSPACE_ID = "00000000000000000000c115";
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../..");
const CONTAINER_HELPER = join(SCRIPT_DIRECTORY, "container-service-proof-container.mjs");

const proofId = `${process.pid}-${randomBytes(5).toString("hex")}`;
const label = `io.apet97.clockify115.container-service-proof=${proofId}`;
const names = {
    image: `clockify115-mcp-container-proof:${proofId}`,
    network: `clockify-mcp-proof-${proofId}`,
    postgres: `clockify-mcp-proof-postgres-${proofId}`,
    oauth: `clockify-mcp-proof-oauth-${proofId}`,
    service: `clockify-mcp-proof-service-${proofId}`,
    serviceB: `clockify-mcp-proof-service-b-${proofId}`,
    seed: `clockify-mcp-proof-seed-${proofId}`,
    provision: `clockify-mcp-proof-provision-${proofId}`,
    oauthProbe: `clockify-mcp-proof-oauth-probe-${proofId}`,
    imageVerify: `clockify-mcp-proof-image-verify-${proofId}`,
    migrationLock: `clockify-mcp-proof-migration-lock-${proofId}`,
    raceService: `clockify-mcp-proof-race-service-${proofId}`,
    credentialLock: `clockify-mcp-proof-credential-lock-${proofId}`,
    queryWaiter: `clockify-mcp-proof-query-waiter-${proofId}`,
    fingerprint: `clockify-mcp-proof-fingerprint-${proofId}`,
    secrets: `clockify-mcp-proof-secrets-${proofId}`,
    data: `clockify-mcp-proof-data-${proofId}`,
};
const database = {
    name: `clockify_mcp_${proofId.replaceAll("-", "_")}`,
    user: "clockify_mcp_proof",
};
const ownedContainerNames = new Set([
    names.postgres,
    names.oauth,
    names.service,
    names.serviceB,
    names.seed,
    names.provision,
    names.oauthProbe,
    names.imageVerify,
    names.migrationLock,
    names.raceService,
    names.credentialLock,
    names.queryWaiter,
    names.fingerprint,
]);
let phase = "bootstrap";
let temporaryDirectory;
let postgresPresentBefore;
let nodePresentBefore;
let evidence;
let failure;
let candidateImageId;
const processRunner = createProofProcessRunner({
    cwd: REPOSITORY_ROOT,
    ownedContainerNames,
});
const run = processRunner.run;

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => processRunner.interrupt(signal));
}

try {
    evidence = await proveContainerService();
} catch (error) {
    failure = error;
}

try {
    await cleanup();
} catch (error) {
    failure ??= error;
}

if (processRunner.interruptedSignal) {
    failure ??= new Error(`proof interrupted by ${processRunner.interruptedSignal}`);
}

if (failure) {
    process.stderr.write(
        `${JSON.stringify({
            ok: false,
            error: "container_service_proof_failed",
            phase,
            detail: safeFailureDetail(failure),
        })}\n`,
    );
    process.exitCode =
        processRunner.interruptedSignal === "SIGINT"
            ? 130
            : processRunner.interruptedSignal
              ? 143
              : 1;
} else {
    process.stdout.write(
        `${JSON.stringify({ ...evidence, cleanup: "verified-no-owned-resources" })}\n`,
    );
}

async function proveContainerService() {
    phase = "prerequisites";
    await run("docker", ["version", "--format", "{{.Server.Version}}"]);
    await run("openssl", ["version"]);
    const platform = await dockerPlatform();
    postgresPresentBefore = await imageExists(POSTGRES_IMAGE);
    nodePresentBefore = await imageExists(NODE_IMAGE);
    const packageLock = JSON.parse(
        await readFile(join(REPOSITORY_ROOT, "package-lock.json"), "utf8"),
    );
    const mcpVersion = packageLock.packages?.["mcp"]?.version;
    assert(
        typeof mcpVersion === "string" && Boolean(mcpVersion),
        "MCP package version is missing from package-lock.json",
    );

    phase = "temporary-material";
    temporaryDirectory = await mkdtemp(join(tmpdir(), "clockify-mcp-container-service-proof-"));
    const tlsKey = join(temporaryDirectory, "tls.key");
    const tlsCertificate = join(temporaryDirectory, "tls.crt");
    await run("openssl", [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        tlsKey,
        "-out",
        tlsCertificate,
        "-days",
        "1",
        "-subj",
        "/CN=oauth-proof",
        "-addext",
        "subjectAltName=DNS:oauth-proof",
    ]);
    await chmod(tlsKey, 0o600);

    const databasePassword = randomBytes(32).toString("base64url");
    const oauthClientSecret = randomBytes(32).toString("base64url");
    const clockifyApiKey = `synthetic-proof-${randomBytes(24).toString("base64url")}`;
    const keyringKey = randomBytes(32).toString("base64");
    const opaqueToken = `opaque_${randomBytes(36).toString("base64url")}`;
    const subject = `container-proof-${proofId}`;
    const signing = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(signing.publicKey);
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
    const claims = {
        active: true,
        iss: OAUTH_ISSUER,
        sub: subject,
        client_id: "proof-client",
        aud: PUBLIC_URL.href,
        resource: PUBLIC_URL.href,
        exp: expiresAt,
        scope: "clockify:read clockify:write clockify:admin",
    };
    const jwt = await new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "container-proof", typ: "JWT" })
        .sign(signing.privateKey);
    const sensitiveValues = [
        databasePassword,
        oauthClientSecret,
        clockifyApiKey,
        keyringKey,
        opaqueToken,
        jwt,
    ];

    phase = "candidate-image";
    await run(
        "docker",
        [
            "build",
            "--platform",
            platform,
            "--file",
            "mcp/Dockerfile.remote",
            "--tag",
            names.image,
            "--label",
            label,
            "--build-arg",
            `NODE_IMAGE=${NODE_IMAGE}`,
            "--build-arg",
            "SOURCE_REVISION=container-service-proof",
            "--build-arg",
            `IMAGE_VERSION=${mcpVersion}`,
            ".",
        ],
        { timeoutMs: 20 * 60_000 },
    );
    const imageId = (
        await run("docker", ["image", "inspect", "--format", "{{.Id}}", names.image])
    ).trim();
    assert(/^sha256:[0-9a-f]{64}$/u.test(imageId), "candidate image id is not immutable");
    candidateImageId = imageId;
    phase = "candidate-image-verify";
    await verifyRemoteImage({
        run,
        imageId,
        containerName: names.imageVerify,
        label,
        packageLock,
        expectedRevision: "container-service-proof",
        expectedVersion: mcpVersion,
    });

    phase = "owned-infrastructure";
    await run("docker", ["network", "create", "--label", label, names.network]);
    for (const volume of [names.secrets, names.data]) {
        await run("docker", ["volume", "create", "--label", label, volume]);
    }

    phase = "mode-0600-secrets";
    const fixture = JSON.stringify({
        clientId: OAUTH_CLIENT_ID,
        opaqueToken,
        jwk: { ...publicJwk, alg: "RS256", kid: "container-proof", use: "sig" },
        claims,
    });
    const seed = JSON.stringify({
        files: [
            secretFile("postgres-password", `${databasePassword}\n`, 999),
            secretFile(
                "postgres.pgpass",
                `postgres-proof:5432:${database.name}:${database.user}:${databasePassword}\n`,
                1000,
            ),
            secretFile("oauth-client-secret", `${oauthClientSecret}\n`, 1000),
            secretFile(
                "keyring.json",
                JSON.stringify({
                    version: 1,
                    activeKeyId: "container-proof",
                    keys: { "container-proof": keyringKey },
                }),
                1000,
            ),
            secretFile("clockify-api-key", `${clockifyApiKey}\n`, 1000),
            secretFile("fixture.json", fixture, 1000),
            secretFile("tls.key", await readFile(tlsKey), 1000),
            secretFile("tls.crt", await readFile(tlsCertificate), 1000),
        ],
    });
    await runDockerHelper("seed", {
        name: names.seed,
        platform,
        user: "0:0",
        capAdd: ["CHOWN"],
        noNewPrivileges: false,
        input: seed,
        mounts: [`type=volume,source=${names.secrets},destination=/run/clockify-mcp-proof`],
    });

    phase = "postgres-start";
    await run(
        "docker",
        [
            "run",
            "--detach",
            "--name",
            names.postgres,
            "--platform",
            platform,
            "--label",
            label,
            "--network",
            names.network,
            "--network-alias",
            "postgres-proof",
            "--env",
            `POSTGRES_DB=${database.name}`,
            "--env",
            `POSTGRES_USER=${database.user}`,
            "--env",
            "POSTGRES_PASSWORD_FILE=/run/clockify-mcp-proof/postgres-password",
            "--mount",
            `type=volume,source=${names.secrets},destination=/run/clockify-mcp-proof,readonly`,
            "--mount",
            `type=volume,source=${names.data},destination=/var/lib/postgresql/data`,
            "--security-opt",
            "no-new-privileges:true",
            POSTGRES_IMAGE,
        ],
        { containerName: names.postgres, timeoutMs: 5 * 60_000 },
    );
    await waitForPostgres();

    phase = "oauth-start";
    await runDockerHelper("oauth", {
        platform,
        detachedName: names.oauth,
        networkAliases: ["oauth-proof"],
        env: [`PROOF_OAUTH_CLIENT_ID=${OAUTH_CLIENT_ID}`],
        mounts: [
            `type=volume,source=${names.secrets},destination=/run/clockify-mcp-proof,readonly`,
        ],
    });
    await waitForOAuth(platform);

    phase = "database-provision";
    const commonDatabaseEnvironment = databaseEnvironment();
    await runDockerHelper("provision", {
        name: names.provision,
        platform,
        env: [
            ...commonDatabaseEnvironment,
            `CLOCKIFY_MCP_OAUTH_ISSUER=${OAUTH_ISSUER}`,
            "CLOCKIFY_MCP_KEYRING_FILE=/run/clockify-mcp-proof/keyring.json",
            "PROOF_CLOCKIFY_API_KEY_FILE=/run/clockify-mcp-proof/clockify-api-key",
            `PROOF_SUBJECT=${subject}`,
            `PROOF_WORKSPACE_ID=${WORKSPACE_ID}`,
        ],
        mounts: [
            `type=volume,source=${names.secrets},destination=/run/clockify-mcp-proof,readonly`,
        ],
    });

    phase = "service-start";
    await run(
        "docker",
        serviceContainerArguments(names.service, platform, commonDatabaseEnvironment, true),
        { containerName: names.service, timeoutMs: 2 * 60_000 },
    );
    const runtimeUid = Number(
        (await run("docker", ["exec", names.service, "node", "-p", "process.getuid()"])).trim(),
    );
    assert(Number.isSafeInteger(runtimeUid) && runtimeUid > 0, "service is running as root");
    const readOnlyRoot = (
        await run("docker", [
            "inspect",
            "--format",
            "{{.HostConfig.ReadonlyRootfs}}",
            names.service,
        ])
    ).trim();
    assert(readOnlyRoot === "true", "service root filesystem is writable");
    const securityOptions = JSON.parse(
        await run("docker", [
            "inspect",
            "--format",
            "{{json .HostConfig.SecurityOpt}}",
            names.service,
        ]),
    );
    assert(
        Array.isArray(securityOptions) && securityOptions.includes("no-new-privileges:true"),
        "service does not enforce no-new-privileges",
    );
    const droppedCapabilities = JSON.parse(
        await run("docker", ["inspect", "--format", "{{json .HostConfig.CapDrop}}", names.service]),
    );
    assert(
        Array.isArray(droppedCapabilities) && droppedCapabilities.includes("ALL"),
        "service does not drop Linux capabilities",
    );

    phase = "service-ready";
    const port = await mappedPort(run, names.service, 3000);
    const ready = await waitForServiceReady({
        run,
        container: names.service,
        port,
        publicHost: PUBLIC_HOST,
    });
    assert(ready.status === 200, "ready endpoint did not return 200");

    phase = "replica-state-and-drain";
    const replicaRuntime = await proveReplicaRuntime({
        run,
        runDockerHelper,
        serviceContainerArguments,
        names,
        platform,
        databaseSettings: commonDatabaseEnvironment,
        publicHost: PUBLIC_HOST,
        portA: port,
        jwt,
        opaqueToken,
        sensitiveValues,
    });
    const oauthLogs = await readContainerLogs(run, names.oauth);
    assert(oauthLogs.includes('"route":"jwks"'), "JWT request did not use the owned JWKS fixture");
    assert(
        oauthLogs.includes('"route":"introspection","active":true'),
        "opaque request did not use successful introspection",
    );

    const state = JSON.parse(
        await run("docker", ["inspect", "--format", "{{json .State}}", names.service]),
    );
    assert(state.ExitCode === 0 && state.OOMKilled === false, "service exit state is unhealthy");
    phase = "lifecycle-race";
    const lifecycleRace = await proveStartupFailureSignalRace({
        run,
        runDockerHelper,
        serviceContainerArguments,
        names,
        platform,
        databaseSettings: commonDatabaseEnvironment,
        sensitiveValues,
    });

    return {
        ok: true,
        image: imageId,
        platform,
        postgres:
            "17.11-bookworm@sha256:84560e3b9c6874893fc4e2854f5dc3e7c1a37bc9d1dfd7a8c641310ae22ba5ad",
        runtime: { uid: runtimeUid, readOnlyRoot: true, noNewPrivileges: true },
        secrets: "mode-0600",
        migrations: "actual-image-apply-then-runtime-verify",
        http: { readyz: 200, discovery: ["jwt", "opaque"], stateless: true },
        replicaRuntime,
        lifecycleRace,
    };
}

async function runDockerHelper(action, options) {
    const containerName = options.detachedName ?? options.name;
    assert(typeof containerName === "string", "proof helper requires an owned container name");
    const args = [
        "run",
        ...(options.detachedName ? ["--detach"] : ["--rm"]),
        "--name",
        containerName,
        "--label",
        label,
        ...(options.input === undefined ? [] : ["--interactive"]),
        "--platform",
        options.platform,
        "--network",
        names.network,
        ...(options.networkAliases ?? []).flatMap((alias) => ["--network-alias", alias]),
        ...(options.user ? ["--user", options.user] : []),
        "--read-only",
        "--tmpfs",
        "/tmp:size=8m,mode=1777",
        "--cap-drop",
        "ALL",
        ...(options.capAdd ?? []).flatMap((capability) => ["--cap-add", capability]),
        ...(options.noNewPrivileges === false ? [] : ["--security-opt", "no-new-privileges:true"]),
        ...environmentArguments(options.env ?? []),
        ...mountArguments(options.mounts ?? []),
        "--mount",
        `type=bind,source=${CONTAINER_HELPER},destination=/proof/container-service-proof-container.mjs,readonly`,
        "--entrypoint",
        "node",
        requireCandidateImageId(),
        "/proof/container-service-proof-container.mjs",
        action,
    ];
    return await run("docker", args, {
        ...(options.input === undefined ? {} : { input: options.input }),
        containerName,
        timeoutMs: options.detachedName ? 2 * 60_000 : 5 * 60_000,
    });
}

function databaseEnvironment() {
    return [
        "PGHOST=postgres-proof",
        "PGPORT=5432",
        `PGDATABASE=${database.name}`,
        `PGUSER=${database.user}`,
        "PGPASSFILE=/run/clockify-mcp-proof/postgres.pgpass",
        "PGSSLMODE=disable",
    ];
}

function serviceContainerArguments(containerName, platform, databaseSettings, publish) {
    return [
        "run",
        "--detach",
        "--name",
        containerName,
        "--platform",
        platform,
        "--label",
        label,
        "--network",
        names.network,
        "--read-only",
        "--tmpfs",
        "/tmp:size=16m,mode=1777",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges:true",
        ...(publish ? ["--publish", "127.0.0.1::3000"] : []),
        ...environmentArguments([
            ...databaseSettings,
            "NODE_EXTRA_CA_CERTS=/run/clockify-mcp-proof/tls.crt",
            "CLOCKIFY_MCP_BIND_HOST=0.0.0.0",
            "CLOCKIFY_MCP_PORT=3000",
            `CLOCKIFY_MCP_PUBLIC_URL=${PUBLIC_URL.href}`,
            `CLOCKIFY_MCP_OAUTH_ISSUER=${OAUTH_ISSUER}`,
            "CLOCKIFY_MCP_OAUTH_JWKS_URL=https://oauth-proof:8443/jwks",
            "CLOCKIFY_MCP_OAUTH_JWT_ALGORITHMS=RS256",
            "CLOCKIFY_MCP_OAUTH_INTROSPECTION_URL=https://oauth-proof:8443/introspect",
            `CLOCKIFY_MCP_OAUTH_CLIENT_ID=${OAUTH_CLIENT_ID}`,
            "CLOCKIFY_MCP_OAUTH_CLIENT_SECRET_FILE=/run/clockify-mcp-proof/oauth-client-secret",
            "CLOCKIFY_MCP_OAUTH_AUTHORIZATION_ENDPOINT=https://oauth-proof:8443/authorize",
            "CLOCKIFY_MCP_OAUTH_TOKEN_ENDPOINT=https://oauth-proof:8443/token",
            "CLOCKIFY_MCP_KEYRING_FILE=/run/clockify-mcp-proof/keyring.json",
            `CLOCKIFY_MCP_HOST_ALLOWLIST=${PUBLIC_HOST}`,
            "CLOCKIFY_MCP_MIGRATION_MODE=verify",
            "CLOCKIFY_MCP_MAX_CONCURRENT_REQUESTS=8",
        ]),
        "--mount",
        `type=volume,source=${names.secrets},destination=/run/clockify-mcp-proof,readonly`,
        requireCandidateImageId(),
    ];
}

async function waitForPostgres() {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        const result = await run(
            "docker",
            ["exec", names.postgres, "pg_isready", "-U", database.user, "-d", database.name],
            { allowFailure: true, timeoutMs: 5_000 },
        );
        if (result.code === 0) return;
        await delay(500);
    }
    throw new Error("PostgreSQL readiness deadline exceeded");
}

async function waitForOAuth(platform) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        const result = await run(
            "docker",
            [
                "run",
                "--rm",
                "--name",
                names.oauthProbe,
                "--label",
                label,
                "--platform",
                platform,
                "--network",
                names.network,
                "--read-only",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges:true",
                "--env",
                "NODE_EXTRA_CA_CERTS=/run/clockify-mcp-proof/tls.crt",
                "--mount",
                `type=volume,source=${names.secrets},destination=/run/clockify-mcp-proof,readonly`,
                "--entrypoint",
                "node",
                requireCandidateImageId(),
                "-e",
                "fetch('https://oauth-proof:8443/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
            ],
            {
                allowFailure: true,
                containerName: names.oauthProbe,
                timeoutMs: 8_000,
            },
        );
        if (result.code === 0) return;
        if (result.signal === "SIGKILL") {
            throw new Error("OAuth readiness probe timed out");
        }
        if (!(await containerRunning(names.oauth))) {
            throw new Error("OAuth fixture exited before readiness");
        }
        await delay(300);
    }
    throw new Error("OAuth fixture readiness deadline exceeded");
}

async function dockerPlatform() {
    const architecture = (await run("docker", ["info", "--format", "{{.Architecture}}"])).trim();
    if (architecture === "amd64" || architecture === "x86_64") return "linux/amd64";
    if (architecture === "arm64" || architecture === "aarch64") return "linux/arm64";
    throw new Error("unsupported Docker architecture");
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

async function containerRunning(container) {
    const result = await run("docker", ["inspect", "--format", "{{.State.Running}}", container], {
        allowFailure: true,
        timeoutMs: 5_000,
    });
    return result.code === 0 && result.stdout.trim() === "true";
}

async function cleanup() {
    processRunner.beginCleanup();
    phase = failure ? `${phase}-cleanup` : "cleanup";
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
        for (const volume of [names.data, names.secrets]) {
            await attempt(() =>
                run("docker", ["volume", "rm", "--force", volume], {
                    allowFailure: true,
                    timeoutMs: 30_000,
                }),
            );
        }
        await attempt(() =>
            run("docker", ["network", "rm", names.network], {
                allowFailure: true,
                timeoutMs: 30_000,
            }),
        );
        await attempt(() =>
            run("docker", ["image", "rm", "--force", names.image], {
                allowFailure: true,
                timeoutMs: 2 * 60_000,
            }),
        );
        if (candidateImageId) {
            await attempt(() =>
                run("docker", ["image", "rm", "--force", candidateImageId], {
                    allowFailure: true,
                    timeoutMs: 2 * 60_000,
                }),
            );
        }
        if (postgresPresentBefore === false) {
            await attempt(() =>
                run("docker", ["image", "rm", POSTGRES_IMAGE], {
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
        await attempt(assertNoOwnedDockerResources);
        if (postgresPresentBefore === false) {
            const postgresRemains = await attempt(() => imageExists(POSTGRES_IMAGE));
            if (postgresRemains === true) {
                cleanupFailure ??= new Error("proof-pulled PostgreSQL image remains");
            }
        }
        if (nodePresentBefore === false) {
            const nodeRemains = await attempt(() => imageExists(NODE_IMAGE));
            if (nodeRemains === true) {
                cleanupFailure ??= new Error("proof-pulled Node image remains");
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

async function assertNoOwnedDockerResources() {
    const filters = [
        ["container", "ls", "--all", "--quiet", "--filter", `label=${label}`],
        ["volume", "ls", "--quiet", "--filter", `label=${label}`],
        ["network", "ls", "--quiet", "--filter", `label=${label}`],
        ["image", "ls", "--quiet", "--filter", `label=${label}`],
    ];
    for (const args of filters) {
        const output = await run("docker", args, { timeoutMs: 15_000 });
        assert(!output.trim(), `owned Docker ${args[0]} resources remain after cleanup`);
    }
    for (const container of ownedContainerNames) {
        const result = await run("docker", ["container", "inspect", container], {
            allowFailure: true,
            timeoutMs: 5_000,
        });
        assert(result.code !== 0, `owned Docker container ${container} remains after cleanup`);
        assert(
            result.stderr.includes("No such container:"),
            "Docker container absence check failed",
        );
    }
}

function secretFile(name, contents, uid) {
    const bytes = Buffer.isBuffer(contents) ? contents : Buffer.from(contents, "utf8");
    return { name, base64: bytes.toString("base64"), uid };
}

function mountArguments(mounts) {
    return mounts.flatMap((mount) => ["--mount", mount]);
}

function environmentArguments(environment) {
    return environment.flatMap((entry) => ["--env", entry]);
}

function requireCandidateImageId() {
    if (!candidateImageId) throw new Error("candidate image id is unavailable");
    return candidateImageId;
}

function safeFailureDetail(error) {
    if (error instanceof Error && error.name === "CommandFailure") return error.message;
    if (error instanceof Error) return error.message.replace(/[\r\n]+/gu, " ").slice(0, 240);
    return "unknown failure";
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function delay(milliseconds) {
    return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
