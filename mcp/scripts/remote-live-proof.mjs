#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { exportJWK, generateKeyPair, SignJWT } from "jose";

import { cleanupLivePrefixes } from "../../scripts/live/cleanup.mjs";
import {
    LIVE_CLEANUP_BUDGET_MS,
    LIVE_CLEANUP_RANGE_END,
    LIVE_CLEANUP_RANGE_START,
    acquireLiveLock,
    createBoundedLiveClient,
    releaseLiveLock,
    validateLiveEnvironment,
} from "../../scripts/live/orchestrator.mjs";
import { proveReports } from "./remote-live-proof-reports.mjs";
import {
    assertExactRemoteTables,
    assertNoTenantRows,
    assertSeedRetry,
    confirmationCount,
    confirmationToken,
    createToolCaller,
    dockerPlatform,
    listMarkerEntries,
    loadCandidate,
    mappedPort,
    POSTGRES_IMAGE,
    requireClockifyId,
    requireNoDeletedTargets,
    requireToolSuccess,
    requireWarningFreeCleanup,
    requireZeroCleanupPreview,
    runAdmin,
    sanitizedDetail,
    waitForPostgres,
} from "./remote-live-proof-support.mjs";
import { startOAuthFixture } from "./remote-proof-oauth-fixture.mjs";
import { createProofProcessRunner, withDeadline } from "./remote-proof-process.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ISSUER = "https://issuer.proof.invalid/";
const RESOURCE = new URL("https://mcp.proof.invalid/mcp");
const OAUTH_CLIENT_ID = "remote-live-proof-client";
const DEMO_DATE = "2026-01-02";
const DAY_START = `${DEMO_DATE}T00:00:00.000Z`;
const DAY_END = "2026-01-03T00:00:00.000Z";
const ATTENDANCE_DAY_END = `${DEMO_DATE}T23:59:59.999Z`;
const WEEK_START = "2025-12-29T00:00:00.000Z";
const WEEK_END = "2026-01-05T00:00:00.000Z";

export async function main(env = process.env) {
    let credentials;
    let lock;
    let directory;
    let pool;
    let service;
    let oauth;
    let directClient;
    let currentUserId;
    let containerAttempted = false;
    let volumeAttempted = false;
    let principalProvisioned = false;
    let interruptedSignal;
    let phase = "configuration";
    let proofFailure;
    let proofFailurePhase;
    let cleanupFailure;
    let proofReceipt;
    let prefix;
    let marker;
    let jwtToken;
    const opaqueToken = "opaque-proof-token";
    let introspectionSecret;
    let keyringSecret;
    let database;
    let adminEnvironment;
    let subject;
    const logs = [];
    const runner = createProofProcessRunner();
    const proofId = `${process.pid}_${randomBytes(5).toString("hex")}`;
    const containerName = `clockify_mcp_live_${proofId}`;
    const volumeName = `${containerName}_data`;
    const databaseName = `clockify_mcp_live_${proofId}`;
    const databaseUser = "clockify_mcp_live";
    const databasePassword = randomBytes(32).toString("base64url");
    const signalHandlers = new Map();
    const proofAbort = new AbortController();

    for (const signal of ["SIGINT", "SIGTERM"]) {
        const handler = () => {
            interruptedSignal ??= signal;
            proofAbort.abort();
            runner.terminateAll();
        };
        signalHandlers.set(signal, handler);
        process.once(signal, handler);
    }

    try {
        credentials = validateLiveEnvironment(env);
        lock = acquireLiveLock();
        prefix = `DEMO-mcp-live-${randomBytes(6).toString("hex")}-`;
        marker = `${prefix}-entry`;
        subject = `remote-live-${randomBytes(12).toString("hex")}`;

        phase = "candidate-build";
        await runner.run("npm", ["run", "build", "-w", "@apet97/clockify-mcp-115"]);
        directory = await mkdtemp(join(tmpdir(), "clockify-mcp-remote-live-"));
        const candidate = await loadCandidate(directory);

        phase = "postgresql";
        const platform = await dockerPlatform(runner.run);
        await runner.run("docker", ["pull", "--platform", platform, POSTGRES_IMAGE]);
        const postgresEnvironmentFile = join(directory, "postgres.env");
        await writeFile(
            postgresEnvironmentFile,
            `POSTGRES_USER=${databaseUser}\nPOSTGRES_PASSWORD=${databasePassword}\nPOSTGRES_DB=${databaseName}\n`,
            { mode: 0o600 },
        );
        volumeAttempted = true;
        await runner.run("docker", [
            "volume",
            "create",
            "--label",
            `io.apet97.clockify115.mcp-remote-live=${proofId}`,
            volumeName,
        ]);
        containerAttempted = true;
        await runner.run("docker", [
            "run",
            "--detach",
            "--name",
            containerName,
            "--platform",
            platform,
            "--env-file",
            postgresEnvironmentFile,
            "--publish",
            "127.0.0.1::5432",
            "--mount",
            `type=volume,source=${volumeName},destination=/var/lib/postgresql/data`,
            POSTGRES_IMAGE,
        ]);
        await waitForPostgres(runner.run, containerName, databaseUser, databaseName);
        const port = mappedPort(await runner.run("docker", ["port", containerName, "5432/tcp"]));
        const databaseUrlFile = join(directory, "database-url");
        const keyringFile = join(directory, "keyring.json");
        keyringSecret = randomBytes(32).toString("base64");
        const keyringDocument = {
            version: 1,
            activeKeyId: "live-proof",
            keys: { "live-proof": keyringSecret },
        };
        await Promise.all([
            writeFile(
                databaseUrlFile,
                `postgresql://${databaseUser}:${encodeURIComponent(databasePassword)}@127.0.0.1:${port}/${databaseName}?sslmode=disable\n`,
                { mode: 0o600 },
            ),
            writeFile(keyringFile, `${JSON.stringify(keyringDocument)}\n`, { mode: 0o600 }),
        ]);
        adminEnvironment = {
            PATH: process.env.PATH ?? "",
            CLOCKIFY_MCP_DATABASE_URL_FILE: databaseUrlFile,
            CLOCKIFY_MCP_OAUTH_ISSUER: ISSUER,
            CLOCKIFY_MCP_KEYRING_FILE: keyringFile,
        };
        database = candidate.PostgresPool.fromConnectionString(
            `postgresql://${databaseUser}:${encodeURIComponent(databasePassword)}@127.0.0.1:${port}/${databaseName}?sslmode=disable`,
        );
        pool = database;

        phase = "migrations";
        await runAdmin(runner, adminEnvironment, ["db", "migrate"], credentials);
        await candidate.verifyDatabaseMigrations(database);
        await assertExactRemoteTables(database);

        phase = "principal";
        principalProvisioned = true;
        await runAdmin(
            runner,
            adminEnvironment,
            ["principal", "grant", "--subject", subject, "--grant", "admin"],
            credentials,
        );
        await runAdmin(
            runner,
            adminEnvironment,
            ["credential", "set", "--subject", subject, "--workspace", credentials.workspaceId],
            credentials,
            `${credentials.apiKey}\n`,
        );
        await runAdmin(
            runner,
            adminEnvironment,
            ["credential", "validate", "--subject", subject],
            credentials,
        );
        const keyring = await candidate.loadKeyringFile(keyringFile);

        phase = "oauth";
        const signing = await generateKeyPair("RS256");
        const publicJwk = await exportJWK(signing.publicKey);
        introspectionSecret = randomBytes(32).toString("base64url");
        const introspectionSecretFile = join(directory, "introspection-secret");
        await writeFile(introspectionSecretFile, `${introspectionSecret}\n`, { mode: 0o600 });
        const claims = {
            active: true,
            iss: ISSUER,
            sub: subject,
            client_id: OAUTH_CLIENT_ID,
            aud: RESOURCE.href,
            exp: Math.floor(Date.now() / 1000) + 900,
            scope: "clockify:read clockify:write clockify:admin",
        };
        oauth = await startOAuthFixture({
            directory,
            jwk: { ...publicJwk, alg: "RS256", kid: "remote-live", use: "sig" },
            expectedAuthorization: `Basic ${Buffer.from(`remote-live-resource:${introspectionSecret}`).toString("base64")}`,
            claims,
        });
        const verifier = await candidate.HybridClockifyTokenVerifier.create({
            issuer: ISSUER,
            resource: RESOURCE,
            jwt: { jwksUrl: oauth.jwksUrl, algorithms: ["RS256"], fetch: oauth.fetch },
            opaque: {
                introspectionUrl: oauth.introspectionUrl,
                clientId: "remote-live-resource",
                clientSecretFile: introspectionSecretFile,
                timeoutMs: 5_000,
            },
            fetch: oauth.fetch,
        });
        jwtToken = await new SignJWT(claims)
            .setProtectedHeader({ alg: "RS256", kid: "remote-live" })
            .sign(signing.privateKey);
        service = candidate.createClockifyMcpHttpHandler({
            verifier,
            resolveContext: candidate.createPostgresContextResolver({
                pool: database,
                keyring,
                issuer: ISSUER,
                clockifyTimeoutSeconds: 30,
            }),
            publicUrl: RESOURCE,
            hostAllowlist: [RESOURCE.host],
            oauthMetadata: {
                issuer: ISSUER,
                authorization_endpoint: "https://issuer.proof.invalid/authorize",
                token_endpoint: "https://issuer.proof.invalid/token",
                jwks_uri: oauth.jwksUrl.href,
                response_types_supported: ["code"],
            },
            trustedIssuer: ISSUER,
            readiness: () => true,
            logger: (entry) => logs.push(entry),
        });
        service.setReady(true);

        phase = "live-preflight";
        const { createClockifyClient } = await import(
            pathToFileURL(join(ROOT, "wrapper/dist/esm/create-client.js")).href
        );
        directClient = createBoundedLiveClient(createClockifyClient, credentials.apiKey);
        const user = await directClient.users.getCurrentUser();
        currentUserId = requireClockifyId(user?.id ?? user?._id, "current user");
        const workspace = await directClient.workspaces.get({ workspaceId: credentials.workspaceId });
        if (workspace?.id !== credentials.workspaceId) {
            throw new Error("live workspace preflight failed");
        }

        phase = "remote-status";
        const call = createToolCaller(service, RESOURCE, { signal: proofAbort.signal });
        for (const token of [jwtToken, opaqueToken]) {
            const result = await call(token, "clockify_status", {});
            requireToolSuccess(result, "clockify_status");
        }

        phase = "remote-demo-seed-first";
        const seedArgs = { prefix, date: DEMO_DATE, upsert: true };
        const firstSeed = await call(jwtToken, "clockify_demo_seed", seedArgs);
        requireToolSuccess(firstSeed, "clockify_demo_seed");
        phase = "remote-demo-seed-retry";
        const secondSeed = await call(opaqueToken, "clockify_demo_seed", seedArgs);
        requireToolSuccess(secondSeed, "clockify_demo_seed");
        assertSeedRetry(firstSeed, secondSeed);
        phase = "remote-demo-seed-verification";
        const markerEntries = await listMarkerEntries(
            directClient,
            credentials.workspaceId,
            currentUserId,
            marker,
            DAY_START,
            DAY_END,
        );
        if (markerEntries !== 1) throw new Error("demo seed retry did not preserve one entry");

        phase = "remote-reports";
        const reports = await proveReports({
            call,
            token: jwtToken,
            isReportsAppModel: candidate.isReportsAppModel,
            marker,
            dayStart: DAY_START,
            dayEnd: DAY_END,
            attendanceDayEnd: ATTENDANCE_DAY_END,
            weekStart: WEEK_START,
            weekEnd: WEEK_END,
        });

        phase = "remote-demo-cleanup-preview";
        const cleanupArgs = {
            prefix,
            start: LIVE_CLEANUP_RANGE_START,
            end: LIVE_CLEANUP_RANGE_END,
        };
        const preview = await call(jwtToken, "clockify_demo_cleanup", {
            ...cleanupArgs,
            dry_run: true,
        }, { timeoutMs: LIVE_CLEANUP_BUDGET_MS });
        requireToolSuccess(preview, "clockify_demo_cleanup");
        const confirmToken = confirmationToken(preview);
        if ((await confirmationCount(database)) !== 1) {
            throw new Error("cleanup preview did not persist exactly one confirmation");
        }
        phase = "remote-demo-cleanup-execute";
        const cleaned = await call(opaqueToken, "clockify_demo_cleanup", {
            ...cleanupArgs,
            confirm_token: confirmToken,
        }, { timeoutMs: LIVE_CLEANUP_BUDGET_MS });
        requireToolSuccess(cleaned, "clockify_demo_cleanup");
        requireWarningFreeCleanup(cleaned);
        if ((await confirmationCount(database)) !== 0) {
            throw new Error("cleanup confirmation was not atomically consumed");
        }
        if (
            (await listMarkerEntries(
                directClient,
                credentials.workspaceId,
                currentUserId,
                marker,
                DAY_START,
                DAY_END,
            )) !== 0
        ) {
            throw new Error("confirmed MCP cleanup left the demo entry");
        }
        phase = "remote-demo-cleanup-rescan-preview";
        const rescan = await call(jwtToken, "clockify_demo_cleanup", {
            ...cleanupArgs,
            dry_run: true,
        }, { timeoutMs: LIVE_CLEANUP_BUDGET_MS });
        requireToolSuccess(rescan, "clockify_demo_cleanup");
        requireZeroCleanupPreview(rescan);
        if ((await confirmationCount(database)) !== 1) {
            throw new Error("zero-target cleanup rescan did not persist one confirmation");
        }
        const rescanToken = confirmationToken(rescan);
        phase = "remote-demo-cleanup-rescan-execute";
        const zeroCleanup = await call(opaqueToken, "clockify_demo_cleanup", {
            ...cleanupArgs,
            confirm_token: rescanToken,
        }, { timeoutMs: LIVE_CLEANUP_BUDGET_MS });
        requireToolSuccess(zeroCleanup, "clockify_demo_cleanup");
        requireWarningFreeCleanup(zeroCleanup);
        requireNoDeletedTargets(zeroCleanup);
        if ((await confirmationCount(database)) !== 0) {
            throw new Error("zero-target cleanup rescan confirmation remains");
        }
        if (
            oauth.stats.introspectionCalls < 3 ||
            !oauth.stats.introspectionRedirectModes.every((mode) => mode === "error")
        ) {
            throw new Error("opaque-token introspection proof was incomplete");
        }
        proofReceipt = {
            ok: true,
            authentication: ["jwt", "opaque"],
            reports,
            demo: { idempotent: true, entries: 1 },
            confirmation: "cross-token-stateless",
            postgres: "17.11-bookworm",
        };
    } catch (error) {
        proofFailure = error;
        proofFailurePhase = phase;
    } finally {
        runner.beginCleanup();
        phase = "cleanup";
        if (directClient && currentUserId && credentials && prefix) {
            try {
                const cleanup = await cleanupLivePrefixes({
                    client: directClient,
                    workspaceId: credentials.workspaceId,
                    userId: currentUserId,
                    prefixes: [prefix],
                    rangeStart: LIVE_CLEANUP_RANGE_START,
                    rangeEnd: LIVE_CLEANUP_RANGE_END,
                    deadlineMs: Date.now() + LIVE_CLEANUP_BUDGET_MS,
                });
                if (cleanup.ok !== true || cleanup.leftovers !== 0) {
                    throw new Error("direct live cleanup left prefixed records");
                }
            } catch (error) {
                cleanupFailure ??= error;
            }
        }
        try {
            if (service) {
                await withDeadline(service.close(), 10_000, "remote MCP handler did not close");
            }
        } catch (error) {
            cleanupFailure ??= error;
        }
        try {
            if (oauth) {
                await withDeadline(oauth.close(), 10_000, "OAuth fixture did not close");
            }
        } catch (error) {
            cleanupFailure ??= error;
        }
        if (principalProvisioned && adminEnvironment && subject && credentials) {
            try {
                await runAdmin(
                    runner,
                    adminEnvironment,
                    ["principal", "delete", "--subject", subject],
                    credentials,
                );
                principalProvisioned = false;
            } catch (error) {
                cleanupFailure ??= error;
            }
        }
        if (database) {
            try {
                if (principalProvisioned) {
                    await database.query("DELETE FROM mcp_principals WHERE issuer = $1", [ISSUER]);
                }
                await assertNoTenantRows(database);
            } catch (error) {
                cleanupFailure ??= error;
            }
        }
        if (pool) {
            try {
                await withDeadline(pool.end(), 10_000, "PostgreSQL pool did not close");
                pool = undefined;
            } catch (error) {
                cleanupFailure ??= error;
            }
        }
        if (containerAttempted) {
            try {
                await runner.run("docker", ["rm", "--force", "--volumes", containerName], true);
                const containers = await runner.run("docker", [
                    "ps",
                    "--all",
                    "--filter",
                    `name=^/${containerName}$`,
                    "--format",
                    "{{.Names}}",
                ]);
                if (containers.trim()) throw new Error("proof PostgreSQL container remains");
                containerAttempted = false;
            } catch (error) {
                cleanupFailure ??= error;
            }
        }
        if (volumeAttempted) {
            try {
                await runner.run("docker", ["volume", "rm", "--force", volumeName], true);
                const volumes = await runner.run("docker", [
                    "volume",
                    "ls",
                    "--filter",
                    `name=^${volumeName}$`,
                    "--format",
                    "{{.Name}}",
                ]);
                if (volumes.trim()) throw new Error("proof PostgreSQL volume remains");
                volumeAttempted = false;
            } catch (error) {
                cleanupFailure ??= error;
            }
        }
        if (directory) {
            try {
                await rm(directory, { recursive: true, force: true });
            } catch (error) {
                cleanupFailure ??= error;
            }
        }
        if (lock && !releaseLiveLock(lock)) {
            cleanupFailure ??= new Error("live lock was not released");
        }
        for (const [signal, handler] of signalHandlers) process.off(signal, handler);
    }

    const secrets = credentials
        ? [
              credentials.apiKey,
              credentials.workspaceId,
              subject,
              prefix,
              marker,
              jwtToken,
              opaqueToken,
              introspectionSecret,
              keyringSecret,
              databasePassword,
          ]
        : [subject, prefix, marker, jwtToken, opaqueToken, introspectionSecret, keyringSecret];
    const serializedLogs = JSON.stringify(logs);
    if (secrets.some((secret) => secret && serializedLogs.includes(secret))) {
        proofFailure ??= new Error("secret appeared in bounded service logs");
    }
    if (interruptedSignal && !proofFailure) proofFailure = new Error("remote live proof interrupted");
    if (proofFailure || cleanupFailure) {
        const error = proofFailure ?? cleanupFailure;
        process.stderr.write(
            `${JSON.stringify({
                ok: false,
                error: proofFailure ? "remote_live_proof_failed" : "remote_live_cleanup_failed",
                phase: proofFailure ? proofFailurePhase : "cleanup",
                cleanup: cleanupFailure ? "failed" : "passed",
                detail: sanitizedDetail(error, secrets),
            })}\n`,
        );
        return interruptedSignal === "SIGINT" ? 130 : interruptedSignal ? 143 : 1;
    }
    process.stdout.write(
        `${JSON.stringify({
            ...proofReceipt,
            cleanup: "zero-leftovers",
            database: "zero-tenant-rows",
        })}\n`,
    );
    return 0;
}

function isDirectInvocation() {
    return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectInvocation()) {
    process.exitCode = await main();
}
