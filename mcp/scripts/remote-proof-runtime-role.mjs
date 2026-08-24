import { randomBytes } from "node:crypto";

export async function proveRuntimeRole(options) {
    const role = `clockify_mcp_runtime_proof_${randomBytes(6).toString("hex")}`;
    let session;
    let runtime;
    try {
        await options.database.query(`CREATE ROLE ${role} NOLOGIN`);
        await options.database.query(`GRANT CONNECT ON DATABASE ${options.databaseName} TO ${role}`);
        await options.database.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
        await options.database.query(`GRANT SELECT ON mcp_schema_migrations TO ${role}`);
        await options.database.query(
            `GRANT SELECT ON mcp_principals, mcp_credentials TO ${role}`,
        );
        await options.database.query(`GRANT UPDATE (id) ON mcp_principals TO ${role}`);
        await options.database.query(
            `GRANT SELECT, INSERT, DELETE ON mcp_confirmations TO ${role}`,
        );
        await options.database.query(
            `GRANT UPDATE (token_hash) ON mcp_confirmations TO ${role}`,
        );

        session = await options.database.connect();
        await session.query(`SET ROLE ${role}`);
        runtime = rolePool(session);
        await options.modules.verifyDatabaseMigrations(runtime);
        await new options.modules.PostgresEncryptionService(
            runtime,
            options.storage.keyring,
        ).assertReadable();

        const principal = {
            issuer: options.issuer,
            subject: options.storage.subject,
            oauthClientId: "runtime-grant-proof",
            tokenScopes: new Set(["clockify:read", "clockify:write", "clockify:admin"]),
        };
        const credentials = new options.modules.PostgresCredentialStore(
            runtime,
            options.storage.keyring,
            options.issuer,
        );
        const loaded = await credentials.load(principal);
        assert(
            loaded.apiKey === options.storage.expectedApiKey,
            "runtime role cannot decrypt its provisioned credential",
        );
        const confirmations = new options.modules.PostgresConfirmationStore(
            runtime,
            options.storage.keyring,
            {
                principalId: loaded.principalId,
                oauthClientId: principal.oauthClientId,
                credentialId: loaded.credentialId,
                credentialRevision: loaded.credentialRevision,
                workspaceId: loaded.workspaceId,
            },
        );
        const scope = {
            toolName: "clockify_projects_delete",
            risk: "destructive",
            businessArgs: { projectId: "000000000000000000000115" },
            workspaceId: loaded.workspaceId,
        };
        const wrongWorkspace = await confirmations.issue(scope, {
            exact: "wrong-workspace-preview",
        });
        await assertRejects(
            () => confirmations.consume(wrongWorkspace.confirmToken, {
                ...scope,
                workspaceId: "000000000000000000000000",
            }),
            "wrong workspace was accepted",
        );
        await assertRejects(
            () => confirmations.consume(wrongWorkspace.confirmToken, scope),
            "wrong workspace did not burn the owner token",
        );
        const issued = await confirmations.issue(scope, { exact: "runtime-grant-preview" });
        const consumed = await confirmations.consume(issued.confirmToken, scope);
        assert(
            consumed?.exact === "runtime-grant-preview",
            "runtime role cannot consume its confirmation",
        );
        await assertRejects(
            () => runtime.query("CREATE TABLE runtime_role_must_not_create (id integer)"),
            "runtime role unexpectedly has DDL authority",
        );
        await assertRejects(
            () => runtime.query("UPDATE mcp_credentials SET revision = revision"),
            "runtime role unexpectedly has credential administration authority",
        );
    } finally {
        if (session) {
            await session.query("ROLLBACK").catch(() => {});
            await session.query("RESET ROLE").catch(() => {});
            session.release();
        }
        await options.database.query(`DROP OWNED BY ${role}`).catch(() => {});
        await options.database.query(`DROP ROLE IF EXISTS ${role}`).catch(() => {});
    }
}

function rolePool(session) {
    const runtime = {
        query: (text, values) => session.query(text, values),
        connect: async () => runtime,
        release: () => {},
        end: async () => {},
    };
    return runtime;
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
