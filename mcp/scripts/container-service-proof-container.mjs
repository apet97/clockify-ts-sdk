#!/usr/bin/env node
import { createHash, timingSafeEqual } from "node:crypto";
import { chmod, chown, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:https";

const PROOF_DIRECTORY = "/run/clockify-mcp-proof";
const MAX_STDIN_BYTES = 1024 * 1024;
const MAX_REQUEST_BYTES = 8 * 1024;
const ALLOWED_FILES = new Set([
    "clockify-api-key",
    "fixture.json",
    "keyring.json",
    "oauth-client-secret",
    "postgres-password",
    "postgres.pgpass",
    "tls.crt",
    "tls.key",
]);

const action = process.argv[2];
let actionPhase = "dispatch";

try {
    if (action === "seed") await seedSecrets();
    else if (action === "oauth") await serveOAuth();
    else if (action === "provision") await provisionDatabase();
    else if (action === "migration-lock") await holdFailingMigrationLock();
    else if (action === "credential-lock") await holdCredentialLock();
    else if (action === "wait-credential-query") await waitForCredentialQuery();
    else if (action === "fingerprint") await fingerprintDatabase();
    else throw new Error("unknown proof-container action");
} catch {
    process.stderr.write(
        `${JSON.stringify({
            ok: false,
            error: "proof_container_action_failed",
            phase: actionPhase,
        })}\n`,
    );
    process.exitCode = 1;
}

async function seedSecrets() {
    actionPhase = "seed-read";
    const document = JSON.parse(await readStdin(MAX_STDIN_BYTES));
    if (!isRecord(document) || !Array.isArray(document.files)) {
        throw new Error("invalid seed document");
    }
    actionPhase = "seed-directory";
    await mkdir(PROOF_DIRECTORY, { recursive: true, mode: 0o755 });
    await chmod(PROOF_DIRECTORY, 0o755);
    for (const entry of document.files) {
        actionPhase = "seed-validate-entry";
        if (
            !isRecord(entry) ||
            typeof entry.name !== "string" ||
            !ALLOWED_FILES.has(entry.name) ||
            typeof entry.base64 !== "string" ||
            (entry.uid !== 999 && entry.uid !== 1000)
        ) {
            throw new Error("invalid seed entry");
        }
        const contents = Buffer.from(entry.base64, "base64");
        if (contents.toString("base64") !== entry.base64) {
            throw new Error("seed entry is not canonical base64");
        }
        const path = `${PROOF_DIRECTORY}/${entry.name}`;
        actionPhase = `seed-write-${entry.name}`;
        await writeFile(path, contents, { mode: 0o600, flag: "wx" });
        actionPhase = `seed-chmod-${entry.name}`;
        await chmod(path, 0o600);
        actionPhase = `seed-chown-${entry.name}`;
        await chown(path, entry.uid, entry.uid);
        actionPhase = `seed-stat-${entry.name}`;
        const metadata = await stat(path);
        if ((metadata.mode & 0o777) !== 0o600 || metadata.uid !== entry.uid) {
            throw new Error("seed file ownership or mode is wrong");
        }
    }
    process.stdout.write(`${JSON.stringify({ ok: true, files: document.files.length })}\n`);
}

async function serveOAuth() {
    actionPhase = "oauth-config";
    const fixture = JSON.parse(await readFile(`${PROOF_DIRECTORY}/fixture.json`, "utf8"));
    if (!isFixture(fixture)) throw new Error("invalid OAuth fixture document");
    const [key, certificate, clientSecret] = await Promise.all([
        readFile(`${PROOF_DIRECTORY}/tls.key`),
        readFile(`${PROOF_DIRECTORY}/tls.crt`),
        readSingleLine(`${PROOF_DIRECTORY}/oauth-client-secret`),
    ]);
    const expectedAuthorization = `Basic ${Buffer.from(
        `${encodeForm(fixture.clientId)}:${encodeForm(clientSecret)}`,
        "utf8",
    ).toString("base64")}`;
    const server = createServer({ key, cert: certificate }, (request, response) => {
        void handleOAuthRequest(request, response, fixture, expectedAuthorization).catch(() => {
            if (response.headersSent) response.destroy();
            else writeJson(response, 500, { error: "fixture_failure" });
        });
    });
    actionPhase = "oauth-listen";
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(8443, "0.0.0.0", () => {
            server.off("error", reject);
            resolve();
        });
    });
    process.stdout.write(`${JSON.stringify({ event: "oauth_fixture", phase: "ready" })}\n`);
    await new Promise((resolve) => {
        let closing = false;
        const close = () => {
            if (closing) return;
            closing = true;
            server.close(() => resolve());
            server.closeIdleConnections();
            setTimeout(() => server.closeAllConnections(), 2_000).unref();
        };
        process.once("SIGINT", close);
        process.once("SIGTERM", close);
    });
    process.stdout.write(`${JSON.stringify({ event: "oauth_fixture", phase: "stopped" })}\n`);
}

async function handleOAuthRequest(request, response, fixture, expectedAuthorization) {
    if (request.method === "GET" && request.url === "/healthz") {
        writeJson(response, 200, { status: "ok" });
        return;
    }
    if (request.method === "GET" && request.url === "/jwks") {
        process.stdout.write(
            `${JSON.stringify({ event: "oauth_fixture_request", route: "jwks" })}\n`,
        );
        writeJson(response, 200, { keys: [fixture.jwk] });
        return;
    }
    if (request.method === "POST" && request.url === "/introspect") {
        const authorized = equalStrings(request.headers.authorization ?? "", expectedAuthorization);
        if (!authorized) {
            writeJson(response, 401, { error: "invalid_client" });
            return;
        }
        const body = new URLSearchParams(await readRequest(request));
        const active = equalStrings(body.get("token") ?? "", fixture.opaqueToken);
        process.stdout.write(
            `${JSON.stringify({
                event: "oauth_fixture_request",
                route: "introspection",
                active,
            })}\n`,
        );
        writeJson(response, 200, active ? fixture.claims : { active: false });
        return;
    }
    writeJson(response, 404, { error: "not_found" });
}

async function provisionDatabase() {
    actionPhase = "provision-imports";
    const [postgres, migrations, crypto, credentials] = await Promise.all([
        import("/srv/clockify-mcp/mcp/dist/remote/postgres.js"),
        import("/srv/clockify-mcp/mcp/dist/remote/migrations.js"),
        import("/srv/clockify-mcp/mcp/dist/remote/crypto.js"),
        import("/srv/clockify-mcp/mcp/dist/remote/credentials.js"),
    ]);
    const pool = await postgres.PostgresPool.fromEnvironment(process.env);
    try {
        actionPhase = "provision-migrate";
        const applied = await migrations.migrateDatabase(pool);
        actionPhase = "provision-keyring";
        const keyring = await crypto.loadKeyringFile(
            requiredEnvironment("CLOCKIFY_MCP_KEYRING_FILE"),
        );
        const apiKey = await crypto.readMode600Secret(
            requiredEnvironment("PROOF_CLOCKIFY_API_KEY_FILE"),
            "synthetic Clockify proof key",
        );
        actionPhase = "provision-store";
        const store = new credentials.PostgresCredentialStore(
            pool,
            keyring,
            requiredEnvironment("CLOCKIFY_MCP_OAUTH_ISSUER"),
        );
        const subject = requiredEnvironment("PROOF_SUBJECT");
        await store.grantPrincipal(subject, "admin");
        const receipt = await store.setCredential(subject, {
            workspaceId: requiredEnvironment("PROOF_WORKSPACE_ID"),
            apiKey,
            region: "global",
        });
        process.stdout.write(
            `${JSON.stringify({
                ok: true,
                migrationsApplied: applied.length,
                credentialRevision: receipt.credentialRevision.toString(),
            })}\n`,
        );
    } finally {
        await pool.end();
    }
}

async function holdFailingMigrationLock() {
    actionPhase = "migration-lock-import";
    const { PostgresPool } = await import("/srv/clockify-mcp/mcp/dist/remote/postgres.js");
    const pool = await PostgresPool.fromEnvironment(process.env);
    const connection = await pool.connect();
    try {
        actionPhase = "migration-lock-tamper";
        await pool.query(
            "UPDATE mcp_schema_migrations SET checksum = repeat('0', 64) WHERE version = '001_remote.sql'",
        );
        await connection.query("BEGIN");
        await connection.query("LOCK TABLE mcp_schema_migrations IN ACCESS EXCLUSIVE MODE");
        actionPhase = "migration-lock-held";
        process.stdout.write(`${JSON.stringify({ event: "migration_lock", phase: "held" })}\n`);
        await waitForTerminationSignal();
        await connection.query("ROLLBACK");
        process.stdout.write(`${JSON.stringify({ event: "migration_lock", phase: "released" })}\n`);
    } finally {
        connection.release();
        await pool.end();
    }
}

async function holdCredentialLock() {
    actionPhase = "credential-lock-import";
    const { PostgresPool } = await import("/srv/clockify-mcp/mcp/dist/remote/postgres.js");
    const pool = await PostgresPool.fromEnvironment(process.env);
    const connection = await pool.connect();
    try {
        actionPhase = "credential-lock-begin";
        await connection.query("BEGIN");
        await connection.query("LOCK TABLE mcp_credentials IN ACCESS EXCLUSIVE MODE");
        actionPhase = "credential-lock-held";
        process.stdout.write(`${JSON.stringify({ event: "credential_lock", phase: "held" })}\n`);
        await waitForTerminationSignal();
        actionPhase = "credential-lock-release";
        await connection.query("ROLLBACK");
        process.stdout.write(
            `${JSON.stringify({ event: "credential_lock", phase: "released" })}\n`,
        );
    } finally {
        connection.release();
        await pool.end();
    }
}

async function waitForCredentialQuery() {
    actionPhase = "credential-waiter-import";
    const { PostgresPool } = await import("/srv/clockify-mcp/mcp/dist/remote/postgres.js");
    const pool = await PostgresPool.fromEnvironment(process.env);
    try {
        actionPhase = "credential-waiter-poll";
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
            const result = await pool.query(
                `SELECT count(*)::text AS waiting
                   FROM pg_stat_activity
                  WHERE datname = current_database()
                    AND pid <> pg_backend_pid()
                    AND state = 'active'
                    AND wait_event_type = 'Lock'
                    AND query ILIKE '%mcp_credentials%'`,
            );
            const waiting = Number.parseInt(result.rows[0]?.waiting ?? "0", 10);
            if (waiting > 0) {
                process.stdout.write(
                    `${JSON.stringify({ ok: true, credentialQueriesWaiting: waiting })}\n`,
                );
                return;
            }
            await delay(25);
        }
        throw new Error("credential query did not enter the PostgreSQL lock wait queue");
    } finally {
        await pool.end();
    }
}

async function fingerprintDatabase() {
    actionPhase = "fingerprint-import";
    const { PostgresPool } = await import("/srv/clockify-mcp/mcp/dist/remote/postgres.js");
    const pool = await PostgresPool.fromEnvironment(process.env);
    try {
        actionPhase = "fingerprint-query";
        const [credentials, confirmations] = await Promise.all([
            pool.query(
                `SELECT id::text,
                        principal_id::text,
                        workspace_id,
                        region,
                        subdomain,
                        encode(api_key_ciphertext, 'hex') AS api_key_ciphertext,
                        encode(api_key_iv, 'hex') AS api_key_iv,
                        encode(api_key_tag, 'hex') AS api_key_tag,
                        key_id,
                        revision::text,
                        disabled_at
                   FROM mcp_credentials
                  ORDER BY id`,
            ),
            pool.query(
                `SELECT token_hash,
                        principal_id::text,
                        oauth_client_id,
                        credential_id::text,
                        credential_revision::text,
                        workspace_id,
                        tool_name,
                        risk,
                        business_args_hash,
                        preview_hash,
                        preview_bytes,
                        encode(preview_ciphertext, 'hex') AS preview_ciphertext,
                        encode(preview_iv, 'hex') AS preview_iv,
                        encode(preview_tag, 'hex') AS preview_tag,
                        key_id,
                        expires_at,
                        created_at
                   FROM mcp_confirmations
                  ORDER BY token_hash`,
            ),
        ]);
        process.stdout.write(
            `${JSON.stringify({
                ok: true,
                credential: sha256Json(credentials.rows),
                confirmations: sha256Json(confirmations.rows),
                confirmationCount: confirmations.rows.length,
            })}\n`,
        );
    } finally {
        await pool.end();
    }
}

async function waitForTerminationSignal() {
    await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        process.once("SIGINT", finish);
        process.once("SIGTERM", finish);
    });
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sha256Json(value) {
    return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

async function readStdin(limit) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += value.byteLength;
        if (bytes > limit) throw new Error("proof input exceeds its limit");
        chunks.push(value);
    }
    return Buffer.concat(chunks, bytes).toString("utf8");
}

async function readRequest(request) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of request) {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += value.byteLength;
        if (bytes > MAX_REQUEST_BYTES) throw new Error("request is too large");
        chunks.push(value);
    }
    return Buffer.concat(chunks, bytes).toString("utf8");
}

async function readSingleLine(path) {
    const value = (await readFile(path, "utf8")).replace(/\r?\n$/u, "");
    if (!value || value.includes("\n") || value.includes("\r")) {
        throw new Error("secret file must contain one line");
    }
    return value;
}

function writeJson(response, status, value) {
    const body = JSON.stringify(value);
    response.writeHead(status, {
        "cache-control": "no-store",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
    });
    response.end(body);
}

function encodeForm(value) {
    return new URLSearchParams({ value }).toString().slice("value=".length);
}

function equalStrings(left, right) {
    const leftBytes = Buffer.from(left, "utf8");
    const rightBytes = Buffer.from(right, "utf8");
    return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

function requiredEnvironment(name) {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
}

function isFixture(value) {
    return (
        isRecord(value) &&
        typeof value.clientId === "string" &&
        value.clientId.length > 0 &&
        typeof value.opaqueToken === "string" &&
        value.opaqueToken.length > 0 &&
        isRecord(value.jwk) &&
        isRecord(value.claims)
    );
}

function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
