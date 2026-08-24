import { PassThrough } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    assertReadable: vi.fn(async (): Promise<void> => undefined),
    buildRoutingOptions: vi.fn(),
    createContext: vi.fn(),
    credentialStoreConstructor: vi.fn(),
    deletePrincipal: vi.fn(),
    disablePrincipal: vi.fn(),
    encryptionServiceConstructor: vi.fn(),
    encryptionStatus: vi.fn(),
    fromEnvironment: vi.fn(),
    getCurrentUser: vi.fn(),
    getWorkspace: vi.fn(),
    grantPrincipal: vi.fn(),
    loadCredential: vi.fn(),
    loadKeyringFile: vi.fn(),
    migrateDatabase: vi.fn(),
    poolEnd: vi.fn(),
    revokeCredential: vi.fn(),
    rotateAll: vi.fn(),
    setCredential: vi.fn(),
}));

vi.mock("../src/client.js", () => ({
    buildRoutingOptions: mocks.buildRoutingOptions,
    createContext: mocks.createContext,
}));

vi.mock("../src/remote/postgres.js", () => ({
    PostgresPool: { fromEnvironment: mocks.fromEnvironment },
}));

vi.mock("../src/remote/migrations.js", () => ({
    migrateDatabase: mocks.migrateDatabase,
}));

vi.mock("../src/remote/crypto.js", () => ({
    loadKeyringFile: mocks.loadKeyringFile,
}));

vi.mock("../src/remote/credentials.js", () => ({
    PostgresCredentialStore: class {
        constructor(...args: readonly unknown[]) {
            mocks.credentialStoreConstructor(...args);
        }

        grantPrincipal = mocks.grantPrincipal;
        disablePrincipal = mocks.disablePrincipal;
        deletePrincipal = mocks.deletePrincipal;
        setCredential = mocks.setCredential;
        load = mocks.loadCredential;
        revokeCredential = mocks.revokeCredential;
    },
}));

vi.mock("../src/remote/encryption.js", () => ({
    PostgresEncryptionService: class {
        constructor(...args: readonly unknown[]) {
            mocks.encryptionServiceConstructor(...args);
        }

        status = mocks.encryptionStatus;
        rotateAll = mocks.rotateAll;
        assertReadable = mocks.assertReadable;
    },
}));

import { main } from "../src/admin.js";

const BASE_ENV: NodeJS.ProcessEnv = {
    CLOCKIFY_MCP_OAUTH_ISSUER: "https://issuer.example/",
    CLOCKIFY_MCP_KEYRING_FILE: "/fixture/keyring.json",
};
const WORKSPACE_ID = "000000000000000000000001";

describe("remote administration command dispatch", () => {
    let stdout: ReturnType<typeof vi.spyOn>;
    let stderr: ReturnType<typeof vi.spyOn>;
    const pool = { end: mocks.poolEnd };
    const keyring = { activeId: "fixture-key" };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.poolEnd.mockResolvedValue(undefined);
        mocks.fromEnvironment.mockResolvedValue(pool);
        mocks.loadKeyringFile.mockResolvedValue(keyring);
        mocks.buildRoutingOptions.mockReturnValue({ profile: "global" });
        mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
        mocks.getWorkspace.mockResolvedValue({ id: WORKSPACE_ID });
        mocks.createContext.mockReturnValue({
            client: {
                users: { getCurrentUser: mocks.getCurrentUser },
                workspaces: { get: mocks.getWorkspace },
            },
        });
        stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    });

    afterEach(() => {
        stdout.mockRestore();
        stderr.mockRestore();
    });

    it("migrates the database, closes it, and then emits the success receipt", async () => {
        const order: string[] = [];
        mocks.migrateDatabase.mockImplementation(async () => {
            order.push("migrate");
            return ["001_initial.sql"];
        });
        mocks.poolEnd.mockImplementation(async () => {
            order.push("close");
        });
        stdout.mockImplementation(() => {
            order.push("receipt");
            return true;
        });

        await expect(main(["db", "migrate"], {}, secretInput())).resolves.toBe(0);

        expect(mocks.fromEnvironment).toHaveBeenCalledWith({});
        expect(order).toEqual(["migrate", "close", "receipt"]);
        expect(jsonLines(stdout)).toEqual([
            { ok: true, command: "db.migrate", applied: ["001_initial.sql"] },
        ]);
        expect(written(stderr)).toBe("");
    });

    it("dispatches principal grant with the configured issuer and keyring", async () => {
        mocks.grantPrincipal.mockResolvedValue({
            principalId: "principal-1",
            maxGrant: "admin",
        });

        await expect(
            main(
                ["principal", "grant", "--subject", "employee-1", "--grant", "admin"],
                BASE_ENV,
                secretInput(),
            ),
        ).resolves.toBe(0);

        expect(mocks.loadKeyringFile).toHaveBeenCalledWith("/fixture/keyring.json");
        expect(mocks.credentialStoreConstructor).toHaveBeenCalledWith(
            pool,
            keyring,
            "https://issuer.example/",
        );
        expect(mocks.grantPrincipal).toHaveBeenCalledWith("employee-1", "admin");
        expect(jsonLines(stdout)).toEqual([
            {
                ok: true,
                command: "principal.grant",
                principalId: "principal-1",
                maxGrant: "admin",
            },
        ]);
    });

    it.each([
        ["disable", mocks.disablePrincipal, "principal.disable"],
        ["delete", mocks.deletePrincipal, "principal.delete"],
    ])("dispatches principal %s", async (action, operation, command) => {
        operation.mockResolvedValue(true);

        await expect(
            main(
                ["principal", action, "--subject", "employee-1"],
                BASE_ENV,
                secretInput(),
            ),
        ).resolves.toBe(0);

        expect(operation).toHaveBeenCalledWith("employee-1");
        expect(jsonLines(stdout)).toEqual([{ ok: true, command, changed: true }]);
    });

    it("validates and atomically stores a credential read only from stdin", async () => {
        const apiKey = "stdin-only-fixture-key";
        mocks.buildRoutingOptions.mockReturnValue({
            profile: "subdomain",
            region: "eu",
            subdomain: "team",
        });
        mocks.setCredential.mockResolvedValue({
            principalId: "principal-1",
            credentialId: "credential-1",
            credentialRevision: 7n,
            workspaceId: WORKSPACE_ID,
        });

        await expect(
            main(
                [
                    "credential",
                    "set",
                    "--subject",
                    "employee-1",
                    "--workspace",
                    WORKSPACE_ID,
                    "--region",
                    "eu",
                    "--subdomain",
                    "team",
                ],
                BASE_ENV,
                secretInput(`${apiKey}\n`),
            ),
        ).resolves.toBe(0);

        expect(mocks.buildRoutingOptions).toHaveBeenCalledWith("eu", "team");
        expect(mocks.getCurrentUser).toHaveBeenCalledOnce();
        expect(mocks.getWorkspace).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID });
        expect(mocks.setCredential).toHaveBeenCalledWith("employee-1", {
            apiKey,
            workspaceId: WORKSPACE_ID,
            region: "eu",
            subdomain: "team",
        });
        expect(jsonLines(stdout)).toEqual([
            {
                ok: true,
                command: "credential.set",
                principalId: "principal-1",
                credentialId: "credential-1",
                credentialRevision: "7",
                workspaceId: WORKSPACE_ID,
            },
        ]);
        expect(`${written(stdout)}${written(stderr)}`).not.toContain(apiKey);
    });

    it("loads and validates the pinned credential before reporting it", async () => {
        mocks.loadCredential.mockResolvedValue({
            principalId: "principal-1",
            credentialId: "credential-1",
            credentialRevision: 8n,
            workspaceId: WORKSPACE_ID,
            apiKey: "stored-fixture-key",
            region: "global",
            maxGrant: "admin",
        });

        await expect(
            main(
                ["credential", "validate", "--subject", "employee-1"],
                BASE_ENV,
                secretInput(),
            ),
        ).resolves.toBe(0);

        expect(mocks.loadCredential).toHaveBeenCalledWith({
            issuer: "https://issuer.example/",
            subject: "employee-1",
            oauthClientId: "clockify115-mcp-admin",
            tokenScopes: new Set(["clockify:admin"]),
        });
        expect(mocks.getWorkspace).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID });
        expect(jsonLines(stdout)).toEqual([
            {
                ok: true,
                command: "credential.validate",
                credentialId: "credential-1",
                credentialRevision: "8",
                workspaceId: WORKSPACE_ID,
            },
        ]);
    });

    it("dispatches credential revocation", async () => {
        mocks.revokeCredential.mockResolvedValue(false);

        await expect(
            main(
                ["credential", "revoke", "--subject", "employee-1"],
                BASE_ENV,
                secretInput(),
            ),
        ).resolves.toBe(0);

        expect(mocks.revokeCredential).toHaveBeenCalledWith("employee-1");
        expect(jsonLines(stdout)).toEqual([
            { ok: true, command: "credential.revoke", changed: false },
        ]);
    });

    it("dispatches encryption status and rotation with the requested batch size", async () => {
        mocks.encryptionStatus.mockResolvedValue({
            activeKeyId: "key-2",
            configuredKeyIds: ["key-1", "key-2"],
            rowsByKeyId: { "key-2": 3 },
            retireableKeyIds: ["key-1"],
        });
        mocks.rotateAll.mockResolvedValue({
            rotatedCredentials: 2,
            rotatedConfirmations: 1,
        });

        await expect(
            main(["encryption", "status"], BASE_ENV, secretInput()),
        ).resolves.toBe(0);
        await expect(
            main(
                ["encryption", "rotate", "--batch-size", "37"],
                BASE_ENV,
                secretInput(),
            ),
        ).resolves.toBe(0);

        expect(mocks.encryptionServiceConstructor).toHaveBeenCalledTimes(2);
        expect(mocks.encryptionServiceConstructor).toHaveBeenNthCalledWith(
            1,
            pool,
            keyring,
        );
        expect(mocks.encryptionStatus).toHaveBeenCalledOnce();
        expect(mocks.rotateAll).toHaveBeenCalledWith(37);
        expect(jsonLines(stdout)).toEqual([
            {
                ok: true,
                command: "encryption.status",
                activeKeyId: "key-2",
                configuredKeyIds: ["key-1", "key-2"],
                rowsByKeyId: { "key-2": 3 },
                retireableKeyIds: ["key-1"],
            },
            {
                ok: true,
                command: "encryption.rotate",
                rotatedCredentials: 2,
                rotatedConfirmations: 1,
            },
        ]);
    });

    it("sanitizes a command failure and still closes the database", async () => {
        const secret = "database-error-containing-secret";
        mocks.disablePrincipal.mockRejectedValue(new Error(secret));

        await expect(
            main(
                ["principal", "disable", "--subject", "employee-1"],
                BASE_ENV,
                secretInput(),
            ),
        ).resolves.toBe(1);

        expect(mocks.poolEnd).toHaveBeenCalledOnce();
        expect(written(stdout)).toBe("");
        expect(written(stderr)).toBe('{"ok":false,"error":"command_failed"}\n');
        expect(written(stderr)).not.toContain(secret);
    });
});

function secretInput(value = ""): PassThrough & { isTTY?: boolean } {
    const input = new PassThrough();
    input.end(value);
    return input;
}

function written(spy: { mock: { calls: readonly (readonly unknown[])[] } }): string {
    return spy.mock.calls.map((call) => String(call[0])).join("");
}

function jsonLines(spy: { mock: { calls: readonly (readonly unknown[])[] } }): unknown[] {
    return written(spy)
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as unknown);
}
