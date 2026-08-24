#!/usr/bin/env node
import { Buffer } from "node:buffer";
import type { Readable } from "node:stream";
import { parseArgs } from "node:util";

import { buildRoutingOptions, createContext } from "./client.js";
import { resolvesToModule } from "./direct-invocation.js";
import { requireExactHttpsUrl } from "./http-url.js";
import { PostgresCredentialStore } from "./remote/credentials.js";
import { loadKeyringFile } from "./remote/crypto.js";
import { PostgresEncryptionService } from "./remote/encryption.js";
import { migrateDatabase } from "./remote/migrations.js";
import { PostgresPool } from "./remote/postgres.js";
import {
    REMOTE_SCOPES,
    type ClockifyCredentialInput,
    type LoadedClockifyCredential,
    type ScopeGrant,
} from "./remote/types.js";

const HELP = `clockify115-mcp-admin <command> <action> [options]

Commands:
  db migrate
  principal grant --subject <sub> --grant read|write|admin
  principal disable --subject <sub>
  principal delete --subject <sub>
  credential set --subject <sub> --workspace <id> [--region <region>] [--subdomain <name>]
  credential validate --subject <sub>
  credential revoke --subject <sub>
  encryption status
  encryption rotate [--batch-size <1-1000>]

credential set reads the Clockify API key from stdin. It never accepts a key
through argv or environment.
`;
const ADMIN_CLOCKIFY_TIMEOUT_SECONDS = 30;

interface AdminOptions {
    subject?: string;
    grant?: string;
    workspace?: string;
    region?: string;
    subdomain?: string;
    batchSize?: string;
}

export async function main(
    argv: readonly string[] = process.argv.slice(2),
    env: NodeJS.ProcessEnv = process.env,
    stdin: SecretInput = process.stdin,
): Promise<number> {
    let pool: PostgresPool | undefined;
    const succeed = async (receipt: Record<string, unknown>): Promise<number> => {
        const database = pool;
        pool = undefined;
        await database?.end();
        writeReceipt(receipt);
        return 0;
    };
    try {
        const parsed = parseArgs({
            args: [...argv],
            options: {
                help: { type: "boolean", short: "h" },
                subject: { type: "string" },
                grant: { type: "string" },
                workspace: { type: "string" },
                region: { type: "string" },
                subdomain: { type: "string" },
                "batch-size": { type: "string" },
            },
            allowPositionals: true,
            strict: true,
        });
        if (parsed.values.help) {
            process.stdout.write(HELP);
            return 0;
        }
        rejectClockifyCredentialEnvironment(env);
        const command = parsed.positionals[0];
        const action = parsed.positionals[1];
        if (!command || !action || parsed.positionals.length !== 2) {
            throw new AdminUsageError("one command and action are required");
        }
        const options: AdminOptions = {
            ...(parsed.values.subject === undefined
                ? {}
                : { subject: parsed.values.subject }),
            ...(parsed.values.grant === undefined ? {} : { grant: parsed.values.grant }),
            ...(parsed.values.workspace === undefined
                ? {}
                : { workspace: parsed.values.workspace }),
            ...(parsed.values.region === undefined
                ? {}
                : { region: parsed.values.region }),
            ...(parsed.values.subdomain === undefined
                ? {}
                : { subdomain: parsed.values.subdomain }),
            ...(parsed.values["batch-size"] === undefined
                ? {}
                : { batchSize: parsed.values["batch-size"] }),
        };
        assertCommandOptions(command, action, options);

        pool = await PostgresPool.fromEnvironment(env);
        if (command === "db" && action === "migrate") {
            const applied = await migrateDatabase(pool);
            return await succeed({ ok: true, command: "db.migrate", applied });
        }

        const issuer = requireExactHttpsUrl(
            requiredEnv(env, "CLOCKIFY_MCP_OAUTH_ISSUER"),
            "issuer",
        ).href;
        const keyring = await loadKeyringFile(
            requiredEnv(env, "CLOCKIFY_MCP_KEYRING_FILE"),
        );
        const credentials = new PostgresCredentialStore(pool, keyring, issuer);

        if (command === "principal") {
            const subject = requiredOption(options.subject, "--subject");
            if (action === "grant") {
                const maxGrant = requireGrant(options.grant);
                const receipt = await credentials.grantPrincipal(subject, maxGrant);
                return await succeed({
                    ok: true,
                    command: "principal.grant",
                    ...receipt,
                });
            }
            if (action === "disable") {
                return await succeed({
                    ok: true,
                    command: "principal.disable",
                    changed: await credentials.disablePrincipal(subject),
                });
            }
            if (action === "delete") {
                return await succeed({
                    ok: true,
                    command: "principal.delete",
                    changed: await credentials.deletePrincipal(subject),
                });
            }
        }

        if (command === "credential") {
            const subject = requiredOption(options.subject, "--subject");
            if (action === "set") {
                const apiKey = await readApiKeyFromStdin(stdin);
                const input = credentialInput(options, apiKey);
                await validateClockifyCredential(input);
                const receipt = await credentials.setCredential(subject, input);
                return await succeed({
                    ok: true,
                    command: "credential.set",
                    principalId: receipt.principalId,
                    credentialId: receipt.credentialId,
                    credentialRevision: receipt.credentialRevision.toString(),
                    workspaceId: receipt.workspaceId,
                });
            }
            if (action === "validate") {
                const stored = await credentials.load({
                    issuer,
                    subject,
                    oauthClientId: "clockify115-mcp-admin",
                    tokenScopes: new Set([REMOTE_SCOPES[2]]),
                });
                await validateClockifyCredential(stored);
                return await succeed({
                    ok: true,
                    command: "credential.validate",
                    credentialId: stored.credentialId,
                    credentialRevision: stored.credentialRevision.toString(),
                    workspaceId: stored.workspaceId,
                });
            }
            if (action === "revoke") {
                return await succeed({
                    ok: true,
                    command: "credential.revoke",
                    changed: await credentials.revokeCredential(subject),
                });
            }
        }

        if (command === "encryption") {
            const encryption = new PostgresEncryptionService(pool, keyring);
            if (action === "status") {
                return await succeed({
                    ok: true,
                    command: "encryption.status",
                    ...(await encryption.status()),
                });
            }
            if (action === "rotate") {
                const batchSize = requireBatchSize(options.batchSize);
                return await succeed({
                    ok: true,
                    command: "encryption.rotate",
                    ...(await encryption.rotateAll(batchSize)),
                });
            }
        }
        throw new AdminUsageError("unknown admin command");
    } catch (caught) {
        let error = caught;
        const database = pool;
        pool = undefined;
        try {
            await database?.end();
        } catch (closeError) {
            error = closeError;
        }
        if (error instanceof AdminUsageError || isParseArgsError(error)) {
            process.stderr.write(`${JSON.stringify({ ok: false, error: "usage" })}\n`);
            return 2;
        }
        process.stderr.write(`${JSON.stringify({ ok: false, error: "command_failed" })}\n`);
        return 1;
    }
}

export async function validateClockifyCredential(
    input: ClockifyCredentialInput | LoadedClockifyCredential,
    options: { fetch?: typeof fetch; timeoutInSeconds?: number } = {},
): Promise<void> {
    const routing = buildRoutingOptions(input.region ?? "global", input.subdomain);
    if (!routing) throw new Error("Clockify routing profile is invalid");
    const context = createContext({
        apiKey: input.apiKey,
        workspaceId: input.workspaceId,
        routing,
        timeoutInSeconds:
            options.timeoutInSeconds ?? ADMIN_CLOCKIFY_TIMEOUT_SECONDS,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
    const user = await context.client.users.getCurrentUser();
    if (!user.id) throw new Error("Clockify current-user authentication failed");
    const workspace = await context.client.workspaces.get({
        workspaceId: input.workspaceId,
    });
    if (workspace.id !== input.workspaceId) {
        throw new Error("Clockify credential cannot access the pinned workspace");
    }
}

function credentialInput(options: AdminOptions, apiKey: string): ClockifyCredentialInput {
    const workspaceId = requiredOption(options.workspace, "--workspace");
    const region = options.region ?? "global";
    if (!isRegion(region)) throw new AdminUsageError("unsupported --region");
    return {
        workspaceId,
        apiKey,
        region,
        ...(options.subdomain === undefined ? {} : { subdomain: options.subdomain }),
    };
}

type SecretInput = Readable & { isTTY?: boolean };

async function readApiKeyFromStdin(stdin: SecretInput): Promise<string> {
    if (stdin.isTTY === true) {
        throw new AdminUsageError("credential set requires piped stdin");
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of stdin) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.byteLength;
        if (total > 8 * 1024 + 2) throw new Error("stdin secret exceeds 8 KiB");
        chunks.push(bytes);
    }
    const value = Buffer.concat(chunks, total).toString("utf8").replace(/\r?\n$/u, "");
    if (!value || value.includes("\n") || value.includes("\r")) {
        throw new AdminUsageError("stdin must contain exactly one API-key line");
    }
    return value;
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
    const value = env[name]?.trim();
    if (!value) throw new AdminUsageError(`${name} is required`);
    return value;
}

function requiredOption(value: string | undefined, name: string): string {
    if (!value?.trim()) throw new AdminUsageError(`${name} is required`);
    return value;
}

function requireGrant(value: string | undefined): ScopeGrant {
    if (value === "read" || value === "write" || value === "admin") return value;
    throw new AdminUsageError("--grant must be read, write, or admin");
}

function isRegion(value: string): value is NonNullable<ClockifyCredentialInput["region"]> {
    return ["global", "eu", "us", "uk", "au", "developer"].includes(value);
}

function requireBatchSize(value: string | undefined): number {
    if (value === undefined) return 100;
    if (!/^\d+$/u.test(value)) throw new AdminUsageError("invalid --batch-size");
    const size = Number(value);
    if (!Number.isSafeInteger(size) || size < 1 || size > 1_000) {
        throw new AdminUsageError("--batch-size must be between 1 and 1000");
    }
    return size;
}

type AdminOptionName = keyof AdminOptions;

function assertCommandOptions(
    command: string,
    action: string,
    options: AdminOptions,
): void {
    const allowed = COMMAND_OPTIONS[`${command}.${action}`];
    if (!allowed) throw new AdminUsageError("unknown admin command");
    const accepted = new Set<AdminOptionName>(allowed);
    if ((Object.keys(options) as AdminOptionName[]).some((name) => !accepted.has(name))) {
        throw new AdminUsageError("command received an inapplicable option");
    }
}

const COMMAND_OPTIONS: Readonly<Record<string, readonly AdminOptionName[]>> = {
    "db.migrate": [],
    "principal.grant": ["subject", "grant"],
    "principal.disable": ["subject"],
    "principal.delete": ["subject"],
    "credential.set": ["subject", "workspace", "region", "subdomain"],
    "credential.validate": ["subject"],
    "credential.revoke": ["subject"],
    "encryption.status": [],
    "encryption.rotate": ["batchSize"],
};

function rejectClockifyCredentialEnvironment(env: NodeJS.ProcessEnv): void {
    for (const name of ["CLOCKIFY_API_KEY", "CLOCKIFY_WORKSPACE_ID"] as const) {
        if (Object.prototype.hasOwnProperty.call(env, name)) {
            throw new AdminUsageError(`${name} is not accepted by the admin CLI`);
        }
    }
}

function writeReceipt(value: Record<string, unknown>): void {
    process.stdout.write(`${JSON.stringify(value)}\n`);
}

class AdminUsageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AdminUsageError";
    }
}

function isParseArgsError(error: unknown): boolean {
    return (
        error instanceof TypeError &&
        "code" in error &&
        typeof error.code === "string" &&
        error.code.startsWith("ERR_PARSE_ARGS_")
    );
}

if (resolvesToModule(process.argv[1], import.meta.filename)) {
    main().then(
        (code) => {
            process.exitCode = code;
        },
        () => {
            process.stderr.write(
                `${JSON.stringify({ ok: false, error: "command_failed" })}\n`,
            );
            process.exitCode = 1;
        },
    );
}
