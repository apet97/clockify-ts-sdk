import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function proveAdminCli({
    run,
    runCaptured,
    port,
    storage,
    database,
    directory,
    databaseUser,
    databasePassword,
    databaseName,
    issuer,
    workspaceId,
}) {
    const adminPath = new URL("../dist/admin.js", import.meta.url).pathname;
    const httpPath = new URL("../dist/http-main.js", import.meta.url).pathname;
    const admin = await run(process.execPath, [adminPath, "--help"]);
    assert(admin.includes("credential set"), "admin help smoke failed");
    const http = await run(process.execPath, [httpPath, "--help"]);
    assert(http.includes("clockify115-mcp-http"), "HTTP help smoke failed");

    const databaseUrlFile = join(directory, "admin-database-url");
    const keyringFile = join(directory, "admin-keyring.json");
    const clockifyFixture = join(directory, "admin-clockify-fetch.mjs");
    const syntheticApiKey = randomBytes(24).toString("base64url");
    const syntheticApiKeyHash = createHash("sha256").update(syntheticApiKey).digest("hex");
    await Promise.all([
        writeFile(
            databaseUrlFile,
            `postgresql://${databaseUser}:${encodeURIComponent(databasePassword)}@127.0.0.1:${port}/${databaseName}?sslmode=disable\n`,
            { mode: 0o600 },
        ),
        writeFile(keyringFile, `${JSON.stringify(storage.keyringDocument)}\n`, { mode: 0o600 }),
        writeFile(clockifyFixture, clockifyFetchFixture(syntheticApiKeyHash, workspaceId), {
            mode: 0o600,
        }),
    ]);
    const env = {
        PATH: process.env.PATH,
        CLOCKIFY_MCP_DATABASE_URL_FILE: databaseUrlFile,
        CLOCKIFY_MCP_OAUTH_ISSUER: issuer,
        CLOCKIFY_MCP_KEYRING_FILE: keyringFile,
    };
    for (const args of [
        ["db", "migrate"],
        ["principal", "grant", "--subject", "proof-admin-cli", "--grant", "admin"],
    ]) {
        const receipt = JSON.parse(await run(process.execPath, [adminPath, ...args], false, env));
        assert(receipt.ok === true, `admin ${args[0]} ${args[1]} proof failed`);
    }

    const credentialEnv = {
        ...env,
        NODE_OPTIONS: `--import=${pathToFileURL(clockifyFixture).href}`,
    };
    const setOutput = await runCaptured(
        process.execPath,
        [
            adminPath,
            "credential",
            "set",
            "--subject",
            "proof-admin-cli",
            "--workspace",
            workspaceId,
        ],
        false,
        credentialEnv,
        `${syntheticApiKey}\n`,
    );
    assert(setOutput !== undefined, "credential set process failed");
    assert(
        !setOutput.stdout.includes(syntheticApiKey) &&
            !setOutput.stderr.includes(syntheticApiKey),
        "credential set echoed stdin secret",
    );
    const setReceipt = JSON.parse(setOutput.stdout);
    assert(
        setReceipt.ok === true &&
            setReceipt.command === "credential.set" &&
            setReceipt.workspaceId === workspaceId,
        "credential set CLI proof failed",
    );

    const validateOutput = await runCaptured(
        process.execPath,
        [adminPath, "credential", "validate", "--subject", "proof-admin-cli"],
        false,
        credentialEnv,
    );
    assert(validateOutput !== undefined, "credential validate process failed");
    assert(
        !validateOutput.stdout.includes(syntheticApiKey) &&
            !validateOutput.stderr.includes(syntheticApiKey),
        "credential validate emitted the decrypted API key",
    );
    const validateReceipt = JSON.parse(validateOutput.stdout);
    assert(
        validateReceipt.ok === true &&
            validateReceipt.command === "credential.validate" &&
            validateReceipt.workspaceId === workspaceId,
        "credential validate CLI proof failed",
    );
    const encrypted = await database.query(
        `SELECT encode(api_key_ciphertext, 'hex') AS ciphertext
           FROM mcp_credentials
          WHERE id = $1`,
        [setReceipt.credentialId],
    );
    assert(encrypted.rows.length === 1, "credential set did not persist one row");
    assert(
        !encrypted.rows[0].ciphertext.includes(Buffer.from(syntheticApiKey).toString("hex")),
        "credential ciphertext contains the plaintext API key",
    );

    for (const args of [
        ["credential", "revoke", "--subject", "proof-admin-cli"],
        ["encryption", "status"],
        ["encryption", "rotate", "--batch-size", "2"],
        ["principal", "disable", "--subject", "proof-admin-cli"],
        ["principal", "delete", "--subject", "proof-admin-cli"],
    ]) {
        const receipt = JSON.parse(await run(process.execPath, [adminPath, ...args], false, env));
        assert(receipt.ok === true, `admin ${args[0]} ${args[1]} proof failed`);
    }
}

function clockifyFetchFixture(apiKeyHash, workspaceId) {
    return `import { createHash } from "node:crypto";
const expectedApiKeyHash = ${JSON.stringify(apiKeyHash)};
const workspaceId = ${JSON.stringify(workspaceId)};
globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const supplied = request.headers.get("x-api-key") ?? "";
    const suppliedHash = createHash("sha256").update(supplied).digest("hex");
    if (suppliedHash !== expectedApiKeyHash) return response(401, { message: "unauthorized" });
    if (request.method !== "GET") return response(405, { message: "method not allowed" });
    const path = new URL(request.url).pathname;
    if (path === "/api/v1/user") {
        return response(200, { id: "00000000000000000000a115", name: "Proof Admin" });
    }
    if (path === "/api/v1/workspaces/" + workspaceId) {
        return response(200, { id: workspaceId, name: "Proof Workspace" });
    }
    return response(404, { message: "not found" });
};
function response(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}
`;
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
