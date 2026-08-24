import { createHash, randomBytes } from "node:crypto";

export async function proveStorageAndEncryption({
    database,
    issuer,
    workspaceId,
    modules,
    setPhase,
    assertNotInterrupted,
}) {
    const {
        AesGcmKeyring,
        PostgresConfirmationStore,
        PostgresCredentialStore,
        PostgresEncryptionService,
    } = modules;
    const createKeyring = (activeKeyId, keys) =>
        AesGcmKeyring.fromDocument({ version: 1, activeKeyId, keys });
    const createScope = (businessArgs) => ({
        toolName: "clockify_create_project",
        workspaceId,
        risk: "business_write",
        businessArgs,
    });

    const oldKey = randomBytes(32).toString("base64");
    const newKey = randomBytes(32).toString("base64");
    const oldKeyring = createKeyring("old", { old: oldKey });
    const credentials = new PostgresCredentialStore(database, oldKeyring, issuer);
    const subject = "proof-principal";
    await credentials.grantPrincipal(subject, "admin");
    const first = await credentials.setCredential(subject, {
        workspaceId,
        apiKey: "proof-api-key-v1",
        region: "global",
    });
    const second = await credentials.setCredential(subject, {
        workspaceId,
        apiKey: "proof-api-key-v2",
        region: "global",
    });
    assert(
        second.credentialRevision === first.credentialRevision + 1n,
        "revision did not advance",
    );
    const principal = {
        issuer,
        subject,
        oauthClientId: "proof-client",
        tokenScopes: new Set(["clockify:read", "clockify:write", "clockify:admin"]),
    };
    const loaded = await credentials.load(principal);
    assert(loaded.apiKey === "proof-api-key-v2", "credential decrypt failed");

    const binding = confirmationBinding(loaded, "proof-client");
    const confirmations = new PostgresConfirmationStore(database, oldKeyring, binding);
    const scope = createScope({ action: "concurrent" });
    const concurrent = await confirmations.issue(scope, { exact: "concurrent-preview" });
    const ttl = await database.query(
        `SELECT extract(epoch FROM (expires_at - created_at))::double precision AS seconds,
                expires_at
           FROM mcp_confirmations
          WHERE token_hash = $1`,
        [sha256Text(concurrent.confirmToken)],
    );
    assert(
        ttl.rows[0]?.seconds === 300 &&
            ttl.rows[0]?.expires_at?.toISOString() === concurrent.expiresAt,
        "confirmation did not receive an exact database-owned five-minute TTL",
    );
    const contenders = await Promise.allSettled([
        confirmations.consume(concurrent.confirmToken, scope),
        confirmations.consume(concurrent.confirmToken, scope),
    ]);
    assert(
        contenders.filter((result) => result.status === "fulfilled").length === 1,
        "confirmation consumption did not have exactly one winner",
    );

    const wrong = await confirmations.issue(createScope({ action: "expected" }), {
        exact: "wrong-args-preview",
    });
    await assertRejects(
        () =>
            confirmations.consume(
                wrong.confirmToken,
                createScope({ action: "different" }),
            ),
        "wrong arguments were accepted",
    );
    await assertRejects(
        () =>
            confirmations.consume(
                wrong.confirmToken,
                createScope({ action: "expected" }),
            ),
        "wrong arguments did not burn the owner token",
    );

    const isolated = await confirmations.issue(createScope({ action: "isolated" }), {
        exact: "isolated-preview",
    });
    const otherClient = new PostgresConfirmationStore(database, oldKeyring, {
        ...binding,
        oauthClientId: "other-client",
    });
    await assertRejects(
        () =>
            otherClient.consume(
                isolated.confirmToken,
                createScope({ action: "isolated" }),
            ),
        "another client consumed the token",
    );

    const otherSubject = "proof-other-principal";
    await credentials.grantPrincipal(otherSubject, "admin");
    await credentials.setCredential(otherSubject, {
        workspaceId,
        apiKey: "proof-other-principal-key",
        region: "global",
    });
    const otherPrincipal = await credentials.load({
        issuer,
        subject: otherSubject,
        oauthClientId: "proof-client",
        tokenScopes: new Set(["clockify:admin"]),
    });
    const otherPrincipalStore = new PostgresConfirmationStore(
        database,
        oldKeyring,
        confirmationBinding(otherPrincipal, "proof-client"),
    );
    await assertRejects(
        () =>
            otherPrincipalStore.consume(
                isolated.confirmToken,
                createScope({ action: "isolated" }),
            ),
        "another principal consumed the token",
    );
    const expiredOther = await otherPrincipalStore.issue(
        createScope({ action: "expired-other-principal" }),
        { exact: "expired-other-principal" },
    );
    await database.query(
        "UPDATE mcp_confirmations SET expires_at = now() - interval '1 second' WHERE token_hash = $1",
        [sha256Text(expiredOther.confirmToken)],
    );
    const cleanup = await confirmations.issue(
        createScope({ action: "global-expiry-cleanup" }),
        { exact: "global-expiry-cleanup" },
    );
    const expiredCount = await database.query(
        "SELECT count(*)::text AS count FROM mcp_confirmations WHERE token_hash = $1",
        [sha256Text(expiredOther.confirmToken)],
    );
    assert(expiredCount.rows[0]?.count === "0", "expired foreign-principal preview remains");
    await confirmations.consume(
        cleanup.confirmToken,
        createScope({ action: "global-expiry-cleanup" }),
    );
    await confirmations.consume(isolated.confirmToken, createScope({ action: "isolated" }));
    await credentials.deletePrincipal(otherSubject);

    for (let index = 0; index < 256; index += 1) {
        assertNotInterrupted();
        await confirmations.issue(createScope({ index }), { exact: `quota-${index}` });
    }
    await assertRejects(
        () => confirmations.issue(createScope({ index: 256 }), { exact: "overflow" }),
        "confirmation entry quota was not enforced",
    );
    await database.query("DELETE FROM mcp_confirmations WHERE principal_id = $1", [
        loaded.principalId,
    ]);

    setPhase("confirmations-byte-quota");
    const halfCapacity = "b".repeat(2_100_000);
    await confirmations.issue(createScope({ byteQuota: 1 }), { exact: halfCapacity });
    await assertRejects(
        () => confirmations.issue(createScope({ byteQuota: 2 }), { exact: halfCapacity }),
        "confirmation byte quota was not enforced",
    );
    await database.query("DELETE FROM mcp_confirmations WHERE principal_id = $1", [
        loaded.principalId,
    ]);

    setPhase("confirmations-concurrent-relink");
    const relinked = await mutateBeforeStaleIssue({
        database,
        principalId: loaded.principalId,
        assertNotInterrupted,
        mutate: () =>
            credentials.setCredential(subject, {
                workspaceId,
                apiKey: "proof-api-key-v3",
                region: "global",
            }),
        issue: () =>
            confirmations.issue(createScope({ stale: "relink" }), {
                exact: "must-not-be-inserted-after-relink",
            }),
    });
    assert(
        relinked.credentialRevision === loaded.credentialRevision + 1n,
        "relink revision failed",
    );
    const afterRelink = await credentials.load(principal);
    assert(afterRelink.apiKey === "proof-api-key-v3", "relinked credential decrypt failed");

    setPhase("confirmations-concurrent-revoke");
    const afterRelinkConfirmations = new PostgresConfirmationStore(
        database,
        oldKeyring,
        confirmationBinding(afterRelink, "proof-client"),
    );
    const revoked = await mutateBeforeStaleIssue({
        database,
        principalId: afterRelink.principalId,
        assertNotInterrupted,
        mutate: () => credentials.revokeCredential(subject),
        issue: () =>
            afterRelinkConfirmations.issue(createScope({ stale: "revoke" }), {
                exact: "must-not-be-inserted-after-revoke",
            }),
    });
    assert(revoked === true, "credential revoke failed");

    setPhase("encryption-revoke-rotate");
    const rotatingKeyring = createKeyring("new", { old: oldKey, new: newKey });
    const encryption = new PostgresEncryptionService(database, rotatingKeyring);
    const status = await encryption.rotateAll(32);
    assert(status.rowsByKeyId.old === undefined, "old encryption rows remain");
    assert(status.retireableKeyIds.includes("old"), "old key was not marked retireable");
    const retiredKeyring = createKeyring("new", { new: newKey });
    const retiredCredentials = new PostgresCredentialStore(database, retiredKeyring, issuer);
    await retiredCredentials.setCredential(subject, {
        workspaceId,
        apiKey: "proof-api-key-v4-plaintext-marker",
        region: "global",
    });
    const active = await retiredCredentials.load(principal);
    assert(
        active.apiKey === "proof-api-key-v4-plaintext-marker",
        "credential cannot decrypt after old-key retirement",
    );

    setPhase("encryption-large-confirmation");
    const activeBinding = confirmationBinding(active, "proof-client");
    const oldConfirmations = new PostgresConfirmationStore(
        database,
        oldKeyring,
        activeBinding,
    );
    const previewMarker = `proof-preview-plaintext-marker-${"x".repeat(4 * 1024 * 1024 - 128)}`;
    const rotationScope = createScope({ action: "large-rotate" });
    const rotation = await oldConfirmations.issue(rotationScope, { exact: previewMarker });

    setPhase("encryption-plaintext-absence");
    const credentialRow = await database.query(
        "SELECT row_to_json(c)::text AS row_text FROM mcp_credentials c WHERE id = $1",
        [active.credentialId],
    );
    const confirmationRow = await database.query(
        "SELECT row_to_json(c)::text AS row_text, token_hash FROM mcp_confirmations c WHERE principal_id = $1",
        [active.principalId],
    );
    const storedCredential = credentialRow.rows[0]?.row_text ?? "";
    const storedConfirmation = confirmationRow.rows[0]?.row_text ?? "";
    assert(!storedCredential.includes(active.apiKey), "API key plaintext appears in credential row");
    assert(
        !storedConfirmation.includes("proof-preview-plaintext-marker"),
        "preview plaintext appears in confirmation row",
    );
    assert(
        !storedConfirmation.includes(rotation.confirmToken),
        "raw confirmation token appears in storage",
    );
    assert(
        confirmationRow.rows[0]?.token_hash === sha256Text(rotation.confirmToken),
        "confirmation token hash is not exact",
    );

    setPhase("encryption-large-confirmation-rotate");
    const rotated = await encryption.rotateAll(1_000);
    assert(rotated.rowsByKeyId.old === undefined, "large preview remained on old key");
    const retiredConfirmations = new PostgresConfirmationStore(
        database,
        retiredKeyring,
        activeBinding,
    );
    assert(
        (await retiredConfirmations.consume(rotation.confirmToken, rotationScope)).exact ===
            previewMarker,
        "large confirmation cannot decrypt after bounded rotation",
    );
    return {
        keyring: retiredKeyring,
        keyringDocument: {
            version: 1,
            activeKeyId: "new",
            keys: { new: newKey },
        },
        subject,
        expectedApiKey: "proof-api-key-v4-plaintext-marker",
    };
}

async function mutateBeforeStaleIssue({
    database,
    principalId,
    mutate,
    issue,
    assertNotInterrupted,
}) {
    const blocker = await database.connect();
    try {
        await blocker.query("BEGIN");
        await blocker.query("SELECT id FROM mcp_principals WHERE id = $1 FOR UPDATE", [
            principalId,
        ]);
        const mutation = mutate();
        await waitForLockWaiters(database, 1, assertNotInterrupted);
        const staleIssue = issue();
        await waitForLockWaiters(database, 2, assertNotInterrupted);
        await blocker.query("COMMIT");
        const result = await mutation;
        await assertRejects(
            () => staleIssue,
            "stale confirmation was inserted after a credential mutation",
        );
        const remaining = await database.query(
            "SELECT count(*)::text AS count FROM mcp_confirmations WHERE principal_id = $1",
            [principalId],
        );
        assert(remaining.rows[0]?.count === "0", "stale confirmation row remains");
        return result;
    } catch (error) {
        await blocker.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        blocker.release();
    }
}

async function waitForLockWaiters(database, expected, assertNotInterrupted) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        assertNotInterrupted();
        const waiters = await database.query(
            `SELECT count(*)::text AS count
               FROM pg_stat_activity
              WHERE pid <> pg_backend_pid()
                AND wait_event_type = 'Lock'
                AND query LIKE '%mcp_principals%'`,
        );
        if (Number(waiters.rows[0]?.count ?? 0) >= expected) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("credential mutation did not reach the principal lock");
}

function confirmationBinding(credential, oauthClientId) {
    return {
        principalId: credential.principalId,
        oauthClientId,
        credentialId: credential.credentialId,
        credentialRevision: credential.credentialRevision,
        workspaceId: credential.workspaceId,
    };
}

function sha256Text(value) {
    return createHash("sha256").update(value).digest("hex");
}

async function assertRejects(operation, message) {
    try {
        await operation();
    } catch {
        return;
    }
    throw new Error(message);
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
