import {
    assertJsonRpcSuccess,
    callMcpTool,
    confirmationToken,
    discoverMcp,
    requestHttp,
    toolEnvelope,
} from "./container-service-proof-http.mjs";
const TAG_A = "00000000000000000000a115";
const TAG_B = "00000000000000000000b115";
const TAG_RETAINED = "00000000000000000000d115";

/** Prove shared stateless state plus graceful drain across two candidate replicas. */
export async function proveReplicaRuntime(options) {
    const {
        run,
        runDockerHelper,
        serviceContainerArguments,
        names,
        platform,
        databaseSettings,
        publicHost,
        portA,
        jwt,
        opaqueToken,
        sensitiveValues,
    } = options;

    await run(
        "docker",
        serviceContainerArguments(names.serviceB, platform, databaseSettings, true),
        { containerName: names.serviceB, timeoutMs: 2 * 60_000 },
    );
    const portB = await mappedPort(run, names.serviceB, 3000);
    await waitForServiceReady({ run, container: names.serviceB, port: portB, publicHost });

    const alternating = [
        { replica: "A", port: portA, token: jwt, tokenKind: "jwt", id: 101 },
        { replica: "B", port: portB, token: opaqueToken, tokenKind: "opaque", id: 102 },
        { replica: "A", port: portA, token: opaqueToken, tokenKind: "opaque", id: 103 },
        { replica: "B", port: portB, token: jwt, tokenKind: "jwt", id: 104 },
    ];
    for (const request of alternating) {
        assertJsonRpcSuccess(
            await discoverMcp(request.port, publicHost, request.token, request.id),
            request.id,
        );
    }

    const preview = toolEnvelope(
        await callMcpTool(portA, publicHost, jwt, 201, "clockify_tags_delete", {
            tagId: TAG_A,
            dry_run: true,
        }),
        201,
    );
    assert(preview.ok === true, "replica A did not issue the pure delete preview");
    const confirmToken = confirmationToken(preview);

    const mismatch = toolEnvelope(
        await callMcpTool(portB, publicHost, opaqueToken, 202, "clockify_tags_delete", {
            tagId: TAG_B,
            confirm_token: confirmToken,
        }),
        202,
    );
    assert(mismatch.ok === false, "replica B accepted mismatched confirmation arguments");
    assert(
        JSON.stringify(mismatch).includes("does not match this tool call"),
        "replica B did not reject the shared token at the argument binding",
    );

    const replay = toolEnvelope(
        await callMcpTool(portA, publicHost, jwt, 203, "clockify_tags_delete", {
            tagId: TAG_A,
            confirm_token: confirmToken,
        }),
        203,
    );
    assert(replay.ok === false, "replica A replayed the burned confirmation token");
    assert(
        JSON.stringify(replay).includes("was already used"),
        "replica A did not observe the token burn performed by replica B",
    );

    const retainedPreview = toolEnvelope(
        await callMcpTool(portA, publicHost, opaqueToken, 204, "clockify_tags_delete", {
            tagId: TAG_RETAINED,
            dry_run: true,
        }),
        204,
    );
    assert(retainedPreview.ok === true, "retained confirmation preview was not issued");
    confirmationToken(retainedPreview);
    const before = await databaseFingerprint(
        runDockerHelper,
        names,
        platform,
        databaseSettings,
    );
    assert(before.confirmationCount === 1, "drain fingerprint requires one retained confirmation");

    await runDockerHelper("credential-lock", {
        detachedName: names.credentialLock,
        platform,
        env: databaseSettings,
        mounts: [proofSecretsMount(names)],
    });
    await waitForLogFragment(
        run,
        names.credentialLock,
        '"event":"credential_lock","phase":"held"',
        15_000,
    );

    const admittedId = 301;
    const admittedStarted = Date.now();
    const admitted = discoverMcp(portA, publicHost, jwt, admittedId, { timeoutMs: 25_000 });
    const waiter = JSON.parse(
        await runDockerHelper("wait-credential-query", {
            name: names.queryWaiter,
            platform,
            env: databaseSettings,
            mounts: [proofSecretsMount(names)],
        }),
    );
    assert(
        waiter.ok === true && Number(waiter.credentialQueriesWaiting) >= 1,
        "PostgreSQL did not prove the admitted request was waiting on the credential lock",
    );

    const shutdownStarted = Date.now();
    await run("docker", ["kill", "--signal", "SIGTERM", names.service]);
    await waitForLogFragment(
        run,
        names.service,
        '"phase":"draining","reason":"signal"',
        10_000,
    );
    const newAdmission = await proveNewAdmissionStopped(portA, publicHost, opaqueToken);

    await run("docker", ["kill", "--signal", "SIGTERM", names.credentialLock]);
    const lockExit = await waitForExit(run, names.credentialLock, 10_000);
    assert(lockExit === 0, "credential lock fixture did not release cleanly");

    const admittedResponse = await admitted;
    assertJsonRpcSuccess(admittedResponse, admittedId);
    const admittedDurationMs = Date.now() - admittedStarted;
    const exitCodeA = await waitForExit(run, names.service, 35_000);
    const shutdownMs = Date.now() - shutdownStarted;
    assert(exitCodeA === 0, "draining replica A did not exit zero");
    assert(shutdownMs < 25_000, "draining replica A exceeded its shutdown deadline");
    assert(
        admittedDurationMs < 30_000,
        "admitted request exceeded the Node request deadline",
    );

    const logsA = await readContainerLogs(run, names.service);
    assertNoSecretLeak(logsA, sensitiveValues);
    const lifecycleA = lifecyclePhases(logsA);
    assert(
        lifecycleA.join(",") ===
            "starting,verifying_migrations,validating_encryption,ready,draining,stopped",
        `replica A lifecycle is incomplete or out of order: ${lifecycleA.join(",")}`,
    );
    assert(
        logsA.includes('"phase":"stopped","reason":"signal"'),
        "replica A did not attribute its stopped lifecycle to SIGTERM",
    );

    const readyB = await waitForServiceReady({
        run,
        container: names.serviceB,
        port: portB,
        publicHost,
    });
    assert(readyB.status === 200, "replica B was not ready after replica A stopped");
    assertJsonRpcSuccess(await discoverMcp(portB, publicHost, jwt, 302), 302);
    assertJsonRpcSuccess(await discoverMcp(portB, publicHost, opaqueToken, 303), 303);

    const after = await databaseFingerprint(
        runDockerHelper,
        names,
        platform,
        databaseSettings,
    );
    assert(
        before.credential === after.credential,
        "credential fingerprint changed while replica A drained",
    );
    assert(
        before.confirmations === after.confirmations &&
            before.confirmationCount === after.confirmationCount,
        "retained confirmation fingerprint changed while replica A drained",
    );

    await run("docker", ["kill", "--signal", "SIGTERM", names.serviceB]);
    const exitCodeB = await waitForExit(run, names.serviceB, 35_000);
    assert(exitCodeB === 0, "replica B did not stop cleanly after remaining usable");
    const logsB = await readContainerLogs(run, names.serviceB);
    assertNoSecretLeak(logsB, sensitiveValues);

    return {
        replicas: 2,
        alternatingDiscovery: alternating.map(({ replica, tokenKind }) => ({
            replica,
            token: tokenKind,
        })),
        sharedConfirmation: {
            issuedOn: "A",
            burnedOn: "B",
            replayRejectedOn: "A",
            clockifyDispatches: 0,
        },
        drain: {
            admittedRequest: {
                id: admittedId,
                status: admittedResponse.status,
                durationMs: admittedDurationMs,
                releasedBeforeRequestDeadline: true,
            },
            postgresWaiters: Number(waiter.credentialQueriesWaiting),
            newAdmission,
            replicaA: { exitCode: exitCodeA, durationMs: shutdownMs, lifecycle: lifecycleA },
            replicaB: { readyAfterA: true, jwt: 200, opaque: 200, exitCode: exitCodeB },
            fingerprints: "credential-and-retained-confirmation-unchanged",
        },
    };
}

/** Preserve the existing startup failure versus signal ordering proof. */
export async function proveStartupFailureSignalRace(options) {
    const {
        run,
        runDockerHelper,
        serviceContainerArguments,
        names,
        platform,
        databaseSettings,
        sensitiveValues,
    } = options;
    await runDockerHelper("migration-lock", {
        detachedName: names.migrationLock,
        platform,
        env: databaseSettings,
        mounts: [proofSecretsMount(names)],
    });
    await waitForLogFragment(
        run,
        names.migrationLock,
        '"event":"migration_lock","phase":"held"',
        15_000,
    );
    await run(
        "docker",
        serviceContainerArguments(names.raceService, platform, databaseSettings, false),
        { containerName: names.raceService, timeoutMs: 2 * 60_000 },
    );
    await waitForLogFragment(
        run,
        names.raceService,
        '"phase":"verifying_migrations"',
        15_000,
    );
    await run("docker", ["kill", "--signal", "SIGTERM", names.raceService]);
    await waitForLogFragment(
        run,
        names.raceService,
        '"phase":"draining","reason":"signal"',
        10_000,
    );
    await run("docker", ["kill", "--signal", "SIGTERM", names.migrationLock]);
    const lockExit = await waitForExit(run, names.migrationLock, 10_000);
    assert(lockExit === 0, "migration lock fixture did not release cleanly");
    const exitCode = await waitForExit(run, names.raceService, 35_000);
    assert(exitCode !== 0, "startup failure was downgraded to a zero signal exit");
    const logs = await readContainerLogs(run, names.raceService);
    assertNoSecretLeak(logs, sensitiveValues);
    assert(
        logs.includes('"failure":"migration_verification_failed"'),
        "race service did not retain the deterministic migration failure",
    );
    const lifecycle = lifecyclePhases(logs);
    assert(
        lifecycle.join(",") === "starting,verifying_migrations,draining,fatal,stopped",
        `race service lifecycle is incomplete or out of order: ${lifecycle.join(",")}`,
    );
    const state = JSON.parse(
        await run("docker", ["inspect", "--format", "{{json .State}}", names.raceService]),
    );
    assert(state.OOMKilled === false, "race service was OOM-killed");
    return {
        signal: "SIGTERM",
        deterministicFailure: "migration_verification_failed",
        exitCode,
        lifecycle,
    };
}

export async function waitForServiceReady(options) {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
        try {
            const response = await requestHttp(options.port, "/readyz", {
                method: "GET",
                headers: { host: options.publicHost },
            });
            if (response.status === 200) return response;
        } catch {
            // The listener exists before runtime dependency verification completes.
        }
        if (!(await containerRunning(options.run, options.container))) {
            throw new Error(`${options.container} exited before readiness`);
        }
        await delay(300);
    }
    throw new Error(`${options.container} readiness deadline exceeded`);
}

export async function mappedPort(run, container, port) {
    const output = await run("docker", ["port", container, `${port}/tcp`]);
    const match = /127\.0\.0\.1:(\d+)\s*$/u.exec(output.trim());
    if (!match) throw new Error("Docker did not publish an IPv4 loopback port");
    return Number(match[1]);
}

export async function readContainerLogs(run, container) {
    const result = await run("docker", ["logs", container], {
        allowFailure: true,
        timeoutMs: 15_000,
    });
    assert(result.code === 0, "Docker container logs could not be read");
    return `${result.stdout}\n${result.stderr}`;
}

async function waitForLogFragment(run, container, fragment, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const logs = await readContainerLogs(run, container);
        if (logs.includes(fragment)) return;
        if (!(await containerRunning(run, container))) {
            throw new Error(`${container} exited before its expected lifecycle event`);
        }
        await delay(50);
    }
    throw new Error(`${container} did not emit its expected lifecycle event`);
}

async function databaseFingerprint(runDockerHelper, names, platform, databaseSettings) {
    const value = JSON.parse(
        await runDockerHelper("fingerprint", {
            name: names.fingerprint,
            platform,
            env: databaseSettings,
            mounts: [proofSecretsMount(names)],
        }),
    );
    assert(
        value.ok === true &&
            /^[0-9a-f]{64}$/u.test(value.credential) &&
            /^[0-9a-f]{64}$/u.test(value.confirmations) &&
            Number.isSafeInteger(value.confirmationCount),
        "database fingerprint helper returned malformed evidence",
    );
    return value;
}

function proofSecretsMount(names) {
    return `type=volume,source=${names.secrets},destination=/run/clockify-mcp-proof,readonly`;
}

async function proveNewAdmissionStopped(port, publicHost, token) {
    try {
        const response = await discoverMcp(port, publicHost, token, 399, { timeoutMs: 1_000 });
        assert(response.status !== 200, "replica A admitted a new request after draining began");
        return `http-${response.status}`;
    } catch {
        return "listener-closed";
    }
}

async function waitForExit(run, container, timeoutMs) {
    return Number(
        (
            await run("docker", ["wait", container], {
                timeoutMs,
            })
        ).trim(),
    );
}

async function containerRunning(run, container) {
    const result = await run("docker", ["inspect", "--format", "{{.State.Running}}", container], {
        allowFailure: true,
        timeoutMs: 5_000,
    });
    return result.code === 0 && result.stdout.trim() === "true";
}

function lifecyclePhases(logs) {
    const phases = [];
    for (const line of logs.split(/\r?\n/u)) {
        if (!line.trim()) continue;
        try {
            const entry = JSON.parse(line);
            if (entry.event === "service_lifecycle" && typeof entry.phase === "string") {
                phases.push(entry.phase);
            }
        } catch {
            // Runtime dependency warnings are not lifecycle records.
        }
    }
    return phases;
}

function assertNoSecretLeak(output, secrets) {
    for (const secret of secrets) {
        assert(!output.includes(secret), "synthetic proof secret leaked to service logs");
    }
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
