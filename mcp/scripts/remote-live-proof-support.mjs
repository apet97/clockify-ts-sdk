import { build as esbuild } from "esbuild";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { modernToolRequest } from "./remote-proof-auth.mjs";
import { safeFailureDetail } from "./remote-proof-process.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ID_PATTERN = /^[0-9a-fA-F]{24}$/u;
const TOOL_CALL_TIMEOUT_MS = 45_000;

export const POSTGRES_IMAGE =
    "postgres:17.11-bookworm@sha256:84560e3b9c6874893fc4e2854f5dc3e7c1a37bc9d1dfd7a8c641310ae22ba5ad";

export async function loadCandidate(directory) {
    const validatorPath = join(directory, "report-model-validator.mjs");
    await esbuild({
        entryPoints: [join(ROOT, "mcp/src/apps/report-app/model-validation.ts")],
        outfile: validatorPath,
        bundle: true,
        format: "esm",
        platform: "node",
        logLevel: "silent",
    });
    const [http, auth, context, crypto, migrations, postgres, validator] =
        await Promise.all([
            import("../dist/http.js"),
            import("../dist/remote/auth.js"),
            import("../dist/remote/context.js"),
            import("../dist/remote/crypto.js"),
            import("../dist/remote/migrations.js"),
            import("../dist/remote/postgres.js"),
            import(pathToFileURL(validatorPath).href),
        ]);
    return {
        createClockifyMcpHttpHandler: http.createClockifyMcpHttpHandler,
        HybridClockifyTokenVerifier: auth.HybridClockifyTokenVerifier,
        createPostgresContextResolver: context.createPostgresContextResolver,
        loadKeyringFile: crypto.loadKeyringFile,
        verifyDatabaseMigrations: migrations.verifyDatabaseMigrations,
        PostgresPool: postgres.PostgresPool,
        isReportsAppModel: validator.isReportsAppModel,
    };
}

export async function runAdmin(runner, environment, args, secrets, stdin) {
    const result = await runner.runCaptured(
        process.execPath,
        [join(ROOT, "mcp/dist/admin.js"), ...args],
        false,
        environment,
        stdin,
    );
    if (!result) throw new Error("admin command did not complete");
    if (result.stdout.includes(secrets.apiKey) || result.stderr.includes(secrets.apiKey)) {
        throw new Error("admin command emitted a Clockify secret");
    }
    const receipt = JSON.parse(result.stdout);
    if (receipt?.ok !== true) throw new Error("admin command failed");
    return receipt;
}

export function createToolCaller(
    service,
    resource,
    { signal, timeoutMs = TOOL_CALL_TIMEOUT_MS } = {},
) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
        throw new TypeError("tool-call timeout must be a positive integer");
    }
    let requestId = 0;
    return async (token, name, args, { timeoutMs: callTimeoutMs = timeoutMs } = {}) => {
        if (!Number.isSafeInteger(callTimeoutMs) || callTimeoutMs < 1) {
            throw new TypeError("tool-call timeout must be a positive integer");
        }
        requestId += 1;
        const timeoutSignal = AbortSignal.timeout(callTimeoutMs);
        const requestSignal = signal
            ? AbortSignal.any([signal, timeoutSignal])
            : timeoutSignal;
        const tool = /^clockify_[a-z0-9_]+$/u.test(name) ? name : "unknown_tool";
        try {
            const request = modernToolRequest(resource, token, name, args, requestId);
            const response = await service.fetch(new Request(request, { signal: requestSignal }));
            if (response.status !== 200 || response.headers.has("mcp-session-id")) {
                throw new Error("stateless tools/call transport failed");
            }
            const body = await response.json();
            if (!isRecord(body) || !isRecord(body.result)) {
                throw new Error("tools/call returned no result");
            }
            return body.result;
        } catch (error) {
            if (!requestSignal.aborted) throw error;
            if (signal?.aborted) throw new Error("remote live proof interrupted");
            throw new Error(`MCP tool ${tool} exceeded its proof deadline`);
        }
    };
}

export function requireToolSuccess(result, action) {
    if (
        !isRecord(result) ||
        result.isError === true ||
        !isRecord(result.structuredContent) ||
        result.structuredContent.ok !== true ||
        result.structuredContent.action !== action
    ) {
        const tool = /^clockify_[a-z0-9_]+$/u.test(action) ? action : "unknown_tool";
        throw new Error(
            `MCP tool ${tool} did not return its canonical success envelope (${toolFailureReason(result)})`,
        );
    }
}

function toolFailureReason(result) {
    if (!isRecord(result)) return "result_missing";
    if (!isRecord(result.structuredContent)) return "structured_content_missing";
    const error = result.structuredContent.error;
    const code = isRecord(error) ? error.code : undefined;
    if (typeof code === "string" && /^[a-z0-9_:-]{1,64}$/u.test(code)) {
        return `error=${code}`;
    }
    if (result.isError === true) return "error=unknown";
    if (result.structuredContent.ok !== true) return "ok_mismatch";
    return "action_mismatch";
}

export function assertSeedRetry(first, second) {
    if (JSON.stringify(seedIdentity(first)) !== JSON.stringify(seedIdentity(second))) {
        throw new Error("demo seed retry changed package or entry identity");
    }
    const changed = second.structuredContent?.changed;
    if (
        !isRecord(changed) ||
        !Array.isArray(changed.reused) ||
        !changed.reused.some((entry) => isRecord(entry) && entry.type === "entry")
    ) {
        throw new Error("second demo seed did not report entry reuse");
    }
    if (
        Array.isArray(changed.created) &&
        changed.created.some((entry) => isRecord(entry) && entry.type === "entry")
    ) {
        throw new Error("second demo seed reported a newly created entry");
    }
}

export function confirmationToken(result) {
    const data = result.structuredContent?.data;
    if (!isRecord(data) || typeof data.confirm_token !== "string" || !data.confirm_token) {
        throw new Error("cleanup preview returned no confirmation token");
    }
    return data.confirm_token;
}

export function requireWarningFreeCleanup(result) {
    const warnings = result.structuredContent?.warnings;
    if (warnings !== undefined && (!Array.isArray(warnings) || warnings.length !== 0)) {
        throw new Error("MCP cleanup completed with warnings");
    }
}

export function requireZeroCleanupPreview(result) {
    const data = result.structuredContent?.data;
    const preview = isRecord(data) ? data.preview : undefined;
    if (
        !isRecord(preview) ||
        ["entries", "projects", "tasks", "tags", "clients"].some(
            (field) => preview[field] !== 0,
        )
    ) {
        throw new Error("exact-prefix cleanup rescan found remaining targets");
    }
}

export function requireNoDeletedTargets(result) {
    const changed = result.structuredContent?.changed;
    if (
        changed !== undefined &&
        (!isRecord(changed) ||
            (Array.isArray(changed.deleted) && changed.deleted.length !== 0) ||
            (!Array.isArray(changed.deleted) && changed.deleted !== undefined))
    ) {
        throw new Error("zero-target cleanup rescan deleted a record");
    }
}

export async function listMarkerEntries(client, workspaceId, userId, marker, start, end) {
    const seen = new Set();
    let matches = 0;
    for (let page = 1; page <= 50; page += 1) {
        const rows = await client.timeEntries.listForUser({
            workspaceId,
            userId,
            start,
            end,
            description: marker,
            page,
            "page-size": 200,
        });
        if (!Array.isArray(rows)) throw new Error("time-entry verification was malformed");
        if (rows.length === 0) return matches;
        for (const row of rows) {
            const id = requireClockifyId(row?.id ?? row?._id, "time entry");
            if (seen.has(id)) continue;
            seen.add(id);
            if (row?.description === marker) matches += 1;
        }
    }
    throw new Error("time-entry verification exceeded its page bound");
}

export async function assertExactRemoteTables(database) {
    const result = await database.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name LIKE 'mcp_%'
          ORDER BY table_name`,
    );
    const names = result.rows.map((row) => row.table_name).join(",");
    if (names !== "mcp_confirmations,mcp_credentials,mcp_principals,mcp_schema_migrations") {
        throw new Error("remote migration table inventory drifted");
    }
}

export async function assertNoTenantRows(database) {
    const result = await database.query(
        `SELECT
            (SELECT count(*)::text FROM mcp_principals) AS principals,
            (SELECT count(*)::text FROM mcp_credentials) AS credentials,
            (SELECT count(*)::text FROM mcp_confirmations) AS confirmations`,
    );
    const row = result.rows[0];
    if (row?.principals !== "0" || row.credentials !== "0" || row.confirmations !== "0") {
        throw new Error("remote live proof left tenant database rows");
    }
}

export async function confirmationCount(database) {
    const result = await database.query(
        "SELECT count(*)::text AS count FROM mcp_confirmations",
    );
    return Number(result.rows[0]?.count);
}

export async function dockerPlatform(run) {
    const architecture = (await run("docker", ["info", "--format", "{{.Architecture}}"])).trim();
    const platform =
        architecture === "aarch64" || architecture === "arm64"
            ? "linux/arm64"
            : architecture === "x86_64" || architecture === "amd64"
              ? "linux/amd64"
              : undefined;
    if (!platform) throw new Error("unsupported Docker architecture");
    const manifest = JSON.parse(await run("docker", ["manifest", "inspect", POSTGRES_IMAGE]));
    const [os, cpu] = platform.split("/");
    if (
        !Array.isArray(manifest.manifests) ||
        !manifest.manifests.some(
            (entry) => entry?.platform?.os === os && entry.platform.architecture === cpu,
        )
    ) {
        throw new Error("pinned PostgreSQL image lacks the local platform");
    }
    return platform;
}

export async function waitForPostgres(run, container, user, database) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
        const primary = await run("docker", ["exec", container, "cat", "/proc/1/comm"], true);
        if (primary?.trim() === "postgres") {
            const ready = await run(
                "docker",
                ["exec", container, "pg_isready", "-U", user, "-d", database],
                true,
            );
            if (ready !== undefined) return;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
    throw new Error("PostgreSQL did not become ready");
}

export function mappedPort(output) {
    const match = output.trim().match(/:(\d+)$/u);
    if (!match) throw new Error("Docker did not publish PostgreSQL");
    return Number(match[1]);
}

export function requireClockifyId(value, label) {
    if (typeof value !== "string" || !ID_PATTERN.test(value)) {
        throw new Error(`${label} id was missing or malformed`);
    }
    return value;
}

export function sanitizedDetail(error, secrets) {
    let detail = error instanceof Error ? error.message : String(error ?? "unknown failure");
    for (const secret of secrets) {
        if (secret) detail = detail.replaceAll(secret, "[redacted]");
    }
    return safeFailureDetail(detail);
}

function seedIdentity(result) {
    const data = result.structuredContent?.data;
    if (!isRecord(data) || !isRecord(data.package) || !isRecord(data.entry)) {
        throw new Error("demo seed returned no identity-bearing receipt");
    }
    const packageIds = requireStringRecord(data.package.ids, "demo package ids");
    const entryIds = requireStringRecord(data.entry.ids, "demo entry ids");
    return {
        package: Object.fromEntries(
            Object.entries(packageIds).sort(([left], [right]) => left.localeCompare(right)),
        ),
        entry: Object.fromEntries(
            Object.entries(entryIds).sort(([left], [right]) => left.localeCompare(right)),
        ),
    };
}

function requireStringRecord(value, label) {
    if (
        !isRecord(value) ||
        Object.keys(value).length === 0 ||
        !Object.values(value).every((entry) => typeof entry === "string" && entry.length > 0)
    ) {
        throw new Error(`${label} were missing or malformed`);
    }
    return value;
}

function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
