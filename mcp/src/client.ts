/**
 * Configured Clockify SDK client + the workspace pin every tool
 * operates against. Both come from environment variables so the
 * stdio MCP entrypoint can be launched without arguments by an MCP
 * client (Claude Desktop, etc.).
 */
import { createClockifyClient } from "clockify-sdk-ts-115";
import type { ComposedFetchHooks } from "clockify-sdk-ts-115/composed-fetch";

import { ConfirmationTokenStore } from "./orchestration/confirmation.js";

export type ClockifyClient = ReturnType<typeof createClockifyClient>;

/**
 * Thrown lazily (at first `ctx.client` / `ctx.workspaceId` access) when the MCP
 * server was started without its required credentials. `errorResult` maps this
 * to a `setup_required` receipt, so the server stays up and every tool explains
 * the fix instead of the process crashing at startup.
 */
export class MissingCredentialsError extends Error {
    readonly missing: readonly string[];
    constructor(missing: readonly string[]) {
        super(buildSetupMessage(missing));
        this.name = "MissingCredentialsError";
        this.missing = missing;
    }
}

function buildSetupMessage(missing: readonly string[]): string {
    const parts: string[] = [];
    if (missing.includes("CLOCKIFY_API_KEY")) {
        parts.push("CLOCKIFY_API_KEY is not set.");
    }
    if (missing.includes("CLOCKIFY_WORKSPACE_ID")) {
        parts.push(
            "CLOCKIFY_WORKSPACE_ID is not set. The one-user server is pinned to a single workspace.",
        );
    }
    return (
        `Clockify MCP is not configured: ${parts.join(" ")}\n` +
        "Set them in your MCP client's env block, e.g.\n" +
        `  "@apet97/clockify-mcp-115": { "command": "clockify115-mcp", "env": { "CLOCKIFY_API_KEY": "...", "CLOCKIFY_WORKSPACE_ID": "..." } }\n` +
        "Get the API key from Clockify Profile Settings -> API; the workspace ID is in the workspace URL. Leave CLOCKIFY_BASE_URL unset for live Clockify."
    );
}

export interface Context {
    client: ClockifyClient;
    workspaceId: string;
    confirmationTokens?: ConfirmationTokenStore;
    /**
     * Single-flight memo for the current user's id, fetched at most once per
     * server lifetime. OPTIONAL so hand-built test contexts (and any consumer
     * that omits it) still work — call sites fall back to a direct
     * `getCurrentUser()` when it is absent. Resolves to "" when the user id
     * can't be determined, matching the previous inline `entityId(...) ?? ""`.
     */
    currentUserId?: () => Promise<string>;
    /**
     * Present only when the server started without required credentials. The
     * server still runs; every tool returns a `setup_required` receipt because
     * `client` / `workspaceId` throw `MissingCredentialsError` on access.
     */
    setupError?: MissingCredentialsError;
}

/**
 * Build a single-flight `currentUserId` memo over a Clockify client: the first
 * call fetches `users.getCurrentUser()`, concurrent callers share the same
 * in-flight promise, and the resolved id is cached for the process lifetime.
 * A failed fetch is not cached (the next call retries).
 */
export function createCurrentUserIdMemo(client: ClockifyClient): () => Promise<string> {
    let cached: string | undefined;
    let inFlight: Promise<string> | undefined;
    return async () => {
        if (cached !== undefined) return cached;
        if (inFlight) return inFlight;
        inFlight = (async () => {
            const user = (await client.users.getCurrentUser()) as { id?: string; _id?: string };
            return String(user?.id ?? user?._id ?? "");
        })();
        try {
            cached = await inFlight;
            return cached;
        } finally {
            inFlight = undefined;
        }
    };
}

export interface LoadContextOptions {
    hooks?: ComposedFetchHooks;
    fetch?: typeof fetch;
    /**
     * Allow a non-Clockify `CLOCKIFY_BASE_URL` override. Off by default:
     * the host allowlist (official Clockify API hosts + loopback) rejects
     * a tampered env var that would otherwise redirect authenticated MCP
     * traffic — and its `X-Api-Key` header — to an arbitrary host. Set
     * `true` only for a trusted Clockify-compatible proxy.
     */
    allowInsecureBaseUrl?: boolean;
}

export function loadContext(
    env: NodeJS.ProcessEnv = process.env,
    options: LoadContextOptions = {},
): Context {
    const apiKey = env.CLOCKIFY_API_KEY;
    const workspaceId = env.CLOCKIFY_WORKSPACE_ID;
    const environment = env.CLOCKIFY_BASE_URL;

    if (!apiKey || !workspaceId) {
        // Deferred: the server still starts; each tool throws on first
        // client/workspace access, which errorResult maps to setup_required.
        const missing: string[] = [];
        if (!apiKey) missing.push("CLOCKIFY_API_KEY");
        if (!workspaceId) missing.push("CLOCKIFY_WORKSPACE_ID");
        return makeSetupRequiredContext(new MissingCredentialsError(missing));
    }

    // createClockifyClient enforces the Clockify host allowlist on the
    // resolved base URL, so a malicious CLOCKIFY_BASE_URL is rejected
    // here before any request leaves the process.
    const client = createClockifyClient({
        apiKey,
        ...(environment !== undefined ? { environment } : {}),
        ...options,
    });
    return {
        client,
        workspaceId,
        confirmationTokens: new ConfirmationTokenStore(),
        currentUserId: createCurrentUserIdMemo(client),
    };
}

/**
 * A `Context` whose `client` / `workspaceId` getters throw the captured
 * `MissingCredentialsError` on first access. The server still builds and
 * connects; the throw is deferred to tool-invocation time, where
 * `defineTool`'s catch routes it through `errorResult` to a `setup_required`
 * receipt. `currentUserId` is intentionally omitted — tools that need it fall
 * back to `ctx.client.users.getCurrentUser()`, which hits the throwing getter,
 * so they too produce `setup_required`.
 */
function makeSetupRequiredContext(error: MissingCredentialsError): Context {
    const fail = (): never => {
        throw error;
    };
    return {
        get client(): ClockifyClient {
            return fail();
        },
        get workspaceId(): string {
            return fail();
        },
        confirmationTokens: new ConfirmationTokenStore(),
        setupError: error,
    };
}

/**
 * Emit a one-line setup hint to stderr when the server started without its
 * required credentials. stdout is reserved for JSON-RPC, so the diagnostic goes
 * to stderr only; the model still gets the full remediation via each tool's
 * `setup_required` receipt. No-op when credentials are present.
 */
export function warnIfSetupRequired(ctx: Context): void {
    if (ctx.setupError) {
        process.stderr.write(`setup: ${ctx.setupError.message}\n`);
    }
}
